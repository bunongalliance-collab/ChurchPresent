-- churchApp: songs get a category and a language (chosen on the Lyrics page).
-- Adds two text columns to lyric_songs. Existing songs get empty values until they are set.
-- Run once in the Supabase SQL editor, after lyric-look.sql. Safe to run twice. NOT RUN YET.

alter table public.lyric_songs add column if not exists category text not null default '';
alter table public.lyric_songs add column if not exists language text not null default '';
