-- ============================================================
-- NINJAWO Phase 3F.4 - Drop orphan create_booking overload A
-- File: db/migrations/20261017_drop_orphan_create_booking_a.sql
-- ============================================================
-- Purpose
-- -------
--   Permanently remove overload A of
--   public.create_booking_with_escrow_payment: contained by
--   Phase 3F.2A (EXECUTE revoked 2026-10-16) and proven dead by
--   the Phase 3F.3 read-only provenance review:
--     * created 2026-09-08 19:00:19 UTC by out-of-band SQL-editor
--       paste (body exists in NO git commit; args hand-reordered),
--     * unpinned (proconfig IS NULL),
--     * never checks auth.uid() while trusting p_customer_id,
--     * SECURITY DEFINER as postgres INSERTing into
--       public.bookings + public.payments (RLS bypass),
--     * zero programmatic dependents (pg_depend EMPTY; no views,
--       no prosrc references, no Edge Function references),
--     * zero calls since the revoke; all 29 bookings attributed
--       (B=0, A=10, C=19) - dropping A changes no rows.
--
--   This migration drops ONLY overload A. It does not touch
--   overloads B or C, any table, or any permission.
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
--   Written below with the explicit type name, as
--   pg_get_function_identity_arguments renders it and as the
--   Phase 3F.4 task states it:
--     (uuid, uuid, uuid, date, numeric, time without time zone,
--      text, text, text)
--   "time" is shorthand for "time without time zone"; both forms
--   resolve to the same type and match exactly one function.
--   Three local sources cross-checked and in agreement:
--     * 20261017_phase3f3_provenance_report.md (Parts 2 and 6),
--     * 20261016_revoke_orphan_create_booking_exec.sql (TARGET
--       block, lines 20-27 and the REVOKE statement),
--     * the task statement for Phase 3F.4.
--
-- NOT TARGETED (identity-distinguishing; the DROP cannot match):
--
--   B: (uuid, uuid, uuid, date, time, time, numeric, text, text, text)
--   C: (uuid, uuid, uuid, date, time, numeric, numeric, text, text, text)
--     - src/lib/services/payments.service.ts:54-68 sends
--       p_service_fee, which ONLY C accepts; the app call keeps
--       resolving to C after A is dropped.
--
-- DEPENDENCY SAFETY:
--
--   RESTRICT is explicit; the cascade option is never used in the
--   statement below. If ANY dependency on A exists at apply time,
--   the DROP errors and the whole transaction rolls back. Phase
--   3F.3 verified pg_depend on A EMPTY in production, so success
--   is expected; a surprise dependency fails safely.
--
--   No IF EXISTS: a signature typo or an already-absent function
--   must fail loudly rather than silently no-op. The first run is
--   the verification.
--
-- ROLLBACK (capture BEFORE applying, as owner postgres):
--
--   SELECT pg_get_functiondef(
--     'public.create_booking_with_escrow_payment(
--       uuid,uuid,uuid,date,numeric,time,text,text,text)'::regprocedure);
--
--   Save the output (expected body md5 7340ddce..., 2845 chars per
--   Phase 3F.3) as the restore script. The body exists in no git
--   commit, so this snapshot is the only restore source; DROP is
--   not reversible without it.
--
-- Schema-cache reload: same Supabase-documented form as the
-- 3F.2A containment migration; NOTIFY delivers on COMMIT only,
-- so an aborted transaction leaves the cache in sync with the
-- unapplied state.
--
-- Convention match: file-internal BEGIN/COMMIT, exactly like
-- db/migrations/20251016_restore_missing_rpcs.sql and
-- db/migrations/20261016_revoke_orphan_create_booking_exec.sql.
-- Apply as role postgres (owns the function).
-- ============================================================

BEGIN;

DROP FUNCTION public.create_booking_with_escrow_payment(
  uuid, uuid, uuid, date, numeric, time without time zone, text, text, text
) RESTRICT;

NOTIFY pgrst, 'reload schema';

COMMIT;
