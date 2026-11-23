-- churchApp: Bible text stored in the database (first translation: Bunong Bible, Vietnam dialect).
-- Run once in the Supabase SQL editor AFTER app-visits.sql (it uses app_admins). Safe to run twice. NOT RUN YET.
--
-- Layout
--   bible_translations   one row per translation (e.g. 'bunong-vn')
--   bible_books          the 66 books, shared by every translation (codes match the Scripture page: GEN … REV)
--   bible_book_names     each translation's own name for a book (e.g. EXO -> 'Nau Ngluh')
--   bible_verses         one row per verse; a verse printed together with the next ("14-15") has verse_end
--   bible_headings       section headings, psalm titles and parallel-passage references, placed before a verse
--   bible_footnotes      translation notes, tied to a verse
-- Chapters are not a table of their own: they come from the verses.
-- Everyone (signed in or not) can read. Only accounts in app_admins can add, change or delete.
-- The verses themselves are loaded afterwards by the import script, not by this file.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.bible_translations (
  id         text primary key,                       -- short code, e.g. 'bunong-vn'
  name       text not null,
  language   text not null default '',
  source     text not null default '',               -- where the text came from
  created_at timestamptz not null default now(),
  constraint bible_translations_id_format check (id ~ '^[a-z0-9-]{2,40}$')
);

create table if not exists public.bible_books (
  code       text primary key,                       -- GEN, EXO, … 1CO, … REV
  book_order smallint not null unique check (book_order between 1 and 66),
  testament  text not null check (testament in ('OT', 'NT')),
  name       text not null                            -- English name
);

create table if not exists public.bible_book_names (
  translation_id text not null references public.bible_translations (id) on delete cascade,
  book_code      text not null references public.bible_books (code),
  name           text not null,                       -- e.g. 'Nau Ngluh'
  title_block    jsonb not null default '[]'::jsonb,  -- the title lines as printed on the book's first page
  primary key (translation_id, book_code)
);

create table if not exists public.bible_verses (
  translation_id text not null references public.bible_translations (id) on delete cascade,
  book_code      text not null references public.bible_books (code),
  chapter        smallint not null check (chapter > 0),
  verse          smallint not null check (verse > 0),
  verse_end      smallint check (verse_end is null or verse_end > verse),   -- set when printed as "14-15"
  text           text not null check (char_length(text) > 0),
  para           boolean not null default false,      -- verse starts a new paragraph (best guess from the print)
  primary key (translation_id, book_code, chapter, verse)
);

-- Keyword search on verse text ('simple' keeps every word as written; no English stemming)
create index if not exists bible_verses_search_idx on public.bible_verses using gin (to_tsvector('simple', text));

create table if not exists public.bible_headings (
  id             bigint generated always as identity primary key,
  translation_id text not null references public.bible_translations (id) on delete cascade,
  book_code      text not null references public.bible_books (code),
  chapter        smallint not null check (chapter > 0),
  before_verse   smallint not null check (before_verse > 0),
  position       smallint not null default 0,         -- order when several sit before the same verse
  kind           text not null check (kind in ('heading', 'title', 'parallel')),
  text           text not null
);
create index if not exists bible_headings_place_idx on public.bible_headings (translation_id, book_code, chapter, before_verse, position);

create table if not exists public.bible_footnotes (
  id             bigint generated always as identity primary key,
  translation_id text not null references public.bible_translations (id) on delete cascade,
  book_code      text not null references public.bible_books (code),
  chapter        smallint not null check (chapter > 0),
  verse          smallint not null check (verse > 0),
  verse_end      smallint,
  mark           text not null default '',            -- the letter printed in the text (a, b, c …)
  part           text,                                -- part of the verse, when printed as e.g. 17:5a
  text           text not null
);
create index if not exists bible_footnotes_place_idx on public.bible_footnotes (translation_id, book_code, chapter, verse);

