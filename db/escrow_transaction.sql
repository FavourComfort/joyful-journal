-- ================================================================
-- Function: release_escrow_to_provider
-- ================================================================
-- Purpose:
--   Atomically mark a payment as 'released' and booking as 'completed'.
--   Called when customer confirms service delivery.
--
-- Parameters:
--   p_booking_id - UUID of booking to complete
--
-- Returns:
--   JSON object with updated payment status on success.
-- ================================================================

CREATE OR REPLACE FUNCTION public.release_escrow_to_provider(
  p_booking_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id uuid;
  v_payment_status text;
  v_booking_status text;
  v_payment_record json;
BEGIN
  -- Validate input
  IF p_booking_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Booking ID is required'
    );
  END IF;

  BEGIN
    -- STEP 1: Fetch the booking and check its current status
    SELECT status INTO v_booking_status
    FROM public.bookings
    WHERE id = p_booking_id;

    IF v_booking_status IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Booking not found'
      );
    END IF;

    -- Only the customer can approve completion and release escrow.
    IF NOT EXISTS (
      SELECT 1 FROM public.bookings
      WHERE id = p_booking_id AND customer_id = auth.uid()
    ) THEN
      RETURN json_build_object('success', false, 'error', 'Only the customer may release escrow');
    END IF;

    -- STEP 2: Ensure booking is in confirmed or in_progress state
    IF v_booking_status NOT IN ('confirmed', 'in_progress') THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Cannot release escrow for booking in status: ' || v_booking_status
      );
    END IF;

    -- STEP 3: Fetch payment record
    SELECT id, payment_status INTO v_payment_id, v_payment_status
    FROM public.payments
    WHERE booking_id = p_booking_id;

    IF v_payment_id IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'error', 'No payment record found for this booking'
      );
    END IF;

    -- STEP 4: Ensure payment is in escrowed state
    IF v_payment_status != 'escrowed' THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Payment is not in escrowed state; current status: ' || v_payment_status
      );
    END IF;

    -- STEP 5: Update booking status to 'completed'
    UPDATE public.bookings
    SET status = 'completed', updated_at = now()
    WHERE id = p_booking_id;

    -- STEP 6: Release payment to provider (do NOT set paid_at — that is set
    -- when the payment is collected/escrowed, not when released)
    UPDATE public.payments
    SET
      payment_status = 'released',
      released_at = now(),
      updated_at = now()
    WHERE id = v_payment_id;

    -- STEP 7: Fetch and return updated payment record
    SELECT row_to_json(p.*) INTO v_payment_record
    FROM public.payments p
    WHERE p.id = v_payment_id;

    RETURN json_build_object(
      'success', true,
      'booking_id', p_booking_id,
      'payment', v_payment_record
    );

  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
  END;

END $$;

-- ================================================================
-- Function: cancel_booking_and_refund
-- ================================================================
-- Purpose:
--   Atomically cancel a booking and refund the escrowed payment.
--   Called when either customer or provider cancels before completion.
--
-- Parameters:
--   p_booking_id      - UUID of booking to cancel
--   p_cancel_reason   - Optional reason for cancellation
--   p_refund_reason   - Optional reason for refund
--
-- Returns:
--   JSON object with updated booking and payment status on success.
-- ================================================================

CREATE OR REPLACE FUNCTION public.cancel_booking_and_refund(
  p_booking_id uuid,
  p_cancel_reason text DEFAULT NULL,
  p_refund_reason text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_id uuid;
  v_payment_id uuid;
  v_payment_status text;
  v_booking_status text;
  v_booking_record json;
  v_payment_record json;
BEGIN
  IF p_booking_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Booking ID is required'
    );
  END IF;

  BEGIN
    -- STEP 1: Fetch booking
    SELECT id, status INTO v_booking_id, v_booking_status
    FROM public.bookings
    WHERE id = p_booking_id;

    IF v_booking_id IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Booking not found'
      );
    END IF;

    -- Either party may cancel their own booking; SECURITY DEFINER must not bypass this check.
    IF NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = p_booking_id AND (
        b.customer_id = auth.uid() OR EXISTS (
          SELECT 1 FROM public.providers p
          WHERE p.id = b.provider_id AND p.user_id = auth.uid()
        )
      )
    ) THEN
      RETURN json_build_object('success', false, 'error', 'Only a booking participant may cancel');
    END IF;

    -- STEP 2: Only allow cancellation if not already completed or cancelled
    IF v_booking_status IN ('completed', 'cancelled') THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Cannot cancel booking in status: ' || v_booking_status
      );
    END IF;

    -- STEP 3: Fetch payment
    SELECT id, payment_status INTO v_payment_id, v_payment_status
    FROM public.payments
    WHERE booking_id = p_booking_id;

    IF v_payment_id IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'error', 'No payment record found for this booking'
      );
    END IF;

    IF v_payment_status != 'escrowed' THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Only an escrowed payment can be refunded; current status: ' || v_payment_status
      );
    END IF;

    -- STEP 4: Update booking to cancelled
    UPDATE public.bookings
    SET status = 'cancelled', updated_at = now()
    WHERE id = p_booking_id;

    -- STEP 5: Refund payment (do NOT set released_at — a refund does not
    -- release funds to the provider; it returns them to the customer)
    UPDATE public.payments
    SET
      payment_status = 'refunded',
      failure_reason = p_refund_reason,
      updated_at = now()
    WHERE id = v_payment_id;

    -- STEP 6: Fetch updated records
    SELECT row_to_json(b.*) INTO v_booking_record
    FROM public.bookings b
    WHERE b.id = p_booking_id;

    SELECT row_to_json(p.*) INTO v_payment_record
    FROM public.payments p
    WHERE p.id = v_payment_id;

    RETURN json_build_object(
      'success', true,
      'booking', v_booking_record,
      'payment', v_payment_record
    );

  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
  END;

END $$;
