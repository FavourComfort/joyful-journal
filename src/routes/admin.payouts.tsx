import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AlertTriangle, Bell, CalendarCheck, CheckCircle2, CreditCard, FileText, Info, LayoutDashboard, LogOut, Menu, RefreshCw, ShieldCheck, Users, Wallet, Wrench, X } from "lucide-react";
import { getCurrentProfile, signOut } from "@/lib/services/auth.service";

const navItems = [
  [LayoutDashboard, "Dashboard", "/admin/dashboard"], [Users, "Users", "/admin/users"],
  [ShieldCheck, "Providers", "/admin/providers"], [Wrench, "Services", "/admin/services"],
  [FileText, "Requests", "/admin/requests"], [FileText, "Offers", "/admin/offers"],
  [CalendarCheck, "Bookings", "/admin/bookings"], [Wallet, "Finance", "/admin/finance"],
  [Wallet, "Wallet", "/admin/wallet"], [Wallet, "Payouts", "/admin/payouts"],
  [Bell, "Support", null], [Bell, "Notifications", null],
  [AlertTriangle, "Disputes", null], [CheckCircle2, "Reviews", null],
] as const;

/**
 * PHASE 4C — Admin Payouts (inspection result: State C — read-only).
 * No payout execution exists anywhere: there is no payouts/withdrawals table,
 * no disbursement code (MarzPay is collection-only via ninjawo-handler), and
 * no provider payout destination stored (live `providers` has no such columns).
 * `release_escrow_to_provider` only sets payments.payment_status='released' —
 * a database status change, not a money transfer. Therefore this page shows
 * NO balances, NO payout statuses, and NO payout actions. No mutations.
 */
function AdminPayouts() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const load = useCallback(async () => {
    setChecking(true); setError(null);
    try {
      const profile = await getCurrentProfile();
      if (!profile) { await router.navigate({ to: "/login" }); return; }
      if (profile.role !== "admin") { await router.navigate({ to: "/" }); return; }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The payouts page could not load.");
    } finally { setChecking(false); }
  }, [router]);
  useEffect(() => { void load(); }, [load]);
  const signOutAdmin = async () => { await signOut(); await router.navigate({ to: "/login" }); };

  const navigation = <>
    <div className="mb-5 flex items-center gap-2 px-2"><img src="/favicon.png" alt="NINJAWO" className="h-8 w-8 rounded-lg" /><div><p className="text-base font-bold leading-5 text-slate-950">NINJAWO</p><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-blue-700">Admin console</p></div></div>
    <nav className="space-y-0.5" aria-label="Admin navigation">{navItems.map(([Icon, name, href]) => href ? (
      <a key={name} href={href} aria-current={name === "Payouts" ? "page" : undefined} onClick={() => setMobileOpen(false)} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold ${name === "Payouts" ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-blue-50 hover:text-blue-700"}`}>
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
        <div className="ml-2 md:ml-0"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">Operations</p><h1 className="text-sm font-bold text-slate-950">Payouts</h1></div>
        <div className="ml-auto flex items-center gap-3"><Bell className="h-4 w-4 text-slate-500" /><span className="hidden text-xs font-semibold text-slate-600 sm:inline">Read-only</span></div>
      </header>

      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-5 xl:p-6">
        {checking ? <div className="flex min-h-[35vh] items-center justify-center gap-2 text-[13px] text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" />Loading payouts…</div>
          : error ? <div role="alert" className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_4px_16px_rgba(15,23,42,0.035)]"><h2 className="text-sm font-bold">Payouts unavailable</h2><p className="mt-2 text-[13px] text-slate-600">{error}</p><button type="button" onClick={() => void load()} className="mt-3 rounded-md bg-blue-700 px-3 py-1.5 text-[13px] font-semibold text-white">Retry</button></div>
          : <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_4px_16px_rgba(15,23,42,0.035)]">
              <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3"><CreditCard className="h-4 w-4 text-slate-400" /><h2 className="text-sm font-bold text-slate-950">Provider payout execution is not implemented yet</h2></header>
              <div className="space-y-3 px-4 py-4 text-[13px] leading-relaxed text-slate-600">
                <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800"><AlertTriangle className="h-4 w-4 shrink-0" />NINJAWO currently cannot send money to providers. No payout, withdrawal, ledger or balance system exists in the database or application code, so there are no payout records, statuses or balances to display — and none are invented on this page.</div>
                <p>What exists today: a completed booking's payment is marked <span className="font-semibold text-slate-800">released</span> in the database. That release is a status change only — it records that the provider is entitled to the stored <span className="font-semibold text-slate-800">provider amount</span>. No actual transfer of funds to a provider happens at any point, and providers have no stored payout destination (mobile money or bank details) in the database.</p>
                <p>The MarzPay integration is used only for collecting customer payments. It has no disbursement or transfer step.</p>
                <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-blue-800"><Info className="h-4 w-4 shrink-0" />Until a real payout system (with provider payout destinations and a disbursement integration) is designed and built, this page intentionally shows no balances, statuses or actions.</div>
                <p>Related real data can be viewed in the Finance directory (payment records, including the stored provider amount and release status) and the Wallet page (why no wallet/balance system exists).</p>
                <div className="flex flex-wrap gap-2">
                  <a href="/admin/finance" className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-[13px] font-semibold text-white"><CreditCard className="h-4 w-4" />Open Finance directory</a>
                  <a href="/admin/wallet" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-600"><Wallet className="h-4 w-4" />Open Wallet page</a>
                </div>
              </div>
            </section>}
      </div>
    </main>
  </div>;
}

export const Route = createFileRoute("/admin/payouts")({
  head: () => ({ meta: [{ title: "Payouts | NINJAWO Admin" }] }),
  component: AdminPayouts,
});
