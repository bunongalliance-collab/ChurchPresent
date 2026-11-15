-- churchApp: fix for app-visits.sql. Run once in the Supabase SQL editor. Safe to run twice. NOT RUN YET.
-- The visits read policy checks app_admins, but app_admins had row-level security with no read policy,
-- so the check could never see a row and nobody counted as admin. Each user may now read only their own row,
-- which is all the check needs. Nobody can list the other admins.

drop policy if exists "app_admins_self_read" on public.app_admins;
create policy "app_admins_self_read" on public.app_admins
  for select to authenticated using (user_id = auth.uid());
