import { supabase, isSupabaseConfigured } from './supabase'

export const PERMISSION_GROUPS = [
  {
    key: "general",
    label: "GENERAL",
    permissions: [
      { key: "operations.view", label: "Operations Access" }
    ]
  },
  {
    key: "godown",
    label: "GODOWN / INVENTORY",
    permissions: [
      { key: "operations.godown.view", label: "View Dashboard & Portal" },
      { key: "operations.godown.inventory.view", label: "View Inventory" },
      { key: "operations.godown.inventory.create", label: "Add Inventory" },
      { key: "operations.godown.inventory.update", label: "Edit Inventory" },
      { key: "operations.godown.inventory.delete", label: "Delete Inventory" },
      { key: "operations.godown.inward.create", label: "Inward Entry" },
      { key: "operations.godown.outward.create", label: "Outward Entry" },
      { key: "operations.godown.ledger.view", label: "Ledger" },
      { key: "operations.godown.export", label: "Export" },
      { key: "operations.godown.backup", label: "Backup" },
      { key: "operations.godown.restore", label: "Restore" }
    ]
  },
  {
    key: "dsa",
    label: "DSA CRM",
    permissions: [
      { key: "operations.dsa.view", label: "View DSA CRM" },
      { key: "operations.dsa.dashboard.view", label: "Dashboard" },
      { key: "operations.dsa.create", label: "Manage DSAs (Add)" },
      { key: "operations.dsa.update", label: "Manage DSAs (Edit)" },
      { key: "operations.dsa.delete", label: "Manage DSAs (Delete)" },
      { key: "operations.dsa.leads.view", label: "View Leads" },
      { key: "operations.dsa.leads.create", label: "Manage Leads (Add)" },
      { key: "operations.dsa.leads.update", label: "Manage Leads (Edit)" },
      { key: "operations.dsa.leads.delete", label: "Manage Leads (Delete)" },
      { key: "operations.dsa.network.view", label: "Referral Network" },
      { key: "operations.dsa.commissions.view", label: "View Commissions" },
      { key: "operations.dsa.commissions.manage", label: "Manage Commissions" },
      { key: "operations.dsa.export", label: "Export" },
      { key: "operations.dsa.backup", label: "Backup" },
      { key: "operations.dsa.restore", label: "Restore" }
    ]
  }
];

export function hasUserPermission(profile, userPermissions, permissionKey) {
  if (!profile) return false;
  if (profile.role === 'admin') return true;
  if (!userPermissions || !Array.isArray(userPermissions)) return false;
  return userPermissions.includes(permissionKey);
}

// ============================================================================
// Permissions API
// ============================================================================
export async function fetchUserPermissions(userId) {
  if (!isSupabaseConfigured || !userId) return [];
  const { data, error } = await supabase
    .from('user_permissions')
    .select('permission')
    .eq('user_id', userId);
  if (error) {
    console.error('Error fetching permissions:', error);
    return [];
  }
  return data.map(r => r.permission);
}

export async function saveUserPermissions(userId, permissions) {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured');
  // Use secure RPC
  const { error } = await supabase.rpc('manage_user_permissions', {
    p_target_user_id: userId,
    p_permissions: permissions
  });
  if (error) throw error;
  return true;
}

export async function saveBulkUserPermissions(userIds, permissions) {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured');
  for (const userId of userIds) {
    const { error } = await supabase.rpc('manage_user_permissions', {
      p_target_user_id: userId,
      p_permissions: permissions
    });
    if (error) throw error;
  }
  return true;
}

// ============================================================================
// Godown / Inventory API
// ============================================================================
export async function fetchInventoryItems() {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return data.map(i => ({
    ...i,
    minStock: Number(i.min_stock),
    stock: Number(i.stock)
  }));
}

export async function saveInventoryItem(item) {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured');
  const payload = {
    name: item.name,
    brand: item.brand || '',
    model: item.model || '',
    spec: item.spec || '',
    category: item.category,
    unit: item.unit,
    min_stock: Number(item.minStock) || 0,
    stock: Number(item.stock) || 0,
    updated_at: new Date().toISOString()
  };
  if (item.id) {
    const { data, error } = await supabase
      .from('inventory_items')
      .update(payload)
      .eq('id', item.id)
      .select()
      .single();
    if (error) throw error;
    return { ...data, minStock: Number(data.min_stock), stock: Number(data.stock) };
  } else {
    const { data, error } = await supabase
      .from('inventory_items')
      .insert({ ...payload, created_by: (await supabase.auth.getUser()).data.user?.id })
      .select()
      .single();
    if (error) throw error;
    return { ...data, minStock: Number(data.min_stock), stock: Number(data.stock) };
  }
}

