-- ================================================================
-- NINJAWO ESCROW + BOOKING LIFECYCLE
-- ================================================================
-- Run in Supabase SQL Editor as a privileged user.
--
-- This schema supports:
--
-- CUSTOMER
--   -> booking
--   -> payment
--   -> escrow
--
-- NORMAL COMPLETION
--   provider requests completion
--   -> customer confirms
--   -> booking completed
--   -> payment released
--
-- DISPUTE
--   customer raises dispute
--   -> booking disputed
--   -> payment disputed
--   -> provider responds
--   -> admin refunds OR releases
--
-- IMPORTANT:
-- Payment "refunded" currently means the DATABASE records the refund.
-- A real payment gateway refund will be added later through a
-- payment gateway/webhook integration.
-- ================================================================


-- ================================================================
-- 1. BOOKINGS TABLE
-- ================================================================

CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  customer_id uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE CASCADE,

  provider_id uuid NOT NULL
    REFERENCES public.providers(id) ON DELETE CASCADE,

  service_id uuid NOT NULL
    REFERENCES public.services(id) ON DELETE RESTRICT,

  booking_date date NOT NULL,

  start_time time,

  end_time time,

  status text NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'confirmed',
        'in_progress',
        'completed',
        'cancelled',
        'disputed'
      )
    ),

  total_amount numeric(12,2) NOT NULL
    CHECK (total_amount >= 0),

  created_at timestamptz NOT NULL DEFAULT now()
);

-- MIGRATION FOR EXISTING DATABASES:
-- Customers now provide only a date and a preferred start time.
-- End time / duration is NOT collected or calculated anymore, and the
-- post-request (accept offer) flow may not have a start time at all,
-- so both time columns are optional.
ALTER TABLE public.bookings ALTER COLUMN start_time DROP NOT NULL;
ALTER TABLE public.bookings ALTER COLUMN end_time DROP NOT NULL;


-- ================================================================
-- 2. PAYMENTS TABLE
-- ================================================================

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  booking_id uuid NOT NULL UNIQUE
    REFERENCES public.bookings(id) ON DELETE CASCADE,

  customer_id uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE CASCADE,

  provider_id uuid NOT NULL
    REFERENCES public.providers(id) ON DELETE CASCADE,

  amount numeric(12,2) NOT NULL
    CHECK (amount >= 0),

  currency text NOT NULL DEFAULT 'UGX',

  payment_status text NOT NULL DEFAULT 'pending'
    CHECK (
      payment_status IN (
        'pending',
        'escrowed',
        'released',
        'failed',
        'refunded',
        'disputed'
      )
    ),

  payment_method text DEFAULT 'mock_checkout',

  transaction_ref text,

  provider_transaction_id text,

  platform_fee numeric(12,2) NOT NULL DEFAULT 0,

  provider_amount numeric(12,2) NOT NULL DEFAULT 0,

  failure_reason text,

  paid_at timestamptz,

  released_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),

  updated_at timestamptz NOT NULL DEFAULT now()
);


-- ================================================================
-- 3. INDEXES
-- ================================================================

CREATE INDEX IF NOT EXISTS bookings_customer_id_idx
  ON public.bookings(customer_id);

CREATE INDEX IF NOT EXISTS bookings_provider_id_idx
  ON public.bookings(provider_id);

CREATE INDEX IF NOT EXISTS bookings_service_id_idx
  ON public.bookings(service_id);

CREATE INDEX IF NOT EXISTS bookings_status_idx
  ON public.bookings(status);

CREATE INDEX IF NOT EXISTS payments_booking_id_idx
  ON public.payments(booking_id);

CREATE INDEX IF NOT EXISTS payments_customer_id_idx
  ON public.payments(customer_id);

CREATE INDEX IF NOT EXISTS payments_provider_id_idx
  ON public.payments(provider_id);

CREATE INDEX IF NOT EXISTS payments_status_idx
  ON public.payments(payment_status);


-- ================================================================
-- 4. ENABLE RLS
-- ================================================================

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;


