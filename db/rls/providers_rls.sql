-- RLS for public.providers.
-- The app reads provider profiles (search page, provider profile pages) and lets a
-- provider manage their own row (onboarding / dashboard). These policies are
-- ADDITIVE with the admin-scoped policies in admin_moderation.sql.

ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;

-- Anyone (including unauthenticated visitors) may read verified provider profiles,
-- so a customer can browse, view service details, opening a conversation, and book.
-- A provider can always read their own row too.
DROP POLICY IF EXISTS "Providers select public verified" ON public.providers;
CREATE POLICY "Providers select public verified"
  ON public.providers FOR SELECT
  USING (verified = true OR auth.uid() = user_id);

-- A provider can create their own provider row during onboarding.
DROP POLICY IF EXISTS "Providers insert own" ON public.providers;
CREATE POLICY "Providers insert own"
  ON public.providers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- A provider can update their own profile row.
DROP POLICY IF EXISTS "Providers update own" ON public.providers;
CREATE POLICY "Providers update own"
  ON public.providers FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);