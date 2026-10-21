-- ================================================================
-- Phase 3H.1 — Offline provider payout ledger (LOCAL ONLY)
-- ================================================================
-- Purpose:
--   Record manual (out-of-band) provider payouts for already-released
--   escrow payments. This ledger NEVER initiates a money transfer and
--   makes NO gateway call. A `paid_out` row means "an admin recorded a
--   manual disbursement", not "the gateway moved funds".
--
-- Scope / boundaries (do not expand):
--   - Does NOT modify release_escrow_to_provider,
--     cancel_booking_and_refund, adjudicate_dispute, close_dispute,
--     marzpay-webhook, or ninjawo-handler.
--   - No secrets, no Edge Function changes, no gateway reference
--     is ever required (gateway_ref is a nullable future field).
--   - Local repository change only. NOT applied to Supabase.
--
-- Conventions followed:
--   - SECURITY DEFINER RPCs with SET search_path = public, internal
--     auth checks via auth.uid() / public.is_admin_user().
--   - REVOKE ALL FROM PUBLIC + anon; GRANT EXECUTE TO authenticated.
--   - RLS enabled; restrictive SELECT (owner or admin); direct writes
--     denied — all writes go through the RPCs below.
-- ================================================================

-- ------------------------------------------------
-- A. Provider payout destinations
-- ------------------------------------------------
-- A provider stores their mobile-money destination phone here.
-- Verification can ONLY be granted by an admin RPC; the setter RPC
-- always resets verified=false, so a provider can never self-verify.
-- Separate table (not columns on providers) so payout phones are NOT
-- exposed by the public "Providers select public verified" policy.
CREATE TABLE IF NOT EXISTS public.provider_payout_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  provider_id uuid NOT NULL UNIQUE
    REFERENCES public.providers(id) ON DELETE CASCADE,

  phone text NOT NULL
    CHECK (phone ~ '^\+?[0-9]{7,15}$'),

  verified boolean NOT NULL DEFAULT false,

  verified_by uuid NULL
    REFERENCES public.profiles(id) ON DELETE SET NULL,

  verified_at timestamptz NULL,

  created_at timestamptz NOT NULL DEFAULT now(),

  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (
    (verified AND verified_by IS NOT NULL AND verified_at IS NOT NULL)
    OR (NOT verified AND verified_by IS NULL AND verified_at IS NULL)
  )
);

ALTER TABLE public.provider_payout_destinations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Payout destinations select own or admin"
  ON public.provider_payout_destinations;
CREATE POLICY "Payout destinations select own or admin"
  ON public.provider_payout_destinations
  FOR SELECT
  USING (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1
      FROM public.providers p
      WHERE p.id = provider_payout_destinations.provider_id
        AND p.user_id = auth.uid()
    )
  );

-- No INSERT policy: direct inserts are denied; writes go via RPCs.
DROP POLICY IF EXISTS "Payout destinations no direct update"
  ON public.provider_payout_destinations;
CREATE POLICY "Payout destinations no direct update"
  ON public.provider_payout_destinations
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "Payout destinations no direct delete"
  ON public.provider_payout_destinations;
CREATE POLICY "Payout destinations no direct delete"
  ON public.provider_payout_destinations
  FOR DELETE
  USING (false);

REVOKE ALL ON TABLE public.provider_payout_destinations FROM PUBLIC;
REVOKE ALL ON TABLE public.provider_payout_destinations FROM anon, authenticated;
GRANT SELECT ON TABLE public.provider_payout_destinations TO authenticated;

-- ------------------------------------------------
-- B. Offline payout ledger
-- ------------------------------------------------
-- One row per released payment (payment_id UNIQUE). Amount and
-- destination phone are snapshots taken at queue time so later edits
-- to provider_amount or the destination do not rewrite history.
CREATE TABLE IF NOT EXISTS public.provider_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  payment_id uuid NOT NULL UNIQUE
    REFERENCES public.payments(id) ON DELETE RESTRICT,

  booking_id uuid NOT NULL
    REFERENCES public.bookings(id) ON DELETE RESTRICT,

  provider_id uuid NOT NULL
    REFERENCES public.providers(id) ON DELETE RESTRICT,

  amount numeric(12,2) NOT NULL
    CHECK (amount >= 0),

  destination_phone text NOT NULL
    CHECK (destination_phone ~ '^\+?[0-9]{7,15}$'),

  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'paid_out', 'failed')),

  -- Reserved for a future disbursement integration. Never required,
  -- never written by this phase.
  gateway_ref text NULL,

  requested_by uuid NULL
    REFERENCES public.profiles(id) ON DELETE SET NULL,

  recorded_by uuid NULL
    REFERENCES public.profiles(id) ON DELETE SET NULL,

  failure_reason text NULL,

  created_at timestamptz NOT NULL DEFAULT now(),

  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.provider_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Provider payouts select own or admin"
  ON public.provider_payouts;
