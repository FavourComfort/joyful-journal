import { createPaymentNotifications } from "./notifications.service";
import { initiateBookingPayment } from "./payments.service";
import { supabase } from "../supabase";

export interface CustomerRequest {
  id: string;
  customer_id: string;
  title: string;
  description: string;
  category?: string | null;
  location?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  created_at: string;
}

export interface RequestNotification {
  id: string;
  request_id: string;
  provider_id: string;
  subject: string;
  message: string;
  link?: string | null;
  status: "new" | "viewed" | "dismissed";
  created_at: string;
  read_at?: string | null;
}

export interface ProviderOffer {
  id: string;
  request_id: string;
  provider_id: string;
  message?: string | null;
  price?: number | null;
  estimated_start?: string | null;
  status?: 'pending' | 'accepted' | 'declined' | null;
  created_at: string;
}

// --------------------------------------------------
// CUSTOMER REQUESTS
// --------------------------------------------------

export async function createCustomerRequest(
  data: Partial<CustomerRequest>
) {
  try {
    const { data: created, error } = await supabase
      .from("requests")
      .insert([data])
      .select()
      .single();

    if (error) {
      console.error("Error creating request:", error);

      throw new Error(
        `Could not create request: ${error.message}`
      );
    }

    return created as CustomerRequest;
  } catch (err) {
    console.error("Exception creating request:", err);

    if (err instanceof Error) {
      throw err;
    }

    throw new Error("Failed to create customer request.");
  }
}

// Get all requests posted by a specific customer
export async function getCustomerRequests(customerId: string) {
  try {
    const { data, error } = await supabase
      .from("requests")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching customer requests:", error);
      return [];
    }

    return (data || []) as CustomerRequest[];
  } catch (err) {
    console.error("Exception fetching customer requests:", err);
    return [];
  }
}

export async function getRequestById(
  requestId: string
): Promise<CustomerRequest | null> {
  try {
    const { data, error } = await supabase
      .from("requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching request:", error);
      return null;
    }

    return data as CustomerRequest | null;
  } catch (err) {
    console.error("Exception fetching request:", err);
    return null;
  }
}

// Search public requests
export async function searchRequests(
  query: string,
  location?: string
) {
  try {
    let qb = supabase.from("requests").select("*");

    if (query) {
      qb = qb.ilike("title", `%${query}%`);
    }

    if (location) {
      qb = qb.ilike("location", `%${location}%`);
    }

    const { data, error } = await qb.order("created_at", {
      ascending: false,
    });

    if (error) {
      console.error("Error searching requests:", error);
      return [];
    }

    return (data || []) as CustomerRequest[];
  } catch (err) {
    console.error("Exception searching requests:", err);
    return [];
  }
}

// --------------------------------------------------
// PROVIDER MATCHING
// --------------------------------------------------
export async function findMatchingProvidersForRequest(
  location?: string,
  category?: string
) {
  try {
    let qb = supabase
      .from("providers")
      .select("id, user_id, business_name, location, verified, created_at")
      .eq("verified", true);

    /*
     * Location remains a strong matching signal.
     *
     * Example:
     * Customer: Kampala
     * Provider: Kampala
     *
     * The provider can match.
     */
    if (location?.trim()) {
      qb = qb.ilike(
        "location",
        `%${location.trim()}%`
      );
    }

    /* Resolve service matches separately so provider discovery does not depend
     * on PostgREST nested relationship metadata. */
    let matchingProviderIds: Set<string> | null = null;
    if (
      category?.trim() &&
      category.trim() !== "other"
    ) {
      const { data: services, error: servicesError } = await supabase
        .from("services")
        .select("provider_id")
        .eq("active", true)
        .eq("category", category.trim());

      if (servicesError) {
        console.error("Error fetching matching provider services:", servicesError);
      } else {
        matchingProviderIds = new Set(
          (services || []).map((service) => service.provider_id)
        );
      }
    }

    const { data, error } = await qb.order(
      "created_at",
      {
        ascending: false,
      }
    );

    if (error) {
      console.error(
        "Error fetching matching providers:",
        error
      );

      return [];
    }

    /*
     * The services join can cause the same provider to
     * appear more than once if they have multiple
     * matching services.
     *
     * Deduplicate providers before returning them.
     */
    const uniqueProviders = new Map();

    for (const provider of data || []) {
      if (matchingProviderIds && !matchingProviderIds.has(provider.id)) {
        continue;
      }

      if (!uniqueProviders.has(provider.id)) {
        uniqueProviders.set(provider.id, {
          id: provider.id,
          user_id: provider.user_id,
          business_name: provider.business_name,
          location: provider.location,
          verified: provider.verified,
        });
      }
    }

    return Array.from(uniqueProviders.values());
  } catch (err) {
    console.error(
      "Exception fetching matching providers:",
      err
    );

    return [];
  }
}

// --------------------------------------------------
// REQUEST NOTIFICATIONS
// --------------------------------------------------

export async function createRequestNotificationsForProviders(
  requestId: string,
  providerIds: string[],
  requestTitle: string,
  requestLink: string
) {
  try {
    if (!providerIds.length) {
      return [];
    }

    const rows = providerIds.map((providerId) => ({
      request_id: requestId,
      provider_id: providerId,
      subject: "You have a new service request from NINJAWO",
      message: `A new request, "${requestTitle}", is waiting for you.`,
      link: requestLink,
      status: "new",
    }));

    const { error } = await supabase
      .from("request_notifications")
      .insert(rows);

    if (error) {
      console.error(
        "Error creating provider notifications:",
        error
      );
      return [];
    }

    return rows as RequestNotification[];
  } catch (err) {
    console.error(
      "Exception creating provider notifications:",
      err
    );
    return [];
  }
}

export async function getNotificationsForProvider(
  providerId: string
) {
  try {
    const { data, error } = await supabase
      .from("request_notifications")
      .select("*")
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(
        "Error fetching provider notifications:",
        error
      );
      return [] as RequestNotification[];
    }

    return (data || []) as RequestNotification[];
  } catch (err) {
    console.error(
      "Exception fetching provider notifications:",
      err
    );
    return [] as RequestNotification[];
  }
}

// --------------------------------------------------
// PROVIDER REQUEST FEED
// --------------------------------------------------

/**
 * The provider's CURRENT set of service categories, derived from their
 * active `services` rows.
 *
 * This is the "live" source of truth used to re-evaluate request eligibility
 * every time the feed loads. Because we read the current categories instead of
 * relying on the one-time notification snapshot taken when a request was posted,
 * a provider who adds a service (or a whole new category) later will start
 * seeing older applicable requests instead of silently missing them.
 */
export async function getProviderServiceCategories(
  providerId: string
): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from("services")
      .select("category")
      .eq("provider_id", providerId)
      .eq("active", true);

    if (error) {
      console.error(
        "Error fetching provider service categories:",
        error
      );
      return [];
    }

    /* Distinct categories so callers can use them as a Set without surprises. */
    const distinctCategories = (data || []).map(
      (s) => s.category
    );
    return Array.from(new Set(distinctCategories));
  } catch (err) {
    console.error(
      "Exception fetching provider service categories:",
      err
    );
    return [];
  }
}

/**
 * Pure eligibility check for a single request against a provider's service
 * categories that mirrors the posting-side matcher (`findMatchingProvidersForRequest`):
 *
 * - Requests with no category, or with the catch-all category "other", are
 *   visible to every provider (the posting matcher skips the category filter
 *   for "other".)
 * - Any other request is only visible if its category is one the provider
 *   currently serves (matching cat-for-cat).
 *
 * This runs at load time with the provider's CURRENT categories, which is what
 * lets relevant providers surface older requests instead of missing them.
 */
export function canProvideForCategory(
  requestCategory: string | null | undefined,
  providerCategories: string[] | ReadonlySet<string> | null | undefined
): boolean {
  if (!requestCategory || requestCategory.trim() === "" || requestCategory === "other") {
    return true;
  }

  const set =
    providerCategories instanceof Set
      ? providerCategories
      : new Set(providerCategories || []);

  return set.has(requestCategory);
}

