-- churchApp: database for a NEW Supabase project.
-- The church tools currently keep songs and studies in the browser only. These tables are for saving them
-- to an account, so they can be reached from any device. Each row belongs to one signed-in user, and row-level
-- security means nobody else can read or change it.
-- Run in the Supabase SQL editor on an empty project. Nothing here has been run against a database yet.

-- ---------------------------------------------------------------------------
-- Shared helper: keeps updated_at current on every change
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Saved lyrics (lyrics.html: "Save song")
-- ---------------------------------------------------------------------------
create table if not exists public.lyric_songs (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null default '',
  song_number text not null default '',
  lyrics      text not null default '',
  -- The id the browser gave the song before it was saved to the account (lets an import avoid duplicates)
  local_id    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint lyric_songs_title_len check (char_length(title) <= 200),
  constraint lyric_songs_lyrics_len check (char_length(lyrics) <= 100000)
);

create index if not exists lyric_songs_owner_idx on public.lyric_songs (owner_id, updated_at desc);
create unique index if not exists lyric_songs_local_idx on public.lyric_songs (owner_id, local_id) where local_id is not null;

drop trigger if exists lyric_songs_touch on public.lyric_songs;
create trigger lyric_songs_touch before update on public.lyric_songs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Saved Bible studies (bible-study.html: "Save study")
-- The whole study is kept in `data`: passages, titles, questions, custom slides, formatting and box order.
-- The key fields are also columns, so studies can be listed and searched without reading `data`.
-- ---------------------------------------------------------------------------
create table if not exists public.bible_studies (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  study_title text not null default '',
  reference   text not null default '',
  study_date  date,
  data        jsonb not null default '{}'::jsonb,
  local_id    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint bible_studies_data_is_object check (jsonb_typeof(data) = 'object')
);

create index if not exists bible_studies_owner_idx on public.bible_studies (owner_id, updated_at desc);
create unique index if not exists bible_studies_local_idx on public.bible_studies (owner_id, local_id) where local_id is not null;

drop trigger if exists bible_studies_touch on public.bible_studies;
create trigger bible_studies_touch before update on public.bible_studies
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security: a signed-in user sees and changes only their own rows
-- ---------------------------------------------------------------------------
alter table public.lyric_songs enable row level security;
alter table public.bible_studies enable row level security;

drop policy if exists "lyric_songs_owner_select" on public.lyric_songs;
create policy "lyric_songs_owner_select" on public.lyric_songs
  for select to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "lyric_songs_owner_insert" on public.lyric_songs;
create policy "lyric_songs_owner_insert" on public.lyric_songs
  for insert to authenticated with check (owner_id = (select auth.uid()));

drop policy if exists "lyric_songs_owner_update" on public.lyric_songs;
create policy "lyric_songs_owner_update" on public.lyric_songs
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists "lyric_songs_owner_delete" on public.lyric_songs;
create policy "lyric_songs_owner_delete" on public.lyric_songs
  for delete to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "bible_studies_owner_select" on public.bible_studies;
create policy "bible_studies_owner_select" on public.bible_studies
  for select to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "bible_studies_owner_insert" on public.bible_studies;
create policy "bible_studies_owner_insert" on public.bible_studies
  for insert to authenticated with check (owner_id = (select auth.uid()));

drop policy if exists "bible_studies_owner_update" on public.bible_studies;
create policy "bible_studies_owner_update" on public.bible_studies
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists "bible_studies_owner_delete" on public.bible_studies;
create policy "bible_studies_owner_delete" on public.bible_studies
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Anonymous visitors get no access at all (no policy for the anon role, and RLS is on)
revoke all on public.lyric_songs from anon;
revoke all on public.bible_studies from anon;
