import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useNotifications } from "@/components/NotificationBell";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "Notifications | NINJAWO" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const router = useRouter();
  const { notifications, loading, isLoggedIn, unreadCount, markOne, markAll } =
    useNotifications(true);

  const handleItemClick = async (notification: {
    booking_id?: string | null;
    id: string;
    is_read: boolean;
  }) => {
    await markOne(notification as never);
    if (notification.booking_id) {
      router.navigate({ to: `/booking/${notification.booking_id}` });
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold text-[#041b3c]">Notifications</h1>
        <p className="mt-4 text-sm text-[#434654]">
          Please sign in to see your booking and payment updates.
        </p>
        <button
          type="button"
          onClick={() => router.navigate({ to: "/login" })}
          className="mt-4 rounded-full bg-[#003d9b] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#002f7a]"
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f8fd]">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-[#041b3c]">Notifications</h1>
          {unreadCount > 0 && (
            <span className="rounded-full bg-[#e6efff] px-2.5 py-1 text-xs font-bold text-[#003d9b]">
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
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-[#e3e5ee] bg-white shadow-sm">
          {loading ? (
            <p className="px-4 py-10 text-center text-sm text-[#434654]">Loading notifications…</p>
          ) : notifications.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-[#434654]">
              No notifications yet. Booking and payment updates will appear here.
            </p>
          ) : (
            <ul className="divide-y divide-[#eceef5]">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => handleItemClick(notification)}
                    className={`flex w-full items-start gap-3 px-4 py-4 text-left transition-colors ${
                      notification.is_read
                        ? "bg-white hover:bg-[#f7f8fd]"
                        : "bg-[#f2f6ff] hover:bg-[#e9f0ff]"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span
                          className={`text-sm font-bold text-[#041b3c] ${
                            notification.is_read ? "font-semibold" : ""
                          }`}
                        >
                          {notification.title}
                        </span>
                        {!notification.is_read && (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full bg-[#003d9b]"
                            aria-label="Unread"
                          />
                        )}
                      </span>
                      <span className="mt-1 block text-sm leading-6 text-[#434654] break-words whitespace-pre-wrap">
                        {notification.message}
                      </span>
                      <span className="mt-1.5 block text-xs text-[#83879b]">
                        {new Date(notification.created_at).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}