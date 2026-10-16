-- ================================================================
-- Admin: set provider verified flag (Phase 5F — backend authorization)
-- ================================================================
-- Purpose:
--   Give `setProviderVerified` a backend path that independently
--   verifies the caller is an admin, instead of depending on the
--   React admin guard or on RLS alone.
--
--   The previous implementation wrote `public.providers` directly
--   through PostgREST, so the ONLY protection was the RLS policy
--   "Providers update verified flag for admin" (admin_moderation.sql).
--   Clients now must go through this SECURITY DEFINER RPC, which
--   re-checks public.is_admin_user() on every call.
--
--   Existing behaviour is preserved: only the `verified` column is
--   written, and the updated provider row is returned.
--
-- Parameters:
--   p_provider_id — uuid of the provider to verify/unverify
--   p_verified    — the new verified flag
--
-- Returns:
--   JSON { success, provider } on success,
--   JSON { success: false, error } on failure (unknown provider,
--   non-admin caller, or any unexpected error).
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_set_provider_verified(
  p_provider_id uuid,
  p_verified boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider public.providers;
BEGIN
  IF p_provider_id IS NULL OR p_verified IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Provider id and verified flag are required'
    );
  END IF;

  -- Authorization: the DATABASE decides, not the frontend and not RLS.
  -- Unauthenticated callers have auth.uid() IS NULL, so this is false.
  IF NOT public.is_admin_user() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Only an admin can change provider verification'
    );
  END IF;

  -- Update ONLY the verified column. No other column (user_id,
  -- business_name, rating, …) can ever be written by this function.
  UPDATE public.providers
  SET verified = p_verified
  WHERE id = p_provider_id
  RETURNING * INTO v_provider;

  -- If the row vanished between the check and the update, report it.
  IF v_provider IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Provider not found'
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'provider', row_to_json(v_provider)
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
-- Do not allow anonymous users to execute the RPC. Authenticated
-- users can call it, but authorization is re-checked inside the
-- function (is_admin_user() above), so this is defence in depth.
-- ================================================================

REVOKE ALL ON FUNCTION public.admin_set_provider_verified(
  uuid,
  boolean
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_set_provider_verified(
  uuid,
  boolean
) TO authenticated;
