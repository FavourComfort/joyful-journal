-- ============================================================
-- NINJAWO Phase 3F.6A - Backup of create_booking overload B
-- File: db/migrations/20261017_phase3f6a_overload_b_functiondef_backup.sql
-- ============================================================
-- Purpose
-- -------
--   Read-only backup of overload B of
--   public.create_booking_with_escrow_payment captured from
--   production before any proposed removal (Phase 3F.6).
--
--   This file is a restore source only. It is not a migration,
--   contains no DDL, and makes no changes to the database.
--
--   If overload B is ever removed by
--   db/migrations/20261017_drop_orphan_create_booking_b.sql,
--   this backup is the only source for restoring B, because B's
--   body exists in no git commit.
--
-- Source
-- ------
--   SELECT pg_get_functiondef(
--     'public.create_booking_with_escrow_payment(
--       uuid,uuid,uuid,date,time without time zone,time without time zone,
--       numeric,text,text,text)'::regprocedure);
--
--   Captured from production during Phase 3F.6A preflight.
--
-- Fingerprint
-- -----------
--   def_len:    3590
--   def_md5:    9aa4863372180526642a22428a81b8b0
--   prosrc_md5: cb23e83c4e4178f74858fac12151e956
--   prosrc_len: 3115
--
-- Overload identity (exact, from pg_get_function_identity_arguments):
--
--   (uuid, uuid, uuid, date, time without time zone,
--    time without time zone, numeric, text, text, text)
--
--   Distinguished from C:
--     C: (uuid, uuid, uuid, date, time without time zone, numeric,
--         numeric, text, text, text)  -- has p_service_fee, NOT p_end_time
--
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_booking_with_escrow_payment(p_customer_id uuid, p_provider_id uuid, p_service_id uuid, p_booking_date date, p_start_time time without time zone, p_end_time time without time zone, p_total_amount numeric, p_currency text DEFAULT 'UGX'::text, p_transaction_ref text DEFAULT NULL::text, p_payment_method text DEFAULT 'marzpay'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking_id uuid;
  v_payment_id uuid;

  v_platform_fee numeric(12,2);
  v_provider_amount numeric(12,2);

  v_booking json;
  v_payment json;

BEGIN

  IF auth.uid() IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Authentication required'
    );
  END IF;

  IF p_customer_id <> auth.uid() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Customer authorization failed'
    );
  END IF;

  IF p_provider_id IS NULL
     OR p_service_id IS NULL
     OR p_booking_date IS NULL
     OR p_start_time IS NULL
     OR p_end_time IS NULL
  THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Required booking information is missing'
    );
  END IF;

  IF p_total_amount IS NULL OR p_total_amount <= 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Booking amount must be greater than zero'
    );
  END IF;

  IF p_end_time <= p_start_time THEN
    RETURN json_build_object(
      'success', false,
      'error', 'End time must be after start time'
    );
  END IF;

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

  v_platform_fee := ROUND(p_total_amount * 0.10, 2);
  v_provider_amount := p_total_amount - v_platform_fee;

  INSERT INTO public.bookings (
    customer_id,
    provider_id,
    service_id,
    booking_date,
    start_time,
    end_time,
    status,
    total_amount
  )
  VALUES (
    p_customer_id,
    p_provider_id,
    p_service_id,
    p_booking_date,
    p_start_time,
    p_end_time,
    'pending',
    p_total_amount
  )
  RETURNING id INTO v_booking_id;

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
    COALESCE(NULLIF(p_payment_method, ''), 'marzpay'),
    p_transaction_ref,
    v_platform_fee,
    v_provider_amount
  )
  RETURNING id INTO v_payment_id;

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
$function$