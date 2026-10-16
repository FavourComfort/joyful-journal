import { useEffect, useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { PageFrame } from "@/components/PageFrame";
import {
  getCurrentProfile,
  signOut,
  updateProfile,
} from "@/lib/services/auth.service";

import {
  getCustomerRequests,
getOffersWithProvidersForRequests,
acceptOffer,
declineOffer,
} from "@/lib/services/requests.service";

import { uploadAvatar } from "@/lib/services/providers.service";
import { getCustomerBookings } from "@/lib/services/bookings.service";
import {
  cancelBookingAndRefund,
  confirmServiceCompletionAndRelease,
  getCompletionRequestBookingIds,
} from "@/lib/services/payments.service";
import {
  getDisputesForBookings,
  raiseDispute,
} from "@/lib/services/disputes.service";
import { supabase } from "@/lib/supabase";

function ClientDashboardComponent() {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const userIdRef = useRef<string | null>(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);

  const postToIframe = (message: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(message, "*");
  };

  // --------------------------------------------------
  // Load authenticated user
  // --------------------------------------------------

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

        userIdRef.current = profile.id;
        setCustomerId(profile.id);

        setReady(true);
      } catch (err) {
        if (cancelled) return;

        setError(
          err instanceof Error
            ? err.message
            : "Failed to load your account."
        );
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const loadDashboard = async () => {
    const profile = await getCurrentProfile();

    if (!profile) {
      throw new Error("Your session has expired. Please log in again.");
    }

    const [bookings, requests] = await Promise.all([
      getCustomerBookings(profile.id),
      getCustomerRequests(profile.id),
    ]);
    const completionRequestBookingIds = await getCompletionRequestBookingIds(
      bookings.map((booking) => booking.id)
    );
    const disputes = await getDisputesForBookings(
      bookings.map((booking) => booking.id)
    );
    const offers = await getOffersWithProvidersForRequests(
      requests.map((request) => request.id)
    );

    postToIframe({
      type: "dashboard:init",
      payload: {
        name: profile.full_name || "",
        avatarUrl: profile.avatar_url || null,
        role: profile.role || "customer",
        bookings: bookings.map((booking) => ({
          ...booking,
          completion_requested: completionRequestBookingIds.has(booking.id),
        })),
        disputes,
        requests,
        offers,
      },
    });
  };

  useEffect(() => {
    if (!customerId) return;

    const channel = supabase
      .channel(`customer-offers-${customerId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "offers" },
        () => {
          void loadDashboard().catch((err) =>
            console.error("Failed to refresh new customer offer:", err)
          );
        }
      )
      .subscribe();

    const completionChannel = supabase
      .channel(`customer-completion-requests-${customerId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "completion_requests" },
        () => void loadDashboard().catch((err) => console.error("Failed to refresh completion request:", err))
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
      void supabase.removeChannel(completionChannel);
    };
  }, [customerId]);

  // --------------------------------------------------
  // Communication with dashboard.html
  // --------------------------------------------------

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const iframeWindow = iframeRef.current?.contentWindow;

      if (!iframeWindow) return;

      const sourceIsIframe =
        event.source === iframeWindow ||
        (event.source &&
          (event.source as any).frameElement === iframeRef.current);

      if (!sourceIsIframe) return;

      const type = event.data?.type;
      const payload = event.data?.payload;

      // ------------------------------------------------
      // Dashboard is ready
      // ------------------------------------------------

      if (type === "dashboard:ready") {
        try {
          await loadDashboard();
        } catch (err) {
          postToIframe({
            type: "dashboard:error",
            payload: {
              message:
                err instanceof Error
                  ? err.message
                  : "Failed to load dashboard data.",
            },
          });
        }

        return;
      }

      if (type === "dashboard:refresh") {
        try {
          await loadDashboard();
        } catch (err) {
          postToIframe({
            type: "dashboard:error",
            payload: {
              message:
                err instanceof Error
                  ? err.message
                  : "Failed to refresh dashboard.",
            },
          });
        }
        return;
      }

      if (type === "dashboard:signOut") {
        const result = await signOut();
        if (result.error) {
          postToIframe({
            type: "dashboard:error",
            payload: { message: result.error },
          });
          return;
        }
        await router.navigate({ to: "/login" });
        return;
      }

      if (type === "dashboard:confirmBookingCompletion") {
        try {
          const bookingId = payload?.bookingId;

          if (typeof bookingId !== "string") {
            throw new Error("Invalid booking ID.");
          }

          const payment = await confirmServiceCompletionAndRelease(bookingId);

          if (!payment) {
            throw new Error("Unable to release escrow for this booking.");
          }

          await loadDashboard();

          postToIframe({
            type: "dashboard:releaseSuccess",
            payload: {
              bookingId,
              paymentStatus: payment.payment_status,
            },
          });
        } catch (err) {
          postToIframe({
            type: "dashboard:error",
            payload: {
              message:
                err instanceof Error
                  ? err.message
                  : "Failed to confirm service completion.",
            },
          });
        }

        return;
      }

      if (type === "dashboard:cancelBooking") {
        try {
          const bookingId = payload?.bookingId;
          if (typeof bookingId !== "string") throw new Error("Invalid booking ID.");
          if (!await cancelBookingAndRefund(bookingId, payload?.reason)) {
            throw new Error("Unable to cancel this booking and verify its refund.");
          }
          await loadDashboard();
          postToIframe({ type: "dashboard:actionSuccess", payload: { message: "Booking cancelled. The escrow payment has been refunded." } });
        } catch (err) {
          postToIframe({ type: "dashboard:error", payload: { message: err instanceof Error ? err.message : "Failed to cancel booking." } });
        }
        return;
      }

      // ------------------------------------------------
      // Dispute: customer flags a service as not delivered
      // ------------------------------------------------

      if (type === "dashboard:raiseDispute") {
        try {
          const bookingId = payload?.bookingId;
          const reason = payload?.reason;
          if (typeof bookingId !== "string") throw new Error("Invalid booking ID.");

          const validReasons = [
            "service_not_delivered",
            "service_not_as_described",
            "other",
          ];
          if (!validReasons.includes(reason)) throw new Error("Please choose a dispute reason.");

          const dispute = await raiseDispute(
            bookingId,
            reason as "service_not_delivered" | "service_not_as_described" | "other",
            typeof payload?.description === "string" ? payload.description : undefined
          );

          if (!dispute) {
            throw new Error("Could not raise the dispute. The booking may no longer be eligible.");
          }

          await loadDashboard();
          postToIframe({
            type: "dashboard:actionSuccess",
            payload: { message: "Dispute raised. The provider has been notified and your funds are protected in escrow." },
          });
        } catch (err) {
          postToIframe({ type: "dashboard:error", payload: { message: err instanceof Error ? err.message : "Failed to raise the dispute." } });
        }
        return;
      }

      // ------------------------------------------------
      // Avatar update
      // ------------------------------------------------

      if (type === "dashboard:updateAvatar") {
        try {
          const userId = userIdRef.current;

          if (!userId) {
            throw new Error(
              "You must be signed in to update your picture."
            );
          }

          const avatarFile = payload?.avatarFile;

          if (!(avatarFile instanceof File)) {
            throw new Error("Please choose a valid image.");
          }

          const avatarUrl = await uploadAvatar(
            userId,
            avatarFile
          );

          const updated = await updateProfile(
            userId,
            {
              avatar_url: avatarUrl,
            }
          );

          if (!updated) {
            throw new Error("Failed to save your picture.");
          }

          postToIframe({
            type: "dashboard:avatarSaved",
            payload: {
              avatarUrl,
            },
          });
        } catch (err) {
          postToIframe({
            type: "dashboard:error",
            payload: {
              message:
                err instanceof Error
                  ? err.message
                  : "Failed to update your picture.",
            },
          });
        }

        return;
      }

      if (type === "dashboard:acceptOffer") {
  try {
    const offerId = payload?.offerId;

    if (typeof offerId !== "string") {
      throw new Error("Invalid offer ID.");
    }

    const result = await acceptOffer(offerId);

    if (!result.ok) {
      /*
       * Surface the real reason. The previous generic
       * "Could not accept this offer." hid whether MarzPay declined, the
       * booking/payment could not be created, or the offer was already
       * accepted.
       */
      throw new Error(result.message);
    }

    // Reload the customer's requests and offers
    const profile = await getCurrentProfile();

    if (!profile) {
      throw new Error("Your session has expired.");
    }

    const requests = await getCustomerRequests(profile.id);

    const requestIds = requests.map(
      (request) => request.id
    );

    const offers =
      await getOffersWithProvidersForRequests(
        requestIds
      );

    postToIframe({
      type: "dashboard:offersUpdated",
      payload: {
        requests,
        offers,
      },
    });

    /*
     * Give the customer the same truthful payment feedback the direct
     * booking flow gives. A 'pending' payment is NOT yet escrowed, so the
     * message must not imply the money is already secured.
     */
    postToIframe({
      type: "dashboard:actionSuccess",
      payload: {
        message:
          result.paymentStatus === "escrowed"
            ? "Offer accepted — your booking is created and your payment is held in escrow until you confirm the service."
            : "Booking created — awaiting payment. Please approve the payment prompt on your phone. Funds are only held in escrow once the payment is confirmed.",
      },
    });
  } catch (err) {
    postToIframe({
      type: "dashboard:error",
      payload: {
        message:
          err instanceof Error
            ? err.message
            : "Failed to accept the offer.",
      },
    });
  }

  return;
}


if (type === "dashboard:declineOffer") {
  try {
    const offerId = payload?.offerId;

    if (typeof offerId !== "string") {
      throw new Error("Invalid offer ID.");
    }

    const success = await declineOffer(offerId);

    if (!success) {
      throw new Error("Could not decline this offer.");
    }

    // Reload the customer's requests and offers
    const profile = await getCurrentProfile();

    if (!profile) {
      throw new Error("Your session has expired.");
    }

    const requests = await getCustomerRequests(profile.id);

    const requestIds = requests.map(
      (request) => request.id
    );

    const offers =
      await getOffersWithProvidersForRequests(
        requestIds
      );

    postToIframe({
      type: "dashboard:offersUpdated",
      payload: {
        requests,
        offers,
      },
    });
  } catch (err) {
    postToIframe({
      type: "dashboard:error",
      payload: {
        message:
          err instanceof Error
            ? err.message
            : "Failed to decline the offer.",
      },
    });
  }

  return;
}

      // ------------------------------------------------
      // Navigate from iframe
      // ------------------------------------------------

      if (type === "navigate") {
        const route = payload?.route;

        if (typeof route === "string") {
          await router.navigate({
            to: route as any,
          });
        }

        return;
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [router]);

  // --------------------------------------------------
  // Loading
  // --------------------------------------------------

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f9f9ff]">
        {error ? (
          <div className="max-w-md px-4 text-center">
            <p className="mb-4 text-red-600">
              {error}
            </p>

            <button
              onClick={() => window.location.reload()}
              className="rounded-xl bg-[#003d9b] px-6 py-3 text-sm font-semibold text-white"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#003d9b] border-t-transparent" />
        )}
      </div>
    );
  }

  return (
    <PageFrame
      src="/pages/dashboard.html"
      title="Dashboard"
      iframeRef={iframeRef}
      onLoad={() => {
        postToIframe({
          type: "dashboard:ping",
        });
      }}
    />
  );
}

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      {
        title: "NINJAWO | Client Dashboard",
      },
    ],
  }),

  component: ClientDashboardComponent,
});