export async function getRequestsForProvider(
  location?: string,
  categories?: string[]
) {
  try {
    let qb = supabase
      .from("requests")
      .select("*");

    /*
     * For now we use the provider's location to find
     * potentially relevant requests.

     * If the provider has no location, return all
     * requests rather than accidentally returning none.
     */
    if (location?.trim()) {
      qb = qb.ilike(
        "location",
        `%${location.trim()}%`
      );
    }

    const { data, error } = await qb.order(
      "created_at",
      { ascending: false }
    );

    if (error) {
      console.error(
        "Error fetching requests for provider:",
        error
      );
      return [];
    }

    const requests = (data || []) as CustomerRequest[];

    /*
     * Re-evaluate category eligibility against the provider's current services.

     * Gate the feed by category here so a provider only ever sees requests for
     * categories they currently serve. When no categories are provided (e.g.
     * keep backwards compatibility), no category gating is applied.

     * Note: category "other" and requests with no category are treated as a
     * catch-all and visible to everyone (see `canProvideForCategory`).
     */
    if (categories) {
      return requests.filter((request) =>
        canProvideForCategory(request.category, categories)
      );
    }

    return requests;
  } catch (err) {
    console.error(
      "Exception fetching requests for provider:",
      err
    );
    return [];
  }
}

/**
 * Load the requests a provider is eligible for right now:
 * location-based pull (if they set one) plus a live category gate based on
 * their CURRENT active service categories.

 * Replaces the older "notification-snapshot" approach so that providers
 * who add services later no longer miss older relevant requests.

 * Consumers of this function should also fetch `getNotificationsForProvider`
 * separately if they want the "new notification" panel, since it is a
 * historical inbox rather than the eligibility feed source.

 */
export async function getEligibleRequestsForProvider(
  providerId: string,
  location?: string
): Promise<CustomerRequest[]> {
  try {
    const categories = await getProviderServiceCategories(providerId);
    return getRequestsForProvider(location, categories);
  } catch (err) {
    console.error(
      "Exception loading eligible requests for provider:",
      err
    );
    return [];
  }
}

// --------------------------------------------------
// OFFERS
// --------------------------------------------------

/*
 * Check whether this provider has already sent an
 * offer for this request.
 */
export async function getProviderOfferForRequest(
  requestId: string,
  providerId: string
) {
  try {
    const { data, error } = await supabase
      .from("offers")
      .select("*")
      .eq("request_id", requestId)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (error) {
      console.error(
        "Error checking existing offer:",
        error
      );
      return null;
    }

    return data as ProviderOffer | null;
  } catch (err) {
    console.error(
      "Exception checking existing offer:",
      err
    );
    return null;
  }
}

/*
 * Provider creates an offer for a request.
 *
 * We first check for an existing offer so the same
 * provider cannot accidentally create duplicates.
 */
export async function createOffer(
  offer: Partial<ProviderOffer>
) {
  try {
    if (!offer.request_id || !offer.provider_id) {
      console.error(
        "request_id and provider_id are required."
      );
      return null;
    }

    const existingOffer =
      await getProviderOfferForRequest(
        offer.request_id,
        offer.provider_id
      );

    if (existingOffer) {
      console.warn(
        "Provider has already submitted an offer for this request."
      );

      return existingOffer;
    }

    const { data: created, error } = await supabase
      .from("offers")
      .insert([
        {
          request_id: offer.request_id,
          provider_id: offer.provider_id,
          message: offer.message ?? null,
          price: offer.price ?? null,
          estimated_start:
            offer.estimated_start ?? null,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error(
        "Error creating offer:",
        error
      );
      return null;
    }

    return created as ProviderOffer;
  } catch (err) {
    console.error(
      "Exception creating offer:",
      err
    );
    return null;
  }
}

export async function getOffersForRequest(
  requestId: string
) {
  try {
    const { data, error } = await supabase
      .from("offers")
      .select("*")
      .eq("request_id", requestId)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "Error fetching offers:",
        error
      );
      return [];
    }

    return (data || []) as ProviderOffer[];
  } catch (err) {
    console.error(
      "Exception fetching offers:",
      err
    );
    return [];
  }
}

export async function getOffersWithProvidersForRequests(
  requestIds: string[]
): Promise<
  Array<
    ProviderOffer & {
      provider_name?: string;
      provider_business_name?: string;
    }
  >
