-- churchApp: Today's service belongs to a church (stage 4 of several churches). Run after churches.sql.
-- Needs church_names() from churches-songs-readings.sql. Run once in the Supabase SQL editor. Safe to run twice.
--
-- What changes:
--   * published_services gets a church_id. Each church has at most one service per date.
--   * Services published so far by Montagnard Bunong Alliance Church's admins go to that church.
--   * The Nau Mpro App asks once which church and shows that church's service. Anyone can read a church's
--     service, as before (the app has no sign-in).
--   * Only a church's admins can publish, change or remove its service. The old publisher list
--     (service_publishers) is no longer used.

-- 1. Column
alter table public.published_services add column if not exists church_id uuid references public.churches(id) on delete cascade;

-- 2. Existing services of the church's admins go to the church
update public.published_services s set church_id = m.church_id
from public.church_members m join public.churches c on c.id = m.church_id
where s.church_id is null and m.user_id = s.owner_id and m.role = 'admin' and c.name = 'Montagnard Bunong Alliance Church';

-- One service per church per date: keep the latest if two admins published the same day
delete from public.published_services a using public.published_services b
where a.church_id is not null and a.church_id = b.church_id and a.service_date = b.service_date
  and (a.updated_at, a.id) < (b.updated_at, b.id);

-- The old rule was one per account per date; now it is one per church per date
do $$
declare con text;
begin
  for con in select conname from pg_constraint
             where conrelid = 'public.published_services'::regclass and contype = 'u'
               and conname <> 'published_services_church_date_key' loop
    execute format('alter table public.published_services drop constraint %I', con);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'published_services_church_date_key') then
    alter table public.published_services add constraint published_services_church_date_key unique (church_id, service_date);
  end if;
end $$;

-- 3. Rules
drop policy if exists "published_services_public_read" on public.published_services;
create policy "published_services_public_read" on public.published_services
  for select using (church_id in (select n.id from public.church_names() n));  -- accepted churches (readable without signing in)

drop policy if exists "published_services_owner_insert" on public.published_services;
create policy "published_services_owner_insert" on public.published_services
  for insert to authenticated with check (auth.uid() = owner_id and public.is_church_admin(church_id));

drop policy if exists "published_services_owner_update" on public.published_services;
create policy "published_services_owner_update" on public.published_services
  for update to authenticated using (public.is_church_admin(church_id))
  with check (auth.uid() = owner_id and public.is_church_admin(church_id));

drop policy if exists "published_services_owner_delete" on public.published_services;
create policy "published_services_owner_delete" on public.published_services
  for delete to authenticated using (public.is_church_admin(church_id));