-- ================================================================
-- 5. RESET BOOKING POLICIES
-- ================================================================

DROP POLICY IF EXISTS "Bookings select by customer"
  ON public.bookings;

DROP POLICY IF EXISTS "Bookings select by provider"
  ON public.bookings;

DROP POLICY IF EXISTS "Bookings insert by customer"
  ON public.bookings;

DROP POLICY IF EXISTS "Bookings no direct update"
  ON public.bookings;

DROP POLICY IF EXISTS "Bookings no direct delete"
  ON public.bookings;


-- ================================================================
-- 6. BOOKING SELECT - CUSTOMER
-- ================================================================

CREATE POLICY "Bookings select by customer"
  ON public.bookings
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND auth.uid() = customer_id
  );


-- ================================================================
-- 7. BOOKING SELECT - PROVIDER
-- ================================================================

CREATE POLICY "Bookings select by provider"
  ON public.bookings
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.providers p
      WHERE p.id = provider_id
        AND p.user_id = auth.uid()
    )
  );


-- ================================================================
-- 8. BOOKING INSERT - CUSTOMER
-- ================================================================

CREATE POLICY "Bookings insert by customer"
  ON public.bookings
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = customer_id
  );


-- ================================================================
-- 9. NO DIRECT BOOKING UPDATE
-- ================================================================
--
-- Booking status changes must happen through trusted RPCs.
--
-- This prevents a frontend client from simply changing:
--
--   confirmed -> completed
--   disputed -> completed
--   etc.
--
-- The state-machine trigger is still the second layer of protection.

CREATE POLICY "Bookings no direct update"
  ON public.bookings
  FOR UPDATE
  USING (false)
  WITH CHECK (false);


-- ================================================================
-- 10. NO DIRECT BOOKING DELETE
-- ================================================================

CREATE POLICY "Bookings no direct delete"
  ON public.bookings
  FOR DELETE
  USING (false);


-- ================================================================
-- 11. RESET PAYMENT POLICIES
-- ================================================================

DROP POLICY IF EXISTS "Payments select by participant"
  ON public.payments;

DROP POLICY IF EXISTS "Payments insert by customer"
  ON public.payments;

DROP POLICY IF EXISTS "Payments no direct update"
  ON public.payments;

DROP POLICY IF EXISTS "Payments no direct delete"
  ON public.payments;


-- ================================================================
-- 12. PAYMENT SELECT - CUSTOMER OR PROVIDER
-- ================================================================

CREATE POLICY "Payments select by participant"
  ON public.payments
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      auth.uid() = customer_id

      OR EXISTS (
        SELECT 1
        FROM public.providers p
        WHERE p.id = provider_id
          AND p.user_id = auth.uid()
      )
    )
  );


-- ================================================================
-- 13. PAYMENT INSERT - CUSTOMER
-- ================================================================

CREATE POLICY "Payments insert by customer"
  ON public.payments
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL

    AND auth.uid() = customer_id

    AND EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.id = booking_id
        AND b.customer_id = auth.uid()
        AND b.provider_id = provider_id
    )
  );


-- ================================================================
-- 14. NO DIRECT PAYMENT UPDATE
-- ================================================================
--
-- Payment state changes are sensitive.
-- They must happen through SECURITY DEFINER RPCs.

CREATE POLICY "Payments no direct update"
  ON public.payments
  FOR UPDATE
  USING (false)
  WITH CHECK (false);


-- ================================================================
-- 15. NO DIRECT PAYMENT DELETE
-- ================================================================

CREATE POLICY "Payments no direct delete"
  ON public.payments
  FOR DELETE
  USING (false);


-- ================================================================
-- 16. BOOKING STATE MACHINE
-- ================================================================

