import { useEffect, useMemo, useState } from 'react'
import { BarChart3, BriefcaseBusiness, FileText, LayoutDashboard, Plus, Search, Settings, Sun, Trash2, Users, X, Zap } from 'lucide-react'
import { isSupabaseConfigured } from './lib/supabase'
import { list, remove, save, subscribe, TABLES } from './lib/database'

const STAGES = ['New', 'Contacted', 'Survey Scheduled', 'Quotation Sent', 'Negotiation', 'Won', 'Lost']
const SEGMENTS = ['Residential Rooftop', 'Commercial Rooftop', 'Industrial', 'Government', 'Ground Mounted']
const nav = [
  ['dashboard', 'Dashboard', LayoutDashboard], ['leads', 'Leads', BarChart3],
  ['quotations', 'Quotations', FileText], ['projects', 'Projects', BriefcaseBusiness],
  ['team_members', 'Team', Users], ['settings', 'Settings', Settings],
]
const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`
const newId = () => crypto.randomUUID()

const fields = {
  leads: [
    ['name', 'Customer / company', 'text'], ['phone', 'Phone', 'tel'], ['email', 'Email', 'email'],
    ['location', 'Location', 'text'], ['segment', 'Segment', 'select', SEGMENTS], ['source', 'Source', 'text'],
    ['kw', 'System size (kW)', 'number'], ['stage', 'Pipeline stage', 'select', STAGES],
    ['follow_up', 'Next follow-up', 'date'], ['quote', 'Estimated value', 'number'], ['notes', 'Notes', 'textarea'],
  ],
  projects: [
    ['name', 'Project name', 'text'], ['location', 'Location', 'text'], ['segment', 'Segment', 'select', SEGMENTS],
    ['kw', 'System size (kW)', 'number'], ['status', 'Status', 'select', ['Planning', 'Procurement', 'Installation', 'Commissioning', 'Complete']],
    ['progress', 'Progress (%)', 'number'], ['target_date', 'Target date', 'date'], ['value', 'Contract value', 'number'], ['notes', 'Notes', 'textarea'],
  ],
  team_members: [['name', 'Full name', 'text'], ['role', 'Role', 'text'], ['phone', 'Phone', 'tel'], ['email', 'Email', 'email']],
  quotations: [['customer_name', 'Customer', 'text'], ['quote_number', 'Quote number', 'text'], ['system_size', 'System size (kW)', 'number'], ['amount', 'Amount', 'number'], ['status', 'Status', 'select', ['Draft', 'Sent', 'Accepted', 'Rejected']], ['valid_until', 'Valid until', 'date'], ['notes', 'Notes', 'textarea']],
}

function App() {
  const [view, setView] = useState('dashboard')
  const [data, setData] = useState(Object.fromEntries(TABLES.map((t) => [t, []])))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState(null)

  const refresh = async () => {
    try {
      const rows = await Promise.all(TABLES.map(list))
      setData(Object.fromEntries(TABLES.map((table, index) => [table, rows[index]])))
      setError('')
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  useEffect(() => {
    refresh()
    const cleanups = TABLES.map((table) => subscribe(table, refresh))
    return () => cleanups.forEach((fn) => fn())
  }, [])

  const filtered = useMemo(() => {
    if (!TABLES.includes(view)) return []
    const term = search.toLowerCase()
    return data[view].filter((row) => JSON.stringify(row).toLowerCase().includes(term))
  }, [data, search, view])

  const submit = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const row = { ...editor.item }
    fields[editor.table].forEach(([key, , type]) => { row[key] = type === 'number' ? Number(form.get(key) || 0) : form.get(key) || null })
    row.id ||= newId()
    try { await save(editor.table, row); setEditor(null); await refresh() } catch (err) { setError(err.message) }
  }

  const destroy = async () => {
    if (!editor?.item.id || !confirm('Delete this record?')) return
    try { await remove(editor.table, editor.item.id); setEditor(null); await refresh() } catch (err) { setError(err.message) }
  }

  const leadsValue = data.leads.reduce((sum, lead) => sum + Number(lead.quote || 0), 0)
  const wonValue = data.leads.filter((lead) => lead.stage === 'Won').reduce((sum, lead) => sum + Number(lead.quote || 0), 0)

  return <div className="app-shell">
    <aside>
      <div className="brand"><span><Sun size={24} /></span><div>SUNREGA<small>SOLAR CRM</small></div></div>
      <nav>{nav.map(([id, label, Icon]) => <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}><Icon size={18} />{label}</button>)}</nav>
      <div className="sync"><i className={isSupabaseConfigured ? 'online' : ''} />{isSupabaseConfigured ? 'Supabase connected' : 'Local demo mode'}<small>{isSupabaseConfigured ? 'Live team sync enabled' : 'Add environment keys to connect'}</small></div>
    </aside>
    <main>
      <header><div><h1>{nav.find(([id]) => id === view)?.[1] || 'Dashboard'}</h1><p>Solar sales and execution, all in one place.</p></div><div className="header-actions"><label><Search size={16} /><input placeholder="Search records..." value={search} onChange={(e) => setSearch(e.target.value)} /></label>{TABLES.includes(view) && <button className="primary" onClick={() => setEditor({ table: view, item: {} })}><Plus size={17} /> Add new</button>}</div></header>
      <section className="content">
        {error && <div className="alert">{error}<button onClick={() => setError('')}><X size={16} /></button></div>}
        {loading ? <div className="empty">Loading your workspace…</div> : view === 'dashboard' ? <>
          <div className="kpis">
            <Kpi label="Total leads" value={data.leads.length} note="Across all pipeline stages" />
            <Kpi label="Pipeline value" value={money(leadsValue)} note="Current opportunity value" />
            <Kpi label="Won business" value={money(wonValue)} note="Converted sales" />
            <Kpi label="Active projects" value={data.projects.filter((p) => p.status !== 'Complete').length} note="In execution" />
          </div>
          <div className="dashboard-grid">
            <div className="panel"><div className="panel-title"><h2>Lead pipeline</h2><button onClick={() => setView('leads')}>View all</button></div><div className="funnel">{STAGES.slice(0, 6).map((stage) => { const count = data.leads.filter((lead) => lead.stage === stage).length; return <div key={stage}><span>{stage}<b>{count}</b></span><div><i style={{ width: `${Math.max(4, count / Math.max(1, data.leads.length) * 100)}%` }} /></div></div> })}</div></div>
            <div className="panel"><div className="panel-title"><h2>Project delivery</h2></div>{data.projects.length ? data.projects.slice(0, 5).map((p) => <div className="project-line" key={p.id}><span><b>{p.name}</b><small>{p.kw} kW · {p.status}</small></span><strong>{p.progress || 0}%</strong><div><i style={{ width: `${p.progress || 0}%` }} /></div></div>) : <Empty />}</div>
          </div>
        </> : view === 'settings' ? <SettingsView /> : <Records table={view} rows={filtered} onEdit={(item) => setEditor({ table: view, item })} />}
      </section>
    </main>
    {editor && <Modal editor={editor} submit={submit} destroy={destroy} close={() => setEditor(null)} />}
  </div>
}

function Kpi({ label, value, note }) { return <div className="kpi"><div className="kpi-icon"><Zap size={18} /></div><p>{label}</p><strong>{value}</strong><small>{note}</small></div> }
function Empty() { return <div className="empty">No records yet. Add your first one to get started.</div> }

function Records({ table, rows, onEdit }) {
  if (!rows.length) return <div className="panel"><Empty /></div>
  if (table === 'leads') return <div className="kanban">{STAGES.map((stage) => <div className="column" key={stage}><h3>{stage}<span>{rows.filter((r) => r.stage === stage).length}</span></h3>{rows.filter((r) => r.stage === stage).map((lead) => <button className="lead-card" key={lead.id} onClick={() => onEdit(lead)}><b>{lead.name}</b><small>{lead.location || 'No location'} · {lead.kw || 0} kW</small><span>{lead.segment}</span><strong>{money(lead.quote)}</strong></button>)}</div>)}</div>
  return <div className="panel table-wrap"><table><thead><tr>{table === 'projects' ? <><th>Project</th><th>Status</th><th>Size</th><th>Progress</th><th>Value</th></> : table === 'team_members' ? <><th>Name</th><th>Role</th><th>Phone</th><th>Email</th></> : <><th>Quote</th><th>Customer</th><th>Status</th><th>Size</th><th>Amount</th></>}<th /></tr></thead><tbody>{rows.map((r) => <tr key={r.id} onClick={() => onEdit(r)}>{table === 'projects' ? <><td><b>{r.name}</b><small>{r.location}</small></td><td><Badge text={r.status} /></td><td>{r.kw} kW</td><td>{r.progress}%</td><td>{money(r.value)}</td></> : table === 'team_members' ? <><td><b>{r.name}</b></td><td>{r.role}</td><td>{r.phone || '—'}</td><td>{r.email || '—'}</td></> : <><td><b>{r.quote_number}</b></td><td>{r.customer_name}</td><td><Badge text={r.status} /></td><td>{r.system_size} kW</td><td>{money(r.amount)}</td></>}<td>›</td></tr>)}</tbody></table></div>
}
function Badge({ text }) { return <span className="badge">{text}</span> }

function Modal({ editor, submit, destroy, close }) {
  const isEdit = Boolean(editor.item.id)
  return <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}><form className="modal" onSubmit={submit}><div className="modal-head"><div><small>{isEdit ? 'EDIT RECORD' : 'NEW RECORD'}</small><h2>{isEdit ? editor.item.name || editor.item.customer_name : `Add ${editor.table.replace('_', ' ')}`}</h2></div><button type="button" onClick={close}><X /></button></div><div className="form-grid">{fields[editor.table].map(([key, label, type, options]) => <label className={type === 'textarea' ? 'wide' : ''} key={key}><span>{label}</span>{type === 'select' ? <select name={key} defaultValue={editor.item[key] || options[0]}>{options.map((option) => <option key={option}>{option}</option>)}</select> : type === 'textarea' ? <textarea name={key} defaultValue={editor.item[key] || ''} rows="4" /> : <input name={key} type={type} defaultValue={editor.item[key] || ''} required={['name', 'customer_name', 'quote_number'].includes(key)} />}</label>)}</div><div className="modal-actions">{isEdit && <button type="button" className="danger" onClick={destroy}><Trash2 size={16} /> Delete</button>}<span /><button type="button" onClick={close}>Cancel</button><button className="primary">Save record</button></div></form></div>
}

function SettingsView() { return <div className="settings-grid"><div className="panel"><h2>Supabase connection</h2><p className="muted">This React app reads its connection securely from Vite environment variables.</p><div className={`connection ${isSupabaseConfigured ? 'connected' : ''}`}><i /> <b>{isSupabaseConfigured ? 'Connected and syncing' : 'Local demo mode'}</b></div><ol><li>Create a Supabase project.</li><li>Run <code>supabase/schema.sql</code> in the SQL Editor.</li><li>Copy <code>.env.example</code> to <code>.env.local</code> and add the URL and anon key.</li><li>Restart <code>npm run dev</code>.</li></ol></div><div className="panel"><h2>Architecture notes</h2><p className="muted">The original single HTML file has been split into React UI, database helpers and a versioned SQL schema. When no cloud keys exist, the same CRUD screens use localStorage for safe local development.</p><p className="security">Before public production use, enable Supabase Auth and replace the demo RLS policies with user or organization scoped policies.</p></div></div> }

export default App
