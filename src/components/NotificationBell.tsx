import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { formatDistanceToNowStrict } from "date-fns";
import { getCurrentProfile } from "@/lib/services/auth.service";
import {
  getUserNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  type Notification,
} from "@/lib/services/notifications.service";

/** Shared notification state + actions for the bell, popover, and full page. */
export function useNotifications(enabled: boolean = true) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const load = useCallback(async () => {
    const profile = await getCurrentProfile();
    if (!profile) {
      setIsLoggedIn(false);
      setNotifications([]);
      return;
    }
    setIsLoggedIn(true);
    if (!enabled) return;
    setLoading(true);
    const items = await getUserNotifications(profile.id);
    setNotifications(items);
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    load();
  }, [load]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markOne = useCallback(async (notification: Notification) => {
    if (notification.is_read) return;
    setNotifications((items) =>
      items.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n)),
    );
    const ok = await markNotificationAsRead(notification.id);
    if (!ok) {
      setNotifications((items) =>
        items.map((n) => (n.id === notification.id ? { ...n, is_read: false } : n)),
      );
    }
  }, []);

  const markAll = useCallback(async () => {
    const profile = await getCurrentProfile();
    if (!profile) return;
    const ok = await markAllNotificationsAsRead(profile.id);
    if (ok) setNotifications((items) => items.map((n) => ({ ...n, is_read: true })));
  }, []);

  return { notifications, loading, isLoggedIn, unreadCount, markOne, markAll, reload: load };
}

/** Short relative time, e.g. "2 min ago". */
function relativeTime(value: string): string {
  try {
    return `${formatDistanceToNowStrict(new Date(value), { roundingMethod: "floor" })} ago`;
  } catch {
    return "";
  }
}

/** Icon + tint for each notification type (reader-only presentation). */
function notificationVisual(type: string): { icon: string; bg: string; fg: string } {
  switch (type) {
    case "payment_escrowed":
      return { icon: "lock", bg: "bg-[#e6f6ec]", fg: "text-[#1a7a3c]" };
    case "booking_confirmed":
      return { icon: "event_available", bg: "bg-[#e6efff]", fg: "text-[#003d9b]" };
    case "completion_requested":
      return { icon: "task_alt", bg: "bg-[#fff4e0]", fg: "text-[#9a5b00]" };
    case "payment_released":
      return { icon: "paid", bg: "bg-[#e6f6ec]", fg: "text-[#1a7a3c]" };
    case "dispute_raised":
    case "dispute_resolved":
      return { icon: "gavel", bg: "bg-[#ffdad6]", fg: "text-[#ba1a1a]" };
    case "booking_cancelled":
      return { icon: "cancel", bg: "bg-[#f0f1f6]", fg: "text-[#434654]" };
    default:
      return { icon: "notifications", bg: "bg-[#f0f1f6]", fg: "text-[#003d9b]" };
  }
}

/** Existing relevant destination for a notification, when available. */
function notificationRoute(notification: Notification): string | null {
  return notification.booking_id ? `/booking/${notification.booking_id}` : null;
}

interface NotificationListProps {
  notifications: Notification[];
  loading: boolean;
  emptyMessage: string;
  onItemClick?: (notification: Notification) => void;
}

