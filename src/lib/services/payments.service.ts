import { supabase } from "../supabase";
import {
  paymentTransitionError,
  type PaymentStatus,
} from "../state-machines";

export interface Payment {
  id: string;
  booking_id: string;

  customer_id: string;
  provider_id: string;

  amount: number;
  currency: string;

  payment_status: PaymentStatus;
  payment_method?: string | null;

  transaction_ref?: string | null;
  provider_transaction_id?: string | null;

  platform_fee: number;
  provider_amount: number;

  failure_reason?: string | null;

  paid_at?: string | null;
  released_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingWithEscrowPayment {
  booking: Record<string, unknown>;
  payment: Payment;
}

// Normal bookings must use the database transaction so booking and escrow
// payment creation cannot leave a partially-created booking behind.
export async function createBookingWithEscrowPayment(
  customerId: string,
  providerId: string,
  serviceId: string,
  bookingDate: string,
  startTime: string,
  endTime: string,
  totalAmount: number,
  paymentMethod = "mock_checkout",
  transactionRef?: string
): Promise<BookingWithEscrowPayment | null> {
  try {
    const { data, error } = await supabase.rpc(
      "create_booking_with_escrow_payment",
      {
        p_customer_id: customerId,
        p_provider_id: providerId,
        p_service_id: serviceId,
        p_booking_date: bookingDate,
        p_start_time: startTime,
        p_end_time: endTime,
        p_total_amount: Number(totalAmount) || 0,
        p_currency: "UGX",
        p_transaction_ref: transactionRef ?? null,
        p_payment_method: paymentMethod,
      }
    );

    if (error) {
      console.error("Error creating booking with escrow payment:", error);
      return null;
    }

    const result = data as {
      success?: boolean;
      error?: string;
      booking?: Record<string, unknown>;
      payment?: Payment;
    } | null;

    if (!result?.success || !result.booking || !result.payment) {
      console.error(
        "Booking with escrow payment was rejected:",
        result?.error || "Unknown transaction error"
      );
      return null;
    }

    return {
      booking: result.booking,
      payment: result.payment,
    };
  } catch (error) {
    console.error("Exception creating booking with escrow payment:", error);
    return null;
  }
}

// Internal helper: fetch a payment by its id (used by state-machine guards).
async function getPaymentByIdHelper(
  paymentId: string
): Promise<Payment | null> {
  try {
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("id", paymentId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching payment by id:", error);
      return null;
    }

    return (data as Payment) || null;
  } catch (error) {
    console.error("Error getting payment by id:", error);
    return null;
  }
}

// Get payment by booking ID
export async function getPaymentByBookingId(
  bookingId: string
): Promise<Payment | null> {
  try {
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("booking_id", bookingId)
      .single();

    if (error) {
      console.error("Error fetching payment:", error);
      return null;
    }

    return data as Payment;
  } catch (error) {
    console.error("Error getting payment:", error);
    return null;
  }
}

// Get all payments for a booking
export async function getPaymentsByBookingId(
  bookingId: string
): Promise<Payment[]> {
  try {
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching payments:", error);
      return [];
    }

    return (data || []) as Payment[];
  } catch (error) {
    console.error("Error getting payments:", error);
    return [];
  }
}

