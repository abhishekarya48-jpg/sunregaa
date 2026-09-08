import React, { useState, useEffect } from "react";
import { ShieldCheck, UserCheck, Check, X, RefreshCw, AlertCircle, Save, CheckSquare, Square, Users, Layers } from "lucide-react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { PERMISSION_GROUPS, fetchUserPermissions, saveUserPermissions, saveBulkUserPermissions } from "../lib/operationsApi";

export default function EmployeeAccess() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [activeModalUsers, setActiveModalUsers] = useState(null); // Array of user objects or null
  const [userPerms, setUserPerms] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });

  const ALL_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));

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
      setSelectedUserIds([]);
    } catch (err) {
      setMessage({ text: err.message || "Failed to load team members", type: "danger" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const nonAdminUsers = users.filter((u) => u.role !== "admin");

  const toggleSelectUser = (userId) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedUserIds.length === nonAdminUsers.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(nonAdminUsers.map((u) => u.id));
    }
  };

  // Open modal for a single user
  const openSingleConfig = async (user) => {
    setActiveModalUsers([user]);
    setMessage({ text: "", type: "" });
    try {
      const perms = await fetchUserPermissions(user.id);
      setUserPerms(perms);
    } catch (err) {
      setUserPerms([]);
      setMessage({ text: "Could not load current permissions for " + (user.full_name || user.email), type: "danger" });
    }
  };

  // Open modal for multiple selected users
  const openBulkConfig = () => {
    const selectedUsers = users.filter((u) => selectedUserIds.includes(u.id));
    if (selectedUsers.length === 0) return;
    setActiveModalUsers(selectedUsers);
    setUserPerms([]);
    setMessage({ text: "", type: "" });
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

  const handleSaveModalPermissions = async () => {
    if (!activeModalUsers || activeModalUsers.length === 0) return;
    setSaving(true);
    setMessage({ text: "", type: "" });
    try {
      const userIds = activeModalUsers.map((u) => u.id);
      await saveBulkUserPermissions(userIds, userPerms);
      
      const count = activeModalUsers.length;
      const nameStr = count === 1 ? (activeModalUsers[0].full_name || activeModalUsers[0].email) : `${count} selected employees`;
      setMessage({ text: `Permissions updated successfully for ${nameStr}`, type: "success" });
      
      setTimeout(() => {
        setActiveModalUsers(null);
        setSelectedUserIds([]);
      }, 1200);
    } catch (err) {
      setMessage({ text: err.message || "Failed to save permissions", type: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const handleQuickGrantAll = async () => {
    if (selectedUserIds.length === 0) return;
    setSaving(true);
    setMessage({ text: "", type: "" });
    try {
      await saveBulkUserPermissions(selectedUserIds, ALL_PERMISSION_KEYS);
      setMessage({ text: `Granted FULL operations permissions to ${selectedUserIds.length} selected employees!`, type: "success" });
      setSelectedUserIds([]);
    } catch (err) {
      setMessage({ text: err.message || "Failed to grant permissions in bulk", type: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const handleQuickRevokeAll = async () => {
    if (selectedUserIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to revoke all operations permissions for ${selectedUserIds.length} selected employee(s)?`)) return;
    setSaving(true);
    setMessage({ text: "", type: "" });
    try {
      await saveBulkUserPermissions(selectedUserIds, []);
      setMessage({ text: `Revoked all operations permissions for ${selectedUserIds.length} selected employees`, type: "success" });
      setSelectedUserIds([]);
    } catch (err) {
      setMessage({ text: err.message || "Failed to revoke permissions in bulk", type: "danger" });
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

  const isAllNonAdminsSelected = nonAdminUsers.length > 0 && selectedUserIds.length === nonAdminUsers.length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>Employee Operations Access</h2>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
            Configure granular permissions for Godown Inventory and DSA Channel CRM individually or for multiple selected users.
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

      {/* Multi-Select Bulk Actions Bar */}
      {selectedUserIds.length > 0 && (
        <div
          style={{
            background: "var(--panel-bg, #F0F4F8)",
            border: "1px solid var(--border)",
            borderLeft: "4px solid var(--primary, #0F766E)",
            borderRadius: 8,
            padding: "12px 18px",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Users size={20} style={{ color: "var(--primary)" }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>
              {selectedUserIds.length} employee(s) selected
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={openBulkConfig} disabled={saving}>
              <Layers size={14} style={{ marginRight: 6 }} />
              Configure Selected ({selectedUserIds.length})
            </button>
            <button className="btn" style={{ fontSize: 13, color: "#1F7A4D", borderColor: "#1F7A4D" }} onClick={handleQuickGrantAll} disabled={saving}>
              <CheckSquare size={14} style={{ marginRight: 6 }} />
              Grant Full Access
            </button>
            <button className="btn" style={{ fontSize: 13, color: "#B23B2E", borderColor: "#B23B2E" }} onClick={handleQuickRevokeAll} disabled={saving}>
              <Square size={14} style={{ marginRight: 6 }} />
              Revoke Access
            </button>
            <button className="btn" style={{ fontSize: 13 }} onClick={() => setSelectedUserIds([])}>
              Clear Selection
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ width: 44, textAlign: "center", padding: "12px 14px" }}>
                <input
                  type="checkbox"
                  checked={isAllNonAdminsSelected}
                  onChange={toggleSelectAll}
                  disabled={nonAdminUsers.length === 0}
                  title="Select / Deselect all employees"
                  style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--primary)" }}
                />
              </th>
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
              const isSelected = selectedUserIds.includes(u.id);

              return (
                <tr
                  key={u.id}
                  style={{
                    borderTop: "1px solid var(--border)",
                    background: isSelected ? "rgba(15,118,110,0.04)" : "transparent"
                  }}
                >
                  <td style={{ textAlign: "center", padding: "12px 14px" }}>
                    {!isAdmin ? (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectUser(u.id)}
                        style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--primary)" }}
                      />
                    ) : (
                      <span className="muted" style={{ fontSize: 11 }}>—</span>
                    )}
                  </td>
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
                      <button className="btn btn-primary" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => openSingleConfig(u)}>
                        Configure Access
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 32 }} className="muted">
                  No employee profiles found in the database.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Permission Configuration Modal (Single or Multi-User) */}
      {activeModalUsers && (
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
          <div className="card" style={{ width: 600, maxHeight: "90vh", padding: 24, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18 }}>
                  {activeModalUsers.length === 1 ? "Configure Operations Access" : `Bulk Operations Access (${activeModalUsers.length} Users)`}
                </h3>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                  {activeModalUsers.length === 1 ? (
                    <>
                      Employee: <b>{activeModalUsers[0].full_name || activeModalUsers[0].email}</b> ({activeModalUsers[0].user_id || activeModalUsers[0].email})
                    </>
                  ) : (
                    <>
                      Target Employees: <b>{activeModalUsers.map((u) => u.full_name || u.email).join(", ")}</b>
                    </>
                  )}
                </p>
              </div>
              <button onClick={() => setActiveModalUsers(null)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--muted)" }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
              {PERMISSION_GROUPS.map((group) => {
                const groupPermKeys = group.permissions.map((p) => p.key);
                const allSelected = groupPermKeys.every((k) => userPerms.includes(k));

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
                <button className="btn" onClick={() => setActiveModalUsers(null)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSaveModalPermissions} disabled={saving}>
                  <Save size={14} style={{ marginRight: 6 }} />
                  {saving ? "Saving..." : activeModalUsers.length === 1 ? "Save Permissions" : `Apply to ${activeModalUsers.length} Users`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