export async function deleteInventoryItem(id) {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured');
  const { error } = await supabase.from('inventory_items').delete().eq('id', id);
  if (error) throw error;
}

export async function recordInventoryTransaction(tx) {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured');
  // Use atomic server-side RPC function
  const { data, error } = await supabase.rpc('record_inventory_transaction', {
    p_item_id: tx.itemId,
    p_type: tx.type,
    p_quantity: Number(tx.qty),
    p_party: tx.party || '',
    p_site: tx.site || '',
    p_reference_no: tx.refNo || '',
    p_transaction_date: tx.date || new Date().toISOString().slice(0, 10),
    p_remarks: tx.remarks || ''
  });
  if (error) throw error;
  return data;
}

export async function fetchInventoryTransactions() {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('inventory_transactions')
    .select('*')
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(t => ({
    id: t.id,
    itemId: t.item_id,
    type: t.type,
    qty: Number(t.quantity),
    party: t.party,
    site: t.site,
    refNo: t.reference_no,
    date: t.transaction_date,
    remarks: t.remarks,
    createdAt: t.created_at
  }));
}

// ============================================================================
// DSA CRM API
// ============================================================================
export async function fetchDSAs() {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('dsas')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return data.map(d => ({
    id: d.id,
    name: d.name,
    phone: d.phone,
    email: d.email,
    territory: d.territory,
    commissionRate: Number(d.commission_rate),
    status: d.status,
    joinedDate: d.joined_date,
    payoutDetails: d.payout_details
  }));
}

export async function saveDSA(dsa) {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured');
  const payload = {
    name: dsa.name,
    phone: dsa.phone || '',
    email: dsa.email || '',
    territory: dsa.territory || '',
    commission_rate: Number(dsa.commissionRate) || 0,
    status: dsa.status || 'Active',
    joined_date: dsa.joinedDate || new Date().toISOString().slice(0, 10),
    payout_details: dsa.payoutDetails || '',
    updated_at: new Date().toISOString()
  };
  if (dsa.id) {
    const { data, error } = await supabase.from('dsas').update(payload).eq('id', dsa.id).select().single();
    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      phone: data.phone,
      email: data.email,
      territory: data.territory,
      commissionRate: Number(data.commission_rate),
      status: data.status,
      joinedDate: data.joined_date,
      payoutDetails: data.payout_details
    };
  } else {
    const { data, error } = await supabase
      .from('dsas')
      .insert({ ...payload, created_by: (await supabase.auth.getUser()).data.user?.id })
      .select()
      .single();
    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      phone: data.phone,
      email: data.email,
      territory: data.territory,
      commissionRate: Number(data.commission_rate),
      status: data.status,
      joinedDate: data.joined_date,
      payoutDetails: data.payout_details
    };
  }
}

export async function deleteDSA(id) {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured');
  const { error } = await supabase.from('dsas').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchDsaLeads() {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('dsa_leads')
    .select('*')
    .order('lead_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(l => ({
    id: l.id,
    customerName: l.customer_name,
    phone: l.phone,
    city: l.city,
    systemSizeKW: Number(l.system_size_kw),
    dealValue: Number(l.deal_value),
    referredByType: l.referred_by_type,
    referredById: l.referred_by_id,
    status: l.status,
    commissionRate: Number(l.commission_rate),
    commissionPaid: Boolean(l.commission_paid),
    leadDate: l.lead_date,
    remarks: l.remarks
  }));
}

