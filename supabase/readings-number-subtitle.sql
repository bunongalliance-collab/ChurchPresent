-- churchApp: readings get a number and a subtitle (for example "01" and "Nau Ntơm 1: 1-6").
-- Adds two text columns to the readings table. Existing readings get empty values.
-- Run once in the Supabase SQL editor, after readings.sql. Safe to run twice. NOT RUN YET.

alter table public.readings add column if not exists number   text not null default '';
alter table public.readings add column if not exists subtitle text not null default '';