CREATE OR REPLACE FUNCTION public.validate_booking_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;


  -- pending -> confirmed | cancelled
  IF OLD.status = 'pending'
     AND NEW.status NOT IN ('confirmed', 'cancelled')
  THEN
    RAISE EXCEPTION
      'Invalid booking status transition: % → %',
      OLD.status,
      NEW.status;
  END IF;


  -- confirmed -> in_progress | cancelled | disputed
  IF OLD.status = 'confirmed'
     AND NEW.status NOT IN (
       'in_progress',
       'cancelled',
       'disputed'
     )
  THEN
    RAISE EXCEPTION
      'Invalid booking status transition: % → %',
      OLD.status,
      NEW.status;
  END IF;


  -- in_progress -> completed | cancelled | disputed
  IF OLD.status = 'in_progress'
     AND NEW.status NOT IN (
       'completed',
       'cancelled',
       'disputed'
     )
  THEN
    RAISE EXCEPTION
      'Invalid booking status transition: % → %',
      OLD.status,
      NEW.status;
  END IF;


  -- disputed -> completed | cancelled
  IF OLD.status = 'disputed'
     AND NEW.status NOT IN (
       'completed',
       'cancelled'
     )
  THEN
    RAISE EXCEPTION
      'Invalid booking status transition: % → %',
      OLD.status,
      NEW.status;
  END IF;


  -- completed/cancelled are terminal
  IF OLD.status IN ('completed', 'cancelled')
     AND NEW.status <> OLD.status
  THEN
    RAISE EXCEPTION
      'Invalid booking status transition: % → % (terminal)',
      OLD.status,
      NEW.status;
  END IF;


  RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS trg_validate_booking_status
  ON public.bookings;

CREATE TRIGGER trg_validate_booking_status
  BEFORE UPDATE OF status
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_booking_status_transition();


-- ================================================================
-- 17. PAYMENT STATE MACHINE
-- ================================================================

CREATE OR REPLACE FUNCTION public.validate_payment_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN

  IF NEW.payment_status = OLD.payment_status THEN
    RETURN NEW;
  END IF;


  -- pending -> escrowed | failed
  IF OLD.payment_status = 'pending'
     AND NEW.payment_status NOT IN (
       'escrowed',
       'failed'
     )
  THEN
    RAISE EXCEPTION
      'Invalid payment status transition: % → %',
      OLD.payment_status,
      NEW.payment_status;
  END IF;


  -- escrowed -> released | refunded | disputed | failed
  IF OLD.payment_status = 'escrowed'
     AND NEW.payment_status NOT IN (
       'released',
       'refunded',
       'disputed',
       'failed'
     )
  THEN
    RAISE EXCEPTION
      'Invalid payment status transition: % → %',
      OLD.payment_status,
      NEW.payment_status;
  END IF;


  -- disputed -> released | refunded
  IF OLD.payment_status = 'disputed'
     AND NEW.payment_status NOT IN (
       'released',
       'refunded'
     )
  THEN
    RAISE EXCEPTION
      'Invalid payment status transition: % → %',
      OLD.payment_status,
      NEW.payment_status;
  END IF;


  -- released/refunded/failed are terminal
  IF OLD.payment_status IN (
       'released',
       'refunded',
       'failed'
     )
     AND NEW.payment_status <> OLD.payment_status
  THEN
    RAISE EXCEPTION
      'Invalid payment status transition: % → % (terminal)',
      OLD.payment_status,
      NEW.payment_status;
  END IF;


  RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS trg_validate_payment_status
  ON public.payments;

CREATE TRIGGER trg_validate_payment_status
  BEFORE UPDATE OF payment_status
  ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_payment_status_transition();


-- ================================================================
-- 18. CREATE BOOKING + ESCROW PAYMENT
-- ================================================================
--
-- Customer creates booking and payment in one trusted operation.
--
-- Real gateway (MarzPay) flow:
--
--   booking  -> confirmed
--   payment  -> pending
--
-- The frontend then invokes the 'ninjawo-handler' Edge Function which
-- calls the MarzPay collection API. The 'marzpay-webhook' Edge
-- Function receives MarzPay's final transaction status and moves the
-- payment to escrowed (or failed). Payment only becomes escrowed
-- AFTER the gateway confirms successful payment.
-- ================================================================

