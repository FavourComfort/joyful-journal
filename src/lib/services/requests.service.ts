import { createBooking, updateBookingStatus } from "./bookings.service";
import { createPaymentNotifications } from "./notifications.service";
import { createPayment } from "./payments.service";
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
      .select(
        `
          id,
          user_id,
          business_name,
          location,
          verified,
          created_at,
          services!inner(
            category
          )
        `
      )
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

    /*
     * Match the detected category when we know one.
     *
     * "other" means our current classifier could not
     * confidently determine the category, so we don't
     * restrict providers by category at all.
     */
    if (
      category?.trim() &&
      category.trim() !== "other"
    ) {
      qb = qb.eq(
        "services.category",
        category.trim()
      );
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

    const { data, error } = await supabase
      .from("request_notifications")
      .insert(rows)
      .select();

    if (error) {
      console.error(
        "Error creating provider notifications:",
        error
      );
      return [];
    }

    return (data || []) as RequestNotification[];
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

export async function getRequestsForProvider(
  location?: string
) {
  try {
    let qb = supabase
      .from("requests")
      .select("*");

    /*
     * For now we use the provider's location to find
     * potentially relevant requests.
     *
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

    return (data || []) as CustomerRequest[];
  } catch (err) {
    console.error(
      "Exception fetching requests for provider:",
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

    const { data, error } = await supabase
      .from("offers")
      .select("*, providers(business_name)")
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

    return (data || []).map((offer: any) => ({
      ...offer,
      provider_business_name:
        offer.providers?.business_name || "Provider",
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

async function getOfferWithContext(offerId: string) {
  try {
    const { data, error } = await supabase
      .from("offers")
      .select(
        `
          *,
          requests:request_id (
            id,
            customer_id,
            title,
            description,
            category,
            location,
            budget_min,
            budget_max,
            created_at
          ),
          providers:provider_id (
            id,
            user_id,
            business_name
          )
        `
      )
      .eq("id", offerId)
      .maybeSingle();

    if (error) {
      console.error("Error loading offer for booking creation:", error);
      return null;
    }

    return data as
      | (Record<string, unknown> & {
          request_id: string;
          provider_id: string;
          price?: number | null;
          estimated_start?: string | null;
          requests?: {
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
          providers?: {
            id: string;
            user_id: string;
            business_name?: string | null;
          } | null;
        })
      | null;
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
    const offer = await getOfferWithContext(offerId);

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

    const booking = await createBooking(
      request.customer_id,
      offer.provider_id,
      serviceId,
      bookingDate,
      "09:00",
      "11:00",
      Number(offer.price ?? request.budget_max ?? request.budget_min ?? 0)
    );

    if (!booking) {
      console.error("Accepted offer could not create a booking record.");
      return false;
    }

    const paymentReference = `OFFER-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`;

    const payment = await createPayment(
      booking.id,
      request.customer_id,
      offer.provider_id,
      Number(offer.price ?? request.budget_max ?? request.budget_min ?? 0),
      "mock_checkout",
      paymentReference
    );

    if (!payment) {
      console.error("Accepted offer could not create a payment record.");
      return false;
    }

    if (!payment || payment.payment_status !== "escrowed") {
      console.error("Accepted offer payment could not be secured in escrow.");
      return false;
    }

    const confirmedBooking = await updateBookingStatus(booking.id, "confirmed");

    if (!confirmedBooking) {
      console.error("Accepted offer booking could not be confirmed.");
      return false;
    }

    const finished = await setOfferStatus(offerId, "accepted");

    if (!finished) {
      console.error("Accepted offer status update failed after booking and payment creation.");
      return false;
    }

    const notificationsCreated = await createPaymentNotifications({
      customerId: request.customer_id,
      providerUserId: provider.user_id,
      bookingId: confirmedBooking.id,
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
