import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getCurrentProfile } from "@/lib/services/auth.service";
import {
  getCustomerRequests,
  getOffersWithProvidersForRequests,
  acceptOffer,
  declineOffer,
  type CustomerRequest,
} from "@/lib/services/requests.service";

interface OfferWithProvider {
  id: string;
  request_id: string;
  provider_id: string;
  message?: string;
  price?: number | null;
  estimated_start?: string | null;
  status?: "pending" | "accepted" | "declined";
  created_at: string;
  provider_business_name?: string;
}

function MyRequestsComponent() {
  const router = useRouter();
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [offers, setOffers] = useState<Record<string, OfferWithProvider[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const profile = await getCurrentProfile();
        if (cancelled) return;
        if (!profile) {
          await router.navigate({ to: "/login" });
          return;
        }

        const customerRequests = await getCustomerRequests(profile.id);
        if (cancelled) return;

        setRequests(customerRequests);

        const requestIds = customerRequests.map((r) => r.id);
        const offersData = await getOffersWithProvidersForRequests(requestIds);

        const grouped: Record<string, OfferWithProvider[]> = {};
        for (const offer of offersData) {
          if (!grouped[offer.request_id]) grouped[offer.request_id] = [];
          grouped[offer.request_id].push(offer as OfferWithProvider);
        }

        setOffers(grouped);
        setReady(true);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load your requests.");
        setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const refresh = async () => {
    const profile = await getCurrentProfile();
    if (!profile) return;

    const customerRequests = await getCustomerRequests(profile.id);
    setRequests(customerRequests);

    const offersData = await getOffersWithProvidersForRequests(
      customerRequests.map((r) => r.id)
    );

    const grouped: Record<string, OfferWithProvider[]> = {};
    for (const offer of offersData) {
      if (!grouped[offer.request_id]) grouped[offer.request_id] = [];
      grouped[offer.request_id].push(offer as OfferWithProvider);
    }

    setOffers(grouped);
  };

  const handleAccept = async (offerId: string) => {
    setActionError(null);
    try {
      const ok = await acceptOffer(offerId);
      if (!ok) {
        setActionError("Could not accept this offer. Please try again.");
        return;
      }
      await refresh();
    } catch (err) {
      console.error("Error accepting offer:", err);
      setActionError("Could not accept this offer. Please try again.");
    }
  };

  const handleDecline = async (offerId: string) => {
    setActionError(null);
    try {
      const ok = await declineOffer(offerId);
      if (!ok) {
        setActionError("Could not decline this offer. Please try again.");
        return;
      }
      await refresh();
    } catch (err) {
      console.error("Error declining offer:", err);
      setActionError("Could not decline this offer. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f9f9ff]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#003d9b] border-t-transparent" />
      </div>
    );
  }

  if (error && !ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f9f9ff]">
        <div className="max-w-md px-4 text-center">
          <p className="mb-4 text-red-600">{error}</p>
          <button
            onClick={() => router.navigate({ to: "/" })}
            className="rounded-xl bg-[#003d9b] px-6 py-3 text-sm font-semibold text-white"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f9f9ff] text-[#041b3c]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white shadow-sm">
        <nav className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-4 py-2 md:px-16">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.navigate({ to: "/" })}
              className="rounded-lg p-1 text-[#003d9b] hover:bg-[#f1f3ff]"
              aria-label="Back to home"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <span className="text-2xl font-bold text-[#003d9b]">NINJAWO</span>
          </div>
            <div className="flex items-center gap-4">
             <button
               onClick={() => router.navigate({ to: "/post-request" })}
               className="rounded-xl bg-[#003d9b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0052cc]"
             >
               + Post a Request
             </button>
           </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[960px] px-4 py-8 md:px-16">
        <h1 className="mb-6 text-3xl font-bold">My Requests</h1>

        {actionError && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {actionError}
          </div>
        )}

        {requests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#c3c6d6] bg-white p-10 text-center">
            <p className="mb-2 text-lg font-semibold">No requests posted yet</p>
            <p className="mb-6 text-[#434654]">
              Post a service request and providers will respond with offers.
            </p>
            <button
              onClick={() => router.navigate({ to: "/post-request" })}
              className="rounded-xl bg-[#003d9b] px-6 py-3 text-sm font-semibold text-white hover:bg-[#0052cc]"
            >
              Post a Request
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {requests.map((request) => {
              const requestOffers = offers[request.id] || [];
              return (
                <div
                  key={request.id}
                  className="rounded-xl border border-[#e8edff] bg-white p-4 shadow-sm"
                >
                  <div className="mb-1 flex flex-col items-start gap-2 sm:flex-row sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <h2 className="break-words text-lg font-bold">{request.title}</h2>
                      <p className="mb-2 break-words text-sm text-[#434654]">{request.description}</p>
                    </div>
                    <span className="max-w-full shrink-0 truncate rounded-full bg-[#dae2ff] px-3 py-1 text-xs font-semibold text-[#0040a2] sm:max-w-[40%]">
                      {request.location || "Any location"}
                    </span>
                  </div>
                  {request.budget_max != null && (
                    <p className="mb-3 text-sm font-semibold text-[#003d9b]">
                      Budget: UGX {Number(request.budget_max).toLocaleString()}
                    </p>
                  )}

                  {/* Offers */}
                  <div className="mt-4">
                    <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#434654]">
                      Offers ({requestOffers.length})
                    </h3>
                    {requestOffers.length === 0 ? (
                      <p className="text-sm text-[#737685]">
                        No offers yet. Providers will respond soon.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {requestOffers.map((offer) => (
                          <div
                            key={offer.id}
                            className="rounded-lg border border-[#e8edff] bg-[#f9f9ff] p-3"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                              <div className="min-w-0">
                                <p className="break-words font-semibold">
                                  {offer.provider_business_name || "Provider"}
                                </p>
                                {offer.price != null && (
                                  <p className="text-sm font-bold text-[#003d9b]">
                                    UGX {Number(offer.price).toLocaleString()}
                                    <span className="ml-1 text-xs font-normal text-[#737685]">
                                      (you pay {Number(offer.price * 1.02).toLocaleString(undefined, { maximumFractionDigits: 2 })})
                                    </span>
                                  </p>
                                )}
                                {offer.message && (
                                  <p className="mt-1 text-sm text-[#434654]">{offer.message}</p>
                                )}
                                {offer.estimated_start && (
                                  <p className="mt-1 text-xs text-[#737685]">
                                    Est. start: {offer.estimated_start}
                                  </p>
                                )}
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-2">
                                <button
                                  onClick={() =>
                                    router.navigate({
                                      to: "/provider/$id",
                                      params: { id: offer.provider_id },
                                    })
                                  }
                                  className="min-h-11 rounded-lg border border-[#c3c6d6] px-4 py-2 text-sm font-semibold text-[#003d9b] hover:bg-[#f1f3ff]"
                                >
                                  View Profile
                                </button>
                                {offer.status === "pending" ? (
                                  <>
                                    <button
                                      onClick={() => handleAccept(offer.id)}
                                      className="min-h-11 rounded-lg bg-[#003d9b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0052cc]"
                                    >
                                      Accept
                                    </button>
                                    <button
                                      onClick={() => handleDecline(offer.id)}
                                      className="min-h-11 rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                                    >
                                      Decline
                                    </button>
                                  </>
                                ) : (
                                  <span
                                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                      offer.status === "accepted"
                                        ? "bg-green-100 text-green-700"
                                        : "bg-red-100 text-red-700"
                                    }`}
                                  >
                                    {offer.status === "accepted" ? "Accepted" : "Declined"}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export const Route = createFileRoute("/my-requests")({
  head: () => ({ meta: [{ title: "My Requests | NINJAWO" }] }),
  component: MyRequestsComponent,
});