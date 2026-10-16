-- ================================================================
-- Admin: delete a review (Phase 5G — backend authorization)
-- ================================================================
-- Purpose:
--   Give `deleteReviewPermanently` a backend path that independently
--   verifies the caller is an admin, instead of depending on the
--   React admin guard or on RLS alone.
--
--   The previous implementation issued a raw DELETE against
--   `public.reviews` through PostgREST, so the ONLY protection was
--   the RLS policy "Reviews delete for admin" (admin_moderation.sql).
--   Clients now must go through this SECURITY DEFINER RPC, which
--   re-checks public.is_admin_user() on every call.
--
--   Deletion behaviour is preserved: exactly one `reviews` row is
--   removed by id. Inspection confirmed NO cascade — no other table
--   has a foreign key referencing `reviews`, and no trigger exists
--   that recalculates providers.rating on delete.
--
-- Parameters:
--   p_review_id — uuid of the review to delete
--
-- Returns:
--   JSON { success, deleted } on success,
--   JSON { success: false, error } on failure (missing id, non-admin
--   caller, or any unexpected error).
--
--   `deleted` is the affected row count and is informational only —
--   it mirrors the previous PostgREST behaviour where a DELETE that
--   matched no rows still reported success.
-- ================================================================

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


-- ================================================================
-- Function permissions
-- ================================================================
-- Defence in depth only. The authoritative check is is_admin_user()
-- above — note that Supabase grants EXECUTE to `anon` through its
-- default privileges, which REVOKE ... FROM PUBLIC does NOT remove,
-- so this alone does not block anonymous callers.
-- ================================================================

REVOKE ALL ON FUNCTION public.admin_delete_review(
  uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_delete_review(
  uuid
) TO authenticated;
