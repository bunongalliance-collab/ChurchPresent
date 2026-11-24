-- churchApp: every church has an owner (the person who started it) whom other admins can't remove.
-- Run after churches.sql (and notifications.sql if you use notifications). Run once in the Supabase SQL editor.
-- Safe to run twice.
--
--   * churches.owner_id: the owner. Existing churches: the person who started them.
--   * Nobody but the owner can remove the owner, change the owner's role, or make the owner an editor.
--     The owner stays an admin, and can't leave until they hand ownership to another admin.
--   * Only the owner can hand ownership over (transfer_ownership), and only to an admin of the church.
--   * Admins can still rename the church; they can't change who owns it.

-- 1. The owner
alter table public.churches add column if not exists owner_id uuid references auth.users(id) on delete set null;
update public.churches set owner_id = created_by where owner_id is null;

-- New churches: the person who starts one owns it
create or replace function public.churches_set_owner()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.owner_id is null then new.owner_id := coalesce(new.created_by, auth.uid()); end if;
  return new;
end $$;
drop trigger if exists churches_set_owner on public.churches;
create trigger churches_set_owner before insert on public.churches
  for each row execute function public.churches_set_owner();

-- Admins may change a church's name only (the join code, status and owner change through their own functions)
revoke update on public.churches from authenticated;
grant update (name) on public.churches to authenticated;

-- 2. Protect the owner's membership
create or replace function public.protect_owner()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select c.owner_id into owner from public.churches c where c.id = old.church_id;
  -- The church itself is being deleted (or has no owner): nothing to protect
  if owner is null or old.user_id <> owner then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.churches where id = old.church_id) then return old; end if;
    if auth.uid() = owner then
      raise exception 'You own this church. Hand ownership to another admin on the Team page before you leave.';
    end if;
    raise exception 'The church owner can''t be removed. Only the owner can hand the church to someone else.';
  end if;
  if new.role <> 'admin' then
    raise exception 'The church owner stays an admin. Hand ownership to another admin first.';
  end if;
  return new;
end $$;
drop trigger if exists church_members_protect_owner on public.church_members;
create trigger church_members_protect_owner before update or delete on public.church_members
  for each row execute function public.protect_owner();

-- 3. Hand the church to another admin (owner only)
create or replace function public.transfer_ownership(cid uuid, new_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.churches where id = cid and owner_id = auth.uid()) then
    raise exception 'Only the church owner can hand over ownership.';
  end if;
  if not exists (select 1 from public.church_members where church_id = cid and user_id = new_owner and role = 'admin') then
    raise exception 'Make them an admin first. Ownership can only go to an admin of the church.';
  end if;
  update public.churches set owner_id = new_owner where id = cid;
end $$;
revoke all on function public.transfer_ownership(uuid, uuid) from public;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;

-- 4. Who owns a church (for the Team page). Any member may ask.
create or replace function public.church_owner(cid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select owner_id from public.churches where id = cid and public.is_church_member(cid);
$$;
revoke all on function public.church_owner(uuid) from public;
grant execute on function public.church_owner(uuid) to authenticated;
