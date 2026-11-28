-- churchApp: prayer requests. The congregation sends them from the Nau Mpro App (no sign-in), the team can add them
-- too, and the church's team reads them on the Prayer page (#prayer).
-- Run after churches.sql, churches-songs-readings.sql (church_names), notifications.sql, notifications-plans.sql
-- (notify_team) and church-owner-offer.sql. Run once in the Supabase SQL editor. Safe to run twice.
--
-- Who can do what:
--   * Anyone can send a request to an accepted church through send_prayer_request(), without signing in: a name
--     (optional, up to 60 characters), the request (up to 1000) and "only the pastors". To stop floods: at most 5 an
--     hour from one device, and 40 an hour to one church from the app.
--   * The church's team (admins and editors) reads its requests. A request for the pastors only is read by the church's
--     admins only.
--   * The team chooses who follows up (a member of that church) and marks a request answered. The team can add a
--     request someone shared in person. Admins can delete a request.
--   * Nobody else can read them: not other churches, not the public.
--   * The team is told on the bell when a request comes in (pastors-only ones: the admins only).

-- 1. The table
create table if not exists public.prayer_requests (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  name text not null default '' check (length(name) <= 60),
  body text not null check (length(trim(body)) between 1 and 1000),
  pastors_only boolean not null default false,
  source text not null default 'app' check (source in ('app', 'team')),
  added_by uuid references auth.users(id) on delete set null,   -- a team member who added it (source 'team')
  device text not null default '' check (length(device) <= 64), -- a random id the app keeps, for the hourly limit
  status text not null default 'open' check (status in ('open', 'answered')),
  follow_up uuid references auth.users(id) on delete set null,  -- the team member following up
  answered_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists prayer_requests_church on public.prayer_requests (church_id, created_at desc);
create index if not exists prayer_requests_device on public.prayer_requests (device, created_at desc) where device <> '';

-- 2. The database stamps who added it and when, keeps the follow-up person on the church's team, and dates "answered"
create or replace function public.prayer_requests_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.name := left(trim(new.name), 60);
    new.body := trim(new.body);
    new.status := 'open';
    new.answered_at := null;
    if new.source = 'team' then new.added_by := auth.uid(); new.device := ''; end if;
  else
    -- Only these change after sending; the rest stays as sent
    new.church_id := old.church_id; new.name := old.name; new.body := old.body; new.source := old.source;
    new.added_by := old.added_by; new.device := old.device; new.created_at := old.created_at;
  end if;
  if new.follow_up is not null and not exists (
    select 1 from public.church_members m where m.church_id = new.church_id and m.user_id = new.follow_up) then
    raise exception 'follow_up_not_on_team';
  end if;
  if new.status = 'answered' and (tg_op = 'INSERT' or old.status <> 'answered') then new.answered_at := now(); end if;
  if new.status = 'open' then new.answered_at := null; end if;
  return new;
end $$;
drop trigger if exists prayer_requests_stamp on public.prayer_requests;
create trigger prayer_requests_stamp before insert or update on public.prayer_requests
  for each row execute function public.prayer_requests_stamp();

-- 3. Who can read and change them
alter table public.prayer_requests enable row level security;

drop policy if exists "prayer_requests_read" on public.prayer_requests;
create policy "prayer_requests_read" on public.prayer_requests
  for select to authenticated
  using (public.is_church_member(church_id) and (not pastors_only or public.is_church_admin(church_id)));

drop policy if exists "prayer_requests_team_add" on public.prayer_requests;
create policy "prayer_requests_team_add" on public.prayer_requests
  for insert to authenticated
  with check (source = 'team' and public.is_church_member(church_id)
              and church_id in (select n.id from public.church_names() n));

drop policy if exists "prayer_requests_team_update" on public.prayer_requests;
create policy "prayer_requests_team_update" on public.prayer_requests
  for update to authenticated
  using (public.is_church_member(church_id) and (not pastors_only or public.is_church_admin(church_id)))
  with check (public.is_church_member(church_id) and (not pastors_only or public.is_church_admin(church_id)));

drop policy if exists "prayer_requests_admin_delete" on public.prayer_requests;
create policy "prayer_requests_admin_delete" on public.prayer_requests
  for delete to authenticated using (public.is_church_admin(church_id));

revoke all on public.prayer_requests from anon;
revoke update on public.prayer_requests from authenticated;
grant update (status, follow_up, pastors_only) on public.prayer_requests to authenticated;

-- 4. Sending from the Nau Mpro App (no sign-in). Errors: no_church, empty_request, send_limit, church_limit.
create or replace function public.send_prayer_request(cid uuid, req_name text, req_body text, only_pastors boolean, device_id text)
returns void language plpgsql security definer set search_path = public as $$
declare
  b text := trim(coalesce(req_body, ''));
  d text := left(coalesce(device_id, ''), 64);
begin
  if not exists (select 1 from public.churches c where c.id = cid and c.status = 'active') then
    raise exception 'no_church';
  end if;
  if length(b) = 0 then raise exception 'empty_request'; end if;
  if d <> '' and (select count(*) from public.prayer_requests p
                  where p.device = d and p.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'send_limit';
  end if;
  if (select count(*) from public.prayer_requests p
      where p.church_id = cid and p.source = 'app' and p.created_at > now() - interval '1 hour') >= 40 then
    raise exception 'church_limit';
  end if;
  insert into public.prayer_requests (church_id, name, body, pastors_only, source, device)
  values (cid, left(trim(coalesce(req_name, '')), 60), left(b, 1000), coalesce(only_pastors, false), 'app', d);
end $$;
revoke all on function public.send_prayer_request(uuid, text, text, boolean, text) from public;
grant execute on function public.send_prayer_request(uuid, text, text, boolean, text) to anon, authenticated;

-- 5. The bell: a new request tells the church's team (pastors-only ones: the admins only), not the person who added it
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('join_request', 'added', 'role', 'removed', 'church_waiting', 'program_new', 'published', 'republish',
                  'library_changed', 'ownership_offer', 'ownership_answer', 'prayer_request'));

create or replace function public.notify_prayer_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_team(new.church_id, 'prayer_request',
    jsonb_build_object('request_id', new.id, 'name', new.name, 'pastors_only', new.pastors_only,
                       'preview', left(new.body, 90), 'source', new.source),
    new.pastors_only);
  return new;
end $$;
drop trigger if exists prayer_requests_notify on public.prayer_requests;
create trigger prayer_requests_notify after insert on public.prayer_requests
  for each row execute function public.notify_prayer_request();
