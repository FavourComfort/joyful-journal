import { supabase } from '../supabase';
import type { Provider } from './providers.service';
import type { Profile } from './auth.service';
import type { Booking } from './bookings.service';
import type { Service } from './services.service';
import type { Review } from './reviews.service';
import type { CustomerRequest, ProviderOffer } from './requests.service';

export type AdminRole = 'customer' | 'provider' | 'admin';

/** Full provider record enriched with the owner's profile (for the verification view). */
export interface AdminProvider {
  id: string;
  user_id: string;
  business_name: string;
  bio?: string | null;
  location?: string | null;
  profile_picture_url?: string | null;
  rating: number;
  verified: boolean;
  created_at: string;
  full_name?: string;
  phone?: string | null;
  avatar_url?: string | null;
  profile_created_at?: string;
}

export interface AdminStats {
  totalProviders: number;
  pendingVerification: number;
  verifiedProviders: number;
  totalRequests: number;
  totalOffers: number;
  totalBookings: number;
  totalReviews: number;
  totalRevenue: number;
  pendingOffers: number;
  pendingBookings: number;
}

export interface AdminRequest {
  request: CustomerRequest;
  customer_name: string;
}

export interface AdminOffer {
  offer: ProviderOffer;
  provider_business_name: string;
  request_title: string;
}

export interface AdminBooking {
  booking: Booking;
  customer_name: string;
  provider_business_name: string;
}

export interface AdminReview {
  review: Review;
  customer_name: string;
  provider_business_name: string;
}

/** Resolve a set of profile ids into a { id -> profile } lookup (proven join-by-id pattern). */
async function profileLookup(userIds: string[]): Promise<Record<string, Profile>> {
  if (!userIds.length) return {};
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone, avatar_url, created_at')
    .in('id', userIds);

  if (error) {
    console.error('Error fetching profiles for admin lookup:', error);
    return {};
  }

  return Object.fromEntries((data || []).map((p: any) => [p.id, p as Profile]));
}

/** Resolve provider ids into a { provider_id -> provider } lookup. */
async function providerLookup(providerIds: string[]): Promise<Record<string, Provider>> {
  if (!providerIds.length) return {};
  const { data, error } = await supabase
    .from('providers')
    .select('*')
    .in('id', providerIds);

  if (error) {
    console.error('Error fetching providers for admin lookup:', error);
    return {};
  }

  return Object.fromEntries((data || []).map((p: any) => [p.id, p as Provider]));
}

/**
 * Fetch every provider — verified and unverified — enriched with the owning
 * profile so the admin can verify / reject accounts.
 */
export async function getAllProvidersForAdmin(): Promise<AdminProvider[]> {
  try {
    // No `verified` filter: an admin must see pending accounts too.
    const { data, error } = await supabase
      .from('providers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching providers for admin:', error);
      return [];
    }

    const providers = (data || []) as Provider[];
    const userIds = providers.map((p) => p.user_id).filter(Boolean);
    const profiles = await profileLookup(userIds);

    return providers.map((p) => {
      const profile = profiles[p.user_id];
      return {
        ...p,
        full_name: profile?.full_name,
        phone: profile?.phone ?? null,
        avatar_url: profile?.avatar_url ?? null,
        profile_created_at: profile?.created_at,
      };
    });
  } catch (error) {
    console.error('Exception fetching providers for admin:', error);
    return [];
  }
}

/** Toggle a provider's `verified` flag (admin moderation action). */
export async function setProviderVerified(
  providerId: string,
  verified: boolean
): Promise<AdminProvider | null> {
  try {
    const { data, error } = await supabase
      .from('providers')
      .update({ verified })
      .eq('id', providerId)
      .select()
      .single();

    if (error) {
      console.error('Error updating provider verification:', error);
      return null;
    }

    const provider = (data || null) as AdminProvider | null;
    if (provider) {
      const profiles = await profileLookup([provider.user_id]);
      const profile = profiles[provider.user_id];
      provider.full_name = profile?.full_name;
      provider.phone = profile?.phone ?? null;
      provider.avatar_url = profile?.avatar_url ?? null;
      provider.profile_created_at = profile?.created_at;
    }

    return provider;
  } catch (error) {
    console.error('Exception updating provider verification:', error);
    return null;
  }
}

/** Aggregate counts + revenue for the admin overview. */
export async function getAdminStats(): Promise<AdminStats> {
  try {
    const [providers, requests, offers, bookings, reviews] = await Promise.all([
      supabase.from('providers').select('id, verified', { count: 'exact', head: true }),
      supabase.from('requests').select('id', { count: 'exact', head: true }),
      supabase.from('offers').select('id, status', { count: 'exact' }),
      supabase.from('bookings').select('id, status, total_amount', { count: 'exact' }),
      supabase.from('reviews').select('id', { count: 'exact', head: true }),
    ]);

    const providerRows = (providers.data || []) as AdminProvider[];
    const totalProviders = providers.count ?? (providerRows.length || 0);
    const pendingVerification = providerRows.filter((p) => !p.verified).length;
    const verifiedProviders = providerRows.filter((p) => p.verified).length;

    const allOffers = (offers.data || []) as Array<Pick<ProviderOffer, 'id' | 'status'>>;
    const allBookings = (bookings.data || []) as Booking[];
    const pendingOffers = allOffers.filter((o) => (o.status || 'pending') === 'pending').length;
    const pendingBookings = allBookings.filter((b) => b.status === 'pending').length;
    const totalRevenue = allBookings
      .filter((b) => b.status === 'completed')
      .reduce((sum, b) => sum + (Number(b.total_amount) || 0), 0);

    return {
      totalProviders,
      pendingVerification,
      verifiedProviders,
      totalRequests: requests.count ?? 0,
      totalOffers: offers.count ?? allOffers.length,
      totalBookings: bookings.count ?? allBookings.length,
      totalReviews: reviews.count ?? 0,
      totalRevenue,
      pendingOffers,
      pendingBookings,
    };
  } catch (error) {
    console.error('Exception fetching admin stats:', error);
    return {
      totalProviders: 0,
      pendingVerification: 0,
      verifiedProviders: 0,
      totalRequests: 0,
      totalOffers: 0,
      totalBookings: 0,
      totalReviews: 0,
      totalRevenue: 0,
      pendingOffers: 0,
      pendingBookings: 0,
    };
  }
}

/** Moderation list: all service requests with their customer's name. */
export async function getAllRequestsForAdmin(): Promise<AdminRequest[]> {
  try {
    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching requests for admin:', error);
      return [];
    }

    const requests = (data || []) as CustomerRequest[];
    const ownerIds = requests.map((r) => r.customer_id).filter(Boolean);
    const profiles = await profileLookup(ownerIds);

    return requests.map((r) => ({
      request: r,
      customer_name: profiles[r.customer_id]?.full_name || '—',
    }));
  } catch (error) {
    console.error('Exception fetching requests for admin:', error);
    return [];
  }
}

/** Moderation list: all offers with provider business name + request title. */
export async function getAllOffersForAdmin(): Promise<AdminOffer[]> {
  try {
    const { data, error } = await supabase
      .from('offers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching offers for admin:', error);
      return [];
    }

    const offers = (data || []) as ProviderOffer[];
    const requestIds = [...new Set(offers.map((o) => o.request_id).filter(Boolean))];
    const providerIds = [...new Set(offers.map((o) => o.provider_id).filter(Boolean))];

    const [requestProfiles, providers] = await Promise.all([
      // Resolve request titles, then the customer of each request.
      (async () => {
        const { data: reqs, error: reqErr } = await supabase
          .from('requests')
          .select('id, title, customer_id')
          .in('id', requestIds);
        if (reqErr) {
          console.error('Error fetching requests for offer lookup:', reqErr);
          return {} as Record<string, any>;
        }
        const reqMap = Object.fromEntries((reqs || []).map((r: any) => [r.id, r]));
        const customerIds = [...new Set((reqs || []).map((r: any) => r.customer_id).filter(Boolean))];
        const custProfiles = await profileLookup(customerIds);
        return reqMap;
      })(),
      providerLookup(providerIds),
    ]);

    return offers.map((o) => {
      const request = requestProfiles[o.request_id] || {};
      return {
        offer: o,
        provider_business_name: providers[o.provider_id]?.business_name || '—',
        request_title: request.title || '—',
      };
    });
  } catch (error) {
    console.error('Exception fetching offers for admin:', error);
    return [];
  }
}

/** Moderation list: all bookings with customer + provider names. */
export async function getAllBookingsForAdmin(): Promise<AdminBooking[]> {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching bookings for admin:', error);
      return [];
    }

    const bookings = (data || []) as Booking[];
    const customerIds = [...new Set(bookings.map((b) => b.customer_id).filter(Boolean))];
    const providerUserIds = [...new Set(bookings.map((b) => b.provider_id).filter(Boolean))];

    const [customerProfiles, providers] = await Promise.all([
      profileLookup(customerIds),
      // book.provider_id references providers.id, but profiles live under providers.user_id.
      (async () => {
        const provRows = await providerLookup(
          bookings.map((b) => b.provider_id).filter(Boolean)
        );
        return provRows;
      })(),
    ]);

    return bookings.map((b) => ({
      booking: b,
      customer_name: customerProfiles[b.customer_id]?.full_name || '—',
      provider_business_name: providers[b.provider_id]?.business_name || '—',
    }));
  } catch (error) {
    console.error('Exception fetching bookings for admin:', error);
    return [];
  }
}

/** Moderation list: all reviews with customer + provider names. */
export async function getAllReviewsForAdmin(): Promise<AdminReview[]> {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching reviews for admin:', error);
      return [];
    }

    const reviews = (data || []) as Review[];
    const customerIds = [...new Set(reviews.map((r) => r.customer_id).filter(Boolean))];
    const providerIds = [...new Set(reviews.map((r) => r.provider_id).filter(Boolean))];

    const [customerProfiles, providers] = await Promise.all([
      profileLookup(customerIds),
      providerLookup(providerIds),
    ]);

    return reviews.map((r) => ({
      review: r,
      customer_name: customerProfiles[r.customer_id]?.full_name || '—',
      provider_business_name: providers[r.provider_id]?.business_name || '—',
    }));
  } catch (error) {
    console.error('Exception fetching reviews for admin:', error);
    return [];
  }
}

/** Remove a service request (admin moderation). */
export async function deleteRequest(requestId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('requests').delete().eq('id', requestId);
    if (error) {
      console.error('Error deleting request:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Exception deleting request:', error);
    return false;
  }
}

/** Remove a provider offer (admin moderation). */
export async function deleteOffer(offerId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('offers').delete().eq('id', offerId);
    if (error) {
      console.error('Error deleting offer:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Exception deleting offer:', error);
    return false;
  }
}

/** Permanently remove a booking (admin moderation). Soft cancel is exposed as
 *  `cancelBooking` on the bookings service; this hard-deletes for moderation. */
export async function deleteBookingPermanently(bookingId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('bookings').delete().eq('id', bookingId);
    if (error) {
      console.error('Error deleting booking:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Exception deleting booking:', error);
    return false;
  }
}

/** Permanently remove a review (admin moderation). */
export async function deleteReviewPermanently(reviewId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('reviews').delete().eq('id', reviewId);
    if (error) {
      console.error('Error deleting review:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Exception deleting review:', error);
    return false;
  }
}

export default {};
