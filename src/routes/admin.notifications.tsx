import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AlertTriangle, Bell, Menu, RefreshCw, Search, X } from "lucide-react";
import { getCurrentProfile } from "@/lib/services/auth.service";
import { AdminNav } from "@/components/AdminNav";
import {
  ADMIN_NOTIFICATIONS_PAGE_SIZE,
  ADMIN_NOTIFICATION_TYPES,
  ADMIN_NOTIFICATION_TYPE_LABELS,
  getNotificationsForAdmin,
  type AdminNotificationsPage,
  type AdminNotificationRow,
} from "@/lib/services/admin.service";

function stamp(value?: string | null) { return value ? value.replace("T", " ").slice(0, 19) : "—"; }
function opt(value?: string | null) { return value && value.trim() ? value : "—"; }
function roleLabel(role?: string | null) { return role ? role.charAt(0).toUpperCase() + role.slice(1) : "—"; }
function typeLabel(type: string) { return ADMIN_NOTIFICATION_TYPE_LABELS[type] ?? type; }
function typeClass(type: string) {
  if (type === "payment_released") return "bg-emerald-50 text-emerald-700";
  if (type === "booking_cancelled") return "bg-red-50 text-red-700";
  if (type === "payment_escrowed" || type === "booking_confirmed") return "bg-blue-50 text-blue-700";
  if (type === "completion_requested" || type === "offer_accepted") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}
function readClass(isRead: boolean) { return isRead ? "bg-slate-100 text-slate-600" : "bg-blue-50 text-blue-700"; }

const emptyFilters = { search: "", type: "", read: "" };

