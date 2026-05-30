import React, { useState, useRef, useCallback, useEffect } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import Auth from "./Auth";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:3001";

// ─── UTILITIES ───────────────────────────────────────────────────────────────
const validateEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e).trim());

const renderTemplate = (tpl, vars) =>
  (tpl || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");

const sanitizeColumns = (cols) =>
  cols.map((c) => String(c).replace(/\W+/g, "_").replace(/^_+|_+$/g, ""));

// ─── ICONS (inline SVG subset) ────────────────────────────────────────────────
const Icon = ({ name, size = 18, className = "" }) => {
  const icons = {
    mail: <><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,4 12,13 2,4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93A10 10 0 1 0 4.93 19.07M19.07 4.93l-7.07 7.07"/></>,
    upload: <><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></>,
    table: <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></>,
    template: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></>,
    send: <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    history: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    check: <polyline points="20 6 9 17 4 12"/>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    download: <><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></>,
    zap: <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>,
    alert: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    paperclip: <><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    rocket: <><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></>,
    trash: <><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {icons[name]}
    </svg>
  );
};

// ─── DESIGN SYSTEM (LIGHT) ────────────────────────────────────────────────────
const Badge = ({ children, color = "blue" }) => {
  const colors = {
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    green: "bg-green-50 text-green-700 border-green-200",
    red: "bg-red-50 text-red-700 border-red-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    gray: "bg-gray-50 text-gray-600 border-gray-200",
    violet: "bg-violet-50 text-violet-700 border-violet-200",
  };
  return <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colors[color]}`}>{children}</span>;
};

const Card = ({ children, className = "", glow = false }) => (
  <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 p-6 ${glow ? 'ring-2 ring-blue-100 shadow-blue-50' : ''} ${className}`}>{children}</div>
);

const Input = ({ label, ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</label>}
    <input className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" {...props} />
  </div>
);

const Textarea = ({ label, ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</label>}
    <textarea className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all resize-none" {...props} />
  </div>
);

const Select = ({ label, options, ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</label>}
    <select className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" {...props}>
      <option value="">— None —</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

const Button = ({ children, variant = "primary", icon, loading, className = "", ...props }) => {
  const base = "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-gradient-to-r from-blue-600 to-violet-600 text-white hover:from-blue-700 hover:to-violet-700 shadow-md shadow-blue-200/60 hover:shadow-lg hover:shadow-blue-300/60 hover:-translate-y-0.5",
    secondary: "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:border-gray-300 shadow-sm",
    danger: "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100",
    ghost: "text-gray-500 hover:bg-gray-100 hover:text-gray-700",
    success: "bg-green-50 text-green-700 border border-green-200 hover:bg-green-100",
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} disabled={loading} {...props}>
      {loading ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : icon}
      {children}
    </button>
  );
};

const StatCard = ({ label, value, sub, icon, color }) => {
  const colors = {
    blue: "from-blue-500 to-blue-600", violet: "from-violet-500 to-violet-600",
    emerald: "from-emerald-500 to-emerald-600", amber: "from-amber-400 to-amber-500",
    red: "from-red-500 to-red-600",
  };
  const bgs = {
    blue: "bg-blue-50", violet: "bg-violet-50", emerald: "bg-emerald-50",
    amber: "bg-amber-50", red: "bg-red-50",
  };
  return (
    <div className={`${bgs[color] || bgs.blue} rounded-2xl border border-white p-5 flex items-start justify-between group hover:shadow-md transition-all duration-300`}>
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{label}</p>
        <p className="text-3xl font-bold text-gray-900">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colors[color] || colors.blue} flex items-center justify-center shadow-md`}>
        <Icon name={icon} size={18} className="text-white" />
      </div>
    </div>
  );
};

const SidebarItem = ({ icon, label, active, onClick, badge }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
      active
        ? "bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-md shadow-blue-200/50"
        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
    }`}
  >
    <Icon name={icon} size={16} className={active ? "text-white" : "text-gray-400 group-hover:text-gray-600"} />
    <span className="flex-1 text-left">{label}</span>
    {badge && <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-600'}`}>{badge}</span>}
  </button>
);

// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState(localStorage.getItem('edp_token'));
  const [userEmail, setUserEmail] = useState(localStorage.getItem('edp_user'));
  const [userRole, setUserRole] = useState(localStorage.getItem('edp_role'));

  const handleLogout = useCallback(() => {
    localStorage.removeItem('edp_token');
    localStorage.removeItem('edp_user');
    localStorage.removeItem('edp_role');
    setToken(null);
    setUserEmail(null);
    setUserRole(null);
  }, []);

  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientResult, setNewClientResult] = useState(null);
  const [creatingClient, setCreatingClient] = useState(false);

  const handleCreateClient = async (e) => {
    e.preventDefault();
    setCreatingClient(true);
    setNewClientResult(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ email: newClientEmail })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to create client');
      setNewClientResult({ email: newClientEmail, tempPassword: data.tempPassword });
      setNewClientEmail("");
    } catch (err) {
      setNewClientResult({ error: err.message });
    } finally {
      setCreatingClient(false);
    }
  };

  // Default tab: admin lands on Admin Panel, client lands on data
  const [tab, setTab] = useState(() => {
    const role = localStorage.getItem('edp_role');
    return role === 'admin' ? 'admin' : 'data';
  });
  const [analyticsData, setAnalyticsData] = useState([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [clientList, setClientList] = useState([]);
  const [clientListLoading, setClientListLoading] = useState(false);
  const [data, setData] = useState(null);
  const [columns, setColumns] = useState([]);
  const [emailCol, setEmailCol] = useState("");
  const [nameCol, setNameCol] = useState("");
  const [idCol, setIdCol] = useState("");
  const [pdfFiles, setPdfFiles] = useState([]);
  const [subject, setSubject] = useState("Important Update — {{ Name }}");
  const [bodyWith, setBodyWith] = useState("<p>Dear {{ Name }},</p><p><br></p><p>Please find your document attached.</p><p><br></p><p>Best regards</p>");
  const [bodyWithout, setBodyWithout] = useState("<p>Dear {{ Name }},</p><p><br></p><p>Your document is being prepared and will be sent shortly.</p><p><br></p><p>Best regards</p>");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderPass, setSenderPass] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [rateLimit, setRateLimit] = useState(0.5);
  const [testEmail, setTestEmail] = useState("");
  const [smtpStatus, setSmtpStatus] = useState(null);
  const [smtpLoading, setSmtpLoading] = useState(false);
  const [sendResults, setSendResults] = useState([]);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(0);
  const [sendLog, setSendLog] = useState([]);
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduledSuccess, setScheduledSuccess] = useState(false);
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem("edp_history") || "[]"); } catch { return []; }
  });
  const [search, setSearch] = useState("");
  const [previewIndex, setPreviewIndex] = useState(0);
  const fileRef = useRef();
  const pdfRef = useRef();

  const baseSteps = [
    { id: "data", label: "Recipients", icon: "table" },
    { id: "template", label: "Template", icon: "template" },
    { id: "settings", label: "Settings", icon: "settings" },
    { id: "dispatch", label: "Dispatch", icon: "rocket" },
    { id: "history", label: "History", icon: "history" },
    { id: "analytics", label: "Analytics", icon: "eye" },
  ];
  const steps = userRole === 'admin' ? [{ id: "admin", label: "Admin Panel", icon: "users" }, ...baseSteps] : baseSteps;

  // Parse uploaded spreadsheet
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const isCsv = file.name.endsWith(".csv");
    if (isCsv) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: ({ data: rows, meta }) => {
          const cols = sanitizeColumns(meta.fields || []);
          const cleaned = rows.map((row) => {
            const obj = {};
            meta.fields.forEach((orig, i) => { obj[cols[i]] = row[orig]; });
            return obj;
          });
          setData(cleaned);
          setColumns(cols);
          autoSetColumns(cols);
        },
      });
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const wb = XLSX.read(ev.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
        if (!rows.length) return;
        const origCols = Object.keys(rows[0]);
        const cols = sanitizeColumns(origCols);
        const cleaned = rows.map((row) => {
          const obj = {};
          origCols.forEach((orig, i) => { obj[cols[i]] = row[orig]; });
          return obj;
        });
        setData(cleaned);
        setColumns(cols);
        autoSetColumns(cols);
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const autoSetColumns = (cols) => {
    const ec = cols.find((c) => /email/i.test(c)) || cols[0] || "";
    const nc = cols.find((c) => /name/i.test(c)) || "";
    const ic = cols.find((c) => /^(id|enrollment|usn|roll)/i.test(c)) || "";
    setEmailCol(ec);
    setNameCol(nc);
    setIdCol(ic);
  };

  const handlePdfUpload = (e) => {
    const files = Array.from(e.target.files).filter((f) => f.name.endsWith(".pdf"));
    setPdfFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      return [...prev, ...files.filter((f) => !existing.has(f.name))];
    });
  };

  // Audit
  const audit = data
    ? data.map((row) => {
        const email = String(row[emailCol] || "").trim();
        const name = String(row[nameCol] || "").trim();
        const id = String(row[idCol] || "").trim();
        const valid = validateEmail(email);
        const matchKey = [id, name].find((k) => k && pdfFiles.some((f) => f.name.replace(/\.pdf$/i, "").toLowerCase() === k.toLowerCase()));
        const pdfMatch = matchKey ? "Matched ✓" : pdfFiles.length > 0 ? "Missing" : "No PDFs";
        return { email, name, id, valid, pdfMatch };
      })
    : [];

  const validCount = audit.filter((r) => r.valid).length;
  const matchedCount = audit.filter((r) => r.pdfMatch === "Matched ✓").length;

  // Preview
  const previewRow = data?.[previewIndex] ?? {};
  const previewBody = renderTemplate(bodyWith, previewRow);
  const previewSubject = renderTemplate(subject, previewRow);

  // SMTP Test
  const handleTestSmtp = async () => {
    if (!senderEmail || !senderPass) {
      setSmtpStatus({ ok: false, msg: "Enter email and app password first." });
      return;
    }
    setSmtpLoading(true);
    setSmtpStatus(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/test-smtp`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ email: senderEmail, password: senderPass, testTo: testEmail || senderEmail }),
      });
      if (res.status === 401 || res.status === 403) return handleLogout();
      const json = await res.json();
      setSmtpStatus({ ok: json.success, msg: json.message });
    } catch {
      setSmtpStatus({ ok: false, msg: "Cannot reach backend. Is it running?" });
    } finally {
      setSmtpLoading(false);
    }
  };

  // Send bulk
  const handleDispatch = async () => {
    if (!data || !senderEmail || !senderPass) return;
    setSending(true);
    setSendResults([]);
    setSendLog([]);
    setSendProgress(0);

    const formData = new FormData();
    formData.append("email", senderEmail);
    formData.append("password", senderPass);
    formData.append("cc", cc);
    formData.append("bcc", bcc);
    formData.append("subject", subject);
    formData.append("bodyWith", bodyWith);
    formData.append("bodyWithout", bodyWithout);
    formData.append("rateLimit", rateLimit !== undefined ? rateLimit : 0.5);
    if (scheduleTime) {
      formData.append("scheduleTime", new Date(scheduleTime).toISOString());
    }

    const recipients = data.map((row) => ({
      to: String(row[emailCol] || "").trim(),
      name: nameCol ? String(row[nameCol] || "").trim() : "",
      id: idCol ? String(row[idCol] || "").trim() : "",
      templateVars: row,
    }));
    formData.append("recipients", JSON.stringify(recipients));

    for (const file of pdfFiles) {
      formData.append("attachments", file, file.name);
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/send-bulk`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        },
        body: formData,
      });

      if (res.status === 401 || res.status === 403) return handleLogout();

      if (scheduleTime) {
        const json = await res.json();
        if (json.scheduled) {
          setScheduledSuccess(true);
          setSending(false);
        }
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "progress") {
              setSendProgress(Math.round(((evt.index + 1) / evt.total) * 100));
              setSendLog((prev) => [...prev, evt]);
            } else if (evt.type === "done") {
              const sessionEntry = {
                date: new Date().toLocaleString(),
                total: evt.results.length,
                sent: evt.results.filter((r) => r.status === "sent").length,
                failed: evt.results.filter((r) => r.status === "error").length,
                invalid: evt.results.filter((r) => r.status === "invalid").length,
                results: evt.results,
              };
              setHistory((prev) => {
                const updated = [sessionEntry, ...prev].slice(0, 20);
                localStorage.setItem("edp_history", JSON.stringify(updated));
                return updated;
              });
              setSendResults(evt.results);
              setSending(false);
            }
          } catch {}
        }
      }
    } catch (err) {
      setSendLog((prev) => [...prev, { status: "error", to: "—", reason: String(err) }]);
      setSending(false);
    }
  };

  const filteredData = data && search
    ? data.filter((row) => Object.values(row).some((v) => String(v).toLowerCase().includes(search.toLowerCase())))
    : data;

  const downloadResults = () => {
    if (!sendResults.length) return;
    const csv = ["Email,Status,Attachment,Reason", ...sendResults.map((r) => `${r.to},${r.status},${r.attachStatus || ""},${r.reason || ""}`)].join("\n");
    const a = document.createElement("a");
    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    a.download = `dispatch_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  useEffect(() => {
    if (tab === "analytics" && token) {
      setAnalyticsLoading(true);
      fetch(`${BACKEND_URL}/api/analytics`, { headers: { "Authorization": `Bearer ${token}` } })
        .then(res => { if (res.status === 401 || res.status === 403) { handleLogout(); throw new Error('Unauthorized'); } return res.json(); })
        .then(d => { if (d.success) setAnalyticsData(d.analytics); setAnalyticsLoading(false); })
        .catch(() => setAnalyticsLoading(false));
    }
  }, [tab, token, handleLogout]);

  useEffect(() => {
    if (tab === "admin" && userRole === 'admin' && token) {
      setClientListLoading(true);
      fetch(`${BACKEND_URL}/api/admin/clients`, { headers: { "Authorization": `Bearer ${token}` } })
        .then(res => res.json())
        .then(d => { if (d.success) setClientList(d.clients); setClientListLoading(false); })
        .catch(() => setClientListLoading(false));
    }
  }, [tab, userRole, token]);

  // ── Keep-alive ping: prevents Render free tier from spinning down ──
  // Pings the backend every 10 minutes while the app is open in the browser.
  useEffect(() => {
    const ping = () => fetch(`${BACKEND_URL}/api/ping`).catch(() => {});
    ping(); // ping immediately on load
    const interval = setInterval(ping, 10 * 60 * 1000); // every 10 minutes
    return () => clearInterval(interval);
  }, []);

  if (!token) {
    return <Auth onLogin={(t, e, r) => { setToken(t); setUserEmail(e); setUserRole(r); setTab(r === 'admin' ? 'admin' : 'data'); }} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-violet-50/20 flex">

      {/* ── SIDEBAR ───────────────────────────────────────────────────── */}
      <aside className="w-64 min-h-screen bg-white border-r border-gray-100 shadow-sm flex flex-col sticky top-0 h-screen overflow-y-auto">
        {/* Logo */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center shadow-md flex-shrink-0">
              <Icon name="mail" size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-violet-700 leading-none">Deepraj Mail Pro</h1>
              <p className="text-xs text-gray-400 font-medium mt-0.5">by Deepraj Technologies</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          {steps.map(step => (
            <SidebarItem
              key={step.id}
              icon={step.icon}
              label={step.label}
              active={tab === step.id}
              onClick={() => setTab(step.id)}
            />
          ))}
        </nav>

        {/* User Footer */}
        <div className="p-3 border-t border-gray-100">
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-gray-50 mb-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">{userEmail?.[0]?.toUpperCase() || 'U'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-800 truncate">{userEmail}</p>
              <p className="text-xs text-gray-400 capitalize">{userRole || 'client'}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-colors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="bg-white/80 backdrop-blur-sm border-b border-gray-100 px-8 py-4 flex items-center justify-between sticky top-0 z-40">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{steps.find(s => s.id === tab)?.label || 'Dashboard'}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Deepraj Mail Pro &mdash; by Deepraj Technologies</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
              userRole === 'admin' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'
            }`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
              {userRole === 'admin' ? 'Administrator' : 'Client'}
            </span>
          </div>
        </div>

        <main className="flex-1 px-8 py-8 animate-slide-up">

        {/* ── TAB: ADMIN ────────────────────────────────────────────────── */}
        {tab === "admin" && userRole === "admin" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Create Client */}
              <div className="lg:col-span-2">
                <Card glow>
                  <h3 className="font-bold text-gray-800 mb-1 flex items-center gap-2">
                    <Icon name="plus" size={16} className="text-blue-600" /> Provision New Client
                  </h3>
                  <p className="text-xs text-gray-400 mb-4">Admin creates all accounts. No self-signup.</p>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    setCreatingClient(true); setNewClientResult(null);
                    try {
                      const res = await fetch(`${BACKEND_URL}/api/admin/clients`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ email: newClientEmail })
                      });
                      const data = await res.json();
                      if (!res.ok || !data.success) throw new Error(data.message || 'Failed');
                      setNewClientResult({ email: newClientEmail, tempPassword: data.tempPassword });
                      setNewClientEmail('');
                      fetch(`${BACKEND_URL}/api/admin/clients`, { headers: { 'Authorization': `Bearer ${token}` } })
                        .then(r => r.json()).then(d => { if (d.success) setClientList(d.clients); });
                    } catch (err) { setNewClientResult({ error: err.message }); }
                    finally { setCreatingClient(false); }
                  }} className="space-y-4">
                    <Input label="Client Email Address" type="email" required
                      value={newClientEmail} onChange={(e) => setNewClientEmail(e.target.value)}
                      placeholder="client@company.com" />
                    <Button type="submit" loading={creatingClient} icon={<Icon name="plus" size={16} />} className="w-full justify-center">
                      Create Client Account
                    </Button>
                  </form>
                  {newClientResult && !newClientResult.error && (
                    <div className="mt-5 p-4 bg-green-50 border border-green-200 rounded-xl">
                      <p className="flex items-center gap-2 text-green-800 font-semibold mb-2 text-sm"><Icon name="check" size={15}/> Account Created!</p>
                      <p className="text-xs text-green-700 mb-3">Client must reset password on first login.</p>
                      <div className="bg-white border border-green-100 rounded-lg p-3 font-mono text-xs space-y-1.5">
                        <div className="flex justify-between"><span className="text-gray-500">Email:</span><div className="flex items-center gap-1.5"><span className="text-gray-800">{newClientResult.email}</span><button type="button" onClick={() => navigator.clipboard?.writeText(newClientResult.email)} className="text-blue-400 hover:text-blue-600"><Icon name="copy" size={11}/></button></div></div>
                        <div className="flex justify-between"><span className="text-gray-500">Pass:</span><div className="flex items-center gap-1.5"><span className="text-gray-800 font-bold">{newClientResult.tempPassword}</span><button type="button" onClick={() => navigator.clipboard?.writeText(newClientResult.tempPassword)} className="text-blue-400 hover:text-blue-600"><Icon name="copy" size={11}/></button></div></div>
                      </div>
                    </div>
                  )}
                  {newClientResult?.error && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-sm">
                      <Icon name="alert" size={15}/> {newClientResult.error}
                    </div>
                  )}
                </Card>
              </div>
              {/* Client List */}
              <div className="lg:col-span-3">
                <Card>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2"><Icon name="users" size={16} className="text-violet-600"/> All Clients <Badge color="violet">{clientList.length}</Badge></h3>
                  </div>
                  {clientListLoading ? (
                    <div className="py-10 flex justify-center"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/></div>
                  ) : clientList.length === 0 ? (
                    <div className="py-10 text-center text-gray-400 text-sm">No clients yet.</div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-gray-100">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50"><tr>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
                        </tr></thead>
                        <tbody className="divide-y divide-gray-50">
                          {clientList.map((c, i) => (
                            <tr key={i} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 text-gray-800 font-medium">{c.email}</td>
                              <td className="px-4 py-3">{c.mustResetPassword ? <Badge color="amber">Pending Reset</Badge> : <Badge color="green">Active</Badge>}</td>
                              <td className="px-4 py-3 text-gray-400 text-xs">{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: DATA ────────────────────────────────────────────────── */}
        {tab === "data" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Recipients</h2>
              <p className="text-gray-500 text-sm mt-1">Upload your CSV or Excel file with recipient data</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Upload */}
              <Card>
                <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Icon name="upload" size={16} /> Spreadsheet Upload
                </h3>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3 group-hover:bg-blue-100 transition-colors">
                    <Icon name="table" size={22} className="text-blue-500" />
                  </div>
                  <p className="text-sm font-medium text-gray-700">Drop CSV or Excel file</p>
                  <p className="text-xs text-gray-400 mt-1">or click to browse</p>
                  <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileUpload} />
                </div>
                {data && (
                  <div className="mt-4 flex items-center gap-3 p-3 bg-green-50 rounded-xl">
                    <Icon name="check" size={16} className="text-green-600 flex-shrink-0" />
                    <span className="text-sm text-green-700 font-medium">{data.length} rows loaded, {columns.length} columns</span>
                  </div>
                )}
              </Card>

              {/* PDF Attachments */}
              <Card>
                <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Icon name="paperclip" size={16} /> PDF Attachments
                  <Badge color="gray">optional</Badge>
                </h3>
                <div
                  onClick={() => pdfRef.current?.click()}
                  className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-violet-400 hover:bg-violet-50/50 transition-all group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-3 group-hover:bg-violet-100 transition-colors">
                    <Icon name="paperclip" size={22} className="text-violet-500" />
                  </div>
                  <p className="text-sm font-medium text-gray-700">Upload PDF files</p>
                  <p className="text-xs text-gray-400 mt-1">Matched by ID or Name column</p>
                  <input ref={pdfRef} type="file" accept=".pdf" multiple className="hidden" onChange={handlePdfUpload} />
                </div>
                {pdfFiles.length > 0 && (
                  <div className="mt-3 space-y-1.5 max-h-32 overflow-y-auto">
                    {pdfFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                        <span className="text-xs text-gray-600 truncate flex-1">{f.name}</span>
                        <button onClick={() => setPdfFiles((p) => p.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 ml-2">
                          <Icon name="x" size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Column mapping */}
            {columns.length > 0 && (
              <Card>
                <h3 className="font-semibold text-gray-800 mb-4">Column Mapping</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Select label="Email column *" options={columns} value={emailCol} onChange={(e) => setEmailCol(e.target.value)} />
                  <Select label="Name column" options={columns} value={nameCol} onChange={(e) => setNameCol(e.target.value)} />
                  <Select label="ID column (for PDF matching)" options={columns} value={idCol} onChange={(e) => setIdCol(e.target.value)} />
                </div>
              </Card>
            )}

            {/* Data preview */}
            {filteredData && (
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-800">Data Preview</h3>
                  <input
                    type="text"
                    placeholder="Search recipients..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
                  />
                </div>
                <div className="overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {columns.map((c) => <th key={c} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">{c}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredData.slice(0, 8).map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                          {columns.map((c) => <td key={c} className="px-4 py-2.5 text-gray-700 max-w-32 truncate">{String(row[c] ?? "")}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredData.length > 8 && (
                    <div className="px-4 py-2 bg-gray-50 text-xs text-gray-400 text-center border-t border-gray-100">
                      Showing 8 of {filteredData.length} rows
                    </div>
                  )}
                </div>
              </Card>
            )}

            {data && (
              <div className="flex justify-end">
                <Button onClick={() => setTab("template")} icon={<Icon name="template" size={16} />}>
                  Next: Template →
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: TEMPLATE ────────────────────────────────────────────── */}
        {tab === "template" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Email Template</h2>
              <p className="text-gray-500 text-sm mt-1">Use {"{{ column_name }}"} as placeholders</p>
            </div>

            {columns.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {columns.map((c) => (
                  <button
                    key={c}
                    onClick={() => navigator.clipboard?.writeText(`{{ ${c} }}`)}
                    className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-mono hover:bg-blue-100 transition-colors"
                    title="Click to copy"
                  >
                    {"{{ "}{c}{" }}"}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Editor */}
              <div className="space-y-5">
                <Card>
                  <Input label="Subject line" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Your update — {{ Name }}" />
                </Card>
                <Card>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Body — with PDF attachment</label>
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <ReactQuill theme="snow" value={bodyWith} onChange={setBodyWith} className="bg-white [&_.ql-toolbar]:border-none [&_.ql-container]:border-none [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-gray-200 [&_.ql-editor]:min-h-[150px]" />
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Sent when a matching PDF is found. Supports rich text formatting.</p>
                </Card>
                <Card>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Body — without PDF attachment</label>
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <ReactQuill theme="snow" value={bodyWithout} onChange={setBodyWithout} className="bg-white [&_.ql-toolbar]:border-none [&_.ql-container]:border-none [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-gray-200 [&_.ql-editor]:min-h-[150px]" />
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Sent when no matching PDF is found. Supports rich text formatting.</p>
                </Card>
              </div>

              {/* Preview */}
              <div className="space-y-4">
                <Card className="sticky top-24">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                      <Icon name="eye" size={16} /> Live Preview
                    </h3>
                    {data && (
                      <div className="flex items-center gap-2">
                        <button onClick={() => setPreviewIndex(Math.max(0, previewIndex - 1))} className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 text-xs">‹</button>
                        <span className="text-xs text-gray-500">{previewIndex + 1}/{data.length}</span>
                        <button onClick={() => setPreviewIndex(Math.min((data?.length || 1) - 1, previewIndex + 1))} className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 text-xs">›</button>
                      </div>
                    )}
                  </div>
                  {/* Gmail-style preview */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                      <p className="text-xs text-gray-500">Subject</p>
                      <p className="text-sm font-medium text-gray-800 mt-0.5">{previewSubject || "—"}</p>
                    </div>
                    <div className="px-4 py-4">
                      {data ? (
                        <div className="text-sm text-gray-700 leading-relaxed ql-editor px-0 py-0" dangerouslySetInnerHTML={{ __html: previewBody }}></div>
                      ) : (
                        <p className="text-sm text-gray-400 italic">Upload data to see preview</p>
                      )}
                    </div>
                    {pdfFiles.length > 0 && (
                      <div className="px-4 py-3 bg-violet-50 border-t border-violet-100 flex items-center gap-2">
                        <Icon name="paperclip" size={14} className="text-violet-500" />
                        <span className="text-xs text-violet-600">PDF attachment will be matched and included</span>
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setTab("data")}>← Back</Button>
              <Button onClick={() => setTab("settings")} icon={<Icon name="settings" size={16} />}>Next: Settings →</Button>
            </div>
          </div>
        )}

        {/* ── TAB: SETTINGS ────────────────────────────────────────────── */}
        {tab === "settings" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">SMTP Settings</h2>
              <p className="text-gray-500 text-sm mt-1">Your credentials stay in this browser session only</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Icon name="mail" size={16} /> Gmail Credentials
                </h3>
                <div className="space-y-4">
                  <Input
                    label="Gmail address"
                    type="email"
                    placeholder="yourname@gmail.com"
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                  />
                  <Input
                    label="Gmail App Password"
                    type="password"
                    placeholder="xxxx xxxx xxxx xxxx"
                    value={senderPass}
                    onChange={(e) => setSenderPass(e.target.value)}
                  />
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                    <p className="text-xs text-amber-700 font-medium mb-1">How to get an App Password:</p>
                    <ol className="text-xs text-amber-600 space-y-0.5 list-decimal list-inside">
                      <li>Go to Google Account → Security</li>
                      <li>Enable 2-Step Verification</li>
                      <li>Search "App passwords" → Create new</li>
                      <li>Select "Mail" and copy the 16-char password</li>
                    </ol>
                  </div>
                </div>
              </Card>

              <div className="space-y-5">
                <Card>
                  <h3 className="font-semibold text-gray-800 mb-4">CC / BCC</h3>
                  <div className="space-y-3">
                    <Input label="CC (optional)" placeholder="cc@example.com" value={cc} onChange={(e) => setCc(e.target.value)} />
                    <Input label="BCC (optional)" placeholder="bcc@example.com" value={bcc} onChange={(e) => setBcc(e.target.value)} />
                  </div>
                </Card>

                <Card>
                  <h3 className="font-semibold text-gray-800 mb-3">Rate Limiting</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Delay between emails</span>
                      <Badge color="blue">{rateLimit}s</Badge>
                    </div>
                    <input
                      type="range" min="0" max="10" step="0.1" value={rateLimit}
                      onChange={(e) => setRateLimit(parseFloat(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                    <p className="text-xs text-gray-400">Increase to 2–3s for 500+ recipients to avoid spam filters</p>
                  </div>
                </Card>
              </div>
            </div>

            {/* SMTP Test */}
            <Card>
              <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Icon name="zap" size={16} /> Test Connection
              </h3>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <Input label="Send test to" type="email" placeholder={senderEmail || "test@example.com"} value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
                </div>
                <Button onClick={handleTestSmtp} loading={smtpLoading} icon={<Icon name="send" size={16} />}>
                  Send Test
                </Button>
              </div>
              {smtpStatus && (
                <div className={`mt-3 flex items-center gap-2 p-3 rounded-xl ${smtpStatus.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                  <Icon name={smtpStatus.ok ? "check" : "alert"} size={16} />
                  <span className="text-sm font-medium">{smtpStatus.msg}</span>
                </div>
              )}
            </Card>

            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setTab("template")}>← Back</Button>
              <Button onClick={() => setTab("dispatch")} icon={<Icon name="rocket" size={16} />}>Next: Dispatch →</Button>
            </div>
          </div>
        )}

        {/* ── TAB: DISPATCH ────────────────────────────────────────────── */}
        {tab === "dispatch" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Launch Campaign</h2>
              <p className="text-gray-500 text-sm mt-1">Review the audit, then send</p>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Total recipients", value: data?.length ?? 0, color: "blue" },
                { label: "Valid emails", value: validCount, color: "green" },
                { label: "PDFs matched", value: matchedCount, color: "violet" },
                { label: "Missing PDFs", value: data ? (audit.filter((r) => r.pdfMatch === "Missing").length) : 0, color: "amber" },
              ].map((m) => (
                <div key={m.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{m.label}</p>
                  <p className={`text-3xl font-bold mt-1 ${m.color === "blue" ? "text-blue-600" : m.color === "green" ? "text-green-600" : m.color === "violet" ? "text-violet-600" : "text-amber-600"}`}>{m.value}</p>
                </div>
              ))}
            </div>

            {/* Audit table */}
            {audit.length > 0 && (
              <Card className="overflow-hidden">
                <h3 className="font-semibold text-gray-800 mb-4">Pre-flight Audit (first 10)</h3>
                <div className="overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email Valid</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">PDF</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {audit.slice(0, 10).map((r, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 text-gray-700 max-w-48 truncate">{r.email}</td>
                          <td className="px-4 py-2.5 text-gray-600">{r.name || "—"}</td>
                          <td className="px-4 py-2.5">
                            <Badge color={r.valid ? "green" : "red"}>{r.valid ? "✓ Valid" : "✗ Invalid"}</Badge>
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge color={r.pdfMatch === "Matched ✓" ? "green" : r.pdfMatch === "Missing" ? "red" : "gray"}>
                              {r.pdfMatch}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Guards */}
            {!data && <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 flex gap-2"><Icon name="alert" size={16} /><span>Upload recipient data first</span></div>}
            {!senderEmail && <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 flex gap-2"><Icon name="alert" size={16} /><span>Configure SMTP settings first</span></div>}

            {/* Launch */}
            {data && senderEmail && senderPass && !sending && sendResults.length === 0 && !scheduledSuccess && (
              <Card className="text-center py-8">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200">
                  <Icon name="rocket" size={28} className="text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Ready to launch</h3>
                <p className="text-gray-500 text-sm mb-6">{validCount} emails · {matchedCount} with PDF · {rateLimit}s delay</p>
                
                <div className="max-w-xs mx-auto mb-6 text-left">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Schedule Delivery (Optional)</label>
                  <input type="datetime-local" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <Button onClick={handleDispatch} className="mx-auto" icon={<Icon name={scheduleTime ? "history" : "send"} size={16} />}>
                  {scheduleTime ? "Schedule Campaign" : "Launch Campaign Now"}
                </Button>
              </Card>
            )}

            {scheduledSuccess && (
              <Card className="text-center py-16">
                <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <Icon name="check" size={32} className="text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Campaign Scheduled</h3>
                <p className="text-gray-500 mb-6">Your emails will be dispatched automatically at {new Date(scheduleTime).toLocaleString()}</p>
                <Button onClick={() => { setScheduledSuccess(false); setScheduleTime(""); setTab("analytics"); }}>View Analytics</Button>
              </Card>
            )}

            {/* Progress */}
            {sending && (
              <Card>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-800">Sending in progress…</h3>
                    <Badge color="blue">{sendProgress}%</Badge>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full transition-all duration-300" style={{ width: `${sendProgress}%` }} />
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {[...sendLog].reverse().slice(0, 20).map((l, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${l.status === "sent" ? "bg-green-400" : l.status === "error" ? "bg-red-400" : "bg-gray-300"}`} />
                        <span className="text-gray-600 font-mono">{l.to}</span>
                        <span className={`ml-auto font-medium ${l.status === "sent" ? "text-green-600" : l.status === "error" ? "text-red-600" : "text-gray-400"}`}>{l.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}

            {/* Results */}
            {sendResults.length > 0 && !sending && (
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-800">Campaign Complete 🎉</h3>
                  <Button variant="secondary" onClick={downloadResults} icon={<Icon name="download" size={14} />}>Download CSV</Button>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: "Sent", v: sendResults.filter((r) => r.status === "sent").length, c: "green" },
                    { label: "Failed", v: sendResults.filter((r) => r.status === "error").length, c: "red" },
                    { label: "Invalid", v: sendResults.filter((r) => r.status === "invalid").length, c: "amber" },
                  ].map((s) => (
                    <div key={s.label} className={`rounded-xl p-3 text-center ${s.c === "green" ? "bg-green-50" : s.c === "red" ? "bg-red-50" : "bg-amber-50"}`}>
                      <p className={`text-2xl font-bold ${s.c === "green" ? "text-green-700" : s.c === "red" ? "text-red-700" : "text-amber-700"}`}>{s.v}</p>
                      <p className={`text-xs font-medium ${s.c === "green" ? "text-green-600" : s.c === "red" ? "text-red-600" : "text-amber-600"}`}>{s.label}</p>
                    </div>
                  ))}
                </div>
                <Button variant="secondary" onClick={() => { setSendResults([]); setSendLog([]); setSendProgress(0); }} icon={<Icon name="plus" size={14} />}>
                  New Campaign
                </Button>
              </Card>
            )}
          </div>
        )}

        {/* ── TAB: HISTORY ─────────────────────────────────────────────── */}
        {tab === "history" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">History</h2>
                <p className="text-gray-500 text-sm mt-1">Stored locally in your browser</p>
              </div>
              {history.length > 0 && (
                <Button variant="danger" onClick={() => { localStorage.removeItem("edp_history"); setHistory([]); }} icon={<Icon name="trash" size={14} />}>
                  Clear All
                </Button>
              )}
            </div>
            {history.length === 0 ? (
              <Card className="text-center py-16">
                <Icon name="history" size={32} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400">No campaigns yet</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {history.map((h, i) => (
                  <Card key={i}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-gray-800">{h.date}</p>
                        <div className="flex gap-2 mt-2">
                          <Badge color="blue">{h.total} total</Badge>
                          <Badge color="green">{h.sent} sent</Badge>
                          {h.failed > 0 && <Badge color="red">{h.failed} failed</Badge>}
                          {h.invalid > 0 && <Badge color="amber">{h.invalid} invalid</Badge>}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const csv = ["Email,Status,Attachment,Reason", ...(h.results || []).map((r) => `${r.to},${r.status},${r.attachStatus || ""},${r.reason || ""}`)].join("\n");
                          const a = document.createElement("a");
                          a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
                          a.download = `dispatch_${h.date.replace(/\W+/g, "_")}.csv`;
                          a.click();
                        }}
                        className="text-gray-400 hover:text-blue-600 transition-colors"
                        title="Download"
                      >
                        <Icon name="download" size={18} />
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: ANALYTICS ─────────────────────────────────────────────── */}
        {tab === "analytics" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h2>
              <p className="text-gray-500 text-sm mt-1">Track open rates and campaign performance in real-time</p>
            </div>
            
            {analyticsLoading ? (
              <Card className="text-center py-16"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div></Card>
            ) : analyticsData.length === 0 ? (
              <Card className="text-center py-16">
                <Icon name="eye" size={32} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400">No tracking data available yet</p>
              </Card>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0">
                    <p className="text-blue-100 text-sm font-medium">Total Campaigns</p>
                    <p className="text-3xl font-bold mt-1">{analyticsData.length}</p>
                  </Card>
                  <Card className="bg-gradient-to-br from-violet-500 to-violet-600 text-white border-0">
                    <p className="text-violet-100 text-sm font-medium">Total Emails Sent</p>
                    <p className="text-3xl font-bold mt-1">{analyticsData.reduce((acc, c) => acc + c.sent, 0)}</p>
                  </Card>
                  <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-0">
                    <p className="text-emerald-100 text-sm font-medium">Avg Open Rate</p>
                    <p className="text-3xl font-bold mt-1">
                      {Math.round(analyticsData.reduce((acc, c) => acc + (c.sent > 0 ? c.opens/c.sent : 0), 0) / analyticsData.length * 100) || 0}%
                    </p>
                  </Card>
                </div>

                <Card>
                  <h3 className="font-semibold text-gray-800 mb-6">Recent Campaigns Performance</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analyticsData.slice(0, 10).reverse()}>
                        <XAxis dataKey="date" tickFormatter={(v) => new Date(v).toLocaleDateString()} stroke="#9ca3af" fontSize={12} />
                        <YAxis stroke="#9ca3af" fontSize={12} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          labelFormatter={(v) => new Date(v).toLocaleString()}
                        />
                        <Bar dataKey="sent" name="Sent" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="opens" name="Opens" fill="#10b981" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                
                <Card className="overflow-hidden">
                  <h3 className="font-semibold text-gray-800 mb-4">Campaign Details</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                        <tr>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Subject</th>
                          <th className="px-4 py-3 text-right">Sent</th>
                          <th className="px-4 py-3 text-right">Opens</th>
                          <th className="px-4 py-3 text-right">Open Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {analyticsData.map((c) => (
                          <tr key={c.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-600">{new Date(c.date).toLocaleString()}</td>
                            <td className="px-4 py-3 text-gray-900 font-medium">{c.subject}</td>
                            <td className="px-4 py-3 text-right">{c.sent}</td>
                            <td className="px-4 py-3 text-right">{c.opens}</td>
                            <td className="px-4 py-3 text-right">
                              <Badge color={c.openRate > 40 ? "green" : c.openRate > 15 ? "blue" : "gray"}>
                                {c.openRate}%
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            )}
          </div>
        )}
        </main>
      </div>
    </div>
  );
}
