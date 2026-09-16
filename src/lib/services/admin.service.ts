import { supabase } from '../supabase';
import type { Provider } from './providers.service';
import type { Profile } from './auth.service';
import type { Booking } from './bookings.service';
import type { Service } from './services.service';
import type { Review } from './reviews.service';
import type { Payment } from './payments.service';
import type { CustomerRequest, ProviderOffer } from './requests.service';
import { getAllDisputesForAdmin, type DisputeWithNames } from './disputes.service';
import { getUserNotifications, type Notification } from './notifications.service';

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

// ============================================================================
// PHASE 1 — ADMIN COMMAND CENTER (read-only overview)
// ----------------------------------------------------------------------------
// Everything below is READ-ONLY aggregation over existing tables.
// No destructive actions, no payment/booking writes, no RLS bypass.
// Payments are read through normal RLS; if the additive admin SELECT policy
// from db/rls/payments_admin_select.sql has not been applied yet, the payments
// sections degrade gracefully to an empty state.
// ============================================================================

/** A payment row enriched for the admin finance view (read-only). */
export interface AdminPaymentRow {
  payment: Payment;
  booking_status: string | null;
  service_title: string | null;
  customer_name: string;
  provider_business_name: string;
}

export interface AdminRecentBooking {
  id: string;
  customer_name: string;
  provider_business_name: string;
  service_title: string | null;
  amount: number;
  status: string;
  date: string;
}

export interface AdminRecentRequest {
  id: string;
  title: string;
  customer_name: string;
  category: string | null;
  budget_min: number | null;
  budget_max: number | null;
  created_at: string;
}

export interface AdminRequestNotificationRow {
  id: string;
  request_id: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
}

/** A single operational item on the command center that may need attention. */
export interface AdminAttentionItem {
  id: string;
  kind: 'verification' | 'dispute' | 'payment' | 'escrow' | 'support';
  title: string;
  detail: string;
  count: number;
  tone: 'danger' | 'warning' | 'info' | 'neutral';
}

/** Head-line counters shown as cards at the top of the command center. */
export interface AdminOverviewSummary {
  totalUsers: number;
  customers: number;
  providers: number;
  verifiedProviders: number;
  activeServices: number;
  openRequests: number;
  totalRequests: number;
  activeBookings: number;
  pendingOffers: number;
  totalOffers: number;
  /**
   * The four finance figures below are `null` while the additive admin SELECT
   * policy hasn't been applied — the UI shows "Not available" instead of
   * inventing a number. `paymentsAvailable` tells the UI which case it is.
   */
  completedTransactions: number | null;
  platformFees: number | null;
  escrowFunds: number | null;
  refundedFunds: number | null;
  currency: string;
  paymentsAvailable: boolean;
}

/** The read-only payload behind the admin command center. */
export interface AdminOverview {
  summary: AdminOverviewSummary;
  recentBookings: AdminRecentBooking[];
  recentTransactions: AdminPaymentRow[];
  recentRequests: AdminRecentRequest[];
  attention: AdminAttentionItem[];
  /** Open / awaiting-review disputes, newest first (read-only). */
  disputes: DisputeWithNames[];
  requestNotifications: AdminRequestNotificationRow[];
  /** The admin's own notifications (existing notifications table, read-only). */
  notifications: Notification[];
  unreadNotifications: number;
  paymentsAvailable: boolean;
  /** Human-readable notes about sections that could not be fully loaded. */
  warnings: string[];
  generatedAt: string;
}

