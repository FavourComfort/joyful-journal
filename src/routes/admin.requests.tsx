import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AlertTriangle, Bell, CalendarCheck, CheckCircle2, FileText, LayoutDashboard, LogOut, Menu, RefreshCw, Search, ShieldCheck, Users, Wallet, Wrench, X } from "lucide-react";
import { getCurrentProfile, signOut } from "@/lib/services/auth.service";
import { ADMIN_REQUESTS_PAGE_SIZE, getRequestsForAdmin, type AdminRequestsPage, type AdminRequestRow } from "@/lib/services/admin.service";

const dateFormat = new Intl.DateTimeFormat("en-UG", { day: "numeric", month: "short", year: "numeric" });
const moneyFormat = new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", maximumFractionDigits: 0 });
function dateLabel(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : dateFormat.format(date); }
function budgetLabel(value: number | null) { return value != null && Number.isFinite(Number(value)) ? moneyFormat.format(Number(value)) : "Not specified"; }
function Avatar({ row }: { row: AdminRequestRow }) {
  return row.customer_avatar_url
    ? <img src={row.customer_avatar_url} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
    : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold">{row.customer_name?.trim().charAt(0).toUpperCase() || "?"}</span>;
}
const navItems = [
  [LayoutDashboard, "Dashboard", "/admin/dashboard"], [Users, "Users", "/admin/users"],
  [ShieldCheck, "Providers", "/admin/providers"], [Wrench, "Services", "/admin/services"],
  [FileText, "Requests", "/admin/requests"], [CalendarCheck, "Bookings", null],
  [Wallet, "Finance", null], [Wallet, "Wallet", null], [Bell, "Support", null],
  [Bell, "Notifications", null], [AlertTriangle, "Disputes", null], [CheckCircle2, "Reviews", null],
] as const;

function AdminRequests() {
  const router = useRouter();
  const [draft, setDraft] = useState({ search: "", category: "", location: "" });
  const [filters, setFilters] = useState(draft);
  const [result, setResult] = useState<AdminRequestsPage>({ rows: [], total: 0, page: 1, pageSize: ADMIN_REQUESTS_PAGE_SIZE, customerContextError: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const requestId = useRef(0);
  const load = useCallback(async (page = 1) => {
    const ticket = ++requestId.current;
    setLoading(true); setError(null);
    try {
      const profile = await getCurrentProfile();
      if (ticket !== requestId.current) return;
      if (!profile) { await router.navigate({ to: "/login" }); return; }
      if (profile.role !== "admin") { await router.navigate({ to: "/" }); return; }
      const next = await getRequestsForAdmin({ ...filters, page });
      if (ticket === requestId.current) setResult(next);
    } catch (err) {
      if (ticket === requestId.current) setError(err instanceof Error ? err.message : "The requests directory could not load.");
    } finally { if (ticket === requestId.current) setLoading(false); }
  }, [filters, router]);
  useEffect(() => { void load(1); return () => { requestId.current += 1; }; }, [load]);
  const commit = () => {
    const next = { search: draft.search.trim(), category: draft.category, location: draft.location.trim() };
    setFilters((old) => Object.keys(next).every((key) => old[key as keyof typeof old] === next[key as keyof typeof next]) ? old : next);
  };
  const clear = () => { const empty = { search: "", category: "", location: "" }; setDraft(empty); setFilters(empty); };
  const signOutAdmin = async () => { await signOut(); await router.navigate({ to: "/login" }); };
  const { rows, total, page } = result;
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_REQUESTS_PAGE_SIZE));
  const from = rows.length ? (page - 1) * ADMIN_REQUESTS_PAGE_SIZE + 1 : 0;
  const to = rows.length ? from + rows.length - 1 : 0;
  const navigation = <>
    <div className="mb-5 flex items-center gap-2 px-2"><img src="/favicon.png" alt="NINJAWO" className="h-8 w-8 rounded-lg" /><div><p className="text-base font-bold leading-5 text-slate-950">NINJAWO</p><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-blue-700">Admin console</p></div></div>
    <nav className="space-y-0.5" aria-label="Admin navigation">{navItems.map(([Icon, name, href]) => href ? (
      <a key={name} href={href} aria-current={name === "Requests" ? "page" : undefined} onClick={() => setMobileOpen(false)} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold ${name === "Requests" ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-blue-50 hover:text-blue-700"}`}><Icon className="h-3.5 w-3.5" />{name}</a>
    ) : <button key={name} disabled className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-slate-400"><Icon className="h-3.5 w-3.5" />{name}<span className="ml-auto text-[9px] uppercase">Soon</span></button>)}</nav>
    <button type="button" onClick={signOutAdmin} className="mt-auto flex items-center gap-2.5 px-2.5 py-2 text-xs font-semibold text-slate-600"><LogOut className="h-3.5 w-3.5" />Sign out</button>
  </>;
