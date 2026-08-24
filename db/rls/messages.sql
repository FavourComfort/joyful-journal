-- Private customer/provider messages.
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(trim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_sender_id_idx ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS messages_recipient_id_idx ON public.messages(recipient_id);
CREATE INDEX IF NOT EXISTS messages_provider_id_idx ON public.messages(provider_id);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Messages select for participants" ON public.messages;
CREATE POLICY "Messages select for participants"
  ON public.messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

DROP POLICY IF EXISTS "Messages insert by sender" ON public.messages;
CREATE POLICY "Messages insert by sender"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND (
      -- Customers can start a conversation with the provider.
      EXISTS (
        SELECT 1 FROM public.providers p
        WHERE p.id = provider_id AND p.user_id = recipient_id
      )
      OR
      -- The provider can reply to a conversation involving that provider.
      EXISTS (
        SELECT 1 FROM public.providers p
        WHERE p.id = provider_id AND p.user_id = sender_id
      )
    )
  );