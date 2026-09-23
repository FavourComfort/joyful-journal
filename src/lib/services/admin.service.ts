// PHASE 4C — Payouts discovery (2026-09-18):
// Provider payout execution does NOT exist. Verified: no payouts/withdrawals
// table; live `providers` stores no payout destination; MarzPay usage in the
// Edge Functions is collection-only (no transfer/disbursement); escrow
// `release_escrow_to_provider` only sets payments.payment_status='released'
// (a DB status change, not a money transfer). Admin payouts page is a truthful
// read-only notice at /admin/payouts. No RLS change is needed or justified —
// there is no payout table to read.

// PHASE 4B — Wallet discovery (2026-09-18):
// No wallet/ledger/payout/withdrawal/earnings table exists in the repository SQL
// or the deployed database. Admin SELECT policies exist only for payments
// (db/rls/payments_admin_select.sql). No wallet RLS policy is therefore needed
// for Phase 4B: there is no wallet table to read. The admin wallet page is a
// truthful "no wallet data source exists yet" notice; when a real wallet/ledger
// system is introduced, add a narrow admin-only SELECT policy here, mirroring
// the additive SELECT-only pattern of payments_admin_select.sql.

import { supabase } from '../supabase';
import type { Provider } from './providers.service';
import type { Profile } from './auth.service';
import type { Booking } from './bookings.service';
import type { Service } from './services.service';
import type { Review } from './reviews.service';
import type { Payment } from './payments.service';
import type { CustomerRequest, ProviderOffer } from './requests.service';
import { getAllDisputesForAdmin, type DisputeWithNames, type Dispute } from './disputes.service';
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
/* ==========================================================================
 * PHASE 5A — READ-ONLY Admin Reviews directory.
 * Strictly read-only: paginated `reviews` SELECT + bounded enrichment
 * (profiles / providers / bookings lookups). The dormant mutation helpers
 * (deleteReviewPermanently etc.) are deliberately NOT wired into any UI.
 * ========================================================================== */

/** Real columns of public.reviews (db RLS + reviews.service.ts contract). */
export interface AdminReviewRow extends Review {
  /** Reviewers profile full_name, resolved by bounded lookup (null if unavailable). */
  customer_name: string | null;
  customer_phone: string | null;
  /** Owning providers business_name, resolved by bounded lookup (null if unavailable). */
  business_name: string | null;
  /** Resolved booking context for the review (null if the booking is missing). */
  booking_status: string | null;
  booking_date: string | null;
  /** Human label of the reviewed service, resolved via booking -> service (null if unavailable). */
  service_title: string | null;
}

export interface AdminReviewsPage {
  rows: AdminReviewRow[];
  total: number;
  page: number;
  pageSize: number;
  /** True when related profile/provider/booking lookups failed (rows still shown). */
  contextError: boolean;
  /** Distinct ratings present in the loaded window (for the rating filter). */
  ratings: number[];
}

export interface AdminReviewsQuery {
  search?: string;
  /** Exact stored rating value (1..5); empty/undefined = no rating filter. */
  rating?: string;
  page?: number;
}

/** Matches the established 12-per-page Admin directory convention. */
export const ADMIN_REVIEWS_PAGE_SIZE = 12;

/** Bounded lookup: booking ids -> { booking, service_title } (service joined in JS). */
async function reviewBookingLookup(
  bookingIds: string[],
): Promise<{ byId: Record<string, { status: string | null; booking_date: string | null; service_id: string | null }>; serviceTitles: Record<string, string> }> {
  if (!bookingIds.length) return { byId: {}, serviceTitles: {} };
  const { data, error } = await supabase
    .from('bookings')
    .select('id, status, booking_date, service_id')
    .in('id', bookingIds);
  if (error) {
    console.error('Error fetching bookings for admin review lookup:', error);
    return { byId: {}, serviceTitles: {} };
  }
  const bookings = (data || []) as Array<{ id: string; status: string | null; booking_date: string | null; service_id: string | null }>;
  const serviceIds = [...new Set(bookings.map((b) => b.service_id).filter((v): v is string => Boolean(v)))];
  let serviceTitles: Record<string, string> = {};
  if (serviceIds.length) {
    const { data: services, error: svcError } = await supabase
      .from('services')
      .select('id, title')
      .in('id', serviceIds);
    if (svcError) {
      console.error('Error fetching services for admin review lookup:', svcError);
    } else {
      serviceTitles = Object.fromEntries(((services || []) as Array<{ id: string; title: string }>).map((s) => [s.id, s.title]));
    }
  }
  return {
    byId: Object.fromEntries(bookings.map((b) => [b.id, { status: b.status, booking_date: b.booking_date, service_id: b.service_id }])),
    serviceTitles,
  };
}
/**
 * PHASE 5A — Read-only admin reviews directory with search / rating filter /
 * pagination. One paginated `reviews` query with exact count, then bounded
 * batched lookups (profiles, providers, bookings -> services) joined in JS, so
 * there is never an N+1 per review. Throws on query failure (RLS blocked /
 * network) so the page can show a real error state instead of a fake empty
 * list. NO mutation calls; the dormant delete helper stays dormant.
 */
export async function getReviewsForAdmin(query: AdminReviewsQuery = {}): Promise<AdminReviewsPage> {
  const pageSize = ADMIN_REVIEWS_PAGE_SIZE;
  const page = Number.isSafeInteger(query.page) && query.page! > 0 ? query.page! : 1;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    let request = supabase
      .from('reviews')
      .select('id, booking_id, customer_id, provider_id, rating, comment, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);

    const search = sanitizeSearchTerm(query.search);
    if (search) {
      // Comment text OR exact review UUID in one PostgREST `or` filter.
      request = request.or(`comment.ilike.%${search}%,id.eq.${search}`);
    }
    if (query.rating === '1' || query.rating === '2' || query.rating === '3' || query.rating === '4' || query.rating === '5') {
      request = request.eq('rating', Number(query.rating));
    }

    const { data, error, count } = await request;
    if (error) {
      // Deep-linking or paging past the end returns 416 / PGRST103 — recover from page 1.
      if (error.code === 'PGRST103' || /range not satisfiable/i.test(error.message ?? '')) {
        if (page > 1) return getReviewsForAdmin({ ...query, page: 1 });
        return { rows: [], total: 0, page: 1, pageSize, contextError: false, ratings: [] };
      }
      console.error('Error fetching reviews for admin:', error);
      throw new Error(
        error.code === '42501' || /row-level security/i.test(error.message)
          ? 'The reviews directory is blocked by row-level security. Ask a project owner to confirm the admin review policies are applied.'
          : 'The reviews directory could not be loaded.',
      );
    }

    const reviews = (data || []) as Review[];
    const customerIds = [...new Set(reviews.map((r) => r.customer_id).filter(Boolean))];
    const providerIds = [...new Set(reviews.map((r) => r.provider_id).filter(Boolean))];
    const bookingIds = [...new Set(reviews.map((r) => r.booking_id).filter(Boolean))];

    const [customerProfiles, providers, bookingInfo] = await Promise.all([
      profileLookup(customerIds),
      providerLookup(providerIds),
      reviewBookingLookup(bookingIds),
    ]);

    const rows: AdminReviewRow[] = reviews.map((r) => {
      const booking = bookingInfo.byId[r.booking_id];
      return {
        ...r,
        customer_name: customerProfiles[r.customer_id]?.full_name ?? null,
        customer_phone: customerProfiles[r.customer_id]?.phone ?? null,
        business_name: providers[r.provider_id]?.business_name ?? null,
        booking_status: booking?.status ?? null,
        booking_date: booking?.booking_date ?? null,
        service_title: booking?.service_id ? bookingInfo.serviceTitles[booking.service_id] ?? null : null,
      };
    });

    return {
      rows,
      total: count ?? rows.length,
      page,
      pageSize,
      contextError: false,
      ratings: [],
    };
  } catch (error) {
    if (error instanceof Error && /row-level security|could not be loaded/.test(error.message)) throw error;
    console.error('Exception fetching reviews for admin:', error);
    throw new Error('The reviews directory could not be loaded.');
  }
}
/* ==========================================================================
 * PHASE 5B — READ-ONLY Admin Disputes directory.
 * Strictly read-only: paginated `disputes` SELECT + bounded enrichment. The
 * dispute RPC mutations (raise/respond/adjudicate/close) are NOT imported or
 * wired here. The pre-existing unbounded getAllDisputesForAdmin() used by the
 * dashboard overview is left untouched.
 * ========================================================================== */

