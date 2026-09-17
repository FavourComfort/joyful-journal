import { useEffect, useRef, useState, type ReactNode } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  Bell,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  Store,
  ToggleLeft,
  ToggleRight,
  Users,
  X,
} from "lucide-react";
import { getCurrentProfile, signOut } from "@/lib/services/auth.service";
import {
  getServiceCategoriesForAdmin,
  getServicesForAdmin,
  ADMIN_SERVICES_PAGE_SIZE,
  type AdminServiceAvailability,
  type AdminServiceRow,
} from "@/lib/services/admin.service";

const dateFormat = new Intl.DateTimeFormat("en-UG", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const AVAILABILITY_FILTERS = ["All services", "Active", "Inactive"] as const;

type AvailabilityFilter = (typeof AVAILABILITY_FILTERS)[number];

function availabilityToQuery(value: AvailabilityFilter): AdminServiceAvailability | "" {
  if (value === "Active") return "active";
  if (value === "Inactive") return "inactive";
  return "";
}
function availabilityClass(value: AdminServiceAvailability | "") {
  if (value === "active") return "bg-emerald-50 text-emerald-700";
  return "bg-slate-100 text-slate-600";
}
function money(value: number) {
  return new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency: "UGX",
    maximumFractionDigits: 0,
  }).format(value);
}
function priceLabel(value: number) {
  return money(value);
}
function shortId(id: string) {
  return `#${id.slice(0, 8)}`;
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_4px_16px_rgba(15,23,42,0.035)]">
      <header className="flex min-h-12 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-950">{title}</h2>
      </header>
      {children}
    </section>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-[13px] text-slate-500">{children}</p>;
}
function BusinessAvatar({ row }: { row: AdminServiceRow }) {
  const source = row.profile_picture_url || row.owner_avatar_url;
  const initials =
    (row.business_name || "?")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join("") || "?";
  return source ? (
    <img src={source} alt="" className="h-8 w-8 shrink-0 rounded-lg border border-slate-200 object-cover" />
  ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-bold text-slate-600">
      {initials}
    </span>
  );
}

