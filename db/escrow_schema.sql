-- Escrow payment and booking lifecycle for NINJAWO.
-- Run in Supabase SQL editor as a privileged user.

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'UGX',
  payment_status text NOT NULL DEFAULT 'escrowed' CHECK (payment_status IN ('pending', 'escrowed', 'released', 'failed', 'refunded', 'disputed')),
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

CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  booking_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'disputed')),
  total_amount numeric(12,2) NOT NULL CHECK (total_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Customer can see their own bookings.
CREATE POLICY "Bookings select by customer"
  ON public.bookings FOR SELECT
  USING (auth.uid() = customer_id);

-- Provider can see bookings assigned to their provider row.
CREATE POLICY "Bookings select by provider"
  ON public.bookings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_id AND p.user_id = auth.uid()
    )
  );

-- Customer creates bookings for themselves.
CREATE POLICY "Bookings insert by customer"
  ON public.bookings FOR INSERT
  WITH CHECK (auth.uid() = customer_id);

-- Provider or customer may update status transitions within allowed flow.
CREATE POLICY "Bookings update by participant"
  ON public.bookings FOR UPDATE
  USING (
    auth.uid() = customer_id
    OR EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = customer_id
    OR EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_id AND p.user_id = auth.uid()
    )
  );

-- Payments are accessible to the buyer or seller for booking reconciliation.
CREATE POLICY "Payments select by participant"
  ON public.payments FOR SELECT
  USING (
    auth.uid() = customer_id
    OR EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_id AND p.user_id = auth.uid()
    )
  );

-- Payment creation is allowed when the booking belongs to the customer.
CREATE POLICY "Payments insert by customer"
  ON public.payments FOR INSERT
  WITH CHECK (
    auth.uid() = customer_id
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id AND b.customer_id = auth.uid()
    )
  );

-- Payment status can move only along the escrow workflow.
CREATE POLICY "Payments update by customer or provider"
  ON public.payments FOR UPDATE
  USING (
    auth.uid() = customer_id
    OR EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = customer_id
    OR EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_id AND p.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS bookings_customer_id_idx ON public.bookings(customer_id);
CREATE INDEX IF NOT EXISTS bookings_provider_id_idx ON public.bookings(provider_id);
CREATE INDEX IF NOT EXISTS payments_booking_id_idx ON public.payments(booking_id);
CREATE INDEX IF NOT EXISTS payments_customer_id_idx ON public.payments(customer_id);
CREATE INDEX IF NOT EXISTS payments_provider_id_idx ON public.payments(provider_id);

-- ================================================================
-- STATE-MACHINE ENFORCEMENT (server-side truth)
-- ================================================================
-- These triggers reject any status update that does not follow the legal
-- workflow. They must stay in sync with BOOKING_TRANSITIONS /
-- PAYMENT_TRANSITIONS in src/lib/state-machines.ts.
-- ================================================================

CREATE OR REPLACE FUNCTION public.validate_booking_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- pending -> confirmed | cancelled
  IF OLD.status = 'pending' AND NEW.status NOT IN ('confirmed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid booking status transition: % → %', OLD.status, NEW.status;
  END IF;

  -- confirmed -> in_progress | cancelled | disputed
  IF OLD.status = 'confirmed' AND NEW.status NOT IN ('in_progress', 'cancelled', 'disputed') THEN
    RAISE EXCEPTION 'Invalid booking status transition: % → %', OLD.status, NEW.status;
  END IF;

  -- in_progress -> completed | cancelled | disputed
  IF OLD.status = 'in_progress' AND NEW.status NOT IN ('completed', 'cancelled', 'disputed') THEN
    RAISE EXCEPTION 'Invalid booking status transition: % → %', OLD.status, NEW.status;
  END IF;

  -- completed / cancelled are terminal once the workflow ends
  IF OLD.status IN ('completed', 'cancelled') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'Invalid booking status transition: % → % (terminal)', OLD.status, NEW.status;
  END IF;

  -- disputed resolves only through admin adjudication -> completed (release) | cancelled (refund)
  IF OLD.status = 'disputed' AND NEW.status NOT IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid booking status transition: % → % (dispute must be adjudicated)', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.validate_payment_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.payment_status = OLD.payment_status THEN
    RETURN NEW;
  END IF;

  -- pending -> escrowed | failed
  IF OLD.payment_status = 'pending' AND NEW.payment_status NOT IN ('escrowed', 'failed') THEN
    RAISE EXCEPTION 'Invalid payment status transition: % → %', OLD.payment_status, NEW.payment_status;
  END IF;

  -- escrowed -> released | refunded | disputed | failed
  IF OLD.payment_status = 'escrowed' AND NEW.payment_status NOT IN ('released', 'refunded', 'disputed', 'failed') THEN
    RAISE EXCEPTION 'Invalid payment status transition: % → %', OLD.payment_status, NEW.payment_status;
  END IF;

  -- disputed -> released | refunded (admin adjudication only)
  IF OLD.payment_status = 'disputed' AND NEW.payment_status NOT IN ('released', 'refunded') THEN
    RAISE EXCEPTION 'Invalid payment status transition: % → %', OLD.payment_status, NEW.payment_status;
  END IF;

  -- released / refunded / failed are terminal
  IF OLD.payment_status IN ('released', 'refunded', 'failed') AND NEW.payment_status <> OLD.payment_status THEN
    RAISE EXCEPTION 'Invalid payment status transition: % → % (terminal)', OLD.payment_status, NEW.payment_status;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_booking_status ON public.bookings;
CREATE TRIGGER trg_validate_booking_status
  BEFORE UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.validate_booking_status_transition();

DROP TRIGGER IF EXISTS trg_validate_payment_status ON public.payments;
CREATE TRIGGER trg_validate_payment_status
  BEFORE UPDATE OF payment_status ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.validate_payment_status_transition();
