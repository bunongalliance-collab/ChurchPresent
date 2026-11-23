-- churchApp: presentations, Scripture studies and saved people belong to churches (stage 3 of several churches).
-- Run after churches.sql and churches-songs-readings.sql. Run once in the Supabase SQL editor. Safe to run twice.
--
-- What changes:
--   * presentations, scripture_studies and saved_people get a church_id.
--   * Rows saved by someone on the Montagnard Bunong Alliance Church team go to that church.
--     Rows of anyone else stay theirs alone (no church), as before.
--   * The church's team (admins and editors) can open, change and delete the church's presentations and studies.
--   * Saved people (names used in programs) are no longer public: only the church's team, or the person who saved
--     them, can read them.

-- 1. Columns
alter table public.presentations add column if not exists church_id uuid references public.churches(id) on delete set null;
alter table public.scripture_studies add column if not exists church_id uuid references public.churches(id) on delete set null;
alter table public.saved_people add column if not exists church_id uuid references public.churches(id) on delete cascade;
create index if not exists presentations_church_idx on public.presentations (church_id, updated_at desc);
create index if not exists scripture_studies_church_idx on public.scripture_studies (church_id, updated_at desc);
create index if not exists saved_people_church_idx on public.saved_people (church_id, name);

-- 2. Existing rows of the church's team go to the church
update public.presentations p set church_id = m.church_id
from public.church_members m join public.churches c on c.id = m.church_id
where p.church_id is null and m.user_id = p.owner_id and c.name = 'Montagnard Bunong Alliance Church';
update public.scripture_studies s set church_id = m.church_id
from public.church_members m join public.churches c on c.id = m.church_id
where s.church_id is null and m.user_id = s.owner_id and c.name = 'Montagnard Bunong Alliance Church';
update public.saved_people s set church_id = m.church_id
from public.church_members m join public.churches c on c.id = m.church_id
where s.church_id is null and m.user_id = s.owner_id and c.name = 'Montagnard Bunong Alliance Church';

-- One of each name per church (team members may have saved the same person)
delete from public.saved_people a using public.saved_people b
where a.church_id is not null and a.church_id = b.church_id and lower(trim(a.name)) = lower(trim(b.name))
  and (a.created_at, a.id) > (b.created_at, b.id);
create unique index if not exists saved_people_church_name_idx on public.saved_people (church_id, lower(trim(name))) where church_id is not null;

-- 3. Rules. can_edit_row (from churches-songs-readings.sql): the church's team for a church row, the owner otherwise.
drop policy if exists "presentations_owner_select" on public.presentations;
create policy "presentations_owner_select" on public.presentations
  for select to authenticated using (public.can_edit_row(church_id, owner_id));
drop policy if exists "presentations_owner_insert" on public.presentations;
create policy "presentations_owner_insert" on public.presentations
  for insert to authenticated with check (owner_id = (select auth.uid()) and (church_id is null or public.can_edit_row(church_id, owner_id)));
drop policy if exists "presentations_owner_update" on public.presentations;
create policy "presentations_owner_update" on public.presentations
  for update to authenticated using (public.can_edit_row(church_id, owner_id)) with check (public.can_edit_row(church_id, owner_id));
drop policy if exists "presentations_owner_delete" on public.presentations;
create policy "presentations_owner_delete" on public.presentations
  for delete to authenticated using (public.can_edit_row(church_id, owner_id));

drop policy if exists "scripture_studies_owner_select" on public.scripture_studies;
create policy "scripture_studies_owner_select" on public.scripture_studies
  for select to authenticated using (public.can_edit_row(church_id, owner_id));
drop policy if exists "scripture_studies_owner_insert" on public.scripture_studies;
create policy "scripture_studies_owner_insert" on public.scripture_studies
  for insert to authenticated with check (owner_id = (select auth.uid()) and (church_id is null or public.can_edit_row(church_id, owner_id)));
drop policy if exists "scripture_studies_owner_update" on public.scripture_studies;
create policy "scripture_studies_owner_update" on public.scripture_studies
  for update to authenticated using (public.can_edit_row(church_id, owner_id)) with check (public.can_edit_row(church_id, owner_id));
drop policy if exists "scripture_studies_owner_delete" on public.scripture_studies;
create policy "scripture_studies_owner_delete" on public.scripture_studies
  for delete to authenticated using (public.can_edit_row(church_id, owner_id));

drop policy if exists "saved_people_public_read" on public.saved_people;
drop policy if exists "saved_people_team_read" on public.saved_people;
create policy "saved_people_team_read" on public.saved_people
  for select to authenticated using (public.can_edit_row(church_id, owner_id));
drop policy if exists "saved_people_owner_insert" on public.saved_people;
create policy "saved_people_owner_insert" on public.saved_people
  for insert to authenticated with check (auth.uid() = owner_id and (church_id is null or public.can_edit_row(church_id, owner_id)));
drop policy if exists "saved_people_owner_delete" on public.saved_people;
create policy "saved_people_owner_delete" on public.saved_people
  for delete to authenticated using (public.can_edit_row(church_id, owner_id));
revoke all on public.saved_people from anon;
