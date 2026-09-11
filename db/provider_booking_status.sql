-- ================================================================
-- Provider booking-status update RPC
-- ================================================================
-- Purpose:
--   Allow an authenticated provider to update ONLY the status of
--   bookings that belong to them. The "Bookings no direct update"
--   RLS policy (USING false / WITH CHECK false) stays intact, so
--   clients still cannot touch public.bookings directly — they must
--   go through this SECURITY DEFINER RPC.
--
--   The existing validate_booking_status_transition trigger is the
--   second layer of enforcement and rejects illegal transitions.
--
-- Parameters:
--   p_booking_id  — uuid of the booking to update
--   p_new_status  — the new status value
--
-- Returns:
--   JSON { success, booking } on success,
--   JSON { success: false, error } on failure.
-- ================================================================

CREATE OR REPLACE FUNCTION public.provider_update_booking_status(
  p_booking_id uuid,
  p_new_status text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
BEGIN
  -- Authorization: the caller must be the provider of this booking.
  -- Map auth.uid() -> providers.user_id -> bookings.provider_id.
  IF NOT EXISTS (
    SELECT 1
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE b.id = p_booking_id
      AND p.user_id = auth.uid()
  ) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Only the provider of this booking may update its status'
    );
  END IF;

  -- Update ONLY the status column. The validate_booking_status_transition
  -- trigger enforces the state machine and raises on illegal moves.
  -- No other column (customer_id, provider_id, service_id, total_amount, …)
  -- can ever be written by this function.
  UPDATE public.bookings
  SET status = p_new_status
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  -- If the row vanished between the check and the update, report it.
  IF v_booking IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Booking not found'
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'booking', row_to_json(v_booking)
  );

EXCEPTION WHEN OTHERS THEN
  -- Surprises (e.g. trigger raising on an illegal transition) come back as
  -- a clean JSON error instead of an uncaught exception.
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
-- function (see the EXISTS check above).
-- ================================================================

REVOKE ALL ON FUNCTION public.provider_update_booking_status(
  uuid,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.provider_update_booking_status(
  uuid,
  text
) TO authenticated;
