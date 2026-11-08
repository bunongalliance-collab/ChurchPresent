-- churchApp: saved presentations (Presentation Builder)
-- One presentation = one ordered list of items (songs, scripture, custom slides) and its formatting.
-- Owner-only row-level security, matching lyric_songs and scripture_studies.
-- Run in the Supabase SQL editor AFTER schema.sql. Safe to run twice.

create table if not exists public.presentations (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null default '',
  -- The whole sequence: items in order, each with its own slides and formatting
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint presentations_data_is_object check (jsonb_typeof(data) = 'object'),
  constraint presentations_title_len check (char_length(title) <= 200)
);

create index if not exists presentations_owner_idx on public.presentations (owner_id, updated_at desc);

drop trigger if exists presentations_touch on public.presentations;
create trigger presentations_touch before update on public.presentations
  for each row execute function public.touch_updated_at();

alter table public.presentations enable row level security;

drop policy if exists "presentations_owner_select" on public.presentations;
create policy "presentations_owner_select" on public.presentations
  for select to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "presentations_owner_insert" on public.presentations;
create policy "presentations_owner_insert" on public.presentations
  for insert to authenticated with check (owner_id = (select auth.uid()));

drop policy if exists "presentations_owner_update" on public.presentations;
create policy "presentations_owner_update" on public.presentations
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists "presentations_owner_delete" on public.presentations;
create policy "presentations_owner_delete" on public.presentations
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Anonymous visitors get no access at all
revoke all on public.presentations from anon;
