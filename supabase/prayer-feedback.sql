-- churchApp: pastors answer prayer requests. On the Pastor page a pastor taps "I prayed" and can add a short note.
-- The person who sent the request from the Nau Mpro App sees it on the same phone, under "My requests" in the Prayer tab:
-- "A pastor prayed for this", the note, and "Answered". No sign-in: the app's random phone id (the `device` column)
-- finds that phone's own requests. The team can no longer read that id, so no one else can use it.
-- Run after prayer-requests.sql and pastors.sql. Run once in the Supabase SQL editor. Safe to run twice.

-- 1. Prayed and the pastor's note (the sender sees the note)
alter table public.prayer_requests add column if not exists prayed_at timestamptz;
alter table public.prayer_requests add column if not exists prayed_by uuid references auth.users(id) on delete set null;
alter table public.prayer_requests add column if not exists pastor_note text not null default '';
alter table public.prayer_requests drop constraint if exists prayer_requests_pastor_note_len;
alter table public.prayer_requests add constraint prayer_requests_pastor_note_len check (length(pastor_note) <= 200);

-- 2. Only pastors (or the admins when no one is marked Pastor) mark prayed or write the note. The database stamps who and when.
create or replace function public.prayer_requests_feedback()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.prayed_at := null; new.prayed_by := null; new.pastor_note := '';
    return new;
  end if;
  new.prayed_by := old.prayed_by;
  if new.prayed_at is distinct from old.prayed_at or new.pastor_note is distinct from old.pastor_note then
    if not public.has_pastor_access(old.church_id) then raise exception 'pastors_only_feedback'; end if;
    new.pastor_note := left(trim(coalesce(new.pastor_note, '')), 200);
    if old.prayed_at is not null and new.prayed_at is null then
      new.pastor_note := '';                                          -- undo clears the note too
    elsif new.pastor_note <> '' and new.prayed_at is null then
      new.prayed_at := now();                                         -- a note means prayed
    end if;
    if new.prayed_at is null then
      new.prayed_by := null; new.pastor_note := '';
    elsif old.prayed_at is null or new.pastor_note is distinct from old.pastor_note then
      new.prayed_at := now(); new.prayed_by := auth.uid();
    else
      new.prayed_at := old.prayed_at;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists prayer_requests_feedback on public.prayer_requests;
create trigger prayer_requests_feedback before insert or update on public.prayer_requests
  for each row execute function public.prayer_requests_feedback();

grant update (prayed_at, pastor_note) on public.prayer_requests to authenticated;

-- 3. The team reads every column except the phone id
revoke select on public.prayer_requests from anon, authenticated;
grant select (id, church_id, name, body, pastors_only, source, added_by, status, follow_up, answered_at, created_at,
              prayed_at, prayed_by, pastor_note) on public.prayer_requests to authenticated;

-- 4. "My requests" in the Nau Mpro App: this phone's own requests (the id is a random UUID kept on the phone)
create or replace function public.my_prayer_requests(device_id text)
returns table (id uuid, church_id uuid, body text, pastors_only boolean, status text, created_at timestamptz,
               prayed boolean, pastor_note text, answered_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.church_id, p.body, p.pastors_only, p.status, p.created_at,
         p.prayed_at is not null, p.pastor_note, p.answered_at
  from public.prayer_requests p
  where length(coalesce(device_id, '')) >= 20 and p.device = device_id and p.source = 'app'
  order by p.created_at desc
  limit 20;
$$;
revoke all on function public.my_prayer_requests(text) from public;
grant execute on function public.my_prayer_requests(text) to anon, authenticated;
