import { useEffect, useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { PageFrame } from "@/components/PageFrame";
import { getCurrentProfile } from "@/lib/services/auth.service";
import { getProviderByUserId } from "@/lib/services/providers.service";
import {
  getCustomerBookings,
  getProviderBookings,
} from "@/lib/services/bookings.service";
import { supabase } from "@/lib/supabase";

export interface InboxInteraction {
  id: string;
  name: string; // counterparty: provider business_name or customer full_name
  subtitle: string; // service title
  date: string;
  status: string;
  avatarUrl?: string | null;
}

interface InboxPayload {
  role: "customer" | "provider";
  name: string;
  onboarded: boolean;
  interactions: InboxInteraction[];
}

function InboxComponent() {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const userIdRef = useRef<string | null>(null);
  const roleRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const postToIframe = (message: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(message, "*");
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
        userIdRef.current = profile.id;
        roleRef.current = profile.role;
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

  const loadInteractions = async (): Promise<InboxPayload> => {
    const userId = userIdRef.current;
    if (!userId) throw new Error("You must be signed in to view your inbox.");

    const profile = await getCurrentProfile();
    const myName = profile?.full_name || "";

    if (roleRef.current === "provider") {
      const provider = await getProviderByUserId(userId);
      if (!provider) {
        // Signed in as provider but onboarding incomplete.
        return { role: "provider", name: myName, onboarded: false, interactions: [] };
      }

      const bookings = await getProviderBookings(provider.id);
      const customerIds = [...new Set(bookings.map((b) => b.customer_id))];
      const serviceIds = [...new Set(bookings.map((b) => b.service_id))];

      const [profilesRes, servicesRes] = await Promise.all([
        customerIds.length
          ? supabase.from("profiles").select("id, full_name, avatar_url").in("id", customerIds)
          : Promise.resolve({ data: [] }),
        serviceIds.length
          ? supabase.from("services").select("id, title").in("id", serviceIds)
          : Promise.resolve({ data: [] }),
      ]);

      const names = Object.fromEntries((profilesRes.data || []).map((p) => [p.id, p.full_name]));
      const avatars = Object.fromEntries((profilesRes.data || []).map((p) => [p.id, p.avatar_url]));
      const titles = Object.fromEntries((servicesRes.data || []).map((s) => [s.id, s.title]));

      return {
        role: "provider",
        name: myName,
        onboarded: true,
        interactions: bookings.map((b) => ({
          id: b.id,
          name: names[b.customer_id] || "Customer",
          subtitle: titles[b.service_id] || "Service booking",
          date: b.booking_date,
          status: b.status,
          avatarUrl: avatars[b.customer_id] || null,
        })),
      };
    }

    // Customer inbox
    const bookings = await getCustomerBookings(userId);
    const providerIds = [...new Set(bookings.map((b) => b.provider_id))];
    const serviceIds = [...new Set(bookings.map((b) => b.service_id))];

    const [providersRes, servicesRes] = await Promise.all([
      providerIds.length
        ? supabase
            .from("providers")
            .select("id, business_name, profile_picture_url")
            .in("id", providerIds)
        : Promise.resolve({ data: [] }),
      serviceIds.length
        ? supabase.from("services").select("id, title").in("id", serviceIds)
        : Promise.resolve({ data: [] }),
    ]);

    const names = Object.fromEntries((providersRes.data || []).map((p) => [p.id, p.business_name]));
    const avatars = Object.fromEntries(
      (providersRes.data || []).map((p) => [p.id, p.profile_picture_url])
    );
    const titles = Object.fromEntries((servicesRes.data || []).map((s) => [s.id, s.title]));

    return {
      role: "customer",
      name: myName,
      onboarded: true,
      interactions: bookings.map((b) => ({
        id: b.id,
        name: names[b.provider_id] || "Provider",
        subtitle: titles[b.service_id] || "Service booking",
        date: b.booking_date,
        status: b.status,
        avatarUrl: avatars[b.provider_id] || null,
      })),
    };
  };

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      // Accept messages from the iframe window or its frameElement to be more resilient
      const sourceIsIframe =
        event.source === win ||
        (event.source && (event.source as any).frameElement === iframeRef.current);
      if (!sourceIsIframe) return;

      if (event.data?.type === "inbox:ready") {
        try {
          const payload = await loadInteractions();
          postToIframe({ type: "inbox:init", payload });
        } catch (err) {
          postToIframe({
            type: "inbox:error",
            payload: {
              message:
                err instanceof Error ? err.message : "Failed to load your inbox.",
            },
          });
        }
        return;
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
      src="/pages/inbox.html"
      title="Inbox"
      iframeRef={iframeRef}
      onLoad={() => postToIframe({ type: "inbox:ping" })}
    />
  );
}

export const Route = createFileRoute("/inbox")({
  head: () => ({
    meta: [
      { title: "Inbox | ExpertHub" },
      { name: "description", content: "Your ExpertHub interactions." },
    ],
  }),
  component: InboxComponent,
});
