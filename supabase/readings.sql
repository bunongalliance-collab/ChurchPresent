-- churchApp: Readings (non-song passages) and reading categories.
-- Readings are public to read, like lyric_songs. Saving, editing and deleting need a signed-in
-- account, and a user can only change readings they saved. Categories are private per user.
-- Run once in the Supabase SQL editor, after schema.sql and public-read-lyrics.sql. Safe to run twice.
-- NOT RUN YET: waiting for approval.

create table if not exists public.reading_categories (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  constraint reading_categories_name_len check (char_length(name) between 1 and 60)
);
create index if not exists reading_categories_owner_idx on public.reading_categories (owner_id, sort_order);

create table if not exists public.readings (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null default '',
  category_id uuid references public.reading_categories (id) on delete set null,
  content     text not null default '',
  -- Formatting and slide appearance the reading was saved with
  look        jsonb not null default '{}'::jsonb,
  local_id    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint readings_title_len check (char_length(title) <= 200),
  constraint readings_look_is_object check (jsonb_typeof(look) = 'object')
);
create index if not exists readings_owner_idx on public.readings (owner_id, updated_at desc);

drop trigger if exists readings_touch on public.readings;
create trigger readings_touch before update on public.readings
  for each row execute function public.touch_updated_at();

alter table public.readings enable row level security;
alter table public.reading_categories enable row level security;

-- Readings: everyone can read; only the owner can insert, update or delete
drop policy if exists "readings_public_read" on public.readings;
create policy "readings_public_read" on public.readings
  for select to anon, authenticated using (true);
drop policy if exists "readings_owner_insert" on public.readings;
create policy "readings_owner_insert" on public.readings
  for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "readings_owner_update" on public.readings;
create policy "readings_owner_update" on public.readings
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "readings_owner_delete" on public.readings;
create policy "readings_owner_delete" on public.readings
  for delete to authenticated using (owner_id = (select auth.uid()));
grant select on public.readings to anon;

-- Categories: private to the owner
drop policy if exists "reading_categories_owner_all" on public.reading_categories;
create policy "reading_categories_owner_all" on public.reading_categories
  for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
