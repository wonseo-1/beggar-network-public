-- ============================================================
-- Admin identity — single source of truth for RLS policies
-- ============================================================
-- Run this BEFORE any migration that uses is_admin(). Replace the email
-- below with your actual admin account, then run this in the Supabase
-- SQL editor. This keeps the admin email out of every individual policy
-- file (previously it was hardcoded ~15+ times across sql/*.sql).
--
-- To change the admin later: re-run this ALTER with the new email, no
-- other SQL files need to change.

ALTER DATABASE postgres SET app.admin_email = 'seowon1221@gmail.com';

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT auth.jwt()->>'email' = current_setting('app.admin_email', true);
$$;
