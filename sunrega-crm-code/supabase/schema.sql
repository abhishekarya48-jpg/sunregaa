create extension if not exists pgcrypto;

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null default 'Sales Executive',
  phone text default '',
  email text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text default '', email text default '', location text default '',
  segment text not null default 'Residential Rooftop',
  source text default 'Referral', kw numeric not null default 0,
  stage text not null default 'New', owner_id uuid references public.team_members(id) on delete set null,
  follow_up date, quote numeric not null default 0, notes text default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(), lead_id uuid references public.leads(id) on delete set null,
  name text not null, location text default '', segment text default '', kw numeric not null default 0,
  owner_id uuid references public.team_members(id) on delete set null,
  progress integer not null default 0 check (progress between 0 and 100),
  status text not null default 'Planning', target_date date, value numeric not null default 0, notes text default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(), lead_id uuid references public.leads(id) on delete set null,
  customer_name text not null, quote_number text not null unique, system_size numeric not null default 0,
  amount numeric not null default 0, status text not null default 'Draft', valid_until date, notes text default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

alter table public.leads enable row level security;
alter table public.projects enable row level security;
alter table public.team_members enable row level security;
alter table public.quotations enable row level security;

-- Demo policy: suitable for an internal prototype using the anon key. Add Supabase Auth
-- and replace these policies with authenticated/user-specific policies before production.
create policy "demo read leads" on public.leads for select to anon, authenticated using (true);
create policy "demo write leads" on public.leads for all to anon, authenticated using (true) with check (true);
create policy "demo read projects" on public.projects for select to anon, authenticated using (true);
create policy "demo write projects" on public.projects for all to anon, authenticated using (true) with check (true);
create policy "demo read team" on public.team_members for select to anon, authenticated using (true);
create policy "demo write team" on public.team_members for all to anon, authenticated using (true) with check (true);
create policy "demo read quotes" on public.quotations for select to anon, authenticated using (true);
create policy "demo write quotes" on public.quotations for all to anon, authenticated using (true) with check (true);

alter publication supabase_realtime add table public.leads, public.projects, public.team_members, public.quotations;
