import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AlertTriangle, Bell, Menu, RefreshCw, Search, Star, X } from "lucide-react";
import { getCurrentProfile } from "@/lib/services/auth.service";
import { AdminNav } from "@/components/AdminNav";
import { ADMIN_REVIEWS_PAGE_SIZE, getReviewsForAdmin, type AdminReviewsPage } from "@/lib/services/admin.service";

const dateFormat = new Intl.DateTimeFormat("en-UG", { day: "numeric", month: "short", year: "numeric" });
const emptyFilters = { search: "", rating: "" };

function Stars({ rating }: { rating: number }) {
  const value = Math.max(0, Math.min(5, Number(rating) || 0));
  return <span className="inline-flex items-center gap-0.5" title={`${value} of 5`} aria-label={`Rating ${value} of 5`}>{[1, 2, 3, 4, 5].map((n) => (
    <Star key={n} className={`h-3.5 w-3.5 ${n <= value ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
  ))}<span className="ml-1 text-[11px] font-semibold text-slate-600">{value}/5</span></span>;
}

function AdminReviews() {
  const router = useRouter();
  const [draft, setDraft] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [result, setResult] = useState<AdminReviewsPage>({ rows: [], total: 0, page: 1, pageSize: ADMIN_REVIEWS_PAGE_SIZE, contextError: false, ratings: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const requestId = useRef(0);
  const load = useCallback(async (targetPage = 1) => {
    const ticket = ++requestId.current;
    setLoading(true); setError(null);
    try {
      const profile = await getCurrentProfile();
      if (ticket !== requestId.current) return;
      if (!profile) { await router.navigate({ to: "/login" }); return; }
      if (profile.role !== "admin") { await router.navigate({ to: "/" }); return; }
      const next = await getReviewsForAdmin({ ...filters, page: targetPage });
      if (ticket === requestId.current) setResult(next);
    } catch (err) {
      if (ticket === requestId.current) setError(err instanceof Error ? err.message : "The reviews directory could not be loaded.");
    } finally { if (ticket === requestId.current) setLoading(false); }
  }, [filters, router]);
  useEffect(() => { void load(1); return () => { requestId.current += 1; }; }, [load]);
  const commit = () => {
    const next = { search: draft.search.trim(), rating: draft.rating };
    setFilters((old) => old.search === next.search && old.rating === next.rating ? old : next);
  };
  const clear = () => { setDraft(emptyFilters); setFilters({ ...emptyFilters }); };
  const { rows, total, page } = result;
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_REVIEWS_PAGE_SIZE));
  const from = rows.length ? (page - 1) * ADMIN_REVIEWS_PAGE_SIZE + 1 : 0;
  const to = rows.length ? from + rows.length - 1 : 0;
  return <div className="min-h-screen bg-[#f6f8fb] text-slate-900">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-slate-200 bg-white px-3 py-4 md:flex"><AdminNav onNavigate={() => setMobileOpen(false)} /></aside>
    {mobileOpen && <div className="fixed inset-0 z-40 bg-slate-950/30 md:hidden" onClick={() => setMobileOpen(false)} />}
    <aside inert={!mobileOpen} className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white px-3 py-4 transition-transform duration-200 md:hidden ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
      <button type="button" onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 rounded-md p-1.5 text-slate-500" aria-label="Close menu"><X className="h-4 w-4" /></button><AdminNav onNavigate={() => setMobileOpen(false)} />
    </aside>
    <main className="md:pl-56">
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
        <button type="button" onClick={() => setMobileOpen(true)} className="rounded-md p-1.5 text-slate-600 md:hidden" aria-label="Open menu"><Menu className="h-4 w-4" /></button>
        <div className="ml-2 md:ml-0"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">Operations</p><h1 className="text-sm font-bold text-slate-950">Reviews</h1></div>
        <div className="ml-auto flex items-center gap-3"><Bell className="h-4 w-4 text-slate-500" /><span className="hidden text-xs font-semibold text-slate-600 sm:inline">Read-only directory</span></div>
      </header>

      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-5 xl:p-6">
        <p className="text-[13px] text-slate-600">View customer reviews recorded in NINJAWO. Reviews are submitted by customers after completed bookings.</p>
        <form onSubmit={(event) => { event.preventDefault(); commit(); }} className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 basis-full sm:flex-1"><span className="sr-only">Search reviews</span><span className="relative block"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><input value={draft.search} onChange={(e) => setDraft({ ...draft, search: e.target.value })} onBlur={commit} placeholder="Search review text or review ID…" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-[13px] outline-none focus:border-blue-400" /></span></label>
          <label className="min-w-0 flex-1 sm:max-w-40"><span className="block text-[11px] font-semibold text-slate-500">Rating</span><select value={draft.rating}
            onChange={(e) => { const next = { ...draft, rating: e.target.value }; setDraft(next); setFilters(next); }}
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-[13px] focus:border-blue-400">
            <option value="">All ratings</option>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={String(n)}>{n} star{n === 1 ? "" : "s"}</option>)}
          </select></label>
          <button type="submit" className="rounded-lg bg-blue-700 px-3 py-2 text-[13px] font-semibold text-white">Search</button>
          <button type="button" onClick={clear} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-600">Clear</button>
        </form>


        {loading ? <div className="flex min-h-[35vh] items-center justify-center gap-2 text-[13px] text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" />Loading reviews…</div>
          : error ? <div role="alert" className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_4px_16px_rgba(15,23,42,0.035)]"><h2 className="text-sm font-bold">Reviews unavailable</h2><p className="mt-2 text-[13px] text-slate-600">{error}</p><button type="button" onClick={() => void load(1)} className="mt-3 rounded-md bg-blue-700 px-3 py-1.5 text-[13px] font-semibold text-white">Retry</button></div>
          : result.contextError ? <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800"><AlertTriangle className="h-4 w-4 shrink-0" />Some customer, provider or booking details are unavailable. Review records are retained; related context may be incomplete.</div>
          : rows.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-[0_4px_16px_rgba(15,23,42,0.035)]">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-amber-50"><Star className="h-5 w-5 text-amber-400" /></div>
              <h2 className="mt-3 text-sm font-bold text-slate-950">No reviews yet</h2>
              <p className="mx-auto mt-1 max-w-md text-[13px] text-slate-600">Customer reviews will appear here once customers submit a review for a completed booking. This page is read-only — reviews are managed by the customers who write them.</p>
              {filters.search || filters.rating ? <p className="mt-2 text-[12px] text-slate-500">No reviews match the current search or filters.</p> : null}
            </div>
          : <section aria-label="Reviews directory" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_4px_16px_rgba(15,23,42,0.035)]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5"><p className="text-[12px] text-slate-500">Showing {from}–{to} of {total} review{total === 1 ? "" : "s"}</p></div>
              <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[900px] table-fixed text-left">
                <caption className="sr-only">Customer reviews, read only</caption>
                <thead><tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {['Rating', 'Review', 'Customer', 'Provider', 'Service', 'Booking', 'Created'].map((label) => <th key={label} scope="col" className="px-3 py-2.5">{label}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.id} className="align-top text-[13px] text-slate-700 hover:bg-slate-50/60">
                  <td className="px-3 py-2"><Stars rating={row.rating} /></td>
                  <td className="break-words px-3 py-2"><p className="whitespace-pre-wrap" title={row.comment || undefined}>{row.comment || "No comment"}</p></td>
                  <td className="px-3 py-2"><p className="truncate" title={row.customer_name || undefined}>{row.customer_name || "—"}</p><p className="truncate text-[12px] text-slate-500">{row.customer_phone || "—"}</p></td>
                  <td className="px-3 py-2"><p className="truncate" title={row.business_name || undefined}>{row.business_name || "—"}</p></td>
                  <td className="px-3 py-2"><p className="truncate" title={row.service_title || undefined}>{row.service_title || "—"}</p></td>
                  <td className="px-3 py-2"><p className="truncate" title={`Booking: ${row.booking_id}`}>#{row.booking_id.slice(0, 8)}</p><p className="truncate text-[12px] text-slate-500">{row.booking_date || "—"}</p></td>
                  <td className="px-3 py-2 tabular-nums">{row.created_at?.slice(0, 10)}</td>
                </tr>)}</tbody>
              </table></div>
              <ul className="divide-y divide-slate-100 md:hidden">{rows.map((row) => <li key={row.id} className="min-w-0 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2"><Stars rating={row.rating} /><span className="shrink-0 text-[12px] tabular-nums text-slate-500">{row.created_at?.slice(0, 10)}</span></div>
                <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-slate-800">{row.comment || "No comment"}</p>
                <p className="truncate text-[12px] text-slate-500">{row.customer_name || "Customer unavailable"} → {row.business_name || "Provider unavailable"}</p>
                <p className="truncate text-[12px] text-slate-500">{row.service_title || "Service unavailable"} · booking {row.booking_date || `#${row.booking_id.slice(0, 8)}`}</p>
              </li>)}</ul>
            </section>}

          {!loading && !error && <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2.5"><p className="text-[12px] text-slate-500">Page {page} of {totalPages}</p><div className="flex items-center gap-1.5">
            <button type="button" disabled={page <= 1} onClick={() => void load(page - 1)} className="rounded-md border border-slate-200 px-2.5 py-1 text-[12px] font-semibold text-slate-600 disabled:opacity-40">‹ Prev</button>
            <button type="button" disabled={page >= totalPages} onClick={() => void load(page + 1)} className="rounded-md border border-slate-200 px-2.5 py-1 text-[12px] font-semibold text-slate-600 disabled:opacity-40">Next ›</button>
          </div></footer>}
      </div>
    </main>
  </div>;
}

export const Route = createFileRoute("/admin/reviews")({
  head: () => ({ meta: [{ title: "Reviews | NINJAWO Admin" }] }),
  component: AdminReviews,
});

