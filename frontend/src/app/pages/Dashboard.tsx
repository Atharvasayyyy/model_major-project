import { useMemo } from "react";
import { useChildren } from "../context/ChildrenContext";
import { useSensorData } from "../context/SensorDataContext";
import {
  Heart,
  Activity,
  TrendingUp,
  AlertCircle,
  Zap,
  Timer,
  Smile,
} from "lucide-react";
import { EngagementGauge } from "../components/EngagementGauge";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const PIE_COLORS = ["#a855f7", "#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#06b6d4"];

type DummyRow = {
  id: string;
  child_id: string;
  activity: string;
  heart_rate: number;
  hrv_rmssd: number;
  motion_level: number;
  engagement_score: number;
  arousal: number;
  valence: number;
  timestamp: string;
};

function clip01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function generateDummySeries(childId: string): DummyRow[] {
  const activities = ["Football", "Drawing", "Reading", "Math Homework", "Music", "Cycling"];
  const engagementBase: Record<string, number> = {
    Football: 0.82,
    Drawing: 0.79,
    Reading: 0.64,
    "Math Homework": 0.39,
    Music: 0.71,
    Cycling: 0.76,
  };

  const now = Date.now();
  const rows: DummyRow[] = [];
  for (let i = 0; i < 48; i++) {
    const activity = activities[i % activities.length];
    const ts = new Date(now - (48 - i) * 30 * 60 * 1000);
    const seed = Math.sin(i * 1.73) * 0.08;
    const engagement = clip01((engagementBase[activity] ?? 0.55) + seed);
    const motion = clip01(activity === "Football" || activity === "Cycling" ? 0.68 + seed : 0.24 + seed);
    const hr = Math.round(74 + motion * 32 + engagement * 8 + Math.cos(i * 0.7) * 4);
    const hrv = Math.round(34 + engagement * 30 - motion * 8 + Math.sin(i * 0.9) * 3);
    const arousal = clip01((hr - 78) / 36);
    const valence = clip01(hrv / 75);

    rows.push({
      id: `D${i}`,
      child_id: childId,
      activity,
      heart_rate: hr,
      hrv_rmssd: hrv,
      motion_level: motion,
      engagement_score: engagement,
      arousal,
      valence,
      timestamp: ts.toISOString(),
    });
  }
  return rows;
}

function toStatus(score: number): { label: string; color: string; bg: string } {
  if (score >= 0.8) return { label: "Highly Engaged", color: "text-green-500", bg: "bg-green-500/10" };
  if (score >= 0.6) return { label: "Engaged", color: "text-blue-500", bg: "bg-blue-500/10" };
  if (score >= 0.4) return { label: "Neutral", color: "text-yellow-500", bg: "bg-yellow-500/10" };
  if (score >= 0.2) return { label: "Low Engagement", color: "text-orange-500", bg: "bg-orange-500/10" };
  return { label: "Stress", color: "text-red-500", bg: "bg-red-500/10" };
}

function toMotionLabel(motion: number): string {
  if (motion >= 0.7) return "High";
  if (motion >= 0.4) return "Moderate";
  return "Low";
}

