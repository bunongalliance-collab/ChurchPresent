-- churchApp: the service order shared with the congregation's Nau Mpro App ("Today's service").
-- The Program page's "Publish to Nau Mpro App" button writes one row per service date.
-- Everyone can read (the reader has no sign-in); only the person who published a row can change or remove it.
-- Run once in the Supabase SQL editor. Safe to run twice.

create table if not exists public.published_services (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  service_date date not null,           -- the day of the service, used to pick this week's order
  title text not null default '',       -- e.g. "Sunday Service"
  date_label text not null default '',  -- the date as printed on the program
  items jsonb not null default '[]',    -- [{ name, subs: [{ text, songId?, kind }] }]
  updated_at timestamptz not null default now(),
  unique (owner_id, service_date)
);

alter table public.published_services enable row level security;

drop policy if exists "published_services_public_read" on public.published_services;
create policy "published_services_public_read" on public.published_services
  for select using (true);

drop policy if exists "published_services_owner_insert" on public.published_services;
create policy "published_services_owner_insert" on public.published_services
  for insert with check (auth.uid() = owner_id);

drop policy if exists "published_services_owner_update" on public.published_services;
create policy "published_services_owner_update" on public.published_services
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "published_services_owner_delete" on public.published_services;
create policy "published_services_owner_delete" on public.published_services
  for delete using (auth.uid() = owner_id);
