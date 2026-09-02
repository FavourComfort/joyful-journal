-- ================================================================
-- DISPUTE WORKFLOW for NINJAWO escrow
-- Run in Supabase SQL editor as a privileged user, AFTER escrow_schema.sql.
--
-- Flow:
--   1. Customer raises a dispute  -> booking.status='disputed', payment.status='disputed', dispute.status='open'
--   2. Provider responds          -> dispute.status='provider_responded'
--   3. Admin adjudicates          -> 'refund'  => booking.cancelled  + payment.refunded + dispute.resolved_customer
--                                  -> 'release' => booking.completed  + payment.released + dispute.resolved_provider
--
-- Status transitions are enforced by a trigger (mirrors DISPUTE_TRANSITIONS in
-- src/lib/state-machines.ts) and by the RPC guards below.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('service_not_delivered', 'service_not_as_described', 'other')),
  description text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'provider_responded', 'resolved_customer', 'resolved_provider', 'closed')),
  provider_response text,
  admin_notes text,
  decision text CHECK (decision IN ('refund', 'release')),
  raised_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

-- Customer sees the disputes they raised.
CREATE POLICY "Disputes select by customer"
  ON public.disputes FOR SELECT
  USING (auth.uid() = customer_id);

-- Provider sees disputes for their bookings.
CREATE POLICY "Disputes select by provider"
  ON public.disputes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_id AND p.user_id = auth.uid()
    )
  );

-- Admins see everything.
CREATE POLICY "Disputes select by admin"
  ON public.disputes FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin'));

-- Customers create a dispute for their own booking.
CREATE POLICY "Disputes insert by customer"
  ON public.disputes FOR INSERT
  WITH CHECK (
    auth.uid() = customer_id
    AND NOT EXISTS (
      SELECT 1 FROM public.disputes d WHERE d.booking_id = booking_id
    )
  );

-- All dispute writes (respond / adjudicate) go through the RPC functions below,
-- which run as SECURITY DEFINER. No direct client updates are allowed.
CREATE POLICY "Disputes no direct update"
  ON public.disputes FOR UPDATE
  USING (false)
  WITH CHECK (false);

CREATE INDEX IF NOT EXISTS disputes_booking_id_idx ON public.disputes(booking_id);
CREATE INDEX IF NOT EXISTS disputes_status_idx ON public.disputes(status);
-- ================================================================
-- Dispute state-machine trigger (server-side truth)
-- ================================================================
CREATE OR REPLACE FUNCTION public.validate_dispute_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- open -> provider_responded | resolved_*
  IF OLD.status = 'open' AND NEW.status NOT IN ('provider_responded', 'resolved_customer', 'resolved_provider', 'closed') THEN
    RAISE EXCEPTION 'Invalid dispute status transition: % → %', OLD.status, NEW.status;
  END IF;

  -- provider_responded -> resolved_*
  IF OLD.status = 'provider_responded' AND NEW.status NOT IN ('resolved_customer', 'resolved_provider', 'closed') THEN
    RAISE EXCEPTION 'Invalid dispute status transition: % → %', OLD.status, NEW.status;
  END IF;

  -- resolved_* / closed are terminal
  IF OLD.status IN ('resolved_customer', 'resolved_provider', 'closed') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'Invalid dispute status transition: % → % (terminal)', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_dispute_status ON public.disputes;
CREATE TRIGGER trg_validate_dispute_status
  BEFORE UPDATE OF status ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.validate_dispute_status_transition();

-- ================================================================
-- Helper: is the current user an admin?
-- ================================================================
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin');
$$;

