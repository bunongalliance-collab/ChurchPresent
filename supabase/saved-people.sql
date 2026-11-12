-- churchApp: saved people for the service program (Led by, service team and names lists).
-- Everyone can read the list; only the person who added a name can change or remove it.
-- Run once in the Supabase SQL editor. Safe to run twice. NOT RUN YET.

create table if not exists public.saved_people (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

alter table public.saved_people enable row level security;

drop policy if exists "saved_people_public_read" on public.saved_people;
create policy "saved_people_public_read" on public.saved_people
  for select using (true);

drop policy if exists "saved_people_owner_insert" on public.saved_people;
create policy "saved_people_owner_insert" on public.saved_people
  for insert with check (auth.uid() = owner_id);

drop policy if exists "saved_people_owner_delete" on public.saved_people;
create policy "saved_people_owner_delete" on public.saved_people
  for delete using (auth.uid() = owner_id);
