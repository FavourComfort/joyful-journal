import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AlertTriangle, Bell, CalendarCheck, CheckCircle2, FileText, LayoutDashboard, LogOut, Menu, RefreshCw, Search, ShieldCheck, Users, Wallet, Wrench, X } from "lucide-react";
import { getCurrentProfile, signOut } from "@/lib/services/auth.service";
import { ADMIN_OFFERS_PAGE_SIZE, getOffersForAdmin, type AdminOffersPage } from "@/lib/services/admin.service";

const dateFormat = new Intl.DateTimeFormat("en-UG", { day: "numeric", month: "short", year: "numeric" });
const priceFormat = new Intl.NumberFormat("en-UG", { maximumFractionDigits: 20 });
function createdLabel(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : dateFormat.format(date); }
function priceLabel(value: number | null) { return value != null && Number.isFinite(Number(value)) ? `UGX ${priceFormat.format(Number(value))}` : "Not specified"; }
const navItems = [
  [LayoutDashboard, "Dashboard", "/admin/dashboard"], [Users, "Users", "/admin/users"],
  [ShieldCheck, "Providers", "/admin/providers"], [Wrench, "Services", "/admin/services"],
  [FileText, "Requests", "/admin/requests"], [FileText, "Offers", "/admin/offers"], [CalendarCheck, "Bookings", null],
  [Wallet, "Finance", null], [Wallet, "Wallet", null], [Bell, "Support", null],
  [Bell, "Notifications", null], [AlertTriangle, "Disputes", null], [CheckCircle2, "Reviews", null],
] as const;
const emptyFilters = { search: "", requestId: "", providerId: "" };
function AdminOffers() {
  const router = useRouter();
  const [draft, setDraft] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [result, setResult] = useState<AdminOffersPage>({ rows: [], total: 0, page: 1, pageSize: ADMIN_OFFERS_PAGE_SIZE, contextError: false });
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
      const next = await getOffersForAdmin({ ...filters, page });
      if (ticket === requestId.current) setResult(next);
    } catch (err) {
      if (ticket === requestId.current) setError(err instanceof Error ? err.message : "The offers directory could not load.");
    } finally { if (ticket === requestId.current) setLoading(false); }
  }, [filters, router]);
  useEffect(() => { void load(1); return () => { requestId.current += 1; }; }, [load]);
  const commit = () => {
    const next = { search: draft.search.trim(), requestId: draft.requestId.trim(), providerId: draft.providerId.trim() };
    setFilters((old) => old.search === next.search && old.requestId === next.requestId && old.providerId === next.providerId ? old : next);
  };
  const clear = () => { setDraft(emptyFilters); setFilters({ ...emptyFilters }); };
  const signOutAdmin = async () => { await signOut(); await router.navigate({ to: "/login" }); };
  const { rows, total, page } = result;
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_OFFERS_PAGE_SIZE));
  const from = rows.length ? (page - 1) * ADMIN_OFFERS_PAGE_SIZE + 1 : 0;
  const to = rows.length ? from + rows.length - 1 : 0;
  const navigation = <>
    <div className="mb-5 flex items-center gap-2 px-2"><img src="/favicon.png" alt="NINJAWO" className="h-8 w-8 rounded-lg" /><div><p className="text-base font-bold leading-5 text-slate-950">NINJAWO</p><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-blue-700">Admin console</p></div></div>
    <nav className="space-y-0.5" aria-label="Admin navigation">{navItems.map(([Icon, name, href]) => href ? (
      <a key={name} href={href} aria-current={name === "Offers" ? "page" : undefined} onClick={() => setMobileOpen(false)} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold ${name === "Offers" ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-blue-50 hover:text-blue-700"}`}><Icon className="h-3.5 w-3.5" />{name}</a>
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
        <div className="ml-2 md:ml-0"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">Operations</p><h1 className="text-sm font-bold text-slate-950">Offers</h1></div>
        <div className="ml-auto flex items-center gap-3"><Bell className="h-4 w-4 text-slate-500" /><span className="hidden text-xs font-semibold text-slate-600 sm:inline">Read-only directory</span></div>
      </header>
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-5 xl:p-6">
        <form onSubmit={(event) => { event.preventDefault(); commit(); }} className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 basis-full sm:flex-1"><span className="sr-only">Search offer message, request or business</span><span className="relative block"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><input value={draft.search} onChange={(e) => setDraft({ ...draft, search: e.target.value })} onBlur={commit} placeholder="Search offers, requests or businesses…" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-[13px] outline-none focus:border-blue-400" /></span></label>
          {([['requestId', 'Request ID'], ['providerId', 'Provider ID']] as const).map(([key, label]) => <label key={key} className="min-w-0 flex-1 sm:max-w-40"><span className="block text-[11px] font-semibold text-slate-500">{label} (exact)</span><input value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} onBlur={commit} placeholder="Full UUID (optional)" className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] outline-none focus:border-blue-400" /></label>)}
          <button type="submit" className="rounded-lg bg-blue-700 px-3 py-2 text-[13px] font-semibold text-white">Search</button>
          <button type="button" onClick={clear} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-600" aria-label="Clear search and filters">Clear</button>
        </form>
        <div aria-live="polite" className="text-[12px] text-slate-500">{loading ? "Loading offers…" : !error ? `Showing ${from}–${to} of ${total}` : "Offers unavailable"}</div>
        {!loading && !error && result.contextError && <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800"><AlertTriangle className="h-4 w-4 shrink-0" />Some request, provider or profile details are unavailable. Offer records and totals are retained; related context may be incomplete.</div>}
        <section aria-busy={loading} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_4px_16px_rgba(15,23,42,0.035)]">
          {loading ? <div className="flex min-h-[35vh] items-center justify-center gap-2 text-[13px] text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" />Loading offers…</div> : error ? <div role="alert" className="p-4"><h2 className="text-sm font-bold">Offers unavailable</h2><p className="mt-2 text-[13px] text-slate-600">{error}</p><button type="button" onClick={() => void load(1)} className="mt-3 rounded-md bg-blue-700 px-3 py-1.5 text-[13px] font-semibold text-white">Retry</button></div> : rows.length === 0 ? <p className="px-4 py-6 text-[13px] text-slate-500">{filters.search || filters.requestId || filters.providerId ? "No offers match the current search or filters." : "No offers found."}</p> : <>
            <div className="hidden overflow-x-auto md:block"><table className="w-full table-fixed text-left">
              <caption className="sr-only">Provider offers, read only</caption>
              <thead><tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <th scope="col" className="w-[28%] px-3 py-2.5">Offer / Request</th><th scope="col" className="w-[19%] px-3 py-2.5">Provider</th><th scope="col" className="w-[19%] px-3 py-2.5">Customer</th><th scope="col" className="px-3 py-2.5">Price</th><th scope="col" className="px-3 py-2.5">Dates</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.id} className="text-[13px] text-slate-700 hover:bg-slate-50/60">
                <td className="px-3 py-2"><p className="truncate font-semibold text-slate-950" title={`Request: ${row.request_id}`}>{row.request_title || "Request unavailable"}</p><p className="truncate text-[12px] text-slate-500" title={row.message || undefined}>{row.message || "No message"}</p><p className="truncate text-[11px] text-slate-500" title={`${row.category || "—"} · ${row.location || "—"}`}>{row.category || "—"} · {row.location || "—"}</p><p className="truncate text-[11px] text-slate-400" title={`Offer: ${row.id}`}>#{row.id.slice(0, 8)}</p></td>
                <td className="px-3 py-2"><p className="truncate font-medium" title={`Provider: ${row.provider_id}`}>{row.business_name || "Provider unavailable"}</p><p className="truncate text-[12px] text-slate-500" title={row.owner_name || undefined}>{row.owner_name || "Owner unavailable"}</p></td>
                <td className="px-3 py-2"><p className="truncate" title={row.customer_name || undefined}>{row.customer_name || "Customer unavailable"}</p><p className="truncate text-[12px] text-slate-500">{row.customer_phone || "—"}</p></td>
                <td className="break-words px-3 py-2 tabular-nums">{priceLabel(row.price)}</td>
                <td className="px-3 py-2"><p className="text-[11px] text-slate-500">Estimated start</p><p className="break-words tabular-nums">{row.estimated_start || "Not specified"}</p><p className="mt-0.5 text-[11px] text-slate-500">Created {createdLabel(row.created_at)}</p></td>
              </tr>)}</tbody>
            </table></div>
            <ul className="divide-y divide-slate-100 md:hidden">{rows.map((row) => <li key={row.id} className="flex min-w-0 items-center gap-2.5 px-3 py-2.5">
              <FileText className="h-5 w-5 shrink-0 text-slate-400" /><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold">{row.request_title || "Request unavailable"}</p><p className="truncate text-[12px] text-slate-500">{row.business_name || "Provider unavailable"} · {row.customer_name || "Customer unavailable"}</p><p className="truncate text-[11px] text-slate-500">{row.category || "—"} · {createdLabel(row.created_at)}</p></div>
              <div className="max-w-[38%] shrink-0 text-right"><p className="truncate text-[13px] font-medium">{priceLabel(row.price)}</p><p className="truncate text-[11px] text-slate-500" title={row.estimated_start || undefined}>Start: {row.estimated_start || "Not specified"}</p></div>
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

export const Route = createFileRoute("/admin/offers")({
  head: () => ({ meta: [{ title: "Offers | NINJAWO Admin" }] }),
  component: AdminOffers,
});