CREATE OR REPLACE FUNCTION public.create_booking_with_escrow_payment(
  p_customer_id uuid,
  p_provider_id uuid,
  p_service_id uuid,
  p_booking_date date,
  p_start_time time,
  p_total_amount numeric(12,2),
  p_service_fee numeric(12,2) DEFAULT NULL,
  p_currency text DEFAULT 'UGX',
  p_transaction_ref text DEFAULT NULL,
  p_payment_method text DEFAULT 'mock_checkout'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$

DECLARE
  v_booking_id uuid;
  v_payment_id uuid;

  v_platform_fee numeric(12,2);
  v_provider_amount numeric(12,2);
  v_service_fee numeric(12,2);

  v_booking json;
  v_payment json;

BEGIN

  -- ============================================================
  -- Authentication
  -- ============================================================

  IF auth.uid() IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Authentication required'
    );
  END IF;


  -- Customer can only create a booking for themselves
  IF p_customer_id <> auth.uid() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Customer authorization failed'
    );
  END IF;


  -- ============================================================
  -- Validate inputs
  -- ============================================================

  IF p_provider_id IS NULL
     OR p_service_id IS NULL
     OR p_booking_date IS NULL
  THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Required booking information is missing'
    );
  END IF;


  IF p_total_amount IS NULL
     OR p_total_amount <= 0
  THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Booking amount must be greater than zero'
    );
  END IF;


  -- ============================================================
  -- NOTE: end_time / duration is intentionally NOT collected or
  -- calculated. Customers provide only a date and preferred start
  -- time; providers may not know how long a service takes, and
  -- different services use different measures rather than time.
  -- ============================================================


  -- ============================================================
  -- Validate provider
  -- ============================================================

  IF NOT EXISTS (
    SELECT 1
    FROM public.providers p
    WHERE p.id = p_provider_id
  ) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Provider not found'
    );
  END IF;


  -- ============================================================
  -- Validate service
  -- ============================================================
  --
  -- This assumes services.provider_id exists.
  --
  -- If your services table does not have provider_id, STOP here
  -- and tell me before running this version.
  -- ============================================================

  IF NOT EXISTS (
    SELECT 1
    FROM public.services s
    WHERE s.id = p_service_id
      AND s.provider_id = p_provider_id
  ) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Service does not belong to the selected provider'
    );
  END IF;


  BEGIN

    -- ==========================================================
    -- Platform fee = 10%
    -- Provider receives = 90%
    -- ==========================================================

    SELECT COALESCE(p_service_fee, s.price, p_total_amount)
      INTO v_service_fee
    FROM public.services s
    WHERE s.id = p_service_id;

    v_service_fee := COALESCE(v_service_fee, p_service_fee, p_total_amount);
    v_provider_amount := ROUND(v_service_fee * 0.90, 2);
    v_platform_fee := ROUND(p_total_amount - v_provider_amount, 2);


    -- ==========================================================
    -- Create booking
    -- ==========================================================

    INSERT INTO public.bookings (
      customer_id,
      provider_id,
      service_id,
      booking_date,
      start_time,
      status,
      total_amount
    )
    VALUES (
      p_customer_id,
      p_provider_id,
      p_service_id,
      p_booking_date,
      p_start_time,
      'confirmed',
      p_total_amount
    )
    RETURNING id INTO v_booking_id;


    -- ==========================================================
    -- Create escrow payment
    -- ==========================================================

    INSERT INTO public.payments (
      booking_id,
      customer_id,
      provider_id,
      amount,
      currency,
      payment_status,
      payment_method,
      transaction_ref,
      platform_fee,
      provider_amount
    )
    VALUES (
      v_booking_id,
      p_customer_id,
      p_provider_id,
      p_total_amount,
      COALESCE(NULLIF(p_currency, ''), 'UGX'),
      'pending',
      COALESCE(NULLIF(p_payment_method, ''), 'mock_checkout'),
      p_transaction_ref,
      v_platform_fee,
      v_provider_amount
    )
    RETURNING id INTO v_payment_id;


    -- ==========================================================
    -- Fetch records
    -- ==========================================================

    SELECT row_to_json(b.*)
    INTO v_booking
    FROM public.bookings b
    WHERE b.id = v_booking_id;


    SELECT row_to_json(p.*)
    INTO v_payment
    FROM public.payments p
    WHERE p.id = v_payment_id;


    RETURN json_build_object(
      'success', true,
      'booking', v_booking,
      'payment', v_payment
    );


  EXCEPTION WHEN OTHERS THEN

    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );

  END;

