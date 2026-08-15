import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  FileText,
  LayoutDashboard,
  LogOut,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Users,
  X,
  Zap,
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { list, remove, save, subscribe, TABLES } from "./lib/database";
import sunregaLogo from "./assets/sunrega-logo.png";

const STAGES = [
  "New",
  "Contacted",
  "Survey Scheduled",
  "Quotation Sent",
  "Negotiation",
  "Won",
  "Lost",
];
const SEGMENTS = [
  "Residential Rooftop",
  "Commercial Rooftop",
  "Industrial",
  "Government",
  "Ground Mounted",
];
const baseNav = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["leads", "Leads", BarChart3],
  ["quotations", "Quotations", FileText],
  ["projects", "Projects", BriefcaseBusiness],
  ["team_members", "Team", Users],
  ["settings", "Settings", Settings],
];
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const newId = () => crypto.randomUUID();

const fields = {
  leads: [
    ["name", "Customer / company", "text"],
    ["phone", "Phone", "tel"],
    ["email", "Email", "email"],
    ["location", "Location", "text"],
    ["segment", "Segment", "select", SEGMENTS],
    ["source", "Source", "text"],
    ["kw", "System size (kW)", "number"],
    ["stage", "Pipeline stage", "select", STAGES],
    ["follow_up", "Next follow-up", "date"],
    ["quote", "Estimated value", "number"],
    ["notes", "Notes", "textarea"],
  ],
  projects: [
    ["name", "Project name", "text"],
    ["location", "Location", "text"],
    ["segment", "Segment", "select", SEGMENTS],
    ["kw", "System size (kW)", "number"],
    [
      "status",
      "Status",
      "select",
      ["Planning", "Procurement", "Installation", "Commissioning", "Complete"],
    ],
    ["progress", "Progress (%)", "number"],
    ["target_date", "Target date", "date"],
    ["value", "Contract value", "number"],
    ["notes", "Notes", "textarea"],
  ],
  team_members: [
    ["name", "Full name", "text"],
    ["role", "Role", "text"],
    ["phone", "Phone", "tel"],
    ["email", "Email", "email"],
  ],
  quotations: [],
};

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) return;
    const loadProfile = async (nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
        setAuthLoading(false);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", nextSession.user.id)
        .single();
      setProfile(
        data || {
          id: nextSession.user.id,
          email: nextSession.user.email,
          full_name: nextSession.user.email,
          role: "worker",
        },
      );
      setAuthLoading(false);
    };
    supabase.auth.getSession().then(({ data }) => loadProfile(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => loadProfile(nextSession),
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  if (!isSupabaseConfigured) return <SetupRequired />;
  if (authLoading)
    return (
      <div className="auth-page">
        <div className="auth-card auth-loading">Loading secure workspace…</div>
      </div>
    );
  if (!session) return <Login />;
  return <CRMApp profile={profile} onSignOut={() => supabase.auth.signOut()} />;
}

function CRMApp({ profile, onSignOut }) {
  const [view, setView] = useState("dashboard");
  const [data, setData] = useState(
    Object.fromEntries(TABLES.map((t) => [t, []])),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState(null);
  const appNav =
    profile?.role === "admin"
      ? [
          ...baseNav.slice(0, 5),
          ["users", "User access", ShieldCheck],
          baseNav[5],
        ]
      : baseNav;

  const refresh = async () => {
    try {
      const rows = await Promise.all(TABLES.map(list));
      setData(
        Object.fromEntries(TABLES.map((table, index) => [table, rows[index]])),
      );
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const cleanups = TABLES.map((table) => subscribe(table, refresh));
    return () => cleanups.forEach((fn) => fn());
  }, []);

  const filtered = useMemo(() => {
    if (!TABLES.includes(view)) return [];
    const term = search.toLowerCase();
    return data[view].filter((row) =>
      JSON.stringify(row).toLowerCase().includes(term),
    );
  }, [data, search, view]);

  const submit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const row = { ...editor.item };
    fields[editor.table].forEach(([key, , type]) => {
      row[key] =
        type === "number" ? Number(form.get(key) || 0) : form.get(key) || null;
    });
    row.id ||= newId();
    try {
      await save(editor.table, row);
      setEditor(null);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const destroy = async () => {
    if (!editor?.item.id || !confirm("Delete this record?")) return;
    try {
      await remove(editor.table, editor.item.id);
      setEditor(null);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const saveQuotation = async (record) => {
    try {
      await save("quotations", { ...record, id: record.id || newId() });
      setEditor(null);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const leadsValue = data.leads.reduce(
    (sum, lead) => sum + Number(lead.quote || 0),
    0,
  );
  const wonValue = data.leads
    .filter((lead) => lead.stage === "Won")
    .reduce((sum, lead) => sum + Number(lead.quote || 0), 0);

  return (
    <div className="app-shell">
      <aside>
        <div className="brand">
          <img
            src={sunregaLogo}
            alt="Sunrega — Powering a sustainable tomorrow"
          />
        </div>
        <nav>
          {appNav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => setView(id)}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="account">
          <span>
            {profile?.full_name || profile?.email}
            <small>{profile?.role}</small>
          </span>
          <button title="Sign out" onClick={onSignOut}>
            <LogOut size={17} />
          </button>
        </div>
        <div className="sync">
          <i className="online" />
          Supabase connected<small>Live team sync enabled</small>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <h1>{appNav.find(([id]) => id === view)?.[1] || "Dashboard"}</h1>
            <p>Solar sales and execution, all in one place.</p>
          </div>
          <div className="header-actions">
            <label>
              <Search size={16} />
              <input
                placeholder="Search records..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            {TABLES.includes(view) && (
              <button
                className="primary"
                onClick={() => setEditor({ table: view, item: {} })}
              >
                <Plus size={17} /> Add new
              </button>
            )}
          </div>
        </header>
        <section className="content">
          {error && (
            <div className="alert">
              {error}
              <button onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {loading ? (
            <div className="empty">Loading your workspace…</div>
          ) : view === "dashboard" ? (
            <>
              <div className="kpis">
                <Kpi
                  label="Total leads"
                  value={data.leads.length}
                  note="Across all pipeline stages"
                />
                <Kpi
                  label="Pipeline value"
                  value={money(leadsValue)}
                  note="Current opportunity value"
                />
                <Kpi
                  label="Won business"
                  value={money(wonValue)}
                  note="Converted sales"
                />
                <Kpi
                  label="Active projects"
                  value={
                    data.projects.filter((p) => p.status !== "Complete").length
                  }
                  note="In execution"
                />
              </div>
              <div className="dashboard-grid">
                <div className="panel">
                  <div className="panel-title">
                    <h2>Lead pipeline</h2>
                    <button onClick={() => setView("leads")}>View all</button>
                  </div>
                  <div className="funnel">
                    {STAGES.slice(0, 6).map((stage) => {
                      const count = data.leads.filter(
                        (lead) => lead.stage === stage,
                      ).length;
                      return (
                        <div key={stage}>
                          <span>
                            {stage}
                            <b>{count}</b>
                          </span>
                          <div>
                            <i
                              style={{
                                width: `${Math.max(4, (count / Math.max(1, data.leads.length)) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-title">
                    <h2>Project delivery</h2>
                  </div>
                  {data.projects.length ? (
                    data.projects.slice(0, 5).map((p) => (
                      <div className="project-line" key={p.id}>
                        <span>
                          <b>{p.name}</b>
                          <small>
                            {p.kw} kW · {p.status}
                          </small>
                        </span>
                        <strong>{p.progress || 0}%</strong>
                        <div>
                          <i style={{ width: `${p.progress || 0}%` }} />
                        </div>
                      </div>
                    ))
                  ) : (
                    <Empty />
                  )}
                </div>
              </div>
            </>
          ) : view === "settings" ? (
            <SettingsView />
          ) : view === "users" && profile?.role === "admin" ? (
            <UserManagement />
          ) : (
            <Records
              table={view}
              rows={filtered}
              onEdit={(item) => setEditor({ table: view, item })}
            />
          )}
        </section>
      </main>
      {editor &&
        (editor.table === "quotations" ? (
          <QuotationModal
            item={editor.item}
            leads={data.leads}
            onSave={saveQuotation}
            onDelete={destroy}
            close={() => setEditor(null)}
          />
        ) : (
          <Modal
            editor={editor}
            submit={submit}
            destroy={destroy}
            close={() => setEditor(null)}
          />
        ))}
    </div>
  );
}

function Login() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const signIn = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const loginId = String(form.get("loginId")).trim().toLowerCase();
    const email = loginId.includes("@")
      ? loginId
      : `${loginId}@workers.sunrega.local`;
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password: form.get("password"),
    });
    if (authError) setError(authError.message);
    setBusy(false);
  };
  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={signIn}>
        <img src={sunregaLogo} alt="Sunrega" />
        <div className="auth-heading">
          <span>TEAM PORTAL</span>
          <h1>Welcome back</h1>
          <p>Sign in to manage leads and solar projects.</p>
        </div>
        {error && <div className="auth-error">{error}</div>}
        <label>
          <span>Email or worker ID</span>
          <input
            name="loginId"
            type="text"
            autoComplete="username"
            required
            placeholder="admin@sunrega.com or SUN001"
          />
        </label>
        <label>
          <span>Password</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="Enter your password"
          />
        </label>
        <button className="primary auth-submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in securely"}
        </button>
        <small className="auth-help">
          Contact your administrator if you need an account.
        </small>
      </form>
    </div>
  );
}

function SetupRequired() {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Supabase setup required</h1>
        <p>
          Add the project URL and public anon key to the Vercel environment
          variables, then redeploy.
        </p>
      </div>
    </div>
  );
}

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const loadUsers = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) setMessage(error.message);
    else setUsers(data || []);
  };
  useEffect(() => {
    loadUsers();
  }, []);
  const createUser = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const { error } = await supabase.functions.invoke("admin-create-user", {
      body: {
        userId: form.get("userId"),
        fullName: form.get("fullName"),
        password: form.get("password"),
        phone: form.get("phone"),
        designation: form.get("designation"),
        department: form.get("department"),
        role: form.get("role"),
      },
    });
    if (error) setMessage(error.message);
    else {
      setMessage("User created successfully.");
      event.currentTarget.reset();
      await loadUsers();
    }
    setBusy(false);
  };
  return (
    <div className="users-grid">
      <form className="panel create-user" onSubmit={createUser}>
        <h2>Create team login</h2>
        <p className="muted">
          Choose the worker's login ID, password and employment details.
        </p>
        {message && <div className="user-message">{message}</div>}
        <label>
          <span>Worker ID</span>
          <input
            name="userId"
            required
            pattern="[A-Za-z0-9._-]+"
            placeholder="SUN001"
          />
        </label>
        <label>
          <span>Full name</span>
          <input name="fullName" required />
        </label>
        <label>
          <span>Password</span>
          <input name="password" type="password" minLength="8" required />
        </label>
        <label>
          <span>Phone number</span>
          <input name="phone" type="tel" />
        </label>
        <label>
          <span>Designation</span>
          <input name="designation" placeholder="Sales Executive" />
        </label>
        <label>
          <span>Department</span>
          <input name="department" placeholder="Sales" />
        </label>
        <label>
          <span>Access level</span>
          <select name="role" defaultValue="worker">
            <option value="worker">Worker</option>
            <option value="admin">Administrator</option>
          </select>
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "Creating…" : "Create user"}
        </button>
      </form>
      <div className="panel table-wrap">
        <div className="user-list-title">
          <h2>Team access</h2>
          <span>{users.length} users</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Worker ID</th>
              <th>Designation</th>
              <th>Department</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <b>{user.full_name || "—"}</b>
                  <small>{user.phone || ""}</small>
                </td>
                <td>{user.user_id || user.email}</td>
                <td>{user.designation || "—"}</td>
                <td>{user.department || "—"}</td>
                <td>
                  <Badge text={user.role} />
                </td>
                <td>{user.is_active ? "Active" : "Disabled"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, note }) {
  return (
    <div className="kpi">
      <div className="kpi-icon">
        <Zap size={18} />
      </div>
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function Empty() {
  return (
    <div className="empty">
      No records yet. Add your first one to get started.
    </div>
  );
}

function Records({ table, rows, onEdit }) {
  if (!rows.length)
    return (
      <div className="panel">
        <Empty />
      </div>
    );
  if (table === "leads")
    return (
      <div className="kanban">
        {STAGES.map((stage) => (
          <div className="column" key={stage}>
            <h3>
              {stage}
              <span>{rows.filter((r) => r.stage === stage).length}</span>
            </h3>
            {rows
              .filter((r) => r.stage === stage)
              .map((lead) => (
                <button
                  className="lead-card"
                  key={lead.id}
                  onClick={() => onEdit(lead)}
                >
                  <b>{lead.name}</b>
                  <small>
                    {lead.location || "No location"} · {lead.kw || 0} kW
                  </small>
                  <span>{lead.segment}</span>
                  <strong>{money(lead.quote)}</strong>
                </button>
              ))}
          </div>
        ))}
      </div>
    );
  return (
    <div className="panel table-wrap">
      <table>
        <thead>
          <tr>
            {table === "projects" ? (
              <>
                <th>Project</th>
                <th>Status</th>
                <th>Size</th>
                <th>Progress</th>
                <th>Value</th>
              </>
            ) : table === "team_members" ? (
              <>
                <th>Name</th>
                <th>Role</th>
                <th>Phone</th>
                <th>Email</th>
              </>
            ) : (
              <>
                <th>Quote</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Size</th>
                <th>Amount</th>
              </>
            )}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} onClick={() => onEdit(r)}>
              {table === "projects" ? (
                <>
                  <td>
                    <b>{r.name}</b>
                    <small>{r.location}</small>
                  </td>
                  <td>
                    <Badge text={r.status} />
                  </td>
                  <td>{r.kw} kW</td>
                  <td>{r.progress}%</td>
                  <td>{money(r.value)}</td>
                </>
              ) : table === "team_members" ? (
                <>
                  <td>
                    <b>{r.name}</b>
                  </td>
                  <td>{r.role}</td>
                  <td>{r.phone || "—"}</td>
                  <td>{r.email || "—"}</td>
                </>
              ) : (
                <>
                  <td>
                    <b>{r.quote_number}</b>
                  </td>
                  <td>{r.customer_name}</td>
                  <td>
                    <Badge text={r.status} />
                  </td>
                  <td>{r.system_size} kW</td>
                  <td>{money(r.amount)}</td>
                </>
              )}
              <td>›</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Badge({ text }) {
  return <span className="badge">{text}</span>;
}

const SPECIFICATIONS = [
  [
    "Plant Capacity",
    "Automatically set from capacity",
    "Automatically set from capacity",
  ],
  [
    "Solar Panels",
    "Topcon Bifacial (Premier / Eastman / Satvik)",
    "Topcon Bifacial (Waaree / Luminous / Adani / Polycab)",
  ],
  [
    "Inverter",
    "On-Grid String Inverter (Powerone / Eastman / Ksolare)",
    "SolarEdge Inverter with Power Optimizers",
  ],
  ["System Type", "On-Grid", "On-Grid"],
  ["Battery", "No Battery", "No Battery"],
  ["Panel-level Monitoring", "Not Included", "Included (SolarEdge App)"],
  ["Mounting Structure", "GI Structure", "Hot-dip GI Structure (Heavy Duty)"],
  [
    "DC/AC Cabling & Accessories",
    "Standard Grade",
    "Premium Grade, UV Resistant",
  ],
  ["Net-Metering Assistance", "Included", "Included"],
  ["Inverter Warranty", "5 Years", "8 Years (Extendable to 20/25)"],
  [
    "Panel Warranty",
    "12 Years Product / 25 Years Performance",
    "12 Years Product / 25 Years Performance",
  ],
  [
    "Chemical Earthing",
    "2 meter Copper Bonded Standard",
    "3 meter Copper Bonded (True Power)",
  ],
  ["Anchoring", "Standard Anchoring", "Chemical Anchoring"],
  ["Waterproofing & Insurance", "NA", "Included"],
  ["Installation Warranty", "2 Years", "5 Years"],
];
const defaultQuote = () => ({
  customer_name: "",
  quote_number: `SRS/QT/${new Date().getFullYear()}/${String(Date.now()).slice(-4)}`,
  quotation_date: new Date().toISOString().slice(0, 10),
  system_size: 0,
  basic_rate: 34000,
  premium_rate: 39000,
  gst_rate: 8.9,
  validity_days: 15,
  status: "Draft",
  panel_count: 0,
  panel_wattage: 620,
  basic_inverter_count: 1,
  basic_inverter_kw: 0,
  premium_inverter_count: 1,
  premium_inverter_kw: 0,
  plant_type: "On-Grid",
  battery_type: "No Battery",
  payment_terms:
    "50% advance with work order, 40% before dispatch of material, 10% on commissioning.",
  delivery_terms:
    "3-4 weeks from receipt of advance payment and site clearance, subject to material availability.",
  exclusions:
    "Civil work, roof reinforcement (if required), and additional cabling beyond standard scope shall be charged extra on actuals.",
});

function QuotationModal({ item, leads, onSave, onDelete, close }) {
  const [quote, setQuote] = useState({ ...defaultQuote(), ...item });
  const set = (key, value) =>
    setQuote((current) => ({ ...current, [key]: value }));
  const basicBase =
    Number(quote.system_size || 0) * Number(quote.basic_rate || 0);
  const premiumBase =
    Number(quote.system_size || 0) * Number(quote.premium_rate || 0);
  const basicGst = (basicBase * Number(quote.gst_rate || 0)) / 100;
  const premiumGst = (premiumBase * Number(quote.gst_rate || 0)) / 100;
  const complete = {
    ...quote,
    amount: Math.round(premiumBase + premiumGst),
    basic_total: Math.round(basicBase + basicGst),
    premium_total: Math.round(premiumBase + premiumGst),
    basic_gst: Math.round(basicGst),
    premium_gst: Math.round(premiumGst),
  };
  const chooseLead = (id) => {
    const lead = leads.find((row) => row.id === id);
    if (lead)
      setQuote((q) => ({
        ...q,
        lead_id: id,
        customer_name: lead.name,
        system_size: lead.kw || q.system_size,
      }));
  };
  const specValue = (name, packageName, fallback) => {
    if (name === "Plant Capacity") return `${quote.system_size || 0} kWp (DC)`;
    if (name === "Solar Panels")
      return `${quote.panel_count || 0} × ${quote.panel_wattage || 620} Wp ${fallback}`;
    if (name === "Inverter")
      return packageName === "basic"
        ? `${quote.basic_inverter_count || 0} × ${quote.basic_inverter_kw || 0} kW ${fallback}`
        : `${quote.premium_inverter_count || 0} × ${quote.premium_inverter_kw || 0} kW ${fallback}`;
    if (name === "System Type") return quote.plant_type || "On-Grid";
    if (name === "Battery") return quote.battery_type || "No Battery";
    return fallback;
  };
  return (
    <div className="overlay quote-overlay">
      <div className="modal quote-modal">
        <div className="modal-head">
          <div>
            <small>{item.id ? "EDIT QUOTATION" : "NEW QUOTATION"}</small>
            <h2>{quote.quote_number}</h2>
          </div>
          <button onClick={close}>
            <X />
          </button>
        </div>
        <div className="quote-form">
          <div className="quote-fields">
            <label>
              <span>Link to lead (optional)</span>
              <select
                value={quote.lead_id || ""}
                onChange={(e) => chooseLead(e.target.value)}
              >
                <option value="">Manual entry</option>
                {leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Reference number</span>
              <input
                value={quote.quote_number}
                onChange={(e) => set("quote_number", e.target.value)}
              />
            </label>
            <label>
              <span>Customer name</span>
              <input
                value={quote.customer_name}
                onChange={(e) => set("customer_name", e.target.value)}
                required
              />
            </label>
            <label>
              <span>Quotation date</span>
              <input
                type="date"
                value={quote.quotation_date}
                onChange={(e) => set("quotation_date", e.target.value)}
              />
            </label>
            <label>
              <span>Plant capacity (kWp)</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={quote.system_size}
                onChange={(e) => set("system_size", Number(e.target.value))}
              />
            </label>
            <label>
              <span>Plant type</span>
              <select
                value={quote.plant_type}
                onChange={(e) => {
                  const plantType = e.target.value;
                  setQuote((current) => ({
                    ...current,
                    plant_type: plantType,
                    battery_type:
                      plantType === "On-Grid"
                        ? "No Battery"
                        : current.battery_type === "No Battery"
                          ? "Lithium-ion"
                          : current.battery_type,
                  }));
                }}
              >
                <option>On-Grid</option>
                <option>Hybrid</option>
                <option>Off-Grid</option>
              </select>
            </label>
            <label className="wide">
              <span>Battery option</span>
              <select
                value={quote.battery_type}
                onChange={(e) => set("battery_type", e.target.value)}
              >
                <option>No Battery</option>
                <option>Lithium-ion</option>
                <option>Tubular Battery</option>
              </select>
            </label>
          </div>
          <h3>Panel and inverter configuration</h3>
          <div className="equipment-grid">
            <label>
              <span>Number of solar panels</span>
              <input
                type="number"
                min="0"
                value={quote.panel_count}
                onChange={(e) => set("panel_count", Number(e.target.value))}
              />
            </label>
            <label>
              <span>Panel wattage (Wp)</span>
              <input
                type="number"
                min="0"
                value={quote.panel_wattage}
                onChange={(e) => set("panel_wattage", Number(e.target.value))}
              />
            </label>
            <label>
              <span>Basic inverter quantity</span>
              <input
                type="number"
                min="0"
                value={quote.basic_inverter_count}
                onChange={(e) =>
                  set("basic_inverter_count", Number(e.target.value))
                }
              />
            </label>
            <label>
              <span>Basic inverter (kW each)</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={quote.basic_inverter_kw}
                onChange={(e) =>
                  set("basic_inverter_kw", Number(e.target.value))
                }
              />
            </label>
            <label>
              <span>Premium inverter quantity</span>
              <input
                type="number"
                min="0"
                value={quote.premium_inverter_count}
                onChange={(e) =>
                  set("premium_inverter_count", Number(e.target.value))
                }
              />
            </label>
            <label>
              <span>Premium inverter (kW each)</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={quote.premium_inverter_kw}
                onChange={(e) =>
                  set("premium_inverter_kw", Number(e.target.value))
                }
              />
            </label>
          </div>
          <h3>Technical specification - Basic vs Premium</h3>
          <div className="spec-table">
            <div>
              <b>Specification</b>
              <b>Basic package</b>
              <b>Premium package</b>
            </div>
            {SPECIFICATIONS.map(([name, basic, premium]) => (
              <div key={name}>
                <strong>{name}</strong>
                <span>{specValue(name, "basic", basic)}</span>
                <span>{specValue(name, "premium", premium)}</span>
              </div>
            ))}
          </div>
          <h3>Automatic pricing</h3>
          <div className="quote-fields">
            <label>
              <span>Basic rate per kW</span>
              <input
                type="number"
                value={quote.basic_rate}
                onChange={(e) => set("basic_rate", Number(e.target.value))}
              />
            </label>
            <label>
              <span>Premium rate per kW</span>
              <input
                type="number"
                value={quote.premium_rate}
                onChange={(e) => set("premium_rate", Number(e.target.value))}
              />
            </label>
            <label>
              <span>GST %</span>
              <input
                type="number"
                step="0.1"
                value={quote.gst_rate}
                onChange={(e) => set("gst_rate", Number(e.target.value))}
              />
            </label>
            <label>
              <span>Validity (days)</span>
              <input
                type="number"
                value={quote.validity_days}
                onChange={(e) => set("validity_days", Number(e.target.value))}
              />
            </label>
          </div>
          <div className="price-summary">
            <div>
              <span>Basic base</span>
              <b>{money(basicBase)}</b>
              <small>GST {money(basicGst)}</small>
              <strong>{money(basicBase + basicGst)}</strong>
            </div>
            <div className="premium">
              <span>Premium base</span>
              <b>{money(premiumBase)}</b>
              <small>GST {money(premiumGst)}</small>
              <strong>{money(premiumBase + premiumGst)}</strong>
            </div>
          </div>
          <div className="quote-fields terms">
            <label className="wide">
              <span>Payment terms</span>
              <textarea
                rows="2"
                value={quote.payment_terms}
                onChange={(e) => set("payment_terms", e.target.value)}
              />
            </label>
            <label className="wide">
              <span>Delivery & installation</span>
              <textarea
                rows="2"
                value={quote.delivery_terms}
                onChange={(e) => set("delivery_terms", e.target.value)}
              />
            </label>
            <label className="wide">
              <span>Exclusions</span>
              <textarea
                rows="2"
                value={quote.exclusions}
                onChange={(e) => set("exclusions", e.target.value)}
              />
            </label>
          </div>
        </div>
        <div className="modal-actions">
          {item.id && (
            <button className="danger" onClick={onDelete}>
              <Trash2 size={16} /> Delete
            </button>
          )}
          <span />
          <button onClick={close}>Cancel</button>
          <button className="primary" onClick={() => onSave(complete)}>
            Save quotation
          </button>
          <button
            className="print-btn"
            onClick={() => {
              printQuotation(complete);
              onSave(complete);
            }}
          >
            Save & print
          </button>
        </div>
      </div>
    </div>
  );
}

const htmlEscape = (value) =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ],
  );
function printQuotation(quote) {
  const capacity = Number(quote.system_size || 0);
  const basicBase = capacity * Number(quote.basic_rate || 0);
  const premiumBase = capacity * Number(quote.premium_rate || 0);
  const gstRate = Number(quote.gst_rate || 0);
  const basicGst = (basicBase * gstRate) / 100;
  const premiumGst = (premiumBase * gstRate) / 100;
  const date = new Date(`${quote.quotation_date}T00:00:00`).toLocaleDateString(
    "en-IN",
    { day: "2-digit", month: "short", year: "numeric" },
  );
  const equipmentValue = (name, packageName, fallback) => {
    if (name === "Plant Capacity") return `${capacity} kWp (DC)`;
    if (name === "Solar Panels")
      return `${quote.panel_count || 0} × ${quote.panel_wattage || 620} Wp ${fallback}`;
    if (name === "Inverter")
      return packageName === "basic"
        ? `${quote.basic_inverter_count || 0} × ${quote.basic_inverter_kw || 0} kW ${fallback}`
        : `${quote.premium_inverter_count || 0} × ${quote.premium_inverter_kw || 0} kW ${fallback}`;
    if (name === "System Type") return quote.plant_type || "On-Grid";
    if (name === "Battery") return quote.battery_type || "No Battery";
    return fallback;
  };
  const rows = SPECIFICATIONS.map(
    ([name, basic, premium]) =>
      `<tr><th>${htmlEscape(name)}</th><td>${htmlEscape(equipmentValue(name, "basic", basic))}</td><td>${htmlEscape(equipmentValue(name, "premium", premium))}</td></tr>`,
  ).join("");
  const popup = window.open("", "_blank");
  if (!popup) {
    alert("Please allow pop-ups to print the quotation.");
    return;
  }
  popup.opener = null;
  popup.document
    .write(`<!doctype html><html><head><title>${htmlEscape(quote.quote_number)}</title><style>
    @page{size:A4;margin:14mm 16mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#101f39;margin:0;font-size:10.5px;line-height:1.35}.page{min-height:267mm;position:relative;padding-bottom:18mm;page-break-after:always}.page:last-child{page-break-after:auto}.logo{width:190px;height:auto;margin-bottom:8px}.orange-line{border-top:2px solid #f46a1f;margin-bottom:16px}.title{background:#0d1f3d;color:#fff;font-size:19px;font-weight:700;padding:3px 10px}.meta{display:flex;justify-content:space-between;color:#666;margin:7px 2px 20px}.subject{font-style:italic}.section{font-size:15px;border-bottom:1px solid #f46a1f;padding-bottom:6px;margin:18px 0 10px}table{border-collapse:collapse;width:100%;font-size:9.5px;color:#111}th,td{border:1px solid #111;padding:7px;text-align:center;vertical-align:middle}thead th{background:#f56b20;color:#fff;font-size:10px}thead th:first-child{background:#0d1f3d;text-align:left}tbody th{background:#f0f0f0;text-align:left;width:36%}.pricing td,.pricing th{text-align:right;font-size:11px}.pricing th:first-child{text-align:left}.pricing .total>*{background:#fff0e3;font-weight:700}.note{font-style:italic;color:#666;margin-top:9px}ul{padding-left:20px}li{margin:6px 0}.signature{margin-top:18px}.footer{position:absolute;bottom:0;width:100%;border-top:2px solid #0d1f3d;padding-top:7px;text-align:center;color:#666;font-size:8px}.footer b{color:#0d1f3d}.footer em{display:block;margin-top:3px}.terms-list b{color:#0d1f3d}.intro{font-size:11px}.print-actions{position:fixed;right:18px;top:18px;z-index:5}.print-actions button{background:#f4a900;border:0;border-radius:6px;padding:10px 16px;font-weight:700;cursor:pointer}@media print{.print-actions{display:none}}
  </style></head><body><div class="print-actions"><button onclick="window.print()">Print / Save PDF</button></div>
  <section class="page"><img class="logo" src="${new URL(sunregaLogo, window.location.href).href}" alt="Sunrega"><div class="orange-line"></div><div class="title">QUOTATION</div><div class="meta"><span>Ref: ${htmlEscape(quote.quote_number)}</span><span>Date: ${date}</span></div><div class="intro"><p>To,<br><b>${htmlEscape(quote.customer_name)}</b></p><p class="subject">Subject: Quotation for Installation of ${capacity} kWp On-Grid Rooftop Solar Power Plant</p><p>Dear ${htmlEscape(quote.customer_name)},</p><p>Thank you for your interest in Sunrega Solar. We are pleased to submit our quotation for a ${capacity} kWp on-grid rooftop solar power plant, offered in Basic and Premium configurations so you can choose the option that best fits your requirements and budget.</p></div><h2 class="section">1. Technical Specification Comparison</h2><table><thead><tr><th>Specification</th><th>Basic Package</th><th>Premium Package</th></tr></thead><tbody>${rows}</tbody></table><div class="footer"><b>Sunrega Solar</b> &nbsp; | &nbsp; 9646367806 &nbsp; | &nbsp; sunregaenergy@gmail.com &nbsp; | &nbsp; www.sunrega.in<em>This is a computer-generated quotation and is valid for ${quote.validity_days} days from the date of issue.</em></div></section>
  <section class="page"><img class="logo" src="${new URL(sunregaLogo, window.location.href).href}" alt="Sunrega"><div class="orange-line"></div><h2 class="section">2. Package Pricing</h2><table class="pricing"><thead><tr><th>Pricing</th><th>Basic Package</th><th>Premium Package</th></tr></thead><tbody><tr><th>System Base Price (${money(quote.basic_rate)}/kW Basic, ${money(quote.premium_rate)}/kW Premium)</th><td>${money(basicBase)}</td><td>${money(premiumBase)}</td></tr><tr><th>GST @ ${gstRate}%</th><td>${money(basicGst)}</td><td>${money(premiumGst)}</td></tr><tr class="total"><th>Total Project Cost</th><td>${money(basicBase + basicGst)}</td><td>${money(premiumBase + premiumGst)}</td></tr></tbody></table><p class="note">Note: Prices are indicative, exclusive of any government subsidy that may separately apply, and subject to final site survey.</p><h2 class="section">3. Why Choose Premium (SolarEdge)</h2><ul><li>Panel-level power optimizers maximize generation under partial shading or panel mismatch.</li><li>Module-level monitoring through the SolarEdge app.</li><li>Longer inverter and installation warranty.</li><li>Improved safety with automatic rapid shutdown at panel level.</li></ul><h2 class="section">4. Scope of Work</h2><ul><li>Supply of solar panels, inverter, mounting structure, cabling and balance-of-system components.</li><li>Installation and commissioning of the rooftop solar plant.</li><li>Documentation support for net-metering approval with the DISCOM.</li><li>Testing, handover and system-operation training.</li></ul><h2 class="section">5. Commercial Terms</h2><ul class="terms-list"><li><b>Payment:</b> ${htmlEscape(quote.payment_terms)}</li><li><b>Delivery & Installation:</b> ${htmlEscape(quote.delivery_terms)}</li><li><b>Validity:</b> ${quote.validity_days} days from date of issue.</li><li><b>Exclusions:</b> ${htmlEscape(quote.exclusions)}</li></ul><p>We look forward to your confirmation and would be happy to arrange a free site visit to finalize the layout.</p><div class="signature">For Sunrega Solar<br><br><br><b>Authorized Signatory</b></div><div class="footer"><b>Sunrega Solar</b> &nbsp; | &nbsp; 9646367806 &nbsp; | &nbsp; sunregaenergy@gmail.com &nbsp; | &nbsp; www.sunrega.in<em>This is a computer-generated quotation and is valid for ${quote.validity_days} days from the date of issue.</em></div></section></body></html>`);
  popup.document.close();
}

function Modal({ editor, submit, destroy, close }) {
  const isEdit = Boolean(editor.item.id);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <form className="modal" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <small>{isEdit ? "EDIT RECORD" : "NEW RECORD"}</small>
            <h2>
              {isEdit
                ? editor.item.name || editor.item.customer_name
                : `Add ${editor.table.replace("_", " ")}`}
            </h2>
          </div>
          <button type="button" onClick={close}>
            <X />
          </button>
        </div>
        <div className="form-grid">
          {fields[editor.table].map(([key, label, type, options]) => (
            <label className={type === "textarea" ? "wide" : ""} key={key}>
              <span>{label}</span>
              {type === "select" ? (
                <select
                  name={key}
                  defaultValue={editor.item[key] || options[0]}
                >
                  {options.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              ) : type === "textarea" ? (
                <textarea
                  name={key}
                  defaultValue={editor.item[key] || ""}
                  rows="4"
                />
              ) : (
                <input
                  name={key}
                  type={type}
                  defaultValue={editor.item[key] || ""}
                  required={["name", "customer_name", "quote_number"].includes(
                    key,
                  )}
                />
              )}
            </label>
          ))}
        </div>
        <div className="modal-actions">
          {isEdit && (
            <button type="button" className="danger" onClick={destroy}>
              <Trash2 size={16} /> Delete
            </button>
          )}
          <span />
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button className="primary">Save record</button>
        </div>
      </form>
    </div>
  );
}

function SettingsView() {
  return (
    <div className="settings-grid">
      <div className="panel">
        <h2>Supabase connection</h2>
        <p className="muted">
          This React app reads its connection securely from Vite environment
          variables.
        </p>
        <div
          className={`connection ${isSupabaseConfigured ? "connected" : ""}`}
        >
          <i />{" "}
          <b>
            {isSupabaseConfigured ? "Connected and syncing" : "Local demo mode"}
          </b>
        </div>
        <ol>
          <li>Create a Supabase project.</li>
          <li>
            Run <code>supabase/schema.sql</code> in the SQL Editor.
          </li>
          <li>
            Copy <code>.env.example</code> to <code>.env.local</code> and add
            the URL and anon key.
          </li>
          <li>
            Restart <code>npm run dev</code>.
          </li>
        </ol>
      </div>
      <div className="panel">
        <h2>Architecture notes</h2>
        <p className="muted">
          The original single HTML file has been split into React UI, database
          helpers and a versioned SQL schema. When no cloud keys exist, the same
          CRUD screens use localStorage for safe local development.
        </p>
        <p className="security">
          Before public production use, enable Supabase Auth and replace the
          demo RLS policies with user or organization scoped policies.
        </p>
      </div>
    </div>
  );
}

export default App;
