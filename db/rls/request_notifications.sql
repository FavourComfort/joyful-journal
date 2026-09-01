-- In-app notifications sent to matching providers when a customer posts a request.
-- This is the inner notification channel (email delivery can be wired up later).
-- Run these in your Supabase SQL editor (or psql) as a privileged user.

CREATE TABLE IF NOT EXISTS public.request_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  subject text NOT NULL,
  message text NOT NULL,
  link text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'viewed', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX IF NOT EXISTS request_notifications_provider_id_idx ON public.request_notifications(provider_id);
CREATE INDEX IF NOT EXISTS request_notifications_request_id_idx ON public.request_notifications(request_id);

ALTER TABLE public.request_notifications ENABLE ROW LEVEL SECURITY;

-- The customer who posted the request is the one sending the notifications, so allow
-- them to insert notification rows for their own request only. The provider's user
-- is never the session that writes these rows.
DROP POLICY IF EXISTS "Request notifications insert by request owner" ON public.request_notifications;
CREATE POLICY "Request notifications insert by request owner"
  ON public.request_notifications FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = request_id AND r.customer_id = auth.uid()
    )
  );

-- A provider can read notifications addressed to their provider row.
DROP POLICY IF EXISTS "Request notifications select by provider" ON public.request_notifications;
CREATE POLICY "Request notifications select by provider"
  ON public.request_notifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_id AND p.user_id = auth.uid()
    )
  );

-- A provider can mark their own notifications as viewed/dismissed.
DROP POLICY IF EXISTS "Request notifications update by provider" ON public.request_notifications;
CREATE POLICY "Request notifications update by provider"
  ON public.request_notifications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_id AND p.user_id = auth.uid()
    )
  );

-- Admin can read/delete notifications for moderation consistency (additive).
DROP POLICY IF EXISTS "Request notifications select for admin" ON public.request_notifications;
CREATE POLICY "Request notifications select for admin"
  ON public.request_notifications FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "Request notifications delete for admin" ON public.request_notifications;
CREATE POLICY "Request notifications delete for admin"
  ON public.request_notifications FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));