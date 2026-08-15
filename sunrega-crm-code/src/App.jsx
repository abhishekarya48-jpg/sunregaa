import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  ExternalLink,
  FileText,
  LayoutDashboard,
  LogOut,
  Plus,
  ReceiptIndianRupee,
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
const PROJECT_MILESTONES = [
  "Design & Approval",
  "Material Procurement",
  "Civil & Mounting",
  "Installation",
  "Testing & Commissioning",
  "Net Metering",
  "Handover",
];
const PAYMENT_STAGES = [
  "Advance",
  "On Material Delivery",
  "On Installation",
  "On Commissioning",
  "Final / Retention",
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
const functionErrorMessage = async (error) => {
  try {
    const payload = await error?.context?.json();
    return payload?.error || payload?.message || error.message;
  } catch {
    return error?.message || "The server request failed.";
  }
};

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
    ["amount_received", "Payment received", "number"],
    [
      "payment_status",
      "Payment status",
      "select",
      ["Not received", "Partially received", "Fully received"],
    ],
    ["next_payment_date", "Next payment date", "date"],
    ["payment_notes", "Payment notes", "textarea"],
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
          ["billing", "Billing", ReceiptIndianRupee],
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
    if (editor.table === "projects") {
      const received = Number(row.amount_received || 0);
      const value = Number(row.value || 0);
      row.payment_status =
        received <= 0
          ? "Not received"
          : received >= value && value > 0
            ? "Fully received"
            : "Partially received";
    }
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

  const deleteTeamMember = async (member) => {
    if (
      profile?.role !== "admin" ||
      !confirm(`Delete ${member.name} from the team?`)
    )
      return;
    try {
      await remove("team_members", member.id);
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

  const saveProject = async (record) => {
    try {
      await save("projects", { ...record, id: record.id || newId() });
      setEditor(null);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const moveLead = async (leadId, stage) => {
    const lead = data.leads.find((row) => row.id === leadId);
    if (!lead || lead.stage === stage) return;
    try {
      await save("leads", { ...lead, stage });
      await refresh();
    } catch (err) {
      setError(err.message);
      return;
    }
    if (stage === "Won" && !data.projects.some((p) => p.lead_id === lead.id)) {
      try {
        await save("projects", {
          id: newId(),
          lead_id: lead.id,
          name: lead.name,
          location: lead.location || "",
          segment: lead.segment || "",
          kw: lead.kw || 0,
          owner_id: lead.owner_id || null,
          status: "Planning",
          progress: 0,
          value: lead.quote || 0,
          amount_received: 0,
          payment_status: "Not received",
          started_at: new Date().toISOString().slice(0, 10),
          target_days: 60,
          milestones: PROJECT_MILESTONES.map((name) => ({
            name,
            complete: false,
          })),
          payments: PAYMENT_STAGES.map((name) => ({
            name,
            amount: 0,
            paid: false,
          })),
          documents: [],
          notes: lead.notes || "",
        });
        await refresh();
        setView("projects");
      } catch (err) {
        setError(
          `Lead marked Won, but project creation failed: ${err.message}`,
        );
      }
    }
  };

  const leadsValue = data.leads.reduce(
    (sum, lead) => sum + Number(lead.quote || 0),
    0,
  );
  const wonValue = data.leads
    .filter((lead) => lead.stage === "Won")
    .reduce((sum, lead) => sum + Number(lead.quote || 0), 0);
  const overdueFollowups = data.leads.filter(
    (lead) =>
      lead.follow_up &&
      lead.follow_up < new Date().toISOString().slice(0, 10) &&
      !["Won", "Lost"].includes(lead.stage),
  ).length;
  const outstandingPayments = data.projects.reduce(
    (sum, project) =>
      sum +
      Math.max(
        0,
        Number(project.value || 0) - Number(project.amount_received || 0),
      ),
    0,
  );

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
                <Kpi
                  label="Outstanding"
                  value={money(outstandingPayments)}
                  note="Project collections due"
                />
                <Kpi
                  label="Overdue follow-ups"
                  value={overdueFollowups}
                  note="Require attention"
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
          ) : view === "billing" && profile?.role === "admin" ? (
            <Billing />
          ) : view === "users" && profile?.role === "admin" ? (
            <UserManagement />
          ) : (
            <Records
              table={view}
              rows={filtered}
              onEdit={(item) => setEditor({ table: view, item })}
              onStageChange={moveLead}
              isAdmin={profile?.role === "admin"}
              onDeleteTeamMember={deleteTeamMember}
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
        ) : editor.table === "projects" ? (
          <ProjectModal
            item={editor.item}
            onSave={saveProject}
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
    if (error) setMessage(await functionErrorMessage(error));
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
    if (error) setMessage(await functionErrorMessage(error));
    else {
      setMessage("User created successfully.");
      event.currentTarget.reset();
      await loadUsers();
    }
    setBusy(false);
  };
  const deleteUser = async (user) => {
    if (
      !confirm(
        `Permanently delete ${user.full_name || user.email}? This login will stop working immediately.`,
      )
    )
      return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.functions.invoke("admin-delete-user", {
      body: { userId: user.id },
    });
    if (error) setMessage(await functionErrorMessage(error));
    else {
      setMessage("User deleted successfully.");
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
              <th>Action</th>
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
                <td>
                  <button
                    className="delete-user-btn"
                    disabled={busy}
                    onClick={() => deleteUser(user)}
                    title="Delete this user"
                  >
                    <Trash2 size={15} /> Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const HSN_PRESETS = [
  ["8541", "Solar PV modules / panels", 12],
  ["8504 40 90", "Solar inverter", 18],
  ["8507", "Lithium-ion / storage battery", 18],
  ["7308", "Mounting structure", 18],
  ["8544", "Solar cables / wires", 18],
  ["8537", "ACDB / DCDB combiner panel", 18],
  ["995461", "Solar installation / EPC service", 12],
  ["custom", "Custom / other", 18],
];
const emptyInvoiceItem = () => ({
  id: newId(),
  description: "",
  hsn: "8541",
  quantity: 1,
  rate: 0,
  gst: 12,
});
const newInvoice = () => ({
  id: newId(),
  invoice_number: `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
  invoice_date: new Date().toISOString().slice(0, 10),
  title: "TAX INVOICE - SOLAR POWER SYSTEM",
  seller_details:
    "SUNREGA\nSCO 137, Feroze Gandhi Market, Ludhiana - 141001, Punjab\nMob: +91-9646122694\nGSTIN: 03BCTPA5272L1ZE",
  buyer_order: "",
  vehicle_number: "",
  place_of_supply: "Punjab",
  reverse_charge: "No",
  payment_terms: "100% Advance",
  copy_type: "Original",
  bill_to: "",
  ship_to: "Same as billing address",
  round_off: 0,
  bank_details:
    "Bank Name: Union Bank of India\nBranch: Model Town Extn, Ludhiana\nAccount No.: 264911100001051\nIFSC: UBIN0816680",
  terms:
    "1. Goods once sold cannot be taken back.\n2. Payment is due as per the agreed terms.\n3. Warranty is governed by manufacturer terms.",
  items: [emptyInvoiceItem()],
});

function Billing() {
  const [invoice, setInvoice] = useState(newInvoice);
  const [saved, setSaved] = useState([]);
  const [message, setMessage] = useState("");
  const update = (key, value) =>
    setInvoice((current) => ({ ...current, [key]: value }));
  const updateItem = (id, key, value) =>
    setInvoice((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === id ? { ...item, [key]: value } : item,
      ),
    }));
  const totals = invoice.items.reduce(
    (sum, item) => {
      const taxable = Number(item.quantity || 0) * Number(item.rate || 0);
      const tax = (taxable * Number(item.gst || 0)) / 100;
      return { taxable: sum.taxable + taxable, gst: sum.gst + tax };
    },
    { taxable: 0, gst: 0 },
  );
  const net = totals.taxable + totals.gst + Number(invoice.round_off || 0);
  const load = async () => {
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) setMessage(error.message);
    else setSaved(data || []);
  };
  useEffect(() => {
    load();
  }, []);
  const saveInvoice = async () => {
    if (!invoice.bill_to.trim()) {
      setMessage("Enter the customer billing details.");
      return false;
    }
    const record = {
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      bill_to: invoice.bill_to,
      total: Math.round(net * 100) / 100,
      data: invoice,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("invoices").upsert(record);
    if (error) {
      setMessage(error.message);
      return false;
    }
    setMessage("Invoice saved successfully.");
    await load();
    return true;
  };
  const saveAndPrint = () => {
    printInvoice(invoice, totals, net);
    saveInvoice();
  };
  return (
    <div className="billing-page">
      <div className="billing-toolbar">
        <button className="primary" onClick={() => setInvoice(newInvoice())}>
          <Plus size={16} /> New invoice
        </button>
        <button onClick={saveInvoice}>Save invoice</button>
        <button className="print-btn" onClick={saveAndPrint}>
          Print / Save PDF
        </button>
      </div>
      {message && <div className="billing-message">{message}</div>}
      <div className="billing-layout">
        <div className="invoice-sheet">
          <img src={sunregaLogo} alt="Sunrega" />
          <input
            className="invoice-title"
            value={invoice.title}
            onChange={(e) => update("title", e.target.value)}
          />
          <InvoiceField
            label="From (seller details)"
            area
            value={invoice.seller_details}
            onChange={(value) => update("seller_details", value)}
          />
          <div className="invoice-meta">
            <InvoiceField
              label="Invoice No."
              value={invoice.invoice_number}
              onChange={(value) => update("invoice_number", value)}
            />
            <InvoiceField
              label="Invoice Date"
              type="date"
              value={invoice.invoice_date}
              onChange={(value) => update("invoice_date", value)}
            />
            <InvoiceField
              label="Buyer's Order No."
              value={invoice.buyer_order}
              onChange={(value) => update("buyer_order", value)}
            />
            <InvoiceField
              label="Vehicle No."
              value={invoice.vehicle_number}
              onChange={(value) => update("vehicle_number", value)}
            />
            <InvoiceField
              label="Place of Supply"
              value={invoice.place_of_supply}
              onChange={(value) => update("place_of_supply", value)}
            />
            <InvoiceSelect
              label="Reverse Charge"
              value={invoice.reverse_charge}
              options={["No", "Yes"]}
              onChange={(value) => update("reverse_charge", value)}
            />
            <InvoiceField
              label="Payment Terms"
              value={invoice.payment_terms}
              onChange={(value) => update("payment_terms", value)}
            />
            <InvoiceSelect
              label="Copy Type"
              value={invoice.copy_type}
              options={["Original", "Duplicate", "Triplicate"]}
              onChange={(value) => update("copy_type", value)}
            />
          </div>
          <div className="invoice-parties">
            <InvoiceField
              label="Bill To"
              area
              value={invoice.bill_to}
              onChange={(value) => update("bill_to", value)}
            />
            <InvoiceField
              label="Ship To"
              area
              value={invoice.ship_to}
              onChange={(value) => update("ship_to", value)}
            />
          </div>
          <div className="invoice-items-wrap">
            <table className="invoice-items">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Description</th>
                  <th>HSN/SAC</th>
                  <th>Qty</th>
                  <th>Rate</th>
                  <th>GST %</th>
                  <th>Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, index) => {
                  const taxable = Number(item.quantity) * Number(item.rate);
                  const total = taxable * (1 + Number(item.gst) / 100);
                  return (
                    <tr key={item.id}>
                      <td>{index + 1}</td>
                      <td>
                        <textarea
                          value={item.description}
                          onChange={(e) =>
                            updateItem(item.id, "description", e.target.value)
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={item.hsn}
                          onChange={(e) => {
                            const preset = HSN_PRESETS.find(
                              ([code]) => code === e.target.value,
                            );
                            updateItem(item.id, "hsn", e.target.value);
                            if (preset) updateItem(item.id, "gst", preset[2]);
                          }}
                        >
                          {HSN_PRESETS.map(([code, label]) => (
                            <option key={code} value={code}>
                              {code} - {label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          value={item.quantity}
                          onChange={(e) =>
                            updateItem(
                              item.id,
                              "quantity",
                              Number(e.target.value),
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          value={item.rate}
                          onChange={(e) =>
                            updateItem(item.id, "rate", Number(e.target.value))
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          value={item.gst}
                          onChange={(e) =>
                            updateItem(item.id, "gst", Number(e.target.value))
                          }
                        />
                      </td>
                      <td>
                        <b>{money(total)}</b>
                      </td>
                      <td>
                        <button
                          className="row-delete"
                          onClick={() =>
                            setInvoice((current) => ({
                              ...current,
                              items: current.items.filter(
                                (row) => row.id !== item.id,
                              ),
                            }))
                          }
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            className="add-item"
            onClick={() =>
              setInvoice((current) => ({
                ...current,
                items: [...current.items, emptyInvoiceItem()],
              }))
            }
          >
            <Plus size={14} /> Add line item
          </button>
          <div className="invoice-totals">
            <span>Taxable total</span>
            <b>{money(totals.taxable)}</b>
            <span>Total GST</span>
            <b>{money(totals.gst)}</b>
            <span>Round off</span>
            <input
              type="number"
              step="0.01"
              value={invoice.round_off}
              onChange={(e) => update("round_off", Number(e.target.value))}
            />
            <strong>Net amount payable</strong>
            <strong>{money(net)}</strong>
          </div>
          <div className="invoice-parties footer-fields">
            <InvoiceField
              label="Bank Details"
              area
              value={invoice.bank_details}
              onChange={(value) => update("bank_details", value)}
            />
            <InvoiceField
              label="Terms and Remarks"
              area
              value={invoice.terms}
              onChange={(value) => update("terms", value)}
            />
          </div>
          <div className="invoice-signatures">
            <span>Customer Signature</span>
            <span>For SUNREGA - Authorised Signatory</span>
          </div>
        </div>
        <div className="saved-invoices panel">
          <h2>Saved invoices</h2>
          {saved.length ? (
            saved.map((row) => (
              <button
                key={row.id}
                onClick={() =>
                  setInvoice({ ...newInvoice(), ...row.data, id: row.id })
                }
              >
                <b>{row.invoice_number}</b>
                <span>{row.bill_to.split("\n")[0]}</span>
                <strong>{money(row.total)}</strong>
              </button>
            ))
          ) : (
            <p className="muted">No invoices saved yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function InvoiceField({ label, value, onChange, area = false, type = "text" }) {
  return (
    <label className="invoice-field">
      <span>{label}</span>
      {area ? (
        <textarea
          rows="4"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}
function InvoiceSelect({ label, value, options, onChange }) {
  return (
    <label className="invoice-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function printInvoice(invoice, totals, net) {
  const itemRows = invoice.items
    .map((item, index) => {
      const taxable = Number(item.quantity) * Number(item.rate);
      const gstAmount = (taxable * Number(item.gst)) / 100;
      return `<tr><td>${index + 1}</td><td class="left">${htmlEscape(item.description)}</td><td>${htmlEscape(item.hsn)}</td><td>${item.quantity}</td><td>${money(item.rate)}</td><td>${money(taxable)}</td><td>${item.gst}%</td><td>${money(gstAmount)}</td><td>${money(taxable + gstAmount)}</td></tr>`;
    })
    .join("");
  const popup = window.open("", "_blank");
  if (!popup) {
    alert("Please allow pop-ups to print invoices.");
    return;
  }
  popup.opener = null;
  popup.document.write(
    `<!doctype html><html><head><title>${htmlEscape(invoice.invoice_number)}</title><style>@page{size:A4;margin:9mm}*{box-sizing:border-box}body{font:10px Arial;color:#1f2937;margin:0}.sheet{padding:6px}.logo{display:block;width:210px;margin:0 auto 10px}.title{background:#0b2545;color:#fff;text-align:center;padding:8px;font-size:15px;font-weight:700}.seller{white-space:pre-line;border:1px solid #d7dce3;padding:9px;margin:10px 0}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:10px 0}.meta div,.party{border:1px solid #d7dce3;padding:6px}.meta b,.head{display:block;color:#0b2545;font-size:8px;text-transform:uppercase;margin-bottom:4px}.parties{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}.party{white-space:pre-line;min-height:70px}.head{background:#f26b0f;color:#fff;margin:-6px -6px 6px;padding:5px}table{width:100%;border-collapse:collapse}th{background:#0b2545;color:#fff;padding:5px;font-size:8px}td{border:1px solid #d7dce3;padding:5px;text-align:right}.left{text-align:left}.totals{margin:10px 0 10px auto;width:280px}.totals div{display:flex;justify-content:space-between;padding:4px 8px}.totals .grand{background:#fdebdc;border-top:2px solid #f26b0f;font-size:13px;font-weight:700}.foot{display:grid;grid-template-columns:1fr 1fr;gap:8px}.box{border:1px solid #d7dce3;white-space:pre-line;min-height:90px;padding:7px}.sign{display:flex;justify-content:space-between;margin-top:50px}.sign span{width:210px;border-top:1px solid;text-align:center;padding-top:5px}.actions{position:fixed;right:15px;top:15px}.actions button{background:#f26b0f;color:#fff;border:0;border-radius:5px;padding:9px 14px;font-weight:700}@media print{.actions{display:none}}</style></head><body><div class="actions"><button onclick="window.print()">Print / Save PDF</button></div><div class="sheet"><img class="logo" src="${new URL(sunregaLogo, window.location.href).href}"><div class="title">${htmlEscape(invoice.title)}</div><div class="seller"><b>FROM (SELLER DETAILS)</b><br>${htmlEscape(invoice.seller_details)}</div><div class="meta"><div><b>Invoice No.</b>${htmlEscape(invoice.invoice_number)}</div><div><b>Invoice Date</b>${htmlEscape(invoice.invoice_date)}</div><div><b>Buyer's Order</b>${htmlEscape(invoice.buyer_order || "-")}</div><div><b>Vehicle No.</b>${htmlEscape(invoice.vehicle_number || "-")}</div><div><b>Place of Supply</b>${htmlEscape(invoice.place_of_supply)}</div><div><b>Reverse Charge</b>${htmlEscape(invoice.reverse_charge)}</div><div><b>Payment Terms</b>${htmlEscape(invoice.payment_terms)}</div><div><b>Copy Type</b>${htmlEscape(invoice.copy_type)}</div></div><div class="parties"><div class="party"><span class="head">Bill To</span>${htmlEscape(invoice.bill_to)}</div><div class="party"><span class="head">Ship To</span>${htmlEscape(invoice.ship_to)}</div></div><table><thead><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th>Qty</th><th>Rate</th><th>Taxable</th><th>GST</th><th>GST Amt</th><th>Total</th></tr></thead><tbody>${itemRows}</tbody></table><div class="totals"><div><span>Taxable Total</span><b>${money(totals.taxable)}</b></div><div><span>Total GST</span><b>${money(totals.gst)}</b></div><div><span>Round Off</span><b>${money(invoice.round_off)}</b></div><div class="grand"><span>Net Amount Payable</span><b>${money(net)}</b></div></div><div class="foot"><div class="box"><b>BANK DETAILS</b><br>${htmlEscape(invoice.bank_details)}</div><div class="box"><b>TERMS AND REMARKS</b><br>${htmlEscape(invoice.terms)}</div></div><div class="sign"><span>Customer Signature</span><span>For SUNREGA - Authorised Signatory</span></div></div></body></html>`,
  );
  popup.document.close();
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

function Records({
  table,
  rows,
  onEdit,
  onStageChange,
  isAdmin,
  onDeleteTeamMember,
}) {
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
          <div
            className="column"
            key={stage}
            onDragOver={(event) => {
              event.preventDefault();
              event.currentTarget.classList.add("drag-over");
            }}
            onDragLeave={(event) =>
              event.currentTarget.classList.remove("drag-over")
            }
            onDrop={(event) => {
              event.preventDefault();
              event.currentTarget.classList.remove("drag-over");
              onStageChange?.(event.dataTransfer.getData("text/plain"), stage);
            }}
          >
            <h3>
              {stage}
              <span>{rows.filter((r) => r.stage === stage).length}</span>
            </h3>
            {rows
              .filter((r) => r.stage === stage)
              .map((lead) => (
                <div
                  className="lead-card"
                  key={lead.id}
                  draggable
                  role="button"
                  tabIndex={0}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", lead.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => onEdit(lead)}
                  onKeyDown={(event) => event.key === "Enter" && onEdit(lead)}
                >
                  <b>{lead.name}</b>
                  <small>
                    {lead.location || "No location"} · {lead.kw || 0} kW
                  </small>
                  <span>{lead.segment}</span>
                  <strong>{money(lead.quote)}</strong>
                  <label
                    className="stage-update"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <small>Update stage</small>
                    <select
                      value={lead.stage}
                      onChange={(event) =>
                        onStageChange?.(lead.id, event.target.value)
                      }
                    >
                      {STAGES.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="manual-update"
                    onClick={(event) => {
                      event.stopPropagation();
                      onEdit(lead);
                    }}
                  >
                    Edit / Manual update
                  </button>
                </div>
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
                <th>TAT</th>
                <th>Payments</th>
              </>
            ) : table === "team_members" ? (
              <>
                <th>Name</th>
                <th>Role</th>
                <th>Phone</th>
                <th>Email</th>
                {isAdmin && <th>Action</th>}
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
                  <td>
                    <div className="table-progress">
                      <i style={{ width: `${r.progress || 0}%` }} />
                    </div>
                    <small>
                      {r.milestones?.filter((m) => m.complete).length || 0}/
                      {r.milestones?.length || PROJECT_MILESTONES.length}{" "}
                      milestones
                    </small>
                  </td>
                  <td>
                    {r.started_at
                      ? Math.max(
                          0,
                          Math.floor(
                            (Date.now() -
                              new Date(`${r.started_at}T00:00:00`)) /
                              86400000,
                          ),
                        )
                      : 0}
                    d / {r.target_days || 60}d
                  </td>
                  <td>
                    <b>
                      {money(r.amount_received)} / {money(r.value)}
                    </b>
                    <small>
                      {money(
                        Math.max(
                          0,
                          Number(r.value || 0) - Number(r.amount_received || 0),
                        ),
                      )}{" "}
                      outstanding
                    </small>
                  </td>
                </>
              ) : table === "team_members" ? (
                <>
                  <td>
                    <b>{r.name}</b>
                  </td>
                  <td>{r.role}</td>
                  <td>{r.phone || "—"}</td>
                  <td>{r.email || "—"}</td>
                  {isAdmin && (
                    <td>
                      <button
                        type="button"
                        className="delete-user-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeleteTeamMember?.(r);
                        }}
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </td>
                  )}
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

function ProjectModal({ item, onSave, onDelete, close }) {
  const initialMilestones = item.milestones?.length
    ? item.milestones
    : PROJECT_MILESTONES.map((name) => ({ name, complete: false }));
  const initialPayments = item.payments?.length
    ? item.payments
    : PAYMENT_STAGES.map((name) => ({ name, amount: 0, paid: false }));
  const [project, setProject] = useState({
    status: "Planning",
    progress: 0,
    value: 0,
    started_at: new Date().toISOString().slice(0, 10),
    target_days: 60,
    service_notes: "",
    documents: [],
    ...item,
    milestones: initialMilestones,
    payments: initialPayments,
  });
  const received = project.payments.reduce(
    (sum, payment) => sum + (payment.paid ? Number(payment.amount || 0) : 0),
    0,
  );
  const completed = project.milestones.filter(
    (milestone) => milestone.complete,
  ).length;
  const progress =
    Math.round((completed / project.milestones.length) * 100) || 0;
  const elapsed = project.started_at
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(`${project.started_at}T00:00:00`)) / 86400000,
        ),
      )
    : 0;
  const updateMilestone = (index, complete) =>
    setProject((current) => ({
      ...current,
      milestones: current.milestones.map((row, rowIndex) =>
        rowIndex === index ? { ...row, complete } : row,
      ),
    }));
  const updatePayment = (index, key, value) =>
    setProject((current) => ({
      ...current,
      payments: current.payments.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row,
      ),
    }));
  const updateDocument = (index, key, value) =>
    setProject((current) => ({
      ...current,
      documents: current.documents.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row,
      ),
    }));
  const submitProject = () =>
    onSave({
      ...project,
      progress,
      amount_received: received,
      payment_status:
        received <= 0
          ? "Not received"
          : received >= Number(project.value || 0)
            ? "Fully received"
            : "Partially received",
      status: progress === 100 ? "Complete" : project.status,
    });
  return (
    <div className="overlay project-overlay">
      <div className="modal project-modal">
        <div className="modal-head">
          <div>
            <small>PROJECT EXECUTION</small>
            <h2>{project.name || "New project"}</h2>
            <p>
              {project.segment || "Solar project"} · {project.kw || 0} kW ·{" "}
              {project.location || "No location"}
            </p>
          </div>
          <button onClick={close}>
            <X />
          </button>
        </div>
        <div className="project-body">
          <div className="project-summary">
            <div>
              <span style={{ width: `${progress}%` }} />
            </div>
            <p>
              <b>{progress}% complete</b> · Day {elapsed} of{" "}
              {project.target_days || 60} target TAT
            </p>
          </div>
          <div className="project-core">
            <InvoiceField
              label="Project name"
              value={project.name || ""}
              onChange={(value) => setProject((p) => ({ ...p, name: value }))}
            />
            <InvoiceField
              label="Location"
              value={project.location || ""}
              onChange={(value) =>
                setProject((p) => ({ ...p, location: value }))
              }
            />
            <InvoiceField
              label="Capacity (kW)"
              type="number"
              value={project.kw || 0}
              onChange={(value) =>
                setProject((p) => ({ ...p, kw: Number(value) }))
              }
            />
            <InvoiceField
              label="Contract value"
              type="number"
              value={project.value || 0}
              onChange={(value) =>
                setProject((p) => ({ ...p, value: Number(value) }))
              }
            />
            <InvoiceField
              label="Start date"
              type="date"
              value={project.started_at || ""}
              onChange={(value) =>
                setProject((p) => ({ ...p, started_at: value }))
              }
            />
            <InvoiceField
              label="Target days"
              type="number"
              value={project.target_days || 60}
              onChange={(value) =>
                setProject((p) => ({ ...p, target_days: Number(value) }))
              }
            />
          </div>
          <h3>Execution milestones</h3>
          <div className="milestone-list">
            {project.milestones.map((milestone, index) => (
              <label key={milestone.name}>
                <input
                  type="checkbox"
                  checked={milestone.complete}
                  onChange={(event) =>
                    updateMilestone(index, event.target.checked)
                  }
                />
                <span className={milestone.complete ? "done" : ""}>
                  {milestone.name}
                </span>
              </label>
            ))}
          </div>
          <h3>Payment schedule</h3>
          <div className="payment-schedule">
            {project.payments.map((payment, index) => (
              <div key={payment.name}>
                <b>{payment.name}</b>
                <input
                  type="number"
                  min="0"
                  value={payment.amount}
                  onChange={(event) =>
                    updatePayment(index, "amount", Number(event.target.value))
                  }
                />
                <label>
                  <input
                    type="checkbox"
                    checked={payment.paid}
                    onChange={(event) =>
                      updatePayment(index, "paid", event.target.checked)
                    }
                  />{" "}
                  Paid
                </label>
              </div>
            ))}
          </div>
          <div className="collection-summary">
            <span>
              Contract value <b>{money(project.value)}</b>
            </span>
            <span>
              Received <b>{money(received)}</b>
            </span>
            <span>
              Outstanding{" "}
              <b>{money(Math.max(0, Number(project.value || 0) - received))}</b>
            </span>
          </div>
          <h3>Project documents</h3>
          <div className="project-documents">
            {(project.documents || []).map((document, index) => (
              <div key={document.id || index}>
                <input placeholder="Company name" value={document.company || ""} onChange={(event) => updateDocument(index, "company", event.target.value)} />
                <input placeholder="Document name" value={document.name || ""} onChange={(event) => updateDocument(index, "name", event.target.value)} />
                <input type="url" placeholder="Google Drive or shared link" value={document.url || ""} onChange={(event) => updateDocument(index, "url", event.target.value)} />
                {document.url ? <a href={document.url} target="_blank" rel="noreferrer" title="Open document"><ExternalLink size={16} /></a> : <span />}
                <button type="button" title="Remove document" onClick={() => setProject((current) => ({ ...current, documents: current.documents.filter((_, documentIndex) => documentIndex !== index) }))}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
          <button type="button" className="add-document" onClick={() => setProject((current) => ({ ...current, documents: [...(current.documents || []), { id: newId(), company: "", name: "", url: "" }] }))}>
            <Plus size={16} /> Add project document
          </button>
          <label className="project-notes">
            <span>Service / AMC notes</span>
            <textarea
              rows="4"
              value={project.service_notes || ""}
              onChange={(event) =>
                setProject((p) => ({ ...p, service_notes: event.target.value }))
              }
            />
          </label>
        </div>
        <div className="modal-actions">
          {item.id && (
            <button className="danger" onClick={onDelete}>
              <Trash2 size={16} /> Delete project
            </button>
          )}
          <span />
          <button onClick={close}>Cancel</button>
          <button className="primary" onClick={submitProject}>
            Save project
          </button>
        </div>
      </div>
    </div>
  );
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
const PANEL_BRANDS = [
  "Waaree Energies",
  "Adani Solar",
  "Tata Power Solar",
  "Vikram Solar",
  "Premier Energies",
  "Goldi Solar",
  "RenewSys",
  "Emmvee",
  "Loom Solar",
  "Saatvik Green Energy",
];
const INVERTER_BRANDS = [
  "Sungrow",
  "Growatt",
  "Solis",
  "GoodWe",
  "Deye",
  "Fronius",
  "Luminous",
  "Microtek",
  "UTL Solar",
  "Havells",
];
const savedBrands = (key, defaults) => {
  try {
    return [...new Set([...defaults, ...JSON.parse(localStorage.getItem(key) || "[]")])];
  } catch {
    return defaults;
  }
};
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
  basic_panel_brand: "Premier Energies",
  premium_panel_brand: "Waaree Energies",
  basic_inverter_count: 1,
  basic_inverter_kw: 0,
  basic_inverter_brand: "Sungrow",
  premium_inverter_count: 1,
  premium_inverter_kw: 0,
  premium_inverter_brand: "Deye",
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
  const [panelBrands, setPanelBrands] = useState(() =>
    savedBrands("sunrega_panel_brands", PANEL_BRANDS),
  );
  const [inverterBrands, setInverterBrands] = useState(() =>
    savedBrands("sunrega_inverter_brands", INVERTER_BRANDS),
  );
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
  const chooseBrand = (type, quoteKey, value) => {
    if (value !== "__custom__") return set(quoteKey, value);
    const brand = prompt(`Enter the custom ${type} brand name:`)?.trim();
    if (!brand) return;
    const storageKey =
      type === "solar panel"
        ? "sunrega_panel_brands"
        : "sunrega_inverter_brands";
    const defaults = type === "solar panel" ? PANEL_BRANDS : INVERTER_BRANDS;
    const updater = type === "solar panel" ? setPanelBrands : setInverterBrands;
    const current = type === "solar panel" ? panelBrands : inverterBrands;
    const next = [...new Set([...current, brand])];
    updater(next);
    localStorage.setItem(
      storageKey,
      JSON.stringify(next.filter((name) => !defaults.includes(name))),
    );
    set(quoteKey, brand);
  };
  const brandOptions = (options) => (
    <>
      {options.map((brand) => (
        <option key={brand} value={brand}>
          {brand}
        </option>
      ))}
      <option value="__custom__">+ Add custom brand</option>
    </>
  );
  const specValue = (name, packageName, fallback) => {
    if (name === "Plant Capacity") return `${quote.system_size || 0} kWp (DC)`;
    if (name === "Solar Panels") {
      const brand =
        packageName === "basic"
          ? quote.basic_panel_brand
          : quote.premium_panel_brand;
      return `${quote.panel_count || 0} × ${quote.panel_wattage || 620} Wp ${brand} Topcon Bifacial`;
    }
    if (name === "Inverter")
      return packageName === "basic"
        ? `${quote.basic_inverter_count || 0} × ${quote.basic_inverter_kw || 0} kW ${quote.basic_inverter_brand} ${quote.plant_type} Solar Inverter`
        : `${quote.premium_inverter_count || 0} × ${quote.premium_inverter_kw || 0} kW ${quote.premium_inverter_brand} ${quote.plant_type} Solar Inverter`;
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
              <span>Basic solar panel brand</span>
              <select
                value={quote.basic_panel_brand}
                onChange={(e) =>
                  chooseBrand("solar panel", "basic_panel_brand", e.target.value)
                }
              >
                {brandOptions(panelBrands)}
              </select>
            </label>
            <label>
              <span>Premium solar panel brand</span>
              <select
                value={quote.premium_panel_brand}
                onChange={(e) =>
                  chooseBrand(
                    "solar panel",
                    "premium_panel_brand",
                    e.target.value,
                  )
                }
              >
                {brandOptions(panelBrands)}
              </select>
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
              <span>Basic inverter brand</span>
              <select
                value={quote.basic_inverter_brand}
                onChange={(e) =>
                  chooseBrand(
                    "solar inverter",
                    "basic_inverter_brand",
                    e.target.value,
                  )
                }
              >
                {brandOptions(inverterBrands)}
              </select>
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
              <span>Premium inverter brand</span>
              <select
                value={quote.premium_inverter_brand}
                onChange={(e) =>
                  chooseBrand(
                    "solar inverter",
                    "premium_inverter_brand",
                    e.target.value,
                  )
                }
              >
                {brandOptions(inverterBrands)}
              </select>
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
    if (name === "Solar Panels") {
      const brand =
        packageName === "basic"
          ? quote.basic_panel_brand
          : quote.premium_panel_brand;
      return `${quote.panel_count || 0} × ${quote.panel_wattage || 620} Wp ${brand} Topcon Bifacial`;
    }
    if (name === "Inverter")
      return packageName === "basic"
        ? `${quote.basic_inverter_count || 0} × ${quote.basic_inverter_kw || 0} kW ${quote.basic_inverter_brand} ${quote.plant_type} Solar Inverter`
        : `${quote.premium_inverter_count || 0} × ${quote.premium_inverter_kw || 0} kW ${quote.premium_inverter_brand} ${quote.plant_type} Solar Inverter`;
    if (name === "System Type") return quote.plant_type || "On-Grid";
    if (name === "Battery") return quote.battery_type || "No Battery";
    return fallback;
  };
  const rows = SPECIFICATIONS.map(
    ([name, basic, premium]) =>
      `<tr><th>${htmlEscape(name)}</th><td>${htmlEscape(equipmentValue(name, "basic", basic))}</td><td>${htmlEscape(equipmentValue(name, "premium", premium))}</td></tr>`,
  ).join("");
  const selectedPlantType = htmlEscape(quote.plant_type || "On-Grid");
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
  <section class="page"><img class="logo" src="${new URL(sunregaLogo, window.location.href).href}" alt="Sunrega"><div class="orange-line"></div><div class="title">QUOTATION</div><div class="meta"><span>Ref: ${htmlEscape(quote.quote_number)}</span><span>Date: ${date}</span></div><div class="intro"><p>To,<br><b>${htmlEscape(quote.customer_name)}</b></p><p class="subject">Subject: Quotation for Installation of ${capacity} kWp ${selectedPlantType} Rooftop Solar Power Plant</p><p>Dear ${htmlEscape(quote.customer_name)},</p><p>Thank you for your interest in Sunrega Solar. We are pleased to submit our quotation for a ${capacity} kWp ${selectedPlantType} rooftop solar power plant, offered in Basic and Premium configurations so you can choose the option that best fits your requirements and budget.</p></div><h2 class="section">1. Technical Specification Comparison</h2><table><thead><tr><th>Specification</th><th>Basic Package</th><th>Premium Package</th></tr></thead><tbody>${rows}</tbody></table><div class="footer"><b>Sunrega Solar</b> &nbsp; | &nbsp; 9646367806 &nbsp; | &nbsp; sunregaenergy@gmail.com &nbsp; | &nbsp; www.sunrega.in<em>This is a computer-generated quotation and is valid for ${quote.validity_days} days from the date of issue.</em></div></section>
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
