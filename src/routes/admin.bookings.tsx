import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AlertTriangle, Bell, CalendarCheck, CheckCircle2, FileText, LayoutDashboard, LogOut, Menu, RefreshCw, ShieldCheck, Users, Wallet, Wrench, X } from "lucide-react";
import { getCurrentProfile, signOut } from "@/lib/services/auth.service";
import { ADMIN_BOOKINGS_PAGE_SIZE, ADMIN_BOOKING_STATUSES, getBookingsForAdmin, type AdminBookingsPage } from "@/lib/services/admin.service";

const amountFormat = new Intl.NumberFormat("en-UG", { maximumFractionDigits: 20 });
function amount(value: number) { return value != null && Number.isFinite(Number(value)) ? `UGX ${amountFormat.format(Number(value))}` : "Not specified"; }
const emptyFilters = { search: "", status: "", dateFrom: "", dateTo: "" };
const navItems = [
  [LayoutDashboard, "Dashboard", "/admin/dashboard"], [Users, "Users", "/admin/users"],
  [ShieldCheck, "Providers", "/admin/providers"], [Wrench, "Services", "/admin/services"],
  [FileText, "Requests", "/admin/requests"], [FileText, "Offers", "/admin/offers"], [CalendarCheck, "Bookings", "/admin/bookings"],
  [Wallet, "Finance", null], [Wallet, "Wallet", null], [Bell, "Support", null],
  [Bell, "Notifications", null], [AlertTriangle, "Disputes", null], [CheckCircle2, "Reviews", null],
] as const;

