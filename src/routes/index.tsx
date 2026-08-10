import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageFrame } from "@/components/PageFrame";
import { getCurrentProfile } from "@/lib/services/auth.service";
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
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const [isProvider, setIsProvider] = useState(false);
    const [isOnboarded, setIsOnboarded] = useState(false);
    const [providerAvatarUrl, setProviderAvatarUrl] = useState<string | null>(null);

    useEffect(() => {
      const checkProvider = async () => {
        const profile = await getCurrentProfile();
        if (!profile || profile.role !== "provider") return;

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
      };

      checkProvider();
    }, []);

    useEffect(() => {
      if (!iframeRef.current) return;
      iframeRef.current.contentWindow?.postMessage(
        { type: "home:init", payload: { isProvider, onboarded: isOnboarded, profilePictureUrl: providerAvatarUrl } },
        "*"
      );
    }, [isProvider, isOnboarded, providerAvatarUrl]);

    return (
      <PageFrame
        src="/pages/home.html"
        title="Home"
        iframeRef={iframeRef}
        onLoad={() => {
          iframeRef.current?.contentWindow?.postMessage(
            { type: "home:init", payload: { isProvider, onboarded: isOnboarded, profilePictureUrl: providerAvatarUrl } },
            "*"
          );
        }}
      />
    );
  },
});
