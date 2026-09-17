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
  return <div className="min-h-screen bg-[#f6f8fb] text-slate-900">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-slate-200 bg-white px-3 py-4 md:flex">{navigation}</aside>
    {mobileOpen && <div className="fixed inset-0 z-40 bg-slate-950/30 md:hidden" onClick={() => setMobileOpen(false)} />}
    <aside inert={!mobileOpen} className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white px-3 py-4 transition-transform duration-200 md:hidden ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
      <button type="button" onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close menu"><X className="h-4 w-4" /></button>{navigation}
    </aside>
    <main className="md:pl-56">
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
        <button type="button" onClick={() => setMobileOpen(true)} className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 md:hidden" aria-label="Open menu"><Menu className="h-4 w-4" /></button>
        <div className="ml-2 md:ml-0"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">Operations</p><h1 className="text-sm font-bold text-slate-950">Requests</h1></div>
        <div className="ml-auto flex items-center gap-3"><Bell className="h-4 w-4 text-slate-500" /><span className="hidden text-xs font-semibold text-slate-600 sm:inline">Read-only directory</span></div>
      </header>
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-5 xl:p-6">
        <form onSubmit={(event) => { event.preventDefault(); commit(); }} className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 basis-full sm:flex-1"><span className="sr-only">Search requests or customers</span><span className="relative block"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><input value={draft.search} onChange={(e) => setDraft({ ...draft, search: e.target.value })} onBlur={commit} placeholder="Search requests or customers…" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-[13px] outline-none focus:border-blue-400" /></span></label>
          <label className="min-w-0 flex-1 sm:max-w-44"><span className="block text-[11px] font-semibold text-slate-500">Category (exact value)</span><input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} onBlur={commit} placeholder="All categories" className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] outline-none focus:border-blue-400" /></label>
          <label className="min-w-0 flex-1 sm:max-w-44"><span className="block text-[11px] font-semibold text-slate-500">Location contains</span><input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} onBlur={commit} placeholder="All locations" className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] outline-none focus:border-blue-400" /></label>
          <button type="submit" className="rounded-lg bg-blue-700 px-3 py-2 text-[13px] font-semibold text-white">Search</button>
          <button type="button" onClick={clear} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-600" aria-label="Clear search and filters">Clear</button>
        </form>
        <div aria-live="polite" className="text-[12px] text-slate-500">{loading ? "Loading requests…" : !error ? `Showing ${from}–${to} of ${total}` : "Requests unavailable"}</div>
        {!loading && !error && result.customerContextError && <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800"><AlertTriangle className="h-4 w-4 shrink-0" />Some customer details are unavailable. Request records and totals are shown, but customer context may be incomplete.</div>}
        <section aria-busy={loading} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_4px_16px_rgba(15,23,42,0.035)]">
          {loading ? <div className="flex min-h-[35vh] items-center justify-center gap-2 text-[13px] text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" />Loading requests…</div> : error ? <div role="alert" className="p-4"><h2 className="text-sm font-bold">Requests unavailable</h2><p className="mt-2 text-[13px] text-slate-600">{error}</p><button type="button" onClick={() => void load(1)} className="mt-3 rounded-md bg-blue-700 px-3 py-1.5 text-[13px] font-semibold text-white">Retry</button></div> : rows.length === 0 ? <p className="px-4 py-6 text-[13px] text-slate-500">{filters.search || filters.category || filters.location ? "No requests match the current search or filters." : "No requests found."}</p> : <>
            <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[800px] table-fixed text-left">
              <caption className="sr-only">Customer service requests, read only</caption>
              <thead><tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <th scope="col" className="w-[24%] px-3 py-2.5">Request</th><th scope="col" className="w-[22%] px-3 py-2.5">Customer</th><th scope="col" className="px-3 py-2.5">Category</th><th scope="col" className="px-3 py-2.5">Location</th><th scope="col" className="px-3 py-2.5">Max budget</th><th scope="col" className="px-3 py-2.5">Created</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.id} className="text-[13px] text-slate-700 hover:bg-slate-50/60">
                <td className="px-3 py-2"><p className="truncate font-semibold text-slate-950" title={row.title}>{row.title || "Untitled request"}</p><p className="truncate text-[11px] text-slate-500" title={row.description || undefined}>{row.description || "—"}</p><p className="truncate text-[11px] text-slate-400" title={row.id}>#{row.id.slice(0, 8)}</p></td>
                <td className="px-3 py-2"><div className="flex min-w-0 items-center gap-2"><Avatar row={row} /><div className="min-w-0"><p className="truncate" title={row.customer_name || undefined}>{row.customer_name || "Customer unavailable"}</p><p className="truncate text-[12px] text-slate-500">{row.customer_phone || "—"}</p></div></div></td>
                <td className="px-3 py-2"><span className="block truncate" title={row.category || undefined}>{row.category || "—"}</span></td>
                <td className="px-3 py-2"><span className="block truncate" title={row.location || undefined}>{row.location || "—"}</span></td>
                <td className="px-3 py-2 tabular-nums">{budgetLabel(row.budget_max)}</td>
                <td className="px-3 py-2 tabular-nums">{dateLabel(row.created_at)}</td>
              </tr>)}</tbody>
            </table></div>
            <ul className="divide-y divide-slate-100 md:hidden">{rows.map((row) => <li key={row.id} className="flex min-w-0 items-center gap-2.5 px-3 py-2.5">
              <Avatar row={row} /><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold" title={row.title}>{row.title || "Untitled request"}</p><p className="truncate text-[12px] text-slate-500">{row.customer_name || "Customer unavailable"} · {row.category || "No category"} · {row.location || "No location"}</p></div>
              <div className="max-w-[35%] shrink-0 text-right"><p className="truncate text-[12px] font-medium" title="Maximum budget">{budgetLabel(row.budget_max)}</p><p className="text-[11px] text-slate-500">{dateLabel(row.created_at)}</p></div>
            </li>)}</ul>
          </>}
          {!loading && !error && <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2.5"><p className="text-[12px] text-slate-500">Page {page} of {totalPages}</p><div className="flex items-center gap-1.5">
            <button type="button" disabled={page <= 1} onClick={() => void load(page - 1)} className="rounded-md border border-slate-200 px-2.5 py-1 text-[12px] font-semibold text-slate-600 disabled:opacity-40">‹ Prev</button>
            <button type="button" disabled={page >= totalPages} onClick={() => void load(page + 1)} className="rounded-md border border-slate-200 px-2.5 py-1 text-[12px] font-semibold text-slate-600 disabled:opacity-40">Next ›</button>
          </div></footer>}
        </section>
      </div>
    </main>
  </div>;
}

export const Route = createFileRoute("/admin/requests")({
  head: () => ({ meta: [{ title: "Requests | NINJAWO Admin" }] }),
  component: AdminRequests,
});

