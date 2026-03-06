import { useChildren } from "../context/ChildrenContext";
import { useSensorData } from "../context/SensorDataContext";
import { Heart, Activity, Zap, TrendingUp } from "lucide-react";
import { EngagementGauge } from "../components/EngagementGauge";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export const Monitoring = () => {
  const { selectedChild } = useChildren();
  const { latestData, sensorData } = useSensorData();

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

  const recentData = sensorData.slice(-30).map((d) => ({
    time: new Date(d.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    hr: d.heart_rate,
    hrv: d.hrv_rmssd,
    engagement: d.engagement_score * 100,
    motion: d.motion_level * 100,
  }));

  const getEngagementStatus = (score: number) => {
    if (score >= 0.8) return { label: "Highly Engaged", color: "text-green-500", bg: "bg-green-500/10" };
    if (score >= 0.6) return { label: "Engaged", color: "text-blue-500", bg: "bg-blue-500/10" };
    if (score >= 0.4) return { label: "Neutral", color: "text-yellow-500", bg: "bg-yellow-500/10" };
    if (score >= 0.2) return { label: "Low Engagement", color: "text-orange-500", bg: "bg-orange-500/10" };
    return { label: "Stress", color: "text-red-500", bg: "bg-red-500/10" };
  };

  const status = latestData ? getEngagementStatus(latestData.engagement_score) : null;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Live Monitoring</h1>
          <p className="text-muted-foreground">
            Real-time physiological data for {selectedChild.child_name}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-green-500/10 border border-green-500 px-4 py-2 rounded-lg">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-green-500 text-sm font-semibold">Live</span>
        </div>
      </div>

      {/* Current Status */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-xl font-semibold mb-4">Current Activity</h2>
            <div className={`${status?.bg} rounded-lg p-6 border border-border`}>
              <p className="text-sm text-muted-foreground mb-2">Activity</p>
              <p className="text-2xl font-bold mb-4">{latestData?.activity || "No activity"}</p>
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${status?.color.replace('text-', 'bg-')}`} />
                <p className={`${status?.color} font-semibold`}>{status?.label}</p>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-4">Engagement Level</h2>
            <EngagementGauge value={latestData?.engagement_score || 0} />
          </div>
        </div>
      </div>

      {/* Live Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-lg bg-red-500/10 flex items-center justify-center">
              <Heart className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Heart Rate</p>
              <p className="text-2xl font-bold">{latestData?.heart_rate || "--"}</p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Baseline: {selectedChild.hr_baseline} bpm
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Activity className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">HRV</p>
              <p className="text-2xl font-bold">{latestData?.hrv_rmssd || "--"}</p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Baseline: {selectedChild.rmssd_baseline} ms
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Zap className="w-6 h-6 text-purple-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Motion Level</p>
              <p className="text-2xl font-bold">
                {latestData ? (latestData.motion_level * 100).toFixed(0) : "--"}%
              </p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">Physical activity</div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Arousal</p>
              <p className="text-2xl font-bold">
                {latestData ? (latestData.arousal * 100).toFixed(0) : "--"}%
              </p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">Energy level</div>
        </div>
      </div>

      {/* Real-Time Charts */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Heart Rate & Engagement Trends</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={recentData}>
            <XAxis dataKey="time" stroke="#71718288" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="left" stroke="#71718288" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="right" orientation="right" stroke="#71718288" tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#252525",
                border: "1px solid #454545",
                borderRadius: "8px",
              }}
            />
            <Legend />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="hr"
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
              name="Heart Rate (bpm)"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="engagement"
              stroke="#a855f7"
              strokeWidth={2}
              dot={false}
              name="Engagement (%)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">HRV & Motion Trends</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={recentData}>
            <XAxis dataKey="time" stroke="#71718288" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="left" stroke="#71718288" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="right" orientation="right" stroke="#71718288" tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#252525",
                border: "1px solid #454545",
                borderRadius: "8px",
              }}
            />
            <Legend />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="hrv"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              name="HRV (ms)"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="motion"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
              name="Motion (%)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
