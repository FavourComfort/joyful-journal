-- ================================================================
-- NINJAWO Phase 3: RLS hardening (PROPOSED - DO NOT APPLY TO PROD YET)
-- File: db/migrations/20251016_phase3_rls_hardening.sql
-- Evidence: Phase 2 audit verified prod has RLS OFF (relrowsecurity=false)
--   on all 14 public tables with full DML grants to anon+authenticated.
--   Policies exist in pg_policies but are DORMANT while RLS is off.
-- Strategy:
--   1. Least-privilege table grants (REVOKE ALL, re-grant minimal).
--   2. ENABLE RLS per table WITH its corrected policy set (never bare).
--   3. Fix defective policies with qualified column refs (bookings
--      provider ownership, completion_requests tautology, disputes
--      insert self-comparison, payments insert tautology).
--   4. Permissive-false "no direct" policies become RESTRICTIVE so they
--      actually deny (permissive false is a no-op). SECURITY DEFINER
--      RPCs run as owner and bypass RLS, so RPC flows keep working.
--   5. REVOKE EXECUTE on sensitive RPCs FROM anon (defence in depth;
--      in-function auth.uid() checks remain authoritative).
-- Preserved (not replaced): db/rls/payments_admin_select.sql (equivalent
--   admin SELECT included below), db/rls/*.sql intent, public provider
--   + active-service discovery, reviews readability, admin directories.
-- ============ 0. SAFETY: transactional, no data writes ============
BEGIN;
-- ============ 1. LEAST-PRIVILEGE TABLE GRANTS ============
-- Remove the verified anon+authenticated full-DML exposure (incl.
-- TRUNCATE/TRIGGER/REFERENCES/DELETE). Re-grant below per table is the
-- minimal set the app actually uses (see services + admin console reads).
-- service_role keeps full access (bypasses RLS by design; used by the
-- marzpay-webhook Edge Function with the service key - name only).

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','providers','services','availability','bookings','reviews',
    'payments','requests','offers','messages','request_notifications',
    'notifications','completion_requests','disputes']
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated, PUBLIC', t);
  END LOOP;
END $$;

-- Generic DML needed by the client paths that remain (RLS still enforced):
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.profiles, public.providers, public.services, public.bookings,
  public.reviews, public.payments, public.requests, public.offers,
  public.messages, public.request_notifications, public.notifications,
  public.completion_requests, public.disputes
  TO authenticated;
-- availability: orphan table - no app reads/writes found
-- (search only). No grants to anon/authenticated; owner + service_role only.
-- anon: discovery only (verified providers + active services).
-- ============ 2. PROFILES (self + admin) ============
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Profiles select own" ON public.profiles;
DROP POLICY IF EXISTS "Profiles insert own" ON public.profiles;
DROP POLICY IF EXISTS "Profiles update own" ON public.profiles;
DROP POLICY IF EXISTS "Allow authenticated user select own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow authenticated user to insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow authenticated user update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles select for admin" ON public.profiles;
CREATE POLICY "Profiles select own" ON public.profiles FOR SELECT
  USING (auth.uid() = profiles.id);
CREATE POLICY "Profiles insert own" ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = profiles.id);
CREATE POLICY "Profiles update own" ON public.profiles FOR UPDATE
  USING (auth.uid() = profiles.id) WITH CHECK (auth.uid() = profiles.id);
-- Preserved from db/rls/admin_moderation.sql:
CREATE POLICY "Profiles select for admin" ON public.profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ============ 3. PROVIDERS (public verified discovery + own + admin) ============
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Providers select public verified" ON public.providers;
DROP POLICY IF EXISTS "Providers insert own" ON public.providers;
DROP POLICY IF EXISTS "Providers update own" ON public.providers;
DROP POLICY IF EXISTS "Allow authenticated user insert own provider record" ON public.providers;
DROP POLICY IF EXISTS "Allow authenticated user select own provider record" ON public.providers;
DROP POLICY IF EXISTS "Allow authenticated user update own provider record" ON public.providers;
DROP POLICY IF EXISTS "providers insert own" ON public.providers;
DROP POLICY IF EXISTS "providers public read" ON public.providers;
DROP POLICY IF EXISTS "providers update own" ON public.providers;
DROP POLICY IF EXISTS "Providers are publicly viewable" ON public.providers;
DROP POLICY IF EXISTS "Providers select for admin" ON public.providers;
DROP POLICY IF EXISTS "Providers update verified flag for admin" ON public.providers;
-- Preserved intent from db/rls/providers_rls.sql (verified discovery):
CREATE POLICY "Providers select public verified" ON public.providers FOR SELECT
  USING (providers.verified = true OR auth.uid() = providers.user_id);
CREATE POLICY "Providers insert own" ON public.providers FOR INSERT
  WITH CHECK (auth.uid() = providers.user_id);
CREATE POLICY "Providers update own" ON public.providers FOR UPDATE
  USING (auth.uid() = providers.user_id) WITH CHECK (auth.uid() = providers.user_id);
-- Preserved from db/rls/admin_moderation.sql:
CREATE POLICY "Providers select for admin" ON public.providers FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
-- NOTE: direct admin UPDATE of verified kept for emergency use; the app path
-- is the admin_set_provider_verified RPC. Tightened WITH CHECK to verified-only
-- requires a trigger; documented as follow-up (see README section below).
CREATE POLICY "Providers update verified flag for admin" ON public.providers FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
GRANT SELECT ON TABLE public.providers TO anon;
GRANT SELECT ON TABLE public.services TO anon;

-- ============ 4. SERVICES (public active discovery + owner + admin) ============
-- FIXES Phase 2 P1: prod had owner-only SELECT, so anon search would break
-- once RLS is on. App reads active services publicly (services.service.ts:
-- getAllServices/searchServicesByCategory/searchServicesByTitle filter
-- active=true) and owner reads all own incl. inactive (provider.dashboard).
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Services select public active" ON public.services;
DROP POLICY IF EXISTS "Services select own" ON public.services;
DROP POLICY IF EXISTS "Services insert own" ON public.services;
DROP POLICY IF EXISTS "Services update own" ON public.services;
DROP POLICY IF EXISTS "Allow authenticated user insert own service" ON public.services;
DROP POLICY IF EXISTS "Allow authenticated user select own service" ON public.services;
DROP POLICY IF EXISTS "Allow authenticated user soft-delete own service" ON public.services;
DROP POLICY IF EXISTS "Allow authenticated user update own service" ON public.services;
DROP POLICY IF EXISTS "Services select for admin" ON public.services;
CREATE POLICY "Services select public active" ON public.services FOR SELECT
  USING (services.active = true);
CREATE POLICY "Services select own" ON public.services FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = services.provider_id AND p.user_id = auth.uid()));
CREATE POLICY "Services insert own" ON public.services FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = services.provider_id AND p.user_id = auth.uid()));
CREATE POLICY "Services update own" ON public.services FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = services.provider_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = services.provider_id AND p.user_id = auth.uid()));
-- Preserved intent of the commented optional block in
-- db/rls/payments_admin_select.sql (was commented out; enabled here so the
-- admin services directory works once RLS is on):
CREATE POLICY "Services select for admin" ON public.services FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ============ 5. BOOKINGS (FIX ownership + restrictive deny) ============
-- FIXES Phase 2 P0: prod policies compared auth.uid()=provider_id
-- (provider-row UUID vs user UUID, never matches). Corrected to the
-- provider-owner subquery. "No direct" policies become RESTRICTIVE so the
-- false actually denies (permissive false is a no-op); RPCs run as owner
-- (SECURITY DEFINER) and bypass RLS. Direct booking DELETE removed
-- (prod had contradictory allow+deny DELETE; app has no delete path).
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Bookings select by customer" ON public.bookings;
DROP POLICY IF EXISTS "Bookings select by provider" ON public.bookings;
DROP POLICY IF EXISTS "Bookings insert by customer" ON public.bookings;
DROP POLICY IF EXISTS "Bookings no direct update" ON public.bookings;
DROP POLICY IF EXISTS "Bookings no direct delete" ON public.bookings;
DROP POLICY IF EXISTS "Bookings select by customer or provider" ON public.bookings;
DROP POLICY IF EXISTS "Bookings update by customer or provider" ON public.bookings;
DROP POLICY IF EXISTS "Bookings delete by customer or provider" ON public.bookings;
DROP POLICY IF EXISTS "Bookings select for admin" ON public.bookings;
DROP POLICY IF EXISTS "Bookings delete for admin" ON public.bookings;
CREATE POLICY "Bookings select by customer" ON public.bookings FOR SELECT
  USING (auth.uid() IS NOT NULL AND auth.uid() = bookings.customer_id);
CREATE POLICY "Bookings select by provider" ON public.bookings FOR SELECT
  USING (auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.providers p
    WHERE p.id = bookings.provider_id AND p.user_id = auth.uid()));
CREATE POLICY "Bookings insert by customer" ON public.bookings FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = bookings.customer_id);
CREATE POLICY "Bookings no direct update" ON public.bookings
  AS RESTRICTIVE FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY "Bookings no direct delete" ON public.bookings
  AS RESTRICTIVE FOR DELETE USING (false);
-- Preserved from db/rls/admin_moderation.sql:
CREATE POLICY "Bookings select for admin" ON public.bookings FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE POLICY "Bookings delete for admin" ON public.bookings FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
-- ============ 6. PAYMENTS (FIX insert tautology + admin) ============
-- FIXES Phase 2 P0: WITH CHECK had (b.provider_id = b.provider_id).
-- Corrected to b.provider_id = payments.provider_id. Admin SELECT
-- preserves db/rls/payments_admin_select.sql verbatim (unapplied in prod).
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Payments select by participant" ON public.payments;
DROP POLICY IF EXISTS "Payments insert by customer" ON public.payments;
DROP POLICY IF EXISTS "Payments no direct update" ON public.payments;
DROP POLICY IF EXISTS "Payments no direct delete" ON public.payments;
DROP POLICY IF EXISTS "Customers can view their own payments" ON public.payments;
DROP POLICY IF EXISTS "Providers can view payments for their bookings" ON public.payments;
DROP POLICY IF EXISTS "Payments select for admin" ON public.payments;
CREATE POLICY "Payments select by participant" ON public.payments FOR SELECT
  USING (auth.uid() IS NOT NULL AND (
    auth.uid() = payments.customer_id OR EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = payments.provider_id AND p.user_id = auth.uid())));
CREATE POLICY "Payments insert by customer" ON public.payments FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL
    AND auth.uid() = payments.customer_id
    AND EXISTS (SELECT 1 FROM public.bookings b
      WHERE b.id = payments.booking_id
        AND b.customer_id = auth.uid()
        AND b.provider_id = payments.provider_id));
CREATE POLICY "Payments no direct update" ON public.payments
  AS RESTRICTIVE FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY "Payments no direct delete" ON public.payments
  AS RESTRICTIVE FOR DELETE USING (false);
CREATE POLICY "Payments select for admin" ON public.payments FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
-- ============ 7. DISPUTES (FIX insert self-comparison) ============
-- FIXES Phase 2 P0: live WITH CHECK had
-- NOT EXISTS (... WHERE d.booking_id = d.booking_id) which is true only
-- when the table is empty. Corrected with a trigger-safe function-free
-- form: the uniqueness of booking_id (UNIQUE in db/disputes.sql:17) plus
-- a booking-ownership check. Duplicate attempts fail on the UNIQUE
-- constraint instead of a tautological policy.
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Disputes select by customer" ON public.disputes;
DROP POLICY IF EXISTS "Disputes select by provider" ON public.disputes;
DROP POLICY IF EXISTS "Disputes select by admin" ON public.disputes;
DROP POLICY IF EXISTS "Disputes insert by customer" ON public.disputes;
DROP POLICY IF EXISTS "Disputes no direct update" ON public.disputes;
DROP POLICY IF EXISTS "Disputes no direct delete" ON public.disputes;
CREATE POLICY "Disputes select by customer" ON public.disputes FOR SELECT
  USING (auth.uid() IS NOT NULL AND auth.uid() = disputes.customer_id);
CREATE POLICY "Disputes select by provider" ON public.disputes FOR SELECT
  USING (auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.providers p
    WHERE p.id = disputes.provider_id AND p.user_id = auth.uid()));
CREATE POLICY "Disputes select by admin" ON public.disputes FOR SELECT
  USING (auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE pr.id = auth.uid() AND pr.role = 'admin'));
CREATE POLICY "Disputes insert by customer" ON public.disputes FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL
    AND auth.uid() = disputes.customer_id
    AND EXISTS (SELECT 1 FROM public.bookings b
      WHERE b.id = disputes.booking_id
        AND b.customer_id = auth.uid()
        AND b.provider_id = disputes.provider_id));
CREATE POLICY "Disputes no direct update" ON public.disputes
  AS RESTRICTIVE FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY "Disputes no direct delete" ON public.disputes
  AS RESTRICTIVE FOR DELETE USING (false);
-- ============ 8. COMPLETION_REQUESTS (FIX ownership tautology) ============
-- FIXES Phase 2 P0: live WITH CHECK had (b.provider_id = b.provider_id).
-- Local db/escrow_completion_requests.sql:29-31 already correct; mirrored
-- here with qualified refs.
ALTER TABLE public.completion_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Completion requests select by participant" ON public.completion_requests;
DROP POLICY IF EXISTS "Completion requests create by assigned provider" ON public.completion_requests;
DROP POLICY IF EXISTS "Completion requests update by assigned provider" ON public.completion_requests;
CREATE POLICY "Completion requests select by participant" ON public.completion_requests FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.bookings b
    WHERE b.id = completion_requests.booking_id
      AND (b.customer_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.providers p
        WHERE p.id = b.provider_id AND p.user_id = auth.uid()))));
CREATE POLICY "Completion requests create by assigned provider" ON public.completion_requests FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.providers p
      WHERE p.id = completion_requests.provider_id AND p.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.bookings b
      WHERE b.id = completion_requests.booking_id
        AND b.provider_id = completion_requests.provider_id
        AND b.status IN ('confirmed', 'in_progress')));
CREATE POLICY "Completion requests update by assigned provider" ON public.completion_requests FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.providers p
    WHERE p.id = completion_requests.provider_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.providers p
    WHERE p.id = completion_requests.provider_id AND p.user_id = auth.uid()));
-- ============ 9. REVIEWS (FIX: readable + customer insert) ============
-- FIXES Phase 2 P1: prod had admin-only SELECT and no INSERT, so
-- getProviderReviews/getProviderAverageRating (reviews.service.ts:37-50,
-- 150-170) and createReview (reviews.service.ts:68-105) would break once
-- RLS is on. Preservation: public can read reviews (needed for provider
-- profile pages); only the booking customer may insert/update own review;
-- deletes stay admin-only via admin_delete_review RPC (dormant, preserved).
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Reviews select public" ON public.reviews;
DROP POLICY IF EXISTS "Reviews insert by booking customer" ON public.reviews;
DROP POLICY IF EXISTS "Reviews update by author" ON public.reviews;
DROP POLICY IF EXISTS "Reviews select for admin" ON public.reviews;
DROP POLICY IF EXISTS "Reviews delete for admin" ON public.reviews;
CREATE POLICY "Reviews select public" ON public.reviews FOR SELECT USING (true);
CREATE POLICY "Reviews insert by booking customer" ON public.reviews FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL
    AND auth.uid() = reviews.customer_id
    AND EXISTS (SELECT 1 FROM public.bookings b
      WHERE b.id = reviews.booking_id
        AND b.customer_id = auth.uid()
        AND b.provider_id = reviews.provider_id
        AND b.status = 'completed'));
CREATE POLICY "Reviews update by author" ON public.reviews FOR UPDATE
  USING (auth.uid() = reviews.customer_id)
  WITH CHECK (auth.uid() = reviews.customer_id);
-- Preserved from db/rls/admin_moderation.sql:
CREATE POLICY "Reviews select for admin" ON public.reviews FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE POLICY "Reviews delete for admin" ON public.reviews FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
-- ============ 10. MESSAGES (preserve participant-only) ============
-- Mirrors db/rls/messages.sql. No anon access (inbox requires auth).
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Messages select for participants" ON public.messages;
DROP POLICY IF EXISTS "Messages insert by sender" ON public.messages;
CREATE POLICY "Messages select for participants" ON public.messages FOR SELECT
  USING (auth.uid() = messages.sender_id OR auth.uid() = messages.recipient_id);
CREATE POLICY "Messages insert by sender" ON public.messages FOR INSERT
  WITH CHECK (auth.uid() = messages.sender_id AND (
    EXISTS (SELECT 1 FROM public.providers p
      WHERE p.id = messages.provider_id AND p.user_id = messages.recipient_id)
    OR EXISTS (SELECT 1 FROM public.providers p
      WHERE p.id = messages.provider_id AND p.user_id = messages.sender_id)));
-- ============ 11. REQUESTS + OFFERS (preserve + admin) ============
-- Mirrors db/rls/requests_offers.sql + db/rls/admin_moderation.sql.
-- Customer accept/decline path (requests.service.ts acceptOffer/declineOffer
-- via setOfferStatus) requires the request owner to update offer status;
-- preserved as "Offers update status by request owner" (status-only
-- enforcement is a documented follow-up; see README).
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Requests select for owner or providers" ON public.requests;
DROP POLICY IF EXISTS "Requests insert by authenticated owner" ON public.requests;
DROP POLICY IF EXISTS "Requests update by owner" ON public.requests;
DROP POLICY IF EXISTS "Requests update/delete by owner" ON public.requests;
DROP POLICY IF EXISTS "Requests delete by owner" ON public.requests;
DROP POLICY IF EXISTS "Requests select for admin" ON public.requests;
DROP POLICY IF EXISTS "Requests delete for admin" ON public.requests;
CREATE POLICY "Requests select for owner or providers" ON public.requests FOR SELECT
  USING (auth.uid() = requests.customer_id
    OR EXISTS (SELECT 1 FROM public.providers p WHERE p.user_id = auth.uid()));
CREATE POLICY "Requests insert by authenticated owner" ON public.requests FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = requests.customer_id);
CREATE POLICY "Requests update by owner" ON public.requests FOR UPDATE
  USING (auth.uid() = requests.customer_id)
  WITH CHECK (auth.uid() = requests.customer_id);
CREATE POLICY "Requests delete by owner" ON public.requests FOR DELETE
  USING (auth.uid() = requests.customer_id);
CREATE POLICY "Requests select for admin" ON public.requests FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE POLICY "Requests delete for admin" ON public.requests FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
DROP POLICY IF EXISTS "Offers insert by provider" ON public.offers;
DROP POLICY IF EXISTS "Offers select for provider or request owner" ON public.offers;
DROP POLICY IF EXISTS "Offers update by provider" ON public.offers;
DROP POLICY IF EXISTS "Offers update/delete by provider" ON public.offers;
DROP POLICY IF EXISTS "Offers delete by provider" ON public.offers;
DROP POLICY IF EXISTS "Offers select for admin" ON public.offers;
DROP POLICY IF EXISTS "Offers delete for admin" ON public.offers;
DROP POLICY IF EXISTS "Offers update status by request owner" ON public.offers;
CREATE POLICY "Offers insert by provider" ON public.offers FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.providers p
    WHERE p.id = offers.provider_id AND p.user_id = auth.uid()));
CREATE POLICY "Offers select for provider or request owner" ON public.offers FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.providers p
      WHERE p.id = offers.provider_id AND p.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.requests r
      WHERE r.id = offers.request_id AND r.customer_id = auth.uid()));
CREATE POLICY "Offers update by provider" ON public.offers FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.providers p
    WHERE p.id = offers.provider_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.providers p
    WHERE p.id = offers.provider_id AND p.user_id = auth.uid()));
CREATE POLICY "Offers delete by provider" ON public.offers FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.providers p
    WHERE p.id = offers.provider_id AND p.user_id = auth.uid()));
CREATE POLICY "Offers update status by request owner" ON public.offers FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.requests r
    WHERE r.id = offers.request_id AND r.customer_id = auth.uid()));
CREATE POLICY "Offers select for admin" ON public.offers FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE POLICY "Offers delete for admin" ON public.offers FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
-- ============ 12. NOTIFICATIONS (own + admin read) ============
-- Preserves NotificationBell useNotifications + /notifications page
-- (notifications.service.ts getUserNotifications/mark...). Prod had only
-- own SELECT/UPDATE; admin directory (admin.service.ts:816-860) needs an
-- admin SELECT, added here (error string at admin.service.ts:837 already
-- anticipates it).
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Notifications select for admin" ON public.notifications;
CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT
  USING (notifications.user_id = auth.uid());
CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE
  USING (notifications.user_id = auth.uid())
  WITH CHECK (notifications.user_id = auth.uid());
CREATE POLICY "Notifications select for admin" ON public.notifications FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ============ 13. REQUEST_NOTIFICATIONS (preserve) ============
-- Mirrors db/rls/request_notifications.sql verbatim.
ALTER TABLE public.request_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Request notifications insert by request owner" ON public.request_notifications;
DROP POLICY IF EXISTS "Request notifications select by provider" ON public.request_notifications;
DROP POLICY IF EXISTS "Request notifications update by provider" ON public.request_notifications;
DROP POLICY IF EXISTS "Request notifications select for admin" ON public.request_notifications;
DROP POLICY IF EXISTS "Request notifications delete for admin" ON public.request_notifications;
CREATE POLICY "Request notifications insert by request owner" ON public.request_notifications FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.requests r
    WHERE r.id = request_notifications.request_id AND r.customer_id = auth.uid()));
CREATE POLICY "Request notifications select by provider" ON public.request_notifications FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.providers p
    WHERE p.id = request_notifications.provider_id AND p.user_id = auth.uid()));
CREATE POLICY "Request notifications update by provider" ON public.request_notifications FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.providers p
    WHERE p.id = request_notifications.provider_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.providers p
    WHERE p.id = request_notifications.provider_id AND p.user_id = auth.uid()));
CREATE POLICY "Request notifications select for admin" ON public.request_notifications FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE POLICY "Request notifications delete for admin" ON public.request_notifications FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ============ 14. AVAILABILITY (orphan: lock down, RLS on, no policies) ============
-- No app reads/writes found (codebase search: only UI label text).
-- RLS enabled with zero policies = deny-all for anon/authenticated.
-- Owner + service_role retain access. If a feature needs it later, add a
-- narrow policy then. This also resolves the Phase 2 "granted but
-- policyless" exposure without guessing a model.
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;
-- ============ 15. FUNCTION GRANTS (REVOKE anon, keep authenticated) ============
-- Audit result (local sources): every sensitive RPC re-checks auth inside:
--  create_booking_with_escrow_payment: auth.uid()=p_customer_id + fee rules
--    (escrow_schema.sql:594-608, 632-668)
--  release_escrow_to_provider: auth required + customer match (866-930)
--  cancel_booking_and_refund: auth + customer-or-provider check (1084-1142)
--  provider_update_booking_status: provider-of-booking check
--    (provider_booking_status.sql:37-48)
--  raise_dispute/respond/adjudicate/close: customer/provider/admin checks
--    (disputes.sql:144-148, 240-245, 293-295, 379-381)
--  admin_set_provider_verified / admin_delete_review: is_admin_user()
--    (admin_set_provider_verified.sql:49, admin_delete_review.sql:53)
--  is_admin_user itself: STABLE SECURITY DEFINER, no writes
--    (disputes.sql:111-117)
-- The local files already REVOKE FROM PUBLIC + GRANT TO authenticated for
-- the newer files, but Phase 2 verified prod still has anon EXECUTE on all
-- of them (Supabase default privileges re-grant anon despite REVOKE FROM
-- PUBLIC - see db/admin_delete_review.sql:84-87 comment). Belt-and-braces:
-- explicitly REVOKE FROM anon as well. In-function checks stay authoritative.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT p.oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'create_booking_with_escrow_payment', 'release_escrow_to_provider',
      'cancel_booking_and_refund', 'provider_update_booking_status',
      'raise_dispute', 'respond_to_dispute', 'adjudicate_dispute',
      'close_dispute', 'admin_set_provider_verified', 'admin_delete_review')
  LOOP
    -- Function OID cast to regprocedure renders the fully-qualified,
    -- overload-safe signature (e.g. public.create_booking_with_escrow_payment(uuid,
    -- numeric)) which is the only valid ON FUNCTION target for REVOKE/GRANT.
    -- It keeps argument lists with quoted identifiers, defaults or spaces
    -- intact, instead of interpolating raw identity-argument text.
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, PUBLIC',
      r.oid::regprocedure);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',
      r.oid::regprocedure);
  END LOOP;
END $$;
-- is_admin_user: callable by anon is harmless (returns false for anon) but
-- least-privilege says revoke anon anyway; authenticated + service_role keep.
DO $$
DECLARE
  sig text;
BEGIN
  FOR sig IN SELECT * FROM unnest(ARRAY[
    'public.is_admin_user()',
    'public.is_admin_user(uuid)',
    'public.is_admin_user(uuid, text)',
    'public.is_admin_user(uuid, boolean)',
    'public.is_admin_user(uuid, text, text)'])
  LOOP
    BEGIN
      EXECUTE 'REVOKE ALL ON FUNCTION ' || sig || ' FROM anon, PUBLIC';
    EXCEPTION WHEN undefined_function THEN NULL;
    END;
    BEGIN
      EXECUTE 'GRANT EXECUTE ON FUNCTION ' || sig || ' TO authenticated';
    EXCEPTION WHEN undefined_function THEN NULL;
    END;
  END LOOP;
END $$;

COMMIT;
-- ============ ROLLBACK ============
-- Transactional: any error rolls back everything. To undo after COMMIT,
-- restore from the pre-apply pg_policies + role_table_grants snapshot
-- (capture queries in db/migrations/20251016_phase3_ROLLOUT.md).

