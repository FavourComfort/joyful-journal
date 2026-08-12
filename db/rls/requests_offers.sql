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

-- REQUESTS: allow insert only when auth.uid() equals the `customer_id`
CREATE POLICY "Requests insert by owner"
  ON public.requests
  FOR INSERT
  WITH CHECK (auth.uid() = customer_id);

-- REQUESTS: allow update/delete only by the owner (customer)
CREATE POLICY "Requests update/delete by owner"
  ON public.requests
  FOR UPDATE, DELETE
  USING (auth.uid() = customer_id)
  WITH CHECK (auth.uid() = customer_id);

-- OFFERS: allow providers to insert offers where provider_id = auth.uid()
CREATE POLICY "Offers insert by provider"
  ON public.offers
  FOR INSERT
  WITH CHECK (auth.uid() = provider_id);

-- OFFERS: allow select for provider who made the offer OR the customer who owns the request
CREATE POLICY "Offers select for provider or request owner"
  ON public.offers
  FOR SELECT
  USING (
    auth.uid() = provider_id
    OR EXISTS (
      SELECT 1 FROM public.requests r WHERE r.id = request_id AND r.customer_id = auth.uid()
    )
  );

-- OFFERS: allow update/delete only by the provider who created the offer
CREATE POLICY "Offers update/delete by provider"
  ON public.offers
  FOR UPDATE, DELETE
  USING (auth.uid() = provider_id)
  WITH CHECK (auth.uid() = provider_id);

-- Notes:
-- - If you want customers to accept/decline offers by updating a column on offers
--   (for example `accepted boolean`), you may add a separate policy allowing
--   the request owner to update only that column. Use a `WITH CHECK` that
--   restricts which columns can be changed if desired.
-- - Adjust policies if you want unauthenticated users to read requests/offers.
