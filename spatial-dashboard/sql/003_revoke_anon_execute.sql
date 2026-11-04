-- Change note (Claude, Oct 2026): close the open advisor finding from the 2026-09-23 scan.
-- is_member() and is_admin_user() are SECURITY DEFINER and were executable by anon (and PUBLIC).
-- Only signed-in sessions (authenticated) and the server (service_role) need them for RLS.
-- Paste in the Geoxis Supabase SQL editor (project ncifprfgastofurrlsko). Safe to re-run.
revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.is_admin_user() from public, anon;
grant execute on function public.is_member(uuid) to authenticated, service_role;
grant execute on function public.is_admin_user() to authenticated, service_role;
