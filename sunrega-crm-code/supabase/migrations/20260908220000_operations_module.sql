-- Migration: 20260908220000_operations_module.sql
-- Description: Additive tables, RLS policies, RPC functions and audit logging for Operations (Godown & DSA CRM)

-- ============================================================================
-- 1. USER PERMISSIONS TABLE
-- ============================================================================
create table if not exists public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission text not null,
  created_at timestamptz not null default now(),
  constraint user_permission_unique unique (user_id, permission)
);

create index if not exists idx_user_permissions_user on public.user_permissions(user_id);
create index if not exists idx_user_permissions_perm on public.user_permissions(permission);

-- Helper function to check granular permissions
create or replace function public.has_permission(p_user_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user_id and role = 'admin' and is_active
  ) or exists (
    select 1 from public.user_permissions
    where user_id = p_user_id and permission = p_permission
  );
$$;

-- ============================================================================
-- 2. OPERATIONS AUDIT LOG TABLE
-- ============================================================================
create table if not exists public.operations_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  module text not null,
  entity text not null,
  entity_id uuid,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_module on public.operations_audit_logs(module);
create index if not exists idx_audit_logs_created_at on public.operations_audit_logs(created_at desc);

-- ============================================================================
-- 3. GODOWN / INVENTORY TABLES
-- ============================================================================
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text default '',
  model text default '',
  spec text default '',
  category text not null,
  unit text not null,
  stock numeric not null default 0 check (stock >= 0),
  min_stock numeric not null default 0 check (min_stock >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_inventory_items_category on public.inventory_items(category);
create index if not exists idx_inventory_items_name on public.inventory_items(lower(name));

create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  type text not null check (type in ('IN', 'OUT')),
  quantity numeric not null check (quantity > 0),
  party text default '',
  site text default '',
  reference_no text default '',
  transaction_date date not null default current_date,
  remarks text default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_inventory_transactions_item on public.inventory_transactions(item_id);
create index if not exists idx_inventory_transactions_date on public.inventory_transactions(transaction_date desc);
create index if not exists idx_inventory_transactions_type on public.inventory_transactions(type);

-- ============================================================================
-- 4. DSA CRM TABLES
-- ============================================================================
create table if not exists public.dsas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text default '',
  email text default '',
  territory text default '',
  commission_rate numeric not null default 3 check (commission_rate >= 0),
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  joined_date date not null default current_date,
  payout_details text default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_dsas_status on public.dsas(status);
create index if not exists idx_dsas_name on public.dsas(lower(name));

create table if not exists public.dsa_leads (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  phone text default '',
  city text default '',
  system_size_kw numeric not null default 0 check (system_size_kw >= 0),
  deal_value numeric not null default 0 check (deal_value >= 0),
  referred_by_type text check (referred_by_type in ('dsa', 'lead', null)),
  referred_by_id uuid,
  status text not null default 'New' check (status in ('New', 'Site Visit', 'Quotation Sent', 'Proposal Sent', 'Won', 'Lost')),
  commission_rate numeric not null default 0 check (commission_rate >= 0),
  commission_paid boolean not null default false,
  lead_date date not null default current_date,
  remarks text default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_dsa_leads_status on public.dsa_leads(status);
create index if not exists idx_dsa_leads_ref on public.dsa_leads(referred_by_type, referred_by_id);
create index if not exists idx_dsa_leads_date on public.dsa_leads(lead_date desc);

create table if not exists public.dsa_commissions (
  id uuid primary key default gen_random_uuid(),
  dsa_id uuid references public.dsas(id) on delete set null,
  lead_id uuid references public.dsa_leads(id) on delete cascade,
  deal_value numeric not null default 0,
  commission_rate numeric not null default 0,
  amount numeric not null default 0,
  status text not null default 'Pending' check (status in ('Pending', 'Paid')),
  paid_date date,
  remarks text default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dsa_commission_lead_unique unique (lead_id)
);

create index if not exists idx_dsa_commissions_dsa on public.dsa_commissions(dsa_id);
create index if not exists idx_dsa_commissions_status on public.dsa_commissions(status);

-- ============================================================================
-- 5. CIRCULAR REFERRAL PREVENTION TRIGGER
-- ============================================================================
create or replace function public.check_dsa_lead_referral_cycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_cycle boolean := false;
begin
  if NEW.referred_by_type = 'lead' and NEW.referred_by_id is not null then
    if NEW.id is not null and NEW.referred_by_id = NEW.id then
      raise exception 'Self-referral is not permitted';
    end if;

    if NEW.id is not null then
      with recursive downline as (
        select id from public.dsa_leads
        where referred_by_type = 'lead' and referred_by_id = NEW.id
        union all
        select l.id from public.dsa_leads l
        join downline d on l.referred_by_type = 'lead' and l.referred_by_id = d.id
      )
      select exists(select 1 from downline where id = NEW.referred_by_id) into v_has_cycle;

      if v_has_cycle then
        raise exception 'Circular referral detected: cannot refer through downline client';
      end if;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_check_dsa_lead_referral_cycle on public.dsa_leads;
create trigger trg_check_dsa_lead_referral_cycle
before insert or update of referred_by_type, referred_by_id
on public.dsa_leads
for each row
execute function public.check_dsa_lead_referral_cycle();

-- ============================================================================
-- 6. ATOMIC INVENTORY TRANSACTION RPC
-- ============================================================================
create or replace function public.record_inventory_transaction(
  p_item_id uuid,
  p_type text,
  p_quantity numeric,
  p_party text default '',
  p_site text default '',
  p_reference_no text default '',
  p_transaction_date date default current_date,
  p_remarks text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_stock numeric;
  v_unit text;
  v_item_name text;
  v_new_stock numeric;
  v_tx_id uuid;
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  
  if p_type not in ('IN', 'OUT') then
    raise exception 'Invalid transaction type: %', p_type;
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Transaction quantity must be greater than zero';
  end if;

  -- Verify authorization
  if p_type = 'IN' and not (public.is_admin() or public.has_permission(v_user_id, 'operations.godown.inward.create') or public.has_permission(v_user_id, 'operations.godown.view')) then
    raise exception 'Unauthorized to record inward inventory transaction';
  end if;

  if p_type = 'OUT' and not (public.is_admin() or public.has_permission(v_user_id, 'operations.godown.outward.create') or public.has_permission(v_user_id, 'operations.godown.view')) then
    raise exception 'Unauthorized to record outward inventory transaction';
  end if;

  -- Lock target row for update
  select stock, unit, name into v_current_stock, v_unit, v_item_name
  from public.inventory_items
  where id = p_item_id
  for update;

  if not found then
    raise exception 'Inventory item not found: %', p_item_id;
  end if;

  if p_type = 'OUT' and v_current_stock < p_quantity then
    raise exception 'Insufficient stock for "%": requested %, but only % % available',
      v_item_name, p_quantity, v_current_stock, v_unit;
  end if;

  if p_type = 'IN' then
    v_new_stock := v_current_stock + p_quantity;
  else
    v_new_stock := v_current_stock - p_quantity;
  end if;

  update public.inventory_items
  set stock = v_new_stock, updated_at = now()
  where id = p_item_id;

  insert into public.inventory_transactions (
    item_id, type, quantity, party, site, reference_no, transaction_date, remarks, created_by
  ) values (
    p_item_id, p_type, p_quantity,
    coalesce(p_party, ''), coalesce(p_site, ''), coalesce(p_reference_no, ''),
    coalesce(p_transaction_date, current_date), coalesce(p_remarks, ''), v_user_id
  ) returning id into v_tx_id;

  insert into public.operations_audit_logs (
    user_id, action, module, entity, entity_id, metadata
  ) values (
    v_user_id, p_type || '_RECORDED', 'GODOWN', 'inventory_items', p_item_id,
    jsonb_build_object(
      'transaction_id', v_tx_id,
      'type', p_type,
      'quantity', p_quantity,
      'prev_stock', v_current_stock,
      'new_stock', v_new_stock,
      'party_or_site', case when p_type = 'IN' then p_party else p_site end,
      'reference_no', p_reference_no
    )
  );

  return jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'item_id', p_item_id,
    'prev_stock', v_current_stock,
    'new_stock', v_new_stock
  );
end;
$$;

-- ============================================================================
-- 7. ADMIN PERMISSION MANAGEMENT RPC
-- ============================================================================
create or replace function public.manage_user_permissions(
  p_target_user_id uuid,
  p_permissions text[]
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Unauthorized: Only an administrator can modify employee permissions';
  end if;

  delete from public.user_permissions where user_id = p_target_user_id;

  if p_permissions is not null and array_length(p_permissions, 1) > 0 then
    insert into public.user_permissions (user_id, permission)
    select p_target_user_id, unnest(p_permissions)
    on conflict do nothing;
  end if;

  insert into public.operations_audit_logs (
    user_id, action, module, entity, entity_id, metadata
  ) values (
    auth.uid(), 'PERMISSION_CHANGED', 'ADMIN', 'user_permissions', p_target_user_id,
    jsonb_build_object('permissions', p_permissions)
  );

  return true;
end;
$$;

-- ============================================================================
-- 8. COMMISSION SYNCHRONIZATION TRIGGER
-- ============================================================================
create or replace function public.sync_dsa_lead_commission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_root_dsa_id uuid := null;
  v_curr_id uuid;
  v_curr_type text;
  v_amount numeric := 0;
  v_depth int := 0;
begin
  -- Resolve root DSA
  v_curr_id := NEW.referred_by_id;
  v_curr_type := NEW.referred_by_type;

  while v_curr_id is not null and v_depth < 30 loop
    v_depth := v_depth + 1;
    if v_curr_type = 'dsa' then
      v_root_dsa_id := v_curr_id;
      exit;
    elsif v_curr_type = 'lead' then
      select referred_by_id, referred_by_type into v_curr_id, v_curr_type
      from public.dsa_leads where id = v_curr_id;
    else
      exit;
    end if;
  end loop;

  if NEW.status = 'Won' then
    v_amount := round(((coalesce(NEW.deal_value, 0) * coalesce(NEW.commission_rate, 0)) / 100.0)::numeric, 2);

    insert into public.dsa_commissions (
      lead_id, dsa_id, deal_value, commission_rate, amount, status, paid_date, created_by
    ) values (
      NEW.id, v_root_dsa_id, coalesce(NEW.deal_value, 0), coalesce(NEW.commission_rate, 0),
      v_amount, case when NEW.commission_paid then 'Paid' else 'Pending' end,
      case when NEW.commission_paid then current_date else null end,
      auth.uid()
    )
    on conflict (lead_id) do update set
      dsa_id = excluded.dsa_id,
      deal_value = excluded.deal_value,
      commission_rate = excluded.commission_rate,
      amount = excluded.amount,
      status = case when NEW.commission_paid then 'Paid' else 'Pending' end,
      paid_date = case when NEW.commission_paid then coalesce(public.dsa_commissions.paid_date, current_date) else null end,
      updated_at = now();
  else
    -- If lead is not Won, set commission to 0 or remove pending
    delete from public.dsa_commissions where lead_id = NEW.id and status = 'Pending';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_sync_dsa_lead_commission on public.dsa_leads;
create trigger trg_sync_dsa_lead_commission
after insert or update of status, deal_value, commission_rate, commission_paid, referred_by_type, referred_by_id
on public.dsa_leads
for each row
execute function public.sync_dsa_lead_commission();

-- ============================================================================
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all additive tables
alter table public.user_permissions enable row level security;
alter table public.operations_audit_logs enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.dsas enable row level security;
alter table public.dsa_leads enable row level security;
alter table public.dsa_commissions enable row level security;

-- user_permissions
create policy "admin manages permissions" on public.user_permissions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "users read own permissions" on public.user_permissions
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- operations_audit_logs
create policy "admin reads audit logs" on public.operations_audit_logs
  for select to authenticated
  using (public.is_admin());

create policy "authenticated users insert audit logs" on public.operations_audit_logs
  for insert to authenticated
  with check (true);

-- inventory_items
create policy "read inventory items" on public.inventory_items
  for select to authenticated
  using (
    public.is_admin() or
    public.has_permission(auth.uid(), 'operations.view') or
    public.has_permission(auth.uid(), 'operations.godown.view') or
    public.has_permission(auth.uid(), 'operations.godown.inventory.view')
  );

create policy "create inventory items" on public.inventory_items
  for insert to authenticated
  with check (
    public.is_admin() or
    public.has_permission(auth.uid(), 'operations.godown.inventory.create')
  );

create policy "update inventory items" on public.inventory_items
  for update to authenticated
  using (
    public.is_admin() or
    public.has_permission(auth.uid(), 'operations.godown.inventory.update')
  )
  with check (
    public.is_admin() or
    public.has_permission(auth.uid(), 'operations.godown.inventory.update')
  );

create policy "delete inventory items" on public.inventory_items
  for delete to authenticated
  using (
    public.is_admin() or
    public.has_permission(auth.uid(), 'operations.godown.inventory.delete')
  );

-- inventory_transactions
create policy "read inventory transactions" on public.inventory_transactions
  for select to authenticated
  using (
    public.is_admin() or
    public.has_permission(auth.uid(), 'operations.view') or
    public.has_permission(auth.uid(), 'operations.godown.view') or
    public.has_permission(auth.uid(), 'operations.godown.ledger.view')
  );

create policy "insert inventory transactions" on public.inventory_transactions
  for insert to authenticated
  with check (
    public.is_admin() or
    (type = 'IN' and public.has_permission(auth.uid(), 'operations.godown.inward.create')) or
    (type = 'OUT' and public.has_permission(auth.uid(), 'operations.godown.outward.create'))
  );

create policy "admin modifies inventory transactions" on public.inventory_transactions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- dsas
create policy "read dsas" on public.dsas
  for select to authenticated
  using (
    public.is_admin() or
    public.has_permission(auth.uid(), 'operations.view') or
    public.has_permission(auth.uid(), 'operations.dsa.view')
  );

create policy "create dsas" on public.dsas
  for insert to authenticated
  with check (
    public.is_admin() or
    public.has_permission(auth.uid(), 'operations.dsa.create')
  );

create policy "update dsas" on public.dsas
  for update to authenticated
  using (
    public.is_admin() or
    public.has_permission(auth.uid(), 'operations.dsa.update')
  )
  with check (
    public.is_admin() or
    public.has_permission(auth.uid(), 'operations.dsa.update')
  );

create policy "delete dsas" on public.dsas
  for delete to authenticated
  using (
    public.is_admin() or
    public.has_permission(auth.uid(), 'operations.dsa.delete')
  );

-- dsa_leads
create policy "read dsa leads" on public.dsa_leads
  for select to authenticated
  using (
    public.is_admin() or
    public.has_permission(auth.uid(), 'operations.view') or
    public.has_permission(auth.uid(), 'operations.dsa.view') or
    public.has_permission(auth.uid(), 'operations.dsa.leads.view')
  );

create policy "create dsa leads" on public.dsa_leads
  for insert to authenticated
  with check (
    public.is_admin() or
    public.has_permission(auth.uid(), 'operations.dsa.leads.create')
  );

create policy "update dsa leads" on public.dsa_leads
  for update to authenticated
  using (
    public.is_admin() or
    public.has_permission(auth.uid(), 'operations.dsa.leads.update')
  )
  with check (
    public.is_admin() or
    public.has_permission(auth.uid(), 'operations.dsa.leads.update')
  );

create policy "delete dsa leads" on public.dsa_leads
  for delete to authenticated
  using (
    public.is_admin() or
    public.has_permission(auth.uid(), 'operations.dsa.leads.delete')
  );

-- dsa_commissions
create policy "read dsa commissions" on public.dsa_commissions
  for select to authenticated
  using (
    public.is_admin() or
    public.has_permission(auth.uid(), 'operations.view') or
    public.has_permission(auth.uid(), 'operations.dsa.view') or
    public.has_permission(auth.uid(), 'operations.dsa.commissions.view')
  );

create policy "manage dsa commissions" on public.dsa_commissions
  for all to authenticated
  using (
    public.is_admin() or
    public.has_permission(auth.uid(), 'operations.dsa.commissions.manage')
  )
  with check (
    public.is_admin() or
    public.has_permission(auth.uid(), 'operations.dsa.commissions.manage')
  );

-- Realtime publications for additive tables
alter publication supabase_realtime add table
  public.user_permissions,
  public.inventory_items,
  public.inventory_transactions,
  public.dsas,
  public.dsa_leads,
  public.dsa_commissions;
