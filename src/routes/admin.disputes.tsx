import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AlertTriangle, Bell, CalendarCheck, CheckCircle2, FileText, LayoutDashboard, LogOut, Menu, RefreshCw, Search, ShieldCheck, Star, Users, Wallet, Wrench, X } from "lucide-react";
import { getCurrentProfile, signOut } from "@/lib/services/auth.service";
import { ADMIN_DISPUTES_PAGE_SIZE, ADMIN_DISPUTE_STATUSES, ADMIN_DISPUTE_REASONS, getDisputesForAdmin, type AdminDisputesPage, type AdminDisputeRow } from "@/lib/services/admin.service";
import { DISPUTE_STATUS_LABELS, DISPUTE_REASON_LABELS } from "@/lib/services/disputes.service";

const amountFormat = new Intl.NumberFormat("en-UG", { maximumFractionDigits: 20 });
function money(value) { return value != null && Number.isFinite(Number(value)) ? `UGX ${amountFormat.format(Number(value))}` : "—"; }
function stamp(value) { return value ? value.replace("T", " ").slice(0, 19) : "—"; }
function opt(value) { return value && value.trim() ? value : "—"; }
function statusClass(status) {
  if (status === "resolved_customer" || status === "resolved_provider") return "bg-emerald-50 text-emerald-700";
  if (status === "provider_responded") return "bg-blue-50 text-blue-700";
  if (status === "closed") return "bg-slate-100 text-slate-600";
  if (status === "open") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

const emptyFilters = { search: "", status: "", reason: "" };

const navItems = [
  [LayoutDashboard, "Dashboard", "/admin/dashboard"], [Users, "Users", "/admin/users"],
  [ShieldCheck, "Providers", "/admin/providers"], [Wrench, "Services", "/admin/services"],
  [FileText, "Requests", "/admin/requests"], [FileText, "Offers", "/admin/offers"],
  [CalendarCheck, "Bookings", "/admin/bookings"], [Wallet, "Finance", "/admin/finance"],
  [Wallet, "Wallet", "/admin/wallet"], [Wallet, "Payouts", "/admin/payouts"],
  [Star, "Reviews", "/admin/reviews"], [AlertTriangle, "Disputes", "/admin/disputes"],
  [Bell, "Support", null], [Bell, "Notifications", null],
] as const;

function AdminDisputes() {
  const router = useRouter();
  const [draft, setDraft] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [result, setResult] = useState<AdminDisputesPage>({ rows: [], total: 0, page: 1, pageSize: ADMIN_DISPUTES_PAGE_SIZE, contextError: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [detail, setDetail] = useState<AdminDisputeRow | null>(null);
  const requestId = useRef(0);
  const load = useCallback(async (targetPage = 1) => {
    const ticket = ++requestId.current;
    setLoading(true); setError(null);
    try {
      const profile = await getCurrentProfile();
      if (ticket !== requestId.current) return;
      if (!profile) { await router.navigate({ to: "/login" }); return; }
      if (profile.role !== "admin") { await router.navigate({ to: "/" }); return; }
      const next = await getDisputesForAdmin({ ...filters, page: targetPage });
      if (ticket === requestId.current) setResult(next);
    } catch (err) {
      if (ticket === requestId.current) setError(err instanceof Error ? err.message : "The disputes directory could not be loaded.");
    } finally { if (ticket === requestId.current) setLoading(false); }
  }, [filters, router]);
  useEffect(() => { void load(1); return () => { requestId.current += 1; }; }, [load]);
  useEffect(() => {
    if (!detail) return;
    const onKey = (event) => { if (event.key === "Escape") setDetail(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detail]);
  const commit = () => {
    const next = { search: draft.search.trim(), status: draft.status, reason: draft.reason };
    setFilters((old) => old.search === next.search && old.status === next.status && old.reason === next.reason ? old : next);
  };
  const clear = () => { setDraft(emptyFilters); setFilters({ ...emptyFilters }); };
  const signOutAdmin = async () => { await signOut(); await router.navigate({ to: "/login" }); };
  const { rows, total, page } = result;
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_DISPUTES_PAGE_SIZE));
  const from = total ? (page - 1) * ADMIN_DISPUTES_PAGE_SIZE + 1 : 0;
  const to = total ? from + rows.length - 1 : 0;
  const hasRecords = total > 0;
  const matchesFilters = Boolean(filters.search) || Boolean(filters.status) || Boolean(filters.reason);

  const navigation = <>
    <div className="mb-5 flex items-center gap-2 px-2"><img src="/favicon.png" alt="NINJAWO" className="h-8 w-8 rounded-lg" /><div><p className="text-base font-bold leading-5 text-slate-950">NINJAWO</p><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-blue-700">Admin console</p></div></div>
    <nav className="space-y-0.5" aria-label="Admin navigation">{navItems.map(([Icon, name, href]) => href ? (
      <a key={name} href={href} aria-current={name === "Disputes" ? "page" : undefined} onClick={() => setMobileOpen(false)} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold ${name === "Disputes" ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-blue-50 hover:text-blue-700"}`}>
        <Icon className="h-3.5 w-3.5" />{name}</a>
    ) : <button key={name} disabled className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-slate-400">
        <Icon className="h-3.5 w-3.5" />{name}<span className="ml-auto text-[9px] uppercase">Soon</span></button>)}</nav>
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
        <div className="ml-2 md:ml-0"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">Operations</p><h1 className="text-sm font-bold text-slate-950">Disputes</h1></div>
        <div className="ml-auto flex items-center gap-3"><Bell className="h-4 w-4 text-slate-500" /><span className="hidden text-xs font-semibold text-slate-600 sm:inline">Read-only directory</span></div>
      </header>
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-5 xl:p-6">
        <p className="text-[13px] text-slate-600">Review customer/provider disputes and their current status. This is a view-only directory — dispute resolution actions are not available here.</p>
        <form onSubmit={(event) => { event.preventDefault(); commit(); }} className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 basis-full sm:flex-1"><span className="sr-only">Search disputes</span><span className="relative block"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><input value={draft.search} onChange={(e) => setDraft({ ...draft, search: e.target.value })} onBlur={commit} placeholder="Search customer, provider or booking reference…" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-[13px] outline-none focus:border-blue-400" /></span></label>
          <label className="min-w-0 flex-1 sm:max-w-44"><span className="block text-[11px] font-semibold text-slate-500">Status</span><select value={draft.status}
            onChange={(e) => { const next = { ...draft, status: e.target.value }; setDraft(next); setFilters(next); }}
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-[13px] focus:border-blue-400">
            <option value="">All statuses</option>
            {ADMIN_DISPUTE_STATUSES.map((value) => <option key={value} value={value}>{DISPUTE_STATUS_LABELS[value] ?? value}</option>)}
          </select></label>
          <label className="min-w-0 flex-1 sm:max-w-44"><span className="block text-[11px] font-semibold text-slate-500">Reason</span><select value={draft.reason}
            onChange={(e) => { const next = { ...draft, reason: e.target.value }; setDraft(next); setFilters(next); }}
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-[13px] focus:border-blue-400">
            <option value="">All reasons</option>
            {ADMIN_DISPUTE_REASONS.map((value) => <option key={value} value={value}>{DISPUTE_REASON_LABELS[value] ?? value}</option>)}
          </select></label>
          <button type="submit" className="rounded-lg bg-blue-700 px-3 py-2 text-[13px] font-semibold text-white">Search</button>
          <button type="button" onClick={clear} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-600">Clear</button>
        </form>


        {loading ? <div className="flex min-h-[50vh] items-center justify-center gap-2 text-xs text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" />Loading disputes…</div>
          : error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-700">Could not load disputes</p>
            <p className="mt-1 text-xs text-red-600">{error}</p>
            <button type="button" onClick={() => void load()} className="mt-3 inline-flex items-center gap-2 rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800">Retry</button>
          </div>
          : !hasRecords ? <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
            <p className="mt-3 text-sm font-semibold text-slate-800">No disputes yet</p>
            <p className="mt-1 text-xs text-slate-500">Disputes raised by customers and providers will appear here when they exist.</p>
          </div>
          : matchesFilters ? <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
            <p className="text-sm font-semibold text-slate-800">No disputes match the current filters</p>
            <p className="mt-1 text-xs text-slate-500">Try adjusting the search, status or reason filter.</p>
            <button type="button" onClick={clear} className="mt-3 inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Clear filters</button>
          </div>
          : <>
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_4px_16px_rgba(15,23,42,0.035)]">
              <div className="border-b border-slate-100 px-3 py-2.5"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{total} dispute{total === 1 ? "t" : "s"} · showing {from}–{to}</p></div>
              <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[800px] table-fixed text-left">
                <caption className="sr-only">Customer and provider disputes, read only</caption>
                <thead><tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2.5" scope="col">Status</th>
                  <th className="px-3 py-2.5" scope="col">Reason</th>
                  <th className="px-3 py-2.5" scope="col">Customer</th>
                  <th className="px-3 py-2.5" scope="col">Provider</th>
                  <th className="px-3 py-2.5" scope="col">Booking</th>
                  <th className="px-3 py-2.5" scope="col">Amount</th>
                  <th className="px-3 py-2.5" scope="col">Raised</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.id} className="align-top text-[13px] text-slate-700 hover:bg-slate-50/60 cursor-pointer" onClick={() => setDetail(row)}>
                  <td className="px-3 py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass(row.status)}`}>{DISPUTE_STATUS_LABELS[row.status] ?? row.status}</span></td>
                  <td className="px-3 py-2"><span className="text-[12px] text-slate-600">{DISPUTE_REASON_LABELS[row.reason] ?? row.reason}</span></td>
                  <td className="px-3 py-2"><p className="truncate" title={row.customer_name || undefined}>{row.customer_name || "—"}</p></td>
                  <td className="px-3 py-2"><p className="truncate" title={row.provider_business_name || undefined}>{row.provider_business_name || "—"}</p></td>
                  <td className="px-3 py-2"><p className="truncate text-[12px] font-mono text-slate-500">{row.booking_id?.slice(0, 8) || "—"}</p></td>
                  <td className="px-3 py-2 tabular-nums">{money(row.booking_amount)}</td>
                  <td className="px-3 py-2 tabular-nums text-[12px] text-slate-500">{row.raised_at?.slice(0, 10) || "—"}</td>
                </tr>)}</tbody>
              </table></div>

              <ul className="divide-y divide-slate-100 md:hidden">{rows.map((row) => <li key={row.id} className="min-w-0 px-3 py-2.5" onClick={() => setDetail(row)}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass(row.status)}`}>{DISPUTE_STATUS_LABELS[row.status] ?? row.status}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-slate-500">{row.raised_at?.slice(0, 10) || "—"}</span>
                </div>
                <p className="mt-1 text-[13px] text-slate-800 break-words">{opt(row.description).slice(0, 180)}</p>
                <p className="mt-0.5 truncate text-[12px] text-slate-500">{row.customer_name || "Customer unavailable"} &rarr; {row.provider_business_name || "Provider unavailable"} &middot; {DISPUTE_REASON_LABELS[row.reason] ?? row.reason}</p>
                <p className="truncate text-[11px] text-slate-400 font-mono">booking {row.booking_id?.slice(0, 8) || "—"} &middot; {money(row.booking_amount)}</p>
              </li>)}</ul>
            </section>
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2.5"><p className="text-[12px] text-slate-500">Page {page} of {totalPages}</p><div className="flex items-center gap-1.5">
              <button type="button" disabled={page <= 1} onClick={() => void load(page - 1)} className="rounded-md border border-slate-200 px-2.5 py-1 text-[12px] font-semibold text-slate-600 disabled:opacity-40">&lt; Prev</button>
              <button type="button" disabled={page >= totalPages} onClick={() => void load(page + 1)} className="rounded-md border border-slate-200 px-2.5 py-1 text-[12px] font-semibold text-slate-600 disabled:opacity-40">Next &rsaquo;</button>
            </div></footer>
          </>}


        {detail && <div className="fixed inset-0 z-40" onClick={() => setDetail(null)}><div className="absolute inset-0 bg-slate-950/30" /><div className="absolute right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-bold text-slate-950">Dispute details</h2>
            <button type="button" onClick={() => setDetail(null)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close"><X className="h-4 w-4" /></button>
          </div>
          <div className="divide-y divide-slate-100 px-4 py-3">
            <section>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Dispute</p>
              <div className="mt-1 space-y-1.5 text-xs">
                <div className="flex items-center justify-between"><span className="text-slate-500">Status</span><span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass(detail.status)}`}>{DISPUTE_STATUS_LABELS[detail.status] ?? detail.status}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-500">Reason</span><span className="text-slate-800">{DISPUTE_REASON_LABELS[detail.reason] ?? detail.reason}</span></div>
                <div className="pt-1"><span className="text-slate-500">Description</span><p className="mt-0.5 whitespace-pre-wrap break-words text-slate-800">{opt(detail.description)}</p></div>
              </div>
            </section>
            {opt(detail.provider_response) && <section>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Provider response</p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-slate-800">{detail.provider_response}</p>
            </section>}
            <section>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Admin information</p>
              <div className="mt-1 space-y-1.5 text-xs">
                <div className="pt-1"><span className="text-slate-500">Admin notes</span><p className="mt-0.5 whitespace-pre-wrap break-words text-slate-800">{opt(detail.admin_notes)}</p></div>
                <div className="flex items-center justify-between"><span className="text-slate-500">Decision</span><span className="text-slate-800">{opt(detail.decision) ?? "—"}</span></div>
              </div>
            </section>
            <section>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Booking</p>
              <div className="mt-1 space-y-1.5 text-xs">
                <div className="flex items-center justify-between"><span className="text-slate-500">Reference</span><span className="text-slate-800 font-mono">{detail.booking_id || "—"}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-500">Amount</span><span className="text-slate-800 tabular-nums">{money(detail.booking_amount)}</span></div>
              </div>
            </section>
            <section>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">People</p>
              <div className="mt-1 space-y-1.5 text-xs">
                <div className="flex items-center justify-between"><span className="text-slate-500">Customer</span><span className="text-slate-800">{detail.customer_name || "—"}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-500">Provider</span><span className="text-slate-800">{detail.provider_business_name || "—"}</span></div>
              </div>
            </section>
            <section>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Timeline</p>
              <div className="mt-1 space-y-1.5 text-xs">
                <div className="flex items-center justify-between"><span className="text-slate-500">Raised</span><span className="text-slate-800 tabular-nums">{stamp(detail.raised_at)}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-500">Provider responded</span><span className="text-slate-800 tabular-nums">{stamp(detail.responded_at)}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-500">Resolved</span><span className="text-slate-800 tabular-nums">{stamp(detail.resolved_at)}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-500">Updated</span><span className="text-slate-800 tabular-nums">{stamp(detail.updated_at)}</span></div>
              </div>
            </section>
          </div>
        </div></div>}
      </div>
    </main>
  </div>;
}

export const Route = createFileRoute("/admin/disputes")({
  head: () => ({ meta: [{ title: "Disputes | NINJAWO Admin" }] }),
  component: AdminDisputes,
});
