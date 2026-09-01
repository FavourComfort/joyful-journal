import { supabase } from "../supabase";

export interface Payment {
  id: string;
  booking_id: string;

  customer_id: string;
  provider_id: string;

  amount: number;
  currency: string;

  payment_status: "pending" | "escrowed" | "released" | "failed" | "refunded" | "disputed";
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

// Update payment status
export async function updatePaymentStatus(
  paymentId: string,
  status: "pending" | "escrowed" | "released" | "failed" | "refunded" | "disputed",
  transactionRef?: string
): Promise<Payment | null> {
  try {
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
    const payment = await getPaymentByBookingId(bookingId);

    if (!payment) {
      console.error("No payment record exists for this booking.");
      return null;
    }

    const booking = await import("./bookings.service").then((mod) =>
      mod.updateBookingStatus(bookingId, "completed")
    );

    if (!booking) {
      console.error("Could not mark booking as completed before releasing escrow.");
      return null;
    }

    return releaseEscrow(payment.id, payment.transaction_ref || undefined);
  } catch (error) {
    console.error("Error completing service and releasing escrow:", error);
    return null;
  }
}

// Mark payment as failed
export async function markPaymentAsFailed(
  paymentId: string,
  failureReason?: string
): Promise<Payment | null> {
  try {
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
  status: "pending" | "escrowed" | "released" | "failed" | "refunded" | "disputed"
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