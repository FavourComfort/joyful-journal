import { supabase } from '../supabase';
import {
  assertBookingTransition,
  bookingTransitionError,
  type BookingStatus,
} from '../state-machines';

export interface Booking {
  id: string;
  customer_id: string;
  provider_id: string;
  service_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
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
export async function createBooking(
  customerId: string,
  providerId: string,
  serviceId: string,
  bookingDate: string,
  startTime: string,
  endTime: string,
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
          end_time: endTime,
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

    const transitionError = bookingTransitionError(current.status, status);
    if (transitionError) {
      console.error('State machine rejected booking transition:', transitionError);
      return null;
    }

    const { data, error } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', bookingId)
      .select()
      .single();

    if (error) {
      console.error('Error updating booking:', error);
      return null;
    }

    return data as Booking;
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