/** Shared scrollable list — long text wraps/clamps, it never clips horizontally. */
function NotificationList({
  notifications,
  loading,
  emptyMessage,
  onItemClick,
}: NotificationListProps) {
  if (loading) {
    return <p className="px-4 py-8 text-center text-sm text-[#434654]">Loading notifications…</p>;
  }
  if (notifications.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-[#434654]">{emptyMessage}</p>;
  }
  return (
    <ul className="divide-y divide-[#eceef5]">
      {notifications.map((notification) => {
        const visual = notificationVisual(notification.type);
        return (
          <li key={notification.id}>
            <button
              type="button"
              onClick={() => onItemClick?.(notification)}
              className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors ${
                notification.is_read ? "bg-white hover:bg-[#f7f8fd]" : "bg-[#f2f6ff] hover:bg-[#e9f0ff]"
              }`}
            >
              <span
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${visual.bg}`}
              >
                <span className={`material-symbols-outlined text-[20px] ${visual.fg}`}>
                  {visual.icon}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span
                    className={`min-w-0 truncate text-sm text-[#041b3c] ${
                      notification.is_read ? "font-semibold" : "font-bold"
                    }`}
                  >
                    {notification.title}
                  </span>
                  {!notification.is_read && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[#003d9b]" aria-label="Unread" />
                  )}
                  <span className="ml-auto shrink-0 pl-1 text-[11px] text-[#83879b]">
                    {relativeTime(notification.created_at)}
                  </span>
                </span>
                <span className="mt-0.5 block text-sm leading-5 text-[#434654] line-clamp-2 break-words">
                  {notification.message}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Bell button with unread badge — rendered inside the main top navigation. */
export default function NotificationBell() {
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const { notifications, loading, isLoggedIn, unreadCount, markOne, markAll, reload } =
    useNotifications(open);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Reload fresh data whenever the panel opens.
  useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  // Close desktop popover on outside click / Escape.
  useEffect(() => {
    if (!open || isMobile) return;
    const onPointerDown = (event: PointerEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, isMobile]);

  // Close any open panel on navigation.
  useEffect(() => {
    setOpen(false);
  }, [router.state.location.pathname]);

  const handleItemClick = async (notification: Notification) => {
    await markOne(notification);
    const to = notificationRoute(notification);
    if (to) {
      setOpen(false);
      router.navigate({ to });
    }
  };

  const viewAll = () => {
    setOpen(false);
    router.navigate({ to: "/notifications" });
  };

  if (!isLoggedIn) return null;

  const bell = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="relative rounded-lg p-1.5 text-[#003d9b] transition-colors hover:bg-[#f1f3ff]"
      aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      aria-expanded={open}
    >
      <span className="material-symbols-outlined">notifications</span>
      {unreadCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ba1a1a] px-1 text-[10px] font-bold text-white">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </button>
  );

  // ---- Mobile: comfortable full-screen sheet -------------------------------
  if (isMobile) {
    return (
      <>
        {bell}
        {open && (
          <div
            className="fixed inset-0 z-[90] flex flex-col bg-white"
            role="dialog"
            aria-modal="true"
            aria-label="Notifications"
          >
            <header className="flex items-center gap-2 border-b border-[#e3e5ee] bg-white px-3 py-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-[#434654] hover:bg-[#f1f3ff]"
                aria-label="Close notifications"
              >
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
              <h2 className="text-lg font-bold text-[#041b3c]">Notifications</h2>
              {unreadCount > 0 && (
                <span className="rounded-full bg-[#e6efff] px-2 py-0.5 text-xs font-bold text-[#003d9b]">
                  {unreadCount} new
                </span>
              )}
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAll}
                  className="ml-auto text-sm font-semibold text-[#003d9b] hover:underline"
                >
                  Mark all read
                </button>
              )}
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <NotificationList
                notifications={notifications}
                loading={loading}
                emptyMessage="No notifications yet. Booking and payment updates will appear here."
                onItemClick={handleItemClick}
              />
            </div>
          </div>
        )}
      </>
    );
  }

  // ---- Desktop: floating popover anchored to the bell ----------------------
  return (
    <div className="relative" ref={popoverRef}>
      {bell}
      {open && (
        <div
          className="absolute left-0 top-full z-[80] mt-2 w-[380px] overflow-hidden rounded-2xl border border-[#e3e5ee] bg-white shadow-2xl"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="flex items-center gap-2 border-b border-[#eceef5] px-4 py-3">
            <h2 className="text-sm font-bold text-[#041b3c]">Notifications</h2>
            {unreadCount > 0 && (
              <span className="rounded-full bg-[#e6efff] px-2 py-0.5 text-[11px] font-bold text-[#003d9b]">
                {unreadCount} new
              </span>
            )}
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="ml-auto text-xs font-semibold text-[#003d9b] hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[380px] min-h-0 overflow-y-auto overscroll-contain">
            <NotificationList
              notifications={notifications.slice(0, 12)}
              loading={loading}
              emptyMessage="No notifications yet. Booking and payment updates will appear here."
              onItemClick={handleItemClick}
            />
          </div>
          <button
            type="button"
            onClick={viewAll}
            className="block w-full border-t border-[#eceef5] px-4 py-3 text-center text-sm font-semibold text-[#003d9b] transition-colors hover:bg-[#f2f6ff]"
          >
            View all notifications
          </button>
        </div>
      )}
    </div>
  );
}