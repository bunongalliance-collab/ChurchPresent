-- churchApp: the Pastor tag. A team member (admin or editor) can also be marked Pastor on the Team page.
-- Pastors get the Pastor page (#pastor) and the prayer requests marked "Only the pastors".
-- If no one in a church is marked Pastor, those requests go to the church's admins, as before.
-- Run after churches.sql, notifications-plans.sql (notify_team) and prayer-requests.sql.
-- Run once in the Supabase SQL editor. Safe to run twice.

-- 1. The tag. Admins set it (the existing "church_members_admin_update" rule lets only admins change member rows).
alter table public.church_members add column if not exists is_pastor boolean not null default false;

-- 2. Who reads "Only the pastors" requests in a church: its pastors, or its admins when it has no pastor
create or replace function public.has_pastor_access(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.church_members m where m.church_id = cid and m.user_id = auth.uid() and m.is_pastor)
      or (public.is_church_admin(cid)
          and not exists (select 1 from public.church_members m where m.church_id = cid and m.is_pastor));
$$;
revoke all on function public.has_pastor_access(uuid) from public;
grant execute on function public.has_pastor_access(uuid) to authenticated;

-- 3. Prayer requests: "Only the pastors" now follows has_pastor_access instead of the admin role
drop policy if exists "prayer_requests_read" on public.prayer_requests;
create policy "prayer_requests_read" on public.prayer_requests
  for select to authenticated
  using (public.is_church_member(church_id) and (not pastors_only or public.has_pastor_access(church_id)));

drop policy if exists "prayer_requests_team_update" on public.prayer_requests;
create policy "prayer_requests_team_update" on public.prayer_requests
  for update to authenticated
  using (public.is_church_member(church_id) and (not pastors_only or public.has_pastor_access(church_id)))
  with check (public.is_church_member(church_id) and (not pastors_only or public.has_pastor_access(church_id)));

-- 4. The bell: a pastors-only request goes to the pastors (or the admins when there is no pastor)
create or replace function public.notify_prayer_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  d jsonb := jsonb_build_object('request_id', new.id, 'name', new.name, 'pastors_only', new.pastors_only,
                                'preview', left(new.body, 90), 'source', new.source);
begin
  if not new.pastors_only then
    perform public.notify_team(new.church_id, 'prayer_request', d, false);
  elsif exists (select 1 from public.church_members m where m.church_id = new.church_id and m.is_pastor) then
    insert into public.notifications (user_id, kind, church_id, actor_email, data)
    select m.user_id, 'prayer_request', new.church_id, public.actor_email(), d || jsonb_build_object('church_name', c.name)
    from public.church_members m join public.churches c on c.id = m.church_id
    where m.church_id = new.church_id and m.is_pastor and m.user_id is distinct from auth.uid();
  else
    perform public.notify_team(new.church_id, 'prayer_request', d, true);
  end if;
  return new;
end $$;
