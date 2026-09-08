import React, { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  Users, UserPlus, LayoutDashboard, Target, IndianRupee, Plus, Search,
  X, Pencil, Trash2, Phone, MapPin, TrendingUp, CircleAlert, CheckCircle2,
  DatabaseBackup, Upload, Download, Sun, Award, Filter, GitBranch, ChevronRight, ChevronDown
} from "lucide-react";

const STATUSES = ["New", "Site Visit", "Quotation Sent", "Proposal Sent", "Won", "Lost"];

const STATUS_STYLE = {
  "New": { bg: "#EDEDF7", fg: "#4C4C8A" },
  "Site Visit": { bg: "#E4F1FB", fg: "#0C5A8A" },
  "Quotation Sent": { bg: "#FDF1DC", fg: "#96650E" },
  "Proposal Sent": { bg: "#F1E9FE", fg: "#5B32B0" },
  "Won": { bg: "#E4F5EA", fg: "#1F7A4D" },
  "Lost": { bg: "#FBE7E5", fg: "#B23B2E" },
};

function uid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function fmtDate(d) {
  try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
}
function inr(n) {
  const v = Number(n) || 0;
  return "₹" + v.toLocaleString("en-IN");
}
function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- Referral tree helpers ---
// A lead is referred either directly by a DSA (referredByType: "dsa") or by
// another lead/client (referredByType: "lead"), forming a tree per DSA.

function buildLeadIndex(leads) {
  const map = {};
  leads.forEach(l => { map[l.id] = l; });
  return map;
}

function getRootDsaId(lead, leadIndex, guard = new Set()) {
  if (!lead || guard.has(lead.id)) return null;
  guard.add(lead.id);
  if (lead.referredByType === "dsa") return lead.referredById || null;
  if (lead.referredByType === "lead") return getRootDsaId(leadIndex[lead.referredById], leadIndex, guard);
  return null;
}

function getTier(lead, leadIndex, guard = new Set()) {
  if (!lead || guard.has(lead.id)) return 1;
  guard.add(lead.id);
  if (lead.referredByType === "lead" && leadIndex[lead.referredById]) {
    return 1 + getTier(leadIndex[lead.referredById], leadIndex, guard);
  }
  return 1;
}

// Descendants of a lead (its own referrals, and theirs, etc.) — used to stop a
// lead being set as its own downline's referrer, which would create a loop.
function getDescendantIds(leadId, leads) {
  const kids = leads.filter(l => l.referredByType === "lead" && l.referredById === leadId);
  let ids = kids.map(k => k.id);
  kids.forEach(k => { ids = ids.concat(getDescendantIds(k.id, leads)); });
  return ids;
}

const seedDSAs = () => ([
  { id: "dsa1", name: "Ranjit Singh", phone: "98140-XXXXX", email: "", territory: "Ludhiana", commissionRate: 3, status: "Active", joinedDate: "2026-02-10", payoutDetails: "" },
  { id: "dsa2", name: "Harpreet Kaur", phone: "98720-XXXXX", email: "", territory: "Jalandhar", commissionRate: 3.5, status: "Active", joinedDate: "2026-03-18", payoutDetails: "" },
  { id: "dsa3", name: "Manpreet Sharma", phone: "97800-XXXXX", email: "", territory: "Moga", commissionRate: 2.5, status: "Active", joinedDate: "2026-04-05", payoutDetails: "" },
]);

const seedLeads = () => ([
  { id: "ld1", customerName: "Gurpreet Textiles", phone: "94170-XXXXX", city: "Ludhiana", systemSizeKW: 50, dealValue: 2200000, referredByType: "dsa", referredById: "dsa1", status: "Won", commissionRate: 3, commissionPaid: true, leadDate: "2026-06-02", remarks: "Rooftop, industrial shed" },
  { id: "ld2", customerName: "Anil Bansal (Residence)", phone: "98555-XXXXX", city: "Jalandhar", systemSizeKW: 6, dealValue: 330000, referredByType: "dsa", referredById: "dsa2", status: "Proposal Sent", commissionRate: 3.5, commissionPaid: false, leadDate: "2026-07-14", remarks: "" },
  { id: "ld3", customerName: "Sukhwinder Agro Mill", phone: "99150-XXXXX", city: "Moga", systemSizeKW: 25, dealValue: 1050000, referredByType: "dsa", referredById: "dsa3", status: "Site Visit", commissionRate: 2.5, commissionPaid: false, leadDate: "2026-08-01", remarks: "Awaiting DISCOM feasibility" },
  { id: "ld4", customerName: "New Horizon School", phone: "97290-XXXXX", city: "Ludhiana", systemSizeKW: 40, dealValue: 1760000, referredByType: "dsa", referredById: "dsa1", status: "Won", commissionRate: 3, commissionPaid: false, leadDate: "2026-07-20", remarks: "" },
  { id: "ld5", customerName: "Deepak Dyeing Unit", phone: "98110-XXXXX", city: "Ludhiana", systemSizeKW: 30, dealValue: 1320000, referredByType: "dsa", referredById: "dsa1", status: "Lost", commissionRate: 3, commissionPaid: false, leadDate: "2026-06-25", remarks: "Went with competitor" },
  { id: "ld6", customerName: "Kaur Farm House", phone: "94630-XXXXX", city: "Jalandhar", systemSizeKW: 10, dealValue: 480000, referredByType: "dsa", referredById: "dsa2", status: "New", commissionRate: 3.5, commissionPaid: false, leadDate: "2026-08-20", remarks: "" },
  { id: "ld7", customerName: "Bawa Spinning Mills", phone: "98230-XXXXX", city: "Ludhiana", systemSizeKW: 35, dealValue: 1540000, referredByType: "lead", referredById: "ld1", status: "Won", commissionRate: 1.5, commissionPaid: false, leadDate: "2026-08-10", remarks: "Referred by Gurpreet Textiles owner" },
  { id: "ld8", customerName: "Rising Sun Academy", phone: "99880-XXXXX", city: "Ludhiana", systemSizeKW: 15, dealValue: 660000, referredByType: "lead", referredById: "ld4", status: "Quotation Sent", commissionRate: 1.5, commissionPaid: false, leadDate: "2026-08-24", remarks: "Sister school of New Horizon" },
  { id: "ld9", customerName: "Bawa Cold Storage", phone: "98230-XXXXX", city: "Ludhiana", systemSizeKW: 20, dealValue: 880000, referredByType: "lead", referredById: "ld7", status: "New", commissionRate: 1, commissionPaid: false, leadDate: "2026-08-28", remarks: "Same family group, 3rd generation referral" },
]);

