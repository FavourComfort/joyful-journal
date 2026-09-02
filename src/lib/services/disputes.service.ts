import { supabase } from "../supabase";

export type DisputeStatus =
  | "open"
  | "provider_responded"
  | "resolved_customer"
  | "resolved_provider"
  | "closed";

export type DisputeReason =
  | "service_not_delivered"
  | "service_not_as_described"
  | "other";

export type DisputeDecision = "refund" | "release";

export interface Dispute {
  id: string;
  booking_id: string;
  customer_id: string;
  provider_id: string;
  reason: DisputeReason;
  description?: string | null;
  status: DisputeStatus;
  provider_response?: string | null;
  admin_notes?: string | null;
  decision?: DisputeDecision | null;
  raised_at: string;
  responded_at?: string | null;
  resolved_at?: string | null;
  updated_at: string;
}

export interface DisputeWithNames extends Dispute {
  customer_name: string;
  provider_business_name: string;
  booking_amount?: number;
}

/** Human-facing labels for the dispute lifecycle. */
export const DISPUTE_STATUS_LABELS: Record<DisputeStatus, string> = {
  open: "Awaiting provider response",
  provider_responded: "Provider responded — awaiting review",
  resolved_customer: "Resolved — refunded to customer",
  resolved_provider: "Resolved — released to provider",
  closed: "Closed",
};

export const DISPUTE_REASON_LABELS: Record<DisputeReason, string> = {
  service_not_delivered: "Service was not delivered",
  service_not_as_described: "Service not as described",
  other: "Other",
};

type DisputeRpcResult = { success?: boolean; error?: string; dispute?: Dispute };

function ensureRpcSuccess(result: DisputeRpcResult | null): DisputeRpcResult {
  if (!result?.success) {
    throw new Error(result?.error || "The dispute action could not be completed.");
  }
  return result;
}

/**
 * Customer raises a dispute because a service wasn't delivered. Atomically moves
 * booking.status -> 'disputed', payment -> 'disputed' and inserts a dispute row
 * in the 'open' state.
 */
export async function raiseDispute(
  bookingId: string,
  reason: DisputeReason,
  description?: string
): Promise<Dispute | null> {
  try {
    const { data, error } = await supabase.rpc("raise_dispute", {
      p_booking_id: bookingId,
      p_reason: reason,
      p_description: description || null,
    });
    if (error) throw error;
    return (ensureRpcSuccess(data as DisputeRpcResult).dispute || null) as Dispute | null;
  } catch (error) {
    console.error("Error raising dispute:", error);
    return null;
  }
}

/** Assigned provider replies to an open dispute; it moves to awaiting review. */
export async function respondToDispute(
  disputeId: string,
  providerResponse: string
): Promise<Dispute | null> {
  try {
    const { data, error } = await supabase.rpc("respond_to_dispute", {
      p_dispute_id: disputeId,
      p_provider_response: providerResponse,
    });
    if (error) throw error;
    return (ensureRpcSuccess(data as DisputeRpcResult).dispute || null) as Dispute | null;
  } catch (error) {
    console.error("Error responding to dispute:", error);
    return null;
  }
}

/**
 * Admin adjudicates a dispute. Pending the "refund" / "release" decision the
 * booking and escrow payment are resolved atomically and the dispute closed.
 */
export async function adjudicateDispute(
  disputeId: string,
  decision: DisputeDecision,
  adminNotes?: string
): Promise<Dispute | null> {
  try {
    const { data, error } = await supabase.rpc("adjudicate_dispute", {
      p_dispute_id: disputeId,
      p_decision: decision,
      p_admin_notes: adminNotes || null,
    });
    if (error) throw error;
    return (ensureRpcSuccess(data as DisputeRpcResult).dispute || null) as Dispute | null;
  } catch (error) {
    console.error("Error adjudicating dispute:", error);
    return null;
  }
}

/** Admin closes a dispute without moving money. */
export async function closeDispute(
  disputeId: string,
  adminNotes?: string
): Promise<Dispute | null> {
  try {
    const { data, error } = await supabase.rpc("close_dispute", {
      p_dispute_id: disputeId,
      p_admin_notes: adminNotes || null,
    });
    if (error) throw error;
    return (ensureRpcSuccess(data as DisputeRpcResult).dispute || null) as Dispute | null;
  } catch (error) {
    console.error("Error closing dispute:", error);
    return null;
  }
}
export async function getDisputeByBookingId(
  bookingId: string
): Promise<Dispute | null> {
  try {
    const { data, error } = await supabase
      .from("disputes")
      .select("*")
      .eq("booking_id", bookingId)
      .maybeSingle();
    if (error) {
      console.error("Error fetching dispute:", error);
      return null;
    }
    return (data as Dispute) || null;
  } catch (error) {
    console.error("Error getting dispute by booking:", error);
    return null;
  }
}

