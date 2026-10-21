import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AlertTriangle, Bell, CreditCard, Info, Menu, RefreshCw, Wallet, X } from "lucide-react";
import { getCurrentProfile } from "@/lib/services/auth.service";
import { AdminNav } from "@/components/AdminNav";
import {
  PAYOUT_LEDGER_NOT_DEPLOYED,
  listProviderPayouts,
  recordPayoutOutcome,
  type PayoutStatus,
  type ProviderPayout,
} from "@/lib/services/payouts.service";

/**
 * PHASE 1C — Admin Payout Queue (offline manual-disbursement ledger).
 * "Paid out" means an administrator recorded an external/manual disbursement.
 * The app does NOT send money through MarzPay (collection-only via
 * ninjawo-handler). Queue/outcome writes go through the LOCAL-ONLY migration
 * `db/migrations/20261019_phase3h1_provider_payout_ledger.sql`, which is NOT
 * applied to production — until then this page reports the ledger as
 * unavailable instead of inventing data. Admin enforcement lives in the
 * database RPCs; hidden buttons are never the security boundary.
 */
const STATUS_TABS: Array<{ key: PayoutStatus | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "queued", label: "Queued" },
  { key: "paid_out", label: "Paid out" },
  { key: "failed", label: "Failed" },
];

function statusBadge(status: PayoutStatus) {
  if (status === "paid_out") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (status === "failed") return "bg-red-50 text-red-800 border-red-200";
  return "bg-amber-50 text-amber-800 border-amber-200";
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "—";
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? value : timestamp.toLocaleString();
}

