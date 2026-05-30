import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Icon } from "../components/ui/Icon";
import { AlertModal } from "../components/ui/Modal";
import { validateEmail } from "../utils/validators";

export function DispatchPage({
  backendUrl,
  data,
  emailCol,
  nameCol,
  idCol,
  pdfFiles,
  subject,
  bodyWith,
  bodyWithout,
  cc,
  bcc,
  rateLimit,
  senderEmail,
  onBack,
  onNavigateToHistory
}) {
  const { token, logout } = useAuth();
  
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(0);
  const [sendLog, setSendLog] = useState([]);
  const [sendResults, setSendResults] = useState([]);
  
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduledSuccess, setScheduledSuccess] = useState(false);

  const [alertState, setAlertState] = useState({ isOpen: false, title: "", message: "", type: "info" });

  const showAlert = (title, message, type = "info") => {
    setAlertState({ isOpen: true, title, message, type });
  };

  // Pre-flight Audit list
  const audit = data
    ? data.map((row) => {
        const email = String(row[emailCol] || "").trim();
        const name = nameCol ? String(row[nameCol] || "").trim() : "";
        const id = idCol ? String(row[idCol] || "").trim() : "";
        const valid = validateEmail(email);
        
        const matchKey = [id, name].find((k) =>
          k && pdfFiles.some((f) => f.name.replace(/\.pdf$/i, "").toLowerCase() === k.toLowerCase())
        );
        const pdfMatch = matchKey ? "Matched ✓" : pdfFiles.length > 0 ? "Missing" : "No PDFs";
        return { email, name, id, valid, pdfMatch };
      })
    : [];

  const validCount = audit.filter((r) => r.valid).length;
  const matchedCount = audit.filter((r) => r.pdfMatch === "Matched ✓").length;

  const handleDispatch = async () => {
    if (!data) return;
    setSending(true);
    setSendResults([]);
    setSendLog([]);
    setSendProgress(0);

    const formData = new FormData();
    formData.append("cc", cc);
    formData.append("bcc", bcc);
    formData.append("subject", subject);
    formData.append("bodyWith", bodyWith);
    formData.append("bodyWithout", bodyWithout);
    formData.append("rateLimit", rateLimit !== undefined ? rateLimit : 0.5);
    formData.append("vercelProxyUrl", window.location.origin + "/api/send");
    
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
      const res = await fetch(`${backendUrl}/api/send-bulk`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        },
        body: formData,
      });

      if (res.status === 401 || res.status === 403) {
        logout();
        return;
      }

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || `Server returned error status ${res.status}`);
      }

      if (scheduleTime) {
        const json = await res.json();
        if (json.scheduled) {
          setScheduledSuccess(true);
          setSending(false);
        } else {
          throw new Error(json.message || "Failed to schedule campaign");
        }
        return;
      }

      // Read SSE stream chunks
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let hasFinished = false;

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
              if (evt.index !== undefined && evt.total !== undefined) {
                setSendProgress(Math.round(((evt.index + 1) / evt.total) * 100));
              }
              setSendLog((prev) => [...prev, evt]);
              
              // Handle mid-stream campaign execution errors
              if (evt.status === "error" && (!evt.to || evt.to === "—")) {
                setSending(false);
                showAlert("Campaign Error", evt.reason || "An error occurred during dispatch", "error");
                hasFinished = true;
              }
            } else if (evt.type === "done") {
              setSendResults(evt.results || []);
              setSending(false);
              showAlert("Success", "Campaign dispatch successfully completed!", "success");
              hasFinished = true;
            }
          } catch (_) {}
        }
      }

      if (!hasFinished) {
        setSending(false);
      }
    } catch (err) {
      setSendLog((prev) => [...prev, { status: "error", to: "—", reason: String(err.message || err) }]);
      setSending(false);
      showAlert("Dispatch Failed", err.message, "error");
    }
  };

  const downloadResults = () => {
    if (!sendResults.length) return;
    const csv = ["Email,Status,Attachment,Reason", ...sendResults.map((r) => `${r.to},${r.status},${r.attachStatus || ""},${r.reason || ""}`)].join("\n");
    const a = document.createElement("a");
    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    a.download = `dispatch_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Launch Campaign</h2>
        <p className="text-gray-500 text-sm mt-1">Review the audit, then send</p>
      </div>

      {/* Audit counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total recipients", value: data?.length ?? 0, color: "blue" },
          { label: "Valid emails", value: validCount, color: "green" },
          { label: "PDFs matched", value: matchedCount, color: "violet" },
          { label: "Missing PDFs", value: data ? audit.filter((r) => r.pdfMatch === "Missing").length : 0, color: "amber" },
        ].map((m) => (
          <div key={m.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{m.label}</p>
            <p className={`text-3xl font-bold mt-1 ${
              m.color === "blue" ? "text-blue-600" : m.color === "green" ? "text-green-600" : m.color === "violet" ? "text-violet-600" : "text-amber-600"
            }`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Preflight table */}
      {audit.length > 0 && !sending && sendResults.length === 0 && !scheduledSuccess && (
        <Card className="overflow-hidden">
          <h3 className="font-semibold text-gray-800 mb-4">Pre-flight Audit (first 10)</h3>
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email Valid</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">PDF Match</th>
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

      {/* Validation Warnings */}
      {!data && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 flex gap-2">
          <Icon name="alert" size={16} />
          <span>Upload recipient data first</span>
        </div>
      )}
      {!senderEmail && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 flex gap-2">
          <Icon name="alert" size={16} />
          <span>Configure SMTP settings first</span>
        </div>
      )}

      {/* Launch Action Card */}
      {data && senderEmail && !sending && sendResults.length === 0 && !scheduledSuccess && (
        <Card className="text-center py-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200">
            <Icon name="rocket" size={28} className="text-white" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">Ready to launch</h3>
          <p className="text-gray-500 text-sm mb-6">{validCount} emails · {matchedCount} with PDF · {rateLimit}s delay</p>

          <div className="max-w-xs mx-auto mb-6 text-left">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Schedule Delivery (Optional)</label>
            <input
              type="datetime-local"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <Button onClick={handleDispatch} className="mx-auto" icon={<Icon name={scheduleTime ? "history" : "send"} size={16} />}>
            {scheduleTime ? "Schedule Campaign" : "Launch Campaign Now"}
          </Button>
        </Card>
      )}

      {/* Scheduled Success Layout */}
      {scheduledSuccess && (
        <Card className="text-center py-16 animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-4">
            <Icon name="check" size={32} className="text-green-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Campaign Scheduled</h3>
          <p className="text-gray-500 mb-6">
            Your emails will be dispatched automatically at {new Date(scheduleTime).toLocaleString()}
          </p>
          <Button onClick={onNavigateToHistory}>View Campaigns History</Button>
        </Card>
      )}

      {/* Dispatch Progress Layout */}
      {sending && (
        <Card className="animate-fade-in">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Sending in progress…</h3>
              <Badge color="blue">{sendProgress}%</Badge>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full transition-all duration-300"
                style={{ width: `${sendProgress}%` }}
              />
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {[...sendLog].reverse().slice(0, 20).map((l, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      l.status === "sent" ? "bg-green-400" : l.status === "error" ? "bg-red-400" : "bg-gray-300"
                    }`}
                  />
                  <span className="text-gray-600 font-mono">{l.to}</span>
                  <span
                    className={`ml-auto font-medium ${
                      l.status === "sent" ? "text-green-600" : l.status === "error" ? "text-red-600" : "text-gray-400"
                    }`}
                  >
                    {l.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Completed Results Dashboard */}
      {sendResults.length > 0 && !sending && (
        <Card className="animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">Campaign Complete 🎉</h3>
            <Button variant="secondary" onClick={downloadResults} icon={<Icon name="download" size={14} />}>
              Download CSV Results
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: "Sent", v: sendResults.filter((r) => r.status === "sent").length, c: "green" },
              { label: "Failed", v: sendResults.filter((r) => r.status === "error").length, c: "red" },
              { label: "Invalid", v: sendResults.filter((r) => r.status === "invalid").length, c: "amber" },
            ].map((s) => (
              <div
                key={s.label}
                className={`rounded-xl p-3 text-center ${
                  s.c === "green" ? "bg-green-50" : s.c === "red" ? "bg-red-50" : "bg-amber-50"
                }`}
              >
                <p className={`text-2xl font-bold ${s.c === "green" ? "text-green-700" : s.c === "red" ? "text-red-700" : "text-amber-700"}`}>
                  {s.v}
                </p>
                <p className={`text-xs font-medium ${s.c === "green" ? "text-green-600" : s.c === "red" ? "text-red-600" : "text-amber-600"}`}>
                  {s.label}
                </p>
              </div>
            ))}
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              setSendResults([]);
              setSendLog([]);
              setSendProgress(0);
            }}
            icon={<Icon name="plus" size={14} />}
          >
            New Campaign
          </Button>
        </Card>
      )}

      {!sending && sendResults.length === 0 && !scheduledSuccess && (
        <div className="flex justify-between">
          <Button variant="secondary" onClick={onBack}>
            ← Back
          </Button>
        </div>
      )}

      <AlertModal
        isOpen={alertState.isOpen}
        onClose={() => setAlertState((prev) => ({ ...prev, isOpen: false }))}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
      />
    </div>
  );
}
export default DispatchPage;
