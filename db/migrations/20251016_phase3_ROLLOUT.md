# Phase 3 rollout — RLS hardening (REVIEW ONLY, do not apply yet)

## Pre-apply snapshot (branch/preview, read-only)
```sql
SELECT tablename, policyname, cmd, roles FROM pg_policies
WHERE schemaname='public' ORDER BY 1,2;
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public' AND grantee IN ('anon','authenticated');
SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
JOIN pg_namespace ON pg_namespace.oid=relnamespace
WHERE nspname='public' AND relkind='r' ORDER BY 1;
```

## Apply order (staging/branch first)
1. `supabase db diff` review against this file.
2. Apply `db/migrations/20251016_phase3_rls_hardening.sql` in a transaction
   (file is wrapped in BEGIN/COMMIT).
3. Run `db/rls/phase3_access.test.js` (static) + the staging access matrix
   below with anon / customer / provider / admin keys.

## Staging access matrix (expected)
- anon: SELECT verified providers + active services ONLY; all else denied.
- customer A: own profile/bookings/payments/disputes/messages/notifications;
  denied on customer B rows; cannot UPDATE bookings/payments directly
  (restrictive policies) - must use RPCs.
- provider P: own provider row/services/bookings/payments; cannot touch
  provider Q rows; completion-request create only for own confirmed/
  in_progress bookings.
- admin: full SELECT directories incl. payments/services/notifications;
  moderation DELETEs per policy; writes to bookings/payments only via RPCs.
- payment transitions: pending->escrowed->released|refunded|disputed via
  RPC/webhook only; direct UPDATE rejected.

## Rollback
Transactional - any error aborts. After COMMIT, restore the snapshot from
the pre-apply queries above.
