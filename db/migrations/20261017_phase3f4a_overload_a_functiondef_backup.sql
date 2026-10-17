CREATE OR REPLACE FUNCTION public.create_booking_with_escrow_payment(p_customer_id uuid, p_provider_id uuid, p_service_id uuid, p_booking_date date, p_total_amount numeric, p_start_time time without time zone DEFAULT NULL::time without time zone, p_currency text DEFAULT 'UGX'::text, p_transaction_ref text DEFAULT NULL::text, p_payment_method text DEFAULT 'mock_checkout'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_booking_id uuid;
  v_payment_id uuid;
  v_platform_fee numeric(12,2);
  v_provider_amount numeric(12,2);
  v_booking_record json;
  v_payment_record json;
  v_result json;
BEGIN
  -- Validate inputs
  IF p_customer_id IS NULL OR p_provider_id IS NULL OR p_service_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Missing required parameters'
    );
  END IF;

  IF p_total_amount < 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Amount must be non-negative'
    );
  END IF;

  BEGIN
    -- STEP 1: Create booking with status 'pending'
    INSERT INTO public.bookings(
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
      'pending',
      p_total_amount
    )
    RETURNING id INTO v_booking_id;

    IF v_booking_id IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Failed to create booking'
      );
    END IF;

    -- STEP 2: Calculate fees (10% platform fee, 90% to provider)
    v_platform_fee := ROUND(p_total_amount * 0.1, 2);
    v_provider_amount := ROUND(p_total_amount - v_platform_fee, 2);

    -- STEP 3: Create payment as 'pending' (NOT 'escrowed' — MarzPay collection
    -- happens after this function returns, via ninjawo-handler + marzpay-webhook)
    INSERT INTO public.payments(
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
      p_currency,
      'pending',
      p_payment_method,
      p_transaction_ref,
      v_platform_fee,
      v_provider_amount
    )
    RETURNING id INTO v_payment_id;

    IF v_payment_id IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Failed to create payment record'
      );
    END IF;

    -- STEP 4: Fetch the full records for response
    SELECT row_to_json(b.*) INTO v_booking_record
    FROM public.bookings b
    WHERE b.id = v_booking_id;

    SELECT row_to_json(p.*) INTO v_payment_record
    FROM public.payments p
    WHERE p.id = v_payment_id;

    -- STEP 5: Return success with both records
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

END $function$
