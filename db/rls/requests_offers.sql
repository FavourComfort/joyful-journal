-- RLS and policies for `requests` and `offers` tables
-- Run these in your Supabase SQL editor (or psql) as a privileged user.

-- Enable RLS
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

-- REQUESTS: allow select for the request owner (customer) or any provider
-- (providers are users who have a row in `providers` table)
CREATE POLICY "Requests select for owner or providers"
  ON public.requests
  FOR SELECT
  USING (
    auth.uid() = customer_id
    OR EXISTS (SELECT 1 FROM public.providers p WHERE p.user_id = auth.uid())
  );

-- REQUESTS: any authenticated account may post, using its own user id.
DROP POLICY IF EXISTS "Requests insert by owner" ON public.requests;
DROP POLICY IF EXISTS "Requests insert by authenticated owner" ON public.requests;

CREATE POLICY "Requests insert by authenticated owner"
  ON public.requests
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = customer_id);

-- REQUESTS: allow update/delete only by the owner (customer)
CREATE POLICY "Requests update/delete by owner"
  ON public.requests
  FOR UPDATE, DELETE
  USING (auth.uid() = customer_id)
  WITH CHECK (auth.uid() = customer_id);

-- OFFERS: allow providers to insert offers where the offer is linked to their own
-- provider row. NOTE: `offers.provider_id` references `providers(id)`, NOT `auth.uid()`,
-- so mapthe session user to their provider row via `providers.user_id`.
DROP POLICY IF EXISTS "Offers insert by provider" ON public.offers;
CREATE POLICY "Offers insert by provider"
  ON public.offers
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_id AND p.user_id = auth.uid()
    )
  );

-- OFFERS: allow select for provider who made the offer ORthe customer who owns the request
DROP POLICY IF EXISTS "Offers select for provider or request owner" ON public.offers;
CREATE POLICY "Offers select for provider or request owner"
  ON public.offers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.requests r WHERE r.id = request_id AND r.customer_id = auth.uid()
    )
  );

-- OFFERS: allow update/delete only by the provider who created the offer
DROP POLICY IF EXISTS "Offers update/delete by provider" ON public.offers;
CREATE POLICY "Offers update/delete by provider"
  ON public.offers
  FOR UPDATE, DELETE
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

-- One offer per provider/request: enforce at the database level.
-- A provider may submit at most one offer for a given request. The service
-- already guards this in `createOffer`, but a DB-level unique constraint
-- re-inforces it against races and direct PostgREST writes. This also backs the
-- idempotent "create or reuse" flow.
CREATE UNIQUE INDEX IF NOT EXISTS offers_provider_request_unique
  ON public.offers (provider_id, request_id);

-- Notes:
-- - If you want customers to accept/decline offers by updating a column on offers
--   (for example `accepted boolean`), you may add a separate policy allowing
--   the request owner to update only that column. Use a `WITH CHECK` that
--   restricts which columns can be changed if desired.
-- - Adjust policies if you want unauthenticated users to read requests/offers.