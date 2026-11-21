-- churchApp: only listed team accounts may publish "Today's service" to the Nau Mpro App.
-- Before this, any signed-in account could publish (anyone can sign up), and the app showed the latest
-- service from anyone. Now:
--   * only accounts in service_publishers can publish, update or remove a published service;
--   * the Nau Mpro App only sees services published by those accounts, so anything another account
--     published earlier is ignored.
-- Nothing changes on screen. Run after published-services.sql, once, in the Supabase SQL editor.
-- Safe to run twice.
--
-- BEFORE RUNNING: replace YOUR_SIGN_IN_EMAIL in step 2 with the email you sign in to the app with.

-- 1. The list of accounts allowed to publish
create table if not exists public.service_publishers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);

alter table public.service_publishers enable row level security;

-- Each account may see only its own row (enough for the app to know if you can publish).
-- Nobody can list the publishers, and nobody can add themselves: rows are added here, in the SQL editor.
drop policy if exists "service_publishers_self_read" on public.service_publishers;
create policy "service_publishers_self_read" on public.service_publishers
  for select to authenticated using (user_id = auth.uid());

-- 2. Add your account. If no account has that email, this stops with an error before any rule below
--    changes, so publishing keeps working as before.
do $$
declare
  publisher_email text := 'YOUR_SIGN_IN_EMAIL';
  uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(publisher_email);
  if uid is null then
    raise exception 'No account signs in with %. Put your sign-in email in publisher_email and run again.', publisher_email;
  end if;
  insert into public.service_publishers (user_id) values (uid) on conflict do nothing;
end $$;

-- 3. A check the rules below use. It runs with the table owner's rights, so the public reader can ask
--    "was this row published by a listed account?" without being able to read the list itself.
create or replace function public.is_service_publisher(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.service_publishers p where p.user_id = uid);
$$;

revoke all on function public.is_service_publisher(uuid) from public;
grant execute on function public.is_service_publisher(uuid) to anon, authenticated;

-- 4. Published services: everyone reads services from listed publishers; only listed publishers write.
drop policy if exists "published_services_public_read" on public.published_services;
create policy "published_services_public_read" on public.published_services
  for select using (public.is_service_publisher(owner_id));

drop policy if exists "published_services_owner_insert" on public.published_services;
create policy "published_services_owner_insert" on public.published_services
  for insert with check (auth.uid() = owner_id and public.is_service_publisher(auth.uid()));

drop policy if exists "published_services_owner_update" on public.published_services;
create policy "published_services_owner_update" on public.published_services
  for update using (auth.uid() = owner_id and public.is_service_publisher(auth.uid()))
  with check (auth.uid() = owner_id and public.is_service_publisher(auth.uid()));

drop policy if exists "published_services_owner_delete" on public.published_services;
create policy "published_services_owner_delete" on public.published_services
  for delete using (auth.uid() = owner_id and public.is_service_publisher(auth.uid()));

-- To add another team member later (they need an account in the app first):
-- insert into public.service_publishers (user_id) select id from auth.users where lower(email) = lower('THEIR_EMAIL') on conflict do nothing;
