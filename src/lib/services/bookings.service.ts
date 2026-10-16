import { supabase } from '../supabase';
import {
  assertBookingTransition,
  bookingTransitionError,
  type BookingStatus,
} from '../state-machines';
import { getPaymentByBookingId } from './payments.service';

export interface Booking {
  id: string;
  customer_id: string;
  provider_id: string;
  service_id: string;
  booking_date: string;
  start_time: string | null;
  end_time: string | null;
  status: BookingStatus;
  total_amount: number;
  created_at: string;
}

type BookingParty = 'customer_id' | 'provider_id';

// Shared fetch for bookings of a given party (customer or provider), newest first.
async function getBookingsByParty(party: BookingParty, partyId: string): Promise<Booking[]> {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq(party, partyId)
      .order('booking_date', { ascending: false });

    if (error) {
      console.error('Error fetching bookings:', error);
      return [];
    }

    return (data || []) as Booking[];
  } catch (error) {
    console.error(`Error getting ${party} bookings:`, error);
    return [];
  }
}

// Get all bookings for a customer
export async function getCustomerBookings(customerId: string): Promise<Booking[]> {
  return getBookingsByParty('customer_id', customerId);
}

// Get all bookings for a provider
export async function getProviderBookings(providerId: string): Promise<Booking[]> {
  return getBookingsByParty('provider_id', providerId);
}

// Get booking by ID
export async function getBookingById(bookingId: string): Promise<Booking | null> {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (error) {
      console.error('Error fetching booking:', error);
      return null;
    }

    return data as Booking;
  } catch (error) {
    console.error('Error getting booking:', error);
    return null;
  }
}

// Create booking
//
// Customers provide only a date and preferred start time; end time and
// duration are intentionally NOT collected or calculated.
export async function createBooking(
  customerId: string,
  providerId: string,
  serviceId: string,
  bookingDate: string,
  startTime: string | null,
  totalAmount: number
): Promise<Booking | null> {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .insert([
        {
          customer_id: customerId,
          provider_id: providerId,
          service_id: serviceId,
          booking_date: bookingDate,
          start_time: startTime,
          total_amount: totalAmount,
          status: 'pending',
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error creating booking:', error);
      return null;
    }

    return data as Booking;
  } catch (error) {
    console.error('Error creating booking:', error);
    return null;
  }
}

// Update booking status.
//
// State-machine enforced: the transition is checked against BOOKING_TRANSITIONS
// before the write and the server rejects illegal transitions as well (see the
// validate_booking_status_transition trigger). Returns null on a rejected move.
//
// The "Bookings no direct update" RLS policy blocks direct client UPDATEs on
// public.bookings, so this function delegates to the SECURITY DEFINER RPC
// provider_update_booking_status, which re-verifies that the caller is the
// provider of the booking before updating ONLY the status column.
/**
 * Booking statuses that may only be reached once the customer's payment is
 * actually held in escrow. Reaching these states implies the money is secured.
 */
const PAYMENT_GATED_BOOKING_STATUSES: BookingStatus[] = ['confirmed', 'in_progress'];

export async function updateBookingStatus(
  bookingId: string,
  status: BookingStatus
): Promise<Booking | null> {
  try {
    const current = await getBookingById(bookingId);
    if (!current) {
      console.error('Error updating booking status: booking not found');
      return null;
    }

    /*
     * PAYMENT GATE.
     *
     * A provider must not be able to progress a booking into a state that
     * implies the customer's money is secured while the payment is still
     * only 'pending'.
     *
     * A payment row is created as 'pending' by
     * create_booking_with_escrow_payment; only the marzpay-webhook moves it to
     * 'escrowed'. So the presence of a payment row proves nothing — only the
     * real payment_status does.
     *
     * This is a pure read: it never converts 'pending' into 'escrowed', never
     * fakes escrow, and does not touch the escrow mechanism itself.
     */
    if (PAYMENT_GATED_BOOKING_STATUSES.includes(status)) {
      const payment = await getPaymentByBookingId(bookingId);

      if (!payment) {
        console.error(
          `Booking status blocked: booking ${bookingId} has no payment record.`
        );
        return null;
      }

      if (payment.payment_status !== 'escrowed') {
        console.error(
          `Booking status blocked: payment status is '${payment.payment_status}', not 'escrowed'.`
        );
        return null;
      }
    }

    const transitionError = bookingTransitionError(current.status, status);
    if (transitionError) {
      console.error('State machine rejected booking transition:', transitionError);
      return null;
    }

    const { data, error } = await supabase.rpc(
      'provider_update_booking_status',
      {
        p_booking_id: bookingId,
        p_new_status: status,
      }
    );

    if (error) {
      console.error('Error updating booking:', error);
      return null;
    }

    const result = data as {
      success?: boolean;
      error?: string;
      booking?: Booking;
    } | null;

    if (!result?.success || !result.booking) {
      console.error('Booking status update was rejected:', result?.error || 'Unknown error');
      return null;
    }

    return result.booking;
  } catch (error) {
    console.error('Error updating booking:', error);
    return null;
  }
}

// Cancel booking (soft cancel) — only allowed from pending / confirmed / in_progress.
export async function cancelBooking(bookingId: string): Promise<boolean> {
  try {
    const current = await getBookingById(bookingId);
    if (!current) return false;

    try {
      assertBookingTransition(current.status, 'cancelled');
    } catch (transitionError) {
      console.error('State machine rejected cancellation:', transitionError);
      return false;
    }

    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', bookingId);

    if (error) {
      console.error('Error cancelling booking:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error cancelling booking:', error);
    return false;
  }
}

// Get upcoming bookings for a provider
export async function getUpcomingProviderBookings(providerId: string): Promise<Booking[]> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('provider_id', providerId)
      .gte('booking_date', today)
      .neq('status', 'cancelled')
      .order('booking_date', { ascending: true });

    if (error) {
      console.error('Error fetching upcoming bookings:', error);
      return [];
    }

    return (data || []) as Booking[];
  } catch (error) {
    console.error('Error getting upcoming bookings:', error);
    return [];
  }
}

// Get completed bookings for a customer
export async function getCompletedCustomerBookings(customerId: string): Promise<Booking[]> {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('customer_id', customerId)
      .eq('status', 'completed')
      .order('booking_date', { ascending: false });

    if (error) {
      console.error('Error fetching completed bookings:', error);
      return [];
    }

    return (data || []) as Booking[];
  } catch (error) {
    console.error('Error getting completed bookings:', error);
    return [];
  }
}
