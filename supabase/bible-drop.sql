-- churchApp: REMOVE the Bible tables and all their data (undo bible.sql and the bible-import files).
-- For a Supabase project where bible.sql was run by mistake. This cannot be undone.
-- Check the project name and URL in the dashboard before running. Touches only the six bible_* tables.

drop table if exists public.bible_footnotes;
drop table if exists public.bible_headings;
drop table if exists public.bible_verses;
drop table if exists public.bible_book_names;
drop table if exists public.bible_books;
drop table if exists public.bible_translations;

-- bible_studies (saved studies from schema.sql) is a different table and is NOT touched.
-- Check: should return no rows
-- select table_name from information_schema.tables where table_schema = 'public'
--   and table_name in ('bible_translations','bible_books','bible_book_names','bible_verses','bible_headings','bible_footnotes');
