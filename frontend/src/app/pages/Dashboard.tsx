import { useMemo } from "react";
import { useChildren } from "../context/ChildrenContext";
import { useSensorData } from "../context/SensorDataContext";
import { Heart, Activity, Zap, Bell } from "lucide-react";
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
} from "recharts";

function toStatus(score: number): { label: string; color: string } {
  if (score >= 0.8) return { label: "Highly Engaged", color: "text-green-500" };
  if (score >= 0.6) return { label: "Engaged", color: "text-blue-500" };
  if (score >= 0.4) return { label: "Neutral", color: "text-yellow-500" };
  if (score >= 0.2) return { label: "Low Engagement", color: "text-orange-500" };
  return { label: "Stress", color: "text-red-500" };
}

export const Dashboard = () => {
  const { selectedChild } = useChildren();
  const { latestData, sensorData, alerts } = useSensorData();

  if (!selectedChild) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">No child selected. Add a child profile to continue.</p>
        </div>
      </div>
    );
  }

  const current = latestData ?? sensorData[sensorData.length - 1] ?? null;
  const unreadAlerts = alerts.filter((a) => !a.read).length;

  const trendData = useMemo(
    () =>
      sensorData.slice(-20).map((d) => ({
        time: new Date(d.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        engagement: Number((d.engagement_score * 100).toFixed(1)),
        hr: d.heart_rate,
      })),
    [sensorData],
  );

  const activityInsights = useMemo(() => {
    const grouped = new Map<string, { total: number; count: number }>();
    sensorData.forEach((d) => {
      const prev = grouped.get(d.activity) || { total: 0, count: 0 };
      grouped.set(d.activity, { total: prev.total + d.engagement_score, count: prev.count + 1 });
    });

    return Array.from(grouped.entries())
      .map(([activity, stats]) => ({
        activity,
        avg_engagement: Number(((stats.total / stats.count) * 100).toFixed(1)),
      }))
      .sort((a, b) => b.avg_engagement - a.avg_engagement)
      .slice(0, 6);
  }, [sensorData]);

  const status = current ? toStatus(current.engagement_score) : null;

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="mb-2 text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Realtime overview for {selectedChild.child_name}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-2 flex items-center gap-2 text-muted-foreground">
            <Heart className="h-4 w-4 text-red-500" /> Heart Rate
          </div>
          <p className="text-2xl font-bold">{current?.heart_rate ?? "--"} bpm</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-2 flex items-center gap-2 text-muted-foreground">
            <Activity className="h-4 w-4 text-blue-500" /> HRV (RMSSD)
          </div>
          <p className="text-2xl font-bold">{current?.hrv_rmssd ?? "--"} ms</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-2 flex items-center gap-2 text-muted-foreground">
            <Zap className="h-4 w-4 text-green-500" /> Engagement
          </div>
          <p className="text-2xl font-bold">{current ? (current.engagement_score * 100).toFixed(0) : "--"}%</p>
          <p className={`text-sm ${status?.color || "text-muted-foreground"}`}>{status?.label || "No data"}</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-2 flex items-center gap-2 text-muted-foreground">
            <Bell className="h-4 w-4 text-orange-500" /> Unread Alerts
          </div>
          <p className="text-2xl font-bold">{unreadAlerts}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-xl font-semibold">Engagement Trend</h2>
          <ResponsiveContainer width="100%" height={260}>
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
              <Line type="monotone" dataKey="engagement" stroke="#a855f7" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-xl font-semibold">Activity Insights</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={activityInsights}>
              <CartesianGrid strokeDasharray="3 3" stroke="#454545" />
              <XAxis dataKey="activity" stroke="#71718288" tick={{ fontSize: 12 }} />
              <YAxis stroke="#71718288" tick={{ fontSize: 12 }} domain={[0, 100]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#252525",
                  border: "1px solid #454545",
                  borderRadius: "8px",
                }}
              />
              <Bar dataKey="avg_engagement" fill="#3b82f6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
