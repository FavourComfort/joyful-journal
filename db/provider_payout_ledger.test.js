/**
 * Phase 3H.1 — Provider payout ledger (offline, local-only) static tests.
 *
 * These are STATIC tests: they assert on the migration file text, following
 * the convention of db/escrow_flow.test.js. They run with plain
 * `node --test` and need no database.
 *
 * They do NOT prove RLS, constraints, or RPC permissions against
 * PostgreSQL. Live verification (Step 9 below) must run against a
 * Supabase branch / local stack before any production review.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve('.');
const migrationPath = path.join(
  projectRoot,
  'db/migrations/20261019_phase3h1_provider_payout_ledger.sql'
);
const migration = fs.readFileSync(migrationPath, 'utf8');

test('destination table exists with provider self-verify guard', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.provider_payout_destinations/);
  assert.match(migration, /phone ~ '\^\\\+\?\[0-9\]\{7,15\}\$'/);
  // Setter always resets verified=false: provider can never self-verify.
  assert.match(
    migration,
    /ON CONFLICT \(provider_id\) DO UPDATE[\s\S]*?verified = false/
  );
  // Verification audit columns exist and are consistency-checked.
  assert.match(migration, /verified_by uuid NULL[\s\S]*?verified_at timestamptz NULL/);
});

test('payout ledger table has identity, uniqueness, and status controls', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.provider_payouts/);
  // (1) released payment can be queued exactly once.
  assert.match(migration, /payment_id uuid NOT NULL UNIQUE/);
  // (8) amount snapshotted from provider_amount (see queue RPC); never negative.
  assert.match(migration, /amount numeric\(12,2\) NOT NULL[\s\S]*?CHECK \(amount >= 0\)/);
  assert.match(migration, /destination_phone text NOT NULL/);
  assert.match(migration, /status IN \('queued', 'paid_out', 'failed'\)/);
  assert.match(migration, /gateway_ref text NULL/);
  assert.match(migration, /requested_by uuid NULL/);
  assert.match(migration, /recorded_by uuid NULL/);
});

test('queue RPC admits only released payments with verified destinations', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.queue_provider_payout\(/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /SET search_path = public/);
  // (3) pending/escrowed/refunded/disputed rejected.
  assert.match(migration, /IF v_status <> 'released' THEN/);
  // (4) missing/unverified destination blocks queueing.
  assert.match(migration, /Verified payout destination required/);
  // Caller must be owning provider or admin.
  assert.match(migration, /Not authorized for this payment/);
  // (2) second queue attempt returns a clean error (unique violation caught).
  assert.match(migration, /Payout already queued for this payment/);
  // Amount comes from the payment row, not the caller.
  assert.match(migration, /pay\.provider_amount/);
});

test('outcome RPC is admin-only and one-way', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.record_provider_payout_outcome\(/);
  // (5) providers cannot mark payouts paid/failed; (7) only admins can.
  assert.match(migration, /IF NOT public\.is_admin_user\(\) THEN/);
  assert.match(migration, /Admin access required/);
  assert.match(migration, /Outcome must be paid_out or failed/);
  assert.match(migration, /Only queued payouts can be resolved/);
});

test('RLS denies direct writes and anon reads', () => {
  // (6) anonymous callers cannot read other providers' records.
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(
    migration,
    /Provider payouts select own or admin[\s\S]*?public\.is_admin_user\(\)/
  );
  assert.match(migration, /Provider payouts no direct insert/);
  assert.match(migration, /Provider payouts no direct update/);
  assert.match(migration, /Provider payouts no direct delete/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.provider_payouts FROM anon, authenticated/);
  assert.match(migration, /GRANT SELECT ON TABLE public\.provider_payouts TO authenticated/);
});

test('consistency trigger rejects mismatched and unreleased payments', () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.validate_provider_payout_consistency\(\)/
  );
  assert.match(migration, /payout booking does not match payment booking/);
  assert.match(migration, /payout provider does not match payment provider/);
  assert.match(migration, /payment is not released/);
  assert.match(
    migration,
    /CREATE TRIGGER trg_validate_provider_payout_consistency[\s\S]*?BEFORE INSERT ON public\.provider_payouts/
  );
});

test('protected escrow/webhook surfaces are not redefined', () => {
  // The migration header may *mention* these names as "do not modify";
  // the real guard is that it never CREATEs or ALTERs them.
  assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\.release_escrow_to_provider/);
  assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\.cancel_booking_and_refund/);
  assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\.adjudicate_dispute/);
  assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\.close_dispute/);
  assert.doesNotMatch(migration, /ALTER FUNCTION public\.release_escrow_to_provider/);
  assert.doesNotMatch(migration, /ALTER FUNCTION public\.cancel_booking_and_refund/);
  assert.doesNotMatch(migration, /ALTER FUNCTION public\.adjudicate_dispute/);
  assert.doesNotMatch(migration, /ALTER FUNCTION public\.close_dispute/);
  assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\.create_booking_with_escrow_payment/);
});
