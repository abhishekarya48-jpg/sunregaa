-- Run this after schema.sql to add secure login and role-based access.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text default '',
  role text not null default 'worker' check (role in ('admin', 'worker')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), coalesce(new.raw_user_meta_data->>'role', 'worker'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

insert into public.profiles (id, email, full_name)
select id, email, coalesce(raw_user_meta_data->>'full_name', '') from auth.users
on conflict (id) do nothing;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin' and is_active); $$;

alter table public.profiles enable row level security;

drop policy if exists "demo read leads" on public.leads;
drop policy if exists "demo write leads" on public.leads;
drop policy if exists "demo read projects" on public.projects;
drop policy if exists "demo write projects" on public.projects;
drop policy if exists "demo read team" on public.team_members;
drop policy if exists "demo write team" on public.team_members;
drop policy if exists "demo read quotes" on public.quotations;
drop policy if exists "demo write quotes" on public.quotations;

create policy "authenticated leads" on public.leads for all to authenticated using (true) with check (true);
create policy "authenticated projects" on public.projects for all to authenticated using (true) with check (true);
create policy "authenticated team" on public.team_members for all to authenticated using (true) with check (true);
create policy "authenticated quotations" on public.quotations for all to authenticated using (true) with check (true);
create policy "read own profile or admin" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "admin manages profiles" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- IMPORTANT: Create the first user in Authentication > Users, then replace the
-- email below and run this statement once to make that account the first admin:
-- update public.profiles set role = 'admin' where email = 'owner@sunrega.com';