-- ================================================================
-- 1. raise_dispute
--    Customer flags a confirmed/in-progress service as not delivered.
-- ================================================================
CREATE OR REPLACE FUNCTION public.raise_dispute(
  p_booking_id uuid,
  p_reason text,
  p_description text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking_status text;
  v_booking_customer uuid;
  v_provider_user uuid;
  v_payment_id uuid;
  v_payment_status text;
  v_dispute_id uuid;
  v_dispute_record json;
BEGIN
  IF p_booking_id IS NULL OR p_reason IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Booking ID and reason are required');
  END IF;

  IF p_reason NOT IN ('service_not_delivered', 'service_not_as_described', 'other') THEN
    RETURN json_build_object('success', false, 'error', 'Unknown dispute reason');
  END IF;

  BEGIN
    SELECT b.status, b.customer_id INTO v_booking_status, v_booking_customer
    FROM public.bookings b WHERE b.id = p_booking_id;
    IF v_booking_status IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Booking not found');
    END IF;

    -- Only the customer on the booking may raise a dispute.
    IF v_booking_customer <> auth.uid() THEN
      RETURN json_build_object('success', false, 'error', 'Only the booking customer can raise a dispute');
    END IF;

    -- A dispute may only be raised while the work is live.
    IF v_booking_status NOT IN ('confirmed', 'in_progress') THEN
      RETURN json_build_object('success', false, 'error',
        'A dispute can only be raised for a confirmed or in-progress booking (current: ' || v_booking_status || ')');
    END IF;

    IF EXISTS (SELECT 1 FROM public.disputes d WHERE d.booking_id = p_booking_id) THEN
      RETURN json_build_object('success', false, 'error', 'A dispute already exists for this booking');
    END IF;

    SELECT id, payment_status INTO v_payment_id, v_payment_status
    FROM public.payments WHERE booking_id = p_booking_id;
    IF v_payment_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'No escrow payment found for this booking');
    END IF;
    IF v_payment_status <> 'escrowed' THEN
      RETURN json_build_object('success', false, 'error',
        'Only escrowed funds can be disputed (current: ' || v_payment_status || ')');
    END IF;

    -- Lock the booking row for the duration of the transaction.
    PERFORM 1 FROM public.bookings WHERE id = p_booking_id FOR UPDATE;

    UPDATE public.bookings SET status = 'disputed' WHERE id = p_booking_id;
    UPDATE public.payments SET payment_status = 'disputed', updated_at = now() WHERE id = v_payment_id;

    INSERT INTO public.disputes(booking_id, customer_id, provider_id, reason, description, status)
    VALUES (p_booking_id, v_booking_customer,
      (SELECT b.provider_id FROM public.bookings b WHERE b.id = p_booking_id),
      p_reason, p_description, 'open')
    RETURNING id INTO v_dispute_id;

    SELECT row_to_json(d.*) INTO v_dispute_record FROM public.disputes d WHERE d.id = v_dispute_id;

    -- Notify the provider.
    SELECT p.user_id INTO v_provider_user FROM public.providers p
      WHERE p.id = (SELECT b.provider_id FROM public.bookings b WHERE b.id = p_booking_id);
    IF v_provider_user IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, type, title, message, booking_id)
      VALUES (v_provider_user, 'dispute_raised', 'Service disputed',
        'A customer has raised a dispute on a booking. Please respond.', p_booking_id);
    END IF;

    RETURN json_build_object('success', true, 'dispute', v_dispute_record);
  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
  END;
END $$;

