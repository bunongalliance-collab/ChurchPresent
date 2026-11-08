-- churchApp: saved scripture studies (scripture-slides-v2.html)
-- Adds one table with owner-only row-level security, matching lyric_songs and bible_studies.
-- Run in the Supabase SQL editor AFTER schema.sql. Safe to run twice. Not run yet.

create table if not exists public.scripture_studies (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  study_title text not null default '',
  reference   text not null default '',
  -- Everything else about the study (passages, formatting, slide order) is kept here
  data        jsonb not null default '{}'::jsonb,
  -- The id the browser gave the study before it was saved to the account (avoids duplicates on import)
  local_id    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint scripture_studies_data_is_object check (jsonb_typeof(data) = 'object'),
  constraint scripture_studies_title_len check (char_length(study_title) <= 200)
);

create index if not exists scripture_studies_owner_idx on public.scripture_studies (owner_id, updated_at desc);
create unique index if not exists scripture_studies_local_idx on public.scripture_studies (owner_id, local_id) where local_id is not null;

drop trigger if exists scripture_studies_touch on public.scripture_studies;
create trigger scripture_studies_touch before update on public.scripture_studies
  for each row execute function public.touch_updated_at();

alter table public.scripture_studies enable row level security;

drop policy if exists "scripture_studies_owner_select" on public.scripture_studies;
create policy "scripture_studies_owner_select" on public.scripture_studies
  for select to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "scripture_studies_owner_insert" on public.scripture_studies;
create policy "scripture_studies_owner_insert" on public.scripture_studies
  for insert to authenticated with check (owner_id = (select auth.uid()));

drop policy if exists "scripture_studies_owner_update" on public.scripture_studies;
create policy "scripture_studies_owner_update" on public.scripture_studies
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists "scripture_studies_owner_delete" on public.scripture_studies;
create policy "scripture_studies_owner_delete" on public.scripture_studies
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Anonymous visitors get no access at all
revoke all on public.scripture_studies from anon;
