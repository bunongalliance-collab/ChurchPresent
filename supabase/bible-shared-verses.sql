-- churchApp: verses shared with a church from the Bible reader (Nau Brah Ndu Ngơi, /nau-brah-ndu-ngoi/).
-- Run after churches.sql and churches-songs-readings.sql (it uses is_church_member, is_church_admin and church_names).
-- Run in the Supabase SQL editor. Safe to run again: run it again after this file changes.
--
-- Who can do what:
--   * Anyone who opens the Bible and chooses a church can read that church's shared verses (no sign-in), through
--     church_shared_verses(). It gives the name the sharer typed, never an email address or account id.
--   * Only a signed-in person who belongs to the church (church_members: its admins and editors) can share to it,
--     as themselves, up to 20 times a day. The church must be accepted.
--   * The sharer can remove their share. So can that church's admins.
--   * Shares cannot be edited.

create table if not exists public.bible_shared_verses (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sharer_name text not null check (length(trim(sharer_name)) between 1 and 60),
  book_code text not null check (book_code ~ '^[0-9A-Z]{3}$'),
  chapter smallint not null check (chapter between 1 and 150),
  verse_from smallint not null check (verse_from between 1 and 200),
  verse_to smallint not null check (verse_to between 1 and 200),
  note text not null default '' check (length(note) <= 280),
  created_at timestamptz not null default now(),
  constraint bible_shared_verses_range check (verse_to >= verse_from)
);
create index if not exists bible_shared_verses_church on public.bible_shared_verses (church_id, created_at desc);
create index if not exists bible_shared_verses_user on public.bible_shared_verses (user_id, created_at desc);

-- The database decides who shared it and when, and keeps one account from flooding a church
create or replace function public.bible_shared_verses_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.user_id := coalesce(auth.uid(), new.user_id);
  new.created_at := now();
  new.sharer_name := trim(new.sharer_name);
  new.note := trim(new.note);
  if (select count(*) from public.bible_shared_verses s
      where s.user_id = new.user_id and s.created_at > now() - interval '1 day') >= 20 then
    raise exception 'share_limit';
  end if;
  return new;
end $$;
drop trigger if exists bible_shared_verses_stamp on public.bible_shared_verses;
create trigger bible_shared_verses_stamp before insert on public.bible_shared_verses
  for each row execute function public.bible_shared_verses_stamp();

alter table public.bible_shared_verses enable row level security;

-- The table itself: only your own shares, or your church's if you are its admin (needed to remove them)
drop policy if exists "bible_shared_verses_read" on public.bible_shared_verses;
create policy "bible_shared_verses_read" on public.bible_shared_verses
  for select to authenticated using (user_id = auth.uid() or public.is_church_admin(church_id));
drop policy if exists "bible_shared_verses_insert" on public.bible_shared_verses;
create policy "bible_shared_verses_insert" on public.bible_shared_verses
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_church_member(church_id)
              and church_id in (select n.id from public.church_names() n));
drop policy if exists "bible_shared_verses_delete" on public.bible_shared_verses;
create policy "bible_shared_verses_delete" on public.bible_shared_verses
  for delete to authenticated using (user_id = auth.uid() or public.is_church_admin(church_id));
revoke all on public.bible_shared_verses from anon;

-- What readers see: the latest 100 shares of an accepted church. can_remove is true for the sharer and the admins.
create or replace function public.church_shared_verses(cid uuid)
returns table (id uuid, sharer_name text, book_code text, chapter smallint, verse_from smallint, verse_to smallint,
               note text, created_at timestamptz, can_remove boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.sharer_name, s.book_code, s.chapter, s.verse_from, s.verse_to, s.note, s.created_at,
         coalesce(s.user_id = auth.uid() or public.is_church_admin(s.church_id), false)
  from public.bible_shared_verses s
  join public.churches c on c.id = s.church_id and c.status = 'active'
  where s.church_id = cid
  order by s.created_at desc
  limit 100;
$$;
revoke all on function public.church_shared_verses(uuid) from public;
grant execute on function public.church_shared_verses(uuid) to anon, authenticated;
