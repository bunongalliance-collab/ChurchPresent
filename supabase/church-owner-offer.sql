-- churchApp: handing over a church needs the new owner to accept. Run after church-owner.sql and notifications.sql.
-- Run once in the Supabase SQL editor. Safe to run twice.
--
--   * The owner offers ownership to an admin (offer_ownership). Nothing changes yet: the owner keeps the church and
--     can cancel the offer (cancel_ownership_offer).
--   * The admin is told and accepts or declines (respond_ownership). Only on accept does the church change hands,
--     and the old owner is told either way.
--   * An offer ends by itself if that person stops being an admin or leaves.
--   * The one-step hand-over from church-owner.sql (transfer_ownership) can no longer be used.

-- 1. The waiting offer
alter table public.churches add column if not exists pending_owner_id uuid references auth.users(id) on delete set null;
alter table public.churches add column if not exists owner_offered_at timestamptz;

-- 2. New notification kinds
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('join_request', 'added', 'role', 'removed', 'church_waiting', 'program_new', 'published', 'republish',
                  'library_changed', 'ownership_offer', 'ownership_answer'));

-- Close the open "offered you ownership" notification with how it ended
create or replace function public.close_ownership_offer(cid uuid, how text)
returns void language sql security definer set search_path = public as $$
  update public.notifications set read_at = coalesce(read_at, now()), data = data || jsonb_build_object('resolved', how)
   where kind = 'ownership_offer' and church_id = cid and data ->> 'resolved' is null;
$$;
revoke all on function public.close_ownership_offer(uuid, text) from public;

-- 3. The owner offers the church to an admin
create or replace function public.offer_ownership(cid uuid, new_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare cname text;
begin
  select name into cname from public.churches where id = cid and owner_id = auth.uid();
  if cname is null then raise exception 'Only the church owner can hand over ownership.'; end if;
  if new_owner = auth.uid() then raise exception 'You already own this church.'; end if;
  if not exists (select 1 from public.church_members where church_id = cid and user_id = new_owner and role = 'admin') then
    raise exception 'Make them an admin first. Ownership can only go to an admin of the church.';
  end if;
  perform public.close_ownership_offer(cid, 'replaced');
  update public.churches set pending_owner_id = new_owner, owner_offered_at = now() where id = cid;
  insert into public.notifications (user_id, kind, church_id, actor_email, data)
  values (new_owner, 'ownership_offer', cid, public.actor_email(), jsonb_build_object('church_name', cname));
end $$;

-- 4. The owner takes the offer back
create or replace function public.cancel_ownership_offer(cid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.churches where id = cid and owner_id = auth.uid()) then
    raise exception 'Only the church owner can cancel the offer.';
  end if;
  update public.churches set pending_owner_id = null, owner_offered_at = null where id = cid;
  perform public.close_ownership_offer(cid, 'cancelled');
end $$;

-- 5. The admin accepts or declines
create or replace function public.respond_ownership(cid uuid, accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c public.churches;
begin
  select * into c from public.churches where id = cid and pending_owner_id = auth.uid();
  if c.id is null then raise exception 'That offer is no longer waiting. The owner may have cancelled it.'; end if;
  if accept and not exists (select 1 from public.church_members where church_id = cid and user_id = auth.uid() and role = 'admin') then
    raise exception 'You need to be an admin of the church to own it.';
  end if;
  update public.churches
     set owner_id = case when accept then auth.uid() else owner_id end, pending_owner_id = null, owner_offered_at = null
   where id = cid;
  perform public.close_ownership_offer(cid, case when accept then 'accepted' else 'declined' end);
  if c.owner_id is not null then
    insert into public.notifications (user_id, kind, church_id, actor_email, data)
    values (c.owner_id, 'ownership_answer', cid, public.actor_email(), jsonb_build_object('church_name', c.name, 'accepted', accept));
  end if;
end $$;

-- 6. An offer ends if that person is no longer an admin of the church
create or replace function public.end_offer_on_member_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'DELETE' or new.role <> 'admin')
     and exists (select 1 from public.churches where id = old.church_id and pending_owner_id = old.user_id) then
    update public.churches set pending_owner_id = null, owner_offered_at = null where id = old.church_id;
    perform public.close_ownership_offer(old.church_id, 'ended');
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists church_members_end_offer on public.church_members;
create trigger church_members_end_offer after update or delete on public.church_members
  for each row execute function public.end_offer_on_member_change();

-- 7. Who owns a church and who it is offered to (for the Team page). Any member may ask.
create or replace function public.church_ownership(cid uuid)
returns table (owner_id uuid, pending_owner_id uuid, owner_offered_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.owner_id, c.pending_owner_id, c.owner_offered_at from public.churches c
  where c.id = cid and public.is_church_member(cid);
$$;

revoke all on function public.offer_ownership(uuid, uuid), public.cancel_ownership_offer(uuid),
  public.respond_ownership(uuid, boolean), public.church_ownership(uuid) from public;
grant execute on function public.offer_ownership(uuid, uuid), public.cancel_ownership_offer(uuid),
  public.respond_ownership(uuid, boolean), public.church_ownership(uuid) to authenticated;

-- 8. No more one-step hand-over
revoke execute on function public.transfer_ownership(uuid, uuid) from authenticated;
