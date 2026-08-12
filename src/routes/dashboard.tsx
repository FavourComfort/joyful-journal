import { useEffect, useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { PageFrame } from "@/components/PageFrame";
import { getCurrentProfile, updateProfile } from "@/lib/services/auth.service";
import { uploadAvatar } from "@/lib/services/providers.service";

function ClientDashboardComponent() {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const userIdRef = useRef<string | null>(null);
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

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      // Accept messages from the iframe window or its frameElement to be more resilient
      const sourceIsIframe =
        event.source === win ||
        (event.source && (event.source as any).frameElement === iframeRef.current);
      if (!sourceIsIframe) return;

      const type = event.data?.type;
      const payload = event.data?.payload;

      if (type === "dashboard:ready") {
        const profile = await getCurrentProfile();
        postToIframe({
          type: "dashboard:init",
          payload: {
            name: profile?.full_name || "",
            avatarUrl: profile?.avatar_url || null,
          },
        });
        return;
      }

      if (type === "dashboard:updateAvatar") {
        try {
          const userId = userIdRef.current;
          if (!userId) throw new Error("You must be signed in to update your picture.");

          const avatarUrl = await uploadAvatar(userId, payload.avatarFile as File);
          const updated = await updateProfile(userId, { avatar_url: avatarUrl });
          if (!updated) throw new Error("Failed to save your picture.");

          postToIframe({ type: "dashboard:avatarSaved", payload: { avatarUrl } });
        } catch (err) {
          postToIframe({
            type: "dashboard:error",
            payload: {
              message:
                err instanceof Error ? err.message : "Failed to update your picture.",
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
      src="/pages/dashboard.html"
      title="Dashboard"
      iframeRef={iframeRef}
      onLoad={() => postToIframe({ type: "dashboard:ping" })}
    />
  );
}

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "ExpertHub | Client Dashboard" }] }),
  component: ClientDashboardComponent,
});
