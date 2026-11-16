-- churchApp: link each Nau Mpro song to its music sheet (PDF in the public 'hymn-scores' bucket).
-- Run once in the Supabase SQL editor, after hymn-import-nau-mpro.sql. Safe to run twice.

alter table public.lyric_songs add column if not exists score_path text not null default '';

update public.lyric_songs
set score_path = 'hymn-' || lpad(song_number, 4, '0') || '.pdf'
where local_id like 'nau-mpro-%' and score_path = '';