/** Matches the established 12-per-page Admin directory convention. */
export const ADMIN_DISPUTES_PAGE_SIZE = 12;
/** Real CHECK values from public.disputes.status (db/disputes.sql). */
export const ADMIN_DISPUTE_STATUSES = ['open', 'provider_responded', 'resolved_customer', 'resolved_provider', 'closed'] as const;
/** Real CHECK values from public.disputes.reason (db/disputes.sql). */
export const ADMIN_DISPUTE_REASONS = ['service_not_delivered', 'service_not_as_described', 'other'] as const;
/** Related-row search bound — matches the established Admin pattern. */
const ADMIN_DISPUTE_SEARCH_BOUND = 100;

export interface AdminDisputeRow extends Dispute {
  customer_name: string | null;
  provider_business_name: string | null;
  booking_amount: number | null;
}

export interface AdminDisputesQuery {
  search?: string;
  status?: string;
  reason?: string;
  page?: number;
}

export interface AdminDisputesPage {
  rows: AdminDisputeRow[];
  total: number;
  page: number;
  pageSize: number;
  /** True when the booking lookup failed (rows still shown). */
  contextError: boolean;
}

/**
 * PHASE 5B — Read-only admin disputes directory with search / status filter /
 * reason filter / pagination. Related-identity search uses bounded id lookups
 * (cap ADMIN_DISPUTE_SEARCH_BOUND) and throws a truthful "narrow your search"
 * error instead of silently truncating. Enrichment is batched (profiles,
 * providers, bookings) — never N+1. Throws on query failure so the page shows a
 * real error state instead of a fake empty list. NO mutation/RPC calls; the
 * dispute RPC mutations stay unwired.
 */
