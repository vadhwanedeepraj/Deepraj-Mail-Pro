import React, { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Auth from "./Auth";

// Components & Layout
import Sidebar from "./components/layout/Sidebar";
import TopBar from "./components/layout/TopBar";

// Pages
import AdminPanel from "./pages/AdminPanel";
import RecipientsPage from "./pages/RecipientsPage";
import TemplatePage from "./pages/TemplatePage";
import SettingsPage from "./pages/SettingsPage";
import DispatchPage from "./pages/DispatchPage";
import HistoryPage from "./pages/HistoryPage";
import AnalyticsPage from "./pages/AnalyticsPage";

// Backend URL
const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || window.location.origin).replace(/\/+$/, "");

function MainAppShell() {
  const { userRole, isAuthenticated } = useAuth();

  // Tab routing state
  const [tab, setTab] = useState(() => {
    return userRole === "admin" ? "admin" : "data";
  });

  // State shared across configuration wizard steps
  const [data, setData] = useState(null);
  const [columns, setColumns] = useState([]);
  const [emailCol, setEmailCol] = useState("");
  const [nameCol, setNameCol] = useState("");
  const [idCol, setIdCol] = useState("");
  const [pdfFiles, setPdfFiles] = useState([]);
  
  const [subject, setSubject] = useState("Important Update — {{ Name }}");
  const [bodyWith, setBodyWith] = useState(
    "<p>Dear {{ Name }},</p><p><br></p><p>Please find your document attached.</p><p><br></p><p>Best regards</p>"
  );
  const [bodyWithout, setBodyWithout] = useState(
    "<p>Dear {{ Name }},</p><p><br></p><p>Your document is being prepared and will be sent shortly.</p><p><br></p><p>Best regards</p>"
  );

  const [senderEmail, setSenderEmail] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [rateLimit, setRateLimit] = useState(0.5);
  const [previewIndex, setPreviewIndex] = useState(0);

  // Keep-alive ping to prevent Render free-tier from sleeping
  useEffect(() => {
    const ping = () => fetch(`${BACKEND_URL}/api/ping`).catch(() => {});
    ping();
    const interval = setInterval(ping, 10 * 60 * 1000); // 10 minutes
    return () => clearInterval(interval);
  }, []);

  // Wizard navigation steps
  const baseSteps = [
    { id: "data", label: "Recipients", icon: "table" },
    { id: "template", label: "Template", icon: "template" },
    { id: "settings", label: "Settings", icon: "settings" },
    { id: "dispatch", label: "Dispatch", icon: "rocket" },
    { id: "history", label: "History", icon: "history" },
    { id: "analytics", label: "Analytics", icon: "eye" },
  ];

  const steps = userRole === "admin"
    ? [{ id: "admin", label: "Admin Panel", icon: "users" }, ...baseSteps]
    : baseSteps;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-violet-50/20 flex">
      {/* Sidebar Layout */}
      <Sidebar currentTab={tab} setTab={setTab} steps={steps} />

      {/* Main body wrapper */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar title={steps.find(s => s.id === tab)?.label || "Dashboard"} />

        <main className="flex-1 px-8 py-8 animate-slide-up">
          {tab === "admin" && userRole === "admin" && (
            <AdminPanel backendUrl={BACKEND_URL} />
          )}

          {tab === "data" && (
            <RecipientsPage
              data={data}
              setData={setData}
              columns={columns}
              setColumns={setColumns}
              emailCol={emailCol}
              setEmailCol={setEmailCol}
              nameCol={nameCol}
              setNameCol={setNameCol}
              idCol={idCol}
              setIdCol={setIdCol}
              pdfFiles={pdfFiles}
              setPdfFiles={setPdfFiles}
              onNext={() => setTab("template")}
            />
          )}

          {tab === "template" && (
            <TemplatePage
              columns={columns}
              subject={subject}
              setSubject={setSubject}
              bodyWith={bodyWith}
              setBodyWith={setBodyWith}
              bodyWithout={bodyWithout}
              setBodyWithout={setBodyWithout}
              pdfFiles={pdfFiles}
              data={data}
              previewIndex={previewIndex}
              setPreviewIndex={setPreviewIndex}
              onBack={() => setTab("data")}
              onNext={() => setTab("settings")}
            />
          )}

          {tab === "settings" && (
            <SettingsPage
              backendUrl={BACKEND_URL}
              cc={cc}
              setCc={setCc}
              bcc={bcc}
              setBcc={setBcc}
              rateLimit={rateLimit}
              setRateLimit={setRateLimit}
              senderEmail={senderEmail}
              setSenderEmail={setSenderEmail}
              onBack={() => setTab("template")}
              onNext={() => setTab("dispatch")}
            />
          )}

          {tab === "dispatch" && (
            <DispatchPage
              backendUrl={BACKEND_URL}
              data={data}
              emailCol={emailCol}
              nameCol={nameCol}
              idCol={idCol}
              pdfFiles={pdfFiles}
              subject={subject}
              bodyWith={bodyWith}
              bodyWithout={bodyWithout}
              cc={cc}
              bcc={bcc}
              rateLimit={rateLimit}
              senderEmail={senderEmail}
              onBack={() => setTab("settings")}
              onNavigateToHistory={() => setTab("history")}
            />
          )}

          {tab === "history" && (
            <HistoryPage backendUrl={BACKEND_URL} />
          )}

          {tab === "analytics" && (
            <AnalyticsPage backendUrl={BACKEND_URL} />
          )}
        </main>
      </div>
    </div>
  );
}

function AppWithAuth() {
  const { isAuthenticated, login } = useAuth();

  if (!isAuthenticated) {
    return <Auth onLogin={login} />;
  }

  return <MainAppShell />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppWithAuth />
    </AuthProvider>
  );
}