function AdminPayouts() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [notDeployed, setNotDeployed] = useState(false);
  const [payouts, setPayouts] = useState<ProviderPayout[]>([]);
  const [tab, setTab] = useState<PayoutStatus | "all">("queued");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [failureReason, setFailureReason] = useState("");
  const [confirm, setConfirm] = useState<{
    id: string;
    outcome: "paid_out" | "failed";
  } | null>(null);

  const loadQueue = useCallback(async () => {
    setLoadingQueue(true);
    setQueueError(null);
    try {
      const result = await listProviderPayouts();
      if (result.notDeployed) {
        setNotDeployed(true);
        setPayouts([]);
        setQueueError(result.error);
        return;
      }
      setNotDeployed(false);
      if (result.error) {
        setQueueError(result.error);
        setPayouts([]);
        return;
      }
      setPayouts(result.payouts ?? []);
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : "The payout queue could not load.");
    } finally {
      setLoadingQueue(false);
    }
  }, []);

  const load = useCallback(async () => {
    setChecking(true);
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
      await loadQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The payouts page could not load.");
    } finally {
      setChecking(false);
    }
  }, [router, loadQueue]);
  useEffect(() => {
    void load();
  }, [load]);

  const submitOutcome = useCallback(async () => {
    if (!confirm) return;
    if (confirm.outcome === "failed" && !failureReason.trim()) {
      setActionError("A failure reason is required to record a failed payout.");
      return;
    }
    setActionId(confirm.id);
    setActionError(null);
    try {
      const result = await recordPayoutOutcome(confirm.id, confirm.outcome, failureReason);
      if (!result.success) {
        setActionError(result.error ?? "The payout outcome could not be recorded.");
        return;
      }
      setConfirm(null);
      setFailureReason("");
      await loadQueue();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "The payout outcome could not be recorded.",
      );
    } finally {
      setActionId(null);
    }
  }, [confirm, failureReason, loadQueue]);
  const filtered = tab === "all" ? payouts : payouts.filter((p) => p.status === tab);
  return (
    <div className="min-h-screen bg-[#f6f8fb] text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-slate-200 bg-white px-3 py-4 md:flex">
        <AdminNav onNavigate={() => setMobileOpen(false)} />
      </aside>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        inert={!mobileOpen}
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white px-3 py-4 transition-transform duration-200 md:hidden ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="absolute right-3 top-3 rounded-md p-1.5 text-slate-500"
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>
        <AdminNav onNavigate={() => setMobileOpen(false)} />
      </aside>
      <main className="md:pl-56">
        <header className="sticky top-0 z-20 flex h-14 items-center border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-slate-600 md:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="ml-2 md:ml-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">
              Operations
            </p>
            <h1 className="text-sm font-bold text-slate-950">Payouts</h1>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Bell className="h-4 w-4 text-slate-500" />
            <span className="hidden text-xs font-semibold text-slate-600 sm:inline">Ledger</span>
          </div>
        </header>

        <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-5 xl:p-6">
          {checking ? (
            <div className="flex min-h-[35vh] items-center justify-center gap-2 text-[13px] text-slate-500">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Loading payouts…
            </div>
          ) : error ? (
            <div
              role="alert"
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_4px_16px_rgba(15,23,42,0.035)]"
            >
              <h2 className="text-sm font-bold">Payouts unavailable</h2>
              <p className="mt-2 text-[13px] text-slate-600">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-3 rounded-md bg-blue-700 px-3 py-1.5 text-[13px] font-semibold text-white"
              >
                Retry
              </button>
            </div>
          ) : (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_4px_16px_rgba(15,23,42,0.035)]">
              <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
                <CreditCard className="h-4 w-4 text-slate-400" />
                <h2 className="text-sm font-bold text-slate-950">Provider payout queue</h2>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  {filtered.length} shown
                </span>
                <button
                  type="button"
                  onClick={() => void loadQueue()}
                  disabled={loadingQueue}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-600 disabled:opacity-50"
                >
                  <RefreshCw
                    className={loadingQueue ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"}
                  />
                  Reload
                </button>
              </header>
              <div className="space-y-3 px-4 py-4 text-[13px] leading-relaxed text-slate-600">
                <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-blue-800">
                  <Info className="h-4 w-4 shrink-0" />
                  <p>
                    <span className="font-semibold">
                      “Paid out” means an administrator recorded an external/manual disbursement.
                    </span>{" "}
                    The app does not send money through MarzPay (collection-only). Admin enforcement
                    lives in the database RPCs, not in these buttons.
                  </p>
                </div>
                {loadingQueue ? (
                  <div
                    role="status"
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-slate-500"
                  >
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Loading payout queue…
                  </div>
                ) : queueError ? (
                  <div
                    role="alert"
                    className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-amber-800"
                  >
                    <p className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      {queueError}
                    </p>
                    {notDeployed ? (
                      <p className="text-[12px]">
                        Ledger status:{" "}
                        <span className="font-mono font-semibold">
                          {PAYOUT_LEDGER_NOT_DEPLOYED}
                        </span>{" "}
                        — the migration has not been applied, so no payout records exist yet and
                        none are invented here.
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void loadQueue()}
                      className="rounded-md bg-blue-700 px-3 py-1.5 text-[13px] font-semibold text-white"
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <div
                    role="tablist"
                    aria-label="Payout status filter"
                    className="flex flex-wrap gap-1.5"
                  >
                    {STATUS_TABS.map((t) => (
                      <button
                        key={t.key}
                        role="tab"
                        aria-selected={tab === t.key}
                        type="button"
                        onClick={() => setTab(t.key)}
                        className={
                          tab === t.key
                            ? "rounded-full bg-slate-900 px-3 py-1 text-[12px] font-semibold text-white"
                            : "rounded-full border border-slate-200 bg-white px-3 py-1 text-[12px] font-semibold text-slate-600"
                        }
                      >
                        {t.label}
                        {t.key === "all" ? ` (${payouts.length})` : ""}
                      </button>
                    ))}
                  </div>
                )}
                {loadingQueue ? null : queueError ? null : filtered.length === 0 ? (
                  <div
                    role="status"
                    className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-slate-500"
                  >
                    <Wallet className="h-4 w-4 shrink-0" />
                    {payouts.length === 0
                      ? "No payouts found in the ledger yet."
                      : `No ${tab.replace("_", " ")} payouts to show.`}
                  </div>
                ) : null}
                {!loadingQueue && !queueError && filtered.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full min-w-[1120px] text-left text-[12px]">
                      <caption className="sr-only">Provider payout ledger records</caption>
                      <thead className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        <tr>
                          {[
                            "Provider",
                            "Booking / payment",
                            "Snapshotted amount",
                            "Destination phone",
                            "Status",
                            "Created / updated",
                            "Actions",
                          ].map((label) => (
                            <th key={label} scope="col" className="px-3 py-2.5">
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filtered.map((payout) => (
                          <tr key={payout.id} className="align-top text-slate-700">
                            <td className="px-3 py-3">
                              <span className="block font-semibold text-slate-900">
                                Provider ID
                              </span>
                              <span className="block max-w-40 break-all font-mono text-[10px] text-slate-500">
                                {payout.provider_id}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <span className="block">
                                Booking:{" "}
                                <span className="font-mono text-[10px]">{payout.booking_id}</span>
                              </span>
                              <span className="mt-1 block">
                                Payment:{" "}
                                <span className="font-mono text-[10px]">{payout.payment_id}</span>
                              </span>
                            </td>
                            <td className="px-3 py-3 font-semibold tabular-nums text-slate-900">
                              {payout.amount.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td className="px-3 py-3 font-mono">{payout.destination_phone}</td>
                            <td className="px-3 py-3">
                              <span
                                className={`inline-block rounded-md border px-2 py-1 font-semibold ${statusBadge(payout.status)}`}
                              >
                                {payout.status.replace("_", " ")}
                              </span>
                              {payout.failure_reason ? (
                                <p className="mt-1 max-w-48 break-words text-[11px] text-red-700">
                                  {payout.failure_reason}
                                </p>
                              ) : null}
                            </td>
                            <td className="px-3 py-3 tabular-nums">
                              <span className="block">
                                Created: {formatTimestamp(payout.created_at)}
                              </span>
                              <span className="mt-1 block">
                                Updated: {formatTimestamp(payout.updated_at)}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              {payout.status === "queued" ? (
                                <div className="flex min-w-36 flex-col items-start gap-1.5">
                                  <button
                                    type="button"
                                    disabled={actionId !== null || loadingQueue}
                                    onClick={() => {
                                      setConfirm({ id: payout.id, outcome: "paid_out" });
                                      setActionError(null);
                                      setFailureReason("");
                                    }}
                                    className="rounded-md bg-emerald-700 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                                  >
                                    Record paid out
                                  </button>
                                  <button
                                    type="button"
                                    disabled={actionId !== null || loadingQueue}
                                    onClick={() => {
                                      setConfirm({ id: payout.id, outcome: "failed" });
                                      setActionError(null);
                                      setFailureReason("");
                                    }}
                                    className="rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-red-700 disabled:opacity-50"
                                  >
                                    Record failed
                                  </button>
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            </section>
          )}
        </div>
      </main>
      {confirm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payout-confirm-title"
        >
          <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <h2 id="payout-confirm-title" className="text-sm font-bold text-slate-950">
              Confirm payout outcome
            </h2>
            <p className="mt-2 text-[13px] text-slate-600">
              {confirm.outcome === "paid_out"
                ? "Record this payout as paid out? This records that an administrator made an external/manual disbursement; the app will not send money through MarzPay."
                : "Record this queued payout as failed? This does not initiate or reverse a payment."}
            </p>
            {confirm.outcome === "failed" ? (
              <label className="mt-3 block text-[12px] font-semibold text-slate-700">
                Failure reason <span className="text-red-700">(required)</span>
                <textarea
                  value={failureReason}
                  onChange={(event) => setFailureReason(event.target.value)}
                  rows={3}
                  maxLength={1000}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-[13px] font-normal outline-none focus:border-blue-400"
                />
              </label>
            ) : null}
            {actionError ? (
              <p
                role="alert"
                className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800"
              >
                {actionError}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={actionId !== null}
                onClick={() => {
                  setConfirm(null);
                  setFailureReason("");
                  setActionError(null);
                }}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-600 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  actionId !== null || (confirm.outcome === "failed" && !failureReason.trim())
                }
                onClick={() => void submitOutcome()}
                className="rounded-md bg-blue-700 px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
              >
                {actionId ? "Recording…" : "Confirm"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export const Route = createFileRoute("/admin/payouts")({
  head: () => ({ meta: [{ title: "Payouts | NINJAWO Admin" }] }),
  component: AdminPayouts,
});