export async function getDisputesForAdmin(query: AdminDisputesQuery = {}): Promise<AdminDisputesPage> {
  const pageSize = ADMIN_DISPUTES_PAGE_SIZE;
  const page = Number.isSafeInteger(query.page) && query.page! > 0 ? query.page! : 1;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    // Bounded related-identity search: customer ids, provider ids, booking/dispute uuid.
    let orFilter: string | null = null;
    const search = sanitizeSearchTerm(query.search);
    if (search) {
      const [customers, providers] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact' }).ilike('full_name', `%${search}%`).limit(ADMIN_DISPUTE_SEARCH_BOUND + 1),
        supabase.from('providers').select('id', { count: 'exact' }).ilike('business_name', `%${search}%`).limit(ADMIN_DISPUTE_SEARCH_BOUND + 1),
      ]);
      if (customers.error || providers.error) throw new Error('The disputes directory could not be loaded.');
      const customerIds = (customers.data || []).map((r) => r.id);
      const providerIds = (providers.data || []).map((r) => r.id);
      if ((customers.count ?? customerIds.length) > ADMIN_DISPUTE_SEARCH_BOUND || (providers.count ?? providerIds.length) > ADMIN_DISPUTE_SEARCH_BOUND) {
        throw new Error('Search matched too many customers or providers. Please narrow your search.');
      }
      const clauses: string[] = [];
      if (customerIds.length) clauses.push(`customer_id.in.(${customerIds.join(',')})`);
      if (providerIds.length) clauses.push(`provider_id.in.(${providerIds.join(',')})`);
      // Booking reference / dispute id search when the term is a uuid.
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search)) {
        clauses.push(`booking_id.eq.${search}`);
        clauses.push(`id.eq.${search}`);
      }
      if (!clauses.length) return { rows: [], total: 0, page: 1, pageSize, contextError: false };
      orFilter = clauses.join(',');
    }

    let request = supabase
      .from('disputes')
      .select('id, booking_id, customer_id, provider_id, reason, description, status, provider_response, admin_notes, decision, raised_at, responded_at, resolved_at, updated_at', { count: 'exact' })
      .order('raised_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);
    if (orFilter) request = request.or(orFilter);
    if (ADMIN_DISPUTE_STATUSES.some((value) => value === query.status)) request = request.eq('status', query.status as string);
    if (ADMIN_DISPUTE_REASONS.some((value) => value === query.reason)) request = request.eq('reason', query.reason as string);

    const { data, error, count } = await request;
    if (error) {
      // Deep-linking or paging past the end returns 416 / PGRST103 — recover from page 1.
      if (error.code === 'PGRST103' || /range not satisfiable/i.test(error.message ?? '')) {
        if (page > 1) return getDisputesForAdmin({ ...query, page: 1 });
        return { rows: [], total: 0, page: 1, pageSize, contextError: false };
      }
      console.error('Error fetching disputes for admin:', error);
      throw new Error(
        error.code === '42501' || /row-level security/i.test(error.message)
          ? 'The disputes directory is blocked by row-level security. Ask a project owner to confirm the admin dispute policies are applied.'
          : 'The disputes directory could not be loaded.',
      );
    }

    const disputes = (data || []) as Dispute[];
    const customerIds = [...new Set(disputes.map((d) => d.customer_id).filter(Boolean))];
    const providerIds = [...new Set(disputes.map((d) => d.provider_id).filter(Boolean))];
    const bookingIds = [...new Set(disputes.map((d) => d.booking_id).filter(Boolean))];

    const [customerProfiles, providers, bookings] = await Promise.all([
      profileLookup(customerIds),
      providerLookup(providerIds),
      bookingIds.length
        ? supabase.from('bookings').select('id, total_amount').in('id', bookingIds)
        : Promise.resolve({ data: [] as Array<{ id: string; total_amount: number }>, error: null }),
    ]);
    const contextError = Boolean(bookings.error);
    const bookingAmountById = Object.fromEntries(
      ((bookings.data || []) as Array<{ id: string; total_amount: number }>).map((b) => [b.id, Number(b.total_amount) || 0]),
    );

    const rows: AdminDisputeRow[] = disputes.map((d) => ({
      ...d,
      customer_name: customerProfiles[d.customer_id]?.full_name ?? null,
      provider_business_name: providers[d.provider_id]?.business_name ?? null,
      booking_amount: bookingAmountById[d.booking_id] ?? null,
    }));

    return { rows, total: count ?? rows.length, page, pageSize, contextError };
  } catch (error) {
    if (error instanceof Error && /row-level security|narrow your search|could not be loaded/.test(error.message)) throw error;
    console.error('Exception fetching disputes for admin:', error);
    throw new Error('The disputes directory could not be loaded.');
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
// ============================================================================
// PHASE 2A — USERS MANAGEMENT (read-only user directory)
// ----------------------------------------------------------------------------
// Paginated, searchable, role-filterable list of every profile, enriched with
// the owning provider row where one exists. READ-ONLY: no mutations, no
// auth.users access (email is not available through the anon-key client — the
// contact column shows the profile phone). Access is governed by the existing
// additive "Profiles select for admin" policy in db/rls/admin_moderation.sql;
// explicit database errors are surfaced without bypassing RLS. SELECT policies
// can also silently filter rows; this client cannot detect a missing policy.
// ============================================================================

/** One row on the admin Users table (profile + provider context). */
export interface AdminUserRow {
  id: string;
  full_name: string;
  phone: string | null;
  role: 'customer' | 'provider' | 'admin';
  avatar_url: string | null;
  created_at: string;
  /** Present only when the user owns a provider account. */
  provider_id: string | null;
  business_name: string | null;
  verified: boolean | null;
}

export interface AdminUsersPage {
  rows: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
  /**
   * True when the provider enrichment fetch failed. Rows and totals are still
   * returned, but the admin is told provider/business context is incomplete.
   */
  providerContextError?: boolean;
}

export interface AdminUsersQuery {
  search?: string;
  role?: AdminRole | '';
  page?: number;
  pageSize?: number;
}

export const ADMIN_USERS_PAGE_SIZE = 12;

/**
 * Normalise a free-text search term before it is placed inside a PostgREST
 * `or(...)` filter. Characters that have meaning in the filter grammar
 * (`,` `(` `)` `%` `*` `\`) are replaced with spaces so a stray character can
 * never reshape the query, and the term is length-capped.
 */
function sanitizeSearchTerm(value?: string): string {
  return (value ?? '')
    .replace(/[,()%*\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/**
 * Read-only admin users directory with search / role filter / pagination.
 *
 * One paginated `profiles` query plus ONE follow-up `providers` fetch for the
 * provider users on the page (joined in JS by `providers.user_id` — the same
 * proven pattern as `profileLookup`), so there is never an N+1 per user.
 *
 * Throws on error (RLS blocked / network) so the page can surface a clear
 * admin-facing message instead of silently showing an empty directory.
 */
export async function getAllUsersForAdmin(query: AdminUsersQuery = {}): Promise<AdminUsersPage> {
  const page = Number.isFinite(query.page) ? Math.max(1, Math.floor(query.page!)) : 1;
  const pageSize = Number.isFinite(query.pageSize)
    ? Math.min(50, Math.max(5, Math.floor(query.pageSize!)))
    : ADMIN_USERS_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    let request = supabase
      .from('profiles')
      .select('id, full_name, phone, role, avatar_url, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      // Secondary key keeps page boundaries stable when timestamps collide.
      .order('id', { ascending: true })
      .range(from, to);

    const search = sanitizeSearchTerm(query.search);
    if (search) {
      // Search across name and phone in one PostgREST `or` filter.
      request = request.or(
        `full_name.ilike.%${search}%,phone.ilike.%${search}%`,
      );
    }
    if (query.role === 'customer' || query.role === 'provider' || query.role === 'admin') {
      request = request.eq('role', query.role);
    }

    const { data, error, count } = await request;
    if (error) {
      // Deep-linking or paging past the end of the data returns 416 / PGRST103.
      // Retry once from page 1 rather than showing an error for a harmless case.
      if (error.code === 'PGRST103' || /range not satisfiable/i.test(error.message ?? '')) {
        if (page > 1) return getAllUsersForAdmin({ ...query, page: 1 });
        return { rows: [], total: 0, page: 1, pageSize, providerContextError: false };
      }
      console.error('Error fetching users for admin:', error);
      throw new Error(
        error.code === '42501' || /row-level security/i.test(error.message)
          ? 'The users directory is blocked by row-level security. Ask a project owner to confirm the "Profiles select for admin" policy is applied.'
          : 'The users directory could not be loaded.',
      );
    }

    const profiles = (data || []) as Array<
      Pick<AdminUserRow, 'id' | 'full_name' | 'phone' | 'role' | 'avatar_url' | 'created_at'>
    >;

    // Enrich provider users with their provider row — a single fetch, never N+1.
    const providerUserIds = profiles
      .filter((p) => p.role === 'provider')
      .map((p) => p.id);

    let providersByUserId: Record<
      string,
      { provider_id: string; business_name: string; verified: boolean }
    > = {};
    let providerContextError = false;
    if (providerUserIds.length) {
      const { data: providerRows, error: providersError } = await supabase
        .from('providers')
        .select('id, user_id, business_name, verified')
        .in('user_id', providerUserIds);

      if (providersError) {
        // Non-fatal: provider context is decoration, the directory still shows.
        // The flag tells the admin the Provider column is incomplete.
        console.error('Error fetching provider context for admin users:', providersError);
        providerContextError = true;
      } else {
        providersByUserId = Object.fromEntries(
          ((providerRows || []) as Array<{
            id: string;
            user_id: string;
            business_name: string;
            verified: boolean;
          }>).map((p) => [
            p.user_id,
            { provider_id: p.id, business_name: p.business_name, verified: p.verified },
          ]),
        );
      }
    }

    return {
      rows: profiles.map((p) => {
        const provider = providersByUserId[p.id];
        return {
          ...p,
          phone: p.phone ?? null,
          avatar_url: p.avatar_url ?? null,
          provider_id: provider?.provider_id ?? null,
          business_name: provider?.business_name ?? null,
          verified: provider?.verified ?? null,
        };
      }),
      total: count ?? profiles.length,
      page,
      pageSize,
      providerContextError,
    };
  } catch (error) {
    if (error instanceof Error) throw error;
    console.error('Exception fetching users for admin:', error);
    throw new Error('The users directory could not be loaded.');
  }
}

// ============================================================================
// PHASE 2B — PROVIDERS MANAGEMENT (read-only provider directory)
// ----------------------------------------------------------------------------
// Paginated, searchable, filterable list of every provider row, enriched with
// the owning profile (name / phone / avatar) via ONE follow-up profiles fetch.
// READ-ONLY: no verification toggles here — `setProviderVerified` remains the
// only provider mutation and is untouched. Access is governed by the existing
// additive "Providers select for admin" policy in db/rls/admin_moderation.sql;
// if it is missing the query fails with a clear error instead of bypassing RLS.
//
// The only real provider state in the schema is `verified` (boolean) plus an
// owner `rating`. There is NO suspension / ban / active column, so no such
// status is displayed or invented.
// ============================================================================

export type AdminProviderVerification = 'verified' | 'pending';

/** One row on the admin Providers table (provider row + owner contact). */
export interface AdminProviderRow {
  id: string;
  user_id: string;
  business_name: string;
  location: string | null;
  rating: number;
  verified: boolean;
  created_at: string;
  profile_picture_url: string | null;
  /** Owner profile context (null when the profile could not be resolved). */
  owner_name: string | null;
  owner_phone: string | null;
  owner_avatar_url: string | null;
}

export interface AdminProvidersPage {
  rows: AdminProviderRow[];
  total: number;
  page: number;
  pageSize: number;
  /** True when the owner-profile enrichment fetch failed. Rows stay usable. */
  ownerContextError?: boolean;
  /**
   * True when the free-text search matched more owner profiles than can be
   * folded into a single filter window, so owner-name/phone matches may be
   * incomplete for that term.
   */
  ownerSearchTruncated?: boolean;
}

export interface AdminProvidersQuery {
  search?: string;
  verification?: AdminProviderVerification | '';
  page?: number;
  pageSize?: number;
}

export const ADMIN_PROVIDERS_PAGE_SIZE = 12;

/** Owner profiles folded into one search filter (keeps the request URL small). */
const ADMIN_PROVIDER_OWNER_SEARCH_LIMIT = 100;

/**
 * Read-only admin provider directory with search / verification filter /
 * pagination.
 *
 * Query budget per page view: ONE paginated `providers` query (+ ONE capped
 * `profiles` lookup when a search term is present) + ONE owner-profile
 * enrichment fetch — never one query per row.
 *
 * Throws on error (RLS blocked / network) so the page can surface a clear
 * admin-facing message instead of silently showing an empty directory.
 */
export async function getProvidersForAdmin(
  query: AdminProvidersQuery = {},
): Promise<AdminProvidersPage> {
  const page = Number.isFinite(query.page) ? Math.max(1, Math.floor(query.page!)) : 1;
  const pageSize = Number.isFinite(query.pageSize)
    ? Math.min(50, Math.max(5, Math.floor(query.pageSize!)))
    : ADMIN_PROVIDERS_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    const search = sanitizeSearchTerm(query.search);

    // Owner name / phone live on `profiles`, so resolve the matching user ids
    // first (one capped query) and fold them into the providers filter below.
    // This keeps the search fully server-side without a per-row follow-up.
    let ownerUserIds: string[] = [];
    let ownerSearchTruncated = false;
    if (search) {
      const { data: ownerRows, error: ownerError } = await supabase
        .from('profiles')
        .select('id')
        .or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`)
        .limit(ADMIN_PROVIDER_OWNER_SEARCH_LIMIT);

      if (ownerError) {
        console.error('Error searching provider owners for admin:', ownerError);
      } else {
        ownerUserIds = ((ownerRows || []) as Array<{ id: string }>).map((r) => r.id);
        ownerSearchTruncated = ownerUserIds.length >= ADMIN_PROVIDER_OWNER_SEARCH_LIMIT;
      }
    }

    let request = supabase
      .from('providers')
      .select(
        'id, user_id, business_name, location, rating, verified, created_at, profile_picture_url',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(from, to);

    if (search) {
      const filters = [
        `business_name.ilike.%${search}%`,
        `location.ilike.%${search}%`,
      ];
      if (ownerUserIds.length) filters.push(`user_id.in.(${ownerUserIds.join(',')})`);
      request = request.or(filters.join(','));
    }
    if (query.verification === 'verified') request = request.eq('verified', true);
    if (query.verification === 'pending') request = request.eq('verified', false);

    const { data, error, count } = await request;
    if (error) {
      // Deep-linking or paging past the end of the data returns 416 / PGRST103.
      // Retry once from page 1 rather than showing an error for a harmless case.
      if (error.code === 'PGRST103' || /range not satisfiable/i.test(error.message ?? '')) {
        if (page > 1) return getProvidersForAdmin({ ...query, page: 1 });
        return { rows: [], total: 0, page: 1, pageSize, ownerSearchTruncated };
      }
      console.error('Error fetching providers for admin:', error);
      throw new Error(
        error.code === '42501' || /row-level security/i.test(error.message)
          ? 'The provider directory is blocked by row-level security. Ask a project owner to confirm the "Providers select for admin" policy is applied.'
          : 'The provider directory could not be loaded.',
      );
    }

    const providers = (data || []) as Array<{
      id: string;
      user_id: string;
      business_name: string;
      location: string | null;
      rating: number;
      verified: boolean;
      created_at: string;
      profile_picture_url: string | null;
    }>;

    // Owner enrichment — ONE fetch for every owner on this page (no N+1).
    const owners = await profileLookup(
      providers.map((p) => p.user_id).filter(Boolean) as string[],
    );
    // Every provider row has an owner profile, so "asked for owners, got none
    // back" means the profiles lookup (admin SELECT policy) was rejected.
    const ownerContextError = providers.length > 0 && Object.keys(owners).length === 0;

    return {
      rows: providers.map((p) => {
        const owner = owners[p.user_id];
        return {
          id: p.id,
          user_id: p.user_id,
          business_name: p.business_name,
          location: p.location ?? null,
          rating: typeof p.rating === 'number' ? p.rating : 0,
          verified: Boolean(p.verified),
          created_at: p.created_at,
          profile_picture_url: p.profile_picture_url ?? null,
          owner_name: owner?.full_name ?? null,
          owner_phone: owner?.phone ?? null,
          owner_avatar_url: owner?.avatar_url ?? null,
        };
      }),
      total: count ?? providers.length,
      page,
      pageSize,
      ownerContextError,
      ownerSearchTruncated,
    };
  } catch (error) {
    if (error instanceof Error) throw error;
    console.error('Exception fetching providers for admin:', error);
    throw new Error('The provider directory could not be loaded.');
  }
}

// ============================================================================
// PHASE 2C — SERVICES MANAGEMENT (read-only service directory)
// ----------------------------------------------------------------------------
// Paginated, searchable, filterable list of every service row, enriched with the
// owning provider (business_name / profile_picture_url) and the provider's owner
// profile (owner name / phone / avatar) via ONE batched `providers` fetch + ONE
// `profileLookup` enrichment pass — never an N+1 per service. READ-ONLY: no
// service mutations.
//
// Live services RLS deployment cannot be inferred from repository SQL. All
// reads use the existing session and policies; no access policy is changed.
// ============================================================================

export type AdminServiceAvailability = 'active' | 'inactive';

/** One row on the admin Services table (service + provider + owner context). */
export interface AdminServiceRow {
  id: string;
  provider_id: string;
  title: string;
  description: string | null;
  category: string;
  price: number;
  duration_minutes: number | null;
  active: boolean;
  created_at: string;
  /** Provider / business context (null when the provider row is missing). */
  business_name: string | null;
  profile_picture_url: string | null;
  location: string | null;
  rating: number;
  verified: boolean | null;
  /** Owner profile context (null when the profile could not be resolved). */
  owner_name: string | null;
  owner_phone: string | null;
  owner_avatar_url: string | null;
}

export interface AdminServicesPage {
  rows: AdminServiceRow[];
  total: number;
  page: number;
  pageSize: number;
  categories: string[];
  /** True when the provider/owner enrichment fetch failed. Rows still show. */
  providerContextError?: boolean;
  /** True when business/owner search matched more providers than could be folded into the query. */
  ownerSearchTruncated?: boolean;
}

export interface AdminServicesQuery {
  search?: string;
  category?: string;
  availability?: AdminServiceAvailability | '';
  page?: number;
  pageSize?: number;
}

export const ADMIN_SERVICES_PAGE_SIZE = 12;

/** Resolve a set of provider ids into a { provider_id -> provider } lookup (single batched fetch). */
async function providerLookupById(providerIds: string[]): Promise<Record<string, Provider>> {
  if (!providerIds.length) return {};
  const { data, error } = await supabase
    .from('providers')
    .select('id, user_id, business_name, profile_picture_url, location, rating, verified')
    .in('id', providerIds);

  if (error) {
    console.error('Error fetching providers for admin services:', error);
    return {};
  }
    return Object.fromEntries(((data || []) as Provider[]).map((p) => [p.id, p as Provider]));
}

/**
 * Read-only admin services directory with search / category filter /
 * availability filter / pagination.
 *
 * Query budget per page view: ONE paginated `services` query + ONE provider
 * enrichment fetch (batched by provider_id) + ONE `profileLookup` enrichment
 * pass for owner context — never one query per row.
 *
 * Throws on hard RLS/network failure so the page can surface a clear
 * admin-facing message. Provider/owner enrichment failure is NON-FATAL: rows
 * still display and `providerContextError` is set so the admin knows provider
 * context is incomplete.
 */
export async function getServicesForAdmin(
  query: AdminServicesQuery = {},
): Promise<AdminServicesPage> {
  const page = Number.isFinite(query.page) ? Math.max(1, Math.floor(query.page!)) : 1;
  const pageSize = Number.isFinite(query.pageSize)
    ? Math.min(50, Math.max(5, Math.floor(query.pageSize!)))
    : ADMIN_SERVICES_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const search = sanitizeSearchTerm(query.search);

  try {
    let request = supabase
      .from('services')
      .select('id, provider_id, title, description, category, price, duration_minutes, active, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);

    let ownerSearchTruncated = false;
    if (search) {
      const filters = [`title.ilike.%${search}%`, `category.ilike.%${search}%`];
      const ownerMatch = await findProviderIdsByOwnerTerm(search);
      if (ownerMatch.ids.length) filters.push(`provider_id.in.(${ownerMatch.ids.join(',')})`);
      ownerSearchTruncated = ownerMatch.truncated;
      request = request.or(filters.join(','));
    }

    if (query.category) request = request.eq('category', query.category);
    if (query.availability === 'active') request = request.eq('active', true);
    else if (query.availability === 'inactive') request = request.eq('active', false);

    const { data, error, count } = await request;
    if (error) {
      // Paging past the end of the data returns 416 / PGRST103 — retry once
      // from page 1 rather than surfacing an error for a harmless case.
      if (error.code === 'PGRST103' || /range not satisfiable/i.test(error.message ?? '')) {
        if (page > 1) return getServicesForAdmin({ ...query, page: 1 });
        return { rows: [], total: 0, page: 1, pageSize, categories: [] };
      }
      console.error('Error fetching services for admin:', error);
      throw new Error(
        error.code === '42501' || /row-level security/i.test(error.message)
          ? 'The services directory is blocked by row-level security. If RLS is enabled on public.services, ask a project owner to apply the optional "Services select for admin" policy (see db/rls/payments_admin_select.sql).'
          : 'The services directory could not be loaded.',
      );
    }

    if (page > 1 && (!data?.length || (count !== null && from >= count))) {
      return getServicesForAdmin({ ...query, page: 1 });
    }
    if (count === null) throw new Error('The exact service count was unavailable. Please retry.');

    const services = (data || []) as Array<{
      id: string;
      provider_id: string | null;
      title: string;
      description: string | null;
      category: string;
      price: number;
      duration_minutes: number | null;
      active: boolean;
      created_at: string;
    }>;

    // Do not manufacture a zero price or an inactive state for malformed data.
    if (services.some((s) => typeof s.price !== 'number' || !Number.isFinite(s.price) || typeof s.active !== 'boolean')) {
      throw new Error('Some service records have missing or invalid price/active values. No substitute values were displayed.');
    }
    const providerIds = [...new Set(services.map((s) => s.provider_id).filter(Boolean))] as string[];

        const categories = Array.from(new Set(services.map((s) => s.category).filter(Boolean))).sort();

    // Fast path: no services on this page → no enrichment needed.
    if (!providerIds.length) {
      return {
        rows: services.map((s) => ({
          id: s.id,
          provider_id: s.provider_id ?? '',
          title: s.title,
          description: s.description ?? null,
          category: s.category,
          price: typeof s.price === 'number' ? s.price : 0,
          duration_minutes: typeof s.duration_minutes === 'number' ? s.duration_minutes : null,
          active: Boolean(s.active),
          created_at: s.created_at,
          business_name: null,
          profile_picture_url: null,
          location: null,
          rating: 0,
          verified: null,
          owner_name: null,
          owner_phone: null,
          owner_avatar_url: null,
        })),
        total: count ?? services.length,
        page,
        pageSize,
        categories,
        ownerSearchTruncated,
      };
    }

    const providers = await providerLookupById(providerIds);
    let providerContextError = services.some(
      (s) => s.provider_id && !Object.prototype.hasOwnProperty.call(providers, s.provider_id),
    );

    const ownerIds = [...new Set(Object.values(providers).map((p) => p.user_id).filter(Boolean))] as string[];
    const owners = ownerIds.length ? await profileLookup(ownerIds) : {};
    providerContextError ||= ownerIds.some((id) => !owners[id]);

    return {
      rows: services.map((s) => {
        const provider = s.provider_id ? providers[s.provider_id] : null;
        const owner =
          provider && ownerIds.length ? (owners as Record<string, Profile>)[provider.user_id] ?? null : null;
        return {
          id: s.id,
          provider_id: s.provider_id ?? '',
          title: s.title,
          description: s.description ?? null,
          category: s.category,
          price: typeof s.price === 'number' ? s.price : 0,
          duration_minutes: typeof s.duration_minutes === 'number' ? s.duration_minutes : null,
          active: Boolean(s.active),
          created_at: s.created_at,
          business_name: provider?.business_name ?? null,
          profile_picture_url: provider?.profile_picture_url ?? null,
          location: provider?.location ?? null,
          rating: typeof provider?.rating === 'number' ? provider.rating : 0,
          verified: provider ? Boolean(provider.verified) : null,
          owner_name: owner?.full_name ?? null,
          owner_phone: owner?.phone ?? null,
          owner_avatar_url: owner?.avatar_url ?? null,
        };
      }),
      total: count ?? services.length,
      page,
      pageSize,
      categories,
      providerContextError,
      ownerSearchTruncated,
    };
  } catch (error) {
    if (error instanceof Error) throw error;
    console.error('Exception fetching services for admin:', error);
        throw new Error('The services directory could not be loaded.');
  }
}

/**
 * Given a free-text search term, resolve it to the provider ids whose business
 * name OR whose owner profile name/phone matches — used to fold "provider
 * search by business or owner" into the services `or(...)` filter. The merged
 * id set is capped at 100 so the `in.()` filter stays well under PostgREST's
 * URL length limits; `truncated` reports when the cap was exceeded.
 */
async function findProviderIdsByOwnerTerm(
  search: string,
): Promise<{ ids: string[]; truncated: boolean }> {
  const PROVIDER_SEARCH_LIMIT = 100;
  const ids = new Set<string>();

  // 1) Providers whose business_name matches the term directly.
  const { data: bizRows, error: bizError } = await supabase
    .from('providers')
    .select('id')
    .ilike('business_name', `%${search}%`)
    .limit(PROVIDER_SEARCH_LIMIT + 1);

  if (bizError) {
    console.error('Error searching provider businesses for admin services:', bizError);
    throw new Error('Business search could not load. Check connectivity and admin SELECT access, then retry.');
  } else {
    ((bizRows || []) as Array<{ id: string }>).forEach((r) => ids.add(r.id));
  }

  // 2) Providers whose owner profile name/phone matches.
  const { data: ownerRows, error: ownerError } = await supabase
    .from('profiles')
    .select('id')
    .or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`)
    .limit(PROVIDER_SEARCH_LIMIT + 1);

  if (ownerError) {
    console.error('Error searching provider owners for admin services:', ownerError);
    throw new Error('Owner search could not load. Check connectivity and admin SELECT access, then retry.');
  }
  if ((ownerRows?.length ?? 0) > PROVIDER_SEARCH_LIMIT || ids.size > PROVIDER_SEARCH_LIMIT) {
    throw new Error('Too many providers match. Please narrow the search to keep results and counts complete.');
  }

  const ownerIds = ((ownerRows || []) as Array<{ id: string }>).map((r) => r.id);
  if (ownerIds.length) {
    const { data: providerRows, error: provError } = await supabase
      .from('providers')
      .select('id')
      .in('user_id', ownerIds)
      .limit(PROVIDER_SEARCH_LIMIT + 1);

    if (provError) {
      console.error('Error resolving providers for admin services search:', provError);
      throw new Error('Provider search could not load. Check connectivity and admin SELECT access, then retry.');
    } else {
      ((providerRows || []) as Array<{ id: string }>).forEach((p) => ids.add(p.id));
    }
  }

  if (ids.size > PROVIDER_SEARCH_LIMIT) {
    throw new Error('Too many providers match. Please narrow the search to keep results and counts complete.');
  }
  return { ids: [...ids], truncated: false };
}

/** Fetch real category values using ordered keyset batches, without loading service records. */
export async function getServiceCategoriesForAdmin(): Promise<string[]> {
  const categories = new Set<string>();
  let after: string | undefined;
  // Move past the last category rather than offsetting over repeated values.
  while (true) {
    let request = supabase.from('services').select('category')
      .not('category', 'is', null).order('category', { ascending: true }).limit(100);
    if (after !== undefined) request = request.gt('category', after);
    const { data, error } = await request;
    if (error) {
      console.error('Error fetching service categories for admin:', error);
      throw new Error('Service categories could not load. Check connectivity and admin SELECT access, then retry.');
    }
    const values = (data || []) as Array<{ category: string }>;
    if (!values.length) break;
    for (const row of values) if (row.category) categories.add(row.category);
    const last = values[values.length - 1].category;
    if (last === after) throw new Error('Service categories could not be paginated. Please retry.');
    after = last;
  }
  return [...categories].sort();
}







// PHASE 3A — Read-only request directory. Existing marketplace helpers are untouched.
export const ADMIN_REQUESTS_PAGE_SIZE = 12;

export interface AdminRequestRow {
  id: string;
  customer_id: string;
  title: string;
  description: string | null;
  category: string | null;
  location: string | null;
  budget_max: number | null;
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_avatar_url: string | null;
}

export interface AdminRequestsQuery {
  search?: string;
  category?: string;
  location?: string;
  page?: number;
}

export interface AdminRequestsPage {
  rows: AdminRequestRow[];
  total: number;
  page: number;
  pageSize: number;
  customerContextError: boolean;
}

function adminRequestsReadError(error: { code?: string; message?: string }): Error {
  console.error('Error reading admin requests:', error);
  return new Error(
    error.code === '42501' || /row.level security|permission denied|infinite recursion/i.test(error.message || '')
      ? 'Admin request access was denied. Ask the project owner to verify the existing Requests select for admin and Profiles select for admin policies. No access bypass was attempted.'
      : 'The requests directory could not load. Check your connection and retry.',
  );
}

/** One request page + one customer batch; search adds one bounded profile lookup.
 * RLS may silently filter SELECT results; an empty page is not proof of deployed admin access.
 */
export async function getRequestsForAdmin(query: AdminRequestsQuery = {}): Promise<AdminRequestsPage> {
  let page = Number.isSafeInteger(query.page) ? Math.max(1, query.page!) : 1;
  const pageSize = ADMIN_REQUESTS_PAGE_SIZE;
  // Reuse the established sanitizer; quotes/underscore are also removed from OR values.
  const search = sanitizeSearchTerm(query.search).replace(/["_]/g, ' ').trim();
  const location = sanitizeSearchTerm(query.location).replace(/["_]/g, ' ').trim();
  try {
    let customerIds: string[] = [];
    if (search) {
      const { data, error, count } = await supabase.from('profiles')
        .select('id', { count: 'exact' })
        .or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`)
        .order('id').limit(100);
      if (error) throw adminRequestsReadError(error);
      if (count === null) throw new Error('The customer search count was unavailable. Please retry.');
      if (count > 100) throw new Error('Too many customers match. Narrow your search so request results and totals stay complete.');
      customerIds = (data || []).map((row: { id: string }) => row.id);
    }

    // A maximum of two attempts, reusing search matches on out-of-range recovery.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const from = (page - 1) * pageSize;
      let request = supabase.from('requests')
        .select('id, customer_id, title, description, category, location, budget_max, created_at', { count: 'exact' })
        .order('created_at', { ascending: false }).order('id', { ascending: false })
        .range(from, from + pageSize - 1);
      if (search) {
        const filters = ['title', 'description', 'category', 'location'].map((field) => `${field}.ilike.%${search}%`);
        if (customerIds.length) filters.push(`customer_id.in.(${customerIds.join(',')})`);
        request = request.or(filters.join(','));
      }
      // Exact stored category, with no marketplace normalization or value rewriting.
      if (query.category) request = request.eq('category', query.category);
      if (location) request = request.ilike('location', `%${location}%`);
      const { data, error, count } = await request;
      if (error) {
        if (error.code === 'PGRST103' && page > 1) { page = 1; continue; }
        throw adminRequestsReadError(error);
      }
      if (count === null) throw new Error('The exact request count was unavailable. Please retry.');
      if (page > 1 && (!data?.length || from >= count)) { page = 1; continue; }
      const requests = (data || []) as Array<Omit<AdminRequestRow, 'customer_name' | 'customer_phone' | 'customer_avatar_url'>>;
      const ids = [...new Set(requests.map((row) => row.customer_id).filter(Boolean))];
      type Customer = { id: string; full_name: string | null; phone: string | null; avatar_url: string | null };
      const customers = new Map<string, Customer>();
      let customerContextError = false;
      if (ids.length) {
        try {
          const result = await supabase.from('profiles').select('id, full_name, phone, avatar_url').in('id', ids);
          if (result.error) throw result.error;
          for (const customer of (result.data || []) as Customer[]) customers.set(customer.id, customer);
        } catch (error) {
          console.error('Customer context unavailable for admin requests:', error);
          customerContextError = true;
        }
      }
      customerContextError ||= requests.some((row) => !customers.has(row.customer_id));
      return {
        rows: requests.map((row) => {
          const customer = customers.get(row.customer_id);
          return { ...row, customer_name: customer?.full_name ?? null, customer_phone: customer?.phone ?? null, customer_avatar_url: customer?.avatar_url ?? null };
        }),
        total: count, page, pageSize, customerContextError,
      };
    }
    throw new Error('The request page changed while loading. Please retry.');
  } catch (error) {
    if (error instanceof Error) throw error;
    throw adminRequestsReadError({ message: 'Network request failed' });
  }
}

// PHASE 3B — Offers observation only. No marketplace mutation helpers are called.
export const ADMIN_OFFERS_PAGE_SIZE = 12;
interface AdminOfferRecord {
  id: string;
  request_id: string;
  provider_id: string;
  message: string | null;
  price: number | null;
  estimated_start: string | null;
  created_at: string;
}
export interface AdminOfferRow extends AdminOfferRecord {
  request_title: string | null;
  category: string | null;
  location: string | null;
  business_name: string | null;
  owner_name: string | null;
  customer_name: string | null;
  customer_phone: string | null;
}
export interface AdminOffersQuery {
  search?: string;
  requestId?: string;
  providerId?: string;
  page?: number;
}
export interface AdminOffersPage {
  rows: AdminOfferRow[];
  total: number;
  page: number;
  pageSize: number;
  contextError: boolean;
}

function adminOffersReadError(error: unknown): Error {
  console.error('Admin offers read failed:', error);
  return new Error('Offers could not load. Check your connection and existing admin SELECT access for offers, requests, providers and profiles, then retry.');
}

/** Separate read layer: 1 offer page, 2 parallel context batches, 1 combined profile batch.
 * Search adds 2 bounded ID lookups. Never uses FK embeds or infers offer acceptance.
 * An RLS-filtered empty SELECT cannot be distinguished from an empty table here.
 */
export async function getOffersForAdmin(query: AdminOffersQuery = {}): Promise<AdminOffersPage> {
  const pageSize = ADMIN_OFFERS_PAGE_SIZE;
  let page = Number.isSafeInteger(query.page) && query.page! > 0 && query.page! <= Math.floor(Number.MAX_SAFE_INTEGER / pageSize)
    ? query.page! : 1;
  const search = sanitizeSearchTerm(query.search).replace(/["_]/g, ' ').trim();
  const requestId = query.requestId?.trim();
  const providerId = query.providerId?.trim();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if ((requestId && !uuid.test(requestId)) || (providerId && !uuid.test(providerId))) {
    throw new Error('Request ID and Provider ID filters require a full UUID. Clear the filter or enter the complete ID.');
  }
  try {
    let requestMatches: string[] = [];
    let providerMatches: string[] = [];
    if (search) {
      const matches = await Promise.all([
        supabase.from('requests').select('id', { count: 'exact' })
          .or(`title.ilike.%${search}%,category.ilike.%${search}%,location.ilike.%${search}%`).order('id').limit(100),
        supabase.from('providers').select('id', { count: 'exact' })
          .ilike('business_name', `%${search}%`).order('id').limit(100),
      ]);
      for (const match of matches) {
        if (match.error) throw adminOffersReadError(match.error);
        if (match.count == null) throw new Error('Search totals are unavailable. Please retry.');
        if (match.count > 100 || match.count !== (match.data || []).length) {
          throw new Error('Too many related records match. Narrow your search to keep offer results and totals complete.');
        }
      }
      requestMatches = (matches[0].data || []).map((row: { id: string }) => row.id);
      providerMatches = (matches[1].data || []).map((row: { id: string }) => row.id);
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const from = (page - 1) * pageSize;
      let request = supabase.from('offers')
        .select('id, request_id, provider_id, message, price, estimated_start, created_at', { count: 'exact' })
        .order('created_at', { ascending: false }).order('id', { ascending: false })
        .range(from, from + pageSize - 1);
      if (search) {
        const filters = [`message.ilike.%${search}%`];
        if (requestMatches.length) filters.push(`request_id.in.(${requestMatches.join(',')})`);
        if (providerMatches.length) filters.push(`provider_id.in.(${providerMatches.join(',')})`);
        request = request.or(filters.join(','));
      }
      if (requestId) request = request.eq('request_id', requestId);
      if (providerId) request = request.eq('provider_id', providerId);
      const { data, error, count } = await request;
      if (error) {
        if (error.code === 'PGRST103' && page > 1) { page = 1; continue; }
        throw adminOffersReadError(error);
      }
      if (count == null) throw new Error('The exact offer count is unavailable. Please retry.');
      if (page > 1 && (!data?.length || from >= count)) { page = 1; continue; }
      const offers = (data || []) as AdminOfferRecord[];
      const enriched = await enrichAdminOfferPage(offers);
      return { ...enriched, total: count, page, pageSize };
    }
    throw new Error('The offer page changed while loading. Please retry.');
  } catch (error) {
    if (error instanceof Error) throw error;
    throw adminOffersReadError(error);
  }
}



async function enrichAdminOfferPage(offers: AdminOfferRecord[]): Promise<{ rows: AdminOfferRow[]; contextError: boolean }> {
  type RequestContext = { id: string; customer_id: string; title: string | null; category: string | null; location: string | null };
  type ProviderContext = { id: string; user_id: string; business_name: string | null };
  type ProfileContext = { id: string; full_name: string | null; phone: string | null };
  let contextError = false;
  async function batch<T extends { id: string }>(table: string, fields: string, ids: string[]): Promise<Map<string, T>> {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (!uniqueIds.length) return new Map();
    try {
      const { data, error } = await supabase.from(table).select(fields).in('id', uniqueIds);
      if (error) throw error;
      const rows = (data || []) as unknown as T[];
      if (rows.length !== uniqueIds.length) contextError = true;
      return new Map(rows.map((row) => [row.id, row]));
    } catch (error) {
      console.error(`Admin offer ${table} context unavailable:`, error);
      contextError = true;
      return new Map();
    }
  }
  const [requests, providers] = await Promise.all([
    batch<RequestContext>('requests', 'id, customer_id, title, category, location', offers.map((row) => row.request_id)),
    batch<ProviderContext>('providers', 'id, user_id, business_name', offers.map((row) => row.provider_id)),
  ]);
  const profiles = await batch<ProfileContext>('profiles', 'id, full_name, phone', [
    ...[...requests.values()].map((row) => row.customer_id),
    ...[...providers.values()].map((row) => row.user_id),
  ]);
  const rows = offers.map((offer) => {
    const request = requests.get(offer.request_id);
    const provider = providers.get(offer.provider_id);
    const customer = request ? profiles.get(request.customer_id) : undefined;
    const owner = provider ? profiles.get(provider.user_id) : undefined;
    if (!request || !provider || !customer || !owner) contextError = true;
    return {
      ...offer, request_title: request?.title ?? null, category: request?.category ?? null,
      location: request?.location ?? null, business_name: provider?.business_name ?? null,
      owner_name: owner?.full_name ?? null, customer_name: customer?.full_name ?? null,
      customer_phone: customer?.phone ?? null,
    };
  });
  return { rows, contextError };
}

// PHASE 3C — Read-only booking directory; no payment queries or marketplace mutations.
export const ADMIN_BOOKINGS_PAGE_SIZE = 12;
// Values from db/escrow_schema.sql, bookings.status CHECK constraint.
export const ADMIN_BOOKING_STATUSES = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'disputed'] as const;
export interface AdminBookingRow extends Booking {
  customer_name: string | null;
  customer_phone: string | null;
  business_name: string | null;
  owner_name: string | null;
  service_title: string | null;
  category: string | null;
}
export interface AdminBookingsQuery {
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
}
export interface AdminBookingsPage {
  rows: AdminBookingRow[];
  total: number;
  page: number;
  pageSize: number;
  contextError: boolean;
}
function adminBookingsReadError(error: unknown): Error {
  console.error('Admin bookings read failed:', error);
  return new Error('Bookings could not load. Check connectivity and existing admin SELECT access for bookings, profiles, providers and services, then retry.');
}
function validAdminBookingDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
/** Bounded reads, not the existing unpaginated moderation helper.
 * RLS can silently filter SELECT rows; empty results do not prove deployed admin access.
 */
export async function getBookingsForAdmin(query: AdminBookingsQuery = {}): Promise<AdminBookingsPage> {
  const pageSize = ADMIN_BOOKINGS_PAGE_SIZE;
  let page = Number.isSafeInteger(query.page) && query.page! > 0 && query.page! <= Math.floor(Number.MAX_SAFE_INTEGER / pageSize) ? query.page! : 1;
  const search = sanitizeSearchTerm(query.search).replace(/["_]/g, ' ').trim();
  const status = query.status || '';
  const dateFrom = query.dateFrom || '';
  const dateTo = query.dateTo || '';
  if (status && !ADMIN_BOOKING_STATUSES.some((value) => value === status)) throw new Error('Choose a supported booking status.');
  if ((dateFrom && !validAdminBookingDate(dateFrom)) || (dateTo && !validAdminBookingDate(dateTo))) throw new Error('Enter valid scheduled dates in YYYY-MM-DD format.');
  if (dateFrom && dateTo && dateFrom > dateTo) throw new Error('Scheduled From must be on or before Scheduled To.');
  try {
    const searchFilters: string[] = [];
    if (search) {
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuid.test(search)) {
        searchFilters.push(`id.eq.${search}`);
      } else {
        const matches = await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact' }).or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`).order('id').limit(100),
          supabase.from('providers').select('id', { count: 'exact' }).ilike('business_name', `%${search}%`).order('id').limit(100),
          supabase.from('services').select('id', { count: 'exact' }).ilike('title', `%${search}%`).order('id').limit(100),
        ]);
        const fields = ['customer_id', 'provider_id', 'service_id'];
        matches.forEach((match, index) => {
          if (match.error) throw adminBookingsReadError(match.error);
          if (match.count == null) throw new Error('Search totals are unavailable. Please retry.');
          if (match.count > 100 || match.count !== (match.data || []).length) throw new Error('Too many related records match. Narrow your search to keep booking results and totals complete.');
          const ids = (match.data || []).map((row: { id: string }) => row.id);
          if (ids.length) searchFilters.push(`${fields[index]}.in.(${ids.join(',')})`);
        });
        if (!searchFilters.length) return { rows: [], total: 0, page: 1, pageSize, contextError: false };
      }
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const from = (page - 1) * pageSize;
      let request = supabase.from('bookings')
        .select('id, customer_id, provider_id, service_id, booking_date, start_time, end_time, status, total_amount, created_at', { count: 'exact' })
        .order('created_at', { ascending: false }).order('id', { ascending: false })
        .range(from, from + pageSize - 1);
      if (searchFilters.length) request = request.or(searchFilters.join(','));
      if (status) request = request.eq('status', status);
      if (dateFrom) request = request.gte('booking_date', dateFrom);
      if (dateTo) request = request.lte('booking_date', dateTo);
      const { data, error, count } = await request;
      if (error) {
        if (error.code === 'PGRST103' && page > 1) { page = 1; continue; }
        throw adminBookingsReadError(error);
      }
      if (count == null) throw new Error('The exact booking count is unavailable. Please retry.');
      if (page > 1 && (!data?.length || from >= count)) { page = 1; continue; }
      const enriched = await enrichAdminBookingPage((data || []) as Booking[]);
      return { ...enriched, total: count, page, pageSize };
    }
    throw new Error('The booking page changed while loading. Please retry.');
  } catch (error) {
    if (error instanceof Error) throw error;
    throw adminBookingsReadError(error);
  }
}


/** Three related-table batches for a page, including customers and owners together. */
async function enrichAdminBookingPage(bookings: Booking[]): Promise<Pick<AdminBookingsPage, 'rows' | 'contextError'>> {
  let contextError = false;
  async function batch<T extends { id: string }>(table: string, fields: string, ids: string[]): Promise<Map<string, T>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return new Map();
    try {
      const { data, error } = await supabase.from(table).select(fields).in('id', unique);
      if (error) throw error;
      const map = new Map(((data || []) as unknown as T[]).map((row) => [row.id, row]));
      if (unique.some((id) => !map.has(id))) contextError = true;
      return map;
    } catch (error) {
      console.error(`Admin booking ${table} context unavailable:`, error);
      contextError = true;
      return new Map();
    }
  }
  type ProviderContext = { id: string; user_id: string; business_name: string | null };
  type ServiceContext = { id: string; title: string | null; category: string | null };
  type ProfileContext = { id: string; full_name: string | null; phone: string | null };
  const [providers, services] = await Promise.all([
    batch<ProviderContext>('providers', 'id, user_id, business_name', bookings.map((row) => row.provider_id)),
    batch<ServiceContext>('services', 'id, title, category', bookings.map((row) => row.service_id)),
  ]);
  const profiles = await batch<ProfileContext>('profiles', 'id, full_name, phone', [
    ...bookings.map((row) => row.customer_id), ...[...providers.values()].map((row) => row.user_id),
  ]);
  const rows = bookings.map((booking) => {
    const provider = providers.get(booking.provider_id);
    const service = services.get(booking.service_id);
    const customer = profiles.get(booking.customer_id);
    const owner = provider ? profiles.get(provider.user_id) : undefined;
    if (!customer || !provider || !owner || (booking.service_id && !service)) contextError = true;
    return {
      ...booking, customer_name: customer?.full_name ?? null, customer_phone: customer?.phone ?? null,
      business_name: provider?.business_name ?? null, owner_name: owner?.full_name ?? null,
      service_title: service?.title ?? null, category: service?.category ?? null,
    };
  });
  return { rows, contextError };
}

// PHASE 4A — Read-only Finance/Transactions directory over existing `payments` records.
// No payment/escrow mutations, no service-role, no auth.users access.
export const ADMIN_FINANCE_PAGE_SIZE = 12;
// Stored values from the payments.payment_status CHECK constraint (db/escrow_schema.sql).
export const ADMIN_PAYMENT_STATUSES = ['pending', 'escrowed', 'released', 'failed', 'refunded', 'disputed'] as const;
export interface AdminFinanceRow extends Payment {
  customer_name: string | null;
  customer_phone: string | null;
  business_name: string | null;
  owner_name: string | null;
  service_title: string | null;
  booking_status: string | null;
  booking_id_label: string | null;
}
export interface AdminFinanceQuery {
  search?: string;
  status?: string;
  method?: string;
  /** Inclusive ISO calendar day (YYYY-MM-DD) applied to payments.created_at. */
  fromDate?: string;
  /** Inclusive ISO calendar day (YYYY-MM-DD) applied to payments.created_at. */
  toDate?: string;
  page?: number;
}
/**
 * PHASE 4D — Sums of the STORED per-transaction values on the currently listed
 * page only. These are not balances, earnings, revenue or settlement figures and
 * are never an aggregate over every matching record.
 */
export interface AdminFinanceTotals {
  listedAmount: number;
  listedPlatformFees: number;
  listedProviderAmounts: number;
}
/** PHASE 4E — Sums of the STORED per-transaction values across ALL records that
 * match the current filters (search/status/method/date range). Null means the
 * matching set exceeded the bounded aggregate cap or the aggregate read failed —
 * a partial sum is never returned. Not balances, earnings or available funds. */
export interface AdminFinanceMatchingTotals {
  amount: number;
  platformFees: number;
  providerAmounts: number;
}
export interface AdminFinancePage {
  rows: AdminFinanceRow[];
  total: number;
  page: number;
  pageSize: number;
  contextError: boolean;
  methods: string[];
  totals: AdminFinanceTotals;
  matchingTotals: AdminFinanceMatchingTotals | null;
}
/** Sums the stored values of the rows actually returned for this page. */
function financePageTotals(rows: Payment[]): AdminFinanceTotals {
  const sum = (key: 'amount' | 'platform_fee' | 'provider_amount') =>
    rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  return {
    listedAmount: sum('amount'),
    listedPlatformFees: sum('platform_fee'),
    listedProviderAmounts: sum('provider_amount'),
  };
}
/**
 * PHASE 4E — Sums stored payment fields for ALL records matching the current
 * filters. The deployed PostgREST does not support aggregate select functions
 * (PGRST100), so this uses ONE bounded, columns-only request: only the three
 * numeric fields are transferred, capped at 1000 rows, with an exact count.
 * Returns null when the matching set exceeds the cap or is only partially
 * readable — never a partial sum. Pure read; no mutation, no new data source.
 */
const ADMIN_FINANCE_MATCHING_CAP = 1000;
async function financeMatchingTotals(
  filters: { searchFilters: string[]; status: string; method: string; fromDate: string | null; toDate: string | null },
): Promise<AdminFinanceMatchingTotals | null> {
  try {
    let request = supabase.from('payments')
      .select('amount, platform_fee, provider_amount', { count: 'exact' })
      .limit(ADMIN_FINANCE_MATCHING_CAP + 1);
    if (filters.searchFilters.length) request = request.or(filters.searchFilters.join(','));
    if (filters.status) request = request.eq('payment_status', filters.status);
    if (filters.method) request = request.eq('payment_method', filters.method);
    if (filters.fromDate) request = request.gte('created_at', filters.fromDate);
    if (filters.toDate) request = request.lt('created_at', isoDateAfter(filters.toDate));
    const { data, error, count } = await request;
    if (error) { console.error('Admin finance matching totals unavailable:', error); return null; }
    if (count == null || count > ADMIN_FINANCE_MATCHING_CAP || (data || []).length < count) return null;
    const sum = (key: 'amount' | 'platform_fee' | 'provider_amount') =>
      (data || []).reduce((total: number, row: Record<string, unknown>) => total + (Number(row[key]) || 0), 0);
    return { amount: sum('amount'), platformFees: sum('platform_fee'), providerAmounts: sum('provider_amount') };
  } catch (error) {
    console.error('Admin finance matching totals unavailable:', error);
    return null;
  }
}
/**
 * Accepts only a plain ISO calendar date. Anything else (empty input, half-typed
 * value) is ignored so a partial date can never reshape the query.
 */
function normalizeIsoDate(value?: string): string | null {
  const trimmed = (value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === trimmed ? trimmed : null;
}
/** Exclusive upper bound (the day after) so the whole end day is included. */
function isoDateAfter(value: string): string {
  const next = new Date(`${value}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}
function adminFinanceReadError(error: unknown): Error {
  console.error('Admin finance read failed:', error);
  return new Error('Financial records could not load. Check connectivity and existing admin SELECT access for payments, bookings, profiles, providers and services, then retry.');
}
/** Page-scoped payments SELECT with exact count; related search lookups are capped at 100. */
export async function getFinanceForAdmin(query: AdminFinanceQuery = {}): Promise<AdminFinancePage> {
  const pageSize = ADMIN_FINANCE_PAGE_SIZE;
  let page = Number.isSafeInteger(query.page) && query.page! > 0 && query.page! <= Math.floor(Number.MAX_SAFE_INTEGER / pageSize) ? query.page! : 1;
  const search = sanitizeSearchTerm(query.search).replace(/["_]/g, ' ').trim();
  const status = query.status || '';
  const method = query.method || '';
  // PHASE 4D — optional created_at range; invalid or partial dates are ignored.
  const fromDate = normalizeIsoDate(query.fromDate);
  const toDate = normalizeIsoDate(query.toDate);
  if (status && !ADMIN_PAYMENT_STATUSES.some((value) => value === status)) throw new Error('Choose a supported payment status.');
  try {
    let methods: string[] = [];
    try {
      const methodResult = await supabase.from('payments').select('payment_method').order('payment_method', { ascending: true }).limit(200);
      if (methodResult.error) throw methodResult.error;
      methods = [...new Set((methodResult.data || []).map((row: { payment_method: string | null }) => row.payment_method).filter(Boolean))] as string[];
    } catch (error) {
      console.error('Admin finance payment methods unavailable:', error);
    }
    const searchFilters: string[] = [];
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (search && uuid.test(search)) {
      searchFilters.push(`id.eq.${search}`);
    } else if (search) {
      searchFilters.push(`transaction_ref.ilike.%${search}%`);
      const matches = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact' }).or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`).order('id').limit(100),
        supabase.from('providers').select('id', { count: 'exact' }).ilike('business_name', `%${search}%`).order('id').limit(100),
      ]);
      const fields = ['customer_id', 'provider_id'];
      matches.forEach((match, index) => {
        if (match.error) throw adminFinanceReadError(match.error);
        if (match.count == null) throw new Error('Search totals are unavailable. Please retry.');
        if (match.count > 100 || match.count !== (match.data || []).length) throw new Error('Too many related records match. Narrow your search to keep payment results and totals complete.');
        const ids = (match.data || []).map((row: { id: string }) => row.id);
        if (ids.length) searchFilters.push(`${fields[index]}.in.(${ids.join(',')})`);
      });
      const serviceMatches = await supabase.from('services').select('id', { count: 'exact' }).ilike('title', `%${search}%`).order('id').limit(100);
      if (serviceMatches.error) throw adminFinanceReadError(serviceMatches.error);
      if (serviceMatches.count == null) throw new Error('Search totals are unavailable. Please retry.');
      if (serviceMatches.count > 100 || serviceMatches.count !== (serviceMatches.data || []).length) throw new Error('Too many related records match. Narrow your search to keep payment results and totals complete.');
      const serviceIds = (serviceMatches.data || []).map((row: { id: string }) => row.id);
      if (serviceIds.length) {
        const bookingMatches = await supabase.from('bookings').select('id', { count: 'exact' }).in('service_id', serviceIds).order('id').limit(100);
        if (bookingMatches.error) throw adminFinanceReadError(bookingMatches.error);
        if (bookingMatches.count == null) throw new Error('Search totals are unavailable. Please retry.');
        if (bookingMatches.count > 100 || bookingMatches.count !== (bookingMatches.data || []).length) throw new Error('Too many related records match. Narrow your search to keep payment results and totals complete.');
        const bookingIds = (bookingMatches.data || []).map((row: { id: string }) => row.id);
        if (bookingIds.length) searchFilters.push(`booking_id.in.(${bookingIds.join(',')})`);
      }
      if (!searchFilters.length) return { rows: [], total: 0, page: 1, pageSize, contextError: false, methods, totals: financePageTotals([]), matchingTotals: { amount: 0, platformFees: 0, providerAmounts: 0 } };
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const from = (page - 1) * pageSize;
      let request = supabase.from('payments')
        // NOTE: deployed payments table has no released_at column (repo escrow_schema.sql defines it, but it is not applied live)
        .select('id, booking_id, customer_id, provider_id, amount, currency, payment_status, payment_method, transaction_ref, platform_fee, provider_amount, failure_reason, paid_at, created_at, updated_at', { count: 'exact' })
        .order('created_at', { ascending: false }).order('id', { ascending: false })
        .range(from, from + pageSize - 1);
      if (searchFilters.length) request = request.or(searchFilters.join(','));
      if (status) request = request.eq('payment_status', status);
      if (method) request = request.eq('payment_method', method);
      if (fromDate) request = request.gte('created_at', fromDate);
      if (toDate) request = request.lt('created_at', isoDateAfter(toDate));
      const { data, error, count } = await request;
      if (error) { if (error.code === 'PGRST103' && page > 1) { page = 1; continue; } throw adminFinanceReadError(error); }
      if (count == null) throw new Error('The exact payment count is unavailable. Please retry.');
      if (page > 1 && (!data?.length || from >= count)) { page = 1; continue; }
      const enriched = await enrichAdminFinancePage((data || []) as Payment[]);
      const matchingTotals = await financeMatchingTotals({ searchFilters, status, method, fromDate, toDate });
      return { ...enriched, total: count, page, pageSize, methods, totals: financePageTotals(enriched.rows), matchingTotals };
    }
        throw new Error('The payment page changed while loading. Please retry.');
  } catch (error) {
    if (error instanceof Error) throw error;
    throw adminFinanceReadError(error);
  }
}

