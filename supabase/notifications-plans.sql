-- churchApp: notifications about service plans (programs) and the library (songs, readings). Run after
-- notifications.sql and programs.sql. Run once in the Supabase SQL editor. Safe to run twice.
--
-- Only what the team needs to act on, never every edit:
--   * "program_new"      a program is made for an upcoming Sunday            -> the church's team
--   * "published"        an upcoming program is published to Nau Mpro         -> the church's team
--   * "republish"        a published program changes after it was published  -> the church's admins (they publish), once
--                        per publish; publishing again clears it
--   * "library_changed"  a song or reading used in an upcoming program is edited or deleted -> that church's team,
--                        once until they have read it
-- The person who did it is never notified about their own change.

-- 1. Allow the new kinds
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('join_request', 'added', 'role', 'removed', 'church_waiting', 'program_new', 'published', 'republish', 'library_changed'));

-- Everyone on a church's team (admins and editors), optionally admins only, except the person acting
create or replace function public.notify_team(cid uuid, k text, d jsonb, admins_only boolean default false)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, church_id, actor_email, data)
  select m.user_id, k, cid, public.actor_email(), d || jsonb_build_object('church_name', c.name)
  from public.church_members m join public.churches c on c.id = m.church_id
  where m.church_id = cid and m.user_id is distinct from auth.uid() and (not admins_only or m.role = 'admin');
$$;
revoke all on function public.notify_team(uuid, text, jsonb, boolean) from public;

-- 2. A program for an upcoming Sunday is made; a published program changes
create or replace function public.notify_program_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare pub timestamptz;
begin
  if new.church_id is null or new.service_date < current_date then return new; end if;
  if tg_op = 'INSERT' then
    perform public.notify_team(new.church_id, 'program_new', jsonb_build_object('service_date', new.service_date));
    return new;
  end if;
  -- Changed after it was published: tell the admins once per publish (not on every save)
  select updated_at into pub from public.published_services where church_id = new.church_id and service_date = new.service_date;
  if pub is not null and new.data is distinct from old.data and new.updated_at > pub
     and not exists (select 1 from public.notifications n where n.kind = 'republish' and n.church_id = new.church_id
                     and n.data ->> 'service_date' = new.service_date::text and n.created_at > pub) then
    perform public.notify_team(new.church_id, 'republish', jsonb_build_object('service_date', new.service_date), true);
  end if;
  return new;
end $$;
drop trigger if exists programs_notify on public.programs;
create trigger programs_notify after insert or update on public.programs
  for each row execute function public.notify_program_change();

-- 3. An upcoming program is published (or published again)
create or replace function public.notify_published()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.church_id is null or new.service_date < current_date then return new; end if;
  -- Publishing again answers "Publish again?"
  update public.notifications set read_at = coalesce(read_at, now()), data = data || '{"resolved": "republished"}'::jsonb
   where kind = 'republish' and church_id = new.church_id and data ->> 'service_date' = new.service_date::text;
  perform public.notify_team(new.church_id, 'published', jsonb_build_object('service_date', new.service_date));
  return new;
end $$;
drop trigger if exists published_services_notify on public.published_services;
create trigger published_services_notify after insert or update on public.published_services
  for each row execute function public.notify_published();

-- 4. A song or reading used in an upcoming program is edited or deleted.
--    Programs link a picked song or reading by its id inside their data.
create or replace function public.notify_library_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  item_id uuid := old.id;
  item_kind text := case tg_table_name when 'lyric_songs' then 'song' else 'reading' end;
  item_title text := old.title;
  p record;
begin
  -- Only the words, title or number matter (not the slide look). Each table's fields are checked in its own branch.
  if tg_op = 'UPDATE' then
    if item_kind = 'song' then
      if new.lyrics is not distinct from old.lyrics and new.title is not distinct from old.title
         and new.song_number is not distinct from old.song_number then return new; end if;
    else
      if new.content is not distinct from old.content and new.title is not distinct from old.title
         and new.number is not distinct from old.number then return new; end if;
    end if;
  end if;
  for p in
    select id, church_id, service_date from public.programs
    where church_id is not null and service_date >= current_date and data::text like '%' || item_id::text || '%'
  loop
    -- Once per item and program until it has been read
    if not exists (select 1 from public.notifications n where n.kind = 'library_changed' and n.church_id = p.church_id
                   and n.read_at is null and n.data ->> 'item_id' = item_id::text and n.data ->> 'program_id' = p.id::text) then
      perform public.notify_team(p.church_id, 'library_changed', jsonb_build_object(
        'item_id', item_id, 'item_kind', item_kind, 'item_title', item_title,
        'change', lower(tg_op), 'program_id', p.id, 'service_date', p.service_date));
    end if;
  end loop;
  return coalesce(new, old);
end $$;
drop trigger if exists lyric_songs_notify on public.lyric_songs;
create trigger lyric_songs_notify after update or delete on public.lyric_songs
  for each row execute function public.notify_library_change();
drop trigger if exists readings_notify on public.readings;
create trigger readings_notify after update or delete on public.readings
  for each row execute function public.notify_library_change();
