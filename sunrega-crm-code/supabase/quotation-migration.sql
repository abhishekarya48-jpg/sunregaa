-- Run once in the Supabase SQL Editor to enable the automatic quotation maker.
alter table public.quotations add column if not exists quotation_date date default current_date;
alter table public.quotations add column if not exists basic_rate numeric not null default 34000;
alter table public.quotations add column if not exists premium_rate numeric not null default 39000;
alter table public.quotations add column if not exists gst_rate numeric not null default 8.9;
alter table public.quotations add column if not exists validity_days integer not null default 15;
alter table public.quotations add column if not exists basic_gst numeric not null default 0;
alter table public.quotations add column if not exists premium_gst numeric not null default 0;
alter table public.quotations add column if not exists basic_total numeric not null default 0;
alter table public.quotations add column if not exists premium_total numeric not null default 0;
alter table public.quotations add column if not exists payment_terms text default '';
alter table public.quotations add column if not exists delivery_terms text default '';
alter table public.quotations add column if not exists exclusions text default '';
alter table public.quotations add column if not exists panel_count integer not null default 0;
alter table public.quotations add column if not exists panel_wattage numeric not null default 620;
alter table public.quotations add column if not exists basic_inverter_count integer not null default 1;
alter table public.quotations add column if not exists basic_inverter_kw numeric not null default 0;
alter table public.quotations add column if not exists premium_inverter_count integer not null default 1;
alter table public.quotations add column if not exists premium_inverter_kw numeric not null default 0;
