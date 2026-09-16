import { useEffect, useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { PageFrame } from "@/components/PageFrame";
import { getCurrentProfile } from "@/lib/services/auth.service";
import { supabase } from "@/lib/supabase";
import {
  getCustomerBookings,
  getProviderBookings,
  type Booking,
} from "@/lib/services/bookings.service";
import { getProviderByUserId } from "@/lib/services/providers.service";
import {
  getConversationMessages,
  getInboxMessages,
  sendReply,
  sendMessage,
} from "@/lib/services/messages.service";

export interface InboxInteraction {
  id: string;
  name: string; // counterparty: provider business_name or customer full_name
  subtitle: string; // service title
  date: string;
  status: string;
  avatarUrl?: string | null;
  counterparty_id: string; // the other participant's profile id (needed for provider replies)
}

/**
 * Booking-derived inbox entries.
 *
 * A booking (created directly from the booking page or automatically when a
 * customer accepts an offer) must surface in the inbox even before anyone has
 * sent a message, so the customer and the provider can start chatting right
 * away instead of hunting for a "message provider" button.
 *
 * These are read-only companions to the message-based interactions: nothing is
 * inserted into the messages table, and every lookup is wrapped in try/catch so
 * a failure here can never break the existing message conversations.
 */
async function getBookingInteractions(
  userId: string,
  role: "customer" | "provider",
): Promise<InboxInteraction[]> {
  try {
    if (role === "customer") {
      const bookings = await getCustomerBookings(userId);
      if (!bookings.length) return [];

      const providerIds = [...new Set(bookings.map((b) => b.provider_id))];
      const [providersResult, servicesResult] = await Promise.all([
        supabase
          .from("providers")
          .select("id, user_id, business_name, profile_picture_url")
          .in("id", providerIds),
        supabase
          .from("services")
          .select("id, title")
          .in("id", [...new Set(bookings.map((b) => b.service_id))]),
      ]);

      const providerMap = new Map(
        (providersResult.data || []).map((p: any) => [p.id, p]),
      );
      const serviceMap = new Map(
        (servicesResult.data || []).map((s: any) => [s.id, s.title as string]),
      );

      // One inbox entry per provider — keep the most recent booking.
      const latestByProvider = new Map<string, Booking>();
      for (const booking of bookings) {
        if (!latestByProvider.has(booking.provider_id))
          latestByProvider.set(booking.provider_id, booking);
      }

      return [...latestByProvider.values()]
        .map((booking) => {
          const provider = providerMap.get(booking.provider_id);
          if (!provider?.user_id) return null;
          return {
            id: booking.provider_id, // conversation key = provider row id
            name: provider.business_name || "Provider",
            subtitle: serviceMap.get(booking.service_id) || "Booking",
            date: booking.created_at,
            status: booking.status, // pending/confirmed/completed/cancelled
            avatarUrl: provider.profile_picture_url ?? null,
            counterparty_id: provider.user_id,
          } as InboxInteraction;
        })
        .filter(Boolean) as InboxInteraction[];
    }

    // Provider role: show customers who booked this provider.
    const provider = await getProviderByUserId(userId);
    if (!provider) return [];

    const bookings = await getProviderBookings(provider.id);
    if (!bookings.length) return [];

    const customerIds = [...new Set(bookings.map((b) => b.customer_id))];
    const [profilesResult, servicesResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", customerIds),
      supabase
        .from("services")
        .select("id, title")
        .in("id", [...new Set(bookings.map((b) => b.service_id))]),
    ]);

    const profileMap = new Map(
      (profilesResult.data || []).map((p: any) => [p.id, p]),
    );
    const serviceMap = new Map(
      (servicesResult.data || []).map((s: any) => [s.id, s.title as string]),
    );

    // One inbox entry per customer — keep the most recent booking.
    const latestByCustomer = new Map<string, Booking>();
    for (const booking of bookings) {
      if (!latestByCustomer.has(booking.customer_id))
        latestByCustomer.set(booking.customer_id, booking);
    }

    return [...latestByCustomer.values()].map((booking) => {
      const profile = profileMap.get(booking.customer_id);
      return {
        id: provider.id, // provider replies target their own provider row
        name: profile?.full_name || "Customer",
        subtitle: serviceMap.get(booking.service_id) || "Booking",
        date: booking.created_at,
        status: booking.status,
        avatarUrl: profile?.avatar_url ?? null,
        counterparty_id: booking.customer_id,
      } as InboxInteraction;
    });
  } catch (err) {
    // Booking entries are a convenience layer — never fail the inbox.
    console.error("Failed to load booking interactions:", err);
    return [];
  }
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
    const role: "customer" | "provider" =
      roleRef.current === "provider" ? "provider" : "customer";
    const messages = await getInboxMessages(userId);

    const interactions: InboxInteraction[] = messages.map((message) => ({
      id: message.provider_id,
      name: message.counterparty_name,
      subtitle: message.body,
      date: message.created_at,
      status: "Message",
      avatarUrl: message.counterparty_avatar_url,
      counterparty_id:
        message.sender_id === userId ? message.recipient_id : message.sender_id,
    }));

    /*
     * Merge in conversations that exist because of a booking (direct booking
     * or a booking created by accepting an offer) even if no messages have
     * been exchanged yet, so the provider/customer is reachable from the
     * inbox immediately. De-duplicate against message conversations and sort
     * everything newest-first.
     */
    const bookingInteractions = await getBookingInteractions(userId, role);
    const seen = new Set(
      interactions.map((i) => `${i.id}::${i.counterparty_id}`),
    );
    const merged = [
      ...interactions,
      ...bookingInteractions.filter(
        (i) => i.counterparty_id && !seen.has(`${i.id}::${i.counterparty_id}`),
      ),
    ].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    return {
      role,
      name: myName,
      onboarded: true,
      interactions: merged,
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
              message: err instanceof Error ? err.message : "Failed to load your inbox.",
            },
          });
        }
        return;
      }

      if (event.data?.type === "inbox:refresh") {
        try {
          const payload = await loadInteractions();
          postToIframe({ type: "inbox:update", payload });
        } catch (err) {
          postToIframe({
            type: "inbox:error",
            payload: {
              message: err instanceof Error ? err.message : "Failed to refresh your inbox.",
            },
          });
        }
        return;
      }

      if (event.data?.type === "inbox:send") {
        const conversation = event.data?.payload?.conversation;
        const message = event.data?.payload?.message;
        const role = roleRef.current;
        const userId = userIdRef.current;

        try {
          if (!userId) throw new Error("You must be signed in to send a message.");
          if (!conversation?.id) throw new Error("No conversation selected.");
          if (typeof message !== "string" || !message.trim()) {
            throw new Error("Write a message before sending.");
          }

          if (role === "provider") {
            await sendReply({
              providerId: conversation.id,
              recipientId: conversation.counterparty_id,
              body: message,
            });
          } else {
            await sendMessage(conversation.id, message);
          }

          postToIframe({ type: "inbox:sent" });

          const payload = await loadInteractions();
          postToIframe({ type: "inbox:update", payload });
        } catch (err) {
          postToIframe({
            type: "inbox:error",
            payload: {
              message: err instanceof Error ? err.message : "Failed to send your message.",
            },
          });
        }
        return;
      }

      if (event.data?.type === "inbox:openConversation") {
        const conversation = event.data?.payload?.conversation;
        const userId = userIdRef.current;

        try {
          if (!userId) throw new Error("You must be signed in to view messages.");
          if (!conversation?.id) throw new Error("No conversation selected.");

          const conversationMessages = await getConversationMessages(userId, conversation.id);

          /*
           * A conversation is identified by the provider row PLUS the
           * counterparty. On the provider side every thread shares the same
           * provider_id (their own row), so getConversationMessages returns
           * messages with ALL customers — narrow the thread to the
           * counterparty of the conversation that was opened.
           */
          const counterpartyId = conversation.counterparty_id;
          const threadMessages = counterpartyId
            ? conversationMessages.filter(
                (message) =>
                  message.sender_id === counterpartyId ||
                  message.recipient_id === counterpartyId,
              )
            : conversationMessages;

          postToIframe({
            type: "inbox:conversation",
            payload: {
              conversationId: conversation.id,
              messages: threadMessages.map((message) => ({
                id: message.id,
                sender_id: message.sender_id,
                content: message.body,
                created_at: message.created_at,
                mine: message.mine,
              })),
            },
          });
        } catch (err) {
          postToIframe({
            type: "inbox:error",
            payload: {
              message: err instanceof Error ? err.message : "Failed to load the conversation.",
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
      { title: "Inbox | NINJAWO" },
      { name: "description", content: "Your NINJAWO interactions." },
    ],
  }),
  component: InboxComponent,
});
