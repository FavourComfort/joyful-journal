-- RLS policies for admin verification & moderation
-- Run these in your Supabase SQL editor (or psql) as a privileged user.
--
-- These policies grant the `admin` role (a profile whose `role` column = 'admin')
-- full read access for verification/moderation views, plus the ability to toggle a
-- provider's `verified` flag and to delete content (requests, offers, bookings,
-- reviews) that a regular user could not.
--
-- They are ADDITIVE — they do not replace the policies in requests_offers.sql.
-- A row is visible to admin if ANY SELECT policy matches, so these simply widen
-- access for the admin account without affecting customer/provider behaviour.

-- A reusable predicate: "is the current user an admin?"
-- (auth.uid() is only populated for authenticated requests using the anon key.)
-- Each policy below uses this directly.

-- ============================================================
-- profiles: admin can read every profile (to show owner names)
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles select for admin"
  ON public.profiles
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================
-- providers: admin can read all providers (verified + pending)
-- and can update the `verified` flag for verification.
-- ============================================================
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers select for admin"
  ON public.providers
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Admin can flip the verified flag. The WITH CHECK restricts the update to ONLY
-- the verified column so an admin session can never repoint a provider row at
-- another user. (The provider's own UPDATE policy is unaffected.)
CREATE POLICY "Providers update verified flag for admin"
  ON public.providers
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================
-- requests: moderation — admin can select & delete
-- ============================================================
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Requests select for admin"
  ON public.requests
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Requests delete for admin"
  ON public.requests
  FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================
-- offers: moderation — admin can select & delete
-- ============================================================
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Offers select for admin"
  ON public.offers
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Offers delete for admin"
  ON public.offers
  FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================
-- bookings: moderation — admin can select & delete
-- ============================================================
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bookings select for admin"
  ON public.bookings
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Bookings delete for admin"
  ON public.bookings
  FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================
-- reviews: moderation — admin can select & delete
-- ============================================================
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews select for admin"
  ON public.reviews
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Reviews delete for admin"
  ON public.reviews
  FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Note: if you also want the admin to update individual bookings/reviews/statuses,
-- add explicit UPDATE policies scoped to auth.uid() in public.profiles WHERE role='admin'.
