import { supabase } from '../supabase';

export interface Booking {
  id: string;
  customer_id: string;
  provider_id: string;
  service_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  total_amount: number;
  created_at: string;
}

// Get all bookings for a customer
export async function getCustomerBookings(customerId: string): Promise<Booking[]> {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('customer_id', customerId)
      .order('booking_date', { ascending: false });

    if (error) {
      console.error('Error fetching bookings:', error);
      return [];
    }

    return (data || []) as Booking[];
  } catch (error) {
    console.error('Error getting customer bookings:', error);
    return [];
  }
}

// Get all bookings for a provider
export async function getProviderBookings(providerId: string): Promise<Booking[]> {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('provider_id', providerId)
      .order('booking_date', { ascending: false });

    if (error) {
      console.error('Error fetching bookings:', error);
      return [];
    }

    return (data || []) as Booking[];
  } catch (error) {
    console.error('Error getting provider bookings:', error);
    return [];
  }
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

// Update booking status
export async function updateBookingStatus(
  bookingId: string,
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled'
): Promise<Booking | null> {
  try {
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

// Cancel booking
export async function cancelBooking(bookingId: string): Promise<boolean> {
  try {
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