function AdminServices() {
  const router = useRouter();
  const [rows, setRows] = useState<AdminServiceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [availability, setAvailability] = useState<AvailabilityFilter>("All services");
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [providerContextError, setProviderContextError] = useState(false);
  const [ownerSearchTruncated, setOwnerSearchTruncated] = useState(false);
  // Guards against out-of-order responses when search/filter/page change quickly.
  const requestId = useRef(0);
  // The category list is fetched once (capped, server-side) and then cached.
  const categoriesLoaded = useRef(false);

  const load = async (targetPage = page) => {
    const ticket = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const profile = await getCurrentProfile();
      if (!profile) {
        await router.navigate({ to: "/login" });
        return;
      }
      if (profile.role !== "admin") {
        await router.navigate({ to: "/" });
        return;
      }
      const result = await getServicesForAdmin({
        search,
        category: category || undefined,
        availability: availabilityToQuery(availability),
        page: targetPage,
        pageSize: ADMIN_SERVICES_PAGE_SIZE,
      });
      if (ticket !== requestId.current) return;
      setRows(result.rows);
      setTotal(result.total);
      setPage(result.page);
      if (!categoriesLoaded.current) setCategories(result.categories);
      setProviderContextError(Boolean(result.providerContextError));
      setOwnerSearchTruncated(Boolean(result.ownerSearchTruncated));
      if (!categoriesLoaded.current) {
        const fullCategories = await getServiceCategoriesForAdmin();
        if (ticket === requestId.current) {
          setCategories(fullCategories);
          categoriesLoaded.current = true;
        }
      }
    } catch (err) {
      if (ticket !== requestId.current) return;
      setError(err instanceof Error ? err.message : "The services directory could not load.");
      setRows([]);
      setTotal(0);
      setProviderContextError(false);
      setOwnerSearchTruncated(false);
    } finally {
      if (ticket === requestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    void load(1);
    return () => { requestId.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, category, availability]);

  const signOutAdmin = async () => {
    await signOut();
    await router.navigate({ to: "/login" });
  };

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim() === search) return;
    setSearch(searchInput.trim());
  };

  const onCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCategory(e.target.value || "");
    setPage(1);
  };

  const onAvailabilityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setAvailability(e.target.value as AvailabilityFilter);
    setPage(1);
  };

  const onPage = (target: number) => {
    if (target < 1 || target > totalPages || loading) return;
    setPage(target);
    void load(target);
  };

  const totalPages = Math.max(1, Math.ceil(total / ADMIN_SERVICES_PAGE_SIZE));
    const showing = rows.length === 0 ? 0 : (page - 1) * ADMIN_SERVICES_PAGE_SIZE + 1;
  const showingTo = (page - 1) * ADMIN_SERVICES_PAGE_SIZE + rows.length;

  const navItems = [
    [LayoutDashboard, "Dashboard"],
    [Users, "Users"],
    [ShieldCheck, "Providers"],
    [Store, "Services"],
    [Bell, "Disputes"],
    [Bell, "Support"],
    [Bell, "Reviews"],
  ] as const;
  const navigation = (
    <>
      <div className="mb-5 flex items-center gap-2 px-2">
        <img src="/favicon.png" alt="NINJAWO" className="h-8 w-8 rounded-lg" />
        <div>
          <p className="text-base font-bold leading-5 text-slate-950">NINJAWO</p>
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-blue-700">Admin console</p>
        </div>
      </div>
      <nav className="space-y-0.5" aria-label="Admin navigation">
        {navItems.map(([Icon, name], index) =>
          index === 0 ? (
            <a
              key={name}
              href="/admin/dashboard"
              onClick={() => setMobileOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <Icon className="h-3.5 w-3.5" />
              {name}
            </a>
          ) : index === 1 ? (
            <a
              key={name}
              href="/admin/users"
              onClick={() => setMobileOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700"
            >
              <Icon className="h-3.5 w-3.5" />
              {name}
            </a>
          ) : index === 2 ? (
            <a
              key={name}
              href="/admin/providers"
              onClick={() => setMobileOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700"
            >
              <Icon className="h-3.5 w-3.5" />
              {name}
            </a>
          ) : index === 3 ? (
            <a
              key={name}
              href="/admin/services"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2.5 rounded-lg bg-blue-50 px-2.5 py-2 text-xs font-semibold text-blue-700"
            >
              <Icon className="h-3.5 w-3.5" />
              {name}
            </a>
          ) : (
            <button
              key={name}
              disabled
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-slate-400"
            >
              <Icon className="h-3.5 w-3.5" />
              {name}
              <span className="ml-auto text-[9px] uppercase">Soon</span>
            </button>
          ),
        )}
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

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-slate-200 bg-white px-3 py-4 md:flex">
        {navigation}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/30 md:hidden" onClick={() => setMobileOpen(false)} />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white px-3 py-4 transition-transform duration-200 md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="absolute right-3 top-3 rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>
        {navigation}
      </aside>
      <main className="md:pl-56">
        <header className="sticky top-0 z-20 flex h-14 items-center border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 md:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="ml-2 md:ml-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-700">Operations</p>
            <h1 className="text-sm font-bold text-slate-950">Services</h1>
          </div>
                    <div className="ml-auto flex items-center gap-3">
            <Bell className="h-4 w-4 text-slate-500" />
            <span className="hidden text-xs font-semibold text-slate-600 sm:inline">
              {loading ? "…" : `${total} service${total === 1 ? "" : "s"}`}
            </span>
          </div>
        </header>
        <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-5 xl:p-6">
          <section className="flex flex-wrap items-end justify-between gap-3">
            <form
              onSubmit={onSearchSubmit}
              className="flex-1 min-w-[220px] sm:min-w-[260px]"
            >
              <label htmlFor="service-search" className="sr-only">
                Search services
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  id="service-search"
                  placeholder="Search by service, category or business…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setSearch(searchInput.trim());
                  }}
                  onBlur={() => setSearch(searchInput.trim())}
                  className="w-full rounded-md border border-slate-200 bg-white pl-9 pr-8 py-1.5 text-[13px] text-slate-700 placeholder-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
                {searchInput ? (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      setSearchInput("");
                      setSearch("");
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </form>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label
                  htmlFor="service-category"
                  className="block text-[10px] font-bold uppercase tracking-wide text-slate-500"
                >
                  Category
                </label>
                <select
                  id="service-category"
                  value={category}
                  onChange={onCategoryChange}
                  className="mt-0.5 w-full min-w-[160px] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[13px] text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c || "—"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="service-availability"
                  className="block text-[10px] font-bold uppercase tracking-wide text-slate-500"
                >
                  Availability
                </label>
                <select
                  id="service-availability"
                  value={availability}
                  onChange={onAvailabilityChange}
                  className="mt-0.5 w-full min-w-[150px] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[13px] text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  {AVAILABILITY_FILTERS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {providerContextError && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              Provider context could not be resolved for some services on this page. Showing service data only.
            </div>
          )}
          {!providerContextError && ownerSearchTruncated && !error && !loading ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              Many businesses or owners matched the search; only the first 100 were considered, so some matching services may be missing from these results.
            </div>
          ) : null}

          {loading ? (
            <div className="flex min-h-[50vh] items-center justify-center gap-2 text-xs text-slate-500">
              <svg className="-ml-1 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Loading services…
            </div>
          ) : error ? (
            <Panel title="Services unavailable">
              <div className="p-4">
                <p className="text-[13px] text-slate-600">{error}</p>
                <button
                  type="button"
                  onClick={() => void load(1)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-blue-800"
                >
                  Retry
                </button>
              </div>
            </Panel>
          ) : rows.length === 0 ? (
            <Panel title="No services">
              <Empty>
                {search || category || availability !== "All services"
                  ? "No services match the current search or filter."
                  : "No service listings yet."}
              </Empty>
            </Panel>
          ) : (
            <Panel title={`Services (${total})`}>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px] table-fixed text-left">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-2.5">Service</th>
                      <th className="px-4 py-2.5">Category</th>
                      <th className="px-4 py-2.5">Provider</th>
                      <th className="px-4 py-2.5">Owner</th>
                      <th className="px-4 py-2.5">Price</th>
                      <th className="px-4 py-2.5 text-right">Status</th>
                      <th className="px-4 py-2.5">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row) => (
                      <tr key={row.id} className="text-[13px] text-slate-700 hover:bg-slate-50/60">
                        <td className="px-4 py-2">
                          <span className="flex min-w-0 items-center gap-2.5">
                            <BusinessAvatar row={row} />
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-slate-900">
                                {row.title || "Unnamed service"}
                              </span>
                              <span className="block truncate text-[11px] tabular-nums text-slate-400">
                                {shortId(row.id)}
                              </span>
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-2 max-w-[14rem]">
                          <span className="block truncate">{row.category || "—"}</span>
                        </td>
                        <td className="px-4 py-2 max-w-[14rem]">
                          <span className="block truncate">{row.business_name || "Provider unavailable"}</span>
                          <span className="block truncate text-[11px] text-slate-400" title="Provider location">{row.location || ""}</span>
                        </td>
                        <td className="px-4 py-2">
                          <span className="block max-w-[14rem] truncate">{row.owner_name || "—"}</span>
                          <span className="block truncate text-[11px] text-slate-400">{row.owner_phone || ""}</span>
                        </td>
                        <td className="px-4 py-2 tabular-nums">{priceLabel(row.price)}</td>
                        <td className="px-4 py-2 text-right">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${availabilityClass(row.active ? "active" : "inactive")}`}
                          >
                            {row.active ? <ToggleRight className="h-3 w-3" /> : <ToggleLeft className="h-3 w-3" />}
                            {row.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-2 tabular-nums">
                          {dateFormat.format(new Date(row.created_at))}
                        </td>
                      </tr>
                    ))}
                                    </tbody>
                </table>
              </div>
              <ul className="divide-y divide-slate-100 md:hidden">
                {rows.map((row) => (
                  <li key={row.id} className="flex items-center gap-2.5 px-4 py-2.5">
                    <BusinessAvatar row={row} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-slate-900">
                        {row.title || "Unnamed service"}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">
                        {row.category || "No category"} · {row.business_name || "No provider"} ·{" "}
                        {priceLabel(row.price)} ·{" "}
                        <span className={row.active ? "text-emerald-700" : "text-slate-500"}>
                          {row.active ? "Active" : "Inactive"}
                        </span>{" "}
                        · joined {dateFormat.format(new Date(row.created_at))}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {row.active ? (
                        <ToggleRight className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <ToggleLeft className="h-4 w-4 text-slate-400" />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
                <p className="text-[11px] text-slate-500">
                  Showing {showing}-{showingTo} of {total} · Page {page} of {totalPages}
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={page <= 1 || loading}
                    onClick={() => void onPage(page - 1)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-[12px] font-semibold text-slate-600 disabled:opacity-40"
                  >
                    ‹ Prev
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages || loading}
                    onClick={() => void onPage(page + 1)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-[12px] font-semibold text-slate-600 disabled:opacity-40"
                  >
                    Next ›
                  </button>
                </div>
              </div>
            </Panel>
          )}
        </div>
      </main>
    </div>
  );
}

export const Route = createFileRoute("/admin/services")({
  head: () => ({ meta: [{ title: "Services | NINJAWO Admin" }] }),
  component: AdminServices,
});




