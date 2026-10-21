import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const service = fs.readFileSync(path.join(root, "src/lib/services/payouts.service.ts"), "utf8");
const page = fs.readFileSync(path.join(root, "src/routes/admin.payouts.tsx"), "utf8");
const finance = fs.readFileSync(path.join(root, "src/routes/admin.finance.tsx"), "utf8");

test("payouts service exposes the offline-ledger contract without mocks", () => {
  assert.match(service, /listProviderPayouts/);
  assert.match(service, /recordPayoutOutcome/);
  assert.match(service, /PAYOUT_LEDGER_NOT_DEPLOYED/);
  assert.match(service, /isLedgerNotDeployedError/);
  assert.match(service, /provider_payouts/);
  assert.match(service, /record_provider_payout_outcome/);
  assert.match(service, /failure reason is required/i);
  assert.doesNotMatch(service, /MOCK|fixture|seed\(|fake-uuid/i);
});

test("payouts page states manual recording explicitly and covers queue states", () => {
  assert.match(page, /Provider payout queue/);
  assert.match(page, /recorded an external/);
  assert.match(page, /does not send money/i);
  assert.match(page, /paid_out/);
  assert.match(page, /failure reason/i);
  assert.match(page, /Loading payout queue/);
  assert.match(page, /No payouts found/);
  assert.match(page, /role !== "admin"/);
});

test("payouts page renders ledger rows and confirms queued outcomes", () => {
  assert.match(page, /filtered\.map\(\(payout\)/);
  assert.match(page, /payout\.provider_id/);
  assert.match(page, /payout\.booking_id/);
  assert.match(page, /payout\.payment_id/);
  assert.match(page, /payout\.destination_phone/);
  assert.match(page, /payout\.created_at/);
  assert.match(page, /payout\.updated_at/);
  assert.match(page, /Record paid out/);
  assert.match(page, /Record failed/);
  assert.match(page, /aria-modal="true"/);
  assert.match(page, /Failure reason.*required/);
});

test("finance page links to the payout queue without changing finance logic", () => {
  assert.match(finance, /\/admin\/payouts/);
  assert.match(finance, /getFinanceForAdmin/);
});
