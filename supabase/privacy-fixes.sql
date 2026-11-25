-- churchApp: privacy fixes. Run after churches-services.sql, notifications-plans.sql, church-owner-offer.sql,
-- plans-only-me.sql and programs.sql (running any of those again would undo part of this: run this once more after).
-- Run once in the Supabase SQL editor. Safe to run twice.
--
--   1. Published services (public) hold only songs, passages and readings. Free-text lines, where people's names are
--      often typed, are removed, from services already published too.
--   2. A church's join code can't be read from the churches table. Its admins still see it on the Team page; the site
--      admin still sees every church's name, to accept new ones.
--   3. Studies, presentations and programs are deleted only by the person who made them or an admin of their church.

-- ---------- 1. Published services ----------
create or replace function public.without_free_text(items jsonb)
returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(
           case when jsonb_typeof(i.item -> 'subs') = 'array' then
             jsonb_set(i.item, '{subs}', coalesce((
               select jsonb_agg(s.sub order by s.n)
               from jsonb_array_elements(i.item -> 'subs') with ordinality as s(sub, n)
               where s.sub ->> 'kind' in ('song', 'scripture', 'reading')), '[]'::jsonb))
           else i.item end
           order by i.n), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(items) = 'array' then items else '[]'::jsonb end) with ordinality as i(item, n);
$$;

create or replace function public.published_services_clean()
returns trigger language plpgsql set search_path = public as $$
begin
  new.items := public.without_free_text(new.items);
  return new;
end $$;
drop trigger if exists published_services_clean on public.published_services;
create trigger published_services_clean before insert or update on public.published_services
  for each row execute function public.published_services_clean();

-- Clean what is already published, without telling the team it was published again
alter table public.published_services disable trigger published_services_notify;
update public.published_services set items = public.without_free_text(items)
  where items is distinct from public.without_free_text(items);
alter table public.published_services enable trigger published_services_notify;

-- ---------- 2. Join codes ----------
-- Every column of churches stays readable (under the same row rules) except join_code
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'churches' and column_name <> 'join_code';
  revoke select on public.churches from anon, authenticated;
  execute format('grant select (%s) on public.churches to anon, authenticated', cols);
end $$;

-- ---------- 3. Who may delete ----------
do $$
declare t text;
begin
  foreach t in array array['presentations', 'scripture_studies'] loop
    execute format('drop policy if exists %I on public.%I', t || '_owner_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_edit_row(church_id, owner_id) and (owner_id = auth.uid() or (not private and public.is_church_admin(church_id))))', t || '_owner_delete', t);
  end loop;
end $$;
drop policy if exists "programs_team_delete" on public.programs;
create policy "programs_team_delete" on public.programs
  for delete to authenticated using (public.can_edit_row(church_id, owner_id) and (owner_id = auth.uid() or public.is_church_admin(church_id)));
