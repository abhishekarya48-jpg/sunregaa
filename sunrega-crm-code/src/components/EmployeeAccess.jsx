import React, { useState, useEffect } from "react";
import { ShieldCheck, UserCheck, Check, X, RefreshCw, AlertCircle, Save, CheckSquare, Square } from "lucide-react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { PERMISSION_GROUPS, fetchUserPermissions, saveUserPermissions } from "../lib/operationsApi";

export default function EmployeeAccess() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userPerms, setUserPerms] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });

  const loadUsers = async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("role", { ascending: true })
        .order("full_name", { ascending: true });
      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      setMessage({ text: err.message || "Failed to load team members", type: "danger" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const openConfig = async (user) => {
    setSelectedUser(user);
    setMessage({ text: "", type: "" });
    try {
      const perms = await fetchUserPermissions(user.id);
      setUserPerms(perms);
    } catch (err) {
      setUserPerms([]);
      setMessage({ text: "Could not load current permissions", type: "danger" });
    }
  };

  const togglePermission = (permKey) => {
    setUserPerms((prev) =>
      prev.includes(permKey)
        ? prev.filter((k) => k !== permKey)
        : [...prev, permKey]
    );
  };

  const toggleGroup = (group) => {
    const groupPermKeys = group.permissions.map((p) => p.key);
    const allSelected = groupPermKeys.every((k) => userPerms.includes(k));
    if (allSelected) {
      setUserPerms((prev) => prev.filter((k) => !groupPermKeys.includes(k)));
    } else {
      setUserPerms((prev) => Array.from(new Set([...prev, ...groupPermKeys])));
    }
  };

  const handleSave = async () => {
    if (!selectedUser) return;
    setSaving(true);
    setMessage({ text: "", type: "" });
    try {
      await saveUserPermissions(selectedUser.id, userPerms);
      setMessage({ text: `Permissions updated successfully for ${selectedUser.full_name || selectedUser.email}`, type: "success" });
      setTimeout(() => {
        setSelectedUser(null);
      }, 1200);
    } catch (err) {
      setMessage({ text: err.message || "Failed to save permissions", type: "danger" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="panel" style={{ padding: 40, textAlign: "center" }}>
        <RefreshCw size={24} className="spin" style={{ marginBottom: 12, color: "var(--primary)" }} />
        <p className="muted">Loading employee records...</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>Employee Operations Access</h2>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
            Configure granular permissions for Godown Inventory and DSA Channel CRM for each employee.
          </p>
        </div>
        <button className="btn" onClick={loadUsers}>
          <RefreshCw size={14} style={{ marginRight: 6 }} /> Refresh
        </button>
      </div>

      {message.text && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13.5,
            background: message.type === "danger" ? "#FBE7E5" : "#E4F5EA",
            color: message.type === "danger" ? "#B23B2E" : "#1F7A4D"
          }}
        >
          {message.type === "danger" ? <AlertCircle size={16} /> : <Check size={16} />}
          {message.text}
        </div>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "12px 14px" }}>Employee</th>
              <th style={{ textAlign: "left", padding: "12px 14px" }}>Worker ID</th>
              <th style={{ textAlign: "left", padding: "12px 14px" }}>Designation</th>
              <th style={{ textAlign: "left", padding: "12px 14px" }}>System Role</th>
              <th style={{ textAlign: "left", padding: "12px 14px" }}>Operations Access</th>
              <th style={{ textAlign: "right", padding: "12px 14px" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isAdmin = u.role === "admin";
              return (
                <tr key={u.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 14px" }}>
                    <b>{u.full_name || "—"}</b>
                    {u.phone && <div className="muted" style={{ fontSize: 12 }}>{u.phone}</div>}
                  </td>
                  <td style={{ padding: "12px 14px", fontFamily: "monospace" }}>{u.user_id || u.email}</td>
                  <td style={{ padding: "12px 14px", color: "var(--muted)" }}>{u.designation || "—"}</td>
                  <td style={{ padding: "12px 14px" }}>
                    <span
                      className="badge"
                      style={{
                        background: isAdmin ? "#E4F1FB" : "var(--border)",
                        color: isAdmin ? "#0C5A8A" : "var(--muted)"
                      }}
                    >
                      {isAdmin ? "Administrator" : "Employee"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    {isAdmin ? (
                      <span className="badge badge-success" style={{ background: "#E4F5EA", color: "#1F7A4D" }}>
                        Full Access (Admin)
                      </span>
                    ) : (
                      <span className="muted" style={{ fontSize: 13 }}>Configurable</span>
                    )}
                  </td>
                  <td style={{ padding: "12px 14px", textAlign: "right" }}>
                    {isAdmin ? (
                      <button className="btn" disabled style={{ opacity: 0.6, fontSize: 12, padding: "5px 10px" }}>
                        Auto-Authorized
                      </button>
                    ) : (
                      <button className="btn btn-primary" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => openConfig(u)}>
                        Configure Access
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 32 }} className="muted">
                  No employee profiles found in the database.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Permission Configuration Modal */}
      {selectedUser && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100
          }}
        >
          <div className="card" style={{ width: 560, maxHeight: "90vh", padding: 24, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18 }}>Configure Operations Access</h3>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                  Employee: <b>{selectedUser.full_name || selectedUser.email}</b> ({selectedUser.user_id || selectedUser.email})
                </p>
              </div>
              <button onClick={() => setSelectedUser(null)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--muted)" }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
              {PERMISSION_GROUPS.map((group) => {
                const groupPermKeys = group.permissions.map((p) => p.key);
                const allSelected = groupPermKeys.every((k) => userPerms.includes(k));
                const someSelected = groupPermKeys.some((k) => userPerms.includes(k));

                return (
                  <div key={group.key} style={{ marginBottom: 18, border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", color: "var(--primary)" }}>
                        {group.label}
                      </span>
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: "2px 8px", fontSize: 11 }}
                        onClick={() => toggleGroup(group)}
                      >
                        {allSelected ? "Deselect All" : "Select All"}
                      </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px" }}>
                      {group.permissions.map((perm) => {
                        const checked = userPerms.includes(perm.key);
                        return (
                          <label
                            key={perm.key}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              fontSize: 13,
                              cursor: "pointer",
                              userSelect: "none",
                              padding: "4px 6px",
                              borderRadius: 4,
                              background: checked ? "rgba(15,118,110,0.06)" : "transparent"
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePermission(perm.key)}
                              style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--primary)" }}
                            />
                            <span>{perm.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
              <span className="muted" style={{ fontSize: 12 }}>
                {userPerms.length} permission(s) selected
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" onClick={() => setSelectedUser(null)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  <Save size={14} style={{ marginRight: 6 }} />
                  {saving ? "Saving..." : "Save Permissions"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