const STORAGE_KEY = "sunrega-dsa-crm-v1";

// Migrates leads saved before the referral-tree feature (plain dsaId) to the
// new referredByType/referredById shape.
function migrateLeads(rawLeads) {
  return (rawLeads || []).map(l => {
    if (l.referredByType) return l;
    if (l.dsaId !== undefined) return { ...l, referredByType: l.dsaId ? "dsa" : null, referredById: l.dsaId || null };
    return { ...l, referredByType: null, referredById: null };
  });
}

export default function DSACRM() {
  const [dsas, setDsas] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saveErr, setSaveErr] = useState(false);
  const [tab, setTab] = useState("dashboard");

  const [dsaModal, setDsaModal] = useState(null); // null | {} | dsa
  const [leadModal, setLeadModal] = useState(null); // null | {} | lead
  const [confirmState, setConfirmState] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          setDsas(parsed.dsas || seedDSAs());
          setLeads(parsed.leads ? migrateLeads(parsed.leads) : seedLeads());
        } else {
          setDsas(seedDSAs());
          setLeads(seedLeads());
        }
      } catch (e) {
        setDsas(seedDSAs());
        setLeads(seedLeads());
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const persist = async (nextDsas, nextLeads) => {
    try {
      const result = await window.storage.set(STORAGE_KEY, JSON.stringify({ dsas: nextDsas, leads: nextLeads }), false);
      setSaveErr(!result);
    } catch (e) { setSaveErr(true); }
  };

  const showToast = (msg, kind = "success") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2600);
  };

  const updateAll = (nextDsas, nextLeads) => {
    setDsas(nextDsas);
    setLeads(nextLeads);
    persist(nextDsas, nextLeads);
  };

  const saveDSA = (dsa) => {
    let next;
    if (dsa.id) next = dsas.map(d => d.id === dsa.id ? dsa : d);
    else next = [...dsas, { ...dsa, id: uid("dsa") }];
    updateAll(next, leads);
    setDsaModal(null);
    showToast(dsa.id ? "DSA updated" : "DSA added");
  };

  const deleteDSA = (id) => {
    const dsa = dsas.find(d => d.id === id);
    const linkedLeads = leads.filter(l => l.referredByType === "dsa" && l.referredById === id).length;
    setConfirmState({
      title: "Remove DSA",
      message: `Remove "${dsa?.name}" from your DSA list?${linkedLeads ? ` ${linkedLeads} direct lead(s) will be marked "Unassigned" — their referral history and any client-to-client referrals stay intact.` : ""} This cannot be undone.`,
      confirmLabel: "Remove DSA",
      danger: true,
      onConfirm: () => {
        const nextLeads = leads.map(l => (l.referredByType === "dsa" && l.referredById === id) ? { ...l, referredByType: null, referredById: null } : l);
        updateAll(dsas.filter(d => d.id !== id), nextLeads);
        showToast("DSA removed", "danger");
        setConfirmState(null);
      },
    });
  };

  const saveLead = (lead) => {
    let next;
    if (lead.id) next = leads.map(l => l.id === lead.id ? lead : l);
    else next = [{ ...lead, id: uid("ld") }, ...leads];
    updateAll(dsas, next);
    setLeadModal(null);
    showToast(lead.id ? "Lead updated" : "Lead added");
  };

  const deleteLead = (id) => {
    const lead = leads.find(l => l.id === id);
    const downlineCount = getDescendantIds(id, leads).length;
    setConfirmState({
      title: "Remove lead",
      message: `Remove the lead for "${lead?.customerName}"?${downlineCount ? ` ${downlineCount} client(s) they referred will be marked "Unassigned" — those records stay, just detached from this branch.` : ""} This cannot be undone.`,
      confirmLabel: "Remove lead",
      danger: true,
      onConfirm: () => {
        const nextLeads = leads
          .filter(l => l.id !== id)
          .map(l => (l.referredByType === "lead" && l.referredById === id) ? { ...l, referredByType: null, referredById: null } : l);
        updateAll(dsas, nextLeads);
        showToast("Lead removed", "danger");
        setConfirmState(null);
      },
    });
  };

  const toggleCommissionPaid = (id) => {
    updateAll(dsas, leads.map(l => l.id === id ? { ...l, commissionPaid: !l.commissionPaid } : l));
  };

  const restoreBackup = (data) => {
    if (!data || !Array.isArray(data.dsas) || !Array.isArray(data.leads)) {
      showToast("That file doesn't look like a valid backup", "danger");
      return;
    }
    setConfirmState({
      title: "Restore backup",
      message: "Restoring will replace all current DSA and lead data with the backup file. Continue?",
      confirmLabel: "Restore backup",
      danger: true,
      onConfirm: () => {
        updateAll(data.dsas, data.leads);
        showToast("Backup restored");
        setConfirmState(null);
      },
    });
  };

  const leadIndex = useMemo(() => buildLeadIndex(leads), [leads]);

  const leadsWithCommission = useMemo(() => leads.map(l => ({
    ...l,
    tier: getTier(l, leadIndex),
    rootDsaId: getRootDsaId(l, leadIndex),
    commissionAmount: l.status === "Won" ? Math.round((Number(l.dealValue) || 0) * (Number(l.commissionRate) || 0) / 100) : 0,
  })), [leads, leadIndex]);

  const wonLeads = leadsWithCommission.filter(l => l.status === "Won");
  const pendingCommission = wonLeads.filter(l => !l.commissionPaid).reduce((s, l) => s + l.commissionAmount, 0);
  const paidCommission = wonLeads.filter(l => l.commissionPaid).reduce((s, l) => s + l.commissionAmount, 0);
  const pipelineValue = leads.filter(l => !["Won", "Lost"].includes(l.status)).reduce((s, l) => s + (Number(l.dealValue) || 0), 0);
  const conversionRate = leads.length ? Math.round((wonLeads.length / leads.length) * 100) : 0;

  const leaderboard = useMemo(() => {
    return dsas.map(d => {
      const networkLeads = leadsWithCommission.filter(l => l.rootDsaId === d.id);
      const directLeads = networkLeads.filter(l => l.tier === 1);
      const won = networkLeads.filter(l => l.status === "Won");
      return {
        ...d,
        leadCount: networkLeads.length,
        directCount: directLeads.length,
        networkCount: networkLeads.length - directLeads.length,
        wonCount: won.length,
        commissionEarned: won.reduce((s, l) => s + l.commissionAmount, 0),
      };
    }).sort((a, b) => b.commissionEarned - a.commissionEarned || b.wonCount - a.wonCount);
  }, [dsas, leadsWithCommission]);

  if (!loaded) {
    return <div style={{ padding: 40, fontFamily: "Inter, sans-serif", color: "#5F6B66" }}>Loading DSA records…</div>;
  }

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#F5F4EE", minHeight: 640, display: "flex", color: "#1B2420" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');
        .cr-mono { font-family: 'IBM Plex Mono', monospace; }
        .cr-display { font-family: 'Sora', sans-serif; }
        .cr-navbtn { display:flex; align-items:center; gap:10px; width:100%; padding:11px 16px; border:none; background:transparent; color:#9FB0A6; font-size:14px; font-weight:500; cursor:pointer; border-radius:8px; text-align:left; font-family:'Inter',sans-serif; }
        .cr-navbtn:hover { background:#1B4436; color:#fff; }
        .cr-navbtn.active { background:#F0A93E; color:#123023; }
        .cr-btn { display:inline-flex; align-items:center; gap:6px; padding:9px 16px; border-radius:8px; border:1px solid #D6D3C6; background:#fff; font-size:13px; font-weight:500; cursor:pointer; color:#1B2420; font-family:'Inter',sans-serif; }
        .cr-btn:hover { border-color:#1B2420; }
        .cr-btn-primary { background:#1F7A5C; border-color:#1F7A5C; color:#fff; }
        .cr-btn-primary:hover { background:#175E46; border-color:#175E46; }
        .cr-card { background:#fff; border-radius:12px; border:1px solid #E7E4D6; }
        .cr-input { width:100%; padding:9px 12px; border-radius:7px; border:1px solid #D6D3C6; font-size:13px; font-family:'Inter',sans-serif; box-sizing:border-box; }
        .cr-input:focus { outline:2px solid #1F7A5C33; border-color:#1F7A5C; }
        .cr-table th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.04em; color:#8B8A7E; padding:9px 12px; border-bottom:1px solid #E7E4D6; font-weight:600; }
        .cr-table td { padding:11px 12px; border-bottom:1px solid #F1EFE4; font-size:13px; }
        .cr-tag { display:inline-block; font-size:11px; font-weight:600; padding:3px 9px; border-radius:20px; letter-spacing:0.01em; }
      `}</style>

      {/* Sidebar */}
      <div style={{ width: 226, background: "#123023", padding: "20px 12px", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "4px 10px 22px" }}>
          <div className="cr-display" style={{ color: "#fff", fontSize: 17, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            <Sun size={20} color="#F0A93E" /> Sunrega Solar
          </div>
          <div style={{ color: "#7C9084", fontSize: 11.5, marginTop: 4, marginLeft: 28 }}>DSA Channel CRM</div>
        </div>
        <button className={`cr-navbtn ${tab === "dashboard" ? "active" : ""}`} onClick={() => setTab("dashboard")}>
          <LayoutDashboard size={16} /> Dashboard
        </button>
        <button className={`cr-navbtn ${tab === "dsas" ? "active" : ""}`} onClick={() => setTab("dsas")}>
          <Users size={16} /> DSAs
        </button>
        <button className={`cr-navbtn ${tab === "leads" ? "active" : ""}`} onClick={() => setTab("leads")}>
          <Target size={16} /> Leads
        </button>
        <button className={`cr-navbtn ${tab === "network" ? "active" : ""}`} onClick={() => setTab("network")}>
          <GitBranch size={16} /> Network
        </button>
        <button className={`cr-navbtn ${tab === "commissions" ? "active" : ""}`} onClick={() => setTab("commissions")}>
          <IndianRupee size={16} /> Commissions
        </button>
        <button className={`cr-navbtn ${tab === "backup" ? "active" : ""}`} onClick={() => setTab("backup")}>
          <DatabaseBackup size={16} /> Backup & Restore
        </button>
        <div style={{ marginTop: "auto", padding: "14px 10px 4px", borderTop: "1px solid #1E4536" }}>
          <div style={{ color: "#7C9084", fontSize: 10.5 }}>
            {saveErr ? "⚠ Changes not saved — check connection" : "All changes saved automatically"}
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, padding: "26px 32px", minWidth: 0 }}>
        {tab === "dashboard" && (
          <Dashboard dsas={dsas} leads={leadsWithCommission} pendingCommission={pendingCommission} paidCommission={paidCommission}
            pipelineValue={pipelineValue} conversionRate={conversionRate} leaderboard={leaderboard} setTab={setTab} />
        )}
        {tab === "dsas" && (
          <DSAList dsas={leaderboard} onAdd={() => setDsaModal({})} onEdit={(d) => setDsaModal(d)} onDelete={deleteDSA} />
        )}
        {tab === "leads" && (
          <LeadList leads={leadsWithCommission} dsas={dsas} onAdd={() => setLeadModal({})} onEdit={(l) => setLeadModal(l)} onDelete={deleteLead} />
        )}
        {tab === "network" && (
          <NetworkTree dsas={dsas} leads={leadsWithCommission} onAddReferral={(referrer) => setLeadModal({ referredByType: referrer.type, referredById: referrer.id })} onEditLead={(l) => setLeadModal(l)} />
        )}
        {tab === "commissions" && (
          <Commissions leads={leadsWithCommission} dsas={dsas} onTogglePaid={toggleCommissionPaid} />
        )}
        {tab === "backup" && (
          <BackupPanel dsas={dsas} leads={leads} onRestore={restoreBackup} />
        )}
      </div>

      {dsaModal !== null && <DSAModal dsa={dsaModal} onClose={() => setDsaModal(null)} onSave={saveDSA} />}
      {leadModal !== null && <LeadModal lead={leadModal} dsas={dsas} leads={leadsWithCommission} onClose={() => setLeadModal(null)} onSave={saveLead} />}
      {confirmState && <ConfirmModal {...confirmState} onCancel={() => setConfirmState(null)} />}

      {toast && (
        <div style={{
          position: "absolute", bottom: 24, right: 24, background: toast.kind === "danger" ? "#D6483D" : "#1F7A5C",
          color: "#fff", padding: "11px 18px", borderRadius: 8, fontSize: 13.5, fontWeight: 500,
          display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 14px rgba(0,0,0,0.15)"
        }}>
          {toast.kind === "danger" ? <CircleAlert size={16} /> : <CheckCircle2 size={16} />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, sub, accent }) {
  return (
    <div className="cr-card" style={{ padding: "16px 18px", flex: 1, minWidth: 150 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: accent || "#5F6B66", marginBottom: 8 }}>
        {icon}
        <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</span>
      </div>
      <div className="cr-display" style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#8B8A7E", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Dashboard({ dsas, leads, pendingCommission, paidCommission, pipelineValue, conversionRate, leaderboard, setTab }) {
  const statusCounts = STATUSES.map(s => ({ status: s, count: leads.filter(l => l.status === s).length }));
  const maxCount = Math.max(1, ...statusCounts.map(s => s.count));

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 className="cr-display" style={{ fontSize: 22, margin: 0 }}>DSA Channel Dashboard</h1>
        <div style={{ color: "#8B8A7E", fontSize: 13, marginTop: 3 }}>{fmtDate(new Date())}</div>
      </div>

      <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
        <StatCard icon={<Users size={16} />} label="Active DSAs" value={dsas.filter(d => d.status === "Active").length} sub={`${dsas.length} total onboarded`} />
        <StatCard icon={<Target size={16} />} label="Total Leads" value={leads.length} sub={`${conversionRate}% conversion`} />
        <StatCard icon={<TrendingUp size={16} />} label="Pipeline Value" value={inr(pipelineValue)} sub="Open leads, not yet closed" accent="#2F6FED" />
        <StatCard icon={<IndianRupee size={16} />} label="Commission Payable" value={inr(pendingCommission)} sub={`${inr(paidCommission)} already paid`} accent={pendingCommission ? "#D6483D" : "#1F7A5C"} />
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div className="cr-card" style={{ flex: 1.2, padding: 20 }}>
          <div className="cr-display" style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Lead pipeline by stage</div>
          {statusCounts.map(s => (
            <div key={s.status} style={{ marginBottom: 11 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                <span className="cr-tag" style={{ background: STATUS_STYLE[s.status].bg, color: STATUS_STYLE[s.status].fg }}>{s.status}</span>
                <span className="cr-mono" style={{ fontWeight: 600 }}>{s.count}</span>
              </div>
              <div style={{ height: 7, background: "#F1EFE4", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${(s.count / maxCount) * 100}%`, height: "100%", background: STATUS_STYLE[s.status].fg, borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>

        <div className="cr-card" style={{ flex: 1, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div className="cr-display" style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <Award size={15} color="#F0A93E" /> Top DSAs
            </div>
            <button className="cr-btn" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setTab("dsas")}>View all</button>
          </div>
          {leaderboard.slice(0, 5).map((d, idx) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F1EFE4", fontSize: 12.5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="cr-mono" style={{ color: "#B4B2A0", width: 14 }}>{idx + 1}</span>
                <span style={{ fontWeight: 500 }}>{d.name}</span>
              </div>
              <span className="cr-mono" style={{ fontWeight: 600, color: "#1F7A5C" }}>{inr(d.commissionEarned)}</span>
            </div>
          ))}
          {leaderboard.length === 0 && <div style={{ color: "#8B8A7E", fontSize: 13 }}>No DSAs onboarded yet.</div>}
        </div>
      </div>
    </div>
  );
}

function DSAList({ dsas, onAdd, onEdit, onDelete }) {
  const [q, setQ] = useState("");
  const filtered = dsas.filter(d => d.name.toLowerCase().includes(q.toLowerCase()) || d.territory.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h1 className="cr-display" style={{ fontSize: 22, margin: 0 }}>Direct Selling Agents</h1>
        <button className="cr-btn cr-btn-primary" onClick={onAdd}><UserPlus size={15} /> Add DSA</button>
      </div>

      <div style={{ position: "relative", maxWidth: 320, marginBottom: 16 }}>
        <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: "#8B8A7E" }} />
        <input className="cr-input" style={{ paddingLeft: 32 }} placeholder="Search by name or territory…" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      <div className="cr-card" style={{ overflow: "hidden" }}>
        <table className="cr-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th>DSA</th><th>Territory</th><th>Contact</th><th>Commission %</th><th>Network leads</th><th>Won</th><th>Earned</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(d => (
              <tr key={d.id}>
                <td style={{ fontWeight: 500 }}>{d.name}</td>
                <td style={{ color: "#5F6B66" }}><MapPin size={12} style={{ marginRight: 3, verticalAlign: -1 }} />{d.territory}</td>
                <td style={{ color: "#5F6B66" }}><Phone size={12} style={{ marginRight: 3, verticalAlign: -1 }} />{d.phone}</td>
                <td className="cr-mono">{d.commissionRate}%</td>
                <td className="cr-mono">{d.leadCount}</td>
                <td className="cr-mono">{d.wonCount}</td>
                <td className="cr-mono" style={{ fontWeight: 600, color: "#1F7A5C" }}>{inr(d.commissionEarned)}</td>
                <td>
                  <span className="cr-tag" style={{ background: d.status === "Active" ? "#E4F5EA" : "#F1EFE4", color: d.status === "Active" ? "#1F7A4D" : "#8B8A7E" }}>{d.status}</span>
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button className="cr-btn" style={{ padding: 6 }} title="Edit" onClick={() => onEdit(d)}><Pencil size={13} /></button>
                    <button className="cr-btn" style={{ padding: 6, color: "#D6483D" }} title="Remove" onClick={() => onDelete(d.id)}><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: "center", color: "#8B8A7E", padding: 24 }}>No DSAs match your search.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DSAModal({ dsa, onClose, onSave }) {
  const [form, setForm] = useState({
    id: dsa.id || null,
    name: dsa.name || "",
    phone: dsa.phone || "",
    email: dsa.email || "",
    territory: dsa.territory || "",
    commissionRate: dsa.commissionRate ?? 3,
    status: dsa.status || "Active",
    joinedDate: dsa.joinedDate || todayStr(),
    payoutDetails: dsa.payoutDetails || "",
  });
  const [err, setErr] = useState("");

  const submit = () => {
    if (!form.name.trim()) { setErr("DSA name is required"); return; }
    if (!form.phone.trim()) { setErr("Phone number is required"); return; }
    onSave({ ...form, commissionRate: Number(form.commissionRate) || 0 });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(18,48,35,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div className="cr-card" style={{ width: 440, padding: 22, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div className="cr-display" style={{ fontSize: 16, fontWeight: 600 }}>{dsa.id ? "Edit DSA" : "Add new DSA"}</div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: "#8B8A7E" }}><X size={18} /></button>
        </div>

        <label style={{ fontSize: 12, color: "#5F6B66", fontWeight: 500 }}>Full name</label>
        <input className="cr-input" style={{ margin: "5px 0 12px" }} value={form.name} onChange={e => { setForm({ ...form, name: e.target.value }); setErr(""); }} placeholder="e.g. Ranjit Singh" />

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "#5F6B66", fontWeight: 500 }}>Phone</label>
            <input className="cr-input" style={{ marginTop: 5 }} value={form.phone} onChange={e => { setForm({ ...form, phone: e.target.value }); setErr(""); }} placeholder="e.g. 98140-XXXXX" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "#5F6B66", fontWeight: 500 }}>Email (optional)</label>
            <input className="cr-input" style={{ marginTop: 5 }} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "#5F6B66", fontWeight: 500 }}>Territory</label>
            <input className="cr-input" style={{ marginTop: 5 }} value={form.territory} onChange={e => setForm({ ...form, territory: e.target.value })} placeholder="e.g. Ludhiana" />
          </div>
          <div style={{ width: 140 }}>
            <label style={{ fontSize: 12, color: "#5F6B66", fontWeight: 500 }}>Commission %</label>
            <input className="cr-input" style={{ marginTop: 5 }} type="number" min="0" step="0.1" value={form.commissionRate} onChange={e => setForm({ ...form, commissionRate: e.target.value })} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "#5F6B66", fontWeight: 500 }}>Status</label>
            <select className="cr-input" style={{ marginTop: 5 }} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "#5F6B66", fontWeight: 500 }}>Joined date</label>
            <input className="cr-input" style={{ marginTop: 5 }} type="date" value={form.joinedDate} onChange={e => setForm({ ...form, joinedDate: e.target.value })} />
          </div>
        </div>

        <label style={{ fontSize: 12, color: "#5F6B66", fontWeight: 500 }}>Payout details (optional)</label>
        <input className="cr-input" style={{ margin: "5px 0 6px" }} value={form.payoutDetails} onChange={e => setForm({ ...form, payoutDetails: e.target.value })} placeholder="e.g. Bank name + account holder name" />

        {err && <div style={{ color: "#D6483D", fontSize: 12.5, marginTop: 8 }}>{err}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button className="cr-btn" onClick={onClose}>Cancel</button>
          <button className="cr-btn cr-btn-primary" onClick={submit}>{dsa.id ? "Save changes" : "Add DSA"}</button>
        </div>
      </div>
    </div>
  );
}

