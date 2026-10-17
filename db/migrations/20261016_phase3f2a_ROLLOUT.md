# Phase 3F.2A — Orphan overload containment (REVIEW ONLY, do not apply yet)

Migration: `db/migrations/20261016_revoke_orphan_create_booking_exec.sql`

## Target (exact)

`public.create_booking_with_escrow_payment(uuid, uuid, uuid, date, numeric, time, text, text, text)`

The 9-argument overload (oid 35233 at investigation time — statements key on the
identity signature, never on oid): no `p_end_time`, no `p_service_fee`,
`p_total_amount` before `p_start_time`, `proconfig = NULL`,
PUBLIC+anon EXECUTE, no `auth.uid()` in body.

Explicitly NOT targeted:

- Frontend overload C `(uuid,uuid,uuid,date,time,numeric,numeric,text,text,text)` —
  caller `src/lib/services/payments.service.ts:54-68` sends `p_service_fee`,
  which only C accepts → named-arg resolution is unique to C.
- Orphan overload B `(uuid,uuid,uuid,date,time,time,numeric,text,text,text)` —
  pinned `search_path=public`, in-body `auth.uid()` check; untouched here.

## Pre-change snapshot (read-only, recorded 2026-10-16)

```sql
SELECT p.oid,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.proconfig,
       p.proacl::text AS acl,
       md5(p.prosrc) AS src_md5,
       length(p.prosrc) AS src_len,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_exec,
       exists(select 1 from aclexplode(coalesce(p.proacl,'{}'::aclitem[])) e
              where e.grantee = 0 and e.privilege_type='EXECUTE') AS public_exec
FROM pg_proc p
WHERE p.proname = 'create_booking_with_escrow_payment'
  AND p.pronamespace = 'public'::regnamespace
ORDER BY args;
```

Recorded values:

| overload | args (identity) | acl | md5 / len | notes |
|---|---|---|---|---|
| A (target) | `(uuid,uuid,uuid,date,numeric,time,text,text,text)` | `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` | `7340ddcecd06cdc7dff17b8fcf811a73` / 2845 | proconfig NULL |
| B | `(uuid,uuid,uuid,date,time,time,numeric,text,text,text)` | `{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` | `cb23e83c4e4178f74858fac12151e956` / 3115 | pinned |
| C | `(uuid,uuid,uuid,date,time,numeric,numeric,text,text,text)` | `{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` | `15615b7f6406107f4c84b45558f27f79` / 7407 | pinned |

## Apply order (only after explicit approval)

1. Re-run the pre-change snapshot; ACL of A must match the table above.
2. Apply `db/migrations/20261016_revoke_orphan_create_booking_exec.sql`
   (file is wrapped in BEGIN/COMMIT, same convention as the applied
   `20251016_restore_missing_rpcs.sql`).
3. Run verification V1–V3 below.

## Rollback (exact reverse — restores the recorded ACL)

```sql
BEGIN;

GRANT EXECUTE ON FUNCTION public.create_booking_with_escrow_payment(
  uuid, uuid, uuid, date, numeric, time, text, text, text
) TO PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
```

- The original PUBLIC/anon/authenticated entries were explicit grants with
  grantor `postgres`; running the reverse GRANT **as `postgres` (owner)**
  reproduces `{=X/postgres, anon=X/postgres, authenticated=X/postgres}`
  exactly. Run as any other superuser and the privileges are identical but
  the aclitem grantor column differs (cosmetic only).
- `postgres` and `service_role` were never revoked — no restore needed.
- No body, search_path, or other ACL was modified — no DDL rollback exists
  or is needed. If the migration was never applied, there is nothing to roll
  back (transaction guarantees all-or-nothing).

## Verification (read-only, post-apply)

V1 — effective privileges (expected after apply: A row →
`public_exec=false, anon=false, auth=false, svc=true, owner=true`;
B and C rows unchanged, all-true):