> {
  try {
    if (!requestIds.length) {
      return [];
    }

    // NOTE: we intentionally do NOT use a `providers(...)` embed here.
    // The live database may not expose an offers -> providers foreign key to
    // PostgREST, which makes the embed fail with PGRST200 and previously
    // caused ALL offers to silently disappear from the customer dashboard.
    const { data, error } = await supabase
      .from("offers")
      .select("*")
      .in("request_id", requestIds)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "Error fetching offers with providers:",
        error
      );
      return [];
    }

    const offers = (data || []) as ProviderOffer[];

    // Resolve provider business names in a second query (no FK embed needed).
    const providerIds = [
      ...new Set(
        offers
          .map((offer) => offer.provider_id)
          .filter(Boolean)
      ),
    ];

    let businessNameById = new Map<string, string>();

    if (providerIds.length) {
      const { data: providers, error: providersError } =
        await supabase
          .from("providers")
          .select("id, business_name")
          .in("id", providerIds);

      if (providersError) {
        // Non-fatal: fall back to a generic label per offer.
        console.error(
          "Error fetching provider names for offers:",
          providersError
        );
      } else {
        businessNameById = new Map(
          ((providers || []) as Array<{
            id: string;
            business_name: string | null;
          }>).map((provider) => [
            provider.id,
            provider.business_name || "Provider",
          ])
        );
      }
    }

    return offers.map((offer) => ({
      ...offer,
      provider_business_name:
        businessNameById.get(offer.provider_id) || "Provider",
    }));
  } catch (err) {
    console.error(
      "Exception fetching offers with providers:",
      err
    );
    return [];
  }
}

// --------------------------------------------------
// OFFER DECISIONS
// --------------------------------------------------

/**
 * Accept or decline an offer by setting its `status` column.
 * Returns true on success, false otherwise.
 */
async function setOfferStatus(
  offerId: string,
  status: "accepted" | "declined"
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("offers")
      .update({ status })
      .eq("id", offerId)
      .select("id")
      .single();

    if (error) {
      console.error(`Error marking offer ${offerId} as ${status}:`, error);
      return false;
    }

    return Boolean(data?.id);
  } catch (err) {
    console.error(`Exception marking offer ${offerId} as ${status}:`, err);
    return false;
  }
}

type OfferBookingContext = {
  request_id: string | null;
  provider_id: string | null;
  price?: number | null;
  estimated_start?: string | null;
  requests: {
    id: string;
    customer_id: string;
    title?: string | null;
    description?: string | null;
    category?: string | null;
    location?: string | null;
    budget_min?: number | null;
    budget_max?: number | null;
    created_at?: string;
  } | null;
  providers: {
    id: string;
    user_id: string;
    business_name?: string | null;
  } | null;
};

