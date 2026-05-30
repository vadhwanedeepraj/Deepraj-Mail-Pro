import React, { useState, useEffect, useCallback } from "react";
import { useApi } from "../hooks/useApi";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Icon } from "../components/ui/Icon";
import { AlertModal } from "../components/ui/Modal";

export function AnalyticsPage({ backendUrl }) {
  const { request } = useApi();

  const [analyticsData, setAnalyticsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alertState, setAlertState] = useState({ isOpen: false, title: "", message: "", type: "info" });

  const showAlert = (title, message, type = "info") => {
    setAlertState({ isOpen: true, title, message, type });
  };

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      // Calls public or auth trackingController getAnalytics
      const data = await request(`${backendUrl}/api/analytics`);
      setAnalyticsData(data.analytics);
    } catch (err) {
      showAlert("Error", err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [backendUrl, request]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const totalCampaigns = analyticsData.length;
  const totalSent = analyticsData.reduce((acc, c) => acc + c.sent, 0);
  const avgOpenRate = totalCampaigns > 0
    ? Math.round((analyticsData.reduce((acc, c) => acc + (c.sent > 0 ? c.opens / c.sent : 0), 0) / totalCampaigns) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h2>
          <p className="text-gray-500 text-sm mt-1">Track open rates and campaign performance in real-time</p>
        </div>
        <Button onClick={fetchAnalytics} variant="secondary" className="text-xs flex items-center gap-1">
          <Icon name="zap" size={13} /> Refresh
        </Button>
      </div>

      {loading ? (
        <Card className="text-center py-16">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </Card>
      ) : analyticsData.length === 0 ? (
        <Card className="text-center py-16">
          <Icon name="eye" size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">No tracking data available yet. Launch a campaign to see statistics.</p>
        </Card>
      ) : (
        <div className="space-y-6 animate-fade-in">
          {/* Summary counters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-lg shadow-blue-200">
              <p className="text-blue-100 text-sm font-medium">Total Campaigns</p>
              <p className="text-3xl font-bold mt-1">{totalCampaigns}</p>
            </Card>
            <Card className="bg-gradient-to-br from-violet-500 to-violet-600 text-white border-0 shadow-lg shadow-violet-200">
              <p className="text-violet-100 text-sm font-medium">Total Emails Sent</p>
              <p className="text-3xl font-bold mt-1">{totalSent}</p>
            </Card>
            <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-0 shadow-lg shadow-emerald-200">
              <p className="text-emerald-100 text-sm font-medium">Average Open Rate</p>
              <p className="text-3xl font-bold mt-1">{avgOpenRate}%</p>
            </Card>
          </div>

          {/* Chart */}
          <Card>
            <h3 className="font-semibold text-gray-800 mb-6">Recent Campaigns Performance (Open Rate)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[...analyticsData].slice(0, 10).reverse()}>
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => new Date(v).toLocaleDateString()}
                    stroke="#9ca3af"
                    fontSize={12}
                  />
                  <YAxis stroke="#9ca3af" fontSize={12} />
                  <Tooltip
                    contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
                    labelFormatter={(v) => new Date(v).toLocaleString()}
                  />
                  <Bar dataKey="sent" name="Sent" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="opens" name="Opens" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Details Table */}
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
                    <th className="px-4 py-3 text-right">Open Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {analyticsData.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-600">
                        {new Date(c.date).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-gray-900 font-semibold truncate max-w-64">
                        {c.subject}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 font-mono">{c.sent}</td>
                      <td className="px-4 py-3 text-right text-gray-700 font-mono">{c.opens}</td>
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

// Simple internal Button wrapper inside analytics for easy compilation
function Button({ children, onClick, variant = "secondary", className = "", ...props }) {
  const baseClass = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all";
  const themeClass = variant === "secondary"
    ? "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
    : "bg-blue-600 text-white hover:bg-blue-700";
  return (
    <button onClick={onClick} className={`${baseClass} ${themeClass} ${className}`} {...props}>
      {children}
    </button>
  );
}

export default AnalyticsPage;