/** Bounded batched lookups (payments, profiles, providers, services, bookings); no per-row queries. */
async function enrichAdminFinancePage(payments: Payment[]): Promise<Pick<AdminFinancePage, 'rows' | 'contextError'>> {
  let contextError = false;
  async function batch<T extends { id: string }>(table: string, fields: string, ids: string[]): Promise<Map<string, T>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return new Map();
    try {
      const { data, error } = await supabase.from(table).select(fields).in('id', unique);
      if (error) throw error;
      const map = new Map(((data || []) as unknown as T[]).map((row) => [row.id, row]));
      if (unique.some((id) => !map.has(id))) contextError = true;
      return map;
    } catch (error) {
      console.error(`Admin finance ${table} context unavailable:`, error);
      contextError = true;
      return new Map();
    }
  }
  const [providers, paymentsWithBooking] = await Promise.all([
    batch<{ id: string; user_id: string; business_name: string | null }>('providers', 'id, user_id, business_name', payments.map((row) => row.provider_id)),
    batch<{ id: string; service_id: string | null; status: string | null }>('bookings', 'id, service_id, status', payments.map((row) => row.booking_id)),
  ]);
  const services = await batch<{ id: string; title: string | null }>('services', 'id, title',
    [...paymentsWithBooking.values()].map((row) => row.service_id).filter((id): id is string => Boolean(id)));
  const profiles = await batch<{ id: string; full_name: string | null; phone: string | null }>('profiles', 'id, full_name, phone', [
    ...payments.map((row) => row.customer_id),
    ...[...providers.values()].map((row) => row.user_id),
  ]);
  const rows = payments.map((payment) => {
    const provider = providers.get(payment.provider_id);
    const booking = payment.booking_id ? paymentsWithBooking.get(payment.booking_id) : undefined;
    const resolvedService = booking?.service_id ? services.get(booking.service_id) : undefined;
    const customer = profiles.get(payment.customer_id);
    const owner = provider ? profiles.get(provider.user_id) : undefined;
    if (!customer || !provider || !owner || (payment.booking_id && !paymentsWithBooking.has(payment.booking_id))) contextError = true;
    return {
      ...payment,
      customer_name: customer?.full_name ?? null,
      customer_phone: customer?.phone ?? null,
      business_name: provider?.business_name ?? null,
      owner_name: owner?.full_name ?? null,
      service_title: resolvedService?.title ?? null,
      booking_status: booking?.status ?? null,
      booking_id_label: payment.booking_id ? `#${payment.booking_id.slice(0, 8)}` : null,
    };
  });
    return { rows, contextError };
}



