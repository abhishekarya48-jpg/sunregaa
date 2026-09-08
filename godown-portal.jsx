import React, { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import {
  Package, TrendingUp, TrendingDown, AlertTriangle, Plus, Search,
  X, ClipboardList, LayoutDashboard, ArrowDownToLine, ArrowUpFromLine,
  Trash2, Pencil, Truck, Building2, CircleAlert, CheckCircle2,
  FileDown, DatabaseBackup, Upload, Download
} from "lucide-react";

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

const seedItems = () => ([
  { id: "it1", name: "Solar Module 545W Mono PERC", brand: "Vikram Solar", model: "Somera VSMS-545", spec: "545W", category: "PNL", unit: "Nos", minStock: 50, stock: 120 },
  { id: "it1b", name: "Solar Module 550W Mono PERC", brand: "Waaree", model: "WSM-550", spec: "550W", category: "PNL", unit: "Nos", minStock: 50, stock: 80 },
  { id: "it1c", name: "Solar Module 440W Mono PERC", brand: "Adani Solar", model: "ASM-440", spec: "440W", category: "PNL", unit: "Nos", minStock: 30, stock: 45 },
  { id: "it2", name: "String Inverter 10kW", brand: "Growatt", model: "MOD 10KTL3-X", spec: "10kW", category: "INV", unit: "Nos", minStock: 5, stock: 8 },
  { id: "it2b", name: "String Inverter 5kW", brand: "Solis", model: "S6-GR1P5K", spec: "5kW", category: "INV", unit: "Nos", minStock: 5, stock: 6 },
  { id: "it2c", name: "Central Inverter 100kW", brand: "Sungrow", model: "SG100CX", spec: "100kW", category: "INV", unit: "Nos", minStock: 2, stock: 3 },
  { id: "it3", name: "Rooftop MMS Structure (GI)", brand: "Local Fabrication", model: "GI-Rooftop-Std", spec: "", category: "MMS", unit: "Kg", minStock: 500, stock: 1450 },
  { id: "it4", name: "DC Cable 4 sq mm (Red/Black)", brand: "Polycab", model: "Solar DC 4sqmm", spec: "4 sq mm", category: "CBL", unit: "Meter", minStock: 500, stock: 320 },
  { id: "it5", name: "AC Cable 4 Core Armoured", brand: "Havells", model: "4Cx16 sqmm Armoured", spec: "16 sq mm", category: "CBL", unit: "Meter", minStock: 200, stock: 260 },
  { id: "it6", name: "Earthing Strip GI 25x3mm", brand: "Local Supplier", model: "GI Strip 25x3", spec: "25x3mm", category: "ERT", unit: "Meter", minStock: 100, stock: 40 },
  { id: "it7", name: "Chemical Earthing Kit", brand: "OBO Bettermann", model: "CE Kit Standard", spec: "", category: "ERT", unit: "Set", minStock: 10, stock: 14 },
  { id: "it8", name: "DCDB (String Combiner Box)", brand: "L&T", model: "DCDB-4In-1Out", spec: "4In 1Out", category: "JNB", unit: "Nos", minStock: 5, stock: 6 },
  { id: "it9", name: "ACDB", brand: "L&T", model: "ACDB-1P-32A", spec: "1P 32A", category: "JNB", unit: "Nos", minStock: 5, stock: 3 },
  { id: "it10", name: "MC4 Connector Pair", brand: "Staubli", model: "MC4-EVO 2", spec: "", category: "HDW", unit: "Pair", minStock: 100, stock: 240 },
  { id: "it11", name: "Cable Ties & Clamps", brand: "HTL", model: "Assorted UV-Stabilised", spec: "", category: "HDW", unit: "Box", minStock: 20, stock: 18 },
  { id: "it12", name: "Safety Harness Full Body", brand: "Karam", model: "PN 11", spec: "", category: "SFT", unit: "Nos", minStock: 10, stock: 12 },
]);

function catOf(code) {
  return CATEGORIES.find(c => c.code === code) || CATEGORIES[CATEGORIES.length - 1];
}

function uid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d) {
  try {
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return d; }
}

