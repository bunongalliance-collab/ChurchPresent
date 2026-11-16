-- churchApp: count installs of the Nau Mpro app (no sign-in needed).
-- One row per installed device: the app records itself the first time it opens from the home screen
-- (and when Chrome or Edge report the install). Saved by the server function api/install.js with the
-- service role key, so browsers cannot write here directly. Only accounts in app_admins can read it.
-- Run once in the Supabase SQL editor, after app-visits.sql (it uses app_admins). Safe to run twice.

create table if not exists public.app_installs (
  id uuid primary key default gen_random_uuid(),
  install_id text not null unique,          -- random id kept on the device, so one device counts once
  app text not null default 'nau-mpro',
  device text not null default '',
  how text not null default '',             -- 'home screen' (first launch) or 'browser prompt'
  city text not null default '',
  region text not null default '',
  country text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists app_installs_created_idx on public.app_installs (created_at desc);

alter table public.app_installs enable row level security;

drop policy if exists "app_installs_admin_read" on public.app_installs;
create policy "app_installs_admin_read" on public.app_installs
  for select to authenticated using (exists (select 1 from public.app_admins a where a.user_id = auth.uid()));

drop policy if exists "app_installs_admin_delete" on public.app_installs;
create policy "app_installs_admin_delete" on public.app_installs
  for delete to authenticated using (exists (select 1 from public.app_admins a where a.user_id = auth.uid()));