export async function saveDsaLead(lead) {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured');
  const payload = {
    customer_name: lead.customerName,
    phone: lead.phone || '',
    city: lead.city || '',
    system_size_kw: Number(lead.systemSizeKW) || 0,
    deal_value: Number(lead.dealValue) || 0,
    referred_by_type: lead.referredByType || null,
    referred_by_id: lead.referredById || null,
    status: lead.status || 'New',
    commission_rate: Number(lead.commissionRate) || 0,
    commission_paid: Boolean(lead.commissionPaid),
    lead_date: lead.leadDate || new Date().toISOString().slice(0, 10),
    remarks: lead.remarks || '',
    updated_at: new Date().toISOString()
  };
  if (lead.id) {
    const { data, error } = await supabase.from('dsa_leads').update(payload).eq('id', lead.id).select().single();
    if (error) throw error;
    return {
      id: data.id,
      customerName: data.customer_name,
      phone: data.phone,
      city: data.city,
      systemSizeKW: Number(data.system_size_kw),
      dealValue: Number(data.deal_value),
      referredByType: data.referred_by_type,
      referredById: data.referred_by_id,
      status: data.status,
      commissionRate: Number(data.commission_rate),
      commissionPaid: Boolean(data.commission_paid),
      leadDate: data.lead_date,
      remarks: data.remarks
    };
  } else {
    const { data, error } = await supabase
      .from('dsa_leads')
      .insert({ ...payload, created_by: (await supabase.auth.getUser()).data.user?.id })
      .select()
      .single();
    if (error) throw error;
    return {
      id: data.id,
      customerName: data.customer_name,
      phone: data.phone,
      city: data.city,
      systemSizeKW: Number(data.system_size_kw),
      dealValue: Number(data.deal_value),
      referredByType: data.referred_by_type,
      referredById: data.referred_by_id,
      status: data.status,
      commissionRate: Number(data.commission_rate),
      commissionPaid: Boolean(data.commission_paid),
      leadDate: data.lead_date,
      remarks: data.remarks
    };
  }
}

export async function deleteDsaLead(id) {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured');
  const { error } = await supabase.from('dsa_leads').delete().eq('id', id);
  if (error) throw error;
}

export async function toggleLeadCommissionPaid(leadId, nextPaidState) {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured');
  const { error } = await supabase
    .from('dsa_leads')
    .update({ commission_paid: nextPaidState, updated_at: new Date().toISOString() })
    .eq('id', leadId);
  if (error) throw error;
}

// ============================================================================
// Safe Module-Specific Backup and Restore API
// ============================================================================
export async function restoreGodownData(backupData) {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured');
  if (!backupData || !Array.isArray(backupData.items)) {
    throw new Error('Invalid Godown backup file: missing items list');
  }

  // Insert items safely
  for (const it of backupData.items) {
    if (!it.name || !it.category || !it.unit) continue;
    const payload = {
      name: it.name,
      brand: it.brand || '',
      model: it.model || '',
      spec: it.spec || '',
      category: it.category,
      unit: it.unit,
      stock: Number(it.stock) || 0,
      min_stock: Number(it.minStock || it.min_stock) || 0,
      updated_at: new Date().toISOString()
    };
    await supabase.from('inventory_items').upsert(payload, { onConflict: 'name' });
  }

  return true;
}

export async function restoreDsaData(backupData) {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured');
  if (!backupData || !Array.isArray(backupData.dsas) || !Array.isArray(backupData.leads)) {
    throw new Error('Invalid DSA CRM backup file: missing dsas or leads');
  }

  for (const d of backupData.dsas) {
    if (!d.name) continue;
    const payload = {
      name: d.name,
      phone: d.phone || '',
      email: d.email || '',
      territory: d.territory || '',
      commission_rate: Number(d.commissionRate || d.commission_rate) || 0,
      status: d.status || 'Active',
      joined_date: d.joinedDate || d.joined_date || new Date().toISOString().slice(0, 10),
      payout_details: d.payoutDetails || d.payout_details || ''
    };
    await supabase.from('dsas').upsert(payload, { onConflict: 'name' });
  }

  for (const l of backupData.leads) {
    if (!l.customerName && !l.customer_name) continue;
    const payload = {
      customer_name: l.customerName || l.customer_name,
      phone: l.phone || '',
      city: l.city || '',
      system_size_kw: Number(l.systemSizeKW || l.system_size_kw) || 0,
      deal_value: Number(l.dealValue || l.deal_value) || 0,
      status: l.status || 'New',
      commission_rate: Number(l.commissionRate || l.commission_rate) || 0,
      commission_paid: Boolean(l.commissionPaid || l.commission_paid),
      lead_date: l.leadDate || l.lead_date || new Date().toISOString().slice(0, 10),
      remarks: l.remarks || ''
    };
    await supabase.from('dsa_leads').upsert(payload, { onConflict: 'customer_name' });
  }

  return true;
}
