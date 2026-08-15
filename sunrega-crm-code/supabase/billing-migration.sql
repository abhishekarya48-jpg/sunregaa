-- Run once in the Supabase SQL Editor to enable admin billing.
create table if not exists public.invoices (
  id uuid primary key,
  invoice_number text not null unique,
  invoice_date date not null default current_date,
  bill_to text not null,
  total numeric not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.invoices enable row level security;
drop policy if exists "admin invoices" on public.invoices;
create policy "admin invoices" on public.invoices for all to authenticated
using (public.is_admin()) with check (public.is_admin());
