# Phase 3F.3 - Orphan Overload A: Provenance, Dependency and Usage Review

Date: 2026-10-17 | Mode: READ-ONLY (no production changes this phase)
Status: COMPLETE - all four parts answered with production evidence.

## Executive summary

Overload A of create_booking_with_escrow_payment (uuid,uuid,uuid,date,numeric,time,text,text,text)
is NOT a random artifact: it was hand-pasted into the Supabase SQL editor on
2026-09-08 19:00:19 UTC as a same-day hotfix so the deployed frontend (which sends a
9-key payload: no p_end_time, no p_service_fee) would have a binding target. Its body is a
hand-edited (+160 chars) descendant of db/escrow_transaction.sql at commit db77c66
(the immediate predecessor paste at 16:57 UTC is a BYTE-EXACT CRLF match of that file).
Its reordered parameter list (p_total_amount before p_start_time) exists nowhere in git
history - that reordering was done by hand in the editor. It never got the auth check or
search_path pinning that B and C have, and it silently inherited Supabase default-privilege
ACL (anon+authenticated EXECUTE) because no explicit GRANT/REVOKE ever named it until our
2026-10-16 containment.

It then served 10 real authenticated bookings (2026-09-08 to 09-09) before the frontend
switched to C (with p_service_fee) on 09-11. Every one of the 29 rows in bookings is now
attributed to a specific overload call. Zero attempts to call A have occurred since the revoke.

## Part 1 - Dependency analysis

