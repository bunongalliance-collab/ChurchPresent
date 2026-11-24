-- churchApp: "a song or reading you use was edited or deleted" also covers presentations, not only programs.
-- Run after notifications-plans.sql. Run once in the Supabase SQL editor. Safe to run twice.
--
-- Presentations keep their own copy of a song's words, so after an edit they still show the old words until someone
-- updates them in the Presentation Builder; this tells the team. Presentations have no service date, so the ones
-- changed in the last 60 days count as current. Programs: unchanged (upcoming Sundays).

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

  -- Upcoming programs that use it
  for p in
    select id, church_id, service_date from public.programs
    where church_id is not null and service_date >= current_date and data::text like '%' || item_id::text || '%'
  loop
    if not exists (select 1 from public.notifications n where n.kind = 'library_changed' and n.church_id = p.church_id
                   and n.read_at is null and n.data ->> 'item_id' = item_id::text and n.data ->> 'program_id' = p.id::text) then
      perform public.notify_team(p.church_id, 'library_changed', jsonb_build_object(
        'item_id', item_id, 'item_kind', item_kind, 'item_title', item_title,
        'change', lower(tg_op), 'program_id', p.id, 'service_date', p.service_date));
    end if;
  end loop;

  -- Presentations changed in the last 60 days that use it
  for p in
    select id, church_id, title from public.presentations
    where church_id is not null and updated_at >= now() - interval '60 days' and data::text like '%' || item_id::text || '%'
  loop
    if not exists (select 1 from public.notifications n where n.kind = 'library_changed' and n.church_id = p.church_id
                   and n.read_at is null and n.data ->> 'item_id' = item_id::text and n.data ->> 'presentation_id' = p.id::text) then
      perform public.notify_team(p.church_id, 'library_changed', jsonb_build_object(
        'item_id', item_id, 'item_kind', item_kind, 'item_title', item_title,
        'change', lower(tg_op), 'presentation_id', p.id, 'presentation_title', p.title));
    end if;
  end loop;
  return coalesce(new, old);
end $$;
