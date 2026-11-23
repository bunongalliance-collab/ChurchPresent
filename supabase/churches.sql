-- churchApp: churches, their teams and roles (stage 1 of several churches).
-- Adds:
--   * churches          one row per church, with a join code. New churches wait until a site admin
--                       (app_admins) accepts them, so strangers can't fill the app with churches.
--   * church_members    who belongs to which church, as 'admin' or 'editor'. Roles are per church.
--   * church_requests   people who entered a join code and wait for a church admin to accept them.
--   * church_invites    emails a church admin added; they join when that person signs in.
-- Nothing else changes yet: songs, readings, programs and published services keep their current rules.
-- Those move to churches in later stages.
--
-- BEFORE RUNNING: replace YOUR_SIGN_IN_EMAIL in step 6 with the email you sign in to the app with.
-- Run once in the Supabase SQL editor. Safe to run twice.

-- 1. Tables
-- Site admins (also made by app-visits.sql; created here if that file was never run)
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.app_admins enable row level security;

create table if not exists public.churches (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  join_code text not null unique,
  status text not null default 'waiting' check (status in ('waiting', 'active')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.church_members (
  church_id uuid not null references public.churches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null default '',
  role text not null check (role in ('admin', 'editor')),
  added_at timestamptz not null default now(),
  primary key (church_id, user_id)
);

create table if not exists public.church_requests (
  church_id uuid not null references public.churches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null default '',
  created_at timestamptz not null default now(),
  primary key (church_id, user_id)
);

create table if not exists public.church_invites (
  church_id uuid not null references public.churches(id) on delete cascade,
  email text not null check (email = lower(trim(email)) and email like '%@%'),
  role text not null default 'editor' check (role in ('admin', 'editor')),
  created_at timestamptz not null default now(),
  primary key (church_id, email)
);

alter table public.churches enable row level security;
alter table public.church_members enable row level security;
alter table public.church_requests enable row level security;
alter table public.church_invites enable row level security;

-- 2. Checks used by the rules. They run with the owner's rights so the rules don't loop on church_members.
create or replace function public.church_role(cid uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.church_members where church_id = cid and user_id = auth.uid();
$$;
create or replace function public.is_church_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.church_role(cid) is not null;
$$;
create or replace function public.is_church_admin(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.church_role(cid) = 'admin';
$$;
create or replace function public.is_site_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins a where a.user_id = auth.uid());
$$;
revoke all on function public.church_role(uuid), public.is_church_member(uuid), public.is_church_admin(uuid), public.is_site_admin() from public;
grant execute on function public.church_role(uuid), public.is_church_member(uuid), public.is_church_admin(uuid), public.is_site_admin() to anon, authenticated;

-- 3. Rules
-- Churches: members see their church; site admins see all (to accept new ones). Admins rename their church.
drop policy if exists "churches_member_read" on public.churches;
create policy "churches_member_read" on public.churches
  for select to authenticated using (public.is_church_member(id) or public.is_site_admin());
drop policy if exists "churches_admin_update" on public.churches;
create policy "churches_admin_update" on public.churches
  for update to authenticated using (public.is_church_admin(id) or public.is_site_admin())
  with check (public.is_church_admin(id) or public.is_site_admin());

-- Members: the team sees its own list. Admins change roles and remove people (adding goes through the functions below).
drop policy if exists "church_members_read" on public.church_members;
create policy "church_members_read" on public.church_members
  for select to authenticated using (public.is_church_member(church_id));
drop policy if exists "church_members_admin_update" on public.church_members;
create policy "church_members_admin_update" on public.church_members
  for update to authenticated using (public.is_church_admin(church_id)) with check (public.is_church_admin(church_id));
drop policy if exists "church_members_admin_delete" on public.church_members;
create policy "church_members_admin_delete" on public.church_members
  for delete to authenticated using (public.is_church_admin(church_id) or user_id = auth.uid());

-- Requests: the person who asked and the church's admins see them; either may remove one.
drop policy if exists "church_requests_read" on public.church_requests;
create policy "church_requests_read" on public.church_requests
  for select to authenticated using (user_id = auth.uid() or public.is_church_admin(church_id));
drop policy if exists "church_requests_delete" on public.church_requests;
create policy "church_requests_delete" on public.church_requests
  for delete to authenticated using (user_id = auth.uid() or public.is_church_admin(church_id));

-- Invites: only the church's admins.
drop policy if exists "church_invites_admin_all" on public.church_invites;
create policy "church_invites_admin_all" on public.church_invites
  for all to authenticated using (public.is_church_admin(church_id)) with check (public.is_church_admin(church_id));

-- 4. A church always keeps at least one admin
create or replace function public.keep_one_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin')
     and exists (select 1 from public.churches where id = old.church_id)
     and not exists (select 1 from public.church_members m
                     where m.church_id = old.church_id and m.role = 'admin' and m.user_id <> old.user_id) then
    raise exception 'A church needs at least one admin. Make someone else an admin first.';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists church_members_keep_admin on public.church_members;
create trigger church_members_keep_admin before update or delete on public.church_members
  for each row execute function public.keep_one_admin();

-- 5. Actions the app calls
-- A join code like "MBAC-4821" from the church's initials
create or replace function public.new_join_code(church_name text)
returns text language plpgsql volatile set search_path = public as $$
declare
  prefix text := upper(left(regexp_replace(initcap(church_name), '[^A-Z]', '', 'g'), 4));
  code text;
begin
  if length(prefix) < 2 then prefix := 'CH'; end if;
  loop
    code := prefix || '-' || lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');
    exit when not exists (select 1 from public.churches where join_code = code);
  end loop;
  return code;
end $$;

-- My churches and my role in each (and the join code, for admins)
create or replace function public.my_churches()
returns table (id uuid, name text, status text, role text, join_code text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.status, m.role, case when m.role = 'admin' then c.join_code end
  from public.church_members m join public.churches c on c.id = m.church_id
  where m.user_id = auth.uid()
  order by c.name;
$$;

-- Start a church: the caller becomes its admin. It waits for a site admin unless the caller is one.
create or replace function public.start_church(church_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if (select count(*) from public.churches where created_by = auth.uid() and status = 'waiting') >= 2 then
    raise exception 'You already have churches waiting to be accepted.';
  end if;
  insert into public.churches (name, join_code, status, created_by)
  values (trim(church_name), public.new_join_code(church_name),
          case when public.is_site_admin() then 'active' else 'waiting' end, auth.uid())
  returning id into cid;
  insert into public.church_members (church_id, user_id, email, role)
  values (cid, auth.uid(), lower(coalesce(auth.jwt() ->> 'email', '')), 'admin');
  return cid;
end $$;

-- Ask to join with a code. Returns the church name.
create or replace function public.request_join(code text)
returns text language plpgsql security definer set search_path = public as $$
declare c public.churches;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into c from public.churches where join_code = upper(trim(code)) and status = 'active';
  if c.id is null then raise exception 'No church has that code. Check it with your church admin.'; end if;
  if public.is_church_member(c.id) then raise exception 'You are already on the % team.', c.name; end if;
  insert into public.church_requests (church_id, user_id, email)
  values (c.id, auth.uid(), lower(coalesce(auth.jwt() ->> 'email', '')))
  on conflict do nothing;
  return c.name;
end $$;

-- My waiting requests (to show "Request sent to ...")
create or replace function public.my_requests()
returns table (church_id uuid, name text)
language sql stable security definer set search_path = public as $$
  select r.church_id, c.name from public.church_requests r join public.churches c on c.id = r.church_id
  where r.user_id = auth.uid();
$$;

-- An admin accepts a request
create or replace function public.accept_request(cid uuid, uid uuid, new_role text default 'editor')
returns void language plpgsql security definer set search_path = public as $$
declare r public.church_requests;
begin
  if not public.is_church_admin(cid) then raise exception 'Only this church''s admins can accept people.'; end if;
  select * into r from public.church_requests where church_id = cid and user_id = uid;
  if r.user_id is null then raise exception 'That request is no longer waiting.'; end if;
  insert into public.church_members (church_id, user_id, email, role)
  values (cid, uid, r.email, case when new_role = 'admin' then 'admin' else 'editor' end)
  on conflict (church_id, user_id) do nothing;
  delete from public.church_requests where church_id = cid and user_id = uid;
end $$;

-- After signing in: join every church that invited this email
create or replace function public.claim_invites()
returns int language plpgsql security definer set search_path = public as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', '')); n int;
begin
  if auth.uid() is null or em = '' then return 0; end if;
  insert into public.church_members (church_id, user_id, email, role)
  select i.church_id, auth.uid(), em, i.role from public.church_invites i
  join public.churches c on c.id = i.church_id and c.status = 'active'
  where i.email = em
  on conflict (church_id, user_id) do nothing;
  get diagnostics n = row_count;
  delete from public.church_invites i using public.churches c
  where i.email = em and c.id = i.church_id and c.status = 'active';
  delete from public.church_requests r where r.user_id = auth.uid()
    and exists (select 1 from public.church_members m where m.church_id = r.church_id and m.user_id = auth.uid());
  return n;
end $$;

-- An admin makes a new join code (the old one stops working)
create or replace function public.renew_join_code(cid uuid)
returns text language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if not public.is_church_admin(cid) then raise exception 'Only this church''s admins can change the code.'; end if;
  select public.new_join_code(name) into code from public.churches where id = cid;
  update public.churches set join_code = code where id = cid;
  return code;
end $$;

-- A site admin accepts a new church
create or replace function public.accept_church(cid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_site_admin() then raise exception 'Only site admins can accept churches.'; end if;
  update public.churches set status = 'active' where id = cid;
end $$;

-- A site admin turns down a new church (only while it is still waiting)
create or replace function public.decline_church(cid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_site_admin() then raise exception 'Only site admins can decline churches.'; end if;
  delete from public.churches where id = cid and status = 'waiting';
end $$;

revoke all on function public.new_join_code(text), public.my_churches(), public.start_church(text), public.request_join(text),
  public.my_requests(), public.accept_request(uuid, uuid, text), public.claim_invites(), public.renew_join_code(uuid),
  public.accept_church(uuid), public.decline_church(uuid) from public;
grant execute on function public.my_churches(), public.start_church(text), public.request_join(text),
  public.my_requests(), public.accept_request(uuid, uuid, text), public.claim_invites(), public.renew_join_code(uuid),
  public.accept_church(uuid), public.decline_church(uuid) to authenticated;

-- 6. Your church, with you as its admin and a site admin. Accounts that can publish Today's service
--    (service_publishers) join as admins too. If no account has that email, this stops with an error
--    and nothing in this step is saved.
do $$
declare
  admin_email text := 'YOUR_SIGN_IN_EMAIL';
  uid uuid;
  cid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(admin_email);
  if uid is null then
    raise exception 'No account signs in with %. Put your sign-in email in admin_email and run again.', admin_email;
  end if;
  insert into public.app_admins (user_id) values (uid) on conflict do nothing;

  select id into cid from public.churches where name = 'Montagnard Bunong Alliance Church';
  if cid is null then
    insert into public.churches (name, join_code, status, created_by)
    values ('Montagnard Bunong Alliance Church', public.new_join_code('Montagnard Bunong Alliance Church'), 'active', uid)
    returning id into cid;
  end if;

  insert into public.church_members (church_id, user_id, email, role)
  values (cid, uid, lower(admin_email), 'admin')
  on conflict (church_id, user_id) do nothing;

  if to_regclass('public.service_publishers') is not null then
    execute $q$
      insert into public.church_members (church_id, user_id, email, role)
      select $1, u.id, lower(u.email), 'admin' from auth.users u
      where u.id in (select p.user_id from public.service_publishers p)
      on conflict (church_id, user_id) do nothing $q$ using cid;
  end if;
end $$;
