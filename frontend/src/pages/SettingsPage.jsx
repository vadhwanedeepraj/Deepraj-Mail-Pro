import React, { useState, useEffect } from "react";
import { useApi } from "../hooks/useApi";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Icon } from "../components/ui/Icon";
import { AlertModal } from "../components/ui/Modal";

export function SettingsPage({
  backendUrl,
  cc,
  setCc,
  bcc,
  setBcc,
  rateLimit,
  setRateLimit,
  senderEmail,
  setSenderEmail,
  onBack,
  onNext
}) {
  const { request } = useApi();

  const [savedStatus, setSavedStatus] = useState({ saved: false, email: "" });
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Form input fields for saving new SMTP config
  const [smtpEmailInput, setSmtpEmailInput] = useState("");
  const [smtpPasswordInput, setSmtpPasswordInput] = useState("");
  const [savingSmtp, setSavingSmtp] = useState(false);

  // Test connection fields
  const [testEmail, setTestEmail] = useState("");
  const [testSmtpLoading, setTestSmtpLoading] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState(null);

  // Local alert modal state
  const [alertState, setAlertState] = useState({ isOpen: false, title: "", message: "", type: "info" });

  const showAlert = (title, message, type = "info") => {
    setAlertState({ isOpen: true, title, message, type });
  };

  const fetchSmtpStatus = async () => {
    setLoadingStatus(true);
    try {
      const data = await request(`${backendUrl}/api/smtp/status`);
      setSavedStatus(data);
      if (data.saved) {
        setSenderEmail(data.email);
        setSmtpEmailInput(data.email);
      } else {
        setSenderEmail("");
      }
    } catch (_) {
      setSavedStatus({ saved: false, email: "" });
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchSmtpStatus();
  }, [backendUrl]);

  const handleSaveSmtp = async (e) => {
    e.preventDefault();
    if (!smtpEmailInput || !smtpPasswordInput) {
      showAlert("Validation Error", "Email and app password are required to save credentials.", "warning");
      return;
    }
    setSavingSmtp(true);
    try {
      await request(`${backendUrl}/api/smtp/save`, {
        method: "POST",
        body: JSON.stringify({ email: smtpEmailInput, password: smtpPasswordInput })
      });
      setSmtpPasswordInput("");
      showAlert("Success", "SMTP credentials saved and encrypted securely on the server.", "success");
      fetchSmtpStatus();
    } catch (err) {
      showAlert("Save Failed", err.message, "error");
    } finally {
      setSavingSmtp(false);
    }
  };

  const handleClearSmtp = async () => {
    try {
      await request(`${backendUrl}/api/smtp/delete`, {
        method: "DELETE"
      });
      setSmtpEmailInput("");
      setSmtpPasswordInput("");
      showAlert("Cleared", "Your SMTP credentials have been wiped from the database.", "success");
      fetchSmtpStatus();
    } catch (err) {
      showAlert("Error", err.message, "error");
    }
  };

  const handleTestConnection = async () => {
    setTestSmtpLoading(true);
    setSmtpTestResult(null);

    try {
      let url = "";
      let options = { method: "POST" };

      if (savedStatus.saved) {
        // Test connection using DB stored credentials
        url = `${backendUrl}/api/smtp/test`;
        options.body = JSON.stringify({
          testTo: testEmail || savedStatus.email,
          vercelProxyUrl: window.location.origin + "/api/send"
        });
      } else {
        // Test connection directly passing values from state
        if (!smtpEmailInput || !smtpPasswordInput) {
          showAlert("Input Required", "Please enter temporary email and password first, or save them first.", "warning");
          setTestSmtpLoading(false);
          return;
        }
        url = `${backendUrl}/api/smtp/test-direct`;
        options.body = JSON.stringify({
          email: smtpEmailInput,
          password: smtpPasswordInput,
          testTo: testEmail || smtpEmailInput,
          vercelProxyUrl: window.location.origin + "/api/send"
        });
      }

      const data = await request(url, options);
      setSmtpTestResult({ ok: true, msg: data.message });
    } catch (err) {
      setSmtpTestResult({ ok: false, msg: err.message });
    } finally {
      setTestSmtpLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">SMTP Settings</h2>
        <p className="text-gray-500 text-sm mt-1">
          Your credentials are encrypted using AES-256-GCM on the database server.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Saved status / save form */}
        <Card>
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Icon name="mail" size={16} /> Gmail SMTP Authentication
          </h3>

          {loadingStatus ? (
            <div className="py-10 flex justify-center">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : savedStatus.saved ? (
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
                <Icon name="check" size={20} className="text-green-600 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-green-800">SMTP Credentials Locked ✓</p>
                  <p className="text-xs text-green-600 truncate">Sender: {savedStatus.email}</p>
                </div>
              </div>
              <p className="text-xs text-gray-400">
                Emails will be sent using the server-side stored app password. You do not need to re-enter it.
              </p>
              <Button onClick={handleClearSmtp} variant="danger" className="w-full justify-center text-xs py-2">
                Clear Saved Credentials
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSaveSmtp} className="space-y-4 animate-fade-in">
              <Input
                label="Gmail address"
                type="email"
                placeholder="yourname@gmail.com"
                value={smtpEmailInput}
                onChange={(e) => setSmtpEmailInput(e.target.value)}
                required
              />
              <Input
                label="Gmail App Password"
                type="password"
                placeholder="xxxx xxxx xxxx xxxx"
                value={smtpPasswordInput}
                onChange={(e) => setSmtpPasswordInput(e.target.value)}
                required
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
              <Button type="submit" loading={savingSmtp} className="w-full justify-center">
                Save & Encrypt Credentials
              </Button>
            </form>
          )}
        </Card>

        {/* CC / BCC & Rate limit */}
        <div className="space-y-5">
          <Card>
            <h3 className="font-semibold text-gray-800 mb-4">CC / BCC Headers</h3>
            <div className="space-y-3">
              <Input
                label="CC (optional)"
                placeholder="cc@example.com"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
              />
              <Input
                label="BCC (optional)"
                placeholder="bcc@example.com"
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
              />
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
                type="range"
                min="0"
                max="10"
                step="0.1"
                value={rateLimit}
                onChange={(e) => setRateLimit(parseFloat(e.target.value))}
                className="w-full accent-blue-600"
              />
              <p className="text-xs text-gray-400">
                Gmail safe limit is 0.5s. Set higher (2-3s) for large templates.
              </p>
            </div>
          </Card>
        </div>
      </div>

      {/* SMTP Test Connection */}
      <Card>
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Icon name="zap" size={16} /> Test Connection
        </h3>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <Input
              label="Send test email to"
              type="email"
              placeholder={savedStatus.saved ? savedStatus.email : smtpEmailInput || "test@example.com"}
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
          </div>
          <Button onClick={handleTestConnection} loading={testSmtpLoading} icon={<Icon name="send" size={16} />}>
            Send Test
          </Button>
        </div>
        {smtpTestResult && (
          <div
            className={`mt-3 flex items-center gap-2 p-3 rounded-xl animate-fade-in ${
              smtpTestResult.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            <Icon name={smtpTestResult.ok ? "check" : "alert"} size={16} />
            <span className="text-sm font-medium">{smtpTestResult.msg}</span>
          </div>
        )}
      </Card>

      <div className="flex justify-between">
        <Button variant="secondary" onClick={onBack}>
          ← Back
        </Button>
        <Button onClick={onNext} icon={<Icon name="rocket" size={16} />}>
          Next: Dispatch →
        </Button>
      </div>

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
export default SettingsPage;
