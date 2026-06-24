import React, { useState, useEffect, useCallback } from "react";
import { useApi } from "../hooks/useApi";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { AlertModal } from "../components/ui/Modal";

export function AnalyticsPage({ backendUrl, clientTenantId, clientEmail }) {
  const { request } = useApi();

  const [analyticsData, setAnalyticsData]   = useState([]);
  const [loading, setLoading]               = useState(true);
  const [chartType, setChartType]           = useState("bar"); // "bar" | "line"
  const [alertState, setAlertState]         = useState({ isOpen: false, title: "", message: "", type: "info" });

  const showAlert = (title, message, type = "info") =>
    setAlertState({ isOpen: true, title, message, type });

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${backendUrl}/api/analytics`;
      if (clientTenantId) {
        url += `?clientTenantId=${encodeURIComponent(clientTenantId)}`;
      }
      const data = await request(url);
      setAnalyticsData(data.analytics);
    } catch (err) {
      showAlert("Error", err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [backendUrl, request, clientTenantId]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  // ── Summary Totals ────────────────────────────────────────────────────────
  const totalCampaigns  = analyticsData.length;
  const totalSent       = analyticsData.reduce((a, c) => a + c.sent, 0);
  const totalOpens      = analyticsData.reduce((a, c) => a + c.opens, 0);
  const totalClicks     = analyticsData.reduce((a, c) => a + c.clicks, 0);
  const totalUnsubs     = analyticsData.length > 0 ? analyticsData[0].unsubs : 0;
  const avgOpenRate     = totalCampaigns > 0
    ? Math.round((analyticsData.reduce((a, c) => a + (c.sent > 0 ? c.opens / c.sent : 0), 0) / totalCampaigns) * 100) : 0;

  // ── CSV Export ────────────────────────────────────────────────────────────
  const handleExportCsv = () => {
    if (!analyticsData.length) return;
    const headers = ["Date", "Subject", "Sent", "Opens", "Clicks", "Unsubs", "Open Rate %", "Click Rate %", "Fail Rate %", "Status"];
    const rows = analyticsData.map(c => [
      new Date(c.date).toLocaleString(),
      `"${c.subject.replace(/"/g, '""')}"`,
      c.sent, c.opens, c.clicks, c.unsubs,
      c.openRate, c.clickRate, c.failRate, c.status
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const a = document.createElement("a");
    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    a.download = `analytics_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  // ── Chart Data ────────────────────────────────────────────────────────────
  const chartData = [...analyticsData].slice(0, 10).reverse().map(c => ({
    date: new Date(c.date).toLocaleDateString(),
    Sent: c.sent,
    Opens: c.opens,
    Clicks: c.clicks,
  }));

  const summaryCards = [
    { label: "Total Campaigns",  value: totalCampaigns, from: "from-blue-500",   to: "to-blue-600",   shadow: "shadow-blue-200"   },
    { label: "Total Emails Sent",value: totalSent,       from: "from-violet-500", to: "to-violet-600", shadow: "shadow-violet-200" },
    { label: "Total Opens",      value: totalOpens,      from: "from-emerald-500",to: "to-emerald-600",shadow: "shadow-emerald-200"},
    { label: "Total Clicks",     value: totalClicks,     from: "from-amber-500",  to: "to-amber-600",  shadow: "shadow-amber-200"  },
    { label: "Unsubscribes",     value: totalUnsubs,     from: "from-rose-500",   to: "to-rose-600",   shadow: "shadow-rose-200"   },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h2>
          <p className="text-gray-500 text-sm mt-1">Track opens, clicks, and campaign performance in real-time</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleExportCsv} variant="secondary" className="text-xs flex items-center gap-1.5" id="btn-export-analytics-csv">
            <Icon name="download" size={13} /> Export CSV
          </Button>
          <Button onClick={fetchAnalytics} variant="secondary" className="text-xs flex items-center gap-1" id="btn-refresh-analytics">
            <Icon name="zap" size={13} /> Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <Card className="text-center py-16">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </Card>
      ) : analyticsData.length === 0 ? (
        <Card className="text-center py-16">
          <Icon name="eye" size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">No tracking data yet. Launch a campaign to see statistics.</p>
        </Card>
      ) : (
        <div className="space-y-6 animate-fade-in">

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {summaryCards.map(card => (
              <Card key={card.label} className={`bg-gradient-to-br ${card.from} ${card.to} text-white border-0 shadow-lg ${card.shadow}`}>
                <p className="text-white/80 text-xs font-medium">{card.label}</p>
                <p className="text-3xl font-bold mt-1">{card.value.toLocaleString()}</p>
              </Card>
            ))}
          </div>

          {/* Avg Open Rate Banner */}
          <Card className="flex items-center justify-between py-3 px-5 bg-gradient-to-r from-blue-50 to-violet-50 border border-blue-100">
            <span className="text-sm font-semibold text-gray-700">Average Open Rate across all campaigns</span>
            <span className="text-2xl font-extrabold text-blue-600">{avgOpenRate}%</span>
          </Card>

          {/* Chart with toggle */}
          <Card>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-gray-800">Recent Campaigns Performance (last 10)</h3>
              <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1">
                <button
                  id="btn-chart-bar"
                  onClick={() => setChartType("bar")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${chartType === "bar" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  Bar
                </button>
                <button
                  id="btn-chart-line"
                  onClick={() => setChartType("line")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${chartType === "line" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  Line
                </button>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === "bar" ? (
                  <BarChart data={chartData}>
                    <XAxis dataKey="date" stroke="#9ca3af" fontSize={11} />
                    <YAxis stroke="#9ca3af" fontSize={11} />
                    <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)" }} />
                    <Legend />
                    <Bar dataKey="Sent"   fill="#8b5cf6" radius={[4,4,0,0]} />
                    <Bar dataKey="Opens"  fill="#10b981" radius={[4,4,0,0]} />
                    <Bar dataKey="Clicks" fill="#f59e0b" radius={[4,4,0,0]} />
                  </BarChart>
                ) : (
                  <LineChart data={chartData}>
                    <XAxis dataKey="date" stroke="#9ca3af" fontSize={11} />
                    <YAxis stroke="#9ca3af" fontSize={11} />
                    <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)" }} />
                    <Legend />
                    <Line type="monotone" dataKey="Sent"   stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="Opens"  stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="Clicks" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Detailed Table */}
          <Card className="overflow-hidden">
            <h3 className="font-semibold text-gray-800 mb-4">Detailed Performance Table</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Subject</th>
                    <th className="px-4 py-3 text-right">Sent</th>
                    <th className="px-4 py-3 text-right">Opens</th>
                    <th className="px-4 py-3 text-right">Clicks</th>
                    <th className="px-4 py-3 text-right">Open %</th>
                    <th className="px-4 py-3 text-right">Click %</th>
                    <th className="px-4 py-3 text-right">Fail %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {analyticsData.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-500 text-xs">{new Date(c.date).toLocaleString()}</td>
                      <td className="px-4 py-3 text-gray-900 font-semibold truncate max-w-52">{c.subject}</td>
                      <td className="px-4 py-3 text-right text-gray-700 font-mono">{c.sent}</td>
                      <td className="px-4 py-3 text-right text-gray-700 font-mono">{c.opens}</td>
                      <td className="px-4 py-3 text-right text-gray-700 font-mono">{c.clicks}</td>
                      <td className="px-4 py-3 text-right">
                        <Badge color={c.openRate > 40 ? "green" : c.openRate > 15 ? "blue" : "gray"}>{c.openRate}%</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Badge color={c.clickRate > 10 ? "green" : c.clickRate > 3 ? "blue" : "gray"}>{c.clickRate}%</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Badge color={c.failRate > 20 ? "red" : c.failRate > 5 ? "amber" : "green"}>{c.failRate}%</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

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

export default AnalyticsPage;
