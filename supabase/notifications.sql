-- churchApp: team notifications (the bell in the navbar). Run after churches.sql.
-- Run once in the Supabase SQL editor. Safe to run twice.
--
-- The database writes the notifications itself when something happens, so they can't be faked from a browser:
--   * someone enters a church's join code      -> every admin of that church ("join_request")
--   * someone is added to a church              -> that person ("added"), unless they added themselves (started it)
--   * someone's role changes                    -> that person ("role")
--   * someone is removed from a church          -> that person ("removed"), unless they left on their own
--   * a new church waits to be accepted         -> every site admin ("church_waiting")
--   * a join request is accepted or declined    -> the admins' notification about it is marked as handled
-- Each person reads, marks as read and removes only their own notifications.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('join_request', 'added', 'role', 'removed', 'church_waiting')),
  church_id uuid references public.churches(id) on delete cascade,
  actor_email text not null default '',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists "notifications_own_read" on public.notifications;
create policy "notifications_own_read" on public.notifications
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "notifications_own_update" on public.notifications;
create policy "notifications_own_update" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "notifications_own_delete" on public.notifications;
create policy "notifications_own_delete" on public.notifications
  for delete to authenticated using (user_id = auth.uid());
revoke all on public.notifications from anon;
-- Only read_at may be changed by the person (marking as read)
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- The signed-in person's email, for "added by …"
create or replace function public.actor_email()
returns text language sql stable set search_path = public as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

-- Someone asked to join: tell the church's admins
create or replace function public.notify_join_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare cname text;
begin
  select name into cname from public.churches where id = new.church_id;
  insert into public.notifications (user_id, kind, church_id, actor_email, data)
  select m.user_id, 'join_request', new.church_id, new.email,
         jsonb_build_object('church_name', cname, 'request_user_id', new.user_id, 'email', new.email)
  from public.church_members m where m.church_id = new.church_id and m.role = 'admin';
  return new;
end $$;
drop trigger if exists church_requests_notify on public.church_requests;
create trigger church_requests_notify after insert on public.church_requests
  for each row execute function public.notify_join_request();

-- A request was accepted or declined: the admins' notifications about it are handled
create or replace function public.notify_request_done()
returns trigger language plpgsql security definer set search_path = public as $$
declare result text;
begin
  result := case when exists (select 1 from public.church_members m where m.church_id = old.church_id and m.user_id = old.user_id)
                 then 'accepted'
                 when auth.uid() = old.user_id then 'withdrawn'   -- they cancelled their own request
                 else 'declined' end;
  update public.notifications
     set data = data || jsonb_build_object('resolved', result, 'resolved_by', public.actor_email()),
         read_at = coalesce(read_at, now())
   where kind = 'join_request' and church_id = old.church_id and data ->> 'request_user_id' = old.user_id::text;
  return old;
end $$;
drop trigger if exists church_requests_done on public.church_requests;
create trigger church_requests_done after delete on public.church_requests
  for each row execute function public.notify_request_done();

-- Added, role changed, removed: tell that person
create or replace function public.notify_member_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare cname text;
begin
  select name into cname from public.churches where id = coalesce(new.church_id, old.church_id);
  if tg_op = 'INSERT' and new.user_id is distinct from auth.uid() then
    insert into public.notifications (user_id, kind, church_id, actor_email, data)
    values (new.user_id, 'added', new.church_id, public.actor_email(), jsonb_build_object('church_name', cname, 'role', new.role));
  elsif tg_op = 'UPDATE' and new.role <> old.role and new.user_id is distinct from auth.uid() then
    insert into public.notifications (user_id, kind, church_id, actor_email, data)
    values (new.user_id, 'role', new.church_id, public.actor_email(), jsonb_build_object('church_name', cname, 'role', new.role));
  elsif tg_op = 'DELETE' and old.user_id is distinct from auth.uid() and cname is not null then
    insert into public.notifications (user_id, kind, church_id, actor_email, data)
    values (old.user_id, 'removed', null, public.actor_email(), jsonb_build_object('church_name', cname));
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists church_members_notify on public.church_members;
create trigger church_members_notify after insert or update or delete on public.church_members
  for each row execute function public.notify_member_change();

-- Invited by email and just signed in: claim_invites runs as the new person, so "added by" is the inviter.
-- The invite remembers who sent it.
alter table public.church_invites add column if not exists invited_by text not null default '';
create or replace function public.church_invites_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.invited_by := public.actor_email();
  return new;
end $$;
drop trigger if exists church_invites_stamp on public.church_invites;
create trigger church_invites_stamp before insert on public.church_invites
  for each row execute function public.church_invites_stamp();

create or replace function public.claim_invites()
returns int language plpgsql security definer set search_path = public as $$
declare em text := public.actor_email(); n int;
begin
  if auth.uid() is null or em = '' then return 0; end if;
  insert into public.notifications (user_id, kind, church_id, actor_email, data)
  select auth.uid(), 'added', i.church_id, i.invited_by, jsonb_build_object('church_name', c.name, 'role', i.role)
  from public.church_invites i join public.churches c on c.id = i.church_id and c.status = 'active'
  where i.email = em
    and not exists (select 1 from public.church_members m where m.church_id = i.church_id and m.user_id = auth.uid());
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
revoke all on function public.claim_invites() from public;
grant execute on function public.claim_invites() to authenticated;

-- A new church waits: tell the site admins
create or replace function public.notify_church_waiting()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'waiting' then
    insert into public.notifications (user_id, kind, church_id, actor_email, data)
    select a.user_id, 'church_waiting', new.id, public.actor_email(), jsonb_build_object('church_name', new.name)
    from public.app_admins a where a.user_id is distinct from auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists churches_notify on public.churches;
create trigger churches_notify after insert on public.churches
  for each row execute function public.notify_church_waiting();