```sql
SELECT pg_get_function_identity_arguments(p.oid) AS args,
       p.proacl::text AS acl,
       exists(select 1 from aclexplode(coalesce(p.proacl,'{}'::aclitem[])) e
              where e.grantee = 0 and e.privilege_type='EXECUTE') AS public_exec,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_exec,
       has_function_privilege('postgres', p.oid, 'EXECUTE') AS owner_exec
FROM pg_proc p
WHERE p.proname = 'create_booking_with_escrow_payment'
  AND p.pronamespace = 'public'::regnamespace
ORDER BY args;
```

V2 — overloads B and C byte-identical to the snapshot (md5, proconfig, acl).
Identifies B and C by exact `regprocedure` signature rather than formatted
identity-args text: `pg_get_function_identity_arguments()` renders the type
as `time without time zone`, which defeated the original text-literal `IN`
list (observed post-apply; query replaced with the verified regprocedure
form 2026-10-16 — returned exactly two rows with md5/len/proconfig/acl all
matching the snapshot table):

```sql
SELECT pg_get_function_identity_arguments(p.oid) AS args,
       p.proconfig,
       p.proacl::text AS acl,
       md5(p.prosrc) AS src_md5,
       length(p.prosrc) AS src_len
FROM pg_proc p
WHERE p.oid IN (
  'public.create_booking_with_escrow_payment(uuid,uuid,uuid,date,time without time zone,time without time zone,numeric,text,text,text)'::regprocedure,
  'public.create_booking_with_escrow_payment(uuid,uuid,uuid,date,time without time zone,numeric,numeric,text,text,text)'::regprocedure
)
ORDER BY args;
-- expect: two rows, md5/len/proconfig/acl exactly as in the snapshot table
```

V3 — the frontend's named arguments resolve to exactly one overload, C:

```sql
SELECT p.oid, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
WHERE p.proname = 'create_booking_with_escrow_payment'
  AND p.pronamespace = 'public'::regnamespace
  AND p.proargnames @> ARRAY['p_service_fee'];
-- expect: exactly 1 row = overload C (p_service_fee present only there)
```

Optional runtime confirmation (outside this step's boundaries — not run here):
the normal booking flow in a preview/staging environment must succeed through
C. Do not invoke overload A under any circumstance.

## Uncertainties flagged for approval

1. **Schema-cache reload**: no repo convention exists (0 matches for
   `reload schema` / `NOTIFY pgrst` across 264 files). Using the
   Supabase-documented `NOTIFY pgrst, 'reload schema'` inside the
   transaction (delivered on COMMIT only; nothing fires if the tx aborts).
   PostgREST may additionally auto-reload via DDL event triggers on
   GRANT/REVOKE — the NOTIFY is belt-and-braces and harmless if redundant.
   Worst case of a missed reload: a stale cache keeps allowing A briefly
   until reload; the DB itself already denies it immediately
   (`has_function_privilege` = false after COMMIT), so the DB-level
   boundary holds regardless.
2. **REVOKE semantics**: all three entries (PUBLIC, anon, authenticated) are
   explicit in A's proacl, so one `REVOKE ... FROM PUBLIC, anon, authenticated`
   removes exactly them; B and C have separate per-function ACLs and cannot
   be affected.
3. **Transaction handling**: file-internal BEGIN/COMMIT matches both
   existing local migrations; if the applying tool also wraps a transaction,
   the inner BEGIN raises only a WARNING (same as the already-applied
   restore migration).
4. **Naming**: `20261016_` prefix = today's date, deliberately not joining
   the `20251016_` batch (that batch's restore file was applied in prod as
   `20261016182112_restore_missing_rpcs`).
5. **oid drift**: oid 35233 is recorded for reference only; never key
   verification on it.
6. **Not parser-validated**: no disposable database is configured, so the
   migration has not been parsed by PostgreSQL — the same caveat recorded in
   `20251016_restore_missing_rpcs.sql`. The statements are standard
   REVOKE/NOTIFY/BEGIN/COMMIT syntax; risk is low but non-zero.

## Boundaries honored

Files created: this note + the migration. Nothing applied, no production
write, function not run or dropped, B and C untouched, no app code edited,
nothing committed or pushed, all existing changes/untracked files preserved.

