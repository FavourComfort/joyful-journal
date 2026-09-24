import { useRouter, useRouterState } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bell,
  CalendarCheck,
  CheckCircle2,
  FileText,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import { signOut } from "@/lib/services/auth.service";

type AdminNavIcon = typeof Users;

export interface AdminNavItem {
  /** Visible sidebar label. */
  label: string;
  /**
   * Explicit destination for this item. `null` marks an intentional,
   * not-yet-implemented placeholder which renders as a disabled "Soon" button.
   * Never infer a route from array position or label.
   */
  to: string | null;
  icon: AdminNavIcon;
}

/**
 * PHASE 5D — the single source of truth for the Admin Console navigation.
 *
 * This replaces 13 per-page copies of `navItems` / `navigation` (which had
 * drifted into four different lists, three different icons for the same
 * destination, and an order-dependent `index === N` href chain in the
 * dashboard). Every item now carries its own route as data, so adding or
 * reordering an item can never silently re-point another destination.
 *
 * The active item is derived from the current pathname — never from an index.
 *
 * `Support` is deliberately `to: null`: it is a placeholder only. There is no
 * `/admin/support` route, no support service, no support table and no support
 * functionality anywhere in NINJAWO, and this phase does not add any.
 */
export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { label: "Dashboard", to: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Users", to: "/admin/users", icon: Users },
  { label: "Providers", to: "/admin/providers", icon: ShieldCheck },
  { label: "Services", to: "/admin/services", icon: Wrench },
  { label: "Requests", to: "/admin/requests", icon: FileText },
  { label: "Offers", to: "/admin/offers", icon: FileText },
  { label: "Bookings", to: "/admin/bookings", icon: CalendarCheck },
  { label: "Finance", to: "/admin/finance", icon: Wallet },
  { label: "Wallet", to: "/admin/wallet", icon: Wallet },
  { label: "Payouts", to: "/admin/payouts", icon: Wallet },
  { label: "Reviews", to: "/admin/reviews", icon: CheckCircle2 },
  { label: "Disputes", to: "/admin/disputes", icon: AlertTriangle },
  { label: "Notifications", to: "/admin/notifications", icon: Bell },
  { label: "Support", to: null, icon: Bell },
];

/** The only intentionally disabled Admin navigation item. */
export const ADMIN_NAV_PLACEHOLDER_LABEL = "Support";

/**
 * Renders the Admin sidebar contents (brand block + navigation + sign out).
 * Rendered twice per page — once for the fixed desktop rail and once inside the
 * mobile drawer — exactly as the previous inline markup was.
 *
 * `onNavigate` is called when an item is clicked so the page can close its
 * mobile drawer; the visual output is byte-for-byte the previous sidebar markup.
 */
export function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const closeMobile = () => onNavigate?.();
  const signOutAdmin = async () => {
    await signOut();
    await router.navigate({ to: "/login" });
  };

  return (
    <>
      <div className="mb-5 flex items-center gap-2 px-2">
        <img src="/favicon.png" alt="NINJAWO" className="h-8 w-8 rounded-lg" />
        <div>
          <p className="text-base font-bold leading-5 text-slate-950">NINJAWO</p>
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-blue-700">Admin console</p>
        </div>
      </div>
      <nav className="space-y-0.5" aria-label="Admin navigation">
        {ADMIN_NAV_ITEMS.map(({ label, to, icon: Icon }) => {
          if (!to) {
            return (
              <button
                key={label}
                disabled
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-slate-400"
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                <span className="ml-auto text-[9px] uppercase">Soon</span>
              </button>
            );
          }

          const active = pathname === to;
          return (
            <a
              key={label}
              href={to}
              aria-current={active ? "page" : undefined}
              onClick={closeMobile}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold ${
                active ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-blue-50 hover:text-blue-700"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </a>
          );
        })}
      </nav>
      <button
        type="button"
        onClick={signOutAdmin}
        className="mt-auto flex items-center gap-2.5 px-2.5 py-2 text-xs font-semibold text-slate-600"
      >
        <LogOut className="h-3.5 w-3.5" />
        Sign out
      </button>
    </>
  );
}
