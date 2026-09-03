import { useEffect, useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { PageFrame } from "@/components/PageFrame";
import { getCurrentProfile } from "@/lib/services/auth.service";
import { getProviderByUserId } from "@/lib/services/providers.service";
import { supabase } from "@/lib/supabase";
import {
  getEligibleRequestsForProvider,
  getNotificationsForProvider,
} from "@/lib/services/requests.service";

function ProviderRequestsComponent() {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [providerLocation, setProviderLocation] = useState<
    string | undefined
  >(undefined);

  const sendToIframe = (message: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(message, "*");
  };

  const loadRequests = async () => {
    if (!providerId) return;

    const [requests, notifications] = await Promise.all([
      getEligibleRequestsForProvider(providerId, providerLocation),
      getNotificationsForProvider(providerId),
    ]);

    /*
     * The feed is the LIVE eligibility set: location (if set) plus the
     * provider's CURRENT active service categories are re-evaluated on eevuery
     * load. This means a provider who adds a service later now starts seeing
     * older applicable requests instead of missing them. Notifications below are
     * a historical inbox (and the "new request" panel), not thi stance filtering
     * source for eligibility.
     */
    sendToIframe({
      type: "provider-requests:init",
      payload: {
        requests,
        notifications,
      },
    });
  };

  // --------------------------------------------------
  // LOAD PROVIDER ACCOUNT
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

        if (profile.role !== "provider") {
          await router.navigate({ to: "/" });
          return;
        }

        const provider = await getProviderByUserId(profile.id);

        if (!provider) {
          await router.navigate({
            to: "/provider/onboarding",
          });
          return;
        }

        if (cancelled) return;

        setProviderId(provider.id);
        setProviderLocation(provider.location || undefined);
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

  // --------------------------------------------------
  // REALTIME PROVIDER NOTIFICATIONS
  // --------------------------------------------------

  useEffect(() => {
    if (!providerId) return;

    const channel = supabase
      .channel(`provider-notifications-${providerId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "request_notifications",
          filter: `provider_id=eq.${providerId}`,
        },
        async () => {
          console.log(
            "New provider notification received."
          );

          await loadRequests();
        }
      )
      .subscribe((status) => {
        console.log(
          "Provider notification realtime status:",
          status
        );
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [providerId, providerLocation]);

  // --------------------------------------------------
  // IFRAME MESSAGES
  // --------------------------------------------------

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const type = event.data?.type;
      const payload = event.data?.payload;

      if (!type) return;

      if (type === "provider-requests:ready") {
        await loadRequests();
        return;
      }

      if (type === "provider-requests:refresh") {
        await loadRequests();
        return;
      }

      if (
        type === "provider-requests:interested" ||
        type === "provider-requests:viewDetails"
      ) {
        const requestId = payload?.requestId;

        if (!requestId) {
          setError("A request could not be opened. Please refresh and try again.");
          return;
        }

        await router.navigate({
          to: "/provider/offer",
          search: { requestId },
        });
        return;
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener(
        "message",
        handleMessage
      );
    };
  }, [providerId, providerLocation, router]);

  // --------------------------------------------------
  // LOADING / ERROR
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
      src="/pages/provider-requests.html"
      title="Customer Requests"
      iframeRef={iframeRef}
      onLoad={() => {
        iframeRef.current?.contentWindow?.postMessage({
          type: "provider-requests:ping",
        });
      }}
    />
  );
}

export const Route = createFileRoute(
  "/provider/requests"
)({
  head: () => ({
    meta: [
      {
        title: "Customer Requests | NINJAWO",
      },
    ],
  }),
  component: ProviderRequestsComponent,
});
