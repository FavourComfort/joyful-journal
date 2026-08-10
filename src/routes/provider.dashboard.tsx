import { useEffect, useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { PageFrame } from "@/components/PageFrame";
import { supabase } from "@/lib/supabase";
import {
  getCurrentProfile,
  signOut,
  updateProfile,
  type Profile,
} from "@/lib/services/auth.service";
import {
  updateProvider,
  type Provider,
} from "@/lib/services/providers.service";
import {
  createService,
  deleteService,
  updateService,
  type Service,
} from "@/lib/services/services.service";
import {
  getProviderBookings,
  updateBookingStatus,
  type Booking,
} from "@/lib/services/bookings.service";
import {
  getProviderAverageRating,
  getProviderReviews,
  type Review,
} from "@/lib/services/reviews.service";

interface DashboardData {
  provider: Provider;
  phone?: string;
  services: Service[];
  bookings: (Booking & { customer_name: string })[];
  reviews: Review[];
  avgRating: number;
  earnings: number;
  upcoming: number;
  completed: number;
}

function ProviderDashboardComponent() {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const providerRef = useRef<Provider | null>(null);
  const userIdRef = useRef<string | null>(null);
  const phoneRef = useRef<string | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const postToIframe = (message: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(message, "*");
  };

  const fetchDashboardData = async (): Promise<DashboardData> => {
    const userId = userIdRef.current;
    const provider = providerRef.current;
    if (!provider || !userId) throw new Error("Not signed in as a provider.");

    const providerResult = await supabase
      .from("providers")
      .select("*")
      .eq("id", provider.id)
      .single();
    if (providerResult.error) throw providerResult.error;
    const providerData = providerResult.data as Provider;
    providerRef.current = providerData;

    const [servicesResult, bookings, reviews, avgRating] = await Promise.all([
      // Unfiltered: includes inactive services so the active toggle can flip both ways.
      supabase
        .from("services")
        .select("*")
        .eq("provider_id", providerData.id)
        .order("created_at", { ascending: false }),
      getProviderBookings(provider.id),
      getProviderReviews(provider.id),
      getProviderAverageRating(provider.id),
    ]);

    const customerIds = [...new Set(bookings.map((b) => b.customer_id))];
    let customerNames: Record<string, string> = {};
    if (customerIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", customerIds);
      if (profiles) {
        customerNames = Object.fromEntries(
          profiles.map((p) => [p.id, p.full_name])
        );
      }
    }

    const bookingsWithCustomer = bookings.map((b) => ({
      ...b,
      customer_name: customerNames[b.customer_id] || "Customer",
    }));

    const today = new Date().toISOString().split("T")[0];
    const completed = bookings.filter((b) => b.status === "completed");
    const earnings = completed.reduce(
      (sum, b) => sum + (Number(b.total_amount) || 0),
      0
    );
    const upcoming = bookings.filter(
      (b) => b.status !== "cancelled" && b.booking_date >= today
    ).length;

    return {
      provider: providerData,
      phone: phoneRef.current,
      services: servicesResult.data || [],
      bookings: bookingsWithCustomer,
      reviews,
      avgRating,
      earnings,
      upcoming,
      completed: completed.length,
    };
  };

  const sendData = async () => {
    try {
      const data = await fetchDashboardData();
      postToIframe({ type: "dashboard:data", payload: data });
    } catch (err) {
      postToIframe({
        type: "dashboard:error",
        payload: {
          message: err instanceof Error ? err.message : "Failed to load your dashboard.",
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
          await router.navigate({ to: "/provider/login" });
          return;
        }
        if (profile.role !== "provider") {
          await router.navigate({ to: "/dashboard" });
          return;
        }

        userIdRef.current = profile.id;
        phoneRef.current = profile.phone;

        const { data, error: lookupError } = await supabase
          .from("providers")
          .select("*")
          .eq("user_id", profile.id)
          .maybeSingle();

        if (cancelled) return;
        if (lookupError) {
          setError("Something went wrong loading your account. Please refresh.");
          return;
        }
        if (!data) {
          await router.navigate({ to: "/provider/onboarding" });
          return;
        }

        providerRef.current = data as Provider;
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

      if (type === "dashboard:ready") {
        await sendData();
        return;
      }

      if (type === "dashboard:updateProfile") {
        try {
          const provider = providerRef.current;
          const userId = userIdRef.current;
          if (!provider || !userId) throw new Error("Not signed in as a provider.");

          const providerUpdates: Partial<Provider> = {
            business_name: payload.businessName,
          };
          if (payload.location) providerUpdates.location = payload.location;
          if (payload.bio) providerUpdates.bio = payload.bio;

          const updated = await updateProvider(provider.id, providerUpdates);
          if (!updated) throw new Error("Failed to update your profile.");

          if (payload.phone) {
            const profileUpdates: Partial<Profile> = { phone: payload.phone };
            await updateProfile(userId, profileUpdates);
            phoneRef.current = payload.phone;
          }

          await sendData();
        } catch (err) {
          postToIframe({
            type: "dashboard:error",
            payload: {
              message: err instanceof Error ? err.message : "Failed to update your profile.",
            },
          });
        }
        return;
      }

      if (type === "dashboard:addService") {
        try {
          const provider = providerRef.current;
          if (!provider) throw new Error("Not signed in as a provider.");

          const service = await createService(
            provider.id,
            payload.title,
            payload.category,
            Number(payload.price),
            payload.description || undefined,
            payload.durationMinutes ? Number(payload.durationMinutes) : undefined
          );
          if (!service) throw new Error("Failed to add the service.");

          await sendData();
        } catch (err) {
          postToIframe({
            type: "dashboard:error",
            payload: {
              message: err instanceof Error ? err.message : "Failed to add the service.",
            },
          });
        }
        return;
      }

      if (type === "dashboard:updateService") {
        try {
          const updated = await updateService(payload.serviceId, payload.updates);
          if (!updated) throw new Error("Failed to update the service.");
          await sendData();
        } catch (err) {
          postToIframe({
            type: "dashboard:error",
            payload: {
              message: err instanceof Error ? err.message : "Failed to update the service.",
            },
          });
        }
        return;
      }

      if (type === "dashboard:removeService") {
        try {
          const ok = await deleteService(payload.serviceId);
          if (!ok) throw new Error("Failed to remove the service.");
          await sendData();
        } catch (err) {
          postToIframe({
            type: "dashboard:error",
            payload: {
              message: err instanceof Error ? err.message : "Failed to remove the service.",
            },
          });
        }
        return;
      }

      if (type === "dashboard:updateBookingStatus") {
        try {
          const status: Booking["status"] = payload.status;
          const updated = await updateBookingStatus(payload.bookingId, status);
          if (!updated) throw new Error("Failed to update the booking.");
          await sendData();
        } catch (err) {
          postToIframe({
            type: "dashboard:error",
            payload: {
              message: err instanceof Error ? err.message : "Failed to update the booking.",
            },
          });
        }
        return;
      }

      if (type === "dashboard:signOut") {
        await signOut();
        await router.navigate({ to: "/provider/login" });
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
      src="/pages/provider-dashboard.html"
      title="Provider Dashboard"
      iframeRef={iframeRef}
      onLoad={() => postToIframe({ type: "dashboard:ping" })}
    />
  );
}

export const Route = createFileRoute("/provider/dashboard")({
  head: () => ({
    meta: [
      { title: "Provider Dashboard | ExpertHub" },
      {
        name: "description",
        content: "Manage your ExpertHub provider profile, services, and bookings.",
      },
    ],
  }),
  component: ProviderDashboardComponent,
});
