-- churchApp: let anyone (no sign-in) see how many times each app was installed.
-- Returns only the numbers per app (total and last 30 days), never device, place or time of each install.
-- The app_installs rows themselves stay readable by admin accounts only.
-- Run once in the Supabase SQL editor, after app-installs.sql. Safe to run twice.

create or replace function public.app_install_counts()
returns table (app text, total bigint, last_30_days bigint)
language sql
stable
security definer
set search_path = public
as $$
  select i.app,
         count(*) as total,
         count(*) filter (where i.created_at >= now() - interval '30 days') as last_30_days
  from public.app_installs i
  group by i.app
$$;

revoke all on function public.app_install_counts() from public;
grant execute on function public.app_install_counts() to anon, authenticated;
