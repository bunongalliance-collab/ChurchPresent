-- churchApp: where the app is opened from (signed-in users only).
-- Each signed-in user's visit is recorded once per browser session: time, account, IP address,
-- approximate city and country (from Vercel), and device (from the browser's user agent).
-- Only accounts listed in app_admins can read the visits. Users can add their own visits, nothing else.
-- Run once in the Supabase SQL editor. Safe to run twice. NOT RUN YET.

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.app_admins enable row level security;
-- Each user may read only their own row: the visits policies below need this to see whether you are an admin
drop policy if exists "app_admins_self_read" on public.app_admins;
create policy "app_admins_self_read" on public.app_admins
  for select to authenticated using (user_id = auth.uid());

create table if not exists public.app_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users(id) on delete cascade,   -- empty for anonymous visits
  email text not null default '',
  ip text not null default '',
  city text not null default '',
  region text not null default '',
  country text not null default '',
  device text not null default '',
  user_agent text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists app_visits_created_idx on public.app_visits (created_at desc);
create index if not exists app_visits_ip_created_idx on public.app_visits (ip, created_at desc);

alter table public.app_visits enable row level security;

-- A signed-in user can record only their own visit
drop policy if exists "app_visits_own_insert" on public.app_visits;
create policy "app_visits_own_insert" on public.app_visits
  for insert to authenticated with check (auth.uid() = user_id);

-- Only admins can read the visits
drop policy if exists "app_visits_admin_read" on public.app_visits;
create policy "app_visits_admin_read" on public.app_visits
  for select to authenticated using (exists (select 1 from public.app_admins a where a.user_id = auth.uid()));

-- Only admins can delete visits (to clear old entries)
drop policy if exists "app_visits_admin_delete" on public.app_visits;
create policy "app_visits_admin_delete" on public.app_visits
  for delete to authenticated using (exists (select 1 from public.app_admins a where a.user_id = auth.uid()));

-- Make yourself the admin: replace the email below with your sign-in email, then run this line.
-- insert into public.app_admins (user_id) select id from auth.users where email = 'YOUR_SIGN_IN_EMAIL' on conflict do nothing;