END;
$$;


-- ================================================================
-- 19. RELEASE ESCROW TO PROVIDER
-- ================================================================
--
-- This is the normal successful completion path.
--
-- Customer confirms completion.
--
-- confirmed/in_progress
--       ↓
-- completed
--
-- escrowed
--       ↓
-- released
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

  v_customer_id uuid;
  v_booking_status text;

  v_payment_id uuid;
  v_payment_status text;

  v_payment json;

BEGIN

  -- ============================================================
  -- Authentication
  -- ============================================================

  IF auth.uid() IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Authentication required'
    );
  END IF;


  BEGIN

    -- ==========================================================
    -- Lock booking
    -- ==========================================================

    SELECT
      b.customer_id,
      b.status
    INTO
      v_customer_id,
      v_booking_status
    FROM public.bookings b
    WHERE b.id = p_booking_id
    FOR UPDATE;


    IF v_customer_id IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Booking not found'
      );
    END IF;


    -- Only booking customer can release escrow
    IF v_customer_id <> auth.uid() THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Only the booking customer can release escrow'
      );
    END IF;


    -- Booking must be active
    IF v_booking_status NOT IN (
      'confirmed',
      'in_progress'
    ) THEN
      RETURN json_build_object(
        'success', false,
        'error',
        'Escrow can only be released for a confirmed or in-progress booking (current: '
        || v_booking_status || ')'
      );
    END IF;


    -- ==========================================================
    -- Lock payment
    -- ==========================================================

    SELECT
      id,
      payment_status
    INTO
      v_payment_id,
      v_payment_status
    FROM public.payments
    WHERE booking_id = p_booking_id
    FOR UPDATE;


    IF v_payment_id IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'error', 'No payment found for this booking'
      );
    END IF;


    IF v_payment_status <> 'escrowed' THEN
      RETURN json_build_object(
        'success', false,
        'error',
        'Payment is not escrowed (current: '
        || v_payment_status || ')'
      );
    END IF;


    -- ==========================================================
    -- Complete booking
    -- ==========================================================

    UPDATE public.bookings
    SET status = 'completed'
    WHERE id = p_booking_id;


    -- ==========================================================
    -- Release payment
    -- ==========================================================

    UPDATE public.payments
    SET
      payment_status = 'released',
      released_at = now(),
      paid_at = COALESCE(paid_at, now()),
      updated_at = now()
    WHERE id = v_payment_id;


    -- ==========================================================
    -- Return payment
    -- ==========================================================

    SELECT row_to_json(p.*)
    INTO v_payment
    FROM public.payments p
    WHERE p.id = v_payment_id;


    RETURN json_build_object(
      'success', true,
      'booking_id', p_booking_id,
      'payment', v_payment
    );


  EXCEPTION WHEN OTHERS THEN

    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );

  END;

END;
$$;


-- ================================================================
-- 20. CANCEL BOOKING + REFUND
-- ================================================================
--
-- This is the database-side refund workflow.
--
-- Customer OR assigned provider can request cancellation.
--
-- escrowed
--    ↓
-- refunded
--
-- confirmed/in_progress
--    ↓
-- cancelled
--
-- IMPORTANT:
-- This does NOT call a payment gateway.
-- It only records the refund in the database.
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

  v_customer_id uuid;
  v_provider_id uuid;
  v_booking_status text;

  v_payment_id uuid;
  v_payment_status text;

  v_is_customer boolean;
  v_is_provider boolean;

  v_payment json;