-- ---------------------------------------------------------------------------
-- Row-level security: public read, admin write
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['bible_translations', 'bible_books', 'bible_book_names', 'bible_verses', 'bible_headings', 'bible_footnotes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_public_read', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_public_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_write', t);
    execute format('create policy %I on public.%I for all to authenticated
                      using (exists (select 1 from public.app_admins a where a.user_id = (select auth.uid())))
                      with check (exists (select 1 from public.app_admins a where a.user_id = (select auth.uid())))', t || '_admin_write', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- The 66 books (shared by all translations) and the first translation
-- ---------------------------------------------------------------------------
insert into public.bible_books (code, book_order, testament, name) values
  ('GEN', 1,'OT','Genesis'),('EXO', 2,'OT','Exodus'),('LEV', 3,'OT','Leviticus'),('NUM', 4,'OT','Numbers'),
  ('DEU', 5,'OT','Deuteronomy'),('JOS', 6,'OT','Joshua'),('JDG', 7,'OT','Judges'),('RUT', 8,'OT','Ruth'),
  ('1SA', 9,'OT','1 Samuel'),('2SA',10,'OT','2 Samuel'),('1KI',11,'OT','1 Kings'),('2KI',12,'OT','2 Kings'),
  ('1CH',13,'OT','1 Chronicles'),('2CH',14,'OT','2 Chronicles'),('EZR',15,'OT','Ezra'),('NEH',16,'OT','Nehemiah'),
  ('EST',17,'OT','Esther'),('JOB',18,'OT','Job'),('PSA',19,'OT','Psalms'),('PRO',20,'OT','Proverbs'),
  ('ECC',21,'OT','Ecclesiastes'),('SNG',22,'OT','Song of Songs'),('ISA',23,'OT','Isaiah'),('JER',24,'OT','Jeremiah'),
  ('LAM',25,'OT','Lamentations'),('EZK',26,'OT','Ezekiel'),('DAN',27,'OT','Daniel'),('HOS',28,'OT','Hosea'),
  ('JOL',29,'OT','Joel'),('AMO',30,'OT','Amos'),('OBA',31,'OT','Obadiah'),('JON',32,'OT','Jonah'),
  ('MIC',33,'OT','Micah'),('NAM',34,'OT','Nahum'),('HAB',35,'OT','Habakkuk'),('ZEP',36,'OT','Zephaniah'),
  ('HAG',37,'OT','Haggai'),('ZEC',38,'OT','Zechariah'),('MAL',39,'OT','Malachi'),
  ('MAT',40,'NT','Matthew'),('MRK',41,'NT','Mark'),('LUK',42,'NT','Luke'),('JHN',43,'NT','John'),
  ('ACT',44,'NT','Acts'),('ROM',45,'NT','Romans'),('1CO',46,'NT','1 Corinthians'),('2CO',47,'NT','2 Corinthians'),
  ('GAL',48,'NT','Galatians'),('EPH',49,'NT','Ephesians'),('PHP',50,'NT','Philippians'),('COL',51,'NT','Colossians'),
  ('1TH',52,'NT','1 Thessalonians'),('2TH',53,'NT','2 Thessalonians'),('1TI',54,'NT','1 Timothy'),('2TI',55,'NT','2 Timothy'),
  ('TIT',56,'NT','Titus'),('PHM',57,'NT','Philemon'),('HEB',58,'NT','Hebrews'),('JAS',59,'NT','James'),
  ('1PE',60,'NT','1 Peter'),('2PE',61,'NT','2 Peter'),('1JN',62,'NT','1 John'),('2JN',63,'NT','2 John'),
  ('3JN',64,'NT','3 John'),('JUD',65,'NT','Jude'),('REV',66,'NT','Revelation')
on conflict (code) do nothing;

insert into public.bible_translations (id, name, language, source) values
  ('bunong-vn', 'Bunong Bible (Vietnam dialect)', 'Bunong', 'Printed Bible PDFs, one per book (2013)')
on conflict (id) do nothing;

-- Check after running: should return 66 and 1
-- select (select count(*) from public.bible_books) as books, (select count(*) from public.bible_translations) as translations;
