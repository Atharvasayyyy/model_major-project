import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { useChildren } from "../context/ChildrenContext";
import { Heart, Activity, Zap, Bell, Droplets, Trophy, Radio } from "lucide-react";
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
import { api } from "../services/api";

// ─── helpers ─────────────────────────────────────────────────────────────────

function toStatus(score: number): { label: string; color: string } {
  if (score >= 0.8) return { label: "Highly Engaged", color: "text-green-400" };
  if (score >= 0.6) return { label: "Engaged",        color: "text-blue-400" };
  if (score >= 0.4) return { label: "Neutral",         color: "text-yellow-400" };
  if (score >= 0.2) return { label: "Low Engagement",  color: "text-orange-400" };
  return               { label: "Stress",             color: "text-red-400" };
}

// ─── tooltips ────────────────────────────────────────────────────────────────

function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value;
  return (
    <div className="min-w-[170px] rounded-lg border border-border/80 bg-background/95 px-3 py-2 shadow-xl backdrop-blur">
      <p className="mb-1 text-xs font-semibold text-foreground">{label}</p>
      <p className="text-xs text-cyan-400">
        Avg Engagement: {v != null ? `${(v * 100).toFixed(1)}%` : "—"}
      </p>
      <p className="text-xs text-muted-foreground">
        Samples: {payload[0]?.payload?.sample_count ?? 0}
      </p>
    </div>
  );
}

function SignalTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[160px] rounded-lg border border-border/80 bg-background/95 px-3 py-2 shadow-xl backdrop-blur">
      <p className="mb-1 text-xs font-semibold text-foreground">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-xs" style={{ color: p.color }}>
          {p.name}: {p.value ?? "—"}
        </p>
      ))}
    </div>
  );
}