/** Fetch all payments visible to the admin (subject to RLS), enriched. */
export async function getAllPaymentsForAdmin(limit = 60): Promise<AdminPaymentRow[]> {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching payments for admin:', error);
      return [];
    }

    const payments = (data || []) as Payment[];
    if (!payments.length) return [];

    const bookingIds = [...new Set(payments.map((p) => p.booking_id).filter(Boolean))];
    const providerIds = [...new Set(payments.map((p) => p.provider_id).filter(Boolean))];
    const customerIds = [...new Set(payments.map((p) => p.customer_id).filter(Boolean))];

    const [bookingsRes, providers, customerProfiles] = await Promise.all([
      bookingIds.length
        ? supabase.from('bookings').select('id, status, service_id').in('id', bookingIds)
        : Promise.resolve({ data: [], error: null } as { data: any[] | null; error: any }),
      providerLookup(providerIds),
      profileLookup(customerIds),
    ]);

    const bookingMap = Object.fromEntries(
      ((bookingsRes.data || []) as Array<{ id: string; status: string; service_id: string }>).map(
        (b) => [b.id, b],
      ),
    );

    const serviceIds = [
      ...new Set(
        Object.values(bookingMap)
          .map((b) => b.service_id)
          .filter(Boolean) as string[],
      ),
    ];

    let serviceMap: Record<string, { title: string }> = {};
    if (serviceIds.length) {
      const { data: services } = await supabase
        .from('services')
        .select('id, title')
        .in('id', serviceIds);
      serviceMap = Object.fromEntries((services || []).map((s: any) => [s.id, s]));
    }

    return payments.map((p) => {
      const booking = bookingMap[p.booking_id] || ({} as any);
      return {
        payment: p,
        booking_status: booking.status ?? null,
        service_title: booking.service_id ? serviceMap[booking.service_id]?.title ?? null : null,
        customer_name: customerProfiles[p.customer_id]?.full_name || '—',
        provider_business_name: providers[p.provider_id]?.business_name || '—',
      };
    });
  } catch (error) {
    console.error('Exception fetching payments for admin:', error);
    return [];
  }
}

/** How many rows each recent-activity list on the command center shows. */
const OVERVIEW_RECENT_LIMIT = 8;
const OVERVIEW_NOTIFICATION_LIMIT = 6;

/** Resolve service ids into a { id -> { title } } lookup. */
async function serviceLookup(
  serviceIds: string[],
): Promise<Record<string, { title: string }>> {
  const ids = [...new Set(serviceIds.filter(Boolean))];
  if (!ids.length) return {};
  const { data, error } = await supabase
    .from('services')
    .select('id, title')
    .in('id', ids);
  if (error) {
    console.error('Error fetching services for admin lookup:', error);
    return {};
  }
  return Object.fromEntries((data || []).map((s: any) => [s.id, s as { title: string }]));
}

/** Newest bookings with customer/provider/service context (read-only). */
async function fetchRecentBookings(limit: number): Promise<AdminRecentBooking[]> {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching recent bookings for admin:', error);
      return [];
    }

    const bookings = (data || []) as Booking[];
    if (!bookings.length) return [];

    const [customerProfiles, providers, services] = await Promise.all([
      profileLookup([...new Set(bookings.map((b) => b.customer_id).filter(Boolean))]),
      providerLookup([...new Set(bookings.map((b) => b.provider_id).filter(Boolean))]),
      serviceLookup(bookings.map((b) => b.service_id)),
    ]);

    return bookings.map((b) => ({
      id: b.id,
      customer_name: customerProfiles[b.customer_id]?.full_name || '—',
      provider_business_name: providers[b.provider_id]?.business_name || '—',
      service_title: b.service_id ? services[b.service_id]?.title ?? null : null,
      amount: Number(b.total_amount) || 0,
      status: b.status,
      date: b.created_at,
    }));
  } catch (error) {
    console.error('Exception fetching recent bookings for admin:', error);
    return [];
  }
}

/** Newest service requests with the customer's name (read-only). */
async function fetchRecentRequests(limit: number): Promise<AdminRecentRequest[]> {
  try {
    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching recent requests for admin:', error);
      return [];
    }

    const requests = (data || []) as CustomerRequest[];
    if (!requests.length) return [];

    const profiles = await profileLookup(
      [...new Set(requests.map((r) => r.customer_id).filter(Boolean))],
    );

    return requests.map((r) => ({
      id: r.id,
      title: r.title,
      customer_name: profiles[r.customer_id]?.full_name || '—',
      category: r.category ?? null,
      budget_min: r.budget_min ?? null,
      budget_max: r.budget_max ?? null,
      created_at: r.created_at,
    }));
  } catch (error) {
    console.error('Exception fetching recent requests for admin:', error);
    return [];
  }
}

/**
 * Recent provider-request notification activity (the existing
 * `request_notifications` table already grants admin SELECT — see
 * db/rls/request_notifications.sql). Used as the "support/operational activity"
 * feed. Purely read-only; the provider-requests notification system is not
 * touched.
 */
async function fetchRecentRequestNotifications(
  limit: number,
): Promise<AdminRequestNotificationRow[]> {
  try {
    const { data, error } = await supabase
      .from('request_notifications')
      .select('id, request_id, subject, message, status, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching request notifications for admin:', error);
      return [];
    }

    return (data || []) as AdminRequestNotificationRow[];
  } catch (error) {
    console.error('Exception fetching request notifications for admin:', error);
    return [];
  }
}

