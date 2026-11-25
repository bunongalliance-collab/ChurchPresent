-- churchApp: team members and invitations stay with their church. Run after churches.sql.
-- Run once in the Supabase SQL editor. Safe to run twice. Goes with church-items-stay.sql (songs, studies, programs…).
--
-- The problem: an admin of two churches could, with a direct request, move a team member (the owner included) or an
-- invitation from one church to the other.
--
-- What changes: from the app, nobody can change which church a membership or invitation belongs to, or which account a
-- membership is for. Changing a role, adding, inviting, removing and leaving work as before. The SQL editor still can.

create or replace function public.keep_people_in_church()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;          -- the SQL editor and server jobs
  if new.church_id is distinct from old.church_id then
    raise exception 'People and invitations can''t be moved to another church.';
  end if;
  if tg_table_name = 'church_members' and to_jsonb(new) ->> 'user_id' is distinct from to_jsonb(old) ->> 'user_id' then
    raise exception 'A membership can''t be given to another account.';
  end if;
  return new;
end $$;

drop trigger if exists church_members_keep_church on public.church_members;
create trigger church_members_keep_church before update on public.church_members
  for each row execute function public.keep_people_in_church();
drop trigger if exists church_invites_keep_church on public.church_invites;
create trigger church_invites_keep_church before update on public.church_invites
  for each row execute function public.keep_people_in_church();