function AdminBookings() {
  const router = useRouter();
  const [draft, setDraft] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [result, setResult] = useState<AdminBookingsPage>({ rows: [], total: 0, page: 1, pageSize: ADMIN_BOOKINGS_PAGE_SIZE, contextError: false });
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
      const next = await getBookingsForAdmin({ ...filters, page });
      if (ticket === requestId.current) setResult(next);
    } catch (err) {
      if (ticket === requestId.current) setError(err instanceof Error ? err.message : "The bookings directory could not load.");
    } finally { if (ticket === requestId.current) setLoading(false); }
  }, [filters, router]);
  useEffect(() => { void load(1); return () => { requestId.current += 1; }; }, [load]);
  const commit = () => {
    const next = { ...draft, search: draft.search.trim() };
    setFilters((old) => Object.keys(next).every((key) => old[key as keyof typeof old] === next[key as keyof typeof next]) ? old : next);
  };
  const clear = () => { setDraft(emptyFilters); setFilters({ ...emptyFilters }); };
  const signOutAdmin = async () => { await signOut(); await router.navigate({ to: "/login" }); };
  const { rows, total, page } = result;
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_BOOKINGS_PAGE_SIZE));
  const from = rows.length ? (page - 1) * ADMIN_BOOKINGS_PAGE_SIZE + 1 : 0;
  const to = rows.length ? from + rows.length - 1 : 0;
  const navigation = <>
    <div className="mb-5 flex items-center gap-2 px-2"><img src="/favicon.png" alt="NINJAWO" className="h-8 w-8 rounded-lg" /><div><p className="text-base font-bold leading-5 text-slate-950">NINJAWO</p><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-blue-700">Admin console</p></div></div>
    <nav className="space-y-0.5" aria-label="Admin navigation">{navItems.map(([Icon, name, href]) => href ? (
      <a key={name} href={href} aria-current={name === "Bookings" ? "page" : undefined} onClick={() => setMobileOpen(false)} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold ${name === "Bookings" ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-blue-50 hover:text-blue-700"}`}><Icon className="h-3.5 w-3.5" />{name}</a>
    ) : <button key={name} disabled className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-slate-400"><Icon className="h-3.5 w-3.5" />{name}<span className="ml-auto text-[9px] uppercase">Soon</span></button>)}</nav>
    <button type="button" onClick={signOutAdmin} className="mt-auto flex items-center gap-2.5 px-2.5 py-2 text-xs font-semibold text-slate-600"><LogOut className="h-3.5 w-3.5" />Sign out</button>
  </>;
  return <div className="min-h-screen bg-[#f6f8fb] text-slate-900">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-slate-200 bg-white px-3 py-4 md:flex">{navigation}</aside>
    {mobileOpen && <div className="fixed inset-0 z-40 bg-slate-950/30 md:hidden" onClick={() => setMobileOpen(false)} />}
    <aside inert={!mobileOpen} className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white px-3 py-4 transition-transform duration-200 md:hidden ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
      <button type="button" onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 rounded-md p-1.5 text-slate-500" aria-label="Close menu"><X className="h-4 w-4" /></button>{navigation}
    </aside>
    <main className="md:pl-56">
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
        <button type="button" onClick={() => setMobileOpen(true)} className="rounded-md p-1.5 text-slate-600 md:hidden" aria-label="Open menu"><Menu className="h-4 w-4" /></button>
        <div className="ml-2 md:ml-0"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">Operations</p><h1 className="text-sm font-bold text-slate-950">Bookings</h1></div>
        <div className="ml-auto flex items-center gap-3"><Bell className="h-4 w-4 text-slate-500" /><span className="hidden text-xs font-semibold text-slate-600 sm:inline">Read-only directory</span></div>
      </header>
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-5 xl:p-6">
        <form onSubmit={(event) => { event.preventDefault(); commit(); }} className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 basis-full sm:flex-1"><span className="block text-[11px] font-semibold text-slate-500">Search customer, business, service or full booking ID</span><input value={draft.search} onChange={(e) => setDraft({ ...draft, search: e.target.value })} onBlur={commit} placeholder="Search bookings…" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-blue-400" /></label>
          <label className="min-w-0 flex-1 sm:max-w-36"><span className="block text-[11px] font-semibold text-slate-500">Booking status</span><select value={draft.status} onChange={(e) => { const next = { ...draft, status: e.target.value }; setDraft(next); setFilters({ ...next, search: next.search.trim() }); }} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-[13px]"><option value="">All statuses</option>{ADMIN_BOOKING_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          {([['dateFrom', 'Scheduled from'], ['dateTo', 'Scheduled to']] as const).map(([key, label]) => <label key={key} className="min-w-0 flex-1 sm:max-w-40"><span className="block text-[11px] font-semibold text-slate-500">{label}</span><input type="date" value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} onBlur={commit} className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-[13px]" /></label>)}
          <button type="submit" className="rounded-lg bg-blue-700 px-3 py-2 text-[13px] font-semibold text-white">Search</button>
          <button type="button" onClick={clear} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-600">Clear</button>
        </form>
        <div aria-live="polite" className="text-[12px] text-slate-500">{loading ? "Loading bookings…" : !error ? `Showing ${from}–${to} of ${total}` : "Bookings unavailable"}</div>
        {!loading && !error && result.contextError && <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800"><AlertTriangle className="h-4 w-4 shrink-0" />Some customer, provider or service details are unavailable. Booking records and totals are retained; related context may be incomplete.</div>}
        <section aria-busy={loading} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_4px_16px_rgba(15,23,42,0.035)]">
          {loading ? <div className="flex min-h-[35vh] items-center justify-center gap-2 text-[13px] text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" />Loading bookings…</div> : error ? <div role="alert" className="p-4"><h2 className="text-sm font-bold">Bookings unavailable</h2><p className="mt-2 text-[13px] text-slate-600">{error}</p><button type="button" onClick={() => void load(1)} className="mt-3 rounded-md bg-blue-700 px-3 py-1.5 text-[13px] font-semibold text-white">Retry</button></div> : rows.length === 0 ? <p className="px-4 py-6 text-[13px] text-slate-500">{filters.search || filters.status || filters.dateFrom || filters.dateTo ? "No bookings match the current search or filters." : "No bookings found."}</p> : <>
            <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[820px] table-fixed text-left">
              <caption className="sr-only">Existing bookings, read only</caption>
              <thead><tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wide text-slate-500">{['Booking / Service', 'Customer', 'Provider', 'Scheduled', 'Stored amount', 'Status'].map((label) => <th key={label} scope="col" className="px-3 py-2.5">{label}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.id} className="text-[13px] text-slate-700 hover:bg-slate-50/60">
                <td className="px-3 py-2"><p className="truncate font-semibold text-slate-950" title={row.service_title || undefined}>{row.service_title || "Service unavailable"}</p><p className="truncate text-[12px] text-slate-500">{row.category || "—"}</p><p className="truncate text-[11px] text-slate-500" title={`Booking: ${row.id}\nCreated: ${row.created_at}`}>#{row.id.slice(0, 8)} · {row.created_at?.slice(0, 10)}</p></td>
                <td className="px-3 py-2"><p className="truncate" title={row.customer_name || undefined}>{row.customer_name || "Customer unavailable"}</p><p className="truncate text-[12px] text-slate-500">{row.customer_phone || "—"}</p></td>
                <td className="px-3 py-2"><p className="truncate" title={row.business_name || undefined}>{row.business_name || "Provider unavailable"}</p><p className="truncate text-[12px] text-slate-500">{row.owner_name || "Owner unavailable"}</p></td>
                <td className="px-3 py-2 tabular-nums"><p>{row.booking_date}</p><p className="text-[12px] text-slate-500">Start: {row.start_time || "Not specified"}</p>{row.end_time && <p className="text-[12px] text-slate-500">End: {row.end_time}</p>}</td>
                <td className="break-words px-3 py-2 tabular-nums">{amount(row.total_amount)}</td>
                <td className="px-3 py-2"><span className="inline-block max-w-full break-words rounded-md bg-slate-100 px-2 py-1 text-[13px]">{row.status || "—"}</span></td>
              </tr>)}</tbody>
            </table></div>
            <ul className="divide-y divide-slate-100 md:hidden">{rows.map((row) => <li key={row.id} className="flex min-w-0 items-center gap-2.5 px-3 py-2.5">
              <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold" title={row.id}>{row.service_title || `#${row.id.slice(0, 8)}`}</p><p className="truncate text-[12px] text-slate-500">{row.customer_name || "Customer unavailable"} · {row.business_name || "Provider unavailable"}</p><p className="truncate text-[12px] text-slate-500">{row.booking_date} · Start: {row.start_time || "Not specified"}</p></div>
              <div className="max-w-[38%] shrink-0 text-right"><p className="truncate text-[13px] font-medium">{amount(row.total_amount)}</p><p className="text-[12px] text-slate-600">{row.status || "—"}</p></div>
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

export const Route = createFileRoute("/admin/bookings")({
  head: () => ({ meta: [{ title: "Bookings | NINJAWO Admin" }] }),
  component: AdminBookings,
});


