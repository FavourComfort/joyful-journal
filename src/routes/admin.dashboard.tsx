import { useEffect, useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { PageFrame } from "@/components/PageFrame";
import { getCurrentProfile, signOut } from "@/lib/services/auth.service";
import {
  type AdminProvider,
  type AdminStats,
  type AdminRequest,
  type AdminOffer,
  type AdminBooking,
  type AdminReview,
  getAllProvidersForAdmin,
  setProviderVerified,
  getAdminStats,
  getAllRequestsForAdmin,
  getAllOffersForAdmin,
  getAllBookingsForAdmin,
  getAllReviewsForAdmin,
  deleteRequest,
  deleteOffer,
  deleteBookingPermanently,
  deleteReviewPermanently,
} from "@/lib/services/admin.service";

function AdminDashboardComponent() {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const postToIframe = (message: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(message, "*");
  };

  const sendDashboardData = async () => {
    try {
      const [profile, stats, providers] = await Promise.all([
        getCurrentProfile(),
        getAdminStats(),
        getAllProvidersForAdmin(),
      ]);

      postToIframe({
        type: "admin:data",
        payload: {
          profile: profile
            ? { full_name: profile.full_name, role: profile.role }
            : null,
          stats,
          providers,
        },
      });
    } catch (err) {
      postToIframe({
        type: "admin:error",
        payload: {
          message:
            err instanceof Error ? err.message : "Failed to load dashboard data.",
        },
      });
    }
  };

  // Client-only route guard (TanStack Start SSRs — auth needs the browser).
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
        if (profile.role !== "admin") {
          // Non-admins should never reach this route.
          await router.navigate({ to: "/" });
          return;
        }

        setReady(true);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load your account.");
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Listen for messages coming from the admin iframe.
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      const sourceIsIframe =
        event.source === win ||
        (event.source && (event.source as any).frameElement === iframeRef.current);
      if (!sourceIsIframe) return;

      const type = event.data?.type;
      const payload = event.data?.payload;

      if (type === "admin:ping") {
        await sendDashboardData();
        return;
      }

      if (type === "admin:refresh") {
        await sendDashboardData();
        return;
      }

      if (type === "admin:verifyProvider") {
        const provider = await setProviderVerified(payload.providerId, payload.verified);
        postToIframe({
          type: "admin:verifyProvider:result",
          payload: { ok: !!provider, provider },
        });
        return;
      }

      if (type === "admin:loadRequests") {
        const requests = await getAllRequestsForAdmin();
        postToIframe({ type: "admin:requests", payload: { requests } });
        return;
      }

      if (type === "admin:loadOffers") {
        const offers = await getAllOffersForAdmin();
        postToIframe({ type: "admin:offers", payload: { offers } });
        return;
      }

      if (type === "admin:loadBookings") {
        const bookings = await getAllBookingsForAdmin();
        postToIframe({ type: "admin:bookings", payload: { bookings } });
        return;
      }

      if (type === "admin:loadReviews") {
        const reviews = await getAllReviewsForAdmin();
        postToIframe({ type: "admin:reviews", payload: { reviews } });
        return;
      }

      if (type === "admin:deleteRequest") {
        const ok = await deleteRequest(payload.requestId);
        postToIframe({
          type: "admin:deleteResult",
          payload: { kind: "request", ok, message: ok ? "Request removed." : "Could not remove request." },
        });
        return;
      }

      if (type === "admin:deleteOffer") {
        const ok = await deleteOffer(payload.offerId);
        postToIframe({
          type: "admin:deleteResult",
          payload: { kind: "offer", ok, message: ok ? "Offer removed." : "Could not remove offer." },
        });
        return;
      }

      if (type === "admin:deleteBooking") {
        const ok = await deleteBookingPermanently(payload.bookingId);
        postToIframe({
          type: "admin:deleteResult",
          payload: { kind: "booking", ok, message: ok ? "Booking removed." : "Could not remove booking." },
        });
        return;
      }

      if (type === "admin:deleteReview") {
        const ok = await deleteReviewPermanently(payload.reviewId);
        postToIframe({
          type: "admin:deleteResult",
          payload: { kind: "review", ok, message: ok ? "Review removed." : "Could not remove review." },
        });
        return;
      }

      if (type === "admin:signOut") {
        await signOut();
        await router.navigate({ to: "/login" });
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f9f9ff]">
        {error ? (
          <div className="max-w-md px-4 text-center">
            <p className="mb-4 text-red-600">{error}</p>
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
      src="/pages/admin-dashboard.html"
      title="Admin Dashboard"
      iframeRef={iframeRef}
      onLoad={() => postToIframe({ type: "admin:ping" })}
    />
  );
}

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard | NINJAWO" },
      {
        name: "description",
        content:
          "Admin moderation console for verifying providers and managing content on NINJAWO.",
      },
    ],
  }),
  component: AdminDashboardComponent,
});
