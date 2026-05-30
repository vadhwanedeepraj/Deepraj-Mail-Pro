import React, { useState, useEffect, useCallback } from "react";
import { useApi } from "../hooks/useApi";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Icon } from "../components/ui/Icon";
import { ConfirmModal, PromptModal, AlertModal } from "../components/ui/Modal";

export function AdminPanel({ backendUrl }) {
  const { request } = useApi();
  
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientResult, setNewClientResult] = useState(null);
  const [creatingClient, setCreatingClient] = useState(false);
  const [clientList, setClientList] = useState([]);
  const [clientListLoading, setClientListLoading] = useState(false);
  const [activeCampaigns, setActiveCampaigns] = useState([]);

  // Modals state
  const [selectedClient, setSelectedClient] = useState(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isQuotaOpen, setIsQuotaOpen] = useState(false);
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  const [isCancelOpen, setIsCancelOpen] = useState(false);

  const [alertState, setAlertState] = useState({ isOpen: false, title: "", message: "", type: "info" });

  const showAlert = (title, message, type = "info") => {
    setAlertState({ isOpen: true, title, message, type });
  };

  const fetchClients = useCallback(async () => {
    setClientListLoading(true);
    try {
      const data = await request(`${backendUrl}/api/admin/clients`);
      setClientList(data.clients);
    } catch (err) {
      logger.error("Failed to load clients", err.message);
    } finally {
      setClientListLoading(false);
    }
  }, [backendUrl, request]);

  const pollActiveCampaigns = useCallback(async () => {
    try {
      const data = await request(`${backendUrl}/api/admin/active-campaigns`);
      setActiveCampaigns(data.activeCampaigns);
    } catch (_) {}
  }, [backendUrl, request]);

  useEffect(() => {
    fetchClients();
    pollActiveCampaigns();
    const interval = setInterval(pollActiveCampaigns, 3000);
    return () => clearInterval(interval);
  }, [fetchClients, pollActiveCampaigns]);

  const handleCreateClient = async (e) => {
    e.preventDefault();
    setCreatingClient(true);
    setNewClientResult(null);
    try {
      const data = await request(`${backendUrl}/api/admin/clients`, {
        method: "POST",
        body: JSON.stringify({ email: newClientEmail })
      });
      setNewClientResult({ email: newClientEmail, tempPassword: data.tempPassword });
      setNewClientEmail("");
      fetchClients();
    } catch (err) {
      setNewClientResult({ error: err.message });
    } finally {
      setCreatingClient(false);
    }
  };

  const handleToggleStatus = async (client) => {
    try {
      const nextSuspended = !client.isSuspended;
      await request(`${backendUrl}/api/admin/clients/${client.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ isSuspended: nextSuspended })
      });
      fetchClients();
    } catch (err) {
      showAlert("Error", err.message, "error");
    }
  };

  const handleSetQuotaSubmit = async (quotaValue) => {
    const dailyQuota = parseInt(quotaValue, 10);
    if (isNaN(dailyQuota) || dailyQuota < 0) {
      showAlert("Validation Error", "Please enter a valid positive number.", "error");
      return;
    }
    try {
      await request(`${backendUrl}/api/admin/clients/${selectedClient.id}/quota`, {
        method: "PUT",
        body: JSON.stringify({ dailyQuota })
      });
      fetchClients();
      showAlert("Success", `Updated daily quota to ${dailyQuota} for ${selectedClient.email}`, "success");
    } catch (err) {
      showAlert("Error", err.message, "error");
    }
  };

  const handleResetPasswordSubmit = async (newPass) => {
    if (newPass.length < 8) {
      showAlert("Validation Error", "Password must be at least 8 characters long.", "error");
      return;
    }
    try {
      await request(`${backendUrl}/api/admin/clients/${selectedClient.id}/password`, {
        method: "PUT",
        body: JSON.stringify({ password: newPass })
      });
      showAlert("Success", `Password updated successfully for ${selectedClient.email}!`, "success");
      fetchClients();
    } catch (err) {
      showAlert("Error", err.message, "error");
    }
  };

  const handleDeleteClientSubmit = async () => {
    try {
      await request(`${backendUrl}/api/admin/clients/${selectedClient.id}`, {
        method: "DELETE"
      });
      showAlert("Deleted", `Account ${selectedClient.email} deleted successfully.`, "success");
      fetchClients();
    } catch (err) {
      showAlert("Error", err.message, "error");
    }
  };

  const handleCancelCampaignSubmit = async () => {
    try {
      await request(`${backendUrl}/api/admin/campaigns/${selectedCampaignId}/cancel`, {
        method: "POST"
      });
      showAlert("Cancelled", "Cancellation request submitted successfully.", "success");
      pollActiveCampaigns();
    } catch (err) {
      showAlert("Error", err.message, "error");
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Create Client */}
        <div className="lg:col-span-2">
          <Card glow>
            <h3 className="font-bold text-gray-800 mb-1 flex items-center gap-2">
              <Icon name="plus" size={16} className="text-blue-600" /> Provision New Client
            </h3>
            <p className="text-xs text-gray-400 mb-4">Admin creates all accounts. No self-signup.</p>
            <form onSubmit={handleCreateClient} className="space-y-4">
              <Input
                label="Client Email Address"
                type="email"
                required
                value={newClientEmail}
                onChange={(e) => setNewClientEmail(e.target.value)}
                placeholder="client@company.com"
              />
              <Button type="submit" loading={creatingClient} icon={<Icon name="plus" size={16} />} className="w-full justify-center">
                Create Client Account
              </Button>
            </form>
            {newClientResult && !newClientResult.error && (
              <div className="mt-5 p-4 bg-green-50 border border-green-200 rounded-xl animate-fade-in">
                <p className="flex items-center gap-2 text-green-800 font-semibold mb-2 text-sm">
                  <Icon name="check" size={15} /> Account Created!
                </p>
                <p className="text-xs text-green-700 mb-3">Client must reset password on first login.</p>
                <div className="bg-white border border-green-100 rounded-lg p-3 font-mono text-xs space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Email:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-800">{newClientResult.email}</span>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard?.writeText(newClientResult.email)}
                        className="text-blue-400 hover:text-blue-600"
                        title="Copy Email"
                      >
                        <Icon name="copy" size={11} />
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Pass:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-800 font-bold">{newClientResult.tempPassword}</span>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard?.writeText(newClientResult.tempPassword)}
                        className="text-blue-400 hover:text-blue-600"
                        title="Copy Password"
                      >
                        <Icon name="copy" size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {newClientResult?.error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-sm animate-fade-in">
                <Icon name="alert" size={15} /> {newClientResult.error}
              </div>
            )}
          </Card>
        </div>

        {/* Client List */}
        <div className="lg:col-span-3">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <Icon name="users" size={16} className="text-violet-600" /> All Clients{" "}
                <Badge color="violet">{clientList.length}</Badge>
              </h3>
            </div>
            {clientListLoading ? (
              <div className="py-10 flex justify-center">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : clientList.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm">No clients yet.</div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Daily Quota</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {clientList.map((c, i) => (
                      <tr key={i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-800 font-medium truncate max-w-40">{c.email}</td>
                        <td className="px-4 py-3">
                          {c.isSuspended ? (
                            <Badge color="red">Suspended</Badge>
                          ) : c.mustResetPassword ? (
                            <Badge color="amber">Pending Reset</Badge>
                          ) : (
                            <Badge color="green">Active</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600 font-semibold font-mono text-xs">
                          {c.sentToday || 0} / {c.dailyQuota || 200}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">
                          {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => handleToggleStatus(c)}
                              className={`text-xs font-semibold px-2 py-1 rounded-lg border transition-colors ${
                                c.isSuspended
                                  ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                                  : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                              }`}
                            >
                              {c.isSuspended ? "Activate" : "Suspend"}
                            </button>
                            <button
                              onClick={() => {
                                setSelectedClient(c);
                                setIsQuotaOpen(true);
                              }}
                              className="text-xs font-semibold px-2 py-1 rounded-lg border bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 transition-colors"
                            >
                              Quota
                            </button>
                            <button
                              onClick={() => {
                                setSelectedClient(c);
                                setIsPasswordOpen(true);
                              }}
                              className="text-xs font-semibold px-2 py-1 rounded-lg border bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100 transition-colors"
                            >
                              Reset Pass
                            </button>
                            <button
                              onClick={() => {
                                setSelectedClient(c);
                                setIsDeleteOpen(true);
                              }}
                              className="text-xs font-semibold p-1 py-1 rounded-lg border bg-red-50 text-red-600 border-red-200 hover:bg-red-100 transition-colors"
                              title="Delete Client Account"
                            >
                              <Icon name="trash" size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Live Queue Interception Dashboard */}
      <Card>
        <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-4">
          <Icon name="zap" size={16} className="text-blue-600 animate-pulse" /> Live Email Dispatch Queue
        </h3>
        {activeCampaigns.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm flex flex-col items-center justify-center gap-2">
            <Icon name="mail" size={24} className="text-gray-300" />
            No active dispatches currently processing on the server.
          </div>
        ) : (
          <div className="space-y-4">
            {activeCampaigns.map((ac) => {
              const progressPct = ac.total > 0 ? Math.round((ac.progress / ac.total) * 100) : 0;
              return (
                <div
                  key={ac.campaignId}
                  className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in"
                >
                  <div className="space-y-1 flex-grow">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-800">{ac.email}</span>
                      <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-semibold">
                        sending
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 font-medium">
                      Subject: <span className="text-gray-700 font-semibold">{ac.subject}</span>
                    </p>
                    <div className="flex items-center gap-3 w-full max-w-md mt-2">
                      <div className="flex-grow h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full transition-all duration-300"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-gray-600">
                        {ac.progress} / {ac.total} ({progressPct}%)
                      </span>
                    </div>
                    {ac.currentEmail && (
                      <p className="text-[10px] text-gray-400 font-mono mt-1">Current: {ac.currentEmail}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    <button
                      onClick={() => {
                        setSelectedCampaignId(ac.campaignId);
                        setIsCancelOpen(true);
                      }}
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
                    >
                      <Icon name="trash" size={13} />
                      Cancel Dispatch
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* MODALS */}
      <ConfirmModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDeleteClientSubmit}
        title="Delete Client Account?"
        message={`Are you absolutely sure you want to completely delete ${selectedClient?.email}? This will wipe their campaigns, unsubscribe list, and active scheduled dispatches permanently. This action is irreversible.`}
        confirmText="Wipe Account"
        cancelText="Cancel"
      />

      <PromptModal
        isOpen={isQuotaOpen}
        onClose={() => setIsQuotaOpen(false)}
        onConfirm={handleSetQuotaSubmit}
        title="Adjust Client Quota"
        label={`Set Daily Email Quota for ${selectedClient?.email}`}
        defaultValue={selectedClient?.dailyQuota || 200}
        type="number"
      />

      <PromptModal
        isOpen={isPasswordOpen}
        onClose={() => setIsPasswordOpen(false)}
        onConfirm={handleResetPasswordSubmit}
        title="Reset Client Password"
        label={`Enter new password for ${selectedClient?.email}`}
        placeholder="At least 8 characters"
        type="password"
      />

      <ConfirmModal
        isOpen={isCancelOpen}
        onClose={() => setIsCancelOpen(false)}
        onConfirm={handleCancelCampaignSubmit}
        title="Cancel Active Campaign?"
        message="Are you sure you want to immediately cancel this running email dispatch? It will stop dispatching mid-send."
        confirmText="Stop Dispatch"
        cancelText="Keep Sending"
      />

      <AlertModal
        isOpen={alertState.isOpen}
        onClose={() => setAlertState(prev => ({ ...prev, isOpen: false }))}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
      />
    </div>
  );
}
export default AdminPanel;
