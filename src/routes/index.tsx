import { useEffect, useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { PageFrame } from "@/components/PageFrame";
import { getCurrentProfile, signOut } from "@/lib/services/auth.service";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ExpertHub | Professional Service Marketplace" },
      { name: "description", content: "Connect with vetted industry leaders and local specialists for your business or home needs." },
      { property: "og:title", content: "ExpertHub | Professional Service Marketplace" },
      { property: "og:description", content: "Vetted experts, transparent pricing, white-glove service." },
    ],
  }),
  component: () => {
    const router = useRouter();
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const [isProvider, setIsProvider] = useState(false);
    const [accountRole, setAccountRole] = useState<"customer" | "provider" | "admin" | null>(null);
    const [isOnboarded, setIsOnboarded] = useState(false);
    const [providerAvatarUrl, setProviderAvatarUrl] = useState<string | null>(null);
    const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);

    // Refs to hold latest state for the onLoad callback (avoids stale closures)
    const latestPayloadRef = useRef({ role: null as typeof accountRole, isProvider: false, onboarded: false, profilePictureUrl: null as string | null, userAvatarUrl: null as string | null });
    latestPayloadRef.current = { role: accountRole, isProvider, onboarded: isOnboarded, profilePictureUrl: providerAvatarUrl, userAvatarUrl };

    useEffect(() => {
      const handleMessage = async (event: MessageEvent) => {
        if (event.source !== iframeRef.current?.contentWindow) return;
        if (event.data?.type === "auth:signout") {
          await signOut();
          await router.navigate({ to: "/login" });
        }
      };

      window.addEventListener("message", handleMessage);
      return () => window.removeEventListener("message", handleMessage);
    }, [router]);

    useEffect(() => {
      const checkAuthState = async () => {
        const profile = await getCurrentProfile();
        if (!profile) {
          setAccountRole(null);
          setUserAvatarUrl(null);
          return;
        }

        // Preserve the admin role so the home shell can surface admin navigation.
        setAccountRole(profile.role);
        setUserAvatarUrl(profile.avatar_url || null);

        if (profile.role === "provider") {
          setIsProvider(true);
          const { data, error } = await supabase
            .from("providers")
            .select("id, profile_picture_url")
            .eq("user_id", profile.id)
            .maybeSingle();
          if (!error && data) {
            setIsOnboarded(!!data.id);
            setProviderAvatarUrl(data.profile_picture_url || null);
          } else {
            setIsOnboarded(false);
            setProviderAvatarUrl(null);
          }
        } else {
          setIsProvider(false);
        }
      };

      checkAuthState();
    }, []);

    useEffect(() => {
      if (!iframeRef.current) return;
      iframeRef.current.contentWindow?.postMessage(
        { type: "home:init", payload: { role: accountRole, isProvider, onboarded: isOnboarded, profilePictureUrl: providerAvatarUrl, userAvatarUrl } },
        "*"
      );
    }, [accountRole, isProvider, isOnboarded, providerAvatarUrl, userAvatarUrl]);

    return (
      <PageFrame
        src="/pages/home.html"
        title="Home"
        iframeRef={iframeRef}
        onLoad={() => {
          const p = latestPayloadRef.current;
          iframeRef.current?.contentWindow?.postMessage(
            { type: "home:init", payload: { role: p.role, isProvider: p.isProvider, onboarded: p.onboarded, profilePictureUrl: p.profilePictureUrl, userAvatarUrl: p.userAvatarUrl } },
            "*"
          );
        }}
      />
    );
  },
});