CREATE POLICY "Provider payouts select own or admin"
  ON public.provider_payouts
  FOR SELECT
  USING (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1
      FROM public.providers p
      WHERE p.id = provider_payouts.provider_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Provider payouts no direct insert"
  ON public.provider_payouts;
CREATE POLICY "Provider payouts no direct insert"
  ON public.provider_payouts
  FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "Provider payouts no direct update"
  ON public.provider_payouts;
CREATE POLICY "Provider payouts no direct update"
  ON public.provider_payouts
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "Provider payouts no direct delete"
  ON public.provider_payouts;
CREATE POLICY "Provider payouts no direct delete"
  ON public.provider_payouts
  FOR DELETE
  USING (false);

REVOKE ALL ON TABLE public.provider_payouts FROM PUBLIC;
REVOKE ALL ON TABLE public.provider_payouts FROM anon, authenticated;
GRANT SELECT ON TABLE public.provider_payouts TO authenticated;

-- Cross-row consistency: payout must reference the payment's own
-- booking and provider, and the payment must currently be released.
CREATE OR REPLACE FUNCTION public.validate_provider_payout_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_payment_booking uuid;
  v_payment_provider uuid;
  v_payment_status text;
BEGIN
  SELECT booking_id, provider_id, payment_status
    INTO v_payment_booking, v_payment_provider, v_payment_status
    FROM public.payments
    WHERE id = NEW.payment_id;

  IF v_payment_booking IS NULL THEN
    RAISE EXCEPTION 'payment not found';
  END IF;

  IF NEW.booking_id <> v_payment_booking THEN
    RAISE EXCEPTION 'payout booking does not match payment booking';
  END IF;

  IF NEW.provider_id <> v_payment_provider THEN
    RAISE EXCEPTION 'payout provider does not match payment provider';
  END IF;

  IF v_payment_status <> 'released' THEN
    RAISE EXCEPTION 'payment is not released (current: %)', v_payment_status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_provider_payout_consistency
  ON public.provider_payouts;
CREATE TRIGGER trg_validate_provider_payout_consistency
  BEFORE INSERT ON public.provider_payouts
  FOR EACH ROW EXECUTE FUNCTION public.validate_provider_payout_consistency();

-- C. RPCs: destinations
-- A provider (owner) or admin sets the phone; verification is ALWAYS
-- reset to false here so a provider can never self-verify.
CREATE OR REPLACE FUNCTION public.set_provider_payout_destination(
  p_provider_id uuid,
  p_phone text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid;
  v_is_admin boolean;
  v_is_owner boolean;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Authentication required');
  END IF;

  IF p_provider_id IS NULL OR p_phone IS NULL OR btrim(p_phone) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Provider and phone are required');
  END IF;

  IF btrim(p_phone) !~ '^\+?[0-9]{7,15}$' THEN
    RETURN json_build_object('success', false, 'error', 'Invalid phone format');
  END IF;

  v_is_admin := public.is_admin_user();
  SELECT EXISTS (
    SELECT 1 FROM public.providers p
    WHERE p.id = p_provider_id AND p.user_id = v_caller
  ) INTO v_is_owner;

  IF NOT v_is_admin AND NOT v_is_owner THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized for this provider');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.providers WHERE id = p_provider_id) THEN
    RETURN json_build_object('success', false, 'error', 'Provider not found');
  END IF;

  INSERT INTO public.provider_payout_destinations AS d
    (provider_id, phone, verified, verified_by, verified_at, updated_at)
  VALUES (p_provider_id, btrim(p_phone), false, NULL, NULL, now())
  ON CONFLICT (provider_id) DO UPDATE
    SET phone = EXCLUDED.phone,
        verified = false,
        verified_by = NULL,
        verified_at = NULL,
        updated_at = now();

  RETURN json_build_object('success', true, 'provider_id', p_provider_id, 'verified', false);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Admin-only verification. This is the ONLY path that sets verified=true.
CREATE OR REPLACE FUNCTION public.verify_provider_payout_destination(
  p_provider_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Authentication required');
  END IF;

  IF NOT public.is_admin_user() THEN
    RETURN json_build_object('success', false, 'error', 'Admin access required');
  END IF;

  IF p_provider_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Provider is required');
  END IF;

  UPDATE public.provider_payout_destinations
  SET verified = true,
      verified_by = v_caller,
      verified_at = now(),
      updated_at = now()
  WHERE provider_id = p_provider_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Destination not found');
  END IF;

  RETURN json_build_object('success', true, 'provider_id', p_provider_id, 'verified', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- D. RPC: queue payout.
-- Booking/provider/amount are snapshotted FROM the payment row
-- (never caller-supplied), so mismatched relationships cannot be
-- inserted. Unique(payment_id) plus the consistency trigger make
-- a second queue impossible.
CREATE OR REPLACE FUNCTION public.queue_provider_payout(
  p_payment_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid;
  v_is_admin boolean;
  v_is_owner boolean;
  v_booking_id uuid;
  v_provider_id uuid;
  v_status text;
  v_amount numeric(12,2);
  v_phone text;
  v_verified boolean;
  v_payout_id uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Authentication required');
  END IF;

  IF p_payment_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Payment is required');
  END IF;

  SELECT pay.booking_id, pay.provider_id, pay.payment_status, pay.provider_amount
    INTO v_booking_id, v_provider_id, v_status, v_amount
    FROM public.payments pay
    WHERE pay.id = p_payment_id
    FOR UPDATE;

  IF v_booking_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Payment not found');
  END IF;

  -- Only the owning provider or an admin may queue.
  v_is_admin := public.is_admin_user();
  SELECT EXISTS (
    SELECT 1 FROM public.providers p
    WHERE p.id = v_provider_id AND p.user_id = v_caller
  ) INTO v_is_owner;

  IF NOT v_is_admin AND NOT v_is_owner THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized for this payment');
  END IF;

  IF v_status <> 'released' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Payment is not released (current: ' || v_status || ')'
    );
  END IF;

  IF v_amount IS NULL OR v_amount < 0 THEN
    RETURN json_build_object('success', false, 'error', 'Invalid provider amount');
  END IF;

  SELECT d.phone, d.verified
    INTO v_phone, v_verified
    FROM public.provider_payout_destinations d
    WHERE d.provider_id = v_provider_id;

  IF v_phone IS NULL OR NOT COALESCE(v_verified, false) THEN
    RETURN json_build_object('success', false, 'error', 'Verified payout destination required');
  END IF;

  BEGIN
    INSERT INTO public.provider_payouts
      (payment_id, booking_id, provider_id, amount, destination_phone, status, requested_by)
    VALUES
      (p_payment_id, v_booking_id, v_provider_id, v_amount, v_phone, 'queued', v_caller)
    RETURNING id INTO v_payout_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'error', 'Payout already queued for this payment');
  END;

  RETURN json_build_object('success', true, 'payout_id', v_payout_id, 'status', 'queued');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- E. RPC: admin-only outcome. Providers (and anon) are rejected
-- inside the function; RLS is a second layer, never the sole protection.
CREATE OR REPLACE FUNCTION public.record_provider_payout_outcome(
  p_payout_id uuid,
  p_outcome text,
  p_failure_reason text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid;
  v_status text;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Authentication required');
  END IF;

  IF NOT public.is_admin_user() THEN
    RETURN json_build_object('success', false, 'error', 'Admin access required');
  END IF;

  IF p_payout_id IS NULL OR p_outcome IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Payout and outcome are required');
  END IF;

  IF p_outcome NOT IN ('paid_out', 'failed') THEN
    RETURN json_build_object('success', false, 'error', 'Outcome must be paid_out or failed');
  END IF;

  SELECT status INTO v_status
    FROM public.provider_payouts
    WHERE id = p_payout_id
    FOR UPDATE;

  IF v_status IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Payout not found');
  END IF;

  IF v_status <> 'queued' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Only queued payouts can be resolved (current: ' || v_status || ')'
    );
  END IF;

  UPDATE public.provider_payouts
  SET status = p_outcome,
      recorded_by = v_caller,
      failure_reason = CASE WHEN p_outcome = 'failed' THEN p_failure_reason ELSE NULL END,
      updated_at = now()
  WHERE id = p_payout_id;

  RETURN json_build_object('success', true, 'payout_id', p_payout_id, 'status', p_outcome);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- F. Grants (narrow; writes only via RPCs).
REVOKE ALL ON FUNCTION public.set_provider_payout_destination(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_provider_payout_destination(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_provider_payout_destination(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.verify_provider_payout_destination(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_provider_payout_destination(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_provider_payout_destination(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.queue_provider_payout(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.queue_provider_payout(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_provider_payout(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.record_provider_payout_outcome(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_provider_payout_outcome(uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_provider_payout_outcome(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.validate_provider_payout_consistency() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_provider_payout_consistency() FROM anon, authenticated;
