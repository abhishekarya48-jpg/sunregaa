import { isSupabaseConfigured, supabase } from './supabase'

export const TABLES = ['leads', 'projects', 'team_members', 'quotations']

const localKey = (table) => `sunrega_${table}`
const localRead = (table) => JSON.parse(localStorage.getItem(localKey(table)) || '[]')
const localWrite = (table, rows) => localStorage.setItem(localKey(table), JSON.stringify(rows))

export async function list(table) {
  if (!isSupabaseConfigured) return localRead(table)
  const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function save(table, record) {
  const now = new Date().toISOString()
  const row = { ...record, updated_at: now }
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from(table).upsert(row).select().single()
    if (error) throw error
    return data
  }
  const rows = localRead(table)
  const index = rows.findIndex((item) => item.id === row.id)
  if (index >= 0) rows[index] = row
  else rows.unshift({ ...row, created_at: row.created_at || now })
  localWrite(table, rows)
  return row
}

export async function remove(table, id) {
  if (isSupabaseConfigured) {
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) throw error
    return
  }
  localWrite(table, localRead(table).filter((item) => item.id !== id))
}

export function subscribe(table, onChange) {
  if (!isSupabaseConfigured) return () => {}
  const channel = supabase.channel(`public:${table}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, onChange)
    .subscribe()
  return () => supabase.removeChannel(channel)
}
