// 
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getCurrentProfile, type Profile } from "@/lib/services/auth.service";
import {
  getCustomerBookings,
  getProviderBookings,
  type Booking,
} from "@/lib/services/bookings.service";
import {
  getProviderByUserId,
  type Provider,
} from "@/lib/services/providers.service";
import { supabase } from "@/lib/supabase";

interface BookingDetails extends Booking {
  service_title: string;
  counterparty_name: string;
  counterparty_avatar?: string | null;
}

type FilterStatus = "all" | Booking["status"];

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

function formatTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return value;
  }

  const date = new Date(2000, 0, 1, hours, minutes);

  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

const statusStyles: Record<
  Booking["status"],
  { badge: string; dot: string; label: string }
> = {
  pending: {
    badge: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
    dot: "bg-amber-500",
    label: "Pending",
  },
  confirmed: {
    badge: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
    dot: "bg-blue-500",
    label: "Confirmed",
  },
  completed: {
    badge:
      "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
    dot: "bg-emerald-500",
    label: "Completed",
  },
  cancelled: {
    badge: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
    dot: "bg-red-500",
    label: "Cancelled",
  },
};

async function loadBookings(profile: Profile): Promise<BookingDetails[]> {
  const isProvider = profile.role === "provider";

  const provider: Provider | null = isProvider
    ? await getProviderByUserId(profile.id)
    : null;

  const bookings =
    isProvider && provider
      ? await getProviderBookings(provider.id)
      : !isProvider
        ? await getCustomerBookings(profile.id)
        : [];

  const serviceIds = [
    ...new Set(bookings.map((booking) => booking.service_id)),
  ];

  const personIds = [
    ...new Set(
      bookings.map((booking) =>
        isProvider ? booking.customer_id : booking.provider_id,
      ),
    ),
  ];

  const [servicesResult, peopleResult] = await Promise.all([
    serviceIds.length
      ? supabase.from("services").select("id, title").in("id", serviceIds)
      : Promise.resolve({ data: [], error: null }),

    isProvider
      ? personIds.length
        ? supabase
            .from("profiles")
            .select("id, full_name, avatar_url")
            .in("id", personIds)
        : Promise.resolve({ data: [], error: null })
      : personIds.length
        ? supabase
            .from("providers")
            .select("id, business_name, profile_picture_url")
            .in("id", personIds)
        : Promise.resolve({ data: [], error: null }),
  ]);

  if (servicesResult.error) {
    throw servicesResult.error;
  }

  if (peopleResult.error) {
    throw peopleResult.error;
  }

  const services = Object.fromEntries(
    (servicesResult.data || []).map((service) => [
      service.id,
      service.title,
    ]),
  );

  const people = Object.fromEntries(
    (peopleResult.data || []).map((person) => [
      person.id,
      {
        name: isProvider
          ? (person as { full_name?: string }).full_name
          : (person as { business_name?: string }).business_name,

        avatar: isProvider
          ? (person as { avatar_url?: string | null }).avatar_url
          : (person as { profile_picture_url?: string | null })
              .profile_picture_url,
      },
    ]),
  );

  return bookings.map((booking) => ({
    ...booking,

    service_title:
      services[booking.service_id] || "Service booking",

    counterparty_name:
      people[
        isProvider ? booking.customer_id : booking.provider_id
      ]?.name ||
      (isProvider ? "Customer" : "Provider"),

    counterparty_avatar:
      people[
        isProvider ? booking.customer_id : booking.provider_id
      ]?.avatar || null,
  }));
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#eef3ff] text-[#003d9b]">
          <span className="material-symbols-outlined">{icon}</span>
        </div>

        <span className="text-2xl font-bold text-[#071a35]">
          {value}
        </span>
      </div>

      <p className="mt-4 text-sm font-medium text-slate-500">
        {label}
      </p>
    </div>
  );
}