BEGIN

  -- ============================================================
  -- Authentication
  -- ============================================================

  IF auth.uid() IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Authentication required'
    );
  END IF;


  BEGIN

    -- ==========================================================
    -- Lock booking
    -- ==========================================================

    SELECT
      b.customer_id,
      b.provider_id,
      b.status
    INTO
      v_customer_id,
      v_provider_id,
      v_booking_status
    FROM public.bookings b
    WHERE b.id = p_booking_id
    FOR UPDATE;


    IF v_customer_id IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Booking not found'
      );
    END IF;


    -- ==========================================================
    -- Determine participant
    -- ==========================================================

    v_is_customer :=
      v_customer_id = auth.uid();


    v_is_provider :=
      EXISTS (
        SELECT 1
        FROM public.providers p
        WHERE p.id = v_provider_id
          AND p.user_id = auth.uid()
      );


    IF NOT v_is_customer AND NOT v_is_provider THEN
      RETURN json_build_object(
        'success', false,
        'error',
        'Only the booking customer or assigned provider can cancel this booking'
      );
    END IF;


    -- ==========================================================
    -- Cannot cancel completed/cancelled booking
    -- ==========================================================

    IF v_booking_status IN (
      'completed',
      'cancelled'
    ) THEN
      RETURN json_build_object(
        'success', false,
        'error',
        'Booking cannot be cancelled from its current status: '
        || v_booking_status
      );
    END IF;


    -- ==========================================================
    -- Lock payment
    -- ==========================================================

    SELECT
      id,
      payment_status
    INTO
      v_payment_id,
      v_payment_status
    FROM public.payments
    WHERE booking_id = p_booking_id
    FOR UPDATE;


    IF v_payment_id IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'error', 'No payment found for this booking'
      );
    END IF;


    -- ==========================================================
    -- Payment must be escrowed
    -- ==========================================================

    IF v_payment_status <> 'escrowed' THEN
      RETURN json_build_object(
        'success', false,
        'error',
        'Only escrowed payments can be refunded (current: '
        || v_payment_status || ')'
      );
    END IF;


    -- ==========================================================
    -- Cancel booking
    -- ==========================================================

    UPDATE public.bookings
    SET status = 'cancelled'
    WHERE id = p_booking_id;


    -- ==========================================================
    -- Mark payment refunded
    -- ==========================================================

    UPDATE public.payments
    SET
      payment_status = 'refunded',
      failure_reason = COALESCE(
        NULLIF(trim(p_refund_reason), ''),
        NULLIF(trim(p_cancel_reason), ''),
        'Booking cancelled and payment refunded'
      ),
      updated_at = now()
    WHERE id = v_payment_id;


    -- ==========================================================
    -- Return payment
    -- ==========================================================

    SELECT row_to_json(p.*)
    INTO v_payment
    FROM public.payments p
    WHERE p.id = v_payment_id;


    RETURN json_build_object(
      'success', true,
      'booking_id', p_booking_id,
      'payment', v_payment
    );


  EXCEPTION WHEN OTHERS THEN

    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );

  END;

END;
$$;


-- ================================================================
-- 21. FUNCTION PERMISSIONS
-- ================================================================
--
-- Do not allow anonymous users to execute the escrow RPCs.
-- Authenticated users can call them, but authorization is checked
-- again INSIDE each function.
-- ================================================================

REVOKE ALL ON FUNCTION public.create_booking_with_escrow_payment(
  uuid,
  uuid,
  uuid,
  date,
  time,
  numeric,
  text,
  text,
  text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.release_escrow_to_provider(
  uuid
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.cancel_booking_and_refund(
  uuid,
  text,
  text
) FROM PUBLIC;


GRANT EXECUTE ON FUNCTION public.create_booking_with_escrow_payment(
  uuid,
  uuid,
  uuid,
  date,
  time,
  numeric,
  text,
  text,
  text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.release_escrow_to_provider(
  uuid
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.cancel_booking_and_refund(
  uuid,
  text,
  text
) TO authenticated;


-- ================================================================
-- ESCROW SCHEMA COMPLETE
-- ================================================================