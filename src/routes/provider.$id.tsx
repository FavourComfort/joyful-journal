import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getProviderById, type Provider } from "@/lib/services/providers.service";
import { getServicesByProviderId, type Service } from "@/lib/services/services.service";
import { getProviderReviews, getProviderAverageRating, type Review } from "@/lib/services/reviews.service";
import { getCurrentProfile } from "@/lib/services/auth.service";
import { sendMessage } from "@/lib/services/messages.service";

function ProviderProfileComponent() {
  const { id } = Route.useParams();
  const router = useRouter();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [avgRating, setAvgRating] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState<string | null>(null);
  const [messageSent, setMessageSent] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [providerData, servicesData, reviewsData, rating, profile] = await Promise.all([
          getProviderById(id),
          getServicesByProviderId(id),
          getProviderReviews(id),
          getProviderAverageRating(id),
          getCurrentProfile(),
        ]);

        if (cancelled) return;

        if (!providerData) {
          setError("Provider not found.");
          setLoading(false);
          return;
        }

        setProvider(providerData);
        setServices(servicesData);
        setReviews(reviewsData);
        setAvgRating(rating);
        setIsLoggedIn(!!profile);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load provider.");
        setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleBookNow = () => {
    if (!selectedService) {
      setError("Please select a service first.");
      return;
    }

    if (!isLoggedIn) {
      sessionStorage.setItem(
        "authRedirect",
        `/book?providerId=${id}&serviceId=${selectedService.id}`
      );
      router.navigate({ to: "/login" });
      return;
    }

    router.navigate({
      to: "/book",
      search: { providerId: id, serviceId: selectedService.id },
    });
  };

  const handleMessageProvider = () => {
    if (!isLoggedIn) {
      sessionStorage.setItem("authRedirect", `/provider/${id}`);
      router.navigate({ to: "/login" });
      return;
    }
    setMessageError(null);
    setMessageSent(false);
    setMessageOpen(true);
  };

  const handleSendMessage = async () => {
    if (!message.trim()) {
      setMessageError("Write a message before sending.");
      return;
    }

    setSendingMessage(true);
    setMessageError(null);
    try {
      await sendMessage(id, message);
      setMessage("");
      setMessageSent(true);
    } catch (err) {
      setMessageError(err instanceof Error ? err.message : "Failed to send your message.");
    } finally {
      setSendingMessage(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f9f9ff]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#003d9b] border-t-transparent" />
      </div>
    );
  }

  if (error || !provider) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f9f9ff]">
        <div className="max-w-md px-4 text-center">
          <p className="mb-4 text-red-600">{error || "Provider not found."}</p>
          <button
            onClick={() => router.navigate({ to: "/search" })}
            className="rounded-xl bg-[#003d9b] px-6 py-3 text-sm font-semibold text-white"
          >
            Back to Search
          </button>
        </div>
      </div>
    );
  }

  const fallbackImage = "/images/dashboard-default-avatar.png";

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
          <div className="hidden items-center gap-6 md:flex">
            <button
              onClick={() => router.navigate({ to: "/search" })}
              className="text-sm font-semibold text-[#003d9b]"
            >
              Explore
            </button>
            <button
              onClick={() => router.navigate({ to: "/inbox" })}
              className="text-sm font-semibold text-[#434654] hover:text-[#003d9b]"
            >
              Inbox
            </button>
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[1440px] px-4 pb-12 md:px-16">
        {/* Profile Hero */}
        <section className="relative w-full">
          <div className="h-48 w-full overflow-hidden bg-gradient-to-r from-[#dae2ff] to-[#e8edff] md:h-64">
            <div className="flex h-full items-center justify-center">
              <span className="material-symbols-outlined text-[80px] text-[#003d9b]/20">
                business_center
              </span>
            </div>
          </div>
          <div className="relative z-10 -mt-12 px-4 md:-mt-16 md:px-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-end">
              <div className="h-24 w-24 overflow-hidden rounded-xl border-4 border-white bg-white shadow-lg md:h-32 md:w-32">
                <img
                  className="h-full w-full object-cover"
                  src={provider.profile_picture_url || fallbackImage}
                  alt={provider.business_name}
                />
              </div>
              <div className="pb-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-bold md:text-3xl">
                    {provider.business_name}
                  </h2>
                  {provider.verified && (
                    <span
                      className="material-symbols-outlined text-[#003d9b]"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      verified
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#434654]">
                  {avgRating > 0 && (
                    <>
                      <span className="flex items-center text-[#5e3c00]">
                        <span
                          className="material-symbols-outlined text-sm"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          star
                        </span>
                        <span className="ml-1 font-bold">{avgRating.toFixed(1)}</span>
                      </span>
                      <span className="text-[#737685]">•</span>
                    </>
                  )}
                  <span>{reviews.length} Reviews</span>
                  {provider.location && (
                    <>
                      <span className="text-[#737685]">•</span>
                      <span>{provider.location}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-12">
          {/* Left: About & Reviews */}
          <div className="space-y-6 md:col-span-8">
            {/* About */}
            <div className="rounded-xl border border-[#e8edff] bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-xl font-bold">About</h3>
              <p className="leading-relaxed text-[#434654]">
                {provider.bio || "This provider hasn't added a description yet."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {provider.verified ? (
                  <span className="flex items-center gap-1 rounded-lg bg-[#dae2ff] px-2 py-1 text-xs font-semibold text-[#0040a2]">
                    <span className="material-symbols-outlined text-sm">
                      workspace_premium
                    </span>
                    Certified Expert
                  </span>
                ) : (
                  <span className="rounded-lg bg-[#fef3c7] px-2 py-1 text-xs font-semibold text-[#92400e]">
                    Pending verification
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-[#e8edff] bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold">Have a question?</h3>
                  <p className="mt-1 text-sm text-[#434654]">
                    Talk to {provider.business_name} before booking a service.
                  </p>
                </div>
                <span className="material-symbols-outlined text-[#003d9b]">chat</span>
              </div>
              {!messageOpen ? (
                <button
                  onClick={handleMessageProvider}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#003d9b] py-3 font-semibold text-[#003d9b] transition-colors hover:bg-[#dae2ff]"
                >
                  <span className="material-symbols-outlined">mail</span>
                  Message Provider
                </button>
              ) : (
                <div className="mt-4">
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    rows={4}
                    maxLength={1000}
                    placeholder={`Ask ${provider.business_name} a question...`}
                    className="w-full resize-y rounded-lg border border-[#c3c6d6] p-3 text-sm outline-none focus:border-[#003d9b] focus:ring-2 focus:ring-[#dae2ff]"
                  />
                  {messageSent && (
                    <p className="mt-2 text-sm font-semibold text-green-700">
                      Message sent. You can continue the conversation in your inbox.
                    </p>
                  )}
                  {messageError && <p className="mt-2 text-sm text-red-600">{messageError}</p>}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={handleSendMessage}
                      disabled={sendingMessage || messageSent}
                      className="flex-1 rounded-lg bg-[#003d9b] py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {sendingMessage ? "Sending..." : messageSent ? "Sent" : "Send Message"}
                    </button>
                    <button
                      onClick={() => setMessageOpen(false)}
                      className="rounded-lg border border-[#c3c6d6] px-4 py-2.5 text-sm font-semibold text-[#434654]"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Reviews */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xl font-bold">Client Reviews</h3>
              </div>
              {reviews.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#c3c6d6] bg-white p-6 text-center text-[#434654]">
                  No reviews yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {reviews.slice(0, 5).map((review) => (
                    <div
                      key={review.id}
                      className="rounded-xl border border-[#e8edff] bg-white p-4 shadow-sm"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#dee0e2] text-sm font-bold text-[#434654]">
                            {review.customer_id.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="text-sm font-semibold">Customer</span>
                        </div>
                        <div className="flex text-[#5e3c00]">
                          {Array.from({ length: review.rating }).map((_, i) => (
                            <span
                              key={i}
                              className="material-symbols-outlined text-sm"
                              style={{ fontVariationSettings: "'FILL' 1" }}
                            >
                              star
                            </span>
                          ))}
                        </div>
                      </div>
                      {review.comment && (
                        <p className="text-sm italic text-[#434654]">
                          "{review.comment}"
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          

          {/* Services & Booking */}
          <div className="md:col-span-4">
            <div className="sticky top-20 space-y-4">
              <div className="rounded-xl border border-[#e8edff] bg-white p-4 shadow-sm">
                <h3 className="mb-4 text-xl font-bold">Listed Services</h3>
                {services.length === 0 ? (
                  <p className="text-sm text-[#434654]">No services listed yet.</p>
                ) : (
                  <div className="space-y-3">
                    {services.map((service) => (
                      <div
                        key={service.id}
                        className={`rounded-lg border p-3 transition-colors ${
                          selectedService?.id === service.id
                            ? "border-[#003d9b] bg-[#dae2ff]/30"
                            : "border-transparent hover:border-[#c3c6d6] hover:bg-[#f1f3ff]"
                        }`}
                      >
                        <div className="mb-1 flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate font-bold">{service.title}</span>
                          <span className="shrink-0 font-bold text-[#003d9b]">
                            UGX {Number(service.price).toLocaleString()}
                          </span>
                        </div>
                        {service.description && (
                          <p className="mb-2 text-xs text-[#434654]">
                            {service.description}
                          </p>
                        )}
                        {service.duration_minutes && (
                          <p className="mb-2 text-xs text-[#434654]">
                            {service.duration_minutes} minutes
                          </p>
                        )}
                        <button
                          onClick={() =>
                            selectedService?.id === service.id
                              ? setSelectedService(null)
                              : window.confirm(
                                  `Are you sure you want to select ${service.title}?`
                                ) && setSelectedService(service)
                          }
                          className={`mt-1 w-full rounded-lg border py-1.5 text-sm font-semibold transition-colors ${
                            selectedService?.id === service.id
                              ? "border-[#003d9b] bg-[#003d9b] text-white"
                              : "border-[#003d9b] text-[#003d9b] hover:bg-[#dae2ff]"
                          }`}
                        >
                          {selectedService?.id === service.id
                            ? "Selected"
                            : "Select Service"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 border-t border-[#e8edff] pt-4">
                  <button
                    onClick={handleBookNow}
                    disabled={!selectedService}
                    className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 font-bold shadow-lg transition-all ${
                      selectedService
                        ? "bg-[#003d9b] text-white hover:bg-[#0052cc] active:scale-[0.98]"
                        : "cursor-not-allowed bg-[#e0e8ff] text-[#737685]"
                    }`}
                  >
                    <span className="material-symbols-outlined">calendar_today</span>
                    {selectedService ? "Book Now" : "Select a Service First"}
                  </button>
                  {error && (
                    <p className="mt-2 text-center text-sm text-red-600">{error}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}



export const Route = createFileRoute("/provider/$id")({
  head: () => ({ meta: [{ title: "Provider Profile | NINJAWO" }] }),
  component: ProviderProfileComponent,
});