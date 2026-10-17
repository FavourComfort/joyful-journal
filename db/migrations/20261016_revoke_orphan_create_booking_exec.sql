-- ============================================================
-- NINJAWO Phase 3F.2A - Contain orphan create_booking overload
-- File: db/migrations/20261016_revoke_orphan_create_booking_exec.sql
-- ============================================================
-- Purpose
-- -------
--   Revoke EXECUTE on the orphan overload A of
--   public.create_booking_with_escrow_payment confirmed by the
--   Phase 3F.2 read-only audit to be:
--     * unpinned            (proconfig IS NULL),
--     * PUBLIC + anon executable (explicit =X, anon=X, authenticated=X),
--     * never checking auth.uid() while trusting p_customer_id,
--     * SECURITY DEFINER as postgres INSERTing into
--       public.bookings + public.payments (RLS bypass).
--
--   This migration contains the exposure ONLY. It does NOT drop
--   the function, does NOT alter its body or search_path, and
--   does NOT touch any other overload or table permission.
--
-- TARGET - exact identity signature (9 args; NO p_end_time,
-- NO p_service_fee; p_total_amount BEFORE p_start_time):
--
--   public.create_booking_with_escrow_payment(
--     p_customer_id uuid, p_provider_id uuid, p_service_id uuid,
--     p_booking_date date, p_total_amount numeric,
--     p_start_time time, p_currency text,
--     p_transaction_ref text, p_payment_method text)
--
-- NOT TARGETED (reconfirmed read-only immediately before writing
-- this file; both remain untouched by the statements below):
--
--   B (production-only, pinned, in-body auth.uid() check):
--     (uuid, uuid, uuid, date, time, time, numeric, text, text, text)
--   C (frontend caller overload, pinned, in-body auth.uid() check):
--     (uuid, uuid, uuid, date, time, numeric, numeric, text, text, text)
--     - src/lib/services/payments.service.ts:54-68 sends
--       p_service_fee, which ONLY C accepts, so the app's named-arg
--       call can never resolve to A or B.
--
-- PRE-CHANGE ACL of A (recorded read-only 2026-10-16):
--
--   {=X/postgres,postgres=X/postgres,anon=X/postgres,
--     authenticated=X/postgres,service_role=X/postgres}
--
--   The PUBLIC, anon, and authenticated entries are EXPLICIT in
--   proacl (grantor postgres), so one REVOKE naming all three
--   removes exactly those entries. postgres and service_role
--   entries are not named below and are therefore preserved.
--
-- ROLLBACK (exact reverse GRANTs + snapshot + verification):
--   db/migrations/20261016_phase3f2a_ROLLOUT.md (companion note).
--   Requires execution as owner `postgres` to reproduce
--   grantor=postgres byte-exactly.
--
-- Schema-cache reload: the repository has NO established reload
-- statement (verified: zero matches for "reload schema" or
-- "NOTIFY pgrst" across 264 files), so the Supabase-documented
-- form is used inside the transaction; NOTIFY is delivered on
-- COMMIT only, so an aborted transaction leaves the cache in
-- sync with the unapplied state.
--
-- Convention match: file-internal BEGIN/COMMIT, exactly like
-- db/migrations/20251016_restore_missing_rpcs.sql (applied as
-- 20261016182112_restore_missing_rpcs in production).
-- ============================================================

BEGIN;

REVOKE EXECUTE ON FUNCTION public.create_booking_with_escrow_payment(
  uuid, uuid, uuid, date, numeric, time, text, text, text
) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
