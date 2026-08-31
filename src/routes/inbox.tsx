import { useEffect, useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { PageFrame } from "@/components/PageFrame";
import { getCurrentProfile } from "@/lib/services/auth.service";
import { getInboxMessages } from "@/lib/services/messages.service";

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
      const messages = await getInboxMessages(userId);

    return {
      role: roleRef.current === "provider" ? "provider" : "customer",
      name: myName,
      onboarded: true,
      interactions: messages.map((message) => ({
        id: message.provider_id,
        name: message.counterparty_name,
        subtitle: message.body,
        date: message.created_at,
        status: "Message",
        avatarUrl: message.counterparty_avatar_url,
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
      { title: "Inbox | NINJAWO" },
      { name: "description", content: "Your NINJAWO interactions." },
    ],
  }),
  component: InboxComponent,
});