/** Fetch disputes for a set of bookings (used to enrich dashboards). */
export async function getDisputesForBookings(
  bookingIds: string[]
): Promise<Dispute[]> {
  if (!bookingIds.length) return [];
  try {
    const { data, error } = await supabase
      .from("disputes")
      .select("*")
      .in("booking_id", bookingIds);
    if (error) {
      console.error("Error fetching disputes for bookings:", error);
      return [];
    }
    return (data || []) as Dispute[];
  } catch (error) {
    console.error("Error getting disputes for bookings:", error);
    return [];
  }
}

export async function getCustomerDisputes(
  customerId: string
): Promise<Dispute[]> {
  try {
    const { data, error } = await supabase
      .from("disputes")
      .select("*")
      .eq("customer_id", customerId)
      .order("raised_at", { ascending: false });
    if (error) {
      console.error("Error fetching customer disputes:", error);
      return [];
    }
    return (data || []) as Dispute[];
  } catch (error) {
    console.error("Error getting customer disputes:", error);
    return [];
  }
}

export async function getProviderDisputes(
  providerId: string
): Promise<Dispute[]> {
  try {
    const { data, error } = await supabase
      .from("disputes")
      .select("*")
      .eq("provider_id", providerId)
      .order("raised_at", { ascending: false });
    if (error) {
      console.error("Error fetching provider disputes:", error);
      return [];
    }
    return (data || []) as Dispute[];
  } catch (error) {
    console.error("Error getting provider disputes:", error);
    return [];
  }
}
/** Every dispute with the customer + provider context, for the admin console. */
export async function getAllDisputesForAdmin(): Promise<DisputeWithNames[]> {
  try {
    const { data, error } = await supabase
      .from("disputes")
      .select("*")
      .order("raised_at", { ascending: false });
    if (error) {
      console.error("Error fetching all disputes:", error);
      return [];
    }

    const disputes = (data || []) as Dispute[];
    const customerIds = [...new Set(disputes.map((d) => d.customer_id).filter(Boolean))];
    const providerIds = [...new Set(disputes.map((d) => d.provider_id).filter(Boolean))];
    const bookingIds = [...new Set(disputes.map((d) => d.booking_id).filter(Boolean))];

    const [customerProfiles, providers, bookingsRows] = await Promise.all([
      fetchClientProfiles(customerIds),
      fetchAdminProviders(providerIds),
      bookingIds.length
        ? supabase.from("bookings").select("id, total_amount, service_id").in("id", bookingIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    return disputes.map((d) => ({
      ...d,
      customer_name: customerProfiles[d.customer_id]?.full_name || "—",
      provider_business_name: providers[d.provider_id]?.business_name || "—",
      booking_amount:
        (bookingsRows.data || [])?.find((b: any) => b.id === d.booking_id)?.total_amount ??
        undefined,
    }));
  } catch (error) {
    console.error("Exception fetching disputes for admin:", error);
    return [];
  }
}

async function fetchClientProfiles(
  userIds: string[]
): Promise<Record<string, { full_name?: string }>> {
  if (!userIds.length) return {};
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", userIds);
  return Object.fromEntries((data || []).map((p: any) => [p.id, p as { full_name?: string }]));
}

async function fetchAdminProviders(
  providerIds: string[]
): Promise<Record<string, { business_name?: string }>> {
  if (!providerIds.length) return {};
  const { data } = await supabase
    .from("providers")
    .select("id, business_name")
    .in("id", providerIds);
  return Object.fromEntries((data || []).map((p: any) => [p.id, p as { business_name?: string }]));
}

/** True when a dispute is still live (not yet resolved/closed) for the booking. */
export function bookingHasActiveDispute(
  disputes: Dispute[],
  bookingId: string
): boolean {
  const dispute = disputes.find((d) => d.booking_id === bookingId);
  if (!dispute) return false;
  return (
    dispute.status !== "resolved_customer" &&
    dispute.status !== "resolved_provider" &&
    dispute.status !== "closed"
  );
}

export default {};