-- ================================================================
-- 2. respond_to_dispute
--    Assigned provider replies; the dispute moves to provider_responded.
-- ================================================================
CREATE OR REPLACE FUNCTION public.respond_to_dispute(
  p_dispute_id uuid,
  p_provider_response text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status text;
  v_booking_id uuid;
  v_record json;
BEGIN
  IF p_dispute_id IS NULL OR NULLIF(p_provider_response, '') IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Dispute ID and a response are required');
  END IF;

  BEGIN
    SELECT d.status, d.booking_id INTO v_status, v_booking_id
    FROM public.disputes d WHERE d.id = p_dispute_id;
    IF v_status IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Dispute not found');
    END IF;

    -- Only the assigned provider may respond.
    IF NOT EXISTS (
      SELECT 1 FROM public.bookings b JOIN public.providers p ON p.id = b.provider_id
      WHERE b.id = v_booking_id AND p.user_id = auth.uid()
    ) THEN
      RETURN json_build_object('success', false, 'error', 'Only the assigned provider can respond');
    END IF;

    IF v_status <> 'open' THEN
      RETURN json_build_object('success', false, 'error',
        'Only open disputes can be responded to (current: ' || v_status || ')');
    END IF;

    UPDATE public.disputes
    SET status = 'provider_responded',
        provider_response = p_provider_response,
        responded_at = now(),
        updated_at = now()
    WHERE id = p_dispute_id;

    SELECT row_to_json(d.*) INTO v_record FROM public.disputes d WHERE d.id = p_dispute_id;
    RETURN json_build_object('success', true, 'dispute', v_record);
  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
  END;
END $$;

-- ================================================================
-- 3. adjudicate_dispute
--    Admin resolves the dispute: 'refund' (to customer) or 'release' (to provider).
-- ================================================================
CREATE OR REPLACE FUNCTION public.adjudicate_dispute(
  p_dispute_id uuid,
  p_decision text,
  p_admin_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status text;
  v_booking_id uuid;
  v_customer uuid;
  v_provider_user uuid;
  v_record json;
  v_booking_status_final text;
  v_payment_status_final text;
  v_dispute_status_final text;
BEGIN
  IF p_dispute_id IS NULL OR p_decision NOT IN ('refund', 'release') THEN
    RETURN json_build_object('success', false, 'error', 'A valid decision ("refund" or "release") is required');
  END IF;

  IF NOT public.is_admin_user() THEN
    RETURN json_build_object('success', false, 'error', 'Only an admin can adjudicate disputes');
  END IF;

  BEGIN
    SELECT d.status, d.booking_id, d.customer_id INTO v_status, v_booking_id, v_customer
    FROM public.disputes d WHERE d.id = p_dispute_id;
    IF v_status IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Dispute not found');
    END IF;

    IF v_status NOT IN ('open', 'provider_responded') THEN
      RETURN json_build_object('success', false, 'error',
        'Dispute has already been resolved (current: ' || v_status || ')');
    END IF;

    -- Lock the booking to serialize with any concurrent action.
    PERFORM 1 FROM public.bookings WHERE id = v_booking_id FOR UPDATE;

    IF p_decision = 'refund' THEN
      v_booking_status_final := 'cancelled';
      v_payment_status_final := 'refunded';
      v_dispute_status_final := 'resolved_customer';
    ELSE
      v_booking_status_final := 'completed';
      v_payment_status_final := 'released';
      v_dispute_status_final := 'resolved_provider';
    END IF;

    UPDATE public.bookings SET status = v_booking_status_final WHERE id = v_booking_id;
    UPDATE public.payments
      SET payment_status = v_payment_status_final,
          released_at = CASE WHEN p_decision = 'release' THEN now() ELSE released_at END,
          updated_at = now()
      WHERE booking_id = v_booking_id;

    UPDATE public.disputes
      SET status = v_dispute_status_final,
          decision = p_decision,
          admin_notes = p_admin_notes,
          resolved_at = now(),
          updated_at = now()
      WHERE id = p_dispute_id;

    SELECT row_to_json(d.*) INTO v_record FROM public.disputes d WHERE d.id = p_dispute_id;

    -- Notify both parties of the outcome (best-effort; never blocks).
    SELECT p.user_id INTO v_provider_user FROM public.providers p
      WHERE p.id = (SELECT b.provider_id FROM public.bookings b WHERE b.id = v_booking_id);
    BEGIN
      INSERT INTO public.notifications(user_id, type, title, message, booking_id)
      VALUES (v_customer, 'dispute_resolved', 'Dispute resolved',
        'Your dispute outcome: ' || v_dispute_status_final, v_booking_id);
      IF v_provider_user IS NOT NULL THEN
        INSERT INTO public.notifications(user_id, type, title, message, booking_id)
        VALUES (v_provider_user, 'dispute_resolved', 'Dispute resolved',
          'The dispute outcome: ' || v_dispute_status_final, v_booking_id);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    RETURN json_build_object('success', true, 'dispute', v_record);
  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
  END;
END $$;
-- ================================================================
-- 4. close_dispute
--    Optional: admin closes a dispute without moving money.
-- ================================================================
CREATE OR REPLACE FUNCTION public.close_dispute(
  p_dispute_id uuid,
  p_admin_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
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