function LeadList({ leads, dsas, onAdd, onEdit, onDelete }) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dsaFilter, setDsaFilter] = useState("ALL");

  const dsaName = (id) => dsas.find(d => d.id === id)?.name || "Unassigned";
  const leadById = (id) => leads.find(l => l.id === id);

  const referrerLabel = (l) => {
    if (l.referredByType === "dsa") return dsaName(l.referredById);
    if (l.referredByType === "lead") return leadById(l.referredById)?.customerName || "Deleted client";
    return "Unassigned";
  };

  const filtered = leads.filter(l =>
    (statusFilter === "ALL" || l.status === statusFilter) &&
    (dsaFilter === "ALL" || l.rootDsaId === dsaFilter) &&
    (l.customerName.toLowerCase().includes(q.toLowerCase()) || l.city.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h1 className="cr-display" style={{ fontSize: 22, margin: 0 }}>Leads</h1>
        <button className="cr-btn cr-btn-primary" onClick={onAdd}><Plus size={15} /> Add lead</button>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 260 }}>
          <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: "#8B8A7E" }} />
          <input className="cr-input" style={{ paddingLeft: 32 }} placeholder="Search customer or city…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className="cr-input" style={{ maxWidth: 180 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="ALL">All stages</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="cr-input" style={{ maxWidth: 200 }} value={dsaFilter} onChange={e => setDsaFilter(e.target.value)}>
          <option value="ALL">All networks</option>
          {dsas.map(d => <option key={d.id} value={d.id}>{d.name}'s network</option>)}
        </select>
      </div>

      <div className="cr-card" style={{ overflow: "hidden" }}>
        <table className="cr-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th>Customer</th><th>City</th><th>System (kW)</th><th>Deal value</th><th>Referred by</th><th>Tier</th><th>Stage</th><th>Lead date</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(l => (
              <tr key={l.id}>
                <td style={{ fontWeight: 500 }}>{l.customerName}</td>
                <td style={{ color: "#5F6B66" }}>{l.city}</td>
                <td className="cr-mono">{l.systemSizeKW}</td>
                <td className="cr-mono">{inr(l.dealValue)}</td>
                <td>{referrerLabel(l)}</td>
                <td><span className="cr-tag" style={{ background: l.tier === 1 ? "#E4F1FB" : "#F1E9FE", color: l.tier === 1 ? "#0C5A8A" : "#5B32B0" }}>Tier {l.tier}</span></td>
                <td><span className="cr-tag" style={{ background: STATUS_STYLE[l.status].bg, color: STATUS_STYLE[l.status].fg }}>{l.status}</span></td>
                <td style={{ color: "#8B8A7E" }}>{fmtDate(l.leadDate)}</td>
                <td>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button className="cr-btn" style={{ padding: 6 }} title="Edit" onClick={() => onEdit(l)}><Pencil size={13} /></button>
                    <button className="cr-btn" style={{ padding: 6, color: "#D6483D" }} title="Remove" onClick={() => onDelete(l.id)}><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: "center", color: "#8B8A7E", padding: 24 }}>No leads match your filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LeadModal({ lead, dsas, leads, onClose, onSave }) {
  const initialRefType = lead.referredByType || "dsa";
  const initialRefId = lead.referredById || (initialRefType === "dsa" ? (dsas[0]?.id || "") : "");
  const initialDsaForRate = initialRefType === "dsa" ? initialRefId : (leads.find(l => l.id === initialRefId)?.rootDsaId ?? null);
  const suggestedRate = () => {
    const d = dsas.find(x => x.id === initialDsaForRate);
    if (!d) return 3;
    return initialRefType === "dsa" ? d.commissionRate : Math.round((d.commissionRate / 2) * 10) / 10;
  };

  const [form, setForm] = useState({
    id: lead.id || null,
    customerName: lead.customerName || "",
    phone: lead.phone || "",
    city: lead.city || "",
    systemSizeKW: lead.systemSizeKW ?? "",
    dealValue: lead.dealValue ?? "",
    referredByType: initialRefType,
    referredById: initialRefId,
    status: lead.status || "New",
    commissionRate: lead.commissionRate ?? suggestedRate(),
    commissionPaid: lead.commissionPaid || false,
    leadDate: lead.leadDate || todayStr(),
    remarks: lead.remarks || "",
  });
  const [err, setErr] = useState("");

  // A lead can't be referred by itself or by one of its own downline clients.
  const excludedLeadIds = lead.id ? new Set([lead.id, ...getDescendantIds(lead.id, leads)]) : new Set();
  const eligibleClients = leads.filter(l => !excludedLeadIds.has(l.id));

  const onReferrerTypeChange = (type) => {
    if (type === "dsa") {
      const d = dsas[0];
      setForm({ ...form, referredByType: "dsa", referredById: d?.id || "", commissionRate: lead.id ? form.commissionRate : (d?.commissionRate ?? form.commissionRate) });
    } else {
      const c = eligibleClients[0];
      const rootDsa = dsas.find(d => d.id === c?.rootDsaId);
      setForm({ ...form, referredByType: "lead", referredById: c?.id || "", commissionRate: lead.id ? form.commissionRate : (rootDsa ? Math.round((rootDsa.commissionRate / 2) * 10) / 10 : form.commissionRate) });
    }
  };

  const onReferrerIdChange = (id) => {
    if (form.referredByType === "dsa") {
      const d = dsas.find(x => x.id === id);
      setForm({ ...form, referredById: id, commissionRate: lead.id ? form.commissionRate : (d?.commissionRate ?? form.commissionRate) });
    } else {
      const c = leads.find(x => x.id === id);
      const rootDsa = dsas.find(d => d.id === c?.rootDsaId);
      setForm({ ...form, referredById: id, commissionRate: lead.id ? form.commissionRate : (rootDsa ? Math.round((rootDsa.commissionRate / 2) * 10) / 10 : form.commissionRate) });
    }
  };

  const submit = () => {
    if (!form.customerName.trim()) { setErr("Customer name is required"); return; }
    if (!form.dealValue || Number(form.dealValue) <= 0) { setErr("Enter an estimated deal value"); return; }
    onSave({
      ...form,
      systemSizeKW: Number(form.systemSizeKW) || 0,
      dealValue: Number(form.dealValue) || 0,
      commissionRate: Number(form.commissionRate) || 0,
      referredById: form.referredById || null,
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(18,48,35,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div className="cr-card" style={{ width: 460, padding: 22, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div className="cr-display" style={{ fontSize: 16, fontWeight: 600 }}>{lead.id ? "Edit lead" : "Add new lead"}</div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: "#8B8A7E" }}><X size={18} /></button>
        </div>

        <label style={{ fontSize: 12, color: "#5F6B66", fontWeight: 500 }}>Customer / site name</label>
        <input className="cr-input" style={{ margin: "5px 0 12px" }} value={form.customerName} onChange={e => { setForm({ ...form, customerName: e.target.value }); setErr(""); }} placeholder="e.g. Gurpreet Textiles" />

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "#5F6B66", fontWeight: 500 }}>Phone</label>
            <input className="cr-input" style={{ marginTop: 5 }} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "#5F6B66", fontWeight: 500 }}>City</label>
            <input className="cr-input" style={{ marginTop: 5 }} value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "#5F6B66", fontWeight: 500 }}>System size (kW)</label>
            <input className="cr-input" style={{ marginTop: 5 }} type="number" min="0" value={form.systemSizeKW} onChange={e => setForm({ ...form, systemSizeKW: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "#5F6B66", fontWeight: 500 }}>Estimated deal value (₹)</label>
            <input className="cr-input" style={{ marginTop: 5 }} type="number" min="0" value={form.dealValue} onChange={e => { setForm({ ...form, dealValue: e.target.value }); setErr(""); }} />
          </div>
        </div>

        <label style={{ fontSize: 12, color: "#5F6B66", fontWeight: 500 }}>Where did this lead come from?</label>
        <div style={{ display: "flex", gap: 8, marginTop: 6, marginBottom: 10 }}>
          <button
            type="button"
            className="cr-btn"
            style={{ flex: 1, justifyContent: "center", ...(form.referredByType === "dsa" ? { background: "#123023", color: "#fff", borderColor: "#123023" } : {}) }}
            onClick={() => onReferrerTypeChange("dsa")}
          >
            Direct from a DSA
          </button>
          <button
            type="button"
            className="cr-btn"
            style={{ flex: 1, justifyContent: "center", ...(form.referredByType === "lead" ? { background: "#123023", color: "#fff", borderColor: "#123023" } : {}) }}
            onClick={() => onReferrerTypeChange("lead")}
            disabled={eligibleClients.length === 0}
          >
            Referral from a client
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "#5F6B66", fontWeight: 500 }}>
              {form.referredByType === "dsa" ? "DSA" : "Referring client"}
            </label>
            {form.referredByType === "dsa" ? (
              <select className="cr-input" style={{ marginTop: 5 }} value={form.referredById} onChange={e => onReferrerIdChange(e.target.value)}>
                <option value="">Unassigned</option>
                {dsas.map(d => <option key={d.id} value={d.id}>{d.name} ({d.territory})</option>)}
              </select>
            ) : (
              <select className="cr-input" style={{ marginTop: 5 }} value={form.referredById} onChange={e => onReferrerIdChange(e.target.value)}>
                {eligibleClients.length === 0 && <option value="">No other clients yet</option>}
                {eligibleClients.map(c => <option key={c.id} value={c.id}>{c.customerName} (Tier {c.tier})</option>)}
              </select>
            )}
          </div>
          <div style={{ width: 130 }}>
            <label style={{ fontSize: 12, color: "#5F6B66", fontWeight: 500 }}>Commission %</label>
            <input className="cr-input" style={{ marginTop: 5 }} type="number" min="0" step="0.1" value={form.commissionRate} onChange={e => setForm({ ...form, commissionRate: e.target.value })} />
          </div>
        </div>
        {form.referredByType === "lead" && (
          <div style={{ fontSize: 11.5, color: "#8B8A7E", marginTop: -8, marginBottom: 12 }}>
            Commission still credits the original DSA at the top of this branch — this rate is just their payout for a downline referral.
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "#5F6B66", fontWeight: 500 }}>Stage</label>
            <select className="cr-input" style={{ marginTop: 5 }} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "#5F6B66", fontWeight: 500 }}>Lead date</label>
            <input className="cr-input" style={{ marginTop: 5 }} type="date" value={form.leadDate} onChange={e => setForm({ ...form, leadDate: e.target.value })} />
          </div>
        </div>

        <label style={{ fontSize: 12, color: "#5F6B66", fontWeight: 500 }}>Remarks (optional)</label>
        <input className="cr-input" style={{ margin: "5px 0 6px" }} value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} />

        {err && <div style={{ color: "#D6483D", fontSize: 12.5, marginTop: 8 }}>{err}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button className="cr-btn" onClick={onClose}>Cancel</button>
          <button className="cr-btn cr-btn-primary" onClick={submit}>{lead.id ? "Save changes" : "Add lead"}</button>
        </div>
      </div>
    </div>
  );
}

