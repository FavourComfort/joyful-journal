import { useEffect, useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { PageFrame } from "@/components/PageFrame";
import { supabase } from "@/lib/supabase";
import { getCurrentProfile, updateProfile } from "@/lib/services/auth.service";
import { createProvider, updateProvider } from "@/lib/services/providers.service";
import { createService, deleteService } from "@/lib/services/services.service";

interface ProviderDraft {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  category?: string;
  experience?: string;
  bio?: string;
  profilePictureUrl?: string;
}

function readDraft(): ProviderDraft | null {
  try {
    const raw = localStorage.getItem("providerSignupDraft");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as ProviderDraft) : null;
  } catch {
    return null;
  }
}

function ProviderOnboardingComponent() {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const providerIdRef = useRef<string | null>(null);
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
          await router.navigate({ to: "/provider/login" });
          return;
        }
        userIdRef.current = profile.id;

        const { data, error: lookupError } = await supabase
          .from("providers")
          .select("id")
          .eq("user_id", profile.id)
          .maybeSingle();

        if (cancelled) return;
        if (lookupError) {
          setError("Something went wrong loading your account. Please refresh.");
          return;
        }
        if (data) {
          // Already onboarded (e.g. mid-wizard refresh) — go to dashboard.
          await router.navigate({ to: "/provider/dashboard" });
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

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const win = iframeRef.current?.contentWindow;
      if (!win || event.source !== win) return;

      const type = event.data?.type;
      const payload = event.data?.payload;

      if (type === "onboarding:ready") {
        postToIframe({ type: "onboarding:init", payload: { draft: readDraft() } });
        return;
      }

      if (type === "onboarding:createProfile") {
        try {
          const userId = userIdRef.current;
          if (!userId) throw new Error("You must be signed in to create a profile.");

          // Idempotent: refresh-safe — update if a row already exists.
          const { data: existing } = await supabase
            .from("providers")
            .select("id")
            .eq("user_id", userId)
            .maybeSingle();

          let providerId = existing?.id ?? null;
          if (providerId) {
            const updated = await updateProvider(providerId, {
              business_name: payload.businessName,
              bio: payload.bio || undefined,
            });
            if (!updated) throw new Error("Failed to save your profile.");
          } else {
            const provider = await createProvider(
              userId,
              payload.businessName,
              payload.bio || undefined
            );
            if (!provider) throw new Error("Failed to create your profile.");
            providerId = provider.id;
          }

          providerIdRef.current = providerId;
          postToIframe({
            type: "onboarding:result",
            payload: { step: "profile", data: { providerId } },
          });
        } catch (err) {
          postToIframe({
            type: "onboarding:error",
            payload: {
              message: err instanceof Error ? err.message : "Failed to save your profile.",
            },
          });
        }
        return;
      }

      if (type === "onboarding:addService") {
        try {
          const providerId = providerIdRef.current;
          if (!providerId) throw new Error("Create your profile first.");

          const service = await createService(
            providerId,
            payload.title,
            payload.category,
            Number(payload.price),
            payload.description || undefined,
            payload.durationMinutes ? Number(payload.durationMinutes) : undefined
          );
          if (!service) throw new Error("Failed to add the service.");

          postToIframe({
            type: "onboarding:result",
            payload: { step: "service", data: { service } },
          });
        } catch (err) {
          postToIframe({
            type: "onboarding:error",
            payload: {
              message: err instanceof Error ? err.message : "Failed to add the service.",
            },
          });
        }
        return;
      }

      if (type === "onboarding:removeService") {
        try {
          const ok = await deleteService(payload.serviceId);
          if (!ok) throw new Error("Failed to remove the service.");
          postToIframe({
            type: "onboarding:result",
            payload: { step: "remove", data: { serviceId: payload.serviceId } },
          });
        } catch (err) {
          postToIframe({
            type: "onboarding:error",
            payload: {
              message: err instanceof Error ? err.message : "Failed to remove the service.",
            },
          });
        }
        return;
      }

      if (type === "onboarding:businessDetails") {
        try {
          const providerId = providerIdRef.current;
          const userId = userIdRef.current;
          if (!providerId || !userId) throw new Error("Create your profile first.");

          const providerUpdates: Partial<{
            business_name: string;
            location?: string;
            bio?: string;
            profile_picture_url?: string;
          }> = { business_name: payload.businessName };
          if (payload.location) providerUpdates.location = payload.location;
          if (payload.bio) providerUpdates.bio = payload.bio;
          if (payload.profilePictureUrl) providerUpdates.profile_picture_url = payload.profilePictureUrl;

          const updated = await updateProvider(providerId, providerUpdates);
          if (!updated) throw new Error("Failed to save business details.");

          if (payload.phone) {
            await updateProfile(userId, { phone: payload.phone });
          }

          localStorage.removeItem("providerSignupDraft");
          postToIframe({ type: "onboarding:result", payload: { step: "business", data: {} } });
        } catch (err) {
          postToIframe({
            type: "onboarding:error",
            payload: {
              message: err instanceof Error ? err.message : "Failed to save business details.",
            },
          });
        }
        return;
      }

      if (type === "onboarding:finish") {
        localStorage.removeItem("providerSignupDraft");
        await router.navigate({ to: "/provider/dashboard" });
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
      src="/pages/provider-onboarding.html"
      title="Provider Onboarding"
      iframeRef={iframeRef}
      onLoad={() => postToIframe({ type: "onboarding:ping" })}
    />
  );
}

export const Route = createFileRoute("/provider/onboarding")({
  head: () => ({
    meta: [
      { title: "Provider Onboarding | ExpertHub" },
      {
        name: "description",
        content: "Set up your ExpertHub provider profile, services, and business details.",
      },
    ],
  }),
  component: ProviderOnboardingComponent,
});
