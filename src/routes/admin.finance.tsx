import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AlertTriangle, Bell, CalendarCheck, CheckCircle2, CreditCard, FileText, LayoutDashboard, LogOut, Menu, RefreshCw, Search, ShieldCheck, Users, Wallet, Wrench, X } from "lucide-react";
import { getCurrentProfile, signOut } from "@/lib/services/auth.service";
import { ADMIN_FINANCE_PAGE_SIZE, ADMIN_PAYMENT_STATUSES, getFinanceForAdmin, type AdminFinancePage, type AdminFinanceRow } from "@/lib/services/admin.service";

const amountFormat = new Intl.NumberFormat("en-UG", { maximumFractionDigits: 20 });
function money(value: number) { return value != null && Number.isFinite(Number(value)) ? `UGX ${amountFormat.format(Number(value))}` : "Not specified"; }
/** PHASE 4E — renders stored values verbatim; null/empty is "Not recorded", never invented. */
function stored(value: string | null | undefined) { return value && value.trim() ? value : "Not recorded"; }
/** Full timestamp (date + time) for the detail view. */
function stamp(value: string | null | undefined) { return value ? value.replace("T", " ").slice(0, 19) : "Not recorded"; }
const emptyFilters = { search: "", status: "", method: "", fromDate: "", toDate: "" };


const navItems = [
  [LayoutDashboard, "Dashboard", "/admin/dashboard"], [Users, "Users", "/admin/users"],
  [ShieldCheck, "Providers", "/admin/providers"], [Wrench, "Services", "/admin/services"],
  [FileText, "Requests", "/admin/requests"], [FileText, "Offers", "/admin/offers"],
  [CalendarCheck, "Bookings", "/admin/bookings"], [Wallet, "Finance", "/admin/finance"],
  [Wallet, "Wallet", null], [Bell, "Support", null], [Bell, "Notifications", null],
  [AlertTriangle, "Disputes", null], [CheckCircle2, "Reviews", null],
] as const;