// Create payment record
export async function createPayment(
  bookingId: string,
  customerId: string,
  providerId: string,
  amount: number,
  paymentMethod = "mock_checkout",
  transactionRef?: string
): Promise<Payment | null> {
  try {
    const normalizedAmount = Number(amount) || 0;
    const platformFee = Number((normalizedAmount * 0.1).toFixed(2));
    const providerAmount = Number((normalizedAmount - platformFee).toFixed(2));

    const { data, error } = await supabase
      .from("payments")
      .insert([
        {
          booking_id: bookingId,
          customer_id: customerId,
          provider_id: providerId,
          amount: normalizedAmount,
          currency: "UGX",
          payment_status: "escrowed",
          payment_method: paymentMethod,
          transaction_ref: transactionRef,
          platform_fee: platformFee,
          provider_amount: providerAmount,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Error creating payment:", error);
      return null;
    }

    return data as Payment;
  } catch (error) {
    console.error("Error creating payment:", error);
    return null;
  }
}

// Update payment status.
//
// State-machine enforced: the transition is checked against PAYMENT_TRANSITIONS
// before the write, and the validate_payment_status_transition trigger rejects
// illegal moves on the server as well. Returns null on a rejected transition.
export async function updatePaymentStatus(
  paymentId: string,
  status: PaymentStatus,
  transactionRef?: string
): Promise<Payment | null> {
  try {
    const current = await getPaymentByIdHelper(paymentId);
    if (!current) {
      console.error("Error updating payment status: payment not found");
      return null;
    }

    const transitionError = paymentTransitionError(current.payment_status, status);
    if (transitionError) {
      console.error("State machine rejected payment transition:", transitionError);
      return null;
    }

    const updates: Record<string, unknown> = {
      payment_status: status,
      updated_at: new Date().toISOString(),
    };

    if (transactionRef) {
      updates.transaction_ref = transactionRef;
    }

    if (status === "released") {
      updates.released_at = new Date().toISOString();
      updates.paid_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("payments")
      .update(updates)
      .eq("id", paymentId)
      .select()
      .single();

    if (error) {
      console.error("Error updating payment:", error);
      return null;
    }

    return data as Payment;
  } catch (error) {
    console.error("Error updating payment:", error);
    return null;
  }
}

// Hold payment in escrow until service completion is confirmed.
export async function markPaymentAsEscrowed(
  paymentId: string,
  transactionRef: string
): Promise<Payment | null> {
  return updatePaymentStatus(paymentId, "escrowed", transactionRef);
}

// Release escrowed funds to the provider after customer confirms completion.
export async function releaseEscrow(
  paymentId: string,
  transactionRef?: string
): Promise<Payment | null> {
  return updatePaymentStatus(paymentId, "released", transactionRef);
}

export async function releaseEscrowForBooking(
  bookingId: string
): Promise<Payment | null> {
  try {
    const payment = await getPaymentByBookingId(bookingId);
    if (!payment) {
      console.error("No payment found for booking to release.");
      return null;
    }

    return releaseEscrow(payment.id, payment.transaction_ref || undefined);
  } catch (error) {
    console.error("Error releasing escrow for booking:", error);
    return null;
  }
}

export async function confirmServiceCompletionAndRelease(
  bookingId: string
): Promise<Payment | null> {
  try {
    const { data, error } = await supabase.rpc("release_escrow_to_provider", { p_booking_id: bookingId });
    if (error) throw error;
    return (ensureEscrowSuccess(data as EscrowRpcResult).payment || null) as Payment | null;
  } catch (error) {
    console.error("Error completing service and releasing escrow:", error);
    return null;
  }
}

/** Provider starts the mutual completion flow; the customer still releases escrow. */
export async function requestServiceCompletion(bookingId: string, providerId: string): Promise<CompletionRequest | null> {
  try {
    const { data, error } = await supabase.from("completion_requests")
      .upsert({ booking_id: bookingId, provider_id: providerId }, { onConflict: "booking_id" })
      .select().single();
    if (error) throw error;
    return data as CompletionRequest;
  } catch (error) {
    console.error("Error requesting service completion:", error);
    return null;
  }
}

export async function getCompletionRequestBookingIds(bookingIds: string[]): Promise<Set<string>> {
  if (!bookingIds.length) return new Set();
  try {
    const { data, error } = await supabase.from("completion_requests").select("booking_id").in("booking_id", bookingIds);
    if (error) throw error;
    return new Set((data || []).map((request) => request.booking_id));
  } catch (error) {
    console.error("Error loading completion requests:", error);
    return new Set();
  }
}

/** Atomically cancels a booking and returns the escrowed payment to the customer. */
export async function cancelBookingAndRefund(bookingId: string, reason?: string): Promise<Payment | null> {
  try {
    const { data, error } = await supabase.rpc("cancel_booking_and_refund", {
      p_booking_id: bookingId, p_cancel_reason: reason || null, p_refund_reason: reason || null,
    });
    if (error) throw error;
    return (ensureEscrowSuccess(data as EscrowRpcResult).payment || null) as Payment | null;
  } catch (error) {
    console.error("Error cancelling booking and refunding escrow:", error);
    return null;
  }
}

// Mark payment as failed (state-machine enforced)
export async function markPaymentAsFailed(
  paymentId: string,
  failureReason?: string
): Promise<Payment | null> {
  try {
    const current = await getPaymentByIdHelper(paymentId);
    if (!current) return null;

    const transitionError = paymentTransitionError(current.payment_status, "failed");
    if (transitionError) {
      console.error("State machine rejected failure transition:", transitionError);
      return null;
    }

    const updates: Record<string, unknown> = {
      payment_status: "failed",
      updated_at: new Date().toISOString(),
    };

    if (failureReason) {
      updates.failure_reason = failureReason;
    }

    const { data, error } = await supabase
      .from("payments")
      .update(updates)
      .eq("id", paymentId)
      .select()
      .single();

    if (error) {
      console.error("Error marking payment as failed:", error);
      return null;
    }

    return data as Payment;
  } catch (error) {
    console.error("Error marking payment as failed:", error);
    return null;
  }
}

// Mark payment as refunded
export async function markPaymentAsRefunded(
  paymentId: string
): Promise<Payment | null> {
  return updatePaymentStatus(paymentId, "refunded");
}

// Get payments by status
export async function getPaymentsByStatus(
  status: PaymentStatus
): Promise<Payment[]> {
  try {
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("payment_status", status)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching payments:", error);
      return [];
    }

    return (data || []) as Payment[];
  } catch (error) {
    console.error("Error getting payments:", error);
    return [];
  }
}

// Get total revenue for a provider
export async function getProviderRevenue(
  providerId: string
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("bookings")
      .select("id, total_amount")
      .eq("provider_id", providerId)
      .eq("status", "completed");

    if (error) {
      console.error("Error fetching revenue:", error);
      return 0;
    }

    const total = (data || []).reduce(
      (sum, booking) =>
        sum + (Number(booking.total_amount) || 0),
      0
    );

    return total;
  } catch (error) {
    console.error("Error getting provider revenue:", error);
    return 0;
  }
}

export interface CompletionRequest {
  id: string;
  booking_id: string;
  provider_id: string;
  requested_at: string;
}

type EscrowRpcResult = { success?: boolean; error?: string; payment?: Payment };

function ensureEscrowSuccess(result: EscrowRpcResult | null): EscrowRpcResult {
  if (!result?.success) throw new Error(result?.error || "The escrow action could not be completed.");
  return result;
}