function BookingCard({
  booking,
  isProvider,
  onViewDetails,
}: {
  booking: BookingDetails;
  isProvider: boolean;
  onViewDetails: () => void;
}) {
  const status = statusStyles[booking.status];

  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <div className="p-5 sm:p-6">
        {/* Top section */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative shrink-0">
              <img
                src={
                  booking.counterparty_avatar ||
                  "/images/dashboard-default-avatar.png"
                }
                alt=""
                className="h-14 w-14 rounded-full object-cover ring-4 ring-slate-50"
              />

              <span
                className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white ${status.dot}`}
              />
            </div>

            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-[#071a35]">
                {booking.service_title}
              </h2>

              <p className="mt-1 truncate text-sm text-slate-500">
                {isProvider ? "Customer" : "Provider"} | 
                <span className="font-medium text-slate-700">
                  {booking.counterparty_name}
                </span>
              </p>
            </div>
          </div>

          <span
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${status.badge}`}
          >
            {status.label}
          </span>
        </div>

        {/* Appointment details */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[#003d9b] shadow-sm">
                <span className="material-symbols-outlined text-[20px]">
                  calendar_today
                </span>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Date
                </p>

                <p className="mt-0.5 text-sm font-semibold text-slate-800">
                  {formatDate(booking.booking_date)}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[#003d9b] shadow-sm">
                <span className="material-symbols-outlined text-[20px]">
                  schedule
                </span>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Time
                </p>

                <p className="mt-0.5 text-sm font-semibold text-slate-800">
                  {formatTime(booking.start_time)} - {formatTime(booking.end_time)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-5 flex flex-col gap-4 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Total
            </p>

            <p className="mt-1 text-xl font-bold text-[#071a35]">
              UGX {Number(booking.total_amount || 0).toLocaleString()}
            </p>
          </div>
{/* 
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#003d9b] transition hover:border-[#003d9b] hover:bg-[#f5f7ff]"
          >
            View details
            <span className="material-symbols-outlined text-[18px] transition-transform group-hover:translate-x-0.5">
              arrow_forward
            </span>
          </button> */}
          <button
  type="button"
  onClick={onViewDetails}
  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#003d9b] transition hover:border-[#003d9b] hover:bg-[#f5f7ff]"
>
  View details

  {/* <span className="material-symbols-outlined text-[18px]">
    arrow_forward
  </span> */}
</button>
        </div>
      </div>
    </article>
  );
}

function BookingComponent() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [bookings, setBookings] = useState<BookingDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<FilterStatus>("all");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const currentProfile = await getCurrentProfile();

        if (!currentProfile) {
          await router.navigate({ to: "/login" });
          return;
        }

        const data = await loadBookings(currentProfile);

        if (cancelled) return;

        setProfile(currentProfile);
        setBookings(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load bookings.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const counts = useMemo(
    () => ({
      all: bookings.length,
      pending: bookings.filter((b) => b.status === "pending").length,
      confirmed: bookings.filter((b) => b.status === "confirmed").length,
      completed: bookings.filter((b) => b.status === "completed").length,
    }),
    [bookings],
  );

  const filteredBookings = useMemo(() => {
    if (filter === "all") {
      return bookings;
    }

    return bookings.filter((booking) => booking.status === filter);
  }, [bookings, filter]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f9fc]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#dce5ff] border-t-[#003d9b]" />
          <p className="text-sm font-medium text-slate-500">
            Loading your bookings...
          </p>
        </div>
      </div>
    );
  }

  const isProvider = profile?.role === "provider";

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-[#071a35]">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <nav className="mx-auto flex h-[72px] max-w-[1180px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <button
            onClick={() => router.navigate({ to: "/" })}
            className="group flex items-center gap-2.5"
            aria-label="Back to home"
          >
            <span className="material-symbols-outlined text-[#003d9b] transition-transform group-hover:-translate-x-1">
              arrow_back
            </span>

            <span className="text-xl font-extrabold tracking-tight text-[#003d9b]">
              ExpertHub
            </span>
          </button>

          <button
            onClick={() => router.navigate({ to: "/inbox" })}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-[#cbd7f5] hover:bg-[#f5f7ff] hover:text-[#003d9b]"
          >
            <span className="material-symbols-outlined text-[20px]">
              chat
            </span>

            {/* <span className="hidden sm:inline">Messages</span> */}
          </button>
        </nav>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-[1180px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {/* Hero */}
        <section className="mb-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#eaf0ff] px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[#003d9b]">
                <span className="material-symbols-outlined text-[16px]">
                  calendar_month
                </span>

                Your schedule
              </div>

              <h1 className="text-3xl font-extrabold tracking-tight text-[#071a35] sm:text-4xl">
                Bookings
              </h1>

              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500 sm:text-base">
                {isProvider
                  ? "Stay on top of your appointments and manage your customer bookings."
                  : "Keep track of your upcoming appointments and services you've booked."}
              </p>
            </div>

            {!isProvider && (
              <button
                onClick={() => router.navigate({ to: "/search" })}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#003d9b] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#0052cc] hover:shadow-md"
              >
                <span className="material-symbols-outlined text-[20px]">
                  add
                </span>
                Book a service
              </button>
            )}
          </div>
        </section>

        {/* Error */}
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <span className="material-symbols-outlined">
              error
            </span>

            <div>
              <p className="font-bold">Something went wrong</p>
              <p className="mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Stats */}
        <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            icon="calendar_month"
            label="Total bookings"
            value={counts.all}
          />

          <StatCard
            icon="hourglass_top"
            label="Pending"
            value={counts.pending}
          />

          <StatCard
            icon="event_available"
            label="Confirmed"
            value={counts.confirmed}
          />

          <StatCard
            icon="task_alt"
            label="Completed"
            value={counts.completed}
          />
        </section>

        {/* Filters */}
        <section className="mb-5">
          <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
            {(
              [
                ["all", "All", counts.all],
                ["pending", "Pending", counts.pending],
                ["confirmed", "Confirmed", counts.confirmed],
                ["completed", "Completed", counts.completed],
              ] as const
            ).map(([value, label, count]) => {
              const active = filter === value;

              return (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                    active
                      ? "bg-[#003d9b] text-white shadow-sm"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                  }`}
                >
                  {label}

                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      active
                        ? "bg-white/20 text-white"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Booking list */}
        {filteredBookings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#eef3ff] text-[#003d9b]">
              <span className="material-symbols-outlined text-3xl">
                calendar_month
              </span>
            </div>

            <h2 className="mt-5 text-xl font-bold text-[#071a35]">
              {filter === "all"
                ? "No bookings yet"
                : `No ${filter} bookings`}
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
              {filter === "all"
                ? "Once you book a service, your appointments will appear here."
                : `You don't have any ${filter} bookings right now.`}
            </p>

            {filter === "all" && !isProvider && (
              <button
                onClick={() => router.navigate({ to: "/search" })}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#003d9b] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#0052cc]"
              >
                <span className="material-symbols-outlined">
                  search
                </span>
                Explore services
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {/* {filteredBookings.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                isProvider={isProvider}
              />
            ))} */} 
            {filteredBookings.map((booking) => (
  <BookingCard
    key={booking.id}
    booking={booking}
    isProvider={isProvider}
    onViewDetails={() =>
      router.navigate({
        to: "/booking/$id",
        params: {
          id: booking.id,
        },
      })
    }
  />
))}
          </div>
        )}
      </main>
    </div>
  );
}

export const Route = createFileRoute("/booking")({
  head: () => ({
    meta: [
      {
        title: "Bookings | ExpertHub",
      },
      {
        name: "description",
        content: "View and manage your ExpertHub bookings.",
      },
    ],
  }),

  component: BookingComponent,
});