import { useMemo } from "react";
import { useChildren } from "../context/ChildrenContext";
import { useSensorData } from "../context/SensorDataContext";
import { Heart, Activity, Zap, Bell, Droplets } from "lucide-react";
import {
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  return (
    <div className="min-w-[170px] rounded-lg border border-border/80 bg-background/95 px-3 py-2 shadow-xl backdrop-blur">
      <p className="mb-1 text-xs font-semibold text-foreground">{label}</p>
      <p className="text-xs text-cyan-400">Engagement: {payload[0]?.value}%</p>
      <p className="text-xs text-orange-400">Heart Rate: {payload[1]?.value} bpm</p>
    </div>
  );
}

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

  const liveSignals = useMemo(
    () =>
      sensorData.slice(-30).map((d) => ({
        time: new Date(d.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        hr: d.heart_rate,
        hrv: d.hrv_rmssd,
        motion: Number((d.motion_level * 100).toFixed(1)),
        spo2: d.spo2,
      })),
    [sensorData],
  );

  const status = current ? toStatus(current.engagement_score) : null;

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="mb-2 text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Realtime overview for {selectedChild.child_name}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
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
            <Droplets className="h-4 w-4 text-cyan-500" /> SpO2
          </div>
          <p className="text-2xl font-bold">{current?.spo2 ?? "--"}%</p>
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
              <defs>
                <linearGradient id="dashboardEngagementFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="4 8" stroke="rgba(113,113,130,0.26)" />
              <XAxis dataKey="time" axisLine={false} tickLine={false} stroke="#717182" tick={{ fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} stroke="#717182" tick={{ fontSize: 12 }} domain={[0, 100]} />
              <Tooltip content={<TrendTooltip />} cursor={{ stroke: "rgba(6,182,212,0.45)", strokeWidth: 1.5 }} />
              <Area type="monotone" dataKey="engagement" stroke="none" fill="url(#dashboardEngagementFill)" />
              <Line
                type="monotone"
                dataKey="engagement"
                stroke="#06b6d4"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "#ffffff", fill: "#06b6d4" }}
              />
              <Line type="monotone" dataKey="hr" stroke="#f97316" strokeWidth={2} dot={false} strokeOpacity={0.75} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-xl font-semibold">Live Sensor Signals</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={liveSignals}>
              <CartesianGrid vertical={false} strokeDasharray="4 8" stroke="rgba(113,113,130,0.26)" />
              <XAxis dataKey="time" axisLine={false} tickLine={false} stroke="#717182" tick={{ fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} stroke="#717182" tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#111827f2",
                  border: "1px solid #334155",
                  borderRadius: "10px",
                }}
              />
              <Line type="monotone" dataKey="hr" stroke="#ef4444" strokeWidth={2.4} dot={false} name="Heart Rate" />
              <Line type="monotone" dataKey="hrv" stroke="#3b82f6" strokeWidth={2.4} dot={false} name="HRV" />
              <Line type="monotone" dataKey="motion" stroke="#22c55e" strokeWidth={2.2} dot={false} name="Motion (%)" />
              <Line type="monotone" dataKey="spo2" stroke="#06b6d4" strokeWidth={2.2} dot={false} name="SpO2" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