export const Dashboard = () => {
  const { selectedChild } = useChildren();
  const { latestData, sensorData, alerts } = useSensorData();

  if (!selectedChild) {
    return (
      <div className="p-8">
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <p className="text-muted-foreground">No child profile selected. Please add a child first.</p>
        </div>
      </div>
    );
  }

  const dashboardSeries = useMemo(() => {
    if (sensorData.length > 0) {
      return sensorData;
    }
    return generateDummySeries(selectedChild.id);
  }, [sensorData, selectedChild.id]);

  const current = latestData ?? dashboardSeries[dashboardSeries.length - 1] ?? null;
  const status = current ? toStatus(current.engagement_score) : null;
  const unreadAlerts = alerts.filter((a) => !a.read).length;

  const trendData = useMemo(
    () =>
      dashboardSeries.slice(-24).map((d) => ({
        time: new Date(d.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        hr: d.heart_rate,
        hrv: d.hrv_rmssd,
        motion: Number((d.motion_level * 100).toFixed(1)),
        engagement: Number(d.engagement_score.toFixed(2)),
      })),
    [dashboardSeries],
  );

  const activityAvgData = useMemo(() => {
    const grouped = new Map<string, { total: number; count: number }>();
    dashboardSeries.forEach((d) => {
      const prev = grouped.get(d.activity) || { total: 0, count: 0 };
      grouped.set(d.activity, { total: prev.total + d.engagement_score, count: prev.count + 1 });
    });
    return Array.from(grouped.entries())
      .map(([activity, stats]) => ({
        activity,
        avgEngagement: Number((stats.total / stats.count).toFixed(2)),
      }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement);
  }, [dashboardSeries]);

  const activityDistribution = useMemo(() => {
    const grouped = new Map<string, number>();
    dashboardSeries.forEach((d) => grouped.set(d.activity, (grouped.get(d.activity) || 0) + 1));
    const total = dashboardSeries.length || 1;
    return Array.from(grouped.entries()).map(([activity, count]) => ({
      activity,
      value: Number(((count / total) * 100).toFixed(1)),
    }));
  }, [dashboardSeries]);

  const heatmap = useMemo(() => {
    const slots = ["06-09", "09-12", "12-15", "15-18", "18-21", "21-24"];
    const bucket = new Map<string, { total: number; count: number }>();

    const slotOf = (hour: number) => {
      if (hour < 9) return slots[0];
      if (hour < 12) return slots[1];
      if (hour < 15) return slots[2];
      if (hour < 18) return slots[3];
      if (hour < 21) return slots[4];
      return slots[5];
    };

    dashboardSeries.forEach((d) => {
      const hour = new Date(d.timestamp).getHours();
      const slot = slotOf(hour);
      const key = `${d.activity}__${slot}`;
      const prev = bucket.get(key) || { total: 0, count: 0 };
      bucket.set(key, { total: prev.total + d.engagement_score, count: prev.count + 1 });
    });

    const activities = Array.from(new Set(dashboardSeries.map((d) => d.activity)));
    return {
      slots,
      activities,
      getValue: (activity: string, slot: string) => {
        const stat = bucket.get(`${activity}__${slot}`);
        if (!stat) return 0;
        return Number((stat.total / stat.count).toFixed(2));
      },
    };
  }, [dashboardSeries]);

  const weeklySummary = useMemo(() => {
    const total = dashboardSeries.length || 1;
    const avgEngagement = dashboardSeries.reduce((acc, d) => acc + d.engagement_score, 0) / total;
    const avgHR = dashboardSeries.reduce((acc, d) => acc + d.heart_rate, 0) / total;
    const avgHRV = dashboardSeries.reduce((acc, d) => acc + d.hrv_rmssd, 0) / total;

    return {
      avgEngagement,
      avgHR,
      avgHRV,
      topActivities: activityAvgData.slice(0, 3),
      lowActivities: [...activityAvgData].reverse().slice(0, 3),
    };
  }, [dashboardSeries, activityAvgData]);

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-muted-foreground">
          Monitoring {selectedChild.child_name}'s engagement and wellbeing
        </p>
      </div>

      {/* Section 1 - Real-time Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        {/* Heart Rate */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-lg bg-red-500/10 flex items-center justify-center">
              <Heart className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Heart Rate</p>
              <p className="text-2xl font-bold">{current?.heart_rate || "--"} bpm</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Baseline: {selectedChild.hr_baseline} bpm
          </p>
        </div>

        {/* HRV */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Activity className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">HRV (RMSSD)</p>
              <p className="text-2xl font-bold">{current?.hrv_rmssd || "--"} ms</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Baseline: {selectedChild.rmssd_baseline} ms
          </p>
        </div>

        {/* Motion Level */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Zap className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Motion Level</p>
              <p className="text-2xl font-bold">{current ? `${(current.motion_level * 100).toFixed(0)}%` : "--"}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{current ? toMotionLabel(current.motion_level) : "No data"}</p>
        </div>

        {/* Current Activity */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-lg bg-cyan-500/10 flex items-center justify-center">
              <Timer className="w-6 h-6 text-cyan-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Current Activity</p>
              <p className="text-xl font-bold">{current?.activity || "--"}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Real-time session</p>
        </div>

        {/* Engagement Score */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-purple-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Engagement</p>
              <p className="text-2xl font-bold">
                {current ? (current.engagement_score * 100).toFixed(0) : "--"}%
              </p>
            </div>
          </div>
          {status && <p className={`text-sm ${status.color}`}>{status.label}</p>}
        </div>

        {/* Emotional State */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-12 h-12 rounded-lg ${status?.bg || "bg-secondary"} flex items-center justify-center`}>
              <Smile className={`w-6 h-6 ${status?.color || "text-muted-foreground"}`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Emotional State</p>
              <p className="text-xl font-bold">{status?.label || "Unknown"}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Arousal: {current ? current.arousal.toFixed(2) : "--"} | Valence: {current ? current.valence.toFixed(2) : "--"}
          </p>
        </div>

        {/* Alerts Count */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-orange-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active Alerts</p>
              <p className="text-2xl font-bold">{unreadAlerts}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {current?.activity || "No activity"}
          </p>
        </div>
      </div>

      {/* Section 2 + Section 6 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Engagement Gauge */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Engagement Score Gauge</h2>
          <EngagementGauge value={current?.engagement_score || 0} />
          <p className="text-xs text-muted-foreground mt-4">
            0-0.2 Stress | 0.2-0.4 Low | 0.4-0.6 Neutral | 0.6-0.8 Engaged | 0.8-1 Highly Engaged
          </p>
        </div>

        {/* Engagement Timeline */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Engagement Score Timeline</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#454545" />
              <XAxis dataKey="time" stroke="#71718288" tick={{ fontSize: 12 }} />
              <YAxis stroke="#71718288" tick={{ fontSize: 12 }} domain={[0, 1]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#252525",
                  border: "1px solid #454545",
                  borderRadius: "8px",
                }}
              />
              <Line
                type="monotone"
                dataKey="engagement"
                stroke="#a855f7"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Section 3 + Section 4 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Heart Rate Trend (BPM)</h2>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#454545" />
              <XAxis dataKey="time" stroke="#71718288" tick={{ fontSize: 12 }} />
              <YAxis stroke="#71718288" tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#252525",
                  border: "1px solid #454545",
                  borderRadius: "8px",
                }}
              />
              <ReferenceLine y={selectedChild.hr_baseline} stroke="#f59e0b" strokeDasharray="4 4" label="HR Baseline" />
              <Line type="monotone" dataKey="hr" stroke="#ef4444" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">HRV (RMSSD) Trend</h2>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#454545" />
              <XAxis dataKey="time" stroke="#71718288" tick={{ fontSize: 12 }} />
              <YAxis stroke="#71718288" tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#252525",
                  border: "1px solid #454545",
                  borderRadius: "8px",
                }}
              />
              <ReferenceLine y={selectedChild.rmssd_baseline} stroke="#f59e0b" strokeDasharray="4 4" label="RMSSD Baseline" />
              <Line type="monotone" dataKey="hrv" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Section 5 + Section 7 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Motion Level Graph</h2>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#454545" />
              <XAxis dataKey="time" stroke="#71718288" tick={{ fontSize: 12 }} />
              <YAxis stroke="#71718288" tick={{ fontSize: 12 }} domain={[0, 100]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#252525",
                  border: "1px solid #454545",
                  borderRadius: "8px",
                }}
              />
              <Line type="monotone" dataKey="motion" stroke="#22c55e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-3">
            High HR + High Motion suggests exercise. High HR + Low Motion suggests stress.
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Activity vs Average Engagement</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={activityAvgData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#454545" />
              <XAxis dataKey="activity" stroke="#71718288" tick={{ fontSize: 12 }} />
              <YAxis stroke="#71718288" tick={{ fontSize: 12 }} domain={[0, 1]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#252525",
                  border: "1px solid #454545",
                  borderRadius: "8px",
                }}
              />
              <Bar dataKey="avgEngagement" fill="#a855f7" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Section 8 + Section 9 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Daily Engagement Heatmap</h2>
          <div className="overflow-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left p-2 border-b border-border">Activity</th>
                  {heatmap.slots.map((slot) => (
                    <th key={slot} className="text-center p-2 border-b border-border text-muted-foreground">
                      {slot}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmap.activities.map((activity) => (
                  <tr key={activity}>
                    <td className="p-2 border-b border-border">{activity}</td>
                    {heatmap.slots.map((slot) => {
                      const value = heatmap.getValue(activity, slot);
                      const shade = Math.round(value * 100);
                      return (
                        <td key={`${activity}-${slot}`} className="p-2 border-b border-border text-center">
                          <div
                            className="rounded px-2 py-1"
                            style={{
                              backgroundColor: `rgba(168, 85, 247, ${0.08 + value * 0.7})`,
                            }}
                          >
                            {shade}%
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Activity Distribution</h2>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={activityDistribution}
                dataKey="value"
                nameKey="activity"
                outerRadius={95}
                label={({ activity, value }) => `${activity}: ${value}%`}
              >
                {activityDistribution.map((entry, index) => (
                  <Cell key={entry.activity} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Section 10 - Alerts */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Alerts Panel</h2>
        {alerts.length === 0 ? (
          <p className="text-muted-foreground">No active alerts right now.</p>
        ) : (
          <div className="space-y-3">
            {alerts.slice(0, 5).map((alert) => (
              <div
                key={alert.id}
                className={`p-4 rounded-lg border ${
                  alert.read ? "bg-secondary/50 border-border" : "bg-orange-500/10 border-orange-500/50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className={`w-5 h-5 mt-0.5 ${alert.type === "stress" ? "text-red-500" : "text-orange-500"}`} />
                  <div className="flex-1">
                    <p className="font-medium">{alert.message}</p>
                    <p className="text-sm text-muted-foreground mt-1">{new Date(alert.timestamp).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 11 - Weekly Wellbeing */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <h2 className="text-xl font-semibold">Weekly Wellbeing Report</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-secondary rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Average Engagement</p>
            <p className="text-2xl font-bold">{(weeklySummary.avgEngagement * 100).toFixed(1)}%</p>
          </div>
          <div className="bg-secondary rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Average Heart Rate</p>
            <p className="text-2xl font-bold">{weeklySummary.avgHR.toFixed(0)} bpm</p>
          </div>
          <div className="bg-secondary rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Average HRV</p>
            <p className="text-2xl font-bold">{weeklySummary.avgHRV.toFixed(0)} ms</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-green-500/10 border border-green-500/40 rounded-lg p-4">
            <p className="font-semibold text-green-500 mb-2">Top Engaging Activities</p>
            <ul className="space-y-1 text-sm">
              {weeklySummary.topActivities.map((item) => (
                <li key={item.activity}>
                  {item.activity} - {item.avgEngagement.toFixed(2)}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-orange-500/10 border border-orange-500/40 rounded-lg p-4">
            <p className="font-semibold text-orange-500 mb-2">Least Engaging Activities</p>
            <ul className="space-y-1 text-sm">
              {weeklySummary.lowActivities.map((item) => (
                <li key={item.activity}>
                  {item.activity} - {item.avgEngagement.toFixed(2)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
