import { supabase } from "../supabase";

/**
 * PHASE 1C — Offline provider-payout ledger service (manual disbursement records).
 *
 * "Paid out" here means an administrator recorded an external/manual
 * disbursement in the ledger. The app does NOT send money through MarzPay
 * (collection-only via ninjawo-handler); no transfer/disbursement code exists.
 *
 * Contract comes from the LOCAL-ONLY migration
 * `db/migrations/20261019_phase3h1_provider_payout_ledger.sql`, which is NOT
 * applied to production. All calls below surface a typed
 * PAYOUT_LEDGER_NOT_DEPLOYED error when the tables/RPCs are absent, and the
 * UI renders the ledger as unavailable instead of inventing data.
 */

export type PayoutStatus = "queued" | "paid_out" | "failed";

export interface ProviderPayout {
  id: string;
  payment_id: string;
  booking_id: string;
  provider_id: string;
  amount: number;
  destination_phone: string;
  status: PayoutStatus;
  gateway_ref: string | null;
  requested_by: string | null;
  recorded_by: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayoutOutcomeResult {
  success: boolean;
  payout_id?: string;
  status?: PayoutStatus;
  error?: string;
}

export const PAYOUT_LEDGER_NOT_DEPLOYED = "PAYOUT_LEDGER_NOT_DEPLOYED" as const;

/** True when a Supabase error means the ledger tables/RPCs do not exist yet. */
export function isLedgerNotDeployedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message.toLowerCase() : "";
  // Postgres: 42P01 undefined_table, 42883 undefined_function.
  if (code === "42P01" || code === "42883") return true;
  return (
    message.includes("provider_payouts") &&
    (message.includes("does not exist") ||
      message.includes("relation") ||
      message.includes("function"))
  );
}

function ledgerUnavailable(): PayoutOutcomeResult {
  return {
    success: false,
    error: `${PAYOUT_LEDGER_NOT_DEPLOYED}: the offline payout ledger migration has not been applied; no payout records exist yet.`,
  };
}

export async function listProviderPayouts(): Promise<{
  payouts: ProviderPayout[] | null;
  error: string | null;
  notDeployed: boolean;
}> {
  try {
    const { data, error } = await supabase
      .from("provider_payouts")
      .select(
        "id,payment_id,booking_id,provider_id,amount,destination_phone,status,gateway_ref,requested_by,recorded_by,failure_reason,created_at,updated_at",
      )
      .order("created_at", { ascending: false });
    if (error) {
      if (isLedgerNotDeployedError(error)) {
        return { payouts: null, error: ledgerUnavailable().error!, notDeployed: true };
      }
      throw error;
    }
    return { payouts: (data ?? []) as ProviderPayout[], error: null, notDeployed: false };
  } catch (error) {
    if (isLedgerNotDeployedError(error)) {
      return { payouts: null, error: ledgerUnavailable().error!, notDeployed: true };
    }
    return {
      payouts: null,
      error: error instanceof Error ? error.message : "The payout queue could not load.",
      notDeployed: false,
    };
  }
}

export async function recordPayoutOutcome(
  payoutId: string,
  outcome: "paid_out" | "failed",
  failureReason?: string,
): Promise<PayoutOutcomeResult> {
  if (!payoutId) return { success: false, error: "A payout record is required." };
  if (outcome === "failed" && !(failureReason ?? "").trim()) {
    return { success: false, error: "A failure reason is required to record a failed payout." };
  }
  try {
    const { data, error } = await supabase.rpc("record_provider_payout_outcome", {
      p_payout_id: payoutId,
      p_outcome: outcome,
      p_failure_reason: outcome === "failed" ? (failureReason ?? "").trim() : null,
    });
    if (error) {
      if (isLedgerNotDeployedError(error)) return ledgerUnavailable();
      throw error;
    }
    const result = data as PayoutOutcomeResult | null;
    if (result && result.success === false) return result;
    return { success: true, payout_id: payoutId, status: outcome };
  } catch (error) {
    if (isLedgerNotDeployedError(error)) return ledgerUnavailable();
    return {
      success: false,
      error: error instanceof Error ? error.message : "The payout outcome could not be recorded.",
    };
  }
}
