import { useState, useMemo, useEffect } from "react";
import { useChildren } from "../context/ChildrenContext";
import { TrendingUp, Calendar } from "lucide-react";
import { api } from "../services/api";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

function AnalyticsTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  return (
    <div className="min-w-[160px] rounded-lg border border-border/80 bg-background/95 px-3 py-2 shadow-xl backdrop-blur">
      <p className="mb-1 text-xs font-semibold text-foreground">{label}</p>
      <p className="text-xs text-cyan-400">Engagement: {payload[0]?.value}%</p>
    </div>
  );
}

type TimeFilter = "today" | "week" | "month";

export const Analytics = () => {
  const { selectedChild } = useChildren();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("week");
  const [trendRows, setTrendRows] = useState<any[]>([]);
  const [activityRows, setActivityRows] = useState<any[]>([]);
  const [summary, setSummary] = useState({
    average_heart_rate: 0,
    average_hrv: 0,
    average_engagement_score: 0,
  });

  useEffect(() => {
    if (!selectedChild) return;

    let mounted = true;

    const load = async () => {
      try {
        const [trendData, activityData, dailySummary] = await Promise.all([
          api.getEngagementTrend(selectedChild.id),
          api.getActivityInsights(selectedChild.id),
          api.getDailySummary(selectedChild.id),
        ]);

        if (!mounted) return;
        setTrendRows(Array.isArray(trendData) ? trendData : []);
        setActivityRows(Array.isArray(activityData) ? activityData : []);
        setSummary(dailySummary || {
          average_heart_rate: 0,
          average_hrv: 0,
          average_engagement_score: 0,
        });
      } catch {
        if (!mounted) return;
        setTrendRows([]);
        setActivityRows([]);
        setSummary({ average_heart_rate: 0, average_hrv: 0, average_engagement_score: 0 });
      }
    };

    void load();
    const interval = setInterval(() => {
      void load();
    }, 10000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [selectedChild]);

  const filteredData = useMemo(() => {
    const now = new Date();
    const cutoff = new Date();

    if (timeFilter === "today") {
      cutoff.setHours(0, 0, 0, 0);
    } else if (timeFilter === "week") {
      cutoff.setDate(now.getDate() - 7);
    } else {
      cutoff.setMonth(now.getMonth() - 1);
    }

    return trendRows.filter((d) => new Date(d.timestamp) >= cutoff);
  }, [trendRows, timeFilter]);

  // Calculate activity-wise engagement
  const activityEngagement = useMemo(() => {
    return activityRows
      .map((row) => ({
        activity: String(row.activity || "Unknown"),
        engagement: (Number(row.avg_engagement || 0) * 100).toFixed(1),
      }))
      .sort((a, b) => parseFloat(b.engagement) - parseFloat(a.engagement));
  }, [activityRows]);

  // Engagement trend over time
  const engagementTrend = useMemo(() => {
    const grouped = new Map<string, { total: number; count: number }>();

    filteredData.forEach((d) => {
      const date = new Date(d.timestamp);
      const key =
        timeFilter === "today"
          ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : date.toLocaleDateString([], { month: "short", day: "numeric" });

      const existing = grouped.get(key) || { total: 0, count: 0 };
      grouped.set(key, {
        total: existing.total + d.engagement_score,
        count: existing.count + 1,
      });
    });

    return Array.from(grouped.entries()).map(([time, data]) => ({
      time,
      engagement: ((data.total / data.count) * 100).toFixed(1),
    }));
  }, [filteredData, timeFilter]);

  const averageMetrics = useMemo(
    () => ({
      engagement: (summary.average_engagement_score * 100).toFixed(1),
      hr: summary.average_heart_rate.toFixed(0),
      hrv: summary.average_hrv.toFixed(0),
    }),
    [summary],
  );

  if (!selectedChild) {
    return (
      <div className="p-8">
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <p className="text-muted-foreground">
            No child profile selected. Please select or add a child first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Analytics</h1>
          <p className="text-muted-foreground">
            Engagement insights for {selectedChild.child_name}
          </p>
        </div>

        {/* Time Filter */}
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg p-1">
          <button
            onClick={() => setTimeFilter("today")}
            className={`px-4 py-2 rounded-md transition-colors ${
              timeFilter === "today"
                ? "bg-purple-600 text-white"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setTimeFilter("week")}
            className={`px-4 py-2 rounded-md transition-colors ${
              timeFilter === "week"
                ? "bg-purple-600 text-white"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setTimeFilter("month")}
            className={`px-4 py-2 rounded-md transition-colors ${
              timeFilter === "month"
                ? "bg-purple-600 text-white"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Month
          </button>
        </div>
      </div>

      {/* Average Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-5 h-5 text-purple-500" />
            <p className="text-sm text-muted-foreground">Avg. Engagement</p>
          </div>
          <p className="text-3xl font-bold">{averageMetrics.engagement}%</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="w-5 h-5 text-red-500" />
            <p className="text-sm text-muted-foreground">Avg. Heart Rate</p>
          </div>
          <p className="text-3xl font-bold">{averageMetrics.hr} bpm</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="w-5 h-5 text-blue-500" />
            <p className="text-sm text-muted-foreground">Avg. HRV</p>
          </div>
          <p className="text-3xl font-bold">{averageMetrics.hrv} ms</p>
        </div>
      </div>

      {/* Activity Insights */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Activity vs Engagement Score</h2>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={activityEngagement}>
            <CartesianGrid strokeDasharray="3 3" stroke="#454545" />
            <XAxis dataKey="activity" stroke="#71718288" tick={{ fontSize: 12 }} />
            <YAxis stroke="#71718288" tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#252525",
                border: "1px solid #454545",
                borderRadius: "8px",
              }}
            />
            <Bar dataKey="engagement" fill="#a855f7" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>

        {/* Activity Table */}
        <div className="mt-6 overflow-hidden rounded-lg border border-border">
          <table className="w-full">
            <thead className="bg-secondary">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold">Activity</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">
                  Avg. Engagement
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {activityEngagement.map((item) => {
                const score = parseFloat(item.engagement);
                let status = "Low";
                let statusColor = "text-red-500";

                if (score >= 80) {
                  status = "Excellent";
                  statusColor = "text-green-500";
                } else if (score >= 60) {
                  status = "Good";
                  statusColor = "text-blue-500";
                } else if (score >= 40) {
                  status = "Moderate";
                  statusColor = "text-yellow-500";
                }

                return (
                  <tr key={item.activity} className="hover:bg-secondary/50">
                    <td className="px-4 py-3">{item.activity}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {item.engagement}%
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${statusColor}`}>
                      {status}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Engagement Trends */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Engagement Score Over Time</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={engagementTrend}>
            <defs>
              <linearGradient id="analyticsEngagementFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="4 8" stroke="rgba(113,113,130,0.26)" />
            <XAxis dataKey="time" axisLine={false} tickLine={false} stroke="#717182" tick={{ fontSize: 12 }} />
            <YAxis axisLine={false} tickLine={false} stroke="#717182" tick={{ fontSize: 12 }} domain={[0, 100]} />
            <Tooltip content={<AnalyticsTooltip />} cursor={{ stroke: "rgba(14,165,233,0.45)", strokeWidth: 1.5 }} />
            <Area type="monotone" dataKey="engagement" stroke="none" fill="url(#analyticsEngagementFill)" />
            <Line
              type="monotone"
              dataKey="engagement"
              stroke="#0ea5e9"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 5, fill: "#0ea5e9", stroke: "#fff", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
