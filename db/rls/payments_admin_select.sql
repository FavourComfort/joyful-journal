-- Admin READ-ONLY access to payment records (Phase 1 — Finance visibility).
-- ---------------------------------------------------------------------------
-- Run these in your Supabase SQL editor (or psql) as a privileged user.
--
-- WHY THIS IS NEEDED
-- db/escrow_schema.sql grants `public.payments` SELECT only to the paying
-- customer and the assigned provider, plus two explicit deny policies
-- ("Payments no direct update" / "Payments no direct delete", both USING
-- false). Nothing lets an administrator read payment rows, so the admin
-- command center cannot display transactions, escrow funds or platform fees.
--
-- WHAT THIS DOES *NOT* DO
--   * It does NOT modify or replace any existing payments policy.
--   * It is ADDITIVE and SELECT-ONLY: a row is visible if ANY SELECT policy
--     matches, so customer/provider access is unchanged.
--   * It grants the admin NO INSERT / UPDATE / DELETE ability whatsoever.
--     Payment state remains writable ONLY through the SECURITY DEFINER escrow
--     functions (create_booking_with_escrow_payment, release_escrow_to_provider,
--     cancel_booking_and_refund) and the dispute RPCs, and is still guarded by
--     trg_validate_payment_status. RLS is enabled, never disabled.
--
-- Mirrors the naming/structure of db/rls/admin_moderation.sql.

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Payments select for admin" ON public.payments;

CREATE POLICY "Payments select for admin"
  ON public.payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- ===========================================================================
-- OPTIONAL — apply ONLY if the command center reports that "Active services
-- could not be counted" (this repository contains no RLS definition for
-- public.services, so the table may be readable already).
--
-- Still ADDITIVE and SELECT-ONLY; it grants no write access.
-- ===========================================================================
--
-- ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS "Services select for admin" ON public.services;
--
-- CREATE POLICY "Services select for admin"
--   ON public.services
--   FOR SELECT
--   USING (
--     EXISTS (
--       SELECT 1 FROM public.profiles p
--       WHERE p.id = auth.uid() AND p.role = 'admin'
--     )
--   );
