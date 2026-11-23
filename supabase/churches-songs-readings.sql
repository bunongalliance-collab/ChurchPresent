-- churchApp: songs and readings belong to churches (stage 2 of several churches). Run after churches.sql.
-- Run once in the Supabase SQL editor. Safe to run twice.
--
-- What changes:
--   * lyric_songs, readings and reading_categories get a church_id.
--   * Everything saved so far by an account goes to Montagnard Bunong Alliance Church.
--   * The Nau Mpro hymn book (songs with no owner) stays shared: no church, and only site admins can change it.
--   * Anyone can still read every song and reading, signed in or not.
--   * Any admin or editor of a church can change that church's songs and readings, not only the person who saved them.
--   * Someone not on any church team can still save songs and readings of their own (no church), as before.
--   * Reading categories are shared by the church team instead of each person having their own.

-- 1. Columns
alter table public.lyric_songs add column if not exists church_id uuid references public.churches(id) on delete set null;
alter table public.readings add column if not exists church_id uuid references public.churches(id) on delete set null;
alter table public.reading_categories add column if not exists church_id uuid references public.churches(id) on delete cascade;
create index if not exists lyric_songs_church_idx on public.lyric_songs (church_id);
create index if not exists readings_church_idx on public.readings (church_id);
create index if not exists reading_categories_church_idx on public.reading_categories (church_id, sort_order);

-- 2. Existing rows saved by an account go to Montagnard Bunong Alliance Church
do $$
declare cid uuid;
begin
  select id into cid from public.churches where name = 'Montagnard Bunong Alliance Church';
  if cid is null then raise exception 'Run churches.sql first: Montagnard Bunong Alliance Church is not there yet.'; end if;
  update public.lyric_songs set church_id = cid where church_id is null and owner_id is not null;
  update public.readings set church_id = cid where church_id is null;
  update public.reading_categories set church_id = cid where church_id is null;
end $$;

-- The church's categories after the merge: one of each name (people each had their own copy of the starter list).
-- Readings pointing at a removed duplicate move to the kept one.
with ranked as (
  select id, church_id, lower(trim(name)) as k,
         first_value(id) over (partition by church_id, lower(trim(name)) order by sort_order, created_at, id) as keep
  from public.reading_categories where church_id is not null
)
update public.readings r set category_id = ranked.keep
from ranked where r.category_id = ranked.id and ranked.id <> ranked.keep;
with ranked as (
  select id, first_value(id) over (partition by church_id, lower(trim(name)) order by sort_order, created_at, id) as keep
  from public.reading_categories where church_id is not null
)
delete from public.reading_categories c using ranked where c.id = ranked.id and ranked.id <> ranked.keep;

-- 3. Who may change a row: the church's team; or, for a row with no church, the person who saved it;
--    or, for the shared hymn book (no church, no owner), a site admin.
create or replace function public.can_edit_row(row_church uuid, row_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when row_church is not null then exists (
      select 1 from public.church_members m join public.churches c on c.id = m.church_id
      where m.church_id = row_church and m.user_id = auth.uid() and c.status = 'active')
    when row_owner is not null then row_owner = auth.uid()
    else public.is_site_admin()
  end;
$$;
revoke all on function public.can_edit_row(uuid, uuid) from public;
grant execute on function public.can_edit_row(uuid, uuid) to authenticated;

-- Songs (reading stays public: lyric_songs_public_read is unchanged)
drop policy if exists "lyric_songs_owner_insert" on public.lyric_songs;
create policy "lyric_songs_owner_insert" on public.lyric_songs
  for insert to authenticated with check (owner_id = (select auth.uid()) and (church_id is null or public.can_edit_row(church_id, owner_id)));
drop policy if exists "lyric_songs_owner_update" on public.lyric_songs;
create policy "lyric_songs_owner_update" on public.lyric_songs
  for update to authenticated using (public.can_edit_row(church_id, owner_id)) with check (public.can_edit_row(church_id, owner_id));
drop policy if exists "lyric_songs_owner_delete" on public.lyric_songs;
create policy "lyric_songs_owner_delete" on public.lyric_songs
  for delete to authenticated using (public.can_edit_row(church_id, owner_id));

-- Readings (reading stays public: readings_public_read is unchanged)
drop policy if exists "readings_owner_insert" on public.readings;
create policy "readings_owner_insert" on public.readings
  for insert to authenticated with check (owner_id = (select auth.uid()) and (church_id is null or public.can_edit_row(church_id, owner_id)));
drop policy if exists "readings_owner_update" on public.readings;
create policy "readings_owner_update" on public.readings
  for update to authenticated using (public.can_edit_row(church_id, owner_id)) with check (public.can_edit_row(church_id, owner_id));
drop policy if exists "readings_owner_delete" on public.readings;
create policy "readings_owner_delete" on public.readings
  for delete to authenticated using (public.can_edit_row(church_id, owner_id));

-- Reading categories: the church team reads and changes its own; without a church, your own as before
drop policy if exists "reading_categories_owner_all" on public.reading_categories;
create policy "reading_categories_owner_all" on public.reading_categories
  for all to authenticated
  using (case when church_id is null then owner_id = (select auth.uid()) else public.is_church_member(church_id) end)
  with check (case when church_id is null then owner_id = (select auth.uid()) else public.is_church_member(church_id) end);

-- 4. Church names for labels on songs and readings (names only, of accepted churches; anyone may read them)
create or replace function public.church_names()
returns table (id uuid, name text) language sql stable security definer set search_path = public as $$
  select id, name from public.churches where status = 'active';
$$;
revoke all on function public.church_names() from public;
grant execute on function public.church_names() to anon, authenticated;
