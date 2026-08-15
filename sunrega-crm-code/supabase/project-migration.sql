-- Run once in Supabase SQL Editor for lead conversion and payment tracking.
alter table public.projects add column if not exists amount_received numeric not null default 0;
alter table public.projects add column if not exists payment_status text not null default 'Not received';
alter table public.projects add column if not exists next_payment_date date;
alter table public.projects add column if not exists payment_notes text default '';
alter table public.projects add column if not exists started_at date default current_date;
alter table public.projects add column if not exists target_days integer not null default 60;
alter table public.projects add column if not exists milestones jsonb not null default '[]'::jsonb;
alter table public.projects add column if not exists payments jsonb not null default '[]'::jsonb;
alter table public.projects add column if not exists service_notes text default '';
alter table public.projects add column if not exists documents jsonb not null default '[]'::jsonb;

create unique index if not exists projects_lead_id_unique
on public.projects (lead_id) where lead_id is not null;
