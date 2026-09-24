import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AlertTriangle, Bell, CreditCard, Info, Menu, RefreshCw, Wallet, X } from "lucide-react";
import { getCurrentProfile } from "@/lib/services/auth.service";
import { AdminNav } from "@/components/AdminNav";

/**
 * PHASE 4B — Admin Wallet (read-only).
 * Discovery: NINJAWO has NO wallet/ledger/payout/withdrawal/earnings table
 * anywhere (repo SQL and deployed DB — PGRST205 for every candidate name).
 * The only financial data is per-transaction: payments.amount, platform_fee,
 * provider_amount and payment_status. Nothing in the app aggregates them into
 * a balance, so this page deliberately shows NO financial figures. No
 * mutations, no fabricated balances. Real payment records live in Finance.
 */
function AdminWallet() {
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
      setError(err instanceof Error ? err.message : "The wallet page could not load.");
    } finally { setChecking(false); }
  }, [router]);
  useEffect(() => { void load(); }, [load]);
  return <div className="min-h-screen bg-[#f6f8fb] text-slate-900">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-slate-200 bg-white px-3 py-4 md:flex"><AdminNav onNavigate={() => setMobileOpen(false)} /></aside>
    {mobileOpen && <div className="fixed inset-0 z-40 bg-slate-950/30 md:hidden" onClick={() => setMobileOpen(false)} />}
    <aside inert={!mobileOpen} className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white px-3 py-4 transition-transform duration-200 md:hidden ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
      <button type="button" onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 rounded-md p-1.5 text-slate-500" aria-label="Close menu"><X className="h-4 w-4" /></button><AdminNav onNavigate={() => setMobileOpen(false)} />
    </aside>
    <main className="md:pl-56">
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
        <button type="button" onClick={() => setMobileOpen(true)} className="rounded-md p-1.5 text-slate-600 md:hidden" aria-label="Open menu"><Menu className="h-4 w-4" /></button>
        <div className="ml-2 md:ml-0"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">Operations</p><h1 className="text-sm font-bold text-slate-950">Wallet</h1></div>
        <div className="ml-auto flex items-center gap-3"><Bell className="h-4 w-4 text-slate-500" /><span className="hidden text-xs font-semibold text-slate-600 sm:inline">Read-only</span></div>
      </header>
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-5 xl:p-6">
        {checking ? <div className="flex min-h-[35vh] items-center justify-center gap-2 text-[13px] text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" />Loading wallet…</div>
          : error ? <div role="alert" className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_4px_16px_rgba(15,23,42,0.035)]"><h2 className="text-sm font-bold">Wallet unavailable</h2><p className="mt-2 text-[13px] text-slate-600">{error}</p><button type="button" onClick={() => void load()} className="mt-3 rounded-md bg-blue-700 px-3 py-1.5 text-[13px] font-semibold text-white">Retry</button></div>
          : <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_4px_16px_rgba(15,23,42,0.035)]">
              <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3"><Wallet className="h-4 w-4 text-slate-400" /><h2 className="text-sm font-bold text-slate-950">No wallet data source exists yet</h2></header>
              <div className="space-y-3 px-4 py-4 text-[13px] leading-relaxed text-slate-600">
                <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800"><AlertTriangle className="h-4 w-4 shrink-0" />NINJAWO currently has no wallet, ledger, payout, withdrawal or earnings system. No provider or platform balances are stored anywhere in the database, so no balance figures can be displayed on this page.</div>
                <p>What actually exists today are payment transaction records. Each record stores its own <span className="font-semibold text-slate-800">amount</span>, <span className="font-semibold text-slate-800">platform fee</span> and <span className="font-semibold text-slate-800">provider amount</span>, together with a payment status such as pending, escrowed, released, failed, refunded or disputed. These are per-transaction values — they are not balances, and nothing in the application adds them up into a wallet.</p>
                <p>Until a real wallet/ledger system is designed and built, showing any balance here would be fabricated, so this page intentionally displays none.</p>
                <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-blue-800"><Info className="h-4 w-4 shrink-0" />All real stored payment records — including transaction references, methods, statuses and amounts — remain available in the Finance directory.</div>
                <div className="flex flex-wrap gap-2">
                  <a href="/admin/finance" className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-[13px] font-semibold text-white"><CreditCard className="h-4 w-4" />Open Finance directory</a>
                  <a href="/admin/payouts" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-600"><CreditCard className="h-4 w-4" />Provider payouts status</a>
                </div>
              </div>
            </section>}
      </div>
    </main>
  </div>;
}

export const Route = createFileRoute("/admin/wallet")({
  head: () => ({ meta: [{ title: "Wallet | NINJAWO Admin" }] }),
  component: AdminWallet,
});

