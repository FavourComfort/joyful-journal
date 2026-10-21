-- ============================================================================
-- Phase 3G.3A — SECURITY DEFINER Grant Hardening: revoke anon EXECUTE
-- ============================================================================
-- Purpose: Remove EXECUTE privilege from the `anon` role on SECURITY DEFINER
--          functions that do not require anonymous access. All callers are
--          authenticated frontend/session users; no legitimate anonymous
--          invocation path exists.
--
-- Scope:  9 of 11 SECURITY DEFINER functions in the `public` schema.
--
-- What this migration DOES:
--   • REVOKE EXECUTE FROM anon on exactly 9 verified function signatures.
--   • Preserves grants for authenticated, service_role, postgres, and PUBLIC.
--   • Does not alter function bodies, search paths, tables, RLS, policies,
--     or Edge Functions.
--   • Does not change close_dispute search_path (assessed separately).
--
-- What this migration does NOT do:
--   • Does not GRANT anything (only revokes from anon).
--   • Does not touch the 2 functions that already lack anon EXECUTE:
--       - public.admin_delete_review(uuid)
--       - public.close_dispute(uuid, text)
--   • Does not alter internal authorization logic (each function re-checks
--     auth.uid() or is_admin_user() inside its body).
--
-- Evidence (verified against live production catalog):
--   • All 11 functions are SECURITY DEFINER, owner = postgres.
--   • 9 functions have direct `anon=X/postgres` EXECUTE in pg_proc.proacl.
--   • has_function_privilege('anon', oid, 'EXECUTE') = true for all 9.
--   • auth_members: anon is a parent role; authenticator does NOT inherit
--     from anon; postgres inherits from anon (irrelevant to anon's direct grant).
--   • All 11 are invoked via supabase.rpc() from frontend services with an
--     authenticated Supabase client (no anonymous call path).
--
-- Rollback: Re-grant EXECUTE TO anon on the same signatures if needed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. adjudicate_dispute — admin-only via is_admin_user() internally
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.adjudicate_dispute(uuid, text, text) FROM anon;

-- ---------------------------------------------------------------------------
-- 2. admin_set_provider_verified — admin-only via is_admin_user() internally
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.admin_set_provider_verified(uuid, boolean) FROM anon;

-- ---------------------------------------------------------------------------
-- 3. cancel_booking_and_refund — customer/provider ownership check internally
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.cancel_booking_and_refund(uuid, text, text) FROM anon;

-- ---------------------------------------------------------------------------
-- 4. create_booking_with_escrow_payment (Overload C, 10 args) —
--    p_customer_id = auth.uid() check internally
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.create_booking_with_escrow_payment(
    uuid, uuid, uuid, date, time without time zone, numeric, numeric, text, text, text
) FROM anon;

-- ---------------------------------------------------------------------------
-- 5. is_admin_user — no writes, but no legitimate anonymous invocation path
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.is_admin_user() FROM anon;

-- ---------------------------------------------------------------------------
-- 6. provider_update_booking_status — provider-of-booking check internally
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.provider_update_booking_status(uuid, text) FROM anon;

-- ---------------------------------------------------------------------------
-- 7. raise_dispute — customer ownership check internally
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.raise_dispute(uuid, text, text) FROM anon;

-- ---------------------------------------------------------------------------
-- 8. release_escrow_to_provider — customer ownership check internally
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.release_escrow_to_provider(uuid) FROM anon;

-- ---------------------------------------------------------------------------
-- 9. respond_to_dispute — provider assignment check internally
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.respond_to_dispute(uuid, text) FROM anon;

-- ============================================================================
-- VERIFICATION (run after applying — read-only)
-- ============================================================================
-- Confirm anon no longer has EXECUTE on the 9 revoked functions:
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND p.proname IN (
    'adjudicate_dispute',
    'admin_set_provider_verified',
    'cancel_booking_and_refund',
    'create_booking_with_escrow_payment',
    'is_admin_user',
    'provider_update_booking_status',
    'raise_dispute',
    'release_escrow_to_provider',
    'respond_to_dispute'
  )
ORDER BY p.proname;

-- Confirm the 2 already-clean functions still have no anon EXECUTE:
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND p.proname IN ('admin_delete_review', 'close_dispute')
ORDER BY p.proname;

-- Confirm grants for non-anon roles are unchanged:
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  p.proacl AS current_acl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND p.proname IN (
    'adjudicate_dispute',
    'admin_set_provider_verified',
    'cancel_booking_and_refund',
    'create_booking_with_escrow_payment',
    'is_admin_user',
    'provider_update_booking_status',
    'raise_dispute',
    'release_escrow_to_provider',
    'respond_to_dispute'
  )
ORDER BY p.proname;

