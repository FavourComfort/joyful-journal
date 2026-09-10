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
  startTime: string | null,
  serviceFee: number,
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
        p_service_fee: Number(serviceFee) || 0,
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

// ---------------------------------------------------------------------------
// SHARED PAYMENT ENTRY POINT (used by BOTH booking flows)
//
//   create booking + payment as 'pending'
//     -> invoke the existing 'ninjawo-handler' Edge Function (MarzPay
//        collection via https://wallet.wearemarz.com/api/v1/collect-money,
//        secrets stay server-side in the Edge Function)
//     -> the existing 'marzpay-webhook' Edge Function receives MarzPay's
//        final status and moves the payment to 'escrowed' or 'failed'
//
// The frontend never touches MarzPay credentials — it only generates the
// unique reference, which is stored in payments.transaction_ref BEFORE the
// handler is invoked, so the webhook can correlate the transaction.
// ---------------------------------------------------------------------------
export type BookingPaymentStatus = "pending" | "escrowed" | "failed" | "error";

export interface InitiateBookingPaymentInput {
  customerId: string;
  providerId: string;
  /** profiles.id of the provider user — only used for notifications. */
  providerUserId?: string;
  serviceId: string;
  bookingDate: string;
  /** Preferred start time; may be null (post-request flow has no time). */
  startTime: string | null;
  /** Provider's service fee before the customer's 2% fee. */
  serviceFee: number;
  totalAmount: number;
  description?: string;
  paymentMethod?: string;
}

export interface BookingPaymentResult {
  status: BookingPaymentStatus;
  booking?: Record<string, unknown>;
  payment?: Payment;
  transactionRef?: string;
  error?: string;
}

const SETTLEMENT_POLL_INTERVAL_MS = 2000;
const SETTLEMENT_TIMEOUT_MS = 30000;

/** Poll the payment row until marzpay-webhook settles it (escrowed/failed). */
async function waitForPaymentSettlement(paymentId: string): Promise<Payment | null> {
  const deadline = Date.now() + SETTLEMENT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, SETTLEMENT_POLL_INTERVAL_MS));

    const payment = await getPaymentByIdHelper(paymentId);
    if (
      payment &&
      (payment.payment_status === "escrowed" || payment.payment_status === "failed")
    ) {
      return payment;
    }
  }

  return null;
}

export async function initiateBookingPayment(
  input: InitiateBookingPaymentInput
): Promise<BookingPaymentResult> {
  // ------------------------------------------------------------------
  // PHONE VALIDATION (Ugandan mobile numbers)
  //
  // Must pass BEFORE any booking/payment is created and before the
  // handler is invoked. Accepts the common local formats:
  //
  //   07XXXXXXXX      (local, 10 digits)
  //   2567XXXXXXXX    (international, no +)
  //   +2567XXXXXXXX   (international, with +)
  //
  // Valid numbers are normalized to +2567XXXXXXXX for MarzPay.
  // ------------------------------------------------------------------
  const UGANDA_MOBILE_PATTERN = /^(?:\+?256|0)(7\d{8})$/;

  let customerPhoneNumber = "";
  try {
    const { data: profileRow, error: profileError } = await supabase
      .from("profiles")
      .select("phone")
      .eq("id", input.customerId)
      .maybeSingle();

    if (profileError) {
      console.error("Error loading customer phone for payment:", profileError);
    } else if (profileRow?.phone) {
      customerPhoneNumber = String(profileRow.phone).trim();
    }
  } catch (err) {
    console.error("Exception loading customer phone for payment:", err);
  }

  const phoneMatch = UGANDA_MOBILE_PATTERN.exec(customerPhoneNumber);

  if (!phoneMatch) {
    const message = "Please enter a valid Ugandan mobile number.";
    console.error("Payment not started:", message);
    return {
      status: "error",
      error: message,
    };
  }

  // Normalized international format: +2567XXXXXXXX
  const normalizedPhoneNumber = `+256${phoneMatch[1]}`;

  // STEP 1: Create the booking + a 'pending' payment atomically.
  // The unique reference is generated here and persisted in
  // payments.transaction_ref BEFORE the handler is called.
  const transactionRef = crypto.randomUUID();

  const transaction = await createBookingWithEscrowPayment(
    input.customerId,
    input.providerId,
    input.serviceId,
    input.bookingDate,
    input.startTime,
    input.serviceFee,
    input.totalAmount,
    input.paymentMethod ?? "marzpay",
    transactionRef
  );

  if (!transaction) {
    return {
      status: "error",
      transactionRef,
      error: "Booking could not be created.",
    };
  }

  const { booking, payment } = transaction;

  // STEP 2: Ask the server-side Edge Function to start the MarzPay collection.
  // phone_number was validated and normalized to +2567XXXXXXXX above.
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("Your login session has expired. Please sign in again.");
    }

    const { error: invokeError } = await supabase.functions.invoke(
      "ninjawo-handler",
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: {
          payment_id: payment.id,
          phone_number: normalizedPhoneNumber,
          amount: Math.round(Number(input.totalAmount) || 0),
          reference: transactionRef,
          transaction_ref: transactionRef,
          description: input.description ?? "NINJAWO booking payment",
        },
      }
    );

    if (invokeError) {
      let message = invokeError.message || "Payment could not be started.";

      // Supabase wraps non-2xx function responses in FunctionsHttpError.
      // Read the JSON body so the customer sees the handler's actual reason.
      const response = "context" in invokeError && invokeError.context instanceof Response
        ? invokeError.context
        : null;

      if (response) {
        try {
          const details = await response.clone().json() as {
            error?: string;
            details?: { message?: string };
          };
          message = details.error || details.details?.message || message;
        } catch {
          // Keep Supabase's message when the function did not return JSON.
        }
      }

      console.error("ninjawo-handler invocation failed:", invokeError);
      await markPaymentAsFailed(payment.id, message);
      const failed = await getPaymentByIdHelper(payment.id);
      return {
        status: "failed",
        booking,
        payment: failed ?? payment,
        transactionRef,
        error: message,
      };
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Payment could not be started.";
    console.error("Exception invoking ninjawo-handler:", err);
    await markPaymentAsFailed(payment.id, message);
    const failed = await getPaymentByIdHelper(payment.id);
    return {
      status: "failed",
      booking,
      payment: failed ?? payment,
      transactionRef,
      error: message,
    };
  }

  // STEP 3: Wait for the existing marzpay-webhook Edge Function to settle
  // the payment. If the webhook has not landed within the timeout the
  // payment legitimately stays 'pending' — the customer just sees
  // "awaiting confirmation" and the webhook completes it later.
  const settled = await waitForPaymentSettlement(payment.id);
  const finalPayment =
    settled ?? (await getPaymentByIdHelper(payment.id)) ?? payment;

  return {
    status: (finalPayment.payment_status as BookingPaymentStatus) ?? "pending",
    booking,
    payment: finalPayment,
    transactionRef,
  };
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
  transactionRef?: string,
  serviceFee?: number
): Promise<Payment | null> {
  try {
    const normalizedAmount = Number(amount) || 0;
    const normalizedServiceFee = Number(serviceFee ?? amount) || 0;
    const providerAmount = Number((normalizedServiceFee * 0.9).toFixed(2));
    const platformFee = Number((normalizedAmount - providerAmount).toFixed(2));

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

    const result = data as EscrowRpcResult | null;

    // Legacy bookings (created before the escrow system) have no payments row,
    // so the RPC reports "No payment found". Complete them directly instead.
    if (result && !result.success && /no payment found/i.test(result.error || "")) {
      console.warn("No escrow payment for booking; completing legacy booking directly.");
      const legacy = await completeLegacyBooking(bookingId, "completed");
      return legacy;
    }

    return (ensureEscrowSuccess(result).payment || null) as Payment | null;
  } catch (error) {
    console.error("Error completing service and releasing escrow:", error);
    return null;
  }
}

