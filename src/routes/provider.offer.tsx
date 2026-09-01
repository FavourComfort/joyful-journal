import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getCurrentProfile } from "@/lib/services/auth.service";
import { getProviderByUserId } from "@/lib/services/providers.service";
import {
  createOffer,
  getNotificationsForProvider,
  getProviderOfferForRequest,
  getRequestById,
  type CustomerRequest,
  type ProviderOffer,
} from "@/lib/services/requests.service";

function ProviderOfferComponent() {
  const router = useRouter();
  const { requestId } = Route.useSearch();
  const [request, setRequest] = useState<CustomerRequest | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [existingOffer, setExistingOffer] = useState<ProviderOffer | null>(null);
  const [message, setMessage] = useState("");
  const [price, setPrice] = useState("");
  const [estimatedStart, setEstimatedStart] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const profile = await getCurrentProfile();
      if (!profile) {
        await router.navigate({ to: "/login" });
        return;
      }
      if (profile.role !== "provider") {
        await router.navigate({ to: "/" });
        return;
      }

      const provider = await getProviderByUserId(profile.id);
      if (!provider) {
        await router.navigate({ to: "/provider/onboarding" });
        return;
      }

      const [requestData, notifications] = await Promise.all([
        getRequestById(requestId),
        getNotificationsForProvider(provider.id),
      ]);

      if (cancelled) return;

      if (!requestData || !notifications.some((item) => item.request_id === requestId)) {
        setError("This request is unavailable or is not matched to your provider account.");
        setLoading(false);
        return;
      }

      const offer = await getProviderOfferForRequest(requestId, provider.id);
      if (cancelled) return;

      setRequest(requestData);
      setProviderId(provider.id);
      setExistingOffer(offer);
      setLoading(false);
    };

    load().catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : "Unable to load this request.");
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [requestId, router]);

  const submitOffer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!providerId || !request || submitting || existingOffer) return;

    const quote = Number(price);
    if (!message.trim()) {
      setError("Add a message for the customer.");
      return;
    }
    if (!Number.isFinite(quote) || quote < 0) {
      setError("Enter a valid quote in UGX.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const offer = await createOffer({
      request_id: request.id,
      provider_id: providerId,
      message: message.trim(),
      price: quote,
      estimated_start: estimatedStart || null,
    });
    setSubmitting(false);

    if (!offer) {
      setError("Your offer could not be sent. Please try again.");
      return;
    }

    setExistingOffer(offer);
    setSuccess(true);
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f9f9ff]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#003d9b] border-t-transparent" /></div>;
  }

  if (!request) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f9f9ff] p-4"><div className="max-w-md rounded-xl bg-white p-6 text-center shadow-sm"><p className="mb-4 text-red-600">{error || "Request not found."}</p><button onClick={() => router.navigate({ to: "/provider/requests" })} className="rounded-lg bg-[#003d9b] px-4 py-2 font-semibold text-white">Back to requests</button></div></div>;
  }

  return (
    <main className="min-h-screen bg-[#f9f9ff] px-4 py-8 text-[#041b3c] md:px-16">
      <div className="mx-auto max-w-4xl">
        <button onClick={() => router.navigate({ to: "/provider/requests" })} className="mb-6 text-sm font-semibold text-[#003d9b] hover:underline">← Back to customer requests</button>
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <section className="rounded-xl border border-[#e8edff] bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-[#434654]">Customer request</p>
            <h1 className="mt-2 text-2xl font-bold">{request.title}</h1>
            <p className="mt-4 whitespace-pre-wrap text-[#434654]">{request.description}</p>
            <dl className="mt-6 space-y-3 border-t border-[#e8edff] pt-4 text-sm">
              <div><dt className="font-semibold">Location</dt><dd>{request.location || "Any location"}</dd></div>
              <div><dt className="font-semibold">Customer budget</dt><dd>{request.budget_min != null || request.budget_max != null ? `UGX ${Number(request.budget_min || 0).toLocaleString()} – ${Number(request.budget_max || 0).toLocaleString()}` : "Not specified"}</dd></div>
              <div><dt className="font-semibold">Posted</dt><dd>{new Date(request.created_at).toLocaleString()}</dd></div>
            </dl>
          </section>

          <section className="rounded-xl border border-[#e8edff] bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold">Send an offer</h2>
            {success || existingOffer ? (
              <div className="mt-5 rounded-lg bg-green-50 p-4 text-green-800"><p className="font-semibold">Offer sent</p><p className="mt-1 text-sm">Your quote is now visible to the customer.</p><button onClick={() => router.navigate({ to: "/provider/requests" })} className="mt-4 rounded-lg bg-[#003d9b] px-4 py-2 text-sm font-semibold text-white">Back to requests</button></div>
            ) : (
              <form className="mt-5 space-y-4" onSubmit={submitOffer}>
                <label className="block text-sm font-semibold">Message<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={5} required placeholder="Introduce your approach, availability, and anything the customer should know." className="mt-1 w-full rounded-lg border border-[#c3c6d6] p-3 font-normal focus:border-[#003d9b] focus:outline-none" /></label>
                <label className="block text-sm font-semibold">Your quote (UGX)<input value={price} onChange={(event) => setPrice(event.target.value)} required min="0" step="1" type="number" placeholder="e.g. 150000" className="mt-1 w-full rounded-lg border border-[#c3c6d6] p-3 font-normal focus:border-[#003d9b] focus:outline-none" /></label>
                <label className="block text-sm font-semibold">Estimated start <input value={estimatedStart} onChange={(event) => setEstimatedStart(event.target.value)} type="date" className="mt-1 w-full rounded-lg border border-[#c3c6d6] p-3 font-normal focus:border-[#003d9b] focus:outline-none" /></label>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button disabled={submitting} type="submit" className="w-full rounded-lg bg-[#003d9b] px-4 py-3 font-semibold text-white disabled:opacity-50">{submitting ? "Sending offer…" : "Send offer"}</button>
              </form>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

export const Route = createFileRoute("/provider/offer")({
  validateSearch: (search: Record<string, unknown>) => ({ requestId: String(search.requestId || "") }),
  head: () => ({ meta: [{ title: "Send Offer | NINJAWO" }] }),
  component: ProviderOfferComponent,
});
