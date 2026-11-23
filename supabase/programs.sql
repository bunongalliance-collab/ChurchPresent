-- churchApp: service programs shared with the church team (the Program page). Run after churches-team-work.sql.
-- Run once in the Supabase SQL editor. Safe to run twice.
--
-- One program per church per date. The whole program (brochure text and order of worship) is kept in data.
-- The church's admins and editors read and change their church's programs; nobody else sees them.
-- Someone not on a church team keeps programs of their own (no church).

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  church_id uuid references public.churches(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  service_date date not null,
  title text not null default '',
  data jsonb not null default '{}'::jsonb,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by_email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint programs_data_is_object check (jsonb_typeof(data) = 'object'),
  constraint programs_title_len check (char_length(title) <= 200),
  constraint programs_church_date_key unique (church_id, service_date)
);
create index if not exists programs_church_idx on public.programs (church_id, service_date desc);
create index if not exists programs_owner_idx on public.programs (owner_id, service_date desc);

-- Who changed it last and when, set by the database (not trusted from the browser)
create or replace function public.programs_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.updated_by_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  return new;
end $$;
drop trigger if exists programs_stamp on public.programs;
create trigger programs_stamp before insert or update on public.programs
  for each row execute function public.programs_stamp();

alter table public.programs enable row level security;

-- can_edit_row (churches-songs-readings.sql): the church's team for a church row, the owner otherwise
drop policy if exists "programs_team_select" on public.programs;
create policy "programs_team_select" on public.programs
  for select to authenticated using (public.can_edit_row(church_id, owner_id));
drop policy if exists "programs_team_insert" on public.programs;
create policy "programs_team_insert" on public.programs
  for insert to authenticated with check (owner_id = (select auth.uid()) and (church_id is null or public.can_edit_row(church_id, owner_id)));
drop policy if exists "programs_team_update" on public.programs;
create policy "programs_team_update" on public.programs
  for update to authenticated using (public.can_edit_row(church_id, owner_id)) with check (public.can_edit_row(church_id, owner_id));
drop policy if exists "programs_team_delete" on public.programs;
create policy "programs_team_delete" on public.programs
  for delete to authenticated using (public.can_edit_row(church_id, owner_id));
revoke all on public.programs from anon;
