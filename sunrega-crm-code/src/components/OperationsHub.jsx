import React, { useState, useEffect } from "react";
import { Package, Users, ShieldAlert } from "lucide-react";
import GodownPortal from "./GodownPortal";
import DsaCrm from "./DsaCrm";
import { hasUserPermission } from "../lib/operationsApi";

export default function OperationsHub({ profile, permissions = [] }) {
  const isAdmin = profile?.role === "admin";
  
  const canAccessGodown = isAdmin || permissions.some(p => p.startsWith("operations.godown"));
  const canAccessDsa = isAdmin || permissions.some(p => p.startsWith("operations.dsa"));

  const [activeTab, setActiveTab] = useState(() => {
    if (canAccessGodown) return "godown";
    if (canAccessDsa) return "dsa";
    return "none";
  });

  useEffect(() => {
    if (activeTab === "none") {
      if (canAccessGodown) setActiveTab("godown");
      else if (canAccessDsa) setActiveTab("dsa");
    } else if (activeTab === "godown" && !canAccessGodown && canAccessDsa) {
      setActiveTab("dsa");
    } else if (activeTab === "dsa" && !canAccessDsa && canAccessGodown) {
      setActiveTab("godown");
    }
  }, [canAccessGodown, canAccessDsa]);

  if (!canAccessGodown && !canAccessDsa) {
    return (
      <div className="panel" style={{ padding: 48, textAlign: "center" }}>
        <ShieldAlert size={40} color="#D6483D" style={{ marginBottom: 16 }} />
        <h3>Operations Access Restricted</h3>
        <p className="muted" style={{ maxWidth: 460, margin: "8px auto 0" }}>
          You do not have permission to view Operations modules. Please contact an administrator to grant you access in Employee Access.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Tab Switcher if user has access to more than one sub-module */}
      {(canAccessGodown && canAccessDsa) && (
        <div className="ops-tabs">
          <button
            className={`ops-tab-btn ${activeTab === "godown" ? "active" : ""}`}
            onClick={() => setActiveTab("godown")}
          >
            <Package size={17} /> Godown / Inventory
          </button>
          <button
            className={`ops-tab-btn ${activeTab === "dsa" ? "active" : ""}`}
            onClick={() => setActiveTab("dsa")}
          >
            <Users size={17} /> DSA Channel CRM
          </button>
        </div>
      )}

      {activeTab === "godown" && canAccessGodown && (
        <GodownPortal profile={profile} permissions={permissions} />
      )}

      {activeTab === "dsa" && canAccessDsa && (
        <DsaCrm profile={profile} permissions={permissions} />
      )}
    </div>
  );
}