async function getOfferWithContext(
  offerId: string
): Promise<OfferBookingContext | null> {
  try {
    // NOTE: no FK embeds here either — the live database does not expose an
    // offers -> requests/providers relationship to PostgREST, so embeds fail
    // with PGRST200. We fetch the offer, then its request and provider rows
    // separately and assemble the same shape the embed used to return.
    const { data, error } = await supabase
      .from("offers")
      .select("*")
      .eq("id", offerId)
      .maybeSingle();

    if (error) {
      console.error("Error loading offer for booking creation:", error);
      return null;
    }

    if (!data) {
      return null;
    }

    const offerRow = data as OfferBookingContext & {
      request_id?: string | null;
      provider_id?: string | null;
      [key: string]: unknown;
    };

    if (!offerRow.request_id || !offerRow.provider_id) {
      console.error(
        "Offer row is missing request_id/provider_id:",
        offerRow
      );
    }

    const [requestRow, providerRow] = await Promise.all([
      offerRow.request_id
        ? supabase
            .from("requests")
            .select(
              "id, customer_id, title, description, category, location, budget_max, created_at"
            )
            .eq("id", offerRow.request_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      offerRow.provider_id
        ? supabase
            .from("providers")
            .select("id, user_id, business_name")
            .eq("id", offerRow.provider_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (requestRow.error) {
      console.error(
        "Error loading request context for offer:",
        requestRow.error
      );
    }
    if (providerRow.error) {
      console.error(
        "Error loading provider context for offer:",
        providerRow.error
      );
    }

    return {
      ...offerRow,
      request_id: offerRow.request_id ?? null,
      provider_id: offerRow.provider_id ?? null,
      requests: (requestRow.data as OfferBookingContext["requests"]) ?? null,
      providers: (providerRow.data as OfferBookingContext["providers"]) ?? null,
    };
  } catch (err) {
    console.error("Exception loading offer for booking creation:", err);
    return null;
  }
}

async function getOfferBookingServiceId(
  providerId: string,
  requestCategory?: string | null
): Promise<string | null> {
  try {
    let qb = supabase
      .from("services")
      .select("id")
      .eq("provider_id", providerId)
      .eq("active", true)
      .order("created_at", { ascending: true });

    if (requestCategory?.trim()) {
      qb = qb.ilike("category", `%${requestCategory.trim()}%`);
    }

    const { data, error } = await qb.limit(1);

    if (error) {
      console.error("Error resolving booking service for accepted offer:", error);
      return null;
    }

    return data?.[0]?.id ?? null;
  } catch (err) {
    console.error("Exception resolving booking service for accepted offer:", err);
    return null;
  }
}

export async function acceptOffer(offerId: string): Promise<boolean> {
  try {
    console.log("acceptOffer: called with offerId =", offerId);
    const offer = await getOfferWithContext(offerId);
    console.log(
      "acceptOffer: context resolved =",
      offer
        ? {
            request_id: offer.request_id,
            provider_id: offer.provider_id,
            has_request_row: Boolean(offer.requests),
            has_provider_row: Boolean(offer.providers),
          }
        : null
    );

    if (!offer?.request_id || !offer?.provider_id) {
      console.error("Offer missing request/provider context for booking creation.");
      return false;
    }

    const request = offer.requests;
    const provider = offer.providers;

    if (!request || !provider) {
      console.error("Offer is missing its request or provider row.");
      return false;
    }

    const serviceId = await getOfferBookingServiceId(
      offer.provider_id,
      request.category
    );

    if (!serviceId) {
      console.error(
        "Could not create a booking because the provider has no active service record for this offer."
      );
      return false;
    }

    const bookingDate =
      offer.estimated_start && typeof offer.estimated_start === "string"
        ? offer.estimated_start
        : new Date().toISOString().slice(0, 10);

    const paymentAmount = Number(
      offer.price ?? request.budget_max ?? request.budget_min ?? 0
    );

    /*
     * Shared MarzPay payment flow:
     *   create booking + payment as 'pending' (unique reference stored in
     *   payments.transaction_ref)
     *     -> invoke 'ninjawo-handler' Edge Function (MarzPay collection)
     *     -> 'marzpay-webhook' settles the payment (escrowed / failed)
     */
    const result = await initiateBookingPayment({
      customerId: request.customer_id,
      providerId: offer.provider_id,
      providerUserId: provider.user_id,
      serviceId,
      bookingDate,
      // The offer flow captures only a proposed start DATE (no time), so no
      // start/end time is invented here. End time/duration is never set.
      startTime: null,
      totalAmount: paymentAmount,
      description: `Accepted offer for ${request.title}`,
    });

    if (result.status === "error" || !result.booking || !result.payment) {
      console.error(
        "Accepted offer could not create booking and payment:",
        result.error
      );
      return false;
    }

    const { booking, payment } = result;

    if (result.status === "failed") {
      console.error(
        "Accepted offer payment failed:",
        result.error
      );
      return false;
    }

    // 'pending' or 'escrowed' both mean the booking exists and the payment
    // is in flight — the webhook completes the transition later.
    const finished = await setOfferStatus(offerId, "accepted");

    if (!finished) {
      console.error("Accepted offer status update failed after booking and payment creation.");
      return false;
    }

    const notificationsCreated = await createPaymentNotifications({
      customerId: request.customer_id,
      providerUserId: provider.user_id,
      bookingId: String(booking.id),
      paymentId: payment.id,
      amount: Number(offer.price ?? request.budget_max ?? request.budget_min ?? 0),
    });

    if (!notificationsCreated) {
      console.warn("Accepted offer created booking and payment but notification creation failed.");
    }

    return true;
  } catch (err) {
    console.error("Exception accepting offer and creating booking:", err);
    return false;
  }
}

export async function declineOffer(offerId: string): Promise<boolean> {
  return setOfferStatus(offerId, "declined");
}

// --------------------------------------------------
// EMAIL DELIVERY PLACEHOLDER
// --------------------------------------------------

export async function queueProviderRequestEmailDelivery(
  requestId: string,
  requestTitle: string,
  providerIds: string[],
  requestLink: string
) {
  try {
    const notifications =
      await createRequestNotificationsForProviders(
        requestId,
        providerIds,
        requestTitle,
        requestLink
      );

    return {
      queued: true,
      notificationsCount: notifications.length,
      requestId,
      requestLink,
      emailProvider:
        "resend-pending-domain-setup",
    };
  } catch (err) {
    console.error(
      "Exception queueing provider request email delivery:",
      err
    );

    return {
      queued: false,
      notificationsCount: 0,
      requestId,
      requestLink,
      emailProvider:
        "resend-pending-domain-setup",
    };
  }
}

export default {};
