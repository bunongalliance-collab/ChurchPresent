-- churchApp: back up the Bible reader's highlights, saved verses and notes on the person's account
-- (Nau Brah Ndu Ngơi, /nau-brah-ndu-ngoi/). Run once in the Supabase SQL editor. Safe to run twice.
--
-- One row per account holding the three lists. Each person reads and writes only their own row; nobody else
-- (not even church admins) can see it. The reader still works without an account: everything stays on the device.

create table if not exists public.bible_reader_data (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,          -- { hl: {...}, saved: {...}, notes: {...} }
  updated_at timestamptz not null default now(),
  constraint bible_reader_data_is_object check (jsonb_typeof(data) = 'object')
);

create or replace function public.bible_reader_data_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists bible_reader_data_stamp on public.bible_reader_data;
create trigger bible_reader_data_stamp before insert or update on public.bible_reader_data
  for each row execute function public.bible_reader_data_stamp();

alter table public.bible_reader_data enable row level security;
drop policy if exists "bible_reader_data_own" on public.bible_reader_data;
create policy "bible_reader_data_own" on public.bible_reader_data
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.bible_reader_data from anon;