function AdminNotifications() {
  const router = useRouter();
  const [draft, setDraft] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [result, setResult] = useState<AdminNotificationsPage>({ rows: [], total: 0, page: 1, pageSize: ADMIN_NOTIFICATIONS_PAGE_SIZE, contextError: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [detail, setDetail] = useState<AdminNotificationRow | null>(null);
  const requestId = useRef(0);
  const load = useCallback(async (targetPage = 1) => {
    const ticket = ++requestId.current;
    setLoading(true); setError(null);
    try {
      const profile = await getCurrentProfile();
      if (ticket !== requestId.current) return;
      if (!profile) { await router.navigate({ to: "/login" }); return; }
      if (profile.role !== "admin") { await router.navigate({ to: "/" }); return; }
      const next = await getNotificationsForAdmin({ ...filters, page: targetPage });
      if (ticket === requestId.current) setResult(next);
    } catch (err) {
      if (ticket === requestId.current) setError(err instanceof Error ? err.message : "The notifications directory could not be loaded.");
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
    const next = { search: draft.search.trim(), type: draft.type, read: draft.read };
    setFilters((old) => old.search === next.search && old.type === next.type && old.read === next.read ? old : next);
  };
  const clear = () => { setDraft(emptyFilters); setFilters({ ...emptyFilters }); };
  const { rows, total, page } = result;
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_NOTIFICATIONS_PAGE_SIZE));
  const from = total ? (page - 1) * ADMIN_NOTIFICATIONS_PAGE_SIZE + 1 : 0;
  const to = total ? from + rows.length - 1 : 0;
  const hasRecords = total > 0;
  const matchesFilters = Boolean(filters.search) || Boolean(filters.type) || Boolean(filters.read);
  return <div className="min-h-screen bg-[#f6f8fb] text-slate-900">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-slate-200 bg-white px-3 py-4 md:flex"><AdminNav onNavigate={() => setMobileOpen(false)} /></aside>
    {mobileOpen && <div className="fixed inset-0 z-40 bg-slate-950/30 md:hidden" onClick={() => setMobileOpen(false)} />}
    <aside inert={!mobileOpen} className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white px-3 py-4 transition-transform duration-200 md:hidden ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
      <button type="button" onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 rounded-md p-1.5 text-slate-500" aria-label="Close menu"><X className="h-4 w-4" /></button><AdminNav onNavigate={() => setMobileOpen(false)} />
    </aside>
    <main className="md:pl-56">
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
        <button type="button" onClick={() => setMobileOpen(true)} className="rounded-md p-1.5 text-slate-600 md:hidden" aria-label="Open menu"><Menu className="h-4 w-4" /></button>
        <div className="ml-2 md:ml-0"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">Operations</p><h1 className="text-sm font-bold text-slate-950">Notifications</h1></div>
        <div className="ml-auto flex items-center gap-3"><Bell className="h-4 w-4 text-slate-500" /><span className="hidden text-xs font-semibold text-slate-600 sm:inline">Read-only directory</span></div>
      </header>
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-5 xl:p-6">
        <p className="text-[13px] text-slate-600">Review notifications sent across the NINJAWO platform. This is a view-only directory — notifications cannot be sent, read or changed from here.</p>
        <form onSubmit={(event) => { event.preventDefault(); commit(); }} className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 basis-full sm:flex-1"><span className="sr-only">Search notifications</span><span className="relative block"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><input value={draft.search} onChange={(e) => setDraft({ ...draft, search: e.target.value })} onBlur={commit} placeholder="Search recipient, title or message…" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-[13px] outline-none focus:border-blue-400" /></span></label>
          <label className="min-w-0 flex-1 sm:max-w-48"><span className="block text-[11px] font-semibold text-slate-500">Type</span><select value={draft.type}
            onChange={(e) => { const next = { ...draft, type: e.target.value }; setDraft(next); setFilters(next); }}
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-[13px] focus:border-blue-400">
            <option value="">All types</option>
            {ADMIN_NOTIFICATION_TYPES.map((value) => <option key={value} value={value}>{ADMIN_NOTIFICATION_TYPE_LABELS[value] ?? value}</option>)}
          </select></label>
          <label className="min-w-0 flex-1 sm:max-w-32"><span className="block text-[11px] font-semibold text-slate-500">Read state</span><select value={draft.read}
            onChange={(e) => { const next = { ...draft, read: e.target.value }; setDraft(next); setFilters(next); }}
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-[13px] focus:border-blue-400">
            <option value="">All</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
          </select></label>
          <button type="submit" className="rounded-lg bg-blue-700 px-3 py-2 text-[13px] font-semibold text-white">Search</button>
          <button type="button" onClick={clear} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-600">Clear</button>
        </form>
        {loading ? <div className="flex min-h-[50vh] items-center justify-center gap-2 text-xs text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" />Loading notifications…</div>
        : error ? <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-[13px] font-semibold text-slate-900">Notifications unavailable</p><p className="mt-1 text-xs text-slate-600">{error}</p><button type="button" onClick={() => void load(page)} className="mt-3 inline-flex items-center gap-2 rounded-md bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white"><RefreshCw className="h-3.5 w-3.5" />Retry</button></div>
        : !hasRecords && !matchesFilters ? <div className="rounded-xl border border-slate-200 bg-white p-6 text-center"><Bell className="mx-auto h-5 w-5 text-slate-400" /><p className="mt-2 text-[13px] font-semibold text-slate-900">No notifications yet</p><p className="mt-1 text-xs text-slate-600">Notifications will appear here when NINJAWO sends booking and payment updates to customers and providers.</p></div>
        : !hasRecords ? <div className="rounded-xl border border-slate-200 bg-white p-6 text-center"><Search className="mx-auto h-5 w-5 text-slate-400" /><p className="mt-2 text-[13px] font-semibold text-slate-900">No notifications match the current filters</p><p className="mt-1 text-xs text-slate-600">Try a different search term, type or read state.</p><button type="button" onClick={clear} className="mt-3 inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">Clear filters</button></div>
        : <>
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_4px_16px_rgba(15,23,42,0.035)] md:block">
            <table className="w-full table-fixed border-collapse text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500"><tr>
                <th className="w-16 px-3 py-2">Read</th>
                <th className="w-40 px-3 py-2">Type</th>
                <th className="w-48 px-3 py-2">Title</th>
                <th className="w-40 px-3 py-2">Recipient</th>
                <th className="w-24 px-3 py-2">Role</th>
                <th className="px-3 py-2">Message</th>
                <th className="w-32 px-3 py-2">Created</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">{rows.map((row) => (
                <tr key={row.id} onClick={() => setDetail(row)} className="cursor-pointer align-top hover:bg-blue-50/40">
                  <td className="px-3 py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${readClass(row.is_read)}`}>{row.is_read ? "Read" : "Unread"}</span></td>
                  <td className="px-3 py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${typeClass(row.type)}`}>{typeLabel(row.type)}</span></td>
                  <td className="truncate px-3 py-2 font-semibold text-slate-800">{row.title || "—"}</td>
                  <td className="truncate px-3 py-2 text-slate-700">{opt(row.recipient_name)}</td>
                  <td className="px-3 py-2 text-slate-600">{roleLabel(row.recipient_role)}</td>
                  <td className="truncate px-3 py-2 text-slate-600">{row.message || "—"}</td>
                  <td className="px-3 py-2 tabular-nums text-slate-500">{stamp(row.created_at)}</td>
                </tr>
              ))}</tbody>
            </table>
            {result.contextError && <p className="flex items-center gap-1.5 border-t border-slate-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-800"><AlertTriangle className="h-3.5 w-3.5" />Recipient details could not be loaded for some rows.</p>}
          </div>
          <div className="space-y-2 md:hidden">{rows.map((row) => (
            <button key={row.id} type="button" onClick={() => setDetail(row)} className="block w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-[0_4px_16px_rgba(15,23,42,0.035)]">
              <div className="flex items-start justify-between gap-2">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${typeClass(row.type)}`}>{typeLabel(row.type)}</span>
                <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${readClass(row.is_read)}`}>{row.is_read ? "Read" : "Unread"}</span>
              </div>
              <p className="mt-1.5 truncate text-[13px] font-semibold text-slate-900">{row.title || "—"}</p>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-600">{row.message || "—"}</p>
              <p className="mt-1.5 truncate text-[11px] text-slate-500">{opt(row.recipient_name)} · {roleLabel(row.recipient_role)}</p>
              <p className="mt-0.5 text-[10px] tabular-nums text-slate-400">{stamp(row.created_at)}</p>
            </button>
          ))}</div>
          {result.contextError && <p className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 md:hidden"><AlertTriangle className="h-3.5 w-3.5" />Recipient details could not be loaded for some rows.</p>}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <p>Showing {from}–{to} of <span className="tabular-nums">{total}</span> notifications</p>
            <div className="flex items-center gap-2">
              <button type="button" disabled={page <= 1 || loading} onClick={() => void load(page - 1)} className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40">Previous</button>
              <span className="tabular-nums">Page {page} of {totalPages}</span>
              <button type="button" disabled={page >= totalPages || loading} onClick={() => void load(page + 1)} className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40">Next</button>
            </div>
          </div>
        </>}
      </div>
    </main>
    {detail && <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-950/30" onClick={() => setDetail(null)} />
      <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-xl">
        <header className="sticky top-0 flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3">
          <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700">Read-only</p><h2 className="truncate text-sm font-bold text-slate-950">{detail.title || "Notification"}</h2></div>
          <button type="button" onClick={() => setDetail(null)} className="rounded-md p-1.5 text-slate-500" aria-label="Close details"><X className="h-4 w-4" /></button>
        </header>
        <div className="space-y-4 p-4">
          <section className="space-y-1.5">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Notification</h3>
            <div className="flex flex-wrap gap-1.5">
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${typeClass(detail.type)}`}>{typeLabel(detail.type)}</span>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${readClass(detail.is_read)}`}>{detail.is_read ? "Read" : "Unread"}</span>
            </div>
            <p className="text-[13px] font-semibold text-slate-900">{opt(detail.title)}</p>
            <p className="whitespace-pre-wrap text-xs text-slate-600">{opt(detail.message)}</p>
            <p className="text-[11px] tabular-nums text-slate-500">{stamp(detail.created_at)}</p>
          </section>
          <section className="space-y-1.5">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Recipient</h3>
            <p className="text-[13px] font-semibold text-slate-900">{opt(detail.recipient_name)}</p>
            <p className="text-xs text-slate-600">{roleLabel(detail.recipient_role)}</p>
          </section>
          <section className="space-y-1.5">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Related records</h3>
            <p className="break-all text-xs text-slate-600">Booking ID: <span className="font-mono text-[11px] text-slate-800">{opt(detail.booking_id)}</span></p>
            <p className="break-all text-xs text-slate-600">Payment ID: <span className="font-mono text-[11px] text-slate-800">{opt(detail.payment_id)}</span></p>
          </section>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">This directory is view-only. Notifications cannot be sent, edited, marked read, or deleted from the Admin console.</p>
        </div>
      </aside>
    </div>}
  </div>;
}

export const Route = createFileRoute("/admin/notifications")({ head: () => ({ meta: [{ title: "Admin Notifications | NINJAWO" }] }), component: AdminNotifications });