// Fallback for pre-escrow bookings: update booking status, walking through the
// legal state-machine transitions (pending → confirmed → in_progress → completed).
async function completeLegacyBooking(
  bookingId: string,
  status: "completed" | "cancelled"
): Promise<Payment | null> {
  const setBookingStatus = async (
    next: string
  ): Promise<boolean> => {
    const { data, error } = await supabase
      .from("bookings")
      .update({ status: next })
      .eq("id", bookingId)
      .select("id, status")
      .single();

    if (error) {
      // Illegal transitions are expected while skipping steps; ignore them.
      if (/invalid booking status transition/i.test(error.message || "")) {
        return false;
      }
      console.error(`Error marking booking ${bookingId} as ${next}:`, error);
      return false;
    }
    return Boolean(data);
  };

  let finalStatus = false;

  if (status === "completed") {
    // Walk the chain; intermediate steps may already be done (illegal → false).
    await setBookingStatus("confirmed");
    await setBookingStatus("in_progress");
    finalStatus = await setBookingStatus("completed");
  } else {
    finalStatus = await setBookingStatus("cancelled");
  }

  if (!finalStatus) {
    console.error(`Could not mark booking ${bookingId} as ${status}.`);
    return null;
  }

  // Shape the result so the existing dashboard flow (which expects a payment)
  // keeps working without escrow-specific fields.
  return {
    id: "",
    booking_id: bookingId,
    customer_id: "",
    provider_id: "",
    amount: 0,
    currency: "UGX",
    payment_status: status === "completed" ? "released" : "refunded",
    platform_fee: 0,
    provider_amount: 0,
    created_at: "",
    updated_at: "",
  } as Payment;
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

    const result = data as EscrowRpcResult | null;

    // Legacy bookings (created before the escrow system) have no payments row
    // to refund; cancel them directly instead.
    if (result && !result.success && /no payment found/i.test(result.error || "")) {
      console.warn("No escrow payment for booking; cancelling legacy booking directly.");
      return completeLegacyBooking(bookingId, "cancelled");
    }

    return (ensureEscrowSuccess(result).payment || null) as Payment | null;
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

// ---------------------------------------------------------------------------
// PLATFORM FEE HELPERS — single source of truth for the NINJAWO commission
// ---------------------------------------------------------------------------

/** NINJAWO provider fee as a percentage of the provider's service fee. */
export const PROVIDER_FEE_PERCENT = 10;

/** Calculate what the provider earns (90% of the provider's service fee). */
export function calculateProviderEarnings(serviceFee: number): number {
  const fee = Number(serviceFee) || 0;
  return Math.round(fee * (1 - PROVIDER_FEE_PERCENT / 100));
}

/** Friendly breakdown of where the money goes — used by the provider dashboard. */
export function formatCommissionBreakdown(totalAmount: number, serviceFee = totalAmount): {
  customerPaid: number;
  commission: number;
  providerEarnings: number;
} {
  const customerPaid = Math.round(Number(totalAmount) || 0);
  const providerEarnings = calculateProviderEarnings(serviceFee);
  const commission = customerPaid - providerEarnings;
  return { customerPaid, commission, providerEarnings };
}
