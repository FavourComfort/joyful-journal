-- Allow the customer (request owner) to accept or decline an offer made on their
-- request. This is ADDITIVE with the provider-scoped update policy in
-- requests_offers.sql ("Offers update/delete by provider").

DROP POLICY IF EXISTS "Offers update status by request owner" ON public.offers;
CREATE POLICY "Offers update status by request owner"
  ON public.offers FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.requests r WHERE r.id = request_id AND r.customer_id = auth.uid())
  );