/**
 * PHASE 1 — the admin command center payload.
 *
 * READ-ONLY. Every figure below is derived from existing tables through normal
 * RLS: nothing is written, no payment/booking/escrow logic is invoked, and no
 * RLS policy is bypassed. Sections backed by `payments` degrade to `null`
 * (rendered as "Not available") until the additive admin SELECT policy in
 * db/rls/payments_admin_select.sql has been applied.
 *
 * `adminUserId` is optional — it is only used to read the admin's own
 * notification preview through the existing notifications service.
 */
export async function getAdminOverview(adminUserId?: string): Promise<AdminOverview> {
  const warnings: string[] = [];

  try {
    const [
      profilesRes,
      customersRes,
      providersRes,
      verifiedProvidersRes,
      activeServicesRes,
      offersRes,
      activeBookingsRes,
      requestsRes,
      paymentsRes,
      disputes,
      recentBookings,
      recentRequests,
      recentTransactions,
      requestNotifications,
    ] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'customer'),
      supabase.from('providers').select('id', { count: 'exact', head: true }),
      supabase
        .from('providers')
        .select('id', { count: 'exact', head: true })
        .eq('verified', true),
      supabase
        .from('services')
        .select('id', { count: 'exact', head: true })
        .eq('active', true),
      // `offers.status` can be NULL for a brand-new offer, so the rows are read
      // and counted in JS instead of filtering in SQL (same approach as the
      // existing getAdminStats()).
      supabase.from('offers').select('id, status, request_id'),
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .in('status', ['pending', 'confirmed', 'in_progress']),
      // `requests` has no status column: "open" is derived from offer state.
      supabase.from('requests').select('id'),
      // Only readable once db/rls/payments_admin_select.sql is applied.
      supabase.from('payments').select('id, amount, platform_fee, payment_status, currency'),
      getAllDisputesForAdmin(),
      fetchRecentBookings(OVERVIEW_RECENT_LIMIT),
      fetchRecentRequests(OVERVIEW_RECENT_LIMIT),
      getAllPaymentsForAdmin(OVERVIEW_RECENT_LIMIT),
      fetchRecentRequestNotifications(5),
    ]);

    // ----------------------------------------------------------------
    // Warnings + summary totals
    // ----------------------------------------------------------------
    if (profilesRes.error || customersRes.error) {
      warnings.push('User accounts could not be counted.');
    }
    if (providersRes.error || verifiedProvidersRes.error) {
      warnings.push('Provider counts could not be loaded.');
    }
    if (activeServicesRes.error) {
      warnings.push('Active services could not be counted.');
    }
    if (offersRes.error || requestsRes.error) {
      warnings.push('Request and offer activity could not be loaded.');
    }
    if (activeBookingsRes.error) {
      warnings.push('Active bookings could not be counted.');
    }

    const totalProviders = providersRes.error ? 0 : providersRes.count ?? 0;
    const verifiedProviders = verifiedProvidersRes.error ? 0 : verifiedProvidersRes.count ?? 0;

    const offers = (offersRes.data || []) as Array<{
      id: string;
      status: string | null;
      request_id: string;
    }>;
    const pendingOffers = offers.filter((o) => (o.status || 'pending') === 'pending').length;

    // A request stays "open" until one of its offers is accepted — acceptance is
    // what creates the booking and the escrow payment.
    const acceptedRequestIds = new Set(
      offers.filter((o) => o.status === 'accepted').map((o) => o.request_id).filter(Boolean),
    );
    const requestRows = (requestsRes.data || []) as Array<{ id: string }>;
    const openRequests = requestRows.filter((r) => !acceptedRequestIds.has(r.id)).length;

    // ----------------------------------------------------------------
    // Finance (payments) — degrades safely when RLS blocks admin reads
    // ----------------------------------------------------------------
    const paymentsAvailable = !paymentsRes.error;
    const paymentRows = (paymentsRes.data || []) as Array<{
      id: string;
      amount: number;
      platform_fee: number;
      payment_status: string;
      currency: string | null;
    }>;

    let completedTransactions: number | null = null;
    let platformFees: number | null = null;
    let escrowFunds: number | null = null;
    let refundedFunds: number | null = null;
    let failedPayments: number | null = null;
    let escrowedPayments: number | null = null;
    let currency = 'UGX';

    if (!paymentsAvailable) {
      warnings.push(
        'Payment records are not readable yet — apply db/rls/payments_admin_select.sql to enable the finance figures.',
      );
    } else {
      const sumOf = (rows: typeof paymentRows, key: 'amount' | 'platform_fee') =>
        rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);

      const released = paymentRows.filter((p) => p.payment_status === 'released');
      const escrowed = paymentRows.filter((p) => p.payment_status === 'escrowed');
      const failed = paymentRows.filter((p) => p.payment_status === 'failed');
      const refunded = paymentRows.filter((p) => p.payment_status === 'refunded');

      completedTransactions = released.length;
      platformFees = sumOf(released, 'platform_fee');
      escrowFunds = sumOf(escrowed, 'amount');
      refundedFunds = sumOf(refunded, 'amount');
      failedPayments = failed.length;
      escrowedPayments = escrowed.length;
      currency = paymentRows.find((p) => p.currency)?.currency || 'UGX';
    }

    // ----------------------------------------------------------------
    // Operational attention items (read-only — no action buttons)
    // ----------------------------------------------------------------
    const unverifiedProviders = Math.max(totalProviders - verifiedProviders, 0);
    const openDisputes = disputes.filter(
      (d) => d.status === 'open' || d.status === 'provider_responded',
    );

    const attention: AdminAttentionItem[] = [];

    if (unverifiedProviders > 0) {
      attention.push({
        id: 'pending-verification',
        kind: 'verification',
        tone: 'warning',
        title: `${unverifiedProviders} provider${unverifiedProviders === 1 ? '' : 's'} awaiting verification`,
        detail: 'Review the provider profile before granting the verified badge.',
        count: unverifiedProviders,
      });
    }

    if (openDisputes.length) {
      attention.push({
        id: 'open-disputes',
        kind: 'dispute',
        tone: 'danger',
        title: `${openDisputes.length} open dispute${openDisputes.length === 1 ? '' : 's'}`,
        detail: 'Escrowed funds stay frozen until an administrator adjudicates.',
        count: openDisputes.length,
      });
    }

    if (failedPayments) {
      attention.push({
        id: 'failed-payments',
        kind: 'payment',
        tone: 'danger',
        title: `${failedPayments} failed payment${failedPayments === 1 ? '' : 's'}`,
        detail: 'The customer was not charged, so no escrow was created.',
        count: failedPayments,
      });
    }

    if (escrowedPayments) {
      attention.push({
        id: 'escrowed-payments',
        kind: 'escrow',
        tone: 'info',
        title: `${escrowedPayments} payment${escrowedPayments === 1 ? '' : 's'} held in escrow`,
        detail: 'NINJAWO is holding these funds until the customer confirms completion.',
        count: escrowedPayments,
      });
    }

    if (requestNotifications.length) {
      attention.push({
        id: 'request-activity',
        kind: 'support',
        tone: 'neutral',
        title: `${requestNotifications.length} recent provider request notification${requestNotifications.length === 1 ? '' : 's'}`,
        detail: 'Providers were notified about newly posted customer requests.',
        count: requestNotifications.length,
      });
    }

    // ----------------------------------------------------------------
    // Admin notification preview (existing notifications service)
    // ----------------------------------------------------------------
    let notifications: Notification[] = [];
    if (adminUserId) {
      const adminNotifications = await getUserNotifications(adminUserId);
      notifications = adminNotifications.slice(0, OVERVIEW_NOTIFICATION_LIMIT);
    }

    return {
      summary: {
        totalUsers: profilesRes.error ? 0 : profilesRes.count ?? 0,
        customers: customersRes.error ? 0 : customersRes.count ?? 0,
        providers: totalProviders,
        verifiedProviders,
        activeServices: activeServicesRes.error ? 0 : activeServicesRes.count ?? 0,
        openRequests,
        totalRequests: requestRows.length,
        activeBookings: activeBookingsRes.error ? 0 : activeBookingsRes.count ?? 0,
        pendingOffers,
        totalOffers: offers.length,
        completedTransactions,
        platformFees,
        escrowFunds,
        refundedFunds,
        currency,
        paymentsAvailable,
      },
      recentBookings,
      recentTransactions,
      recentRequests,
      attention,
      disputes: openDisputes.slice(0, 5),
      requestNotifications,
      notifications,
      unreadNotifications: notifications.filter((n) => !n.is_read).length,
      paymentsAvailable,
      warnings,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Exception building the admin overview:', error);
    throw error instanceof Error
      ? error
      : new Error('Failed to load the admin overview.');
  }
}