function AdminFinance() {
  const router = useRouter();
  const [draft, setDraft] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [result, setResult] = useState<AdminFinancePage>({ rows: [], total: 0, page: 1, pageSize: ADMIN_FINANCE_PAGE_SIZE, contextError: false, methods: [], totals: { listedAmount: 0, listedPlatformFees: 0, listedProviderAmounts: 0 }, matchingTotals: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [detail, setDetail] = useState<AdminFinanceRow | null>(null);
  const requestId = useRef(0);
  const load = useCallback(async (targetPage = 1) => {
    const ticket = ++requestId.current;
    setLoading(true); setError(null);
    try {
      const profile = await getCurrentProfile();
      if (ticket !== requestId.current) return;
      if (!profile) { await router.navigate({ to: "/login" }); return; }
      const next = await getFinanceForAdmin({ ...filters, page: targetPage });
      if (ticket === requestId.current) setResult(next);
    } catch (err) {
      if (ticket === requestId.current) setError(err instanceof Error ? err.message : "The finance directory could not load.");
    } finally { if (ticket === requestId.current) setLoading(false); }
  }, [filters, router]);
  useEffect(() => { void load(1); return () => { requestId.current += 1; }; }, [load]);
  useEffect(() => {
    if (!detail) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setDetail(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detail]);
  const commit = () => {
    const next = { search: draft.search.trim(), status: draft.status, method: draft.method, fromDate: draft.fromDate, toDate: draft.toDate };
    setFilters((old) => Object.keys(next).every((key) => old[key as keyof typeof old] === next[key as keyof typeof next]) ? old : next);
  };
  const clear = () => { setDraft(emptyFilters); setFilters({ ...emptyFilters }); };
  const signOutAdmin = async () => { await signOut(); await router.navigate({ to: "/login" }); };
  const { rows, total, page, methods, totals } = result;
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_FINANCE_PAGE_SIZE));
  const from = rows.length ? (page - 1) * ADMIN_FINANCE_PAGE_SIZE + 1 : 0;
  const to = rows.length ? from + rows.length - 1 : 0;
  const navigation = <>
    <div className="mb-5 flex items-center gap-2 px-2"><img src="/favicon.png" alt="NINJAWO" className="h-8 w-8 rounded-lg" /><div><p className="text-base font-bold leading-5 text-slate-950">NINJAWO</p><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-blue-700">Admin console</p></div></div>
    <nav className="space-y-0.5" aria-label="Admin navigation">{navItems.map(([Icon, name, href]) => href ? (
      <a key={name} href={href} aria-current={name === "Finance" ? "page" : undefined} onClick={() => setMobileOpen(false)} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold ${name === "Finance" ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-blue-50 hover:text-blue-700"}`}>
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
        <div className="ml-2 md:ml-0"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">Operations</p><h1 className="text-sm font-bold text-slate-950">Finance</h1></div>
        <div className="ml-auto flex items-center gap-3"><Bell className="h-4 w-4 text-slate-500" /><span className="hidden text-xs font-semibold text-slate-600 sm:inline">Read-only directory</span></div>
      </header>
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-5 xl:p-6">
        <form onSubmit={(event) => { event.preventDefault(); commit(); }} className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 basis-full sm:flex-1"><span className="sr-only">Search payments</span><span className="relative block"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><input value={draft.search} onChange={(e) => setDraft({ ...draft, search: e.target.value })} onBlur={commit} placeholder="Search customer, business, service or payment/booking ID…" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-[13px] outline-none focus:border-blue-400" /></span></label>
          <label className="min-w-0 flex-1 sm:max-w-40"><span className="block text-[11px] font-semibold text-slate-500">From date</span><input type="date" value={draft.fromDate}
            onChange={(e) => { const next = { ...draft, fromDate: e.target.value }; setDraft(next); setFilters({ ...next, search: next.search.trim() }); }}
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-[13px] focus:border-blue-400" /></label>
          <label className="min-w-0 flex-1 sm:max-w-40"><span className="block text-[11px] font-semibold text-slate-500">To date</span><input type="date" value={draft.toDate}
            onChange={(e) => { const next = { ...draft, toDate: e.target.value }; setDraft(next); setFilters({ ...next, search: next.search.trim() }); }}
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-[13px] focus:border-blue-400" /></label>
          <label className="min-w-0 flex-1 sm:max-w-40"><span className="block text-[11px] font-semibold text-slate-500">Payment status</span><select value={draft.status}
            onChange={(e) => { const next = { ...draft, status: e.target.value }; setDraft(next); setFilters({ ...next, search: next.search.trim() }); }}
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-[13px] focus:border-blue-400"><option value="">All statuses</option>{ADMIN_PAYMENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          <label className="min-w-0 flex-1 sm:max-w-40"><span className="block text-[11px] font-semibold text-slate-500">Payment method</span><select value={draft.method}
            onChange={(e) => { const next = { ...draft, method: e.target.value }; setDraft(next); setFilters({ ...next, search: next.search.trim() }); }}
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-[13px] focus:border-blue-400"><option value="">All methods</option>{methods.map((method) => <option key={method} value={method}>{method}</option>)}</select></label>
          <button type="submit" className="rounded-lg bg-blue-700 px-3 py-2 text-[13px] font-semibold text-white">Search</button>
          <button type="button" onClick={clear} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-600">Clear</button>
        </form>
        <div aria-live="polite" className="text-[12px] text-slate-500">{loading ? "Loading transactions…" : !error ? `Showing ${from}–${to} of ${total}` : "Transactions unavailable"}</div>
        {!loading && !error && result.contextError && <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800"><AlertTriangle className="h-4 w-4 shrink-0" />Some customer, provider, service or booking details are unavailable. Transaction records and totals are retained; related context may be incomplete.</div>}
        {!loading && !error && rows.length > 0 && <section aria-label="Sums of the listed transactions" className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Listed transactions</p><p className="mt-0.5 text-[13px] font-bold tabular-nums text-slate-900">{money(totals.listedAmount)}</p><p className="text-[11px] text-slate-500">Stored amount of the {rows.length} transaction{rows.length === 1 ? "" : "s"} on this page</p></div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Listed platform fees</p><p className="mt-0.5 text-[13px] font-bold tabular-nums text-slate-900">{money(totals.listedPlatformFees)}</p><p className="text-[11px] text-slate-500">Stored platform fee of the transactions on this page</p></div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Listed provider amounts</p><p className="mt-0.5 text-[13px] font-bold tabular-nums text-slate-900">{money(totals.listedProviderAmounts)}</p><p className="text-[11px] text-slate-500">Stored provider amount of the transactions on this page</p></div>
          <p className="text-[11px] text-slate-500 sm:col-span-3">These are sums of stored payment fields for the transactions listed on this page only — not a total for every matching record, and not a balance, earnings or settlement figure.</p>
        </section>}
        {!loading && !error && result.matchingTotals && <section aria-label="Totals for all records matching the current filters" className="grid gap-2 sm:grid-cols-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wide text-blue-700">Matching transactions</p><p className="mt-0.5 text-[13px] font-bold tabular-nums text-slate-900">{result.total}</p><p className="text-[11px] text-slate-500">All records matching the current filters</p></div>
          <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wide text-blue-700">Matching amount</p><p className="mt-0.5 text-[13px] font-bold tabular-nums text-slate-900">{money(result.matchingTotals.amount)}</p><p className="text-[11px] text-slate-500">Sum of stored amounts, filter-wide</p></div>
          <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wide text-blue-700">Matching platform fees</p><p className="mt-0.5 text-[13px] font-bold tabular-nums text-slate-900">{money(result.matchingTotals.platformFees)}</p><p className="text-[11px] text-slate-500">Sum of stored platform fees, filter-wide</p></div>
          <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wide text-blue-700">Matching provider amounts</p><p className="mt-0.5 text-[13px] font-bold tabular-nums text-slate-900">{money(result.matchingTotals.providerAmounts)}</p><p className="text-[11px] text-slate-500">Sum of stored provider amounts, filter-wide</p></div>
          <p className="text-[11px] text-blue-800 sm:col-span-4">Aggregates of stored payment records matching the current search, status, method and date filters. Not a wallet balance, available funds, earnings or settlement figure. If the matching set exceeds the aggregate limit, matching totals are withheld rather than approximated.</p>
        </section>}
        <section aria-busy={loading} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_4px_16px_rgba(15,23,42,0.035)]">
          {loading ? <div className="flex min-h-[35vh] items-center justify-center gap-2 text-[13px] text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" />Loading transactions…</div> : error ? <div role="alert" className="p-4"><h2 className="text-sm font-bold">Transactions unavailable</h2><p className="mt-2 text-[13px] text-slate-600">{error}</p><button type="button" onClick={() => void load(1)} className="mt-3 rounded-md bg-blue-700 px-3 py-1.5 text-[13px] font-semibold text-white">Retry</button></div> : rows.length === 0 ? <p className="px-4 py-6 text-[13px] text-slate-500">{filters.search || filters.status || filters.method || filters.fromDate || filters.toDate ? "No transactions match the current search or filters." : "No transactions found."}</p> : <>
            <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1000px] table-fixed text-left">
              <caption className="sr-only">Financial transactions, read only</caption>
              <thead><tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {['Payment', 'Booking', 'Provider', 'Customer', 'Method', 'Service', 'Amount', 'Provider amount', 'Status', 'Created'].map((label) => <th key={label} scope="col" className="px-3 py-2.5">{label}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.id} onClick={() => setDetail(row)} className="cursor-pointer text-[13px] text-slate-700 hover:bg-slate-50/60">
                <td className="px-3 py-2"><p className="truncate font-semibold text-slate-950" title={row.transaction_ref || undefined}>{row.transaction_ref || "—"}</p><p className="truncate text-[11px] text-slate-400" title={`Payment: ${row.id}`}>#{row.id.slice(0, 8)}</p></td>
                <td className="px-3 py-2">{row.booking_id_label || "—"}</td>
                <td className="px-3 py-2"><p className="truncate" title={row.business_name || undefined}>{row.business_name || "Provider unavailable"}</p><p className="truncate text-[12px] text-slate-500">{row.owner_name || "—"}</p></td>
                <td className="px-3 py-2"><p className="truncate" title={row.customer_name || undefined}>{row.customer_name || "Customer unavailable"}</p><p className="truncate text-[12px] text-slate-500">{row.customer_phone || "—"}</p></td>
                <td className="break-words px-3 py-2">{row.payment_method || "—"}</td>
                <td className="break-words px-3 py-2"><p className="truncate" title={row.service_title || undefined}>{row.service_title || (row.booking_status ? row.booking_status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) : "—")}</p></td>
                <td className="break-words px-3 py-2 tabular-nums">{money(row.amount)}</td>
                <td className="break-words px-3 py-2 tabular-nums">{money(row.provider_amount)}</td>
                <td className="break-words px-3 py-2"><span className="inline-block max-w-full break-words rounded-md bg-slate-100 px-2 py-1 text-[13px]">{row.payment_status || "—"}</span></td>
                <td className="px-3 py-2 tabular-nums">{row.created_at?.slice(0, 10)}</td>
              </tr>)}</tbody>
            </table></div>
            <ul className="divide-y divide-slate-100 md:hidden">{rows.map((row) => <li key={row.id} onClick={() => setDetail(row)} className="flex min-w-0 cursor-pointer items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50/60">
              <CreditCard className="h-5 w-5 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold" title={row.transaction_ref || undefined}>{row.transaction_ref || `#${row.id.slice(0, 8)}`}</p>
                <p className="truncate text-[12px] text-slate-500">{row.business_name || "Provider unavailable"} · {row.customer_name || "Customer unavailable"}</p>
                <p className="truncate text-[12px] text-slate-500">{row.service_title || (row.booking_status ? row.booking_status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) : "—")} · {row.payment_method || "—"} · {row.created_at?.slice(0, 10)}</p>
              </div>
              <div className="max-w-[38%] shrink-0 text-right">
                <p className="truncate text-[13px] font-medium" title={`Payment status: ${row.payment_status || "unknown"}`}>{money(row.amount)}</p>
                <p className="text-[12px] text-slate-600">{row.payment_status || "—"}</p>
                <p className="truncate text-[11px] text-slate-500" title="Stored provider amount">Provider {money(row.provider_amount)}</p>
              </div>
            </li>)}</ul>
          </>}
          {!loading && !error && <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2.5"><p className="text-[12px] text-slate-500">Page {page} of {totalPages}</p><div className="flex items-center gap-1.5">
            <button type="button" disabled={page <= 1} onClick={() => void load(page - 1)} className="rounded-md border border-slate-200 px-2.5 py-1 text-[12px] font-semibold text-slate-600 disabled:opacity-40">‹ Prev</button>
            <button type="button" disabled={page >= totalPages} onClick={() => void load(page + 1)} className="rounded-md border border-slate-200 px-2.5 py-1 text-[12px] font-semibold text-slate-600 disabled:opacity-40">Next ›</button>
          </div></footer>}
        </section>
      </div>
    </main>
    {detail && <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label={`Transaction ${detail.transaction_ref || detail.id}`}>
      <div className="absolute inset-0 bg-slate-950/30" onClick={() => setDetail(null)} />
      <aside className="relative ml-auto flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-xl">
        <header className="sticky top-0 flex items-start justify-between gap-2 border-b border-slate-100 bg-white px-4 py-3">
          <div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">Transaction detail</p><p className="truncate text-sm font-bold text-slate-950" title={detail.transaction_ref || undefined}>{stored(detail.transaction_ref)}</p><p className="truncate text-[11px] text-slate-400">Payment {detail.id}</p></div>
          <button type="button" onClick={() => setDetail(null)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close detail"><X className="h-4 w-4" /></button>
        </header>
        <dl className="space-y-3 px-4 py-4 text-[13px]">
          {[
            ["Payment ID", detail.id],
            ["Transaction reference", stored(detail.transaction_ref)],
            ["Booking", detail.booking_id_label ? `${detail.booking_id_label} (ID ${detail.booking_id})` : `ID ${detail.booking_id}`],
            ["Customer", stored(detail.customer_name)],
            ["Customer phone", stored(detail.customer_phone)],
            ["Provider", detail.business_name ? (detail.owner_name ? `${detail.business_name} (${detail.owner_name})` : detail.business_name) : "Not recorded"],
            ["Service", stored(detail.service_title)],
            ["Payment method", stored(detail.payment_method)],
            ["Payment status", stored(detail.payment_status)],
            ["Amount", money(Number(detail.amount))],
            ["Platform fee", money(Number(detail.platform_fee))],
            ["Provider amount", money(Number(detail.provider_amount))],
            ["Currency", stored(detail.currency)],
            ["Created", stamp(detail.created_at)],
            ["Updated", stamp(detail.updated_at)],
            ["Paid at", stamp(detail.paid_at)],
            ["Failure reason", stored(detail.failure_reason)],
          ].map(([label, value]) => <div key={label as string} className="flex items-start justify-between gap-3 border-b border-slate-50 pb-2 last:border-0"><dt className="shrink-0 font-semibold text-slate-500">{label}</dt><dd className="min-w-0 break-words text-right text-slate-900">{value as string}</dd></div>)}
        </dl>
        <p className="mt-auto border-t border-slate-100 px-4 py-3 text-[11px] text-slate-500">Read-only view of stored payment fields. Empty values are shown as "Not recorded" — that does not confirm or exclude any payment outcome. No payment, escrow or payout action is available here.</p>
      </aside>
    </div>}
  </div>;
}

export const Route = createFileRoute("/admin/finance")({
  head: () => ({ meta: [{ title: "Finance | NINJAWO Admin" }] }),
  component: AdminFinance,
});



