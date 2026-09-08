import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getCurrentProfile } from "@/lib/services/auth.service";
import {
  getProviderById,
  type Provider,
} from "@/lib/services/providers.service";
import {
  getServiceById,
  type Service,
} from "@/lib/services/services.service";
import {
  initiateBookingPayment,
} from "@/lib/services/payments.service";
import { createPaymentNotifications } from "@/lib/services/notifications.service";

// 30-minute time slots (00:00 – 23:30) for the start-time dropdown.
// A native <input type="time"> picker was unusable on Android (no
// confirm/"Set" button when empty), so we use our own slot list instead.
const TIME_OPTIONS: { value: string; label: string }[] =
  Array.from({ length: 48 }, (_, i) => {
    const h = Math.floor(i / 2);
    const m = i % 2 === 0 ? "00" : "30";
    const value = `${String(h).padStart(2, "0")}:${m}`;
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    const ampm = h < 12 ? "AM" : "PM";
    return { value, label: `${value} (${hour12}:${m} ${ampm})` };
  });

function BookComponent() {
  const router = useRouter();
  const search = Route.useSearch();

  const [provider, setProvider] = useState<Provider | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [bookingDate, setBookingDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [paymentPending, setPaymentPending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const profile = await getCurrentProfile();

        if (cancelled) return;

        if (!profile) {
          sessionStorage.setItem(
            "authRedirect",
            `/book?providerId=${search.providerId}&serviceId=${search.serviceId}`
          );

          await router.navigate({ to: "/login" });
          return;
        }

        const [providerData, serviceData] = await Promise.all([
          getProviderById(search.providerId),
          getServiceById(search.serviceId),
        ]);

        if (cancelled) return;

        if (!providerData || !serviceData) {
          setError("Provider or service not found.");
          setLoading(false);
          return;
        }

        setProvider(providerData);
        setService(serviceData);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;

        setError(
          err instanceof Error
            ? err.message
            : "Failed to load booking details."
        );

        setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [router, search.providerId, search.serviceId]);

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (submitting) return;

    if (!bookingDate || !startTime) {
      setError("Please select a date and a preferred start time.");
      return;
    }

    if (!provider) {
      setError("Provider information is missing.");
      return;
    }

    if (!service) {
      setError("Service information is missing.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const profile = await getCurrentProfile();

      if (!profile) {
        setError("You must be signed in to book.");
        setSubmitting(false);
        return;
      }

      /*
       * Shared MarzPay payment flow:
       *   create booking + payment as 'pending'
       *     -> invoke 'ninjawo-handler' Edge Function (MarzPay collection)
       *     -> 'marzpay-webhook' settles the payment (escrowed / failed)
       */
      const result = await initiateBookingPayment({
        customerId: profile.id,
        providerId: search.providerId,
        providerUserId: provider.user_id,
        serviceId: search.serviceId,
        bookingDate,
        startTime,
        totalAmount: service.price || 0,
        description: `Booking with ${provider.full_name}`,
      });

      if (
        result.status === "error" ||
        !result.booking ||
        !result.payment
      ) {
        setError(
          result.error ||
            "We could not create your booking. Please try again."
        );
        setSubmitting(false);
        return;
      }

      const { booking, payment } = result;

      if (result.status === "failed") {
        setError(
          result.error ||
            "Your payment could not be processed. Please try again."
        );
        setSubmitting(false);
        return;
      }

      // 'pending' or 'escrowed' both mean the booking exists and the
      // payment is in flight — the webhook completes the transition.
      setPaymentPending(result.status === "pending");

      /*
       * STEP 2
       * Create notifications for BOTH sides.
       *
       * Customer:
       * "Payment is being processed and will be held in escrow until
       * service confirmation"
       *
       * Provider:
       * "New booking received; funds will be held by NINJAWO"
       */
      const notificationsCreated =
        await createPaymentNotifications({
          customerId: profile.id,
          providerUserId: provider.user_id,
          bookingId: String(booking.id),
          paymentId: payment.id,
          amount: service.price || 0,
        });

      if (!notificationsCreated) {
        /*
         * The booking and payment are already successful.
         *
         * We don't want to tell the customer that their booking
         * failed just because notification creation failed.
         *
         * Log it so we can fix notification permissions/RLS.
         */
        console.warn(
          "Booking/payment succeeded, but one or more notifications could not be created."
        );
      }

      /*
      * STEP 3
       * Everything important succeeded.
       */
      setSuccess(true);
      setSubmitting(false);
    } catch (err) {
      console.error("Booking error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to create booking."
      );

      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f9f9ff]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#003d9b] border-t-transparent" />
      </div>
    );
  }

  if (error && !provider) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f9f9ff]">
        <div className="max-w-md px-4 text-center">
          <p className="mb-4 text-red-600">{error}</p>

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

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f9f9ff]">
        <div className="max-w-md rounded-xl border border-[#e8edff] bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <span className="material-symbols-outlined text-3xl text-green-600">
              check_circle
            </span>
          </div>

          <h2 className="mb-2 text-2xl font-bold text-[#041b3c]">
            {paymentPending
              ? "Booking Created — Awaiting Payment"
              : "Booking Confirmed!"}
          </h2>

          <p className="mb-6 text-[#434654]">
            {paymentPending
              ? `Your booking with ${provider?.business_name} has been created and your payment is being processed. You will receive a confirmation as soon as the payment is verified.`
              : `Your booking with ${provider?.business_name} has been confirmed and your payment was successful.`}
          </p>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => router.navigate({ to: "/" })}
              className="w-full rounded-xl border border-[#c3c6d6] px-6 py-3 text-sm font-semibold text-[#434654] hover:bg-[#f1f3ff]"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const fallbackImage =
    "/images/dashboard-default-avatar.png";

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
              <span className="material-symbols-outlined">
                
              </span>
            </button>

            <span className="text-2xl font-bold text-[#003d9b]">
              NINJAWO
            </span>
          </div>

          <div className="hidden items-center gap-6 md:flex">
            <span className="text-sm font-semibold text-[#434654]">
              Step 2 of 3: Schedule
            </span>
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[1440px] px-4 py-8 md:px-16">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: Booking Form */}
          <div className="space-y-6 lg:col-span-7">
            {/* Provider Recap */}
            <div className="flex items-center gap-4 rounded-xl border border-[#e8edff] bg-white p-4 shadow-sm">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg">
                <img
                  className="h-full w-full object-cover"
                  src={
                    provider?.profile_picture_url ||
                    fallbackImage
                  }
                  alt={provider?.business_name}
                />
              </div>

              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-[#003d9b]">
                  {service?.title}
                </h2>

                <p className="truncate text-sm text-[#434654]">
                  with {provider?.business_name}
                </p>
              </div>
            </div>

            {/* Date Selection */}
            <div className="rounded-xl border border-[#e8edff] bg-white p-4 shadow-sm">
              <h3 className="mb-4 text-lg font-bold">
                Select a Date
              </h3>

              <input
                type="date"
                value={bookingDate}
                onChange={(e) =>
                  setBookingDate(e.target.value)
                }
                min={new Date()
                  .toISOString()
                  .split("T")[0]}
                className="w-full rounded-lg border border-[#c3c6d6] px-4 py-2 focus:border-[#003d9b] focus:outline-none focus:ring-2 focus:ring-[#003d9b]/15"
                required
              />
            </div>

            {/* Time Selection */}
            <div className="rounded-xl border border-[#e8edff] bg-white p-4 shadow-sm">
              <h3 className="mb-4 text-lg font-bold">
                Preferred Start Time
              </h3>

              <div>
                <label className="mb-1 block text-sm font-semibold text-[#434654]">
                  Start Time
                </label>

                <select
                  value={startTime}
                  onChange={(e) =>
                    setStartTime(e.target.value)
                  }
                  className="w-full rounded-lg border border-[#c3c6d6] bg-white px-4 py-2 text-[#1a1c25] focus:border-[#003d9b] focus:outline-none focus:ring-2 focus:ring-[#003d9b]/15"
                  required
                >
                  <option value="" disabled>
                    Select a start time
                  </option>
                  {TIME_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <p className="mt-2 text-sm text-[#434654]">
                Only a start time is needed — the provider will
                confirm how long the service takes.
              </p>
            </div>

            {/* Notes */}
            <div className="rounded-xl border border-[#e8edff] bg-white p-4 shadow-sm">
              <label
                className="mb-2 block text-sm font-semibold text-[#434654]"
                htmlFor="notes"
              >
                Special Notes or Requests
              </label>

              <textarea
                id="notes"
                value={notes}
                onChange={(e) =>
                  setNotes(e.target.value)
                }
                placeholder="e.g. Please focus on our Q4 scaling roadmap and potential bottlenecks..."
                rows={4}
                className="w-full resize-none rounded-lg border border-[#c3c6d6] px-4 py-2 focus:border-[#003d9b] focus:outline-none focus:ring-2 focus:ring-[#003d9b]/15"
              />
            </div>
          </div>

          {/* Right: Summary */}
          <div className="lg:col-span-5">
            <div className="sticky top-20 space-y-4">
              <div className="rounded-xl border border-[#e8edff] bg-[#e8edff] p-4 shadow-sm md:p-6">
                <h3 className="mb-4 text-xl font-bold text-[#003d9b]">
                  Booking Summary
                </h3>

                <div className="mb-4 space-y-3 border-b border-[#c3c6d6] pb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-bold">
                        {service?.title}
                      </p>

                      <p className="text-xs text-[#434654]">
                        {service?.duration_minutes
                          ? `${service.duration_minutes}-minute session`
                          : "Service"}
                      </p>
                    </div>

                    <span className="text-sm font-bold">
                      UGX{" "}
                      {Number(
                        service?.price || 0
                      ).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-bold">
                        Platform Fee
                      </p>

                      <p className="text-xs text-[#434654]">
                        Secure processing & support
                      </p>
                    </div>

                    <span className="text-sm font-bold">
                      UGX 0
                    </span>
                  </div>
                </div>

                <div className="mb-6 flex items-center justify-between">
                  <p className="text-lg font-extrabold">
                    Total
                  </p>

                  <span className="text-2xl font-bold text-[#003d9b]">
                    UGX{" "}
                    {Number(
                      service?.price || 0
                    ).toLocaleString()}
                  </span>
                </div>

                <div className="mb-6 space-y-2 text-xs text-[#434654]">
                  {bookingDate && (
                    <div className="flex items-center gap-2">
                      <span
                        className="material-symbols-outlined text-[#003d9b]"
                        style={{ fontSize: 20 }}
                      >
                        event_available
                      </span>

                      <span>
                        {new Date(
                          bookingDate + "T00:00:00"
                        ).toLocaleDateString(undefined, {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}

                        {startTime &&
                          ` at ${startTime}`}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <span
                      className="material-symbols-outlined text-[#003d9b]"
                      style={{ fontSize: 20 }}
                    >
                      lock
                    </span>

                    <span>
                      Secure SSL Encrypted Checkout
                    </span>
                  </div>
                </div>

                <form onSubmit={handleSubmit}>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#003d9b] py-3 font-extrabold text-white shadow-lg transition-all hover:bg-[#0052cc] active:scale-[0.98] disabled:opacity-50"
                  >
                    {submitting
                      ? "Creating Booking..."
                      : "Confirm Booking"}

                    <span className="material-symbols-outlined">
                      arrow_forward
                    </span>
                  </button>
                </form>

                {error && (
                  <p className="mt-3 text-center text-sm text-red-600">
                    {error}
                  </p>
                )}

                <p className="mt-3 text-center text-xs text-[#434654]">
                  By clicking confirm, you agree to the
                  Terms of Service.
                </p>
              </div>

              {/* Trust Indicators */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 rounded-lg border border-[#e8edff] bg-white p-2">
                  <span
                    className="material-symbols-outlined text-[#5e3c00]"
                    style={{
                      fontVariationSettings:
                        "'FILL' 1",
                    }}
                  >
                    verified_user
                  </span>

                  <span className="text-xs font-bold">
                    Guaranteed
                  </span>
                </div>

                <div className="flex items-center gap-2 rounded-lg border border-[#e8edff] bg-white p-2">
                  <span
                    className="material-symbols-outlined text-[#5e3c00]"
                    style={{
                      fontVariationSettings:
                        "'FILL' 1",
                    }}
                  >
                    workspace_premium
                  </span>

                  <span className="text-xs font-bold">
                    Top Provider
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export const Route = createFileRoute("/book")({
  validateSearch: (
    search: Record<string, unknown>
  ) => ({
    providerId: String(search.providerId || ""),
    serviceId: String(search.serviceId || ""),
  }),

  head: () => ({
    meta: [
      {
        title: "Book Service | NINJAWO",
      },
    ],
  }),

  component: BookComponent,
});