-- One-off seed: promote your first admin (idempotent).
-- Run in your Supabase SQL editor (or psql) AFTER the auth.users / public.profiles
-- tables exist and the target user has signed up at least once.
--
-- 1) Edit the email below to match your admin account's email.
-- 2) Run the UPDATE to set role = 'admin'.
-- 3) Run the SELECT to confirm.

-- Promote the user with the given email to admin (no-op if already admin).
UPDATE public.profiles
SET role = 'admin'
WHERE id IN (
    SELECT id FROM auth.users WHERE email = 'comfortfavour@gmail.com'
)
AND role <> 'admin';

-- Confirm the promotion:
SELECT
    p.id,
    p.full_name,
    u.email,
    p.role,
    p.created_at
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email = 'comfortfavour@gmail.com';
