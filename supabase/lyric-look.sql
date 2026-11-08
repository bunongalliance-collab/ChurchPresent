-- churchApp: keep each song's formatting (font, colours, lines per slide, labels, repeats, size)
-- Adds one column to lyric_songs. Existing rows get an empty object, so nothing else changes.
-- Run in the Supabase SQL editor AFTER schema.sql. Safe to run twice. NOT RUN YET.

alter table public.lyric_songs
  add column if not exists look jsonb not null default '{}'::jsonb;

alter table public.lyric_songs
  drop constraint if exists lyric_songs_look_is_object;
alter table public.lyric_songs
  add constraint lyric_songs_look_is_object check (jsonb_typeof(look) = 'object');
