-- Run once in Supabase SQL Editor for lead conversion and payment tracking.
alter table public.projects add column if not exists amount_received numeric not null default 0;
alter table public.projects add column if not exists payment_status text not null default 'Not received';
alter table public.projects add column if not exists next_payment_date date;
alter table public.projects add column if not exists payment_notes text default '';

create unique index if not exists projects_lead_id_unique
on public.projects (lead_id) where lead_id is not null;
