-- ========================================================
-- NINJAWO Phase 3E - Restore missing production RPCs
-- File: db/migrations/20251016_restore_missing_rpcs.sql
-- ========================================================
--
-- Purpose
-- -------
--   Restore the two RPCs that are defined locally but are not yet
--   registered in the live catalog (Phase 3D reconciliation):
--
--     1. public.close_dispute(uuid, text)  - admin closes a dispute
--                                             without moving money.
--     2. public.admin_delete_review(uuid)  - admin deletes a review.
--
-- Validation performed (read-only, no execution)
-- ----------------------------------------------
--   * Live catalog confirms BOTH functions are ABSENT from pg_proc.
--   * Live catalog confirms public.is_admin_user() exists as a
--     SECURITY DEFINER, STABLE helper.
--   * Live catalog confirms the target tables/columns match the
--     local definitions: public.disputes (status CHECK includes
--     'closed') and public.reviews (id uuid NOT NULL present).
--   * A disposable database is NOT configured, so this file has
--     not been parsed or validated by PostgreSQL. Actual database
--     validation remains outstanding.
--   * No database was changed and no deployment occurred.
-- ========================================================

BEGIN;

-- ========================================================
-- 1. close_dispute
-- --------------------------------------------------------
-- Exact local definition: db/disputes.sql:364-403
-- --------------------------------------------------------
-- SIGNATURE : public.close_dispute(p_dispute_id uuid,
--                                  p_admin_notes text DEFAULT NULL)
-- RETURNS   : json
-- LANGUAGE  : plpgsql
-- SECURITY  : DEFINER
-- SET search_path = pg_catalog, public
-- --------------------------------------------------------
-- Behaviour preserved verbatim from the local definition:
--   * json_build_object('success', false, 'error', 'Dispute ID
--     is required')        when p_dispute_id IS NULL
--   * json_build_object('success', false, 'error', 'Only an
--     admin can close disputes') when public.is_admin_user()
--     is false
--   * json_build_object('success', false, 'error', 'Dispute not
--     found')              when the dispute id does not exist
--   * json_build_object('success', false, 'error', 'Dispute is
--     not actionable')     when status is not in ('open',
--     'provider_responded')
--   * success payload with the updated dispute row on a valid
--     close
-- --------------------------------------------------------

CREATE OR REPLACE FUNCTION public.close_dispute(
  p_dispute_id uuid,
  p_admin_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_status text;
  v_record json;
BEGIN
  IF p_dispute_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Dispute ID is required');
  END IF;
  IF NOT public.is_admin_user() THEN
    RETURN json_build_object('success', false, 'error', 'Only an admin can close disputes');
  END IF;

  BEGIN
    SELECT d.status INTO v_status FROM public.disputes d WHERE d.id = p_dispute_id;
    IF v_status IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Dispute not found');
    END IF;

    IF v_status NOT IN ('open', 'provider_responded') THEN
      RETURN json_build_object('success', false, 'error', 'Dispute is not actionable');
    END IF;

    UPDATE public.disputes
    SET status = 'closed', admin_notes = p_admin_notes, resolved_at = now(), updated_at = now()
    WHERE id = p_dispute_id;

    SELECT row_to_json(d.*) INTO v_record FROM public.disputes d WHERE d.id = p_dispute_id;
    RETURN json_build_object('success', true, 'dispute', v_record);
  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
  END;
END $$;

-- ========================================================
-- 2. admin_delete_review
-- --------------------------------------------------------
-- Exact local definition: db/admin_delete_review.sql:33-78
-- --------------------------------------------------------
-- SIGNATURE : public.admin_delete_review(p_review_id uuid)
-- RETURNS   : json
-- LANGUAGE  : plpgsql
-- SECURITY  : DEFINER
-- SET search_path = public
-- --------------------------------------------------------
-- Behaviour preserved verbatim from the local definition:
--   * json_build_object('success', false, 'error', 'Review id
--     is required')       when p_review_id IS NULL
--   * json_build_object('success', false, 'error', 'Only an
--     admin can delete reviews') when public.is_admin_user()
--     is false
--   * success payload with the deleted row count on a valid
--     delete; the deleted field is informational (ROW_COUNT)
--     and is 0 when no matching review exists.
-- --------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_delete_review(
  p_review_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF p_review_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Review id is required'
    );
  END IF;

  -- Authorization: the DATABASE decides, not the frontend and not RLS.
  -- Unauthenticated callers have auth.uid() IS NULL, so this is false.
  IF NOT public.is_admin_user() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Only an admin can delete reviews'
    );
  END IF;

  -- Delete ONLY the targeted reviews row. No other table is reachable
  -- from this function.
  DELETE FROM public.reviews
  WHERE id = p_review_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN json_build_object(
    'success', true,
    'deleted', v_deleted
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- ========================================================
-- 3. Execute permissions
-- --------------------------------------------------------
-- Defence in depth only. The authoritative check in both
-- functions is is_admin_user().
-- --------------------------------------------------------

REVOKE ALL ON FUNCTION public.close_dispute(uuid, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_dispute(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_delete_review(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_review(uuid) TO authenticated;

COMMIT;
