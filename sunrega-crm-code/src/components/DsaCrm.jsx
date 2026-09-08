import React, { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import {
  Users, UserPlus, LayoutDashboard, Target, IndianRupee, Plus, Search,
  X, Pencil, Trash2, Phone, MapPin, TrendingUp, CircleAlert, CheckCircle2,
  DatabaseBackup, Upload, Download, Award, GitBranch, ChevronRight, ChevronDown, RefreshCw
} from "lucide-react";
import {
  fetchDSAs, saveDSA, deleteDSA,
  fetchDsaLeads, saveDsaLead, deleteDsaLead,
  toggleLeadCommissionPaid, restoreDsaData, hasUserPermission
} from "../lib/operationsApi";

const STATUSES = ["New", "Site Visit", "Quotation Sent", "Proposal Sent", "Won", "Lost"];

const STATUS_STYLE = {
  "New": { bg: "#EDEDF7", fg: "#4C4C8A" },
  "Site Visit": { bg: "#E4F1FB", fg: "#0C5A8A" },
  "Quotation Sent": { bg: "#FDF1DC", fg: "#96650E" },
  "Proposal Sent": { bg: "#F1E9FE", fg: "#5B32B0" },
  "Won": { bg: "#E4F5EA", fg: "#1F7A4D" },
  "Lost": { bg: "#FBE7E5", fg: "#B23B2E" },
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d) {
  try {
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return d; }
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

// Tree calculation helpers
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

function getDescendantIds(leadId, leads) {
  const kids = leads.filter(l => l.referredByType === "lead" && l.referredById === leadId);
  let ids = kids.map(k => k.id);
  kids.forEach(k => { ids = ids.concat(getDescendantIds(k.id, leads)); });
  return ids;
}

export default function DsaCrm({ profile, permissions = [] }) {
  const [dsas, setDsas] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState("dashboard");

  const [dsaModal, setDsaModal] = useState(null);
  const [leadModal, setLeadModal] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [toast, setToast] = useState(null);

  // Permission checks
  const canViewDashboard = hasUserPermission(profile, permissions, "operations.dsa.dashboard.view") || hasUserPermission(profile, permissions, "operations.dsa.view");
  const canCreateDsa = hasUserPermission(profile, permissions, "operations.dsa.create");
  const canUpdateDsa = hasUserPermission(profile, permissions, "operations.dsa.update");
  const canDeleteDsa = hasUserPermission(profile, permissions, "operations.dsa.delete");
  const canViewLeads = hasUserPermission(profile, permissions, "operations.dsa.leads.view") || hasUserPermission(profile, permissions, "operations.dsa.view");
  const canCreateLead = hasUserPermission(profile, permissions, "operations.dsa.leads.create");
  const canUpdateLead = hasUserPermission(profile, permissions, "operations.dsa.leads.update");
  const canDeleteLead = hasUserPermission(profile, permissions, "operations.dsa.leads.delete");
  const canViewNetwork = hasUserPermission(profile, permissions, "operations.dsa.network.view") || hasUserPermission(profile, permissions, "operations.dsa.view");
  const canViewCommissions = hasUserPermission(profile, permissions, "operations.dsa.commissions.view") || hasUserPermission(profile, permissions, "operations.dsa.view");
  const canManageCommissions = hasUserPermission(profile, permissions, "operations.dsa.commissions.manage");
  const canExport = hasUserPermission(profile, permissions, "operations.dsa.export");
  const canBackup = hasUserPermission(profile, permissions, "operations.dsa.backup");
  const canRestore = hasUserPermission(profile, permissions, "operations.dsa.restore");

  const loadData = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    else setRefreshing(true);
    try {
      const [dsaList, leadList] = await Promise.all([
        fetchDSAs(),
        fetchDsaLeads()
      ]);
      setDsas(dsaList || []);
      setLeads(leadList || []);
    } catch (err) {
      showToast(err.message || "Failed to load DSA data", "danger");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showToast = (msg, kind = "success") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSaveDSA = async (dsa) => {
    try {
      const saved = await saveDSA(dsa);
      if (dsa.id) {
        setDsas(prev => prev.map(d => d.id === dsa.id ? saved : d));
        showToast("DSA updated successfully");
      } else {
        setDsas(prev => [...prev, saved]);
        showToast("DSA created successfully");
      }
      setDsaModal(null);
    } catch (err) {
      showToast(err.message || "Failed to save DSA", "danger");
    }
  };

  const handleDeleteDSA = (id) => {
    const dsa = dsas.find(d => d.id === id);
    const linkedLeads = leads.filter(l => l.referredByType === "dsa" && l.referredById === id).length;
    setConfirmState({
      title: "Remove DSA",
      message: `Remove "${dsa?.name}"? ${linkedLeads ? `${linkedLeads} direct lead(s) will be unlinked.` : ""} This cannot be undone.`,
      confirmLabel: "Remove DSA",
      danger: true,
      onConfirm: async () => {
        try {
          await deleteDSA(id);
          await loadData(false);
          showToast("DSA removed", "danger");
        } catch (err) {
          showToast(err.message || "Failed to delete DSA", "danger");
        } finally {
          setConfirmState(null);
        }
      },
    });
  };

  const handleSaveLead = async (lead) => {
    try {
      const saved = await saveDsaLead(lead);
      if (lead.id) {
        setLeads(prev => prev.map(l => l.id === lead.id ? saved : l));
        showToast("Lead updated successfully");
      } else {
        setLeads(prev => [saved, ...prev]);
        showToast("Lead created successfully");
      }
      setLeadModal(null);
    } catch (err) {
      showToast(err.message || "Failed to save lead", "danger");
    }
  };

  const handleDeleteLead = (id) => {
    const lead = leads.find(l => l.id === id);
    const downlineCount = getDescendantIds(id, leads).length;
    setConfirmState({
      title: "Remove lead",
      message: `Remove "${lead?.customerName}"? ${downlineCount ? `${downlineCount} client(s) they referred will be unlinked.` : ""} This cannot be undone.`,
      confirmLabel: "Remove lead",
      danger: true,
      onConfirm: async () => {
        try {
          await deleteDsaLead(id);
          await loadData(false);
          showToast("Lead removed", "danger");
        } catch (err) {
          showToast(err.message || "Failed to delete lead", "danger");
        } finally {
          setConfirmState(null);
        }
      },
    });
  };

  const handleToggleCommissionPaid = async (leadId) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;
    const nextState = !lead.commissionPaid;
    try {
      await toggleLeadCommissionPaid(leadId, nextState);
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, commissionPaid: nextState } : l));
      showToast(nextState ? "Marked as paid" : "Marked as pending");
    } catch (err) {
      showToast(err.message || "Failed to update commission status", "danger");
    }
  };

  const handleRestoreBackup = async (data) => {
    if (!data || !Array.isArray(data.dsas) || !Array.isArray(data.leads)) {
      showToast("Invalid backup file: missing DSAs or leads", "danger");
      return;
    }
    setConfirmState({
      title: "Restore backup",
      message: "Restoring will merge DSA and lead records into the Supabase database. Continue?",
      confirmLabel: "Restore backup",
      danger: true,
      onConfirm: async () => {
        try {
          await restoreDsaData(data);
          await loadData();
          showToast("Backup restored successfully");
        } catch (err) {
          showToast(err.message || "Restore failed", "danger");
        } finally {
          setConfirmState(null);
        }
      },
    });
  };

  // Referral tree and calculated commissions
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

  if (loading) {
    return (
      <div className="panel" style={{ padding: 40, textAlign: "center" }}>
        <RefreshCw size={24} className="spin" style={{ marginBottom: 12, color: "var(--primary)" }} />
        <p className="muted">Loading DSA CRM from database...</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 20, minHeight: 680 }}>
      {/* Sub navigation */}
      <div style={{ width: 220, flexShrink: 0 }}>
        <div className="panel" style={{ padding: "16px 10px" }}>
          <div style={{ padding: "4px 10px 16px", borderBottom: "1px solid var(--border)", marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", gap: 8, color: "var(--primary)" }}>
              <Users size={18} /> DSA Channel CRM
            </div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Partner & Referral Network</div>
          </div>

          <button
            className={`btn-ghost ${tab === "dashboard" ? "active" : ""}`}
            style={{ width: "100%", justifyContent: "flex-start", marginBottom: 4, display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8 }}
            onClick={() => setTab("dashboard")}
          >
            <LayoutDashboard size={16} /> Dashboard
          </button>

          <button
            className={`btn-ghost ${tab === "dsas" ? "active" : ""}`}
            style={{ width: "100%", justifyContent: "flex-start", marginBottom: 4, display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8 }}
            onClick={() => setTab("dsas")}
          >
            <Users size={16} /> DSAs ({dsas.length})
          </button>

          {canViewLeads && (
            <button
              className={`btn-ghost ${tab === "leads" ? "active" : ""}`}
              style={{ width: "100%", justifyContent: "flex-start", marginBottom: 4, display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8 }}
              onClick={() => setTab("leads")}
            >
              <Target size={16} /> Leads ({leads.length})
            </button>
          )}

          {canViewNetwork && (
            <button
              className={`btn-ghost ${tab === "network" ? "active" : ""}`}
              style={{ width: "100%", justifyContent: "flex-start", marginBottom: 4, display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8 }}
              onClick={() => setTab("network")}
            >
              <GitBranch size={16} /> Referral Network
            </button>
          )}

          {canViewCommissions && (
            <button
              className={`btn-ghost ${tab === "commissions" ? "active" : ""}`}
              style={{ width: "100%", justifyContent: "flex-start", marginBottom: 4, display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8 }}
              onClick={() => setTab("commissions")}
            >
              <IndianRupee size={16} /> Commissions
            </button>
          )}

          {(canBackup || canRestore) && (
            <button
              className={`btn-ghost ${tab === "backup" ? "active" : ""}`}
              style={{ width: "100%", justifyContent: "flex-start", marginBottom: 4, display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8 }}
              onClick={() => setTab("backup")}
            >
              <DatabaseBackup size={16} /> Backup & Restore
            </button>
          )}

          <div style={{ marginTop: 24, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
            <button
              className="btn"
              style={{ width: "100%", fontSize: 12, padding: "6px 8px" }}
              onClick={() => loadData(false)}
              disabled={refreshing}
            >
              <RefreshCw size={13} className={refreshing ? "spin" : ""} style={{ marginRight: 6 }} />
              {refreshing ? "Refreshing..." : "Sync Database"}
            </button>
          </div>
        </div>
      </div>

      {/* Main body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {tab === "dashboard" && (
          <Dashboard
            dsas={dsas}
            leads={leadsWithCommission}
            pendingCommission={pendingCommission}
            paidCommission={paidCommission}
            pipelineValue={pipelineValue}
            conversionRate={conversionRate}
            leaderboard={leaderboard}
            setTab={setTab}
          />
        )}

        {tab === "dsas" && (
          <DSAList
            dsas={leaderboard}
            canCreate={canCreateDsa}
            canUpdate={canUpdateDsa}
            canDelete={canDeleteDsa}
            onAdd={() => setDsaModal({})}
            onEdit={(d) => setDsaModal(d)}
            onDelete={handleDeleteDSA}
          />
        )}

        {tab === "leads" && canViewLeads && (
          <LeadList
            leads={leadsWithCommission}
            dsas={dsas}
            canCreate={canCreateLead}
            canUpdate={canUpdateLead}
            canDelete={canDeleteLead}
            onAdd={() => setLeadModal({})}
            onEdit={(l) => setLeadModal(l)}
            onDelete={handleDeleteLead}
          />
        )}

        {tab === "network" && canViewNetwork && (
          <NetworkTree
            dsas={dsas}
            leads={leadsWithCommission}
            canCreateLead={canCreateLead}
            canUpdateLead={canUpdateLead}
            onAddReferral={(referrer) => setLeadModal({ referredByType: referrer.type, referredById: referrer.id })}
            onEditLead={(l) => setLeadModal(l)}
          />
        )}

        {tab === "commissions" && canViewCommissions && (
          <Commissions
            leads={leadsWithCommission}
            dsas={dsas}
            canManage={canManageCommissions}
            canExport={canExport}
            onTogglePaid={handleToggleCommissionPaid}
          />
        )}

        {tab === "backup" && (canBackup || canRestore) && (
          <BackupPanel
            dsas={dsas}
            leads={leads}
            canBackup={canBackup}
            canRestore={canRestore}
            onRestore={handleRestoreBackup}
          />
        )}
      </div>

      {dsaModal !== null && (
        <DSAModal dsa={dsaModal} onClose={() => setDsaModal(null)} onSave={handleSaveDSA} />
      )}

      {leadModal !== null && (
        <LeadModal lead={leadModal} dsas={dsas} leads={leadsWithCommission} onClose={() => setLeadModal(null)} onSave={handleSaveLead} />
      )}

      {confirmState && (
        <ConfirmModal {...confirmState} onCancel={() => setConfirmState(null)} />
      )}

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24,
          background: toast.kind === "danger" ? "#D6483D" : "var(--primary, #0f766e)",
          color: "#fff", padding: "11px 18px", borderRadius: 8, fontSize: 13.5, fontWeight: 500,
          display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 14px rgba(0,0,0,0.2)", zIndex: 100
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
    <div className="card" style={{ padding: "16px 18px", flex: 1, minWidth: 150 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: accent || "var(--muted)", marginBottom: 8 }}>
        {icon}
        <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Dashboard({ dsas, leads, pendingCommission, paidCommission, pipelineValue, conversionRate, leaderboard, setTab }) {
  const statusCounts = STATUSES.map(s => ({ status: s, count: leads.filter(l => l.status === s).length }));
  const maxCount = Math.max(1, ...statusCounts.map(s => s.count));

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22 }}>DSA Channel Dashboard</h2>
        <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>{fmtDate(new Date())}</div>
      </div>

      <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
        <StatCard icon={<Users size={16} />} label="Active DSAs" value={dsas.filter(d => d.status === "Active").length} sub={`${dsas.length} total onboarded`} />
        <StatCard icon={<Target size={16} />} label="Total Leads" value={leads.length} sub={`${conversionRate}% conversion`} />
        <StatCard icon={<TrendingUp size={16} />} label="Pipeline Value" value={inr(pipelineValue)} sub="Active pipeline" accent="#3b82f6" />
        <StatCard icon={<IndianRupee size={16} />} label="Commission Payable" value={inr(pendingCommission)} sub={`${inr(paidCommission)} already paid`} accent={pendingCommission ? "#D6483D" : "#10b981"} />
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div className="card" style={{ flex: "1.2 1 300px", padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Lead Pipeline by Stage</div>
          {statusCounts.map(s => (
            <div key={s.status} style={{ marginBottom: 11 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                <span className="badge" style={{ background: STATUS_STYLE[s.status].bg, color: STATUS_STYLE[s.status].fg }}>{s.status}</span>
                <span style={{ fontWeight: 600, fontFamily: "monospace" }}>{s.count}</span>
              </div>
              <div style={{ height: 7, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${(s.count / maxCount) * 100}%`, height: "100%", background: STATUS_STYLE[s.status].fg, borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>

        <div className="card" style={{ flex: "1 1 260px", padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <Award size={16} color="#eab308" /> Top DSAs
            </div>
            <button className="btn" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => setTab("dsas")}>View all</button>
          </div>
          {leaderboard.slice(0, 5).map((d, idx) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 12.5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "var(--muted)", width: 14, fontFamily: "monospace" }}>{idx + 1}</span>
                <span style={{ fontWeight: 500 }}>{d.name}</span>
              </div>
              <span style={{ fontWeight: 600, color: "#10b981", fontFamily: "monospace" }}>{inr(d.commissionEarned)}</span>
            </div>
          ))}
          {leaderboard.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No DSAs onboarded yet.</div>}
        </div>
      </div>
    </div>
  );
}

function DSAList({ dsas, canCreate, canUpdate, canDelete, onAdd, onEdit, onDelete }) {
  const [q, setQ] = useState("");
  const filtered = dsas.filter(d => d.name.toLowerCase().includes(q.toLowerCase()) || (d.territory && d.territory.toLowerCase().includes(q.toLowerCase())));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 22 }}>Direct Selling Agents (DSAs)</h2>
        {canCreate && (
          <button className="btn btn-primary" onClick={onAdd}>
            <UserPlus size={14} style={{ marginRight: 6 }} /> Add DSA
          </button>
        )}
      </div>

      <div style={{ position: "relative", maxWidth: 320, marginBottom: 16 }}>
        <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: "var(--muted)" }} />
        <input className="input" style={{ paddingLeft: 32 }} placeholder="Search name or territory…" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>DSA</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Territory</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Contact</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Commission %</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Network Leads</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Won</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Earned</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Status</th>
              <th style={{ textAlign: "right", padding: "10px 12px" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(d => (
              <tr key={d.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "10px 12px", fontWeight: 500 }}>{d.name}</td>
                <td style={{ padding: "10px 12px", color: "var(--muted)" }}>
                  <MapPin size={12} style={{ marginRight: 4, verticalAlign: -1 }} />{d.territory || "—"}
                </td>
                <td style={{ padding: "10px 12px", color: "var(--muted)" }}>
                  <Phone size={12} style={{ marginRight: 4, verticalAlign: -1 }} />{d.phone || "—"}
                </td>
                <td style={{ padding: "10px 12px", fontFamily: "monospace" }}>{d.commissionRate}%</td>
                <td style={{ padding: "10px 12px", fontFamily: "monospace" }}>{d.leadCount || 0}</td>
                <td style={{ padding: "10px 12px", fontFamily: "monospace" }}>{d.wonCount || 0}</td>
                <td style={{ padding: "10px 12px", fontFamily: "monospace", fontWeight: 600, color: "#10b981" }}>{inr(d.commissionEarned || 0)}</td>
                <td style={{ padding: "10px 12px" }}>
                  <span className={`badge ${d.status === "Active" ? "badge-success" : ""}`} style={{ background: d.status === "Active" ? "#E4F5EA" : "var(--border)", color: d.status === "Active" ? "#1F7A4D" : "var(--muted)" }}>
                    {d.status}
                  </span>
                </td>
                <td style={{ padding: "10px 12px", textAlign: "right" }}>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    {canUpdate && (
                      <button className="btn" style={{ padding: 6 }} title="Edit" onClick={() => onEdit(d)}>
                        <Pencil size={13} />
                      </button>
                    )}
                    {canDelete && (
                      <button className="btn" style={{ padding: 6, color: "#D6483D" }} title="Remove" onClick={() => onDelete(d.id)}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: 32 }} className="muted">No DSAs found.</td></tr>
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div className="card" style={{ width: 440, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>{dsa.id ? "Edit DSA" : "Add Direct Selling Agent"}</h3>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--muted)" }}><X size={18} /></button>
        </div>

        <label style={{ fontSize: 12, fontWeight: 500 }}>Full name</label>
        <input className="input" style={{ margin: "5px 0 12px" }} value={form.name} onChange={e => { setForm({ ...form, name: e.target.value }); setErr(""); }} placeholder="e.g. Ranjit Singh" />

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 500 }}>Phone</label>
            <input className="input" style={{ marginTop: 5 }} value={form.phone} onChange={e => { setForm({ ...form, phone: e.target.value }); setErr(""); }} placeholder="e.g. 98140-XXXXX" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 500 }}>Email (optional)</label>
            <input className="input" style={{ marginTop: 5 }} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 500 }}>Territory</label>
            <input className="input" style={{ marginTop: 5 }} value={form.territory} onChange={e => setForm({ ...form, territory: e.target.value })} placeholder="e.g. Ludhiana" />
          </div>
          <div style={{ width: 140 }}>
            <label style={{ fontSize: 12, fontWeight: 500 }}>Commission %</label>
            <input className="input" style={{ marginTop: 5 }} type="number" min="0" step="0.1" value={form.commissionRate} onChange={e => setForm({ ...form, commissionRate: e.target.value })} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 500 }}>Status</label>
            <select className="input" style={{ marginTop: 5 }} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 500 }}>Joined date</label>
            <input className="input" style={{ marginTop: 5 }} type="date" value={form.joinedDate} onChange={e => setForm({ ...form, joinedDate: e.target.value })} />
          </div>
        </div>

        <label style={{ fontSize: 12, fontWeight: 500 }}>Payout Details (optional)</label>
        <input className="input" style={{ margin: "5px 0 6px" }} value={form.payoutDetails} onChange={e => setForm({ ...form, payoutDetails: e.target.value })} placeholder="e.g. Bank name, account number, IFSC" />

        {err && <div style={{ color: "#D6483D", fontSize: 12.5, marginTop: 8 }}>{err}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit}>{dsa.id ? "Save changes" : "Add DSA"}</button>
        </div>
      </div>
    </div>
  );
}

function LeadList({ leads, dsas, canCreate, canUpdate, canDelete, onAdd, onEdit, onDelete }) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dsaFilter, setDsaFilter] = useState("ALL");

  const dsaName = (id) => dsas.find(d => d.id === id)?.name || "Unassigned";
  const leadById = (id) => leads.find(l => l.id === id);

  const referrerLabel = (l) => {
    if (l.referredByType === "dsa") return dsaName(l.referredById);
    if (l.referredByType === "lead") return leadById(l.referredById)?.customerName || "Client Referral";
    return "Unassigned";
  };

  const filtered = leads.filter(l =>
    (statusFilter === "ALL" || l.status === statusFilter) &&
    (dsaFilter === "ALL" || l.rootDsaId === dsaFilter) &&
    (l.customerName.toLowerCase().includes(q.toLowerCase()) || (l.city && l.city.toLowerCase().includes(q.toLowerCase())))
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 22 }}>Channel Leads</h2>
        {canCreate && (
          <button className="btn btn-primary" onClick={onAdd}>
            <Plus size={14} style={{ marginRight: 6 }} /> Add Lead
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 260 }}>
          <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: "var(--muted)" }} />
          <input className="input" style={{ paddingLeft: 32 }} placeholder="Search customer or city…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className="input" style={{ maxWidth: 180 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="ALL">All Stages</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input" style={{ maxWidth: 200 }} value={dsaFilter} onChange={e => setDsaFilter(e.target.value)}>
          <option value="ALL">All Networks</option>
          {dsas.map(d => <option key={d.id} value={d.id}>{d.name}'s network</option>)}
        </select>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Customer</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>City</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>System (kW)</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Deal Value</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Referred By</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Tier</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Stage</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Lead Date</th>
              <th style={{ textAlign: "right", padding: "10px 12px" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(l => (
              <tr key={l.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "10px 12px", fontWeight: 500 }}>{l.customerName}</td>
                <td style={{ padding: "10px 12px", color: "var(--muted)" }}>{l.city || "—"}</td>
                <td style={{ padding: "10px 12px", fontFamily: "monospace" }}>{l.systemSizeKW}</td>
                <td style={{ padding: "10px 12px", fontFamily: "monospace" }}>{inr(l.dealValue)}</td>
                <td style={{ padding: "10px 12px" }}>{referrerLabel(l)}</td>
                <td style={{ padding: "10px 12px" }}>
                  <span className="badge" style={{ background: l.tier === 1 ? "#E4F1FB" : "#F1E9FE", color: l.tier === 1 ? "#0C5A8A" : "#5B32B0" }}>
                    Tier {l.tier}
                  </span>
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <span className="badge" style={{ background: STATUS_STYLE[l.status]?.bg || "#eee", color: STATUS_STYLE[l.status]?.fg || "#333" }}>
                    {l.status}
                  </span>
                </td>
                <td style={{ padding: "10px 12px", color: "var(--muted)" }}>{fmtDate(l.leadDate)}</td>
                <td style={{ padding: "10px 12px", textAlign: "right" }}>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    {canUpdate && (
                      <button className="btn" style={{ padding: 6 }} title="Edit" onClick={() => onEdit(l)}>
                        <Pencil size={13} />
                      </button>
                    )}
                    {canDelete && (
                      <button className="btn" style={{ padding: 6, color: "#D6483D" }} title="Remove" onClick={() => onDelete(l.id)}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: 32 }} className="muted">No leads match your filters.</td></tr>
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

  // Prevent self referral and downline circular referrals
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div className="card" style={{ width: 460, padding: 24, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>{lead.id ? "Edit Lead" : "Add Lead"}</h3>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--muted)" }}><X size={18} /></button>
        </div>

        <label style={{ fontSize: 12, fontWeight: 500 }}>Customer / site name</label>
        <input className="input" style={{ margin: "5px 0 12px" }} value={form.customerName} onChange={e => { setForm({ ...form, customerName: e.target.value }); setErr(""); }} placeholder="e.g. Gurpreet Textiles" />

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 500 }}>Phone</label>
            <input className="input" style={{ marginTop: 5 }} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 500 }}>City</label>
            <input className="input" style={{ marginTop: 5 }} value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 500 }}>System size (kW)</label>
            <input className="input" style={{ marginTop: 5 }} type="number" min="0" value={form.systemSizeKW} onChange={e => setForm({ ...form, systemSizeKW: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 500 }}>Estimated deal value (₹)</label>
            <input className="input" style={{ marginTop: 5 }} type="number" min="0" value={form.dealValue} onChange={e => { setForm({ ...form, dealValue: e.target.value }); setErr(""); }} />
          </div>
        </div>

        <label style={{ fontSize: 12, fontWeight: 500 }}>Referral Source</label>
        <div style={{ display: "flex", gap: 8, marginTop: 6, marginBottom: 10 }}>
          <button
            type="button"
            className={`btn ${form.referredByType === "dsa" ? "btn-primary" : ""}`}
            style={{ flex: 1, justifyContent: "center" }}
            onClick={() => onReferrerTypeChange("dsa")}
          >
            Direct from DSA
          </button>
          <button
            type="button"
            className={`btn ${form.referredByType === "lead" ? "btn-primary" : ""}`}
            style={{ flex: 1, justifyContent: "center" }}
            onClick={() => onReferrerTypeChange("lead")}
            disabled={eligibleClients.length === 0}
          >
            Referral from Client
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 500 }}>
              {form.referredByType === "dsa" ? "Select DSA" : "Select Referring Client"}
            </label>
            {form.referredByType === "dsa" ? (
              <select className="input" style={{ marginTop: 5 }} value={form.referredById} onChange={e => onReferrerIdChange(e.target.value)}>
                <option value="">Unassigned</option>
                {dsas.map(d => <option key={d.id} value={d.id}>{d.name} ({d.territory})</option>)}
              </select>
            ) : (
              <select className="input" style={{ marginTop: 5 }} value={form.referredById} onChange={e => onReferrerIdChange(e.target.value)}>
                {eligibleClients.length === 0 && <option value="">No clients available</option>}
                {eligibleClients.map(c => <option key={c.id} value={c.id}>{c.customerName} (Tier {c.tier})</option>)}
              </select>
            )}
          </div>
          <div style={{ width: 130 }}>
            <label style={{ fontSize: 12, fontWeight: 500 }}>Commission %</label>
            <input className="input" style={{ marginTop: 5 }} type="number" min="0" step="0.1" value={form.commissionRate} onChange={e => setForm({ ...form, commissionRate: e.target.value })} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 500 }}>Stage</label>
            <select className="input" style={{ marginTop: 5 }} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 500 }}>Lead date</label>
            <input className="input" style={{ marginTop: 5 }} type="date" value={form.leadDate} onChange={e => setForm({ ...form, leadDate: e.target.value })} />
          </div>
        </div>

        <label style={{ fontSize: 12, fontWeight: 500 }}>Remarks (optional)</label>
        <input className="input" style={{ margin: "5px 0 6px" }} value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} />

        {err && <div style={{ color: "#D6483D", fontSize: 12.5, marginTop: 8 }}>{err}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit}>{lead.id ? "Save changes" : "Add lead"}</button>
        </div>
      </div>
    </div>
  );
}

function Commissions({ leads, dsas, canManage, canExport, onTogglePaid }) {
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
        <h2 style={{ margin: 0, fontSize: 22 }}>Partner Commissions</h2>
        {canExport && (
          <button className="btn" onClick={exportCommissions}>
            <Download size={14} style={{ marginRight: 6 }} /> Export (.xlsx)
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
        <StatCard icon={<IndianRupee size={16} />} label="Pending Payout" value={inr(totalPending)} accent="#D6483D" />
        <StatCard icon={<CheckCircle2 size={16} />} label="Paid Out" value={inr(totalPaid)} accent="#10b981" />
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Customer</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>DSA Network</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Tier</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Deal Value</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Rate</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Commission</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Status</th>
              {canManage && <th style={{ textAlign: "right", padding: "10px 12px" }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {wonLeads.map(l => (
              <tr key={l.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "10px 12px", fontWeight: 500 }}>{l.customerName}</td>
                <td style={{ padding: "10px 12px" }}>{dsaName(l.rootDsaId)}</td>
                <td style={{ padding: "10px 12px" }}>
                  <span className="badge" style={{ background: l.tier === 1 ? "#E4F1FB" : "#F1E9FE", color: l.tier === 1 ? "#0C5A8A" : "#5B32B0" }}>
                    Tier {l.tier}
                  </span>
                </td>
                <td style={{ padding: "10px 12px", fontFamily: "monospace" }}>{inr(l.dealValue)}</td>
                <td style={{ padding: "10px 12px", fontFamily: "monospace" }}>{l.commissionRate}%</td>
                <td style={{ padding: "10px 12px", fontFamily: "monospace", fontWeight: 600 }}>{inr(l.commissionAmount)}</td>
                <td style={{ padding: "10px 12px" }}>
                  <span className="badge" style={{ background: l.commissionPaid ? "#E4F5EA" : "#FDF1DC", color: l.commissionPaid ? "#1F7A4D" : "#96650E" }}>
                    {l.commissionPaid ? "Paid" : "Pending"}
                  </span>
                </td>
                {canManage && (
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    <button className="btn" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => onTogglePaid(l.id)}>
                      Mark {l.commissionPaid ? "Unpaid" : "Paid"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {wonLeads.length === 0 && (
              <tr><td colSpan={canManage ? 8 : 7} style={{ textAlign: "center", padding: 32 }} className="muted">No won deals yet. Commissions appear automatically when leads reach "Won" stage.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NetworkTree({ dsas, leads, canCreateLead, canUpdateLead, onAddReferral, onEditLead }) {
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
        <h2 style={{ margin: 0, fontSize: 22 }}>Referral Network Tree</h2>
        <select className="input" style={{ maxWidth: 220 }} value={dsaFilter} onChange={e => setDsaFilter(e.target.value)}>
          <option value="ALL">All DSAs</option>
          {dsas.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
        Each DSA is the root of their branch. Direct clients are Tier 1; client referrals become Tier 2, Tier 3 downlines. {totalNetworked} of {leads.length} leads connected.
      </div>

      {visibleDsas.map(dsa => (
        <div key={dsa.id} className="card" style={{ padding: 18, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: "var(--primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Users size={16} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14.5 }}>{dsa.name}</div>
              <div className="muted" style={{ fontSize: 11.5 }}>{dsa.territory} · {dsa.commissionRate}% base commission</div>
            </div>
            {canCreateLead && (
              <button className="btn" style={{ marginLeft: "auto", padding: "4px 10px", fontSize: 12 }} onClick={() => onAddReferral({ type: "dsa", id: dsa.id })}>
                <Plus size={13} style={{ marginRight: 4 }} /> Direct Client
              </button>
            )}
          </div>

          <div style={{ paddingLeft: 8 }}>
            {directLeadsOfDsa(dsa.id).map(lead => (
              <LeadNode
                key={lead.id}
                lead={lead}
                depth={0}
                collapsed={collapsed}
                toggle={toggle}
                childrenOfLead={childrenOfLead}
                canCreateLead={canCreateLead}
                canUpdateLead={canUpdateLead}
                onAddReferral={onAddReferral}
                onEditLead={onEditLead}
              />
            ))}
            {directLeadsOfDsa(dsa.id).length === 0 && (
              <div className="muted" style={{ fontSize: 12.5, padding: "6px 0 2px" }}>No direct clients yet.</div>
            )}
          </div>
        </div>
      ))}

      {leads.some(l => !l.rootDsaId) && (
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 10, color: "var(--muted)" }}>Unassigned Leads</div>
          <div style={{ paddingLeft: 8 }}>
            {leads.filter(l => !l.rootDsaId).map(lead => (
              <LeadNode
                key={lead.id}
                lead={lead}
                depth={0}
                collapsed={collapsed}
                toggle={toggle}
                childrenOfLead={childrenOfLead}
                canCreateLead={canCreateLead}
                canUpdateLead={canUpdateLead}
                onAddReferral={onAddReferral}
                onEditLead={onEditLead}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LeadNode({ lead, depth, collapsed, toggle, childrenOfLead, canCreateLead, canUpdateLead, onAddReferral, onEditLead }) {
  const kids = childrenOfLead(lead.id);
  const isCollapsed = collapsed[lead.id];
  const style = STATUS_STYLE[lead.status] || { bg: "#eee", fg: "#333" };

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", gap: 6, padding: "7px 8px", marginLeft: depth * 20,
        borderLeft: depth > 0 ? "2px solid var(--border)" : "none"
      }}>
        {kids.length > 0 ? (
          <button onClick={() => toggle(lead.id)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--muted)", padding: 0, display: "flex" }}>
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
        ) : <span style={{ width: 14 }} />}

        <span style={{ fontSize: 13, fontWeight: 500 }}>{lead.customerName}</span>
        <span className="badge" style={{ background: style.bg, color: style.fg, fontSize: 10 }}>{lead.status}</span>
        <span style={{ fontSize: 11.5, color: "var(--muted)", fontFamily: "monospace" }}>{inr(lead.dealValue)}</span>
        {kids.length > 0 && <span className="muted" style={{ fontSize: 11 }}>· {kids.length} referral{kids.length > 1 ? "s" : ""}</span>}

        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {canCreateLead && (
            <button className="btn" style={{ padding: "2px 6px", fontSize: 11 }} onClick={() => onAddReferral({ type: "lead", id: lead.id })}>
              + Referral
            </button>
          )}
          {canUpdateLead && (
            <button className="btn" style={{ padding: "2px 6px" }} title="Edit" onClick={() => onEditLead(lead)}>
              <Pencil size={11} />
            </button>
          )}
        </div>
      </div>

      {!isCollapsed && kids.map(k => (
        <LeadNode
          key={k.id}
          lead={k}
          depth={depth + 1}
          collapsed={collapsed}
          toggle={toggle}
          childrenOfLead={childrenOfLead}
          canCreateLead={canCreateLead}
          canUpdateLead={canUpdateLead}
          onAddReferral={onAddReferral}
          onEditLead={onEditLead}
        />
      ))}
    </div>
  );
}

function BackupPanel({ dsas, leads, canBackup, canRestore, onRestore }) {
  const fileRef = useRef(null);
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
        setFileErr("Couldn't read file — ensure it is a valid DSA CRM JSON backup.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 22 }}>DSA Channel Backup & Restore</h2>
      <div className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
        Safely export partner and lead records, or restore verified data to the Supabase database.
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {canBackup && (
          <div className="card" style={{ padding: 20, flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <DatabaseBackup size={16} /> Download Backup
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
              Exports all DSA partners and leads ({dsas.length} DSAs, {leads.length} leads) as a JSON file.
            </div>
            <button className="btn btn-primary" onClick={exportBackup}>
              <Download size={14} style={{ marginRight: 6 }} /> Download Backup File
            </button>
          </div>
        )}

        {canRestore && (
          <div className="card" style={{ padding: 20, flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <Upload size={16} /> Restore from Backup
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
              Restores DSAs and leads into the Supabase database. Existing matching records are safely updated.
            </div>
            <input ref={fileRef} type="file" accept="application/json" onChange={handleFile} style={{ display: "none" }} />
            <button className="btn" onClick={() => fileRef.current?.click()}>
              <Upload size={14} style={{ marginRight: 6 }} /> Choose Backup File
            </button>
            {fileErr && <div style={{ color: "#D6483D", fontSize: 12.5, marginTop: 10 }}>{fileErr}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel, danger, onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110 }}>
      <div className="card" style={{ width: 400, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <CircleAlert size={20} color={danger ? "#D6483D" : "var(--primary)"} />
          <h3 style={{ margin: 0 }}>{title}</h3>
        </div>
        <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 20 }}>{message}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            style={danger ? { background: "#D6483D", borderColor: "#D6483D", color: "#fff" } : {}}
            onClick={onConfirm}
          >
            {confirmLabel || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