// ─── small reusable card ─────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  unit = "",
  sub,
  subColor = "text-muted-foreground",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  unit?: string;
  sub?: React.ReactNode;
  subColor?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-bold">
        {value}
        {unit && <span className="ml-1 text-base font-normal text-muted-foreground">{unit}</span>}
      </p>
      {sub && <p className={`mt-1 text-xs ${subColor}`}>{sub}</p>}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export const Dashboard = () => {
  const navigate = useNavigate();
  const { selectedChild } = useChildren();

  const [sensorStatus,  setSensorStatus]  = useState<any>(null);
  const [dailySummary,  setDailySummary]  = useState<any>(null);
  const [realtime,      setRealtime]      = useState<any>(null);
  const [baselineStatus,setBaselineStatus]= useState<any>(null);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [alerts,        setAlerts]        = useState<any[]>([]);
  const [topActivity,   setTopActivity]   = useState<any>(null);
  const [trendData,     setTrendData]     = useState<any[]>([]);

  // Ring buffer: last 30 live readings
  const [signalHistory, setSignalHistory] = useState<any[]>([]);

  // ── main polling effect (every 3s) ─────────────────────────────────────────
  useEffect(() => {
    if (!selectedChild) return;
    let alive = true;

    const fetchAll = async () => {
      try {
        const [sensor, summary, rt, baseline, session, alertsData, trend] =
          await Promise.allSettled([
            api.getSensorStatus(selectedChild.id),
            api.getDailySummary(selectedChild.id, "today"),
            api.getRealtimeAnalytics(selectedChild.id),
            api.getBaselineStatus(selectedChild.id),
            api.getActivityStatus(selectedChild.id),
            api.getAlerts(selectedChild.id),
            api.getEngagementTrend(selectedChild.id, "today"),
          ]);

        if (!alive) return;

        if (sensor.status    === "fulfilled") setSensorStatus(sensor.value);
        if (summary.status   === "fulfilled") setDailySummary(summary.value);
        if (rt.status        === "fulfilled") setRealtime(rt.value);
        if (baseline.status  === "fulfilled") setBaselineStatus(baseline.value);
        if (session.status   === "fulfilled") setActiveSession(session.value);
        if (alertsData.status === "fulfilled") setAlerts(alertsData.value ?? []);
        if (trend.status     === "fulfilled") setTrendData(trend.value?.trend ?? []);
      } catch {
        // silently continue — stale state is fine
      }
    };

    void fetchAll();
    const timer = setInterval(fetchAll, 3000);
    return () => { alive = false; clearInterval(timer); };
  }, [selectedChild]);

  // ── top activity fetch (less frequent) ─────────────────────────────────────
  useEffect(() => {
    if (!selectedChild) return;
    api.getActivityInsights(selectedChild.id, "today")
      .then((data: any) => {
        setTopActivity(data?.activities?.[0] ?? null);
      })
      .catch(() => {});
  }, [selectedChild]);

  // ── append sensorStatus to ring buffer ─────────────────────────────────────
  useEffect(() => {
    if (!sensorStatus?.heart_rate) return;
    setSignalHistory((prev) => {
      const next = [
        ...prev,
        {
          time:      new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          heartRate: sensorStatus.heart_rate,
          hrv:       sensorStatus.hrv_rmssd,
          motion:    sensorStatus.motion_level != null
                       ? Number(sensorStatus.motion_level.toFixed(2))
                       : null,
          spo2:      sensorStatus.spo2 ?? null,
        },
      ];
      return next.slice(-30);
    });
  }, [sensorStatus]);

  // ── derived values ──────────────────────────────────────────────────────────
  const isOnline     = sensorStatus?.device_status === "online";
  const liveHr       = sensorStatus?.heart_rate ?? null;
  const liveHrv      = sensorStatus?.hrv_rmssd  ?? null;
  const liveSpo2     = sensorStatus?.spo2;
  const unreadAlerts = alerts.filter((a: any) => !a.read).length;

  const baselineReady   = baselineStatus?.baseline_ready ?? false;
  const sessionActive   = activeSession?.session_active  ?? false;

  // Engagement from realtime (live), or null
  const liveEngagement: number | null = (() => {
    const score = realtime?.latest_engagement?.engagement_score;
    return typeof score === "number" ? score : null;
  })();
  const liveEngagementCategory: string | null =
    realtime?.latest_engagement?.activity_category ?? null;

  const engagementDisplay = useMemo<{ value: string; sub: string; subColor: string }>(() => {
    if (!baselineReady) {
      return { value: "—", sub: "Calibrate baseline first", subColor: "text-amber-400" };
    }
    if (!sessionActive) {
      return { value: "—", sub: "Start an activity session", subColor: "text-muted-foreground" };
    }
    if (liveEngagement !== null) {
      const status = toStatus(liveEngagement);
      const mode   = liveEngagementCategory === "active" ? "Active mode" : "Sedentary mode";
      return {
        value:    `${Math.round(liveEngagement * 100)}%`,
        sub:      `${status.label} · ${mode}`,
        subColor: status.color,
      };
    }
    return { value: "—", sub: "Waiting for data", subColor: "text-muted-foreground" };
  }, [baselineReady, sessionActive, liveEngagement, liveEngagementCategory]);

  // ── no child guard ──────────────────────────────────────────────────────────
  if (!selectedChild) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">No child selected. Add a child profile to continue.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-8">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="mb-1 text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          {sessionActive
            ? `Currently tracking "${activeSession.activity}" for ${selectedChild.child_name}`
            : `Realtime overview for ${selectedChild.child_name}`}
        </p>
      </div>

      {/* ── LIVE SESSION banner ────────────────────────────────────────────── */}
      {sessionActive && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-semibold text-emerald-300">
              <Radio className="mr-1 inline h-3 w-3" />
              LIVE: Tracking "{activeSession.activity}"
            </span>
            <span className="text-xs text-muted-foreground">
              Started {new Date(activeSession.started_at).toLocaleTimeString()}
            </span>
          </div>
        </div>
      )}

      {/* ── SETUP REQUIRED banner ─────────────────────────────────────────── */}
      {(!baselineReady || !sessionActive) && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <span className="text-2xl">💡</span>
          <div>
            <p className="font-semibold text-amber-300">Setup Required</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {!baselineReady ? (
                <>
                  Step 1:{" "}
                  <button
                    onClick={() => navigate("/app/baseline")}
                    className="text-emerald-400 underline"
                  >
                    Calibrate baseline (1 min)
                  </button>{" "}
                  to enable engagement scoring.
                </>
              ) : (
                <>
                  Step 2:{" "}
                  <button
                    onClick={() => navigate("/app/hobby-session")}
                    className="text-emerald-400 underline"
                  >
                    Start an activity session
                  </button>{" "}
                  to track engagement.
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {/* ── 5 STAT CARDS ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={<Heart className="h-4 w-4 text-red-400" />}
          label="Heart Rate"
          value={liveHr ?? "—"}
          unit={liveHr != null ? "bpm" : ""}
          sub={isOnline ? "● Live" : "○ Offline"}
          subColor={isOnline ? "text-emerald-400" : "text-muted-foreground"}
        />

        <StatCard
          icon={<Activity className="h-4 w-4 text-blue-400" />}
          label="HRV (RMSSD)"
          value={liveHrv ?? "—"}
          unit={liveHrv != null ? "ms" : ""}
          sub={isOnline ? "● Live" : "○ Offline"}
          subColor={isOnline ? "text-emerald-400" : "text-muted-foreground"}
        />

        <StatCard
          icon={<Zap className="h-4 w-4 text-green-400" />}
          label="Engagement"
          value={engagementDisplay.value}
          sub={
            !baselineReady ? (
              <button onClick={() => navigate("/app/baseline")} className="underline">
                {engagementDisplay.sub}
              </button>
            ) : !sessionActive ? (
              <button onClick={() => navigate("/app/hobby-session")} className="underline">
                {engagementDisplay.sub}
              </button>
            ) : (
              engagementDisplay.sub
            )
          }
          subColor={engagementDisplay.subColor}
        />

        <StatCard
          icon={<Droplets className="h-4 w-4 text-cyan-400" />}
          label="SpO2"
          value={liveSpo2 && liveSpo2 > 0 ? liveSpo2 : "—"}
          unit={liveSpo2 && liveSpo2 > 0 ? "%" : ""}
          sub={liveSpo2 && liveSpo2 > 0 ? "Blood oxygen" : "Not measured"}
          subColor={liveSpo2 && liveSpo2 > 0 ? "text-cyan-400" : "text-muted-foreground"}
        />

        <StatCard
          icon={<Bell className="h-4 w-4 text-orange-400" />}
          label="Unread Alerts"
          value={unreadAlerts}
          sub={unreadAlerts === 0 ? "All clear" : "Tap to review"}
          subColor={unreadAlerts > 0 ? "text-orange-400" : "text-emerald-400"}
        />
      </div>

      {/* ── TODAY'S TOP ACTIVITY ───────────────────────────────────────────── */}
      {topActivity && (
        <div className="flex items-center gap-4 rounded-lg border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-blue-500/10 p-4">
          <Trophy className="h-8 w-8 shrink-0 text-yellow-400" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">Today's Best Activity</p>
            <p className="text-xl font-bold text-emerald-400 truncate">{topActivity.activity}</p>
            <p className="text-xs text-muted-foreground">
              {(topActivity.avg_engagement * 100).toFixed(0)}% avg engagement ·{" "}
              {topActivity.sample_count} readings
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
              topActivity.activity_category === "active"
                ? "bg-orange-500/20 text-orange-300"
                : "bg-blue-500/20 text-blue-300"
            }`}
          >
            {topActivity.activity_category ?? "unknown"}
          </span>
        </div>
      )}

      {/* ── CHARTS ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Engagement Trend */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Today's Engagement Trend</h2>
          {trendData.length === 0 ? (
            <div className="flex h-[240px] items-center justify-center">
              <p className="text-center text-sm text-muted-foreground">
                No engagement data yet.
                <br />
                Start an activity session to see trends.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendData}>
                <defs>
                  <linearGradient id="dbEngFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="4 8" stroke="rgba(113,113,130,0.26)" />
                <XAxis
                  dataKey="date"
                  axisLine={false} tickLine={false}
                  stroke="#717182" tick={{ fontSize: 11 }}
                />
                <YAxis
                  axisLine={false} tickLine={false}
                  stroke="#717182" tick={{ fontSize: 11 }}
                  domain={[0, 1]}
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                />
                <Tooltip content={<TrendTooltip />} cursor={{ stroke: "rgba(6,182,212,0.45)", strokeWidth: 1.5 }} />
                <Area type="monotone" dataKey="avg_engagement" stroke="none" fill="url(#dbEngFill)" />
                <Line
                  type="monotone" dataKey="avg_engagement"
                  stroke="#06b6d4" strokeWidth={3} dot={false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff", fill: "#06b6d4" }}
                  name="Engagement"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Live Sensor Signals */}
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Live Sensor Signals</h2>
            <span className={`text-xs font-medium ${isOnline ? "text-emerald-400" : "text-muted-foreground"}`}>
              {isOnline ? "● Online" : "○ Offline"}
            </span>
          </div>
          {signalHistory.length === 0 ? (
            <div className="flex h-[240px] items-center justify-center">
              <p className="text-sm text-muted-foreground">
                {isOnline ? "Collecting readings…" : "Attach sensor to see live signals."}
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={signalHistory}>
                <CartesianGrid vertical={false} strokeDasharray="4 8" stroke="rgba(113,113,130,0.26)" />
                <XAxis
                  dataKey="time"
                  axisLine={false} tickLine={false}
                  stroke="#717182" tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  axisLine={false} tickLine={false}
                  stroke="#717182" tick={{ fontSize: 11 }}
                />
                <Tooltip content={<SignalTooltip />} cursor={{ stroke: "rgba(148,163,184,0.3)", strokeWidth: 1 }} />
                <Line type="monotone" dataKey="heartRate" stroke="#ef4444" strokeWidth={2.4} dot={false} name="HR (bpm)" />
                <Line type="monotone" dataKey="hrv"       stroke="#3b82f6" strokeWidth={2.4} dot={false} name="HRV (ms)" />
                <Line type="monotone" dataKey="motion"    stroke="#22c55e" strokeWidth={2}   dot={false} name="Motion" />
                <Line type="monotone" dataKey="spo2"      stroke="#06b6d4" strokeWidth={2}   dot={false} name="SpO2 (%)" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── DAILY SUMMARY FOOTER ──────────────────────────────────────────── */}
      {dailySummary && dailySummary.sample_count > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="mb-3 text-sm font-semibold text-muted-foreground">Today's Averages</p>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xl font-bold">{dailySummary.average_heart_rate.toFixed(0)}</p>
              <p className="text-xs text-muted-foreground">Avg HR (bpm)</p>
            </div>
            <div>
              <p className="text-xl font-bold">{dailySummary.average_hrv.toFixed(0)}</p>
              <p className="text-xs text-muted-foreground">Avg HRV (ms)</p>
            </div>
            <div>
              <p className="text-xl font-bold">
                {dailySummary.average_engagement_score > 0
                  ? `${(dailySummary.average_engagement_score * 100).toFixed(0)}%`
                  : "—"}
              </p>
              <p className="text-xs text-muted-foreground">Avg Engagement</p>
            </div>
          </div>
          <p className="mt-2 text-right text-xs text-muted-foreground">
            Based on {dailySummary.sample_count} readings today
          </p>
        </div>
      )}
    </div>
  );
};
