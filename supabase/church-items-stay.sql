-- churchApp: a church's items stay with their church and their maker. Run after churches-team-work.sql, programs.sql
-- and churches-services.sql. Run once in the Supabase SQL editor. Safe to run twice.
--
-- The problem: someone on two church teams could move another person's study (or program, presentation, song or
-- reading) to their other church with a direct request, and the maker could no longer see it.
--
-- What changes: from the app (any signed-in request), nobody can change
--   * which church an item belongs to, or
--   * who made it (published services excepted: another admin publishing again takes it over, as before).
-- The app never does either. Still possible: changes made here in the SQL editor, and the database clearing the
-- church when that church itself is deleted.

create or replace function public.keep_church_and_maker()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;          -- the SQL editor and server jobs
  if new.church_id is distinct from old.church_id
     and not (new.church_id is null and not exists (select 1 from public.churches c where c.id = old.church_id)) then
    raise exception 'This item can''t be moved to another church.';
  end if;
  if tg_table_name <> 'published_services' and new.owner_id is distinct from old.owner_id
     and not (new.owner_id is null and not exists (select 1 from auth.users u where u.id = old.owner_id)) then
    raise exception 'Who made this can''t be changed.';
  end if;
  return new;
end $$;
revoke all on function public.keep_church_and_maker() from public;

do $$
declare t text;
begin
  foreach t in array array['scripture_studies', 'presentations', 'programs', 'lyric_songs', 'readings', 'reading_categories', 'published_services'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_keep_church', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.keep_church_and_maker()', t || '_keep_church', t);
  end loop;
end $$;
