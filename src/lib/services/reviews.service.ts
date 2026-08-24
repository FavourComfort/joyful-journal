import { supabase } from '../supabase';

export interface Review {
  id: string;
  booking_id: string;
  customer_id: string;
  provider_id: string;
  rating: number;
  comment?: string;
  created_at: string;
}

type ReviewParty = 'provider_id' | 'customer_id';

// Shared fetch for reviews associated with a given party, newest first.
async function getReviewsByParty(party: ReviewParty, partyId: string): Promise<Review[]> {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq(party, partyId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching reviews:', error);
      return [];
    }

    return (data || []) as Review[];
  } catch (error) {
    console.error(`Error getting ${party} reviews:`, error);
    return [];
  }
}

// Get reviews for a provider
export async function getProviderReviews(providerId: string): Promise<Review[]> {
  return getReviewsByParty('provider_id', providerId);
}

// Get reviews by a customer
export async function getCustomerReviews(customerId: string): Promise<Review[]> {
  return getReviewsByParty('customer_id', customerId);
}

// Get review by booking ID
export async function getReviewByBookingId(bookingId: string): Promise<Review | null> {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('booking_id', bookingId)
      .single();

    if (error) {
      console.error('Error fetching review:', error);
      return null;
    }

    return data as Review;
  } catch (error) {
    console.error('Error getting review:', error);
    return null;
  }
}

// Create review
export async function createReview(
  bookingId: string,
  customerId: string,
  providerId: string,
  rating: number,
  comment?: string
): Promise<Review | null> {
  try {
    if (rating < 1 || rating > 5) {
      console.error('Rating must be between 1 and 5');
      return null;
    }

    const { data, error } = await supabase
      .from('reviews')
      .insert([
        {
          booking_id: bookingId,
          customer_id: customerId,
          provider_id: providerId,
          rating,
          comment,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error creating review:', error);
      return null;
    }

    return data as Review;
  } catch (error) {
    console.error('Error creating review:', error);
    return null;
  }
}

// Update review
export async function updateReview(
  reviewId: string,
  updates: Partial<Review>
): Promise<Review | null> {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .update(updates)
      .eq('id', reviewId)
      .select()
      .single();

    if (error) {
      console.error('Error updating review:', error);
      return null;
    }

    return data as Review;
  } catch (error) {
    console.error('Error updating review:', error);
    return null;
  }
}

// Delete review
export async function deleteReview(reviewId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('reviews').delete().eq('id', reviewId);

    if (error) {
      console.error('Error deleting review:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error deleting review:', error);
    return false;
  }
}

// Get average rating for a provider
export async function getProviderAverageRating(providerId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('rating')
      .eq('provider_id', providerId);

    if (error) {
      console.error('Error fetching average rating:', error);
      return 0;
    }

    if (!data || data.length === 0) return 0;

    const average = data.reduce((sum, review) => sum + (review.rating || 0), 0) / data.length;
    return Math.round(average * 10) / 10;
  } catch (error) {
    console.error('Error getting provider average rating:', error);
    return 0;
  }
}
