-- churchApp: the songs you added with "Add to Presentation" on the Lyric page, saved on your account,
-- so Recent songs in the Presentation Builder and the Program show them on every device (phone, computer).
-- Before this the list lived only in one browser. The browser keeps its own copy too, so the list still
-- works offline and when signed out.
-- Each person sees and changes only their own list. Run once in the Supabase SQL editor. Safe to run twice.

create table if not exists public.added_songs (
  owner_id uuid not null references auth.users(id) on delete cascade,
  song_id uuid not null references public.lyric_songs(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (owner_id, song_id)
);

create index if not exists added_songs_owner_recent on public.added_songs (owner_id, added_at desc);

alter table public.added_songs enable row level security;

drop policy if exists "added_songs_owner_read" on public.added_songs;
create policy "added_songs_owner_read" on public.added_songs
  for select to authenticated using (auth.uid() = owner_id);

drop policy if exists "added_songs_owner_insert" on public.added_songs;
create policy "added_songs_owner_insert" on public.added_songs
  for insert to authenticated with check (auth.uid() = owner_id);

drop policy if exists "added_songs_owner_update" on public.added_songs;
create policy "added_songs_owner_update" on public.added_songs
  for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "added_songs_owner_delete" on public.added_songs;
create policy "added_songs_owner_delete" on public.added_songs
  for delete to authenticated using (auth.uid() = owner_id);
