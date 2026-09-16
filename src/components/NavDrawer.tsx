
import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { getCurrentProfile, signOut } from "@/lib/services/auth.service";
import NotificationBell from "@/components/NotificationBell";

interface NavDrawerProps {
  /** Optional: render a custom trigger button instead of the default hamburger */
  children?: React.ReactNode;
}

export default function NavDrawer({ children }: NavDrawerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<"customer" | "provider" | "admin" | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const check = async () => {
      const profile = await getCurrentProfile();
      if (profile) {
        setRole(profile.role);
        setIsLoggedIn(true);
      } else {
        setRole(null);
        setIsLoggedIn(false);
      }
    };
    check();
  }, []);

  // Close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [router.state.location.pathname]);

  const handleNavigate = (to: string) => {
    setOpen(false);
    router.navigate({ to });
  };

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    await router.navigate({ to: "/login" });
  };

  const dashboardRoute =
    role === "provider"
      ? "/provider/dashboard"
      : role === "admin"
        ? "/admin/dashboard"
        : "/dashboard";

  const drawerTitle = role === "admin" ? "Admin Console" : "NINJAWO";

  return (
    <>
      {/* Trigger — notification bell + hamburger share the top navigation */}
      {children || (
        <div className="flex items-center gap-1">
          <NotificationBell />
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg p-1 text-[#003d9b] hover:bg-[#f1f3ff] transition-colors"
            aria-label="Open menu"
          >
            <span className="material-symbols-outlined">menu</span>
          </button>
        </div>
      )}

      {/* Backdrop — fully opaque so page content doesn't bleed through */}
      {open && (
        <div
          className="fixed inset-0 z-[60] bg-[#041b3c]/60"
          onClick={() => setOpen(false)}
        />
      )}
      {/* Drawer — solid background, no transparency */}
      <aside
        className={`fixed left-0 top-0 z-[70] isolate h-full w-80 max-w-[88vw] bg-white opacity-100 shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-[#c3c6d6] bg-white p-4">
          <span className="text-xl font-bold text-[#003d9b]">{drawerTitle}</span>
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg p-1 text-[#434654] hover:bg-[#f1f3ff] transition-colors"
            aria-label="Close menu"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <nav className="mt-4 flex flex-col gap-1 px-3" aria-label="Menu">
          {role === "admin" ? (
            <>
              <button onClick={() => handleNavigate("/admin/dashboard")} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#041b3c] hover:bg-[#f1f3ff] transition-colors text-left"><span className="material-symbols-outlined text-[#003d9b]">dashboard</span>Overview</button>
              <button onClick={() => handleNavigate("/admin/dashboard")} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#041b3c] hover:bg-[#f1f3ff] transition-colors text-left"><span className="material-symbols-outlined text-[#003d9b]">shield</span>Provider Verification</button>
              <button onClick={() => handleNavigate("/admin/dashboard")} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#041b3c] hover:bg-[#f1f3ff] transition-colors text-left"><span className="material-symbols-outlined text-[#003d9b]">assignment</span>Requests</button>
              <button onClick={() => handleNavigate("/admin/dashboard")} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#041b3c] hover:bg-[#f1f3ff] transition-colors text-left"><span className="material-symbols-outlined text-[#003d9b]">handshake</span>Offers</button>
              <button onClick={() => handleNavigate("/admin/dashboard")} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#041b3c] hover:bg-[#f1f3ff] transition-colors text-left"><span className="material-symbols-outlined text-[#003d9b]">calendar_month</span>Bookings</button>
              <button onClick={() => handleNavigate("/admin/dashboard")} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#041b3c] hover:bg-[#f1f3ff] transition-colors text-left"><span className="material-symbols-outlined text-[#003d9b]">star</span>Reviews</button>
              <div className="my-3 border-t border-[#c3c6d6]" />
              <button onClick={() => handleNavigate("/")} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#041b3c] hover:bg-[#f1f3ff] transition-colors text-left"><span className="material-symbols-outlined text-[#003d9b]">home</span>Back to Home</button>
              <button onClick={handleSignOut} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#ba1a1a] hover:bg-[#ffdad6] transition-colors text-left"><span className="material-symbols-outlined text-[#ba1a1a]">logout</span>Sign Out</button>
            </>
          ) : role === "provider" ? (
            <>
              <button onClick={() => handleNavigate("/")} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#041b3c] hover:bg-[#f1f3ff] transition-colors text-left"><span className="material-symbols-outlined text-[#003d9b]">home</span>Home</button>
              <button onClick={() => handleNavigate("/search")} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#041b3c] hover:bg-[#f1f3ff] transition-colors text-left"><span className="material-symbols-outlined text-[#003d9b]">search</span>Explore</button>
              <button onClick={() => handleNavigate("/booking")} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#041b3c] hover:bg-[#f1f3ff] transition-colors text-left"><span className="material-symbols-outlined text-[#003d9b]">calendar_month</span>Bookings</button>
              <button onClick={() => handleNavigate("/inbox")} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#041b3c] hover:bg-[#f1f3ff] transition-colors text-left"><span className="material-symbols-outlined text-[#003d9b]">chat</span>Inbox</button>
              <button onClick={() => handleNavigate("/notifications")} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#041b3c] hover:bg-[#f1f3ff] transition-colors text-left"><span className="material-symbols-outlined text-[#003d9b]">notifications</span>Notifications</button>
              <button onClick={() => handleNavigate("/provider/requests")} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#041b3c] hover:bg-[#f1f3ff] transition-colors text-left"><span className="material-symbols-outlined text-[#003d9b]">assignment</span>Customer Requests</button>
              <div className="my-3 border-t border-[#c3c6d6]" />
              <button onClick={() => handleNavigate("/provider/dashboard")} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#041b3c] hover:bg-[#f1f3ff] transition-colors text-left"><span className="material-symbols-outlined text-[#003d9b]">dashboard</span>Provider Dashboard</button>
              <button onClick={handleSignOut} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#ba1a1a] hover:bg-[#ffdad6] transition-colors text-left"><span className="material-symbols-outlined text-[#ba1a1a]">logout</span>Sign Out</button>
            </>
          ) : isLoggedIn ? (
            <>
              <button onClick={() => handleNavigate("/")} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#041b3c] hover:bg-[#f1f3ff] transition-colors text-left"><span className="material-symbols-outlined text-[#003d9b]">home</span>Home</button>
              <button onClick={() => handleNavigate("/search")} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#041b3c] hover:bg-[#f1f3ff] transition-colors text-left"><span className="material-symbols-outlined text-[#003d9b]">search</span>Explore</button>
              <button onClick={() => handleNavigate("/booking")} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#041b3c] hover:bg-[#f1f3ff] transition-colors text-left"><span className="material-symbols-outlined text-[#003d9b]">calendar_month</span>Bookings</button>
              <button onClick={() => handleNavigate("/inbox")} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#041b3c] hover:bg-[#f1f3ff] transition-colors text-left"><span className="material-symbols-outlined text-[#003d9b]">chat</span>Inbox</button>
              <button onClick={() => handleNavigate("/notifications")} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#041b3c] hover:bg-[#f1f3ff] transition-colors text-left"><span className="material-symbols-outlined text-[#003d9b]">notifications</span>Notifications</button>
              <button onClick={() => handleNavigate("/my-requests")} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#041b3c] hover:bg-[#f1f3ff] transition-colors text-left"><span className="material-symbols-outlined text-[#003d9b]">assignment</span>My Requests</button>
              <button onClick={() => handleNavigate("/post-request")} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#041b3c] hover:bg-[#f1f3ff] transition-colors text-left"><span className="material-symbols-outlined text-[#003d9b]">add_circle</span>Post a Service Request</button>
              <div className="my-3 border-t border-[#c3c6d6]" />
              <button onClick={() => handleNavigate("/dashboard")} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#041b3c] hover:bg-[#f1f3ff] transition-colors text-left"><span className="material-symbols-outlined text-[#003d9b]">dashboard</span>Dashboard</button>
              <button onClick={handleSignOut} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#ba1a1a] hover:bg-[#ffdad6] transition-colors text-left"><span className="material-symbols-outlined text-[#ba1a1a]">logout</span>Sign Out</button>
            </>
          ) : (
            <>
              <button onClick={() => handleNavigate("/")} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#041b3c] hover:bg-[#f1f3ff] transition-colors text-left"><span className="material-symbols-outlined text-[#003d9b]">home</span>Home</button>
              <button onClick={() => handleNavigate("/search")} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#041b3c] hover:bg-[#f1f3ff] transition-colors text-left"><span className="material-symbols-outlined text-[#003d9b]">search</span>Explore</button>
              <div className="my-3 border-t border-[#c3c6d6]" />
              <button onClick={() => handleNavigate("/login")} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#041b3c] hover:bg-[#f1f3ff] transition-colors text-left"><span className="material-symbols-outlined text-[#003d9b]">login</span>Sign In</button>
              <button onClick={() => handleNavigate("/signup")} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#041b3c] hover:bg-[#f1f3ff] transition-colors text-left"><span className="material-symbols-outlined text-[#003d9b]">person_add</span>Sign Up</button>
            </>
          )}
        </nav>

        {/* In-app notifications moved out of the drawer: they now live in the
            top navigation bell (NotificationBell) and the /notifications page. */}
      </aside>
    </>
  );
}
