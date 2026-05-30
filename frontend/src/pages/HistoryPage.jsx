import React, { useState, useEffect, useCallback } from "react";
import { useApi } from "../hooks/useApi";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Icon } from "../components/ui/Icon";
import { AlertModal } from "../components/ui/Modal";

export function HistoryPage({ backendUrl }) {
  const { request } = useApi();

  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Search / Sort / Pagination
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  // Details Modal
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [campaignDetails, setCampaignDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Alert
  const [alertState, setAlertState] = useState({ isOpen: false, title: "", message: "", type: "info" });
  const [migrationMessage, setMigrationMessage] = useState(false);

  const showAlert = (title, message, type = "info") => {
    setAlertState({ isOpen: true, title, message, type });
  };

  // 1. One-time browser migration cleanup on mount
  useEffect(() => {
    const oldHistory = localStorage.getItem("edp_history");
    if (oldHistory) {
      localStorage.removeItem("edp_history");
      setMigrationMessage(true);
    }
  }, []);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const data = await request(
        `${backendUrl}/api/campaigns?page=${page}&search=${encodeURIComponent(search)}&sortOrder=${sortOrder}`
      );
      setCampaigns(data.campaigns);
      setTotalPages(data.pagination.pages || 1);
    } catch (err) {
      showAlert("Error", err.message, "error");
    } finally {
      setLoading(true);
      setLoading(false);
    }
  }, [backendUrl, request, page, search, sortOrder]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const handleViewDetails = async (campaign) => {
    setSelectedCampaign(campaign);
    setDetailsLoading(true);
    try {
      const data = await request(`${backendUrl}/api/campaigns/${campaign.id}`);
      setCampaignDetails(data.results);
    } catch (err) {
      showAlert("Details Error", err.message, "error");
      setSelectedCampaign(null);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleDownloadCsv = (campaign, results) => {
    if (!results || !results.length) return;
    const csv = [
      "Email,Status,Attachment,Reason",
      ...results.map((r) => `"${r.to_email}","${r.status}","${r.attach_status || ""}","${(r.reason || "").replace(/"/g, '""')}"`)
    ].join("\n");
    const a = document.createElement("a");
    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    a.download = `campaign_${campaign.subject.replace(/\W+/g, "_")}_${new Date(campaign.created_at).toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Campaign History</h2>
          <p className="text-gray-500 text-sm mt-1">Campaign records are securely stored on the PostgreSQL server</p>
        </div>
      </div>

      {migrationMessage && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-blue-700 text-xs animate-fade-in">
          <div className="flex items-center gap-2">
            <Icon name="check" size={15} />
            <span>Legacy local history successfully migrated to persistent database logs.</span>
          </div>
          <button onClick={() => setMigrationMessage(false)} className="text-blue-400 hover:text-blue-600">
            <Icon name="x" size={12} />
          </button>
        </div>
      )}

      {/* Filter controls */}
      <Card className="flex flex-col sm:flex-row items-center gap-4 py-4 justify-between">
        <div className="flex-1 w-full max-w-md">
          <input
            type="text"
            placeholder="Search campaigns by subject..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSortOrder(prev => (prev === "desc" ? "asc" : "desc"))}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 bg-white text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors"
          >
            Sort by Date: {sortOrder === "desc" ? "Newest First" : "Oldest First"}
          </button>
        </div>
      </Card>

      {/* Campaign List */}
      {loading ? (
        <Card className="py-16 flex justify-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </Card>
      ) : campaigns.length === 0 ? (
        <Card className="text-center py-16">
          <Icon name="history" size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">No campaigns found matching filter.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {campaigns.map((c) => (
            <Card key={c.id} className="hover:shadow-md transition-shadow">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="font-bold text-gray-900 text-base">{c.subject}</h4>
                  <p className="text-xs text-gray-400">
                    Sent on {new Date(c.created_at || c.date).toLocaleString()}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge color="blue">{c.total_recipients || c.total} total</Badge>
                    <Badge color="green">{c.sent} sent</Badge>
                    {c.failed > 0 && <Badge color="red">{c.failed} failed</Badge>}
                    <Badge color={c.status === "completed" ? "green" : c.status === "running" ? "blue" : "gray"}>
                      {c.status}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <Button variant="secondary" onClick={() => handleViewDetails(c)} className="text-xs py-2 px-3.5">
                    View Dispatch Logs
                  </Button>
                </div>
              </div>
            </Card>
          ))}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button
                variant="secondary"
                disabled={page === 1}
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
              >
                Previous
              </Button>
              <span className="text-sm font-semibold text-gray-600 px-3">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={page === totalPages}
                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Details drawer/dialog modal */}
      {selectedCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-2xl h-screen bg-white shadow-2xl p-6 flex flex-col justify-between animate-slide-left">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
              <div>
                <h3 className="font-extrabold text-gray-900 text-lg">Campaign Audit logs</h3>
                <p className="text-xs text-gray-400 truncate max-w-md">{selectedCampaign.subject}</p>
              </div>
              <button
                onClick={() => setSelectedCampaign(null)}
                className="text-gray-400 hover:text-gray-600 rounded-lg p-1 hover:bg-gray-50"
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            <div className="flex-grow overflow-y-auto space-y-4 pr-1">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-green-700">{selectedCampaign.sent}</p>
                  <p className="text-[10px] text-green-600 uppercase font-semibold">Sent Successfully</p>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-red-700">{selectedCampaign.failed}</p>
                  <p className="text-[10px] text-red-600 uppercase font-semibold">Errors / Failed</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-blue-700">{selectedCampaign.total_recipients}</p>
                  <p className="text-[10px] text-blue-600 uppercase font-semibold">Total Audited</p>
                </div>
              </div>

              {detailsLoading ? (
                <div className="py-20 flex justify-center">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : !campaignDetails || campaignDetails.length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-xs">No logs found for this campaign.</div>
              ) : (
                <div className="overflow-hidden border border-gray-100 rounded-xl">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-gray-500 uppercase font-semibold">Email</th>
                        <th className="px-3 py-2 text-gray-500 uppercase font-semibold">Status</th>
                        <th className="px-3 py-2 text-gray-500 uppercase font-semibold">Attachment</th>
                        <th className="px-3 py-2 text-gray-500 uppercase font-semibold">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {campaignDetails.map((r, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-800 truncate max-w-40">{r.to_email}</td>
                          <td className="px-3 py-2">
                            <Badge color={r.status === "sent" ? "green" : r.status === "error" ? "red" : "amber"}>
                              {r.status}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-gray-500 font-mono text-[10px]">
                            {r.attach_status || "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-400 truncate max-w-44" title={r.reason}>
                            {r.reason || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 pt-4 flex gap-3">
              <Button
                variant="secondary"
                onClick={() => handleDownloadCsv(selectedCampaign, campaignDetails)}
                disabled={detailsLoading || !campaignDetails}
                icon={<Icon name="download" size={14} />}
                className="flex-1 justify-center"
              >
                Download CSV Logs
              </Button>
              <Button onClick={() => setSelectedCampaign(null)} className="flex-grow-0">
                Close
              </Button>
            </div>
          </div>
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
export default HistoryPage;
