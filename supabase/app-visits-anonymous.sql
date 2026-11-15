-- churchApp: record visits from people who are not signed in. Run once in the Supabase SQL editor. Safe to run twice. NOT RUN YET.
-- Anonymous visits have no account (user_id is empty) and no email; they keep the IP address, location and device.
-- They are saved by the server function with the service role key, which skips row-level security,
-- so no new insert policy is needed: browsers still cannot add visits for anyone but themselves.

alter table public.app_visits alter column user_id drop not null;

-- Speeds up the "one anonymous visit per IP every 30 minutes" check
create index if not exists app_visits_ip_created_idx on public.app_visits (ip, created_at desc);
