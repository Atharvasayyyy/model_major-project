import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Heart, Activity, Zap, TrendingUp, Droplets } from "lucide-react";
import { useChildren } from "../context/ChildrenContext";
import { api } from "../../services/api";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";

// ─── tooltip ────────────────────────────────────────────────────────────────
function MonitoringTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[180px] rounded-lg border border-border/80 bg-background/95 px-3 py-2 shadow-xl backdrop-blur">
      <p className="mb-1 text-xs font-semibold text-foreground">{label}</p>
      {payload.map((e: any) => (
        <p key={e.name} className="text-xs" style={{ color: e.color }}>
          {e.name}: {Number(e.value).toFixed(2)}
        </p>
      ))}
    </div>
  );
}

// ─── engagement score → label / color ────────────────────────────────────────
function scoreLabel(s: number) {
  if (s >= 0.7) return { label: "🔥 Highly Engaged", color: "#10b981" };
  if (s >= 0.4) return { label: "👍 Engaged",         color: "#f59e0b" };
  return             { label: "💭 Disengaged",         color: "#ef4444" };
}

// ─── main component ───────────────────────────────────────────────────────────
export const Monitoring = () => {
  const navigate = useNavigate();
  const { selectedChild } = useChildren();

  const [sensorStatus,   setSensorStatus]   = useState<any>(null);
  const [activeSession,  setActiveSession]  = useState<any>(null);
  const [baselineStatus, setBaselineStatus] = useState<any>(null);
  const [realtime,       setRealtime]       = useState<any>(null);

  // ring buffer — last 60 live readings (~2 min at 2-second poll)
  const [signalHistory, setSignalHistory] = useState<any[]>([]);

  // ── polling effect (every 2s) ─────────────────────────────────────────────
  useEffect(() => {
    if (!selectedChild) return;
    let alive = true;

    const fetchAll = async () => {
      const [sensor, session, baseline, rt] = await Promise.allSettled([
        api.getSensorStatus(selectedChild.id),
        api.getActivityStatus(selectedChild.id),
        api.getBaselineStatus(selectedChild.id),
        api.getRealtimeAnalytics(selectedChild.id),
      ]);
      if (!alive) return;
      const s = sensor.status   === "fulfilled" ? sensor.value   : null;
      const se= session.status  === "fulfilled" ? session.value  : null;
      const b = baseline.status === "fulfilled" ? baseline.value : null;
      const r = rt.status       === "fulfilled" ? rt.value       : null;
      setSensorStatus(s);
      setActiveSession(se);
      setBaselineStatus(b);
      setRealtime(r);

      // append to ring buffer when sensor has data
      if (s?.heart_rate) {
        setSignalHistory(prev => [...prev, {
          time:        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          heart_rate:  s.heart_rate,
          hrv:         s.hrv_rmssd   ?? null,
          motion:      s.motion_level != null ? Number(s.motion_level.toFixed(3)) : null,
          engagement:  r?.latest_engagement?.engagement_score != null
                         ? Number((r.latest_engagement.engagement_score * 100).toFixed(1))
                         : null,
        }].slice(-60));
      }
    };

    void fetchAll();
    const timer = setInterval(fetchAll, 2000);
    return () => { alive = false; clearInterval(timer); };
  }, [selectedChild]);

  // ── derived flags ─────────────────────────────────────────────────────────
  const isOnline        = sensorStatus?.device_status === "online";
  const isBaselineReady = baselineStatus?.baseline_ready === true;
  const isSessionActive = activeSession?.session_active  === true;
  const canScore        = isOnline && isBaselineReady && isSessionActive;

  const liveScore = realtime?.latest_engagement?.engagement_score ?? null;

  // ── no child guard ────────────────────────────────────────────────────────
  if (!selectedChild) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">Select a child profile first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-8">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="mb-1 text-3xl font-bold">Live Monitoring</h1>
        <p className="text-muted-foreground">
          Real-time physiological data for {selectedChild.child_name}
        </p>
      </div>

      {/* ── CONTEXTUAL STATUS BANNER ──────────────────────────────────────── */}
      {!isOnline ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
          <span className="h-3 w-3 rounded-full bg-muted-foreground" />
          <div>
            <p className="font-semibold">Sensor offline</p>
            <p className="text-xs text-muted-foreground">Connect ESP32 and start the bridge to see live data.</p>
          </div>
        </div>
      ) : !isBaselineReady ? (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <span className="text-2xl">💡</span>
          <div className="flex-1">
            <p className="font-semibold text-amber-300">Baseline not calibrated</p>
            <p className="text-xs text-muted-foreground">Engagement and stress scoring require baseline calibration first.</p>
          </div>
          <button onClick={() => navigate("/app/baseline")}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600">
            Calibrate
          </button>
        </div>
      ) : !isSessionActive ? (
        <div className="flex items-center gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
          <span className="text-2xl">📊</span>
          <div className="flex-1">
            <p className="font-semibold text-blue-300">Sensor live — no active session</p>
            <p className="text-xs text-muted-foreground">Start an activity session to enable engagement scoring.</p>
          </div>
          <button onClick={() => navigate("/app/hobby-session")}
            className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600">
            Start Session
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
          <span className="h-3 w-3 animate-pulse rounded-full bg-emerald-400" />
          <div className="flex-1">
            <p className="font-semibold text-emerald-300">
              ● LIVE — Tracking {activeSession.activity}
            </p>
            <p className="text-xs text-muted-foreground">
              Engagement scores being computed in real-time.{" "}
              Category: {activeSession.category === "active" ? "🏃 ACTIVE" : "📖 SEDENTARY"}
            </p>
          </div>
          {activeSession.started_at && (
            <span className="text-xs text-muted-foreground">
              Started {new Date(activeSession.started_at).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}

      {/* ── CURRENT ACTIVITY + ENGAGEMENT GAUGE ─────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">

          {/* Current Activity card */}
          <div>
            <h2 className="mb-4 text-xl font-semibold">Current Activity</h2>
            {isSessionActive ? (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-5">
                <p className="mb-2 text-2xl font-bold">{activeSession.activity}</p>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    activeSession.category === "active"
                      ? "bg-orange-500/20 text-orange-300"
                      : "bg-blue-500/20 text-blue-300"
                  }`}>
                    {activeSession.category === "active" ? "🏃 ACTIVE" : "📖 SEDENTARY"}
                  </span>
                  {activeSession.started_at && (
                    <span className="text-xs text-muted-foreground">
                      {Math.floor((Date.now() - new Date(activeSession.started_at).getTime()) / 60000)}m elapsed
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-secondary/30 p-5">
                <p className="text-xl font-bold text-muted-foreground">No active session</p>
                <p className="mt-1 text-sm text-muted-foreground">Start a session to begin tracking engagement.</p>
              </div>
            )}
          </div>

          {/* Engagement Level */}
          <div>
            <h2 className="mb-4 text-xl font-semibold">Engagement Level</h2>
            <div className="flex h-[120px] flex-col items-center justify-center rounded-lg border border-border bg-background">
              {!canScore ? (
                <div className="text-center">
                  <p className="text-4xl text-muted-foreground">—</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {!isBaselineReady ? "Baseline required" :
                     !isSessionActive ? "Start session to score" :
                     "Waiting for sensor"}
                  </p>
                </div>
              ) : liveScore != null ? (
                <div className="text-center">
                  <p className="text-5xl font-bold" style={{ color: scoreLabel(liveScore).color }}>
                    {Math.round(liveScore * 100)}%
                  </p>
                  <p className="mt-1 text-sm font-semibold" style={{ color: scoreLabel(liveScore).color }}>
                    {scoreLabel(liveScore).label}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Waiting for first valid reading…</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 5 METRIC CARDS ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">

        {/* HR */}
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Heart className="h-4 w-4 text-red-400" /> Heart Rate
          </div>
          <p className="text-2xl font-bold">
            {sensorStatus?.heart_rate ?? "—"}
            {sensorStatus?.heart_rate && <span className="ml-1 text-sm font-normal text-muted-foreground">bpm</span>}
          </p>
          {selectedChild.hr_baseline > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">Baseline: {selectedChild.hr_baseline.toFixed(1)} bpm</p>
          )}
        </div>

        {/* HRV */}
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Activity className="h-4 w-4 text-blue-400" /> HRV
          </div>
          <p className="text-2xl font-bold">
            {sensorStatus?.hrv_rmssd != null ? sensorStatus.hrv_rmssd.toFixed(1) : "—"}
            {sensorStatus?.hrv_rmssd != null && <span className="ml-1 text-sm font-normal text-muted-foreground">ms</span>}
          </p>
          {selectedChild.rmssd_baseline > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">Baseline: {selectedChild.rmssd_baseline.toFixed(1)} ms</p>
          )}
        </div>

        {/* Motion — FIXED UNIT (m/s² not %) */}
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Zap className="h-4 w-4 text-purple-400" /> Motion
          </div>
          <p className="text-2xl font-bold">
            {sensorStatus?.motion_level != null ? sensorStatus.motion_level.toFixed(2) : "—"}
            {sensorStatus?.motion_level != null && <span className="ml-1 text-sm font-normal text-muted-foreground">m/s²</span>}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Post-gravity removal</p>
        </div>

        {/* SpO2 */}
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Droplets className="h-4 w-4 text-cyan-400" /> SpO2
          </div>
          <p className="text-2xl font-bold">
            {sensorStatus?.spo2 && sensorStatus.spo2 > 0 ? sensorStatus.spo2 : "—"}
            {sensorStatus?.spo2 > 0 && <span className="ml-1 text-sm font-normal text-muted-foreground">%</span>}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Blood oxygen</p>
        </div>

        {/* Arousal — gated on canScore */}
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4 text-green-400" /> Arousal
          </div>
          <p className="text-2xl font-bold">
            {canScore && realtime?.latest_engagement?.arousal != null
              ? `${(realtime.latest_engagement.arousal * 100).toFixed(0)}%`
              : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {canScore ? "Physiological activation" : "Requires active session"}
          </p>
        </div>
      </div>

      {/* ── ACTIVITY CONTEXT STRIP (when session active) ──────────────────── */}
      {isSessionActive && (
        <div className={`rounded-lg border p-4 ${
          activeSession.category === "active"
            ? "border-orange-500/30 bg-orange-500/5"
            : "border-blue-500/30 bg-blue-500/5"
        }`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{activeSession.category === "active" ? "🏃" : "📖"}</span>
            <div className="flex-1">
              <p className="font-semibold">
                {activeSession.category === "active" ? "Active Activity Mode" : "Sedentary Activity Mode"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {activeSession.category === "active"
                  ? "Higher motion = higher engagement score (movement indicates participation)"
                  : "Higher motion = lower engagement score (motion indicates restlessness)"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Motion coefficient</p>
              <p className={`text-2xl font-bold ${
                activeSession.category === "active" ? "text-orange-400" : "text-blue-400"
              }`}>
                {activeSession.category === "active" ? "+0.3" : "−1.0"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── TREND CHARTS ──────────────────────────────────────────────────── */}
      {signalHistory.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <div className="mb-2 text-4xl">📊</div>
          <p className="text-muted-foreground">Waiting for live sensor data…</p>
          <p className="mt-1 text-xs text-muted-foreground">Charts will populate as sensor readings arrive.</p>
        </div>
      ) : (
        <>
          {/* Chart 1 — HR + Engagement */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 text-xl font-semibold">Heart Rate &amp; Engagement</h2>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={signalHistory}>
                <CartesianGrid vertical={false} strokeDasharray="4 8" stroke="rgba(113,113,130,0.26)" />
                <XAxis dataKey="time" axisLine={false} tickLine={false} stroke="#717182" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis yAxisId="left"  axisLine={false} tickLine={false} stroke="#717182" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} axisLine={false} tickLine={false} stroke="#717182" tick={{ fontSize: 11 }} />
                <Tooltip content={<MonitoringTooltip />} cursor={{ stroke: "rgba(6,182,212,0.4)", strokeWidth: 1.5 }} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} iconType="circle" />
                <Line yAxisId="left"  type="monotone" dataKey="heart_rate"  stroke="#ef4444" strokeWidth={2.5} dot={false} name="Heart Rate (bpm)" connectNulls />
                <Line yAxisId="right" type="monotone" dataKey="engagement"  stroke="#06b6d4" strokeWidth={2.5} dot={false} name="Engagement (%)"   connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Chart 2 — HRV + Motion */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 text-xl font-semibold">HRV &amp; Motion</h2>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={signalHistory}>
                <CartesianGrid vertical={false} strokeDasharray="4 8" stroke="rgba(113,113,130,0.26)" />
                <XAxis dataKey="time" axisLine={false} tickLine={false} stroke="#717182" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis yAxisId="left"  axisLine={false} tickLine={false} stroke="#717182" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} stroke="#717182" tick={{ fontSize: 11 }} />
                <Tooltip content={<MonitoringTooltip />} cursor={{ stroke: "rgba(16,185,129,0.4)", strokeWidth: 1.5 }} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} iconType="circle" />
                <Line yAxisId="left"  type="monotone" dataKey="hrv"    stroke="#3b82f6" strokeWidth={2.5} dot={false} name="HRV (ms)"     connectNulls />
                <Line yAxisId="right" type="monotone" dataKey="motion" stroke="#22c55e" strokeWidth={2.5} dot={false} name="Motion (m/s²)" connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
};
