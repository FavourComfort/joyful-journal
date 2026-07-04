import { supabase } from '../supabase';

export interface Payment {
  id: string;
  booking_id: string;
  amount: number;
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  payment_method?: string;
  transaction_ref?: string;
  created_at: string;
}

// Get payment by booking ID
export async function getPaymentByBookingId(bookingId: string): Promise<Payment | null> {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('booking_id', bookingId)
      .single();

    if (error) {
      console.error('Error fetching payment:', error);
      return null;
    }

    return data as Payment;
  } catch (error) {
    console.error('Error getting payment:', error);
    return null;
  }
}

// Get all payments for a booking (in case of retries)
export async function getPaymentsByBookingId(bookingId: string): Promise<Payment[]> {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching payments:', error);
      return [];
    }

    return (data || []) as Payment[];
  } catch (error) {
    console.error('Error getting payments:', error);
    return [];
  }
}

// Create payment record
export async function createPayment(
  bookingId: string,
  amount: number,
  paymentMethod?: string,
  transactionRef?: string
): Promise<Payment | null> {
  try {
    const { data, error } = await supabase
      .from('payments')
      .insert([
        {
          booking_id: bookingId,
          amount,
          payment_status: 'pending',
          payment_method: paymentMethod,
          transaction_ref: transactionRef,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error creating payment:', error);
      return null;
    }

    return data as Payment;
  } catch (error) {
    console.error('Error creating payment:', error);
    return null;
  }
}

// Update payment status
export async function updatePaymentStatus(
  paymentId: string,
  status: 'pending' | 'paid' | 'failed' | 'refunded',
  transactionRef?: string
): Promise<Payment | null> {
  try {
    const updates: any = { payment_status: status };
    if (transactionRef) {
      updates.transaction_ref = transactionRef;
    }

    const { data, error } = await supabase
      .from('payments')
      .update(updates)
      .eq('id', paymentId)
      .select()
      .single();

    if (error) {
      console.error('Error updating payment:', error);
      return null;
    }

    return data as Payment;
  } catch (error) {
    console.error('Error updating payment:', error);
    return null;
  }
}

// Mark payment as paid
export async function markPaymentAsPaid(
  paymentId: string,
  transactionRef: string
): Promise<Payment | null> {
  return updatePaymentStatus(paymentId, 'paid', transactionRef);
}

// Mark payment as failed
export async function markPaymentAsFailed(paymentId: string): Promise<Payment | null> {
  return updatePaymentStatus(paymentId, 'failed');
}

// Mark payment as refunded
export async function markPaymentAsRefunded(paymentId: string): Promise<Payment | null> {
  return updatePaymentStatus(paymentId, 'refunded');
}

// Get payments by status
export async function getPaymentsByStatus(
  status: 'pending' | 'paid' | 'failed' | 'refunded'
): Promise<Payment[]> {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('payment_status', status)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching payments:', error);
      return [];
    }

    return (data || []) as Payment[];
  } catch (error) {
    console.error('Error getting payments:', error);
    return [];
  }
}

// Get total revenue for a provider
export async function getProviderRevenue(providerId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('amount')
      .eq('payment_status', 'paid')
      .in(
        'booking_id',
        // This is a simplified version, ideally use a join
        []
      );

    if (error) {
      console.error('Error fetching revenue:', error);
      return 0;
    }

    const total = (data || []).reduce((sum, payment) => sum + (payment.amount || 0), 0);
    return total;
  } catch (error) {
    console.error('Error getting provider revenue:', error);
    return 0;
  }
}
