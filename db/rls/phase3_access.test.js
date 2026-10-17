/**
 * Phase 3 static validation: RLS hardening migration.
 * No DB connection. Checks the migration file contains the required
 * grants, RLS enables, corrected policies, restrictive denies, anon RPC
 * revokes, and preserved access paths. Run: node --test db/rls/phase3_access.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1').replace(/%20/g, ' ');
// db/rls/ -> db/migrations/ (same db dir regardless of cwd)
const MIG = fs.readFileSync(path.join(HERE, '..', 'migrations', '20251016_phase3_rls_hardening.sql'), 'utf8');

const TABLES = ['profiles','providers','services','availability','bookings',
  'reviews','payments','requests','offers','messages','request_notifications',
  'notifications','completion_requests','disputes'];

test('all 14 tables: revoke + RLS enable', () => {
  assert.match(MIG, /REVOKE ALL ON TABLE/, 'must revoke least-privilege');
  for (const t of TABLES)
    assert.match(MIG, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`),
      `${t} must have RLS enabled with policies`);
});

test('anon limited to provider/service discovery', () => {
  assert.match(MIG, /GRANT SELECT ON TABLE public\.providers TO anon/,
    'anon providers grant');
  assert.match(MIG, /GRANT SELECT ON TABLE public\.services TO anon/,
    'anon services grant');
  assert.match(MIG, /CREATE POLICY "Providers select public verified"/, 'verified discovery');
  assert.match(MIG, /CREATE POLICY "Services select public active"/, 'active discovery');
});

test('bookings provider-ownership fix (no auth.uid()=provider_id)', () => {
  const sec = MIG.split('5. BOOKINGS')[1].split('6. PAYMENTS')[0];
  assert.match(sec, /p\.id = bookings\.provider_id AND p\.user_id = auth\.uid\(\)/,
    'provider-owner subquery');
  assert.doesNotMatch(sec, /auth\.uid\(\) = provider_id/, 'dead UUID comparison removed');
});

test('completion_requests ownership tautology fixed', () => {
  assert.match(MIG, /b\.provider_id = completion_requests\.provider_id/,
    'booking must link to the NEW provider_id');
  assert.doesNotMatch(MIG, /WHERE b\.id = completion_requests\.booking_id[\s\S]{0,200}?b\.provider_id = b\.provider_id/,
    'tautology removed from policy body');
});

test('disputes insert fixed (no self-comparison)', () => {
  assert.match(MIG, /b\.id = disputes\.booking_id/, 'qualified NEW booking ref');
  assert.match(MIG, /b\.provider_id = disputes\.provider_id/, 'qualified NEW provider ref');
  assert.doesNotMatch(MIG, /CREATE POLICY "Disputes insert by customer"[\s\S]{0,600}?d\.booking_id = d\.booking_id/,
    'self-comparison removed from policy body');
});

test('payments insert fixed (no tautology)', () => {
  assert.match(MIG, /b\.provider_id = payments\.provider_id/, 'qualified provider link');
  assert.doesNotMatch(MIG, /CREATE POLICY "Payments insert by customer"[\s\S]{0,600}?b\.provider_id = b\.provider_id/,
    'tautology removed from policy body');
});

test('deny policies are RESTRICTIVE (permissive false is a no-op)', () => {
  for (const name of ['Bookings no direct update','Bookings no direct delete',
    'Payments no direct update','Payments no direct delete',
    'Disputes no direct update','Disputes no direct delete'])
    assert.match(MIG, new RegExp(`CREATE POLICY "${name}"[\\s\\S]{0,120}?AS RESTRICTIVE`),
      `${name} must be RESTRICTIVE`);
});

test('reviews readable + customer insert preserved', () => {
  assert.match(MIG, /CREATE POLICY "Reviews select public"/, 'public read');
  assert.match(MIG, /CREATE POLICY "Reviews insert by booking customer"/, 'customer insert');
  assert.match(MIG, /b\.status = 'completed'/, 'completed-booking guard');
});

test('admin finance access preserved (payments/services/notifications)', () => {
  for (const p of ['Payments select for admin','Services select for admin',
    'Notifications select for admin'])
    assert.match(MIG, new RegExp(`CREATE POLICY "${p}"`), `${p} present`);
});

test('anon EXECUTE revoked on sensitive RPCs', () => {
  assert.match(MIG, /REVOKE ALL ON FUNCTION[\s\S]*?FROM anon, PUBLIC/,
    'anon revoke loop');
  assert.match(MIG, /GRANT EXECUTE ON FUNCTION[\s\S]*?TO authenticated/,
    'authenticated grant loop');
});

test('availability locked down (RLS on, no policies, no grants)', () => {
  const sec = MIG.split('14. AVAILABILITY')[1].split('15. FUNCTION')[0];
  assert.match(sec, /ENABLE ROW LEVEL SECURITY/, 'RLS on');
  assert.doesNotMatch(sec, /CREATE POLICY/, 'deny-all: no policies');
  assert.doesNotMatch(sec, /GRANT.*availability/i, 'no grants');
});

test('transactional with rollback note', () => {
  assert.match(MIG, /^BEGIN;/m, 'opens transaction');
  assert.match(MIG, /^COMMIT;/m, 'commits');
});

test('sensitive RPC grants use regprocedure signature (no raw arg interpolation)', () => {
  const section = MIG.indexOf('15. FUNCTION GRANTS');
  assert.ok(section !== -1, 'function grants section present');
  const doStart = MIG.indexOf('DO $$', section);
  const doEnd = MIG.indexOf('END $$;', doStart);
  assert.ok(doStart !== -1 && doEnd !== -1, 'function grant DO block found');
  const block = MIG.slice(doStart, doEnd);
  assert.doesNotMatch(block, /ON FUNCTION public\.%I\(/,
    'must not interpolate raw arguments into the function signature');
  assert.match(block, /::regprocedure/,
    'must cast function OID to regprocedure for an ON FUNCTION target');
});

console.log('\nPhase 3 static checks defined (staging matrix in ROLLOUT.md).\n');