const STORAGE_KEY = "godown-data-v1";

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

export default function GodownPortal() {
  const [items, setItems] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saveErr, setSaveErr] = useState(false);
  const [tab, setTab] = useState("dashboard");

  const [itemModal, setItemModal] = useState(null); // null | {} | item
  const [toast, setToast] = useState(null);
  const [confirmState, setConfirmState] = useState(null); // { message, onConfirm }

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          setItems(parsed.items || seedItems());
          setTransactions(parsed.transactions || []);
        } else {
          setItems(seedItems());
          setTransactions([]);
        }
      } catch (e) {
        setItems(seedItems());
        setTransactions([]);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const persist = async (nextItems, nextTx) => {
    try {
      const result = await window.storage.set(
        STORAGE_KEY,
        JSON.stringify({ items: nextItems, transactions: nextTx }),
        false
      );
      if (!result) setSaveErr(true);
      else setSaveErr(false);
    } catch (e) {
      setSaveErr(true);
    }
  };

  const showToast = (msg, kind = "success") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2600);
  };

  const updateAll = (nextItems, nextTx) => {
    setItems(nextItems);
    setTransactions(nextTx);
    persist(nextItems, nextTx);
  };

  const saveItem = (item) => {
    let next;
    if (item.id) {
      next = items.map(i => i.id === item.id ? item : i);
    } else {
      next = [...items, { ...item, id: uid("it") }];
    }
    updateAll(next, transactions);
    setItemModal(null);
    showToast(item.id ? "Item updated" : "Item added");
  };

  const deleteItem = (id) => {
    const item = items.find(i => i.id === id);
    setConfirmState({
      title: "Remove item",
      message: `Remove "${item?.name}" from inventory? This also clears its transaction history. This cannot be undone.`,
      confirmLabel: "Remove item",
      danger: true,
      onConfirm: () => {
        updateAll(items.filter(i => i.id !== id), transactions.filter(t => t.itemId !== id));
        showToast("Item removed", "danger");
        setConfirmState(null);
      },
    });
  };

  const restoreBackup = (data) => {
    if (!data || !Array.isArray(data.items) || !Array.isArray(data.transactions)) {
      showToast("That file doesn't look like a valid backup", "danger");
      return;
    }
    setConfirmState({
      title: "Restore backup",
      message: "Restoring will replace all current inventory and transaction data with the backup file. Continue?",
      confirmLabel: "Restore backup",
      danger: true,
      onConfirm: () => {
        updateAll(data.items, data.transactions);
        showToast("Backup restored");
        setConfirmState(null);
      },
    });
  };

  const recordTransaction = (tx) => {
    const item = items.find(i => i.id === tx.itemId);
    if (!item) return;
    if (tx.type === "OUT" && tx.qty > item.stock) {
      showToast(`Only ${item.stock} ${item.unit} available in stock`, "danger");
      return false;
    }
    const nextStock = tx.type === "IN" ? item.stock + tx.qty : item.stock - tx.qty;
    const nextItems = items.map(i => i.id === item.id ? { ...i, stock: nextStock } : i);
    const nextTx = [{ ...tx, id: uid("tx") }, ...transactions];
    updateAll(nextItems, nextTx);
    showToast(tx.type === "IN" ? "Inward entry recorded" : "Outward entry recorded");
    return true;
  };

  const lowStockItems = useMemo(() => items.filter(i => i.stock <= i.minStock), [items]);

  const categoryStock = useMemo(() => {
    const map = {};
    items.forEach(i => { map[i.category] = (map[i.category] || 0) + i.stock; });
    return CATEGORIES.map(c => ({ ...c, total: map[c.code] || 0 })).filter(c => c.total > 0);
  }, [items]);

  const todayTx = useMemo(() => transactions.filter(t => t.date === todayStr()), [transactions]);

  if (!loaded) {
    return <div style={{ padding: 40, fontFamily: "Inter, sans-serif", color: "#5F5E5A" }}>Loading godown records…</div>;
  }

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#F4F2EC", minHeight: 640, display: "flex", color: "#20242B" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');
        .gp-mono { font-family: 'IBM Plex Mono', monospace; }
        .gp-display { font-family: 'Space Grotesk', sans-serif; }
        .gp-navbtn { display:flex; align-items:center; gap:10px; width:100%; padding:11px 16px; border:none; background:transparent; color:#B7BEC9; font-size:14px; font-weight:500; cursor:pointer; border-radius:8px; text-align:left; font-family:'Inter',sans-serif; }
        .gp-navbtn:hover { background:#242E3D; color:#fff; }
        .gp-navbtn.active { background:#E8A33D; color:#1C2530; }
        .gp-btn { display:inline-flex; align-items:center; gap:6px; padding:9px 16px; border-radius:8px; border:1px solid #D3D1C7; background:#fff; font-size:13px; font-weight:500; cursor:pointer; color:#20242B; font-family:'Inter',sans-serif; }
        .gp-btn:hover { border-color:#20242B; }
        .gp-btn-primary { background:#2F6FED; border-color:#2F6FED; color:#fff; }
        .gp-btn-primary:hover { background:#1F5AD1; border-color:#1F5AD1; }
        .gp-card { background:#fff; border-radius:12px; border:1px solid #E7E4DA; }
        .gp-input { width:100%; padding:9px 12px; border-radius:7px; border:1px solid #D3D1C7; font-size:13px; font-family:'Inter',sans-serif; box-sizing:border-box; }
        .gp-input:focus { outline:2px solid #2F6FED33; border-color:#2F6FED; }
        .gp-table th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.04em; color:#888780; padding:9px 12px; border-bottom:1px solid #E7E4DA; font-weight:600; }
        .gp-table td { padding:11px 12px; border-bottom:1px solid #F1EFE8; font-size:13px; }
        .gp-tag { display:inline-block; font-family:'IBM Plex Mono',monospace; font-size:10px; font-weight:600; padding:2px 6px; border-radius:4px; letter-spacing:0.03em; }
      `}</style>

      {/* Sidebar */}
      <div style={{ width: 220, background: "#1C2530", padding: "20px 12px", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "4px 10px 22px" }}>
          <div className="gp-display" style={{ color: "#fff", fontSize: 17, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            <Package size={20} color="#E8A33D" /> Godown Register
          </div>
          <div style={{ color: "#6B7383", fontSize: 11.5, marginTop: 4, marginLeft: 28 }}>Solar EPC · Material Store</div>
        </div>
        <button className={`gp-navbtn ${tab === "dashboard" ? "active" : ""}`} onClick={() => setTab("dashboard")}>
          <LayoutDashboard size={16} /> Dashboard
        </button>
        <button className={`gp-navbtn ${tab === "inventory" ? "active" : ""}`} onClick={() => setTab("inventory")}>
          <ClipboardList size={16} /> Inventory
        </button>
        <button className={`gp-navbtn ${tab === "inward" ? "active" : ""}`} onClick={() => setTab("inward")}>
          <ArrowDownToLine size={16} /> Inward Entry
        </button>
        <button className={`gp-navbtn ${tab === "outward" ? "active" : ""}`} onClick={() => setTab("outward")}>
          <ArrowUpFromLine size={16} /> Outward Entry
        </button>
        <button className={`gp-navbtn ${tab === "ledger" ? "active" : ""}`} onClick={() => setTab("ledger")}>
          <Truck size={16} /> Transaction Ledger
        </button>
        <button className={`gp-navbtn ${tab === "backup" ? "active" : ""}`} onClick={() => setTab("backup")}>
          <DatabaseBackup size={16} /> Backup & Restore
        </button>
        <div style={{ marginTop: "auto", padding: "14px 10px 4px", borderTop: "1px solid #2A3444" }}>
          <div style={{ color: "#6B7383", fontSize: 10.5 }}>
            {saveErr ? "⚠ Changes not saved — check connection" : "All changes saved automatically"}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: "26px 32px", minWidth: 0 }}>
        {tab === "dashboard" && (
          <Dashboard items={items} lowStockItems={lowStockItems} categoryStock={categoryStock} todayTx={todayTx} transactions={transactions} setTab={setTab} />
        )}
        {tab === "inventory" && (
          <Inventory items={items} transactions={transactions} onAdd={(defaultCat) => setItemModal({ category: defaultCat })} onEdit={(it) => setItemModal(it)} onDelete={deleteItem} />
        )}
        {tab === "inward" && (
          <EntryForm mode="IN" items={items} onSubmit={recordTransaction} />
        )}
        {tab === "outward" && (
          <EntryForm mode="OUT" items={items} onSubmit={recordTransaction} />
        )}
        {tab === "ledger" && (
          <Ledger transactions={transactions} items={items} />
        )}
        {tab === "backup" && (
          <BackupPanel items={items} transactions={transactions} onRestore={restoreBackup} />
        )}
      </div>

      {itemModal !== null && (
        <ItemModal item={itemModal} onClose={() => setItemModal(null)} onSave={saveItem} />
      )}

      {confirmState && (
        <ConfirmModal {...confirmState} onCancel={() => setConfirmState(null)} />
      )}

      {toast && (
        <div style={{
          position: "absolute", bottom: 24, right: 24, background: toast.kind === "danger" ? "#D6483D" : "#3E8914",
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
    <div className="gp-card" style={{ padding: "16px 18px", flex: 1, minWidth: 140 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: accent || "#5F5E5A", marginBottom: 8 }}>
        {icon}
        <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</span>
      </div>
      <div className="gp-display" style={{ fontSize: 26, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#888780", marginTop: 2 }}>{sub}</div>}
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
          <h1 className="gp-display" style={{ fontSize: 22, margin: 0 }}>Dashboard</h1>
          <div style={{ color: "#888780", fontSize: 13, marginTop: 3 }}>{fmtDate(new Date())}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
        <StatCard icon={<Package size={16} />} label="SKUs Tracked" value={items.length} sub="Across all categories" />
        <StatCard icon={<AlertTriangle size={16} />} label="Low Stock" value={lowStockItems.length} sub="At or below reorder level" accent={lowStockItems.length ? "#D6483D" : "#5F5E5A"} />
        <StatCard icon={<ArrowDownToLine size={16} />} label="Inward Today" value={inCount} sub="Entries recorded" accent="#3E8914" />
        <StatCard icon={<ArrowUpFromLine size={16} />} label="Outward Today" value={outCount} sub="Dispatched to site" accent="#2F6FED" />
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div className="gp-card" style={{ flex: 1.3, padding: 20 }}>
          <div className="gp-display" style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Stock by category</div>
          {categoryStock.length === 0 && <div style={{ color: "#888780", fontSize: 13 }}>No stock recorded yet.</div>}
          {categoryStock.map(c => (
            <div key={c.code} style={{ marginBottom: 11 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                <span><span className="gp-tag" style={{ background: "#EFEBE0", color: "#5F5E5A", marginRight: 6 }}>{c.code}</span>{c.name}</span>
                <span className="gp-mono" style={{ fontWeight: 600 }}>{c.total}</span>
              </div>
              <div style={{ height: 7, background: "#F1EFE8", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${(c.total / maxCat) * 100}%`, height: "100%", background: "#2F6FED", borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>

        <div className="gp-card" style={{ flex: 1, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div className="gp-display" style={{ fontSize: 14, fontWeight: 600 }}>Reorder alerts</div>
            {lowStockItems.length > 0 && <button className="gp-btn" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setTab("inventory")}>View all</button>}
          </div>
          {lowStockItems.length === 0 && (
            <div style={{ color: "#3E8914", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              <CheckCircle2 size={16} /> All items above minimum level
            </div>
          )}
          {lowStockItems.slice(0, 6).map(i => (
            <div key={i.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F1EFE8", fontSize: 12.5 }}>
              <span>{i.name}</span>
              <span className="gp-mono" style={{ color: "#D6483D", fontWeight: 600 }}>{i.stock}/{i.minStock} {i.unit}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="gp-card" style={{ marginTop: 16, padding: 20 }}>
        <div className="gp-display" style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Recent activity</div>
        {transactions.length === 0 && <div style={{ color: "#888780", fontSize: 13 }}>No transactions logged yet — record an inward or outward entry to get started.</div>}
        {transactions.slice(0, 6).map(t => {
          const item = items.find(i => i.id === t.itemId);
          return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #F1EFE8", fontSize: 12.5 }}>
              {t.type === "IN" ? <TrendingUp size={15} color="#3E8914" /> : <TrendingDown size={15} color="#2F6FED" />}
              <span style={{ flex: 1 }}>{item ? item.name : "Deleted item"}</span>
              <span style={{ color: "#888780" }}>{t.type === "IN" ? t.party : t.site}</span>
              <span className="gp-mono" style={{ fontWeight: 600 }}>{t.type === "IN" ? "+" : "-"}{t.qty}</span>
              <span style={{ color: "#B4B2A9", width: 78, textAlign: "right" }}>{fmtDate(t.date)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Inventory({ items, transactions, onAdd, onEdit, onDelete }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("PNL");

  const countFor = (code) => items.filter(i => i.category === code).length;
  const visibleCats = CATEGORIES.filter(c => countFor(c.code) > 0 || c.code === cat);

  const filtered = items.filter(i =>
    (cat === "ALL" || i.category === cat) &&
    i.name.toLowerCase().includes(q.toLowerCase())
  );

  const activeCat = cat === "ALL" ? null : catOf(cat);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 className="gp-display" style={{ fontSize: 22, margin: 0 }}>Inventory</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="gp-btn" onClick={() => exportInventoryExcel(filtered)}><Download size={15} /> Export {activeCat ? "this list" : "all"} (.xlsx)</button>
          <button className="gp-btn gp-btn-primary" onClick={() => onAdd(cat === "ALL" ? undefined : cat)}><Plus size={15} /> Add item</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        <button
          onClick={() => setCat("ALL")}
          className="gp-btn"
          style={{ padding: "6px 12px", fontSize: 12.5, ...(cat === "ALL" ? { background: "#1C2530", color: "#fff", borderColor: "#1C2530" } : {}) }}
        >
          All items <span className="gp-mono" style={{ opacity: 0.7 }}>({items.length})</span>
        </button>
        {visibleCats.map(c => (
          <button
            key={c.code}
            onClick={() => setCat(c.code)}
            className="gp-btn"
            style={{ padding: "6px 12px", fontSize: 12.5, ...(cat === c.code ? { background: "#E8A33D", color: "#1C2530", borderColor: "#E8A33D" } : {}) }}
          >
            {c.name} <span className="gp-mono" style={{ opacity: 0.7 }}>({countFor(c.code)})</span>
          </button>
        ))}
      </div>

      <div style={{ position: "relative", flex: 1, maxWidth: 320, marginBottom: 16 }}>
        <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: "#888780" }} />
        <input className="gp-input" style={{ paddingLeft: 32 }} placeholder={`Search ${activeCat ? activeCat.name.toLowerCase() : "items"}…`} value={q} onChange={e => setQ(e.target.value)} />
      </div>

      <div className="gp-card" style={{ overflow: "hidden" }}>
        <table className="gp-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th>Item</th><th>Brand / Model</th><th>Rating / Spec</th>{!activeCat && <th>Category</th>}<th>Stock</th><th>Min level</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(i => {
              const low = i.stock <= i.minStock;
              return (
                <tr key={i.id}>
                  <td style={{ fontWeight: 500 }}>{i.name}</td>
                  <td style={{ color: "#5F5E5A" }}>
                    {i.brand || i.model
                      ? <>{i.brand}{i.brand && i.model ? " · " : ""}<span className="gp-mono" style={{ fontSize: 12 }}>{i.model}</span></>
                      : <span style={{ color: "#B4B2A9" }}>—</span>}
                  </td>
                  <td className="gp-mono" style={{ fontSize: 12 }}>{i.spec || <span style={{ color: "#B4B2A9" }}>—</span>}</td>
                  {!activeCat && <td><span className="gp-tag" style={{ background: "#EFEBE0", color: "#5F5E5A" }}>{i.category}</span> {catOf(i.category).name}</td>}
                  <td className="gp-mono">{i.stock} {i.unit}</td>
                  <td className="gp-mono" style={{ color: "#888780" }}>{i.minStock} {i.unit}</td>
                  <td>
                    {low
                      ? <span style={{ color: "#D6483D", fontWeight: 600, fontSize: 12 }}>Reorder</span>
                      : <span style={{ color: "#3E8914", fontWeight: 600, fontSize: 12 }}>OK</span>}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button className="gp-btn" style={{ padding: 6 }} title="Download Excel" onClick={() => exportItemExcel(i, transactions)}><FileDown size={13} /></button>
                      <button className="gp-btn" style={{ padding: 6 }} title="Edit" onClick={() => onEdit(i)}><Pencil size={13} /></button>
                      <button className="gp-btn" style={{ padding: 6, color: "#D6483D" }} title="Remove" onClick={() => onDelete(i.id)}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={activeCat ? 7 : 8} style={{ textAlign: "center", color: "#888780", padding: 24 }}>
                No items in {activeCat ? activeCat.name.toLowerCase() : "your search"} yet — use "Add item" above to start this list.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel, danger, onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(28,37,48,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 }}>
      <div className="gp-card" style={{ width: 380, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <CircleAlert size={20} color={danger ? "#D6483D" : "#E8A33D"} />
          <div className="gp-display" style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
        </div>
        <div style={{ fontSize: 13.5, color: "#5F5E5A", lineHeight: 1.5, marginBottom: 20 }}>{message}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="gp-btn" onClick={onCancel}>Cancel</button>
          <button
            className="gp-btn"
            style={danger ? { background: "#D6483D", borderColor: "#D6483D", color: "#fff" } : { background: "#2F6FED", borderColor: "#2F6FED", color: "#fff" }}
            onClick={onConfirm}
          >
            {confirmLabel || "Confirm"}
          </button>
        </div>
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
    onSave({ ...form, brand: form.brand.trim(), model: form.model.trim(), spec: form.spec.trim(), minStock: Number(form.minStock) || 0, stock: Number(form.stock) || 0 });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(28,37,48,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div className="gp-card" style={{ width: 420, padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div className="gp-display" style={{ fontSize: 16, fontWeight: 600 }}>{item.id ? "Edit item" : "Add new item"}</div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: "#888780" }}><X size={18} /></button>
        </div>

        <label style={{ fontSize: 12, color: "#5F5E5A", fontWeight: 500 }}>Item name</label>
        <input className="gp-input" style={{ margin: "5px 0 12px" }} value={form.name} onChange={e => { setForm({ ...form, name: e.target.value }); setErr(""); }} placeholder="e.g. Solar Module 545W" />

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "#5F5E5A", fontWeight: 500 }}>Brand</label>
            <input className="gp-input" style={{ marginTop: 5 }} value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} placeholder="e.g. Vikram Solar" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "#5F5E5A", fontWeight: 500 }}>Model</label>
            <input className="gp-input" style={{ marginTop: 5 }} value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} placeholder="e.g. Somera VSMS-545" />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "#5F5E5A", fontWeight: 500 }}>Category</label>
            <select className="gp-input" style={{ marginTop: 5 }} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "#5F5E5A", fontWeight: 500 }}>{specLabel}</label>
            <input className="gp-input" style={{ marginTop: 5 }} value={form.spec} onChange={e => setForm({ ...form, spec: e.target.value })} placeholder={specPlaceholder} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ width: 100 }}>
            <label style={{ fontSize: 12, color: "#5F5E5A", fontWeight: 500 }}>Unit</label>
            <select className="gp-input" style={{ marginTop: 5 }} value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "#5F5E5A", fontWeight: 500 }}>Current stock</label>
            <input className="gp-input" style={{ marginTop: 5 }} type="number" min="0" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "#5F5E5A", fontWeight: 500 }}>Reorder level</label>
            <input className="gp-input" style={{ marginTop: 5 }} type="number" min="0" value={form.minStock} onChange={e => setForm({ ...form, minStock: e.target.value })} />
          </div>
        </div>

        {err && <div style={{ color: "#D6483D", fontSize: 12.5, marginTop: 8 }}>{err}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button className="gp-btn" onClick={onClose}>Cancel</button>
          <button className="gp-btn gp-btn-primary" onClick={submit}>{item.id ? "Save changes" : "Add item"}</button>
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
  const selected = items.find(i => i.id === form.itemId);

  const submit = () => {
    if (!form.itemId) { setErr("Select an item"); return; }
    const qty = Number(form.qty);
    if (!qty || qty <= 0) { setErr("Enter a valid quantity"); return; }
    if (isIn && !form.party.trim()) { setErr("Enter vendor / supplier name"); return; }
    if (!isIn && !form.site.trim()) { setErr("Enter destination site name"); return; }

    const ok = onSubmit({
      itemId: form.itemId,
      type: mode,
      qty,
      party: isIn ? form.party.trim() : "",
      site: !isIn ? form.site.trim() : "",
      refNo: form.refNo.trim(),
      date: form.date,
      remarks: form.remarks.trim(),
    });
    if (ok !== false) {
      setForm({ itemId: items[0]?.id || "", qty: "", party: "", site: "", refNo: "", date: todayStr(), remarks: "" });
      setErr("");
    }
  };

  return (
    <div>
      <h1 className="gp-display" style={{ fontSize: 22, margin: "0 0 4px" }}>{isIn ? "Inward entry" : "Outward entry"}</h1>
      <div style={{ color: "#888780", fontSize: 13, marginBottom: 20 }}>
        {isIn ? "Log material received into the godown from a vendor or supplier." : "Log material dispatched from the godown to a project site."}
      </div>

      <div className="gp-card" style={{ padding: 22, maxWidth: 520 }}>
        <label style={{ fontSize: 12, color: "#5F5E5A", fontWeight: 500 }}>Item</label>
        <select className="gp-input" style={{ margin: "5px 0 14px" }} value={form.itemId} onChange={e => { setForm({ ...form, itemId: e.target.value }); setErr(""); }}>
          {items.map(i => <option key={i.id} value={i.id}>{i.name}{i.brand ? ` — ${i.brand}${i.model ? " " + i.model : ""}` : ""}</option>)}
        </select>

        {selected && (
          <div style={{ fontSize: 12, color: "#888780", marginTop: -8, marginBottom: 14 }}>
            Current stock: <span className="gp-mono" style={{ fontWeight: 600, color: "#20242B" }}>{selected.stock} {selected.unit}</span>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "#5F5E5A", fontWeight: 500 }}>Quantity {selected ? `(${selected.unit})` : ""}</label>
            <input className="gp-input" style={{ marginTop: 5 }} type="number" min="0" value={form.qty} onChange={e => { setForm({ ...form, qty: e.target.value }); setErr(""); }} placeholder="0" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "#5F5E5A", fontWeight: 500 }}>Date</label>
            <input className="gp-input" style={{ marginTop: 5 }} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          </div>
        </div>

        <label style={{ fontSize: 12, color: "#5F5E5A", fontWeight: 500 }}>{isIn ? "Vendor / supplier" : "Destination site"}</label>
        <input className="gp-input" style={{ margin: "5px 0 14px" }}
          value={isIn ? form.party : form.site}
          onChange={e => setForm(isIn ? { ...form, party: e.target.value } : { ...form, site: e.target.value })}
          placeholder={isIn ? "e.g. Vikram Solar Ltd" : "e.g. 50kW Rooftop – Sahnewal"} />

        <label style={{ fontSize: 12, color: "#5F5E5A", fontWeight: 500 }}>{isIn ? "Invoice / challan no." : "Indent / gate pass no."} (optional)</label>
        <input className="gp-input" style={{ margin: "5px 0 14px" }} value={form.refNo} onChange={e => setForm({ ...form, refNo: e.target.value })} />

        <label style={{ fontSize: 12, color: "#5F5E5A", fontWeight: 500 }}>Remarks (optional)</label>
        <input className="gp-input" style={{ margin: "5px 0 6px" }} value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} />

        {err && <div style={{ color: "#D6483D", fontSize: 12.5, marginTop: 10 }}>{err}</div>}

        <button className="gp-btn gp-btn-primary" style={{ marginTop: 16, width: "100%", justifyContent: "center", padding: "10px 0" }} onClick={submit}>
          {isIn ? <ArrowDownToLine size={15} /> : <ArrowUpFromLine size={15} />}
          {isIn ? "Record inward entry" : "Record outward entry"}
        </button>
      </div>
    </div>
  );
}

function BackupPanel({ items, transactions, onRestore }) {
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
        setFileErr("Couldn't read that file — make sure it's a backup .json exported from this portal.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div>
      <h1 className="gp-display" style={{ fontSize: 22, margin: "0 0 4px" }}>Backup & restore</h1>
      <div style={{ color: "#888780", fontSize: 13, marginBottom: 20 }}>
        Keep an offline copy of your inventory and transaction history, or bring it back if this device's data is ever lost.
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div className="gp-card" style={{ padding: 20, flex: 1, minWidth: 260 }}>
          <div className="gp-display" style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
            <DatabaseBackup size={16} /> Download backup
          </div>
          <div style={{ fontSize: 12.5, color: "#888780", marginBottom: 14 }}>
            Saves every item and every inward/outward entry ({items.length} items, {transactions.length} transactions) as a single .json file.
          </div>
          <button className="gp-btn gp-btn-primary" onClick={() => exportBackupJson(items, transactions)}>
            <Download size={15} /> Download backup file
          </button>
        </div>

        <div className="gp-card" style={{ padding: 20, flex: 1, minWidth: 260 }}>
          <div className="gp-display" style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
            <Upload size={16} /> Restore from backup
          </div>
          <div style={{ fontSize: 12.5, color: "#888780", marginBottom: 14 }}>
            Replaces all current data with what's in the backup file. This cannot be undone.
          </div>
          <input ref={fileRef} type="file" accept="application/json" onChange={handleFile} style={{ display: "none" }} />
          <button className="gp-btn" onClick={() => fileRef.current?.click()}>
            <Upload size={15} /> Choose backup file
          </button>
          {fileErr && <div style={{ color: "#D6483D", fontSize: 12.5, marginTop: 10 }}>{fileErr}</div>}
        </div>
      </div>
    </div>
  );
}

function Ledger({ transactions, items }) {
  const [filterType, setFilterType] = useState("ALL");
  const [q, setQ] = useState("");

  const rows = transactions.filter(t => {
    if (filterType !== "ALL" && t.type !== filterType) return false;
    const item = items.find(i => i.id === t.itemId);
    const hay = `${item?.name || ""} ${t.party} ${t.site} ${t.refNo}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <div>
      <h1 className="gp-display" style={{ fontSize: 22, margin: "0 0 18px" }}>Transaction ledger</h1>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
          <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: "#888780" }} />
          <input className="gp-input" style={{ paddingLeft: 32 }} placeholder="Search item, party, site, ref no…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className="gp-input" style={{ maxWidth: 160 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="ALL">All entries</option>
          <option value="IN">Inward only</option>
          <option value="OUT">Outward only</option>
        </select>
      </div>

      <div className="gp-card" style={{ overflow: "hidden" }}>
        <table className="gp-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th>Date</th><th>Item</th><th>Type</th><th>Qty</th><th>Party / Site</th><th>Ref no.</th><th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(t => {
              const item = items.find(i => i.id === t.itemId);
              return (
                <tr key={t.id}>
                  <td style={{ color: "#888780" }}>{fmtDate(t.date)}</td>
                  <td style={{ fontWeight: 500 }}>{item ? item.name : "Deleted item"}</td>
                  <td>
                    <span className="gp-tag" style={{ background: t.type === "IN" ? "#EAF3DE" : "#E6F1FB", color: t.type === "IN" ? "#27500A" : "#0C447C" }}>
                      {t.type === "IN" ? "INWARD" : "OUTWARD"}
                    </span>
                  </td>
                  <td className="gp-mono">{t.qty} {item?.unit}</td>
                  <td>{t.type === "IN" ? t.party : t.site}</td>
                  <td className="gp-mono" style={{ color: "#888780" }}>{t.refNo || "—"}</td>
                  <td style={{ color: "#888780" }}>{t.remarks || "—"}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: "center", color: "#888780", padding: 24 }}>No transactions found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
