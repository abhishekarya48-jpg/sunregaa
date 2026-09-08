import React, { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import {
  Package, TrendingUp, TrendingDown, AlertTriangle, Plus, Search,
  X, ClipboardList, LayoutDashboard, ArrowDownToLine, ArrowUpFromLine,
  Trash2, Pencil, Truck, CircleAlert, CheckCircle2,
  FileDown, DatabaseBackup, Upload, Download, RefreshCw
} from "lucide-react";
import {
  fetchInventoryItems, saveInventoryItem, deleteInventoryItem,
  recordInventoryTransaction, fetchInventoryTransactions,
  restoreGodownData, hasUserPermission
} from "../lib/operationsApi";

const CATEGORIES = [
  { code: "PNL", name: "Solar Modules" },
  { code: "INV", name: "Inverters" },
  { code: "MMS", name: "Mounting Structure" },
  { code: "CBL", name: "Cables" },
  { code: "ERT", name: "Earthing" },
  { code: "JNB", name: "Junction Boxes (DCDB/ACDB)" },
  { code: "HDW", name: "Hardware & Fasteners" },
  { code: "SFT", name: "Safety Equipment" },
  { code: "TLS", name: "Tools & Tackles" },
  { code: "OTH", name: "Others" },
];

const UNITS = ["Nos", "Meter", "Kg", "Set", "Box", "Roll", "Pair"];

function catOf(code) {
  return CATEGORIES.find(c => c.code === code) || CATEGORIES[CATEGORIES.length - 1];
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d) {
  try {
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return d; }
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportItemExcel(item, transactions) {
  const itemTx = transactions.filter(t => t.itemId === item.id).slice().reverse();
  const infoSheet = XLSX.utils.aoa_to_sheet([
    ["Item name", item.name],
    ["Brand", item.brand || ""],
    ["Model", item.model || ""],
    ["Rating / Spec", item.spec || ""],
    ["Category", `${item.category} - ${catOf(item.category).name}`],
    ["Unit", item.unit],
    ["Current stock", item.stock],
    ["Reorder level", item.minStock],
  ]);
  const txRows = itemTx.map(t => ({
    Date: fmtDate(t.date),
    Type: t.type === "IN" ? "Inward" : "Outward",
    Quantity: t.qty,
    Unit: item.unit,
    "Party / Site": t.type === "IN" ? t.party : t.site,
    "Ref no.": t.refNo || "",
    Remarks: t.remarks || "",
  }));
  const txSheet = XLSX.utils.json_to_sheet(txRows.length ? txRows : [{ Date: "", Type: "", Quantity: "", Unit: "", "Party / Site": "", "Ref no.": "", Remarks: "" }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, infoSheet, "Item info");
  XLSX.utils.book_append_sheet(wb, txSheet, "Transaction history");
  const safeName = item.name.replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
  XLSX.writeFile(wb, `${safeName}_stock_record.xlsx`);
}

function exportInventoryExcel(items) {
  const rows = items.map(i => ({
    "Item name": i.name,
    Brand: i.brand || "",
    Model: i.model || "",
    "Rating / Spec": i.spec || "",
    "Category code": i.category,
    "Category": catOf(i.category).name,
    Unit: i.unit,
    "Current stock": i.stock,
    "Reorder level": i.minStock,
    Status: i.stock <= i.minStock ? "Reorder" : "OK",
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Inventory");
  XLSX.writeFile(wb, `godown_inventory_${todayStr()}.xlsx`);
}

function exportBackupJson(items, transactions) {
  const payload = JSON.stringify({ items, transactions, exportedAt: new Date().toISOString() }, null, 2);
  downloadBlob(payload, `godown_backup_${todayStr()}.json`, "application/json");
}

export default function GodownPortal({ profile, permissions = [] }) {
  const [items, setItems] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState("dashboard");

  const [itemModal, setItemModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [confirmState, setConfirmState] = useState(null);

  // Granular permission checks
  const canViewInventory = hasUserPermission(profile, permissions, "operations.godown.inventory.view") || hasUserPermission(profile, permissions, "operations.godown.view");
  const canCreateItem = hasUserPermission(profile, permissions, "operations.godown.inventory.create");
  const canUpdateItem = hasUserPermission(profile, permissions, "operations.godown.inventory.update");
  const canDeleteItem = hasUserPermission(profile, permissions, "operations.godown.inventory.delete");
  const canInward = hasUserPermission(profile, permissions, "operations.godown.inward.create");
  const canOutward = hasUserPermission(profile, permissions, "operations.godown.outward.create");
  const canLedger = hasUserPermission(profile, permissions, "operations.godown.ledger.view") || hasUserPermission(profile, permissions, "operations.godown.view");
  const canExport = hasUserPermission(profile, permissions, "operations.godown.export");
  const canBackup = hasUserPermission(profile, permissions, "operations.godown.backup");
  const canRestore = hasUserPermission(profile, permissions, "operations.godown.restore");

  const loadData = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    else setRefreshing(true);
    try {
      const [itData, txData] = await Promise.all([
        fetchInventoryItems(),
        fetchInventoryTransactions()
      ]);
      setItems(itData || []);
      setTransactions(txData || []);
    } catch (err) {
      showToast(err.message || "Failed to load inventory data", "danger");
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

  const handleSaveItem = async (item) => {
    try {
      const saved = await saveInventoryItem(item);
      if (item.id) {
        setItems(prev => prev.map(i => i.id === item.id ? saved : i));
        showToast("Item updated successfully");
      } else {
        setItems(prev => [saved, ...prev]);
        showToast("Item created successfully");
      }
      setItemModal(null);
    } catch (err) {
      showToast(err.message || "Failed to save item", "danger");
    }
  };

  const handleDeleteItem = (id) => {
    const item = items.find(i => i.id === id);
    setConfirmState({
      title: "Remove item",
      message: `Remove "${item?.name}" from inventory? This cannot be undone.`,
      confirmLabel: "Remove item",
      danger: true,
      onConfirm: async () => {
        try {
          await deleteInventoryItem(id);
          setItems(prev => prev.filter(i => i.id !== id));
          setTransactions(prev => prev.filter(t => t.itemId !== id));
          showToast("Item removed", "danger");
        } catch (err) {
          showToast(err.message || "Failed to delete item", "danger");
        } finally {
          setConfirmState(null);
        }
      },
    });
  };

  const handleRecordTransaction = async (tx) => {
    try {
      const result = await recordInventoryTransaction(tx);
      // Refetch items and transactions for exact atomic state
      await loadData(false);
      showToast(tx.type === "IN" ? "Inward entry recorded" : "Outward entry recorded");
      return true;
    } catch (err) {
      showToast(err.message || "Transaction failed", "danger");
      return false;
    }
  };

  const handleRestoreBackup = async (data) => {
    if (!data || !Array.isArray(data.items)) {
      showToast("Invalid backup file: missing items", "danger");
      return;
    }
    setConfirmState({
      title: "Restore backup",
      message: "Restoring will import and merge items from the backup file into the Supabase database. Continue?",
      confirmLabel: "Restore backup",
      danger: true,
      onConfirm: async () => {
        try {
          await restoreGodownData(data);
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

  const lowStockItems = useMemo(() => items.filter(i => i.stock <= i.minStock), [items]);

  const categoryStock = useMemo(() => {
    const map = {};
    items.forEach(i => { map[i.category] = (map[i.category] || 0) + i.stock; });
    return CATEGORIES.map(c => ({ ...c, total: map[c.code] || 0 })).filter(c => c.total > 0);
  }, [items]);

  const todayTx = useMemo(() => transactions.filter(t => t.date === todayStr()), [transactions]);

  if (loading) {
    return (
      <div className="panel" style={{ padding: 40, textAlign: "center" }}>
        <RefreshCw size={24} className="spin" style={{ marginBottom: 12, color: "var(--primary)" }} />
        <p className="muted">Loading Godown Inventory from database...</p>
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
              <Package size={18} /> Godown Portal
            </div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Material Store & Stock</div>
          </div>
          
          <button
            className={`btn-ghost ${tab === "dashboard" ? "active" : ""}`}
            style={{ width: "100%", justifyContent: "flex-start", marginBottom: 4, display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8 }}
            onClick={() => setTab("dashboard")}
          >
            <LayoutDashboard size={16} /> Dashboard
          </button>

          {canViewInventory && (
            <button
              className={`btn-ghost ${tab === "inventory" ? "active" : ""}`}
              style={{ width: "100%", justifyContent: "flex-start", marginBottom: 4, display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8 }}
              onClick={() => setTab("inventory")}
            >
              <ClipboardList size={16} /> Inventory
            </button>
          )}

          {canInward && (
            <button
              className={`btn-ghost ${tab === "inward" ? "active" : ""}`}
              style={{ width: "100%", justifyContent: "flex-start", marginBottom: 4, display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8 }}
              onClick={() => setTab("inward")}
            >
              <ArrowDownToLine size={16} /> Inward Entry
            </button>
          )}

          {canOutward && (
            <button
              className={`btn-ghost ${tab === "outward" ? "active" : ""}`}
              style={{ width: "100%", justifyContent: "flex-start", marginBottom: 4, display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8 }}
              onClick={() => setTab("outward")}
            >
              <ArrowUpFromLine size={16} /> Outward Entry
            </button>
          )}

          {canLedger && (
            <button
              className={`btn-ghost ${tab === "ledger" ? "active" : ""}`}
              style={{ width: "100%", justifyContent: "flex-start", marginBottom: 4, display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8 }}
              onClick={() => setTab("ledger")}
            >
              <Truck size={16} /> Transaction Ledger
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
            items={items}
            lowStockItems={lowStockItems}
            categoryStock={categoryStock}
            todayTx={todayTx}
            transactions={transactions}
            setTab={setTab}
          />
        )}

        {tab === "inventory" && canViewInventory && (
          <Inventory
            items={items}
            transactions={transactions}
            canCreate={canCreateItem}
            canUpdate={canUpdateItem}
            canDelete={canDeleteItem}
            canExport={canExport}
            onAdd={(defaultCat) => setItemModal({ category: defaultCat })}
            onEdit={(it) => setItemModal(it)}
            onDelete={handleDeleteItem}
          />
        )}

        {tab === "inward" && canInward && (
          <EntryForm mode="IN" items={items} onSubmit={handleRecordTransaction} />
        )}

        {tab === "outward" && canOutward && (
          <EntryForm mode="OUT" items={items} onSubmit={handleRecordTransaction} />
        )}

        {tab === "ledger" && canLedger && (
          <Ledger transactions={transactions} items={items} />
        )}

        {tab === "backup" && (canBackup || canRestore) && (
          <BackupPanel
            items={items}
            transactions={transactions}
            canBackup={canBackup}
            canRestore={canRestore}
            onRestore={handleRestoreBackup}
          />
        )}
      </div>

      {itemModal !== null && (
        <ItemModal item={itemModal} onClose={() => setItemModal(null)} onSave={handleSaveItem} />
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
      <div style={{ fontSize: 26, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Dashboard({ items, lowStockItems, categoryStock, todayTx, transactions, setTab }) {
  const maxCat = Math.max(1, ...categoryStock.map(c => c.total));
  const inCount = todayTx.filter(t => t.type === "IN").length;
  const outCount = todayTx.filter(t => t.type === "OUT").length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>Godown Dashboard</h2>
          <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>{fmtDate(new Date())}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
        <StatCard icon={<Package size={16} />} label="SKUs Tracked" value={items.length} sub="Across all categories" />
        <StatCard icon={<AlertTriangle size={16} />} label="Low Stock" value={lowStockItems.length} sub="At or below reorder level" accent={lowStockItems.length ? "#D6483D" : undefined} />
        <StatCard icon={<ArrowDownToLine size={16} />} label="Inward Today" value={inCount} sub="Entries recorded" accent="#10b981" />
        <StatCard icon={<ArrowUpFromLine size={16} />} label="Outward Today" value={outCount} sub="Dispatched to site" accent="#3b82f6" />
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div className="card" style={{ flex: "1.3 1 300px", padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Stock by Category</div>
          {categoryStock.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No stock recorded yet.</div>}
          {categoryStock.map(c => (
            <div key={c.code} style={{ marginBottom: 11 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                <span>
                  <span className="badge" style={{ marginRight: 6, fontSize: 10 }}>{c.code}</span>
                  {c.name}
                </span>
                <span style={{ fontWeight: 600, fontFamily: "monospace" }}>{c.total}</span>
              </div>
              <div style={{ height: 7, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${(c.total / maxCat) * 100}%`, height: "100%", background: "var(--primary)", borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>

        <div className="card" style={{ flex: "1 1 260px", padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Reorder Alerts</div>
            {lowStockItems.length > 0 && (
              <button className="btn" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => setTab("inventory")}>View all</button>
            )}
          </div>
          {lowStockItems.length === 0 && (
            <div style={{ color: "#10b981", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              <CheckCircle2 size={16} /> All items above reorder level
            </div>
          )}
          {lowStockItems.slice(0, 6).map(i => (
            <div key={i.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 12.5 }}>
              <span>{i.name}</span>
              <span style={{ color: "#D6483D", fontWeight: 600, fontFamily: "monospace" }}>{i.stock}/{i.minStock} {i.unit}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Recent Activity</div>
        {transactions.length === 0 && (
          <div className="muted" style={{ fontSize: 13 }}>No transactions logged yet — record an inward or outward entry to get started.</div>
        )}
        {transactions.slice(0, 6).map(t => {
          const item = items.find(i => i.id === t.itemId);
          return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 12.5 }}>
              {t.type === "IN" ? <TrendingUp size={15} color="#10b981" /> : <TrendingDown size={15} color="#3b82f6" />}
              <span style={{ flex: 1, fontWeight: 500 }}>{item ? item.name : "Item record"}</span>
              <span className="muted">{t.type === "IN" ? t.party : t.site}</span>
              <span style={{ fontWeight: 600, fontFamily: "monospace" }}>{t.type === "IN" ? "+" : "-"}{t.qty}</span>
              <span className="muted" style={{ width: 80, textAlign: "right" }}>{fmtDate(t.date)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Inventory({ items, transactions, canCreate, canUpdate, canDelete, canExport, onAdd, onEdit, onDelete }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("ALL");

  const countFor = (code) => items.filter(i => i.category === code).length;
  const visibleCats = CATEGORIES.filter(c => countFor(c.code) > 0 || c.code === cat);

  const filtered = items.filter(i =>
    (cat === "ALL" || i.category === cat) &&
    (i.name.toLowerCase().includes(q.toLowerCase()) ||
     (i.brand && i.brand.toLowerCase().includes(q.toLowerCase())) ||
     (i.model && i.model.toLowerCase().includes(q.toLowerCase())))
  );

  const activeCat = cat === "ALL" ? null : catOf(cat);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 22 }}>Inventory Registry</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {canExport && (
            <button className="btn" onClick={() => exportInventoryExcel(filtered)}>
              <Download size={14} style={{ marginRight: 6 }} /> Export Excel
            </button>
          )}
          {canCreate && (
            <button className="btn btn-primary" onClick={() => onAdd(cat === "ALL" ? undefined : cat)}>
              <Plus size={14} style={{ marginRight: 6 }} /> Add Item
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        <button
          onClick={() => setCat("ALL")}
          className={`btn ${cat === "ALL" ? "btn-primary" : ""}`}
          style={{ padding: "5px 12px", fontSize: 12 }}
        >
          All items <span style={{ opacity: 0.8, fontFamily: "monospace" }}>({items.length})</span>
        </button>
        {visibleCats.map(c => (
          <button
            key={c.code}
            onClick={() => setCat(c.code)}
            className={`btn ${cat === c.code ? "btn-primary" : ""}`}
            style={{ padding: "5px 12px", fontSize: 12 }}
          >
            {c.name} <span style={{ opacity: 0.8, fontFamily: "monospace" }}>({countFor(c.code)})</span>
          </button>
        ))}
      </div>

      <div style={{ position: "relative", maxWidth: 320, marginBottom: 16 }}>
        <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: "var(--muted)" }} />
        <input
          className="input"
          style={{ paddingLeft: 32 }}
          placeholder={`Search ${activeCat ? activeCat.name.toLowerCase() : "items"}…`}
          value={q}
          onChange={e => setQ(e.target.value)}
        />
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Item</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Brand / Model</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Rating / Spec</th>
              {!activeCat && <th style={{ textAlign: "left", padding: "10px 12px" }}>Category</th>}
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Stock</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Reorder Level</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Status</th>
              <th style={{ textAlign: "right", padding: "10px 12px" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(i => {
              const low = i.stock <= i.minStock;
              return (
                <tr key={i.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{i.name}</td>
                  <td style={{ padding: "10px 12px", color: "var(--muted)" }}>
                    {i.brand || i.model ? (
                      <>{i.brand}{i.brand && i.model ? " · " : ""}<span style={{ fontFamily: "monospace", fontSize: 12 }}>{i.model}</span></>
                    ) : "—"}
                  </td>
                  <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 12 }}>{i.spec || "—"}</td>
                  {!activeCat && (
                    <td style={{ padding: "10px 12px" }}>
                      <span className="badge" style={{ marginRight: 6 }}>{i.category}</span>
                      {catOf(i.category).name}
                    </td>
                  )}
                  <td style={{ padding: "10px 12px", fontFamily: "monospace", fontWeight: 600 }}>{i.stock} {i.unit}</td>
                  <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "var(--muted)" }}>{i.minStock} {i.unit}</td>
                  <td style={{ padding: "10px 12px" }}>
                    {low ? (
                      <span className="badge badge-danger" style={{ background: "#FBE7E5", color: "#B23B2E" }}>Reorder</span>
                    ) : (
                      <span className="badge badge-success" style={{ background: "#E4F5EA", color: "#1F7A4D" }}>OK</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      {canExport && (
                        <button className="btn" style={{ padding: 6 }} title="Export Item Ledger" onClick={() => exportItemExcel(i, transactions)}>
                          <FileDown size={13} />
                        </button>
                      )}
                      {canUpdate && (
                        <button className="btn" style={{ padding: 6 }} title="Edit" onClick={() => onEdit(i)}>
                          <Pencil size={13} />
                        </button>
                      )}
                      {canDelete && (
                        <button className="btn" style={{ padding: 6, color: "#D6483D" }} title="Remove" onClick={() => onDelete(i.id)}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={activeCat ? 7 : 8} style={{ textAlign: "center", padding: 32 }} className="muted">
                  No items found in this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ItemModal({ item, onClose, onSave }) {
  const [form, setForm] = useState({
    id: item.id || null,
    name: item.name || "",
    brand: item.brand || "",
    model: item.model || "",
    spec: item.spec || "",
    category: item.category || CATEGORIES[0].code,
    unit: item.unit || UNITS[0],
    minStock: item.minStock ?? 0,
    stock: item.stock ?? 0,
  });
  const [err, setErr] = useState("");

  const specLabel = form.category === "PNL" ? "Wattage"
    : form.category === "INV" ? "Capacity (kW)"
    : "Rating / spec";
  const specPlaceholder = form.category === "PNL" ? "e.g. 545W"
    : form.category === "INV" ? "e.g. 10kW"
    : "e.g. 4 sq mm";

  const submit = () => {
    if (!form.name.trim()) { setErr("Item name is required"); return; }
    onSave({
      ...form,
      brand: form.brand.trim(),
      model: form.model.trim(),
      spec: form.spec.trim(),
      minStock: Number(form.minStock) || 0,
      stock: Number(form.stock) || 0
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div className="card" style={{ width: 440, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>{item.id ? "Edit Item" : "Add Inventory Item"}</h3>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--muted)" }}><X size={18} /></button>
        </div>

        <label style={{ fontSize: 12, fontWeight: 500 }}>Item name</label>
        <input className="input" style={{ margin: "5px 0 12px" }} value={form.name} onChange={e => { setForm({ ...form, name: e.target.value }); setErr(""); }} placeholder="e.g. Solar Module 545W Mono PERC" />

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 500 }}>Brand</label>
            <input className="input" style={{ marginTop: 5 }} value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} placeholder="e.g. Vikram Solar" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 500 }}>Model</label>
            <input className="input" style={{ marginTop: 5 }} value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} placeholder="e.g. Somera VSMS" />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 500 }}>Category</label>
            <select className="input" style={{ marginTop: 5 }} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 500 }}>{specLabel}</label>
            <input className="input" style={{ marginTop: 5 }} value={form.spec} onChange={e => setForm({ ...form, spec: e.target.value })} placeholder={specPlaceholder} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ width: 120 }}>
            <label style={{ fontSize: 12, fontWeight: 500 }}>Unit</label>
            <select className="input" style={{ marginTop: 5 }} value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 500 }}>Current stock</label>
            <input className="input" style={{ marginTop: 5 }} type="number" min="0" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 500 }}>Reorder level</label>
            <input className="input" style={{ marginTop: 5 }} type="number" min="0" value={form.minStock} onChange={e => setForm({ ...form, minStock: e.target.value })} />
          </div>
        </div>

        {err && <div style={{ color: "#D6483D", fontSize: 12.5, marginTop: 8 }}>{err}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit}>{item.id ? "Save changes" : "Add item"}</button>
        </div>
      </div>
    </div>
  );
}

function EntryForm({ mode, items, onSubmit }) {
  const isIn = mode === "IN";
  const [form, setForm] = useState({
    itemId: items[0]?.id || "",
    qty: "",
    party: "",
    site: "",
    refNo: "",
    date: todayStr(),
    remarks: "",
  });
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const selected = items.find(i => i.id === form.itemId) || items[0];

  const submit = async () => {
    if (!form.itemId && !selected?.id) { setErr("Please select an item"); return; }
    const itemId = form.itemId || selected?.id;
    const qty = Number(form.qty);
    if (!qty || qty <= 0) { setErr("Please enter a valid quantity greater than zero"); return; }
    if (isIn && !form.party.trim()) { setErr("Enter vendor or supplier name"); return; }
    if (!isIn && !form.site.trim()) { setErr("Enter destination site name"); return; }
    if (!isIn && selected && qty > selected.stock) {
      setErr(`Only ${selected.stock} ${selected.unit} available in stock`);
      return;
    }

    setSubmitting(true);
    setErr("");
    const ok = await onSubmit({
      itemId,
      type: mode,
      qty,
      party: isIn ? form.party.trim() : "",
      site: !isIn ? form.site.trim() : "",
      refNo: form.refNo.trim(),
      date: form.date,
      remarks: form.remarks.trim(),
    });
    setSubmitting(false);

    if (ok) {
      setForm({ itemId: selected?.id || "", qty: "", party: "", site: "", refNo: "", date: todayStr(), remarks: "" });
    }
  };

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 22 }}>{isIn ? "Inward Entry" : "Outward Entry"}</h2>
      <div className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
        {isIn
          ? "Record material received from a vendor or supplier. Stock will be increased atomically."
          : "Record material dispatched to a project site. Verified and deducted atomically on the server."}
      </div>

      <div className="card" style={{ padding: 24, maxWidth: 520 }}>
        <label style={{ fontSize: 12, fontWeight: 500 }}>Select Material / Item</label>
        <select
          className="input"
          style={{ margin: "5px 0 14px" }}
          value={form.itemId || selected?.id}
          onChange={e => { setForm({ ...form, itemId: e.target.value }); setErr(""); }}
        >
          {items.map(i => (
            <option key={i.id} value={i.id}>
              {i.name}{i.brand ? ` — ${i.brand}${i.model ? " " + i.model : ""}` : ""} ({i.stock} {i.unit} in stock)
            </option>
          ))}
        </select>

        {selected && (
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: -8, marginBottom: 14 }}>
            Current verified stock: <span style={{ fontWeight: 600, color: "var(--text)", fontFamily: "monospace" }}>{selected.stock} {selected.unit}</span>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 500 }}>Quantity {selected ? `(${selected.unit})` : ""}</label>
            <input
              className="input"
              style={{ marginTop: 5 }}
              type="number"
              min="0.1"
              step="any"
              value={form.qty}
              onChange={e => { setForm({ ...form, qty: e.target.value }); setErr(""); }}
              placeholder="0"
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 500 }}>Transaction Date</label>
            <input
              className="input"
              style={{ marginTop: 5 }}
              type="date"
              value={form.date}
              onChange={e => setForm({ ...form, date: e.target.value })}
            />
          </div>
        </div>

        <label style={{ fontSize: 12, fontWeight: 500 }}>{isIn ? "Vendor / Supplier Name" : "Destination Project / Site"}</label>
        <input
          className="input"
          style={{ margin: "5px 0 14px" }}
          value={isIn ? form.party : form.site}
          onChange={e => setForm(isIn ? { ...form, party: e.target.value } : { ...form, site: e.target.value })}
          placeholder={isIn ? "e.g. Vikram Solar Ltd" : "e.g. 50kW Rooftop – Sahnewal"}
        />

        <label style={{ fontSize: 12, fontWeight: 500 }}>{isIn ? "Invoice / Challan No." : "Indent / Gate Pass No."} (optional)</label>
        <input
          className="input"
          style={{ margin: "5px 0 14px" }}
          value={form.refNo}
          onChange={e => setForm({ ...form, refNo: e.target.value })}
        />

        <label style={{ fontSize: 12, fontWeight: 500 }}>Remarks (optional)</label>
        <input
          className="input"
          style={{ margin: "5px 0 6px" }}
          value={form.remarks}
          onChange={e => setForm({ ...form, remarks: e.target.value })}
        />

        {err && <div style={{ color: "#D6483D", fontSize: 12.5, marginTop: 10 }}>{err}</div>}

        <button
          className="btn btn-primary"
          style={{ marginTop: 18, width: "100%", justifyContent: "center", padding: "10px 0" }}
          onClick={submit}
          disabled={submitting}
        >
          {isIn ? <ArrowDownToLine size={15} style={{ marginRight: 6 }} /> : <ArrowUpFromLine size={15} style={{ marginRight: 6 }} />}
          {submitting ? "Processing Transaction..." : (isIn ? "Record Inward Entry" : "Record Outward Entry")}
        </button>
      </div>
    </div>
  );
}

function Ledger({ transactions, items }) {
  const [q, setQ] = useState("");
  const [filterType, setFilterType] = useState("ALL");

  const itemById = (id) => items.find(i => i.id === id);

  const filtered = transactions.filter(t => {
    const item = itemById(t.itemId);
    const itemName = item ? item.name.toLowerCase() : "";
    const partyOrSite = ((t.type === "IN" ? t.party : t.site) || "").toLowerCase();
    const ref = (t.refNo || "").toLowerCase();
    const query = q.toLowerCase();

    return (filterType === "ALL" || t.type === filterType) &&
      (itemName.includes(query) || partyOrSite.includes(query) || ref.includes(query));
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 22 }}>Transaction Ledger</h2>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div style={{ position: "relative", maxWidth: 300, flex: 1 }}>
          <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: "var(--muted)" }} />
          <input
            className="input"
            style={{ paddingLeft: 32 }}
            placeholder="Search item, party, site, ref..."
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
        <select
          className="input"
          style={{ maxWidth: 160 }}
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
        >
          <option value="ALL">All Transactions</option>
          <option value="IN">Inward Only</option>
          <option value="OUT">Outward Only</option>
        </select>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Date</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Type</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Item</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Quantity</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Party / Site</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Ref No</th>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(t => {
              const item = itemById(t.itemId);
              return (
                <tr key={t.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{fmtDate(t.date)}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <span
                      className="badge"
                      style={{
                        background: t.type === "IN" ? "#E4F5EA" : "#E4F1FB",
                        color: t.type === "IN" ? "#1F7A4D" : "#0C5A8A"
                      }}
                    >
                      {t.type === "IN" ? "INWARD" : "OUTWARD"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>
                    {item ? item.name : <span className="muted">Deleted Item</span>}
                  </td>
                  <td style={{ padding: "10px 12px", fontFamily: "monospace", fontWeight: 600 }}>
                    {t.type === "IN" ? "+" : "-"}{t.qty} {item?.unit || ""}
                  </td>
                  <td style={{ padding: "10px 12px" }}>{t.type === "IN" ? t.party : t.site}</td>
                  <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 12 }}>{t.refNo || "—"}</td>
                  <td style={{ padding: "10px 12px", color: "var(--muted)", fontSize: 12 }}>{t.remarks || "—"}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 32 }} className="muted">
                  No ledger transactions found matching filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BackupPanel({ items, transactions, canBackup, canRestore, onRestore }) {
  const fileRef = useRef(null);
  const [fileErr, setFileErr] = useState("");

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
        setFileErr("Couldn't read file — ensure it is a valid Godown JSON backup.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 22 }}>Godown Backup & Restore</h2>
      <div className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
        Safely export inventory and transaction records, or restore verified items to the database.
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {canBackup && (
          <div className="card" style={{ padding: 20, flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <DatabaseBackup size={16} /> Download Backup
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
              Exports current inventory items and ledger transactions ({items.length} items, {transactions.length} entries) as a JSON file.
            </div>
            <button className="btn btn-primary" onClick={() => exportBackupJson(items, transactions)}>
              <Download size={14} style={{ marginRight: 6 }} /> Download JSON Backup
            </button>
          </div>
        )}

        {canRestore && (
          <div className="card" style={{ padding: 20, flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <Upload size={16} /> Restore from Backup
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
              Imports inventory items safely into Supabase. Existing matching items will be updated.
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
