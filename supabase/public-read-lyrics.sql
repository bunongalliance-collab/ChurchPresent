-- Lyrics become publicly readable. Saving, editing and deleting still need a signed-in account,
-- and a signed-in user can only change songs they saved themselves.
-- Run once in the Supabase SQL editor, after schema.sql. Safe to run twice.

drop policy if exists "lyric_songs_owner_select" on public.lyric_songs;
drop policy if exists "lyric_songs_public_read" on public.lyric_songs;
create policy "lyric_songs_public_read" on public.lyric_songs
  for select to anon, authenticated using (true);

-- schema.sql revoked all access for anon; give back read only
grant select on public.lyric_songs to anon;
