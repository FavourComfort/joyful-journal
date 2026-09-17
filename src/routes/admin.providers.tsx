import { useEffect, useRef, useState, type ReactNode } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AlertTriangle, Bell, LayoutDashboard, LogOut, MapPin, Menu, RefreshCw, Search, ShieldCheck, Star, Store, Users, X } from "lucide-react";
import { getCurrentProfile, signOut } from "@/lib/services/auth.service";
import { getProvidersForAdmin, ADMIN_PROVIDERS_PAGE_SIZE, type AdminProviderRow } from "@/lib/services/admin.service";

const dateFormat = new Intl.DateTimeFormat("en-UG", { day: "numeric", month: "short", year: "numeric" });
const VERIFICATION_FILTERS = ["All providers", "verified", "pending"] as const;

type VerificationFilter = (typeof VERIFICATION_FILTERS)[number];

function verificationLabel(verified: boolean) { return verified ? "Verified" : "Pending"; }
function verificationClass(verified: boolean) {
  return verified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700";
}
function ratingLabel(rating: number) { return rating > 0 ? rating.toFixed(1) : "—"; }
function shortId(id: string) { return `#${id.slice(0, 8)}`; }
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_4px_16px_rgba(15,23,42,0.035)]"><header className="flex min-h-12 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3"><h2 className="text-sm font-bold text-slate-950">{title}</h2></header>{children}</section>;
}
function Empty({ children }: { children: ReactNode }) { return <p className="px-4 py-6 text-[13px] text-slate-500">{children}</p>; }
function Avatar({ row }: { row: AdminProviderRow }) {
  const source = row.profile_picture_url || row.owner_avatar_url;
  const initials = (row.business_name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("") || "?";
  return source
    ? <img src={source} alt="" className="h-8 w-8 shrink-0 rounded-lg border border-slate-200 object-cover" />
    : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-bold text-slate-600">{initials}</span>;
}
function VerificationPill({ verified }: { verified: boolean }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${verificationClass(verified)}`}>{verificationLabel(verified)}</span>;
}

function AdminProviders() {
  const router = useRouter();
  const [rows, setRows] = useState<AdminProviderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [verification, setVerification] = useState<VerificationFilter>("All providers");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [ownerContextError, setOwnerContextError] = useState(false);
  const [ownerSearchTruncated, setOwnerSearchTruncated] = useState(false);
  // Guards against out-of-order responses when search/filter/page change quickly.
  const requestId = useRef(0);

  const load = async (targetPage = page) => {
    const ticket = ++requestId.current;
    setLoading(true); setError(null);
    try {
      const profile = await getCurrentProfile();
      if (!profile) { await router.navigate({ to: "/login" }); return; }
      if (profile.role !== "admin") { await router.navigate({ to: "/" }); return; }
      const result = await getProvidersForAdmin({ search, verification: verification === "All providers" ? "" : verification, page: targetPage, pageSize: ADMIN_PROVIDERS_PAGE_SIZE });
      if (ticket !== requestId.current) return;
      setRows(result.rows); setTotal(result.total); setPage(result.page);
      setOwnerContextError(Boolean(result.ownerContextError));
      setOwnerSearchTruncated(Boolean(result.ownerSearchTruncated));
    } catch (err) {
      if (ticket !== requestId.current) return;
      setError(err instanceof Error ? err.message : "The provider directory could not load.");
      setRows([]); setTotal(0); setOwnerContextError(false); setOwnerSearchTruncated(false);
    } finally { if (ticket === requestId.current) setLoading(false); }
  };
  useEffect(() => { void load(1); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [search, verification]);
  const signOutAdmin = async () => { await signOut(); await router.navigate({ to: "/login" }); };

  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PROVIDERS_PAGE_SIZE));
  const showing = rows.length === 0 ? 0 : (page - 1) * ADMIN_PROVIDERS_PAGE_SIZE + 1;
  const showingTo = (page - 1) * ADMIN_PROVIDERS_PAGE_SIZE + rows.length;

  const navItems = [[LayoutDashboard, "Dashboard"], [Users, "Users"], [ShieldCheck, "Providers"], [Store, "Services"], [Bell, "Disputes"], [Bell, "Support"], [Bell, "Reviews"]] as const;
  const navigation = <><div className="mb-5 flex items-center gap-2 px-2"><img src="/favicon.png" alt="NINJAWO" className="h-8 w-8 rounded-lg" /><div><p className="text-base font-bold leading-5 text-slate-950">NINJAWO</p><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-blue-700">Admin console</p></div></div><nav className="space-y-0.5" aria-label="Admin navigation">{navItems.map(([Icon, name], index) => index === 0 ? <a key={name} href="/admin/dashboard" onClick={() => setMobileOpen(false)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Icon className="h-3.5 w-3.5" />{name}</a> : index === 1 ? <a key={name} href="/admin/users" onClick={() => setMobileOpen(false)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700"><Icon className="h-3.5 w-3.5" />{name}</a> : index === 2 ? <a key={name} href="/admin/providers" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5 rounded-lg bg-blue-50 px-2.5 py-2 text-xs font-semibold text-blue-700"><Icon className="h-3.5 w-3.5" />{name}</a> : <button key={name} disabled className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-slate-400"><Icon className="h-3.5 w-3.5" />{name}<span className="ml-auto text-[9px] uppercase">Soon</span></button>)}</nav><button type="button" onClick={signOutAdmin} className="mt-auto flex items-center gap-2.5 px-2.5 py-2 text-xs font-semibold text-slate-600"><LogOut className="h-3.5 w-3.5" />Sign out</button></>;
  return <div className="min-h-screen bg-[#f6f8fb] text-slate-900">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-slate-200 bg-white px-3 py-4 md:flex">{navigation}</aside>
    {mobileOpen && <div className="fixed inset-0 z-40 bg-slate-950/30 md:hidden" onClick={() => setMobileOpen(false)} />}
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white px-3 py-4 transition-transform duration-200 md:hidden ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
      <button type="button" onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close menu"><X className="h-4 w-4" /></button>{navigation}
    </aside>
    <main className="md:pl-56">
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
        <button type="button" onClick={() => setMobileOpen(true)} className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 md:hidden" aria-label="Open menu"><Menu className="h-4 w-4" /></button>
        <div className="ml-2 md:ml-0"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">Operations</p><h1 className="text-sm font-bold text-slate-950">Providers</h1></div>
        <div className="ml-auto flex items-center gap-3"><Bell className="h-4 w-4 text-slate-500" /><span className="hidden text-xs font-semibold text-slate-600 sm:inline">{loading ? "…" : `${total} provider${total === 1 ? "" : "s"}`}</span></div>
      </header>
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-5 xl:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") setSearch(searchInput.trim()); }} onBlur={() => setSearch(searchInput.trim())} placeholder="Search business, location or owner..." aria-label="Search providers" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-8 text-[13px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-400" />{searchInput ? <button type="button" onClick={() => { setSearchInput(""); setSearch(""); }} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button> : null}</div>
          <select value={verification} onChange={(e) => setVerification(e.target.value as VerificationFilter)} aria-label="Filter by verification" className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] font-medium text-slate-700 outline-none focus:border-blue-400">{VERIFICATION_FILTERS.map((f) => <option key={f} value={f}>{f === "All providers" ? f : f === "verified" ? "Verified" : "Pending"}</option>)}</select>
          {loading ? <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><RefreshCw className="h-3 w-3 animate-spin" />Loading</span> : !error ? <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Showing {showing}–{showingTo} of {total}</span> : null}
        </div>

        {ownerContextError && !error ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><p>Owner contact details could not be loaded for this page, so the Owner column may be incomplete. Provider records and verification statuses are unaffected.</p></div>
        ) : null}
        {ownerSearchTruncated && !error ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><p>This search matched more owner accounts than can be shown at once, so owner name/phone matches may be incomplete. Narrow the search term for complete results.</p></div>
        ) : null}

        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center gap-2 text-[13px] text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" />Loading providers...</div>
        ) : error ? (
          <Panel title="Providers unavailable">
            <div className="p-4">
              <p className="text-[13px] text-slate-600">{error}</p>
              <button type="button" onClick={() => void load()} className="mt-3 inline-flex items-center gap-2 rounded-md bg-blue-700 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-blue-800"><RefreshCw className="h-3.5 w-3.5" />Retry</button>
            </div>
          </Panel>
        ) : rows.length === 0 ? (
          <Panel title="Providers"><Empty>{search || verification !== "All providers" ? "No providers match the current search or verification filter." : "No provider accounts yet."}</Empty></Panel>
        ) : (
          <Panel title={`Providers (${total})`}>
            <div className="hidden md:block"><table className="w-full text-left"><thead><tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wide text-slate-500"><th className="px-4 py-2.5">Provider</th><th className="px-4 py-2.5">Owner</th><th className="px-4 py-2.5">Phone</th><th className="px-4 py-2.5">Location</th><th className="px-4 py-2.5">Rating</th><th className="px-4 py-2.5">Joined</th><th className="px-4 py-2.5 text-right">Verification</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => (
              <tr key={row.id} className="text-[13px] text-slate-700 hover:bg-slate-50/60">
                <td className="px-4 py-2"><span className="flex min-w-0 items-center gap-2.5"><Avatar row={row} /><span className="min-w-0"><span className="block truncate font-semibold text-slate-900">{row.business_name || "Unnamed provider"}</span><span className="block truncate text-[11px] tabular-nums text-slate-400">{shortId(row.id)}</span></span></span></td>
                <td className="px-4 py-2"><span className="block max-w-[14rem] truncate">{row.owner_name || "—"}</span></td>
                <td className="px-4 py-2 tabular-nums">{row.owner_phone || "—"}</td>
                <td className="px-4 py-2">{row.location ? <span className="flex min-w-0 items-center gap-1.5"><MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="max-w-[12rem] truncate">{row.location}</span></span> : "—"}</td>
                <td className="whitespace-nowrap px-4 py-2">{row.rating > 0 ? <span className="flex items-center gap-1 tabular-nums"><Star className="h-3.5 w-3.5 text-amber-500" />{ratingLabel(row.rating)}</span> : <span className="text-slate-400">—</span>}</td>
                <td className="whitespace-nowrap px-4 py-2 tabular-nums">{dateFormat.format(new Date(row.created_at))}</td>
                <td className="px-4 py-2 text-right"><VerificationPill verified={row.verified} /></td>
              </tr>
            ))}</tbody></table></div>
            <ul className="divide-y divide-slate-100 md:hidden">{rows.map((row) => (
              <li key={row.id} className="flex items-center gap-2.5 px-4 py-2.5">
                <Avatar row={row} />
                <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold text-slate-900">{row.business_name || "Unnamed provider"}</p><p className="truncate text-[11px] text-slate-500">{row.location || "No location"} · {row.owner_phone || "No phone"}{row.rating > 0 ? ` · ${ratingLabel(row.rating)}★` : ""} · joined {dateFormat.format(new Date(row.created_at))}</p></div>
                <div className="shrink-0"><VerificationPill verified={row.verified} /></div>
              </li>
            ))}</ul>
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5"><p className="text-[11px] text-slate-500">Page {page} of {totalPages}</p><div className="flex items-center gap-1.5"><button type="button" disabled={page <= 1 || loading} onClick={() => void load(page - 1)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-[12px] font-semibold text-slate-600 disabled:opacity-40">‹ Prev</button><button type="button" disabled={page >= totalPages || loading} onClick={() => void load(page + 1)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-[12px] font-semibold text-slate-600 disabled:opacity-40">Next ›</button></div></div>
          </Panel>
        )}
      </div>
    </main>
  </div>;
}

export const Route = createFileRoute("/admin/providers")({
  head: () => ({ meta: [{ title: "Providers | NINJAWO Admin" }] }),
  component: AdminProviders,
});