function Commissions({ leads, dsas, onTogglePaid }) {
  const wonLeads = leads.filter(l => l.status === "Won").sort((a, b) => (a.commissionPaid === b.commissionPaid ? 0 : a.commissionPaid ? 1 : -1));
  const dsaName = (id) => dsas.find(d => d.id === id)?.name || "Unassigned";

  const exportCommissions = () => {
    const rows = wonLeads.map(l => ({
      Customer: l.customerName,
      "DSA network": dsaName(l.rootDsaId),
      Tier: l.tier,
      "Deal value (₹)": l.dealValue,
      "Commission %": l.commissionRate,
      "Commission amount (₹)": l.commissionAmount,
      Status: l.commissionPaid ? "Paid" : "Pending",
      "Won date": fmtDate(l.leadDate),
    }));
    const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Customer: "", "DSA network": "", Tier: "", "Deal value (₹)": "", "Commission %": "", "Commission amount (₹)": "", Status: "", "Won date": "" }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Commissions");
    XLSX.writeFile(wb, `sunrega_dsa_commissions_${todayStr()}.xlsx`);
  };

  const totalPending = wonLeads.filter(l => !l.commissionPaid).reduce((s, l) => s + l.commissionAmount, 0);
  const totalPaid = wonLeads.filter(l => l.commissionPaid).reduce((s, l) => s + l.commissionAmount, 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h1 className="cr-display" style={{ fontSize: 22, margin: 0 }}>Commissions</h1>
        <button className="cr-btn" onClick={exportCommissions}><Download size={15} /> Export (.xlsx)</button>
      </div>

      <div style={{ display: "flex", gap: 14, marginBottom: 18 }}>
        <StatCard icon={<IndianRupee size={16} />} label="Pending payout" value={inr(totalPending)} accent="#D6483D" />
        <StatCard icon={<CheckCircle2 size={16} />} label="Paid out" value={inr(totalPaid)} accent="#1F7A5C" />
      </div>

      <div className="cr-card" style={{ overflow: "hidden" }}>
        <table className="cr-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th>Customer</th><th>DSA network</th><th>Tier</th><th>Deal value</th><th>Rate</th><th>Commission</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {wonLeads.map(l => (
              <tr key={l.id}>
                <td style={{ fontWeight: 500 }}>{l.customerName}</td>
                <td>{dsaName(l.rootDsaId)}</td>
                <td><span className="cr-tag" style={{ background: l.tier === 1 ? "#E4F1FB" : "#F1E9FE", color: l.tier === 1 ? "#0C5A8A" : "#5B32B0" }}>Tier {l.tier}</span></td>
                <td className="cr-mono">{inr(l.dealValue)}</td>
                <td className="cr-mono">{l.commissionRate}%</td>
                <td className="cr-mono" style={{ fontWeight: 600 }}>{inr(l.commissionAmount)}</td>
                <td>
                  <span className="cr-tag" style={{ background: l.commissionPaid ? "#E4F5EA" : "#FDF1DC", color: l.commissionPaid ? "#1F7A4D" : "#96650E" }}>
                    {l.commissionPaid ? "Paid" : "Pending"}
                  </span>
                </td>
                <td>
                  <button className="cr-btn" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => onTogglePaid(l.id)}>
                    Mark {l.commissionPaid ? "unpaid" : "paid"}
                  </button>
                </td>
              </tr>
            ))}
            {wonLeads.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: "center", color: "#8B8A7E", padding: 24 }}>No won deals yet — commissions will appear here once a lead's stage is set to "Won".</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NetworkTree({ dsas, leads, onAddReferral, onEditLead }) {
  const [collapsed, setCollapsed] = useState({});
  const [dsaFilter, setDsaFilter] = useState("ALL");

  const toggle = (id) => setCollapsed(c => ({ ...c, [id]: !c[id] }));

  const childrenOfLead = (leadId) => leads.filter(l => l.referredByType === "lead" && l.referredById === leadId);
  const directLeadsOfDsa = (dsaId) => leads.filter(l => l.referredByType === "dsa" && l.referredById === dsaId);

  const visibleDsas = dsaFilter === "ALL" ? dsas : dsas.filter(d => d.id === dsaFilter);

  const totalNetworked = leads.filter(l => l.rootDsaId).length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h1 className="cr-display" style={{ fontSize: 22, margin: 0 }}>Referral Network</h1>
        <select className="cr-input" style={{ maxWidth: 220 }} value={dsaFilter} onChange={e => setDsaFilter(e.target.value)}>
          <option value="ALL">All DSAs</option>
          {dsas.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
      <div style={{ color: "#8B8A7E", fontSize: 13, marginBottom: 20 }}>
        Each DSA sits at the root — their direct clients (Tier 1) can go on to refer their own contacts (Tier 2, Tier 3…), building out the branch. {totalNetworked} of {leads.length} leads are attached to a network so far.
      </div>

      {visibleDsas.map(dsa => (
        <div key={dsa.id} className="cr-card" style={{ padding: 18, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: "#123023", color: "#F0A93E", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Users size={16} />
            </div>
            <div>
              <div className="cr-display" style={{ fontWeight: 600, fontSize: 14.5 }}>{dsa.name}</div>
              <div style={{ fontSize: 11.5, color: "#8B8A7E" }}>{dsa.territory} · {dsa.commissionRate}% base commission</div>
            </div>
            <button className="cr-btn" style={{ marginLeft: "auto", padding: "5px 10px", fontSize: 12 }} onClick={() => onAddReferral({ type: "dsa", id: dsa.id })}>
              <Plus size={13} /> Direct client
            </button>
          </div>

          <div style={{ paddingLeft: 8 }}>
            {directLeadsOfDsa(dsa.id).map(lead => (
              <LeadNode key={lead.id} lead={lead} depth={0} collapsed={collapsed} toggle={toggle} childrenOfLead={childrenOfLead} onAddReferral={onAddReferral} onEditLead={onEditLead} />
            ))}
            {directLeadsOfDsa(dsa.id).length === 0 && (
              <div style={{ fontSize: 12.5, color: "#B4B2A0", padding: "6px 0 2px" }}>No direct clients yet.</div>
            )}
          </div>
        </div>
      ))}

      {leads.some(l => !l.rootDsaId) && (
        <div className="cr-card" style={{ padding: 18 }}>
          <div className="cr-display" style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 10, color: "#8B8A7E" }}>Unassigned</div>
          <div style={{ paddingLeft: 8 }}>
            {leads.filter(l => !l.rootDsaId).map(lead => (
              <LeadNode key={lead.id} lead={lead} depth={0} collapsed={collapsed} toggle={toggle} childrenOfLead={childrenOfLead} onAddReferral={onAddReferral} onEditLead={onEditLead} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LeadNode({ lead, depth, collapsed, toggle, childrenOfLead, onAddReferral, onEditLead }) {
  const kids = childrenOfLead(lead.id);
  const isCollapsed = collapsed[lead.id];
  const style = STATUS_STYLE[lead.status];

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", gap: 6, padding: "7px 8px", marginLeft: depth * 24,
        borderLeft: depth > 0 ? "2px solid #E7E4D6" : "none", position: "relative"
      }}>
        {kids.length > 0 ? (
          <button onClick={() => toggle(lead.id)} style={{ border: "none", background: "none", cursor: "pointer", color: "#8B8A7E", padding: 0, display: "flex" }}>
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
        ) : <span style={{ width: 14 }} />}

        <span style={{ fontSize: 13, fontWeight: 500 }}>{lead.customerName}</span>
        <span className="cr-tag" style={{ background: style.bg, color: style.fg, fontSize: 10 }}>{lead.status}</span>
        <span className="cr-mono" style={{ fontSize: 11.5, color: "#8B8A7E" }}>{inr(lead.dealValue)}</span>
        {kids.length > 0 && <span style={{ fontSize: 11, color: "#8B8A7E" }}>· {kids.length} referral{kids.length > 1 ? "s" : ""}</span>}

        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <button className="cr-btn" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => onAddReferral({ type: "lead", id: lead.id })}>+ Referral</button>
          <button className="cr-btn" style={{ padding: "3px 6px" }} title="Edit" onClick={() => onEditLead(lead)}><Pencil size={11} /></button>
        </div>
      </div>

      {!isCollapsed && kids.map(k => (
        <LeadNode key={k.id} lead={k} depth={depth + 1} collapsed={collapsed} toggle={toggle} childrenOfLead={childrenOfLead} onAddReferral={onAddReferral} onEditLead={onEditLead} />
      ))}
    </div>
  );
}

function BackupPanel({ dsas, leads, onRestore }) {
  const fileRef = React.useRef(null);
  const [fileErr, setFileErr] = useState("");

  const exportBackup = () => {
    const payload = JSON.stringify({ dsas, leads, exportedAt: new Date().toISOString() }, null, 2);
    downloadBlob(payload, `sunrega_dsa_crm_backup_${todayStr()}.json`, "application/json");
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        onRestore(data);
        setFileErr("");
      } catch (err) {
        setFileErr("Couldn't read that file — make sure it's a backup .json exported from this CRM.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div>
      <h1 className="cr-display" style={{ fontSize: 22, margin: "0 0 4px" }}>Backup & restore</h1>
      <div style={{ color: "#8B8A7E", fontSize: 13, marginBottom: 20 }}>
        Keep an offline copy of your DSA and lead data, or bring it back if this device's data is ever lost.
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div className="cr-card" style={{ padding: 20, flex: 1, minWidth: 260 }}>
          <div className="cr-display" style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
            <DatabaseBackup size={16} /> Download backup
          </div>
          <div style={{ fontSize: 12.5, color: "#8B8A7E", marginBottom: 14 }}>
            Saves every DSA and lead ({dsas.length} DSAs, {leads.length} leads) as a single .json file.
          </div>
          <button className="cr-btn cr-btn-primary" onClick={exportBackup}><Download size={15} /> Download backup file</button>
        </div>

        <div className="cr-card" style={{ padding: 20, flex: 1, minWidth: 260 }}>
          <div className="cr-display" style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
            <Upload size={16} /> Restore from backup
          </div>
          <div style={{ fontSize: 12.5, color: "#8B8A7E", marginBottom: 14 }}>
            Replaces all current data with what's in the backup file. This cannot be undone.
          </div>
          <input ref={fileRef} type="file" accept="application/json" onChange={handleFile} style={{ display: "none" }} />
          <button className="cr-btn" onClick={() => fileRef.current?.click()}><Upload size={15} /> Choose backup file</button>
          {fileErr && <div style={{ color: "#D6483D", fontSize: 12.5, marginTop: 10 }}>{fileErr}</div>}
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel, danger, onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(18,48,35,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 }}>
      <div className="cr-card" style={{ width: 380, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <CircleAlert size={20} color={danger ? "#D6483D" : "#F0A93E"} />
          <div className="cr-display" style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
        </div>
        <div style={{ fontSize: 13.5, color: "#5F6B66", lineHeight: 1.5, marginBottom: 20 }}>{message}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="cr-btn" onClick={onCancel}>Cancel</button>
          <button
            className="cr-btn"
            style={danger ? { background: "#D6483D", borderColor: "#D6483D", color: "#fff" } : { background: "#1F7A5C", borderColor: "#1F7A5C", color: "#fff" }}
            onClick={onConfirm}
          >
            {confirmLabel || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
