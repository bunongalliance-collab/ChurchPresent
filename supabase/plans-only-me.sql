-- churchApp: "Only me" for presentations and Scripture studies. Run after churches-team-work.sql and
-- notifications-presentations.sql. Run once in the Supabase SQL editor. Safe to run twice.
--
--   * A presentation or Scripture study marked private is seen and changed only by the person who made it, even
--     though it belongs to the church (a pastor preparing a sermon). "Share with the team" makes it a team item again.
--   * Only the person who made it can make it private, so nobody can hide someone else's work.
--   * Notifications about edited songs and readings skip private presentations.
--   * Programs are not affected: each Sunday's program is always the team's.

-- 1. The flag
alter table public.presentations add column if not exists private boolean not null default false;
alter table public.scripture_studies add column if not exists private boolean not null default false;

-- 2. Who may see and change: the church's team for a shared item; only its maker for a private one
do $$
declare t text;
begin
  foreach t in array array['presentations', 'scripture_studies'] loop
    execute format('drop policy if exists %I on public.%I', t || '_owner_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.can_edit_row(church_id, owner_id) and (not private or owner_id = auth.uid()))', t || '_owner_select', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_edit_row(church_id, owner_id) and (not private or owner_id = auth.uid())) with check (public.can_edit_row(church_id, owner_id))', t || '_owner_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_edit_row(church_id, owner_id) and (not private or owner_id = auth.uid()))', t || '_owner_delete', t);
  end loop;
end $$;

-- Only the maker may make an item private, and nobody may change who made it
create or replace function public.guard_plan_privacy()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Who made this can''t be changed.';
  end if;
  if new.private and not old.private and old.owner_id is distinct from auth.uid() then
    raise exception 'Only the person who made this can make it private.';
  end if;
  return new;
end $$;
drop trigger if exists presentations_guard_privacy on public.presentations;
create trigger presentations_guard_privacy before update on public.presentations for each row execute function public.guard_plan_privacy();
drop trigger if exists scripture_studies_guard_privacy on public.scripture_studies;
create trigger scripture_studies_guard_privacy before update on public.scripture_studies for each row execute function public.guard_plan_privacy();

-- 3. "A song or reading you use was edited": not about private presentations
create or replace function public.notify_library_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  item_id uuid := old.id;
  item_kind text := case tg_table_name when 'lyric_songs' then 'song' else 'reading' end;
  item_title text := old.title;
  p record;
begin
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
    if not exists (select 1 from public.notifications n where n.kind = 'library_changed' and n.church_id = p.church_id
                   and n.read_at is null and n.data ->> 'item_id' = item_id::text and n.data ->> 'program_id' = p.id::text) then
      perform public.notify_team(p.church_id, 'library_changed', jsonb_build_object(
        'item_id', item_id, 'item_kind', item_kind, 'item_title', item_title,
        'change', lower(tg_op), 'program_id', p.id, 'service_date', p.service_date));
    end if;
  end loop;
  for p in
    select id, church_id, title from public.presentations
    where church_id is not null and not private and updated_at >= now() - interval '60 days' and data::text like '%' || item_id::text || '%'
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
