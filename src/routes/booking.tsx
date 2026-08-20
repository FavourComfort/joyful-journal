import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PageFrame } from "@/components/PageFrame";
import { getCurrentProfile, signOut } from "@/lib/services/auth.service";
import { cancelBooking, getCustomerBookings } from "@/lib/services/bookings.service";

function BookingComponent() {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const checkAccess = async () => {
      const profile = await getCurrentProfile();
      if (cancelled) return;

      if (!profile) {
        sessionStorage.setItem("authRedirect", "/booking");
        await router.navigate({ to: "/login" });
        return;
      }

      if (profile.role === "provider") {
        await router.navigate({ to: "/provider/dashboard" });
        return;
      }

      setProfileId(profile.id);
      setReady(true);
    };

    checkAccess();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    const postBookings = async () => {
      if (!profileId) return;
      const bookings = await getCustomerBookings(profileId);
      iframeRef.current?.contentWindow?.postMessage({
        type: "bookings:init",
        payload: { bookings },
      }, "*");
    };

    const handleMessage = async (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;

      if (event.data?.type === "auth:signout") {
        await signOut();
        await router.navigate({ to: "/login" });
        return;
      }

      if (event.data?.type === "bookings:ready") {
        await postBookings();
      }

      if (event.data?.type === "bookings:cancel") {
        const bookingId = event.data.payload?.bookingId;
        if (!bookingId) return;
        const cancelled = await cancelBooking(bookingId);
        if (cancelled) await postBookings();
        iframeRef.current?.contentWindow?.postMessage({
          type: "bookings:cancelResult",
          payload: { bookingId, success: cancelled },
        }, "*");
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [profileId]);

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f9f9ff]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#003d9b] border-t-transparent" /></div>;
  }

  return (
    <PageFrame
      src="/pages/booking.html"
      title="My Bookings"
      iframeRef={iframeRef}
      onLoad={() => iframeRef.current?.contentWindow?.postMessage({ type: "bookings:ping" }, "*")}
    />
  );
}

export const Route = createFileRoute("/booking")({
  head: () => ({ meta: [{ title: "ExpertHub | Book Professional Services" }] }),
  component: BookingComponent,
});
