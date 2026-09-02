-- Provider-initiated completion requests. Apply after escrow_schema.sql.
CREATE TABLE IF NOT EXISTS public.completion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.completion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Completion requests select by participant"
  ON public.completion_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id AND (
        b.customer_id = auth.uid() OR EXISTS (
          SELECT 1 FROM public.providers p
          WHERE p.id = b.provider_id AND p.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Completion requests create by assigned provider"
  ON public.completion_requests FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_id AND p.user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.provider_id = provider_id
        AND b.status IN ('confirmed', 'in_progress')
    )
  );

CREATE POLICY "Completion requests update by assigned provider"
  ON public.completion_requests FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_id AND p.user_id = auth.uid()));
