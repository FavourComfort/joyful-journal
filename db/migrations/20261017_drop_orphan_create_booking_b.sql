-- ============================================================
-- NINJAWO Phase 3F.6 - Drop orphan create_booking overload B
-- File: db/migrations/20261017_drop_orphan_create_booking_b.sql
-- ============================================================
-- Purpose
-- -------
--   Permanently remove overload B of
--   public.create_booking_with_escrow_payment: proven dead by
--   the Phase 3F.5 read-only investigation review:
--     * no programmatic dependents (pg_depend EMPTY),
--     * no live code invokes it — src/lib/services/payments.service.ts
--       sends p_service_fee, which ONLY overload C accepts,
--     * production calls (5, via PostgREST role authenticated)
--       created zero bookings attributable to B (0 rows in
--       public.bookings correlate to B's call window); the
--       pg_stat_statements view confirms call count and timing
--       but does not capture the returned JSON payload, so the
--       exact error JSON content is not independently verified
--       by that view alone; B's signature lacks p_service_fee
--       and instead takes p_end_time, so it cannot resolve
--       the app's RPC call,
--     * EXECUTE granted to anon/authenticated/service_role/postgres,
--       SECURITY DEFINER as postgres INSERTing into public.bookings +
--       public.payments (RLS bypass) — an authenticated caller could
--       create non-escrowed bookings through B if it were reachable,
--     * dead attack surface: not referenced by any application code,
--       no pg_depend rows, not part of the current booking flow.
--
--   This migration drops ONLY overload B. It does not touch
--   overloads A (already dropped) or C, any table, or any permission.
--
-- TARGET - exact identity signature (10 args; two time params,
-- numeric after the times, NO p_service_fee):
--
--   public.create_booking_with_escrow_payment(
--     p_customer_id uuid, p_provider_id uuid, p_service_id uuid,
--     p_booking_date date, p_start_time time without time zone,
--     p_end_time time without time zone, p_total_amount numeric,
--     p_currency text, p_transaction_ref text,
--     p_payment_method text)
--
--   Written below with the explicit type name, as
--   pg_get_function_identity_arguments renders it and as the
--   Phase 3F.5 task states it:
--     (uuid, uuid, uuid, date, time without time zone,
--      time without time zone, numeric, text, text, text)
--   "time" is shorthand for "time without time zone"; both forms
--   resolve to the same type and match exactly one function.
--   Cross-checked against the Phase 3F.5 report.
--
-- NOT TARGETED (identity-distinguishing; the DROP cannot match):
--
--   A: (uuid, uuid, uuid, date, numeric, time, text, text, text) —
--       already dropped by 20261017_drop_orphan_create_booking_a.sql.
--   C: (uuid, uuid, uuid, date, time without time zone, numeric,
--       numeric, text, text, text)
--       - src/lib/services/payments.service.ts:54-68 sends p_service_fee,
--         which ONLY C accepts; the app call keeps resolving to C
--         after B is dropped. C must remain intact.
--
-- DEPENDENCY SAFETY:
--
--   RESTRICT is explicit; the cascade option is never used in the
--   statement below. If ANY dependency on B exists at apply time,
--   the DROP errors and the whole transaction rolls back. Phase
--   3F.5 verified pg_depend on B EMPTY in production, so success
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
--       uuid,uuid,uuid,date,time without time zone,time without time zone,
--       numeric,text,text,text)'::regprocedure);
--
--   Save the output as the restore script; DROP is not reversible
--   without it.
--
-- Schema-cache reload: NOTIFY delivers on COMMIT only, so an
-- aborted transaction leaves the cache in sync with the unapplied
-- state.
--
-- Convention match: file-internal BEGIN/COMMIT, exactly like
-- db/migrations/20261017_drop_orphan_create_booking_a.sql and
-- db/migrations/20251016_restore_missing_rpcs.sql.
-- Apply as role postgres (owns the function).
-- ============================================================

BEGIN;

DROP FUNCTION public.create_booking_with_escrow_payment(
  uuid, uuid, uuid, date, time without time zone, time without time zone,
  numeric, text, text, text
) RESTRICT;

NOTIFY pgrst, 'reload schema';

COMMIT;