- pg_depend on A: EMPTY (no rules, no default expressions, no typed dependencies).
- No views/matviews reference it (definition scan).
- No other function prosrc references it.
- No Edge Function references it (git grep over supabase/functions/** = none).
- Repo references classified: src/lib/services/payments.service.ts is the only live caller
  (resolves to C); bookings.service.ts is a comment mention only; the rest are docs/tests.
- Conclusion: A has ZERO programmatic dependents. Dropping it breaks nothing.

## Part 2 - Current production state (3 overloads)

| overload | identity args | body md5 / len | proconfig | ACL | auth check |
|---|---|---|---|---|---|
| A | date, numeric, time (9 args) | 7340ddce / 2845 | NULL | postgres, service_role (post-revoke) | NONE |
| B | date, time, time, numeric (10 args) | cb23e83c / 3115 | search_path=public | postgres, anon, authenticated, service_role | yes |
| C | date, time, numeric, numeric (10 args) | 15615b7f / 7407 | search_path=public | postgres, anon, authenticated, service_role | yes |

All three: SECURITY DEFINER, owner postgres, volatile, parallel unsafe. A is still unpinned.

## Part 3 - Migration history (from pg_stat_statements DDL capture)

All 7 CREATEs executed as role postgres with CRLF text = direct SQL-editor pastes.
No migration file, no version control. No DROP FUNCTION for this name was ever executed.

| UTC timestamp | body md5 / len | provenance |
|---|---|---|
| 09-02 09:12:54 | d4971e18 / 2721 | BYTE-EXACT = 06ccbb8:db/escrow_transaction.sql (CRLF); first-ever create |
| 09-02 09:18:02 | f0be65c1 / 4482 | hand variant, no git match |
| 09-02 09:35:38 | 32439827 / 4968 | BYTE-EXACT = fa9347a:db/escrow_schema.sql (CRLF) + explicit GRANT to authenticated |
| 09-06 19:36:58 | cb23e83c / 3115 | = current B; pinned + auth-checked; body never committed (closest 16508ed at 3108 CRLF, 7-char delta) |
| 09-08 16:57:00 | e1960f62 / 2685 | BYTE-EXACT = db77c66/9957541:db/escrow_transaction.sql (CRLF); first A-signature attempt |
| 09-08 19:00:19 | 7340ddce / 2845 | = CURRENT A; hand-edited (+160 chars, MarzPay doc comments) descendant of the 16:57 paste; reordered args, no pinning, no auth check |
| 09-11 06:24:35 | 15615b7f / 7407 | = current C; from the working file committed 3 min later as a0362b1 (7415 CRLF, 8-char delta) + explicit GRANT |

GRANT/REVOKE trail: authenticated GRANTs on the B-lineage signature (09-02 09:35:38) and on C
(09-11 06:24:35); our REVOKE on A at 2026-10-16 21:41:51 (exact match of migration
20261016214151_revoke_orphan_create_booking_exec). A never received an explicit GRANT -
its anon/authenticated EXECUTE came from Supabase default privileges, confirming that
explicit REVOKEs are load-bearing here.

Why A existed: the deployed frontend before commit 16508ed (09-10) sends exactly the 9 keys
A accepts. B requires p_end_time and C requires p_service_fee (both non-defaulted), so the
old payload resolved ONLY to A once A existed. A was a production hotfix, not dead code -
it is dead NOW (see Part 4).

## Part 4 - Usage evidence

pg_stat_statements (track=top, reset 2026-08-08) + bookings.created_at reconcile exactly:

| overload | calls (role, first seen UTC) | bookings created |
|---|---|---|
| B | 5 (authenticated, 09-03 12:30) | 0 - all returned error JSON; B never created a booking |
| A | 10 (authenticated, 09-08 20:21) | 10 (09-08: 1, 09-09: 9) |
| C | 19 (authenticated, 09-11 06:46) | 19 (09-11: 4, 09-12: 2, 09-22: 2, 09-24: 8, 09-25: 3) |
| C | 1 (ANON, 09-18 15:54) | 0 - internal auth.uid() check rejected it |

10 + 19 = 29 = total rows in bookings (payments likewise 29). Every booking is attributed;
no orphaned data. Post-revoke window (10-16 21:41 to 10-17): ZERO calls and ZERO
permission-denied events (verified in postgres_logs). Dropping A affects no rows.

## Part 5 - Logging coverage assessment

- track_functions = none, so pg_stat_user_functions is empty; per-function counters unavailable.
  This is why the earlier pg_stat_user_functions query returned no rows.
- pg_stat_statements installed and was the decisive forensic source: it captured every DDL
  paste, GRANT, REVOKE, and PostgREST RPC wrapper call with role attribution and timestamps.
- Unified logs via MCP cover only the last 24h (3152 pgbouncer + 8 postgres rows in window);
  no PostgREST/edge log sources surfaced. Historical usage cannot come from logs alone.
- Caveat: pgss entries show stats_since (from 09-02) earlier than pg_postmaster_start_time
  (10-08) - stats evidently survive restarts here; timestamps are corroborated to the minute
  against git commit times, so treat them as reliable ordering, not absolute wall-clock.

## Part 6 - Risk-ranked recommendations

1. [HIGH] Drop overload A. Contained but present, no auth check, unpinned, zero callers:
     DROP FUNCTION public.create_booking_with_escrow_payment(uuid,uuid,uuid,date,numeric,time,text,text,text);
   Prepare as a migration; apply only after user confirmation (irreversible DDL).
2. [HIGH] Apply the Phase-3 RLS hardening migration (20251016_phase3_rls_hardening.sql)
   after resolving its open review items C1 (reviews insert gate) and M1-M3.
3. [MEDIUM] Drop overload B. Production-only body (never in git), 0 successful bookings ever,
   superseded by C, still anon-executable. Dead attack surface.
4. [MEDIUM] Explicit REVOKE anon on C (the live RPC) - anon provably reached it on 09-18;
   only the internal auth check stopped it. Keep authenticated EXECUTE (frontend needs it).
5. [LOW] Enable track_functions = plpgsql at database level for future forensics; pgss stays.
6. [LOW, process] Migrations-only DDL policy. All 7 historical CREATEs were out-of-band
   SQL-editor pastes - the root cause of this entire incident class.

## Evidence limitations

- Cannot prove WHO pasted A (Postgres records DDL actor only as role postgres).
- Cannot see HTTP-level callers (no PostgREST access logs in the 24h MCP window); role
  attribution comes from pg_stat_statements userid.

