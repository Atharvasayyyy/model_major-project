import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Clock3, Loader2, Radio, Zap } from "lucide-react";
import { useChildren } from "../context/ChildrenContext";
import { api } from "../services/api";

const SESSION_SECONDS       = 3 * 60;
const SENSOR_STREAM_STALE_MS = 30_000;

// Activity → category mapping (must mirror backend activityRoutes)
const ACTIVITY_CATEGORIES: Record<string, "active" | "sedentary"> = {
  Reading:      "sedentary",
  Math:         "sedentary",
  Drawing:      "sedentary",
  Music:        "sedentary",
  "Screen Time":"sedentary",
  Other:        "sedentary",
  Sports:       "active",
  "Free Play":  "active",
};

function formatTime(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
function formatDuration(s: number) {
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
function resolveChildId(v: any): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") return v.$oid || v._id || "";
  return "";
}

export const HobbySession = () => {
  const navigate = useNavigate();
  const { selectedChild } = useChildren();

  // ── activity state ───────────────────────────────────────────────────────
  const [activities,       setActivities]       = useState<string[]>([]);
  const [activitiesLoading,setActivitiesLoading]= useState(true);
  const [activity,         setActivity]          = useState("");
  const [category,         setCategory]          = useState<"active"|"sedentary">("sedentary");

  // ── session state ────────────────────────────────────────────────────────
  const [secondsLeft,  setSecondsLeft]  = useState(SESSION_SECONDS);
  const [isRunning,    setIsRunning]    = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete,   setIsComplete]   = useState(false);
  const [baselineReady,setBaselineReady]= useState(false);
  const [error,        setError]        = useState("");
  const finishTriggeredRef = useRef(false);

  // ── sensor / live ────────────────────────────────────────────────────────
  const [sensorOnline,  setSensorOnline]  = useState(false);
  const [sensorReady,   setSensorReady]   = useState(false);
  const [sensorHint,    setSensorHint]    = useState("Attach the sensor and wait for live readings.");
  const [liveData,      setLiveData]      = useState<any>(null);

  // ── history ──────────────────────────────────────────────────────────────
  const [history,        setHistory]        = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // ── derive category when activity changes ────────────────────────────────
  useEffect(() => {
    setCategory(ACTIVITY_CATEGORIES[activity] ?? "sedentary");
  }, [activity]);

  // ── fetch activity list ──────────────────────────────────────────────────
  useEffect(() => {
    api.getActivityCategories()
      .then((data: any) => {
        const list: string[] = data?.activities || [];
        setActivities(list);
        setActivity(list.includes("Reading") ? "Reading" : (list[0] || ""));
        setActivitiesLoading(false);
      })
      .catch(() => setActivitiesLoading(false));
  }, []);

  // ── fetch history ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedChild) return;
    setHistoryLoading(true);
    api.getActivityHistory(selectedChild.id, 10)
      .then((data: any) => {
        const sessions = Array.isArray(data) ? data : data?.sessions || [];
        setHistory(sessions);
        setHistoryLoading(false);
      })
      .catch(() => { setHistory([]); setHistoryLoading(false); });
  }, [selectedChild, isComplete]);

  // ── hydrate in-progress session on mount ────────────────────────────────
  useEffect(() => {
    if (!selectedChild) return;
    let mounted = true;
    const verify = async () => {
      try {
        const [status, actStatus] = await Promise.all([
          api.getBaselineStatus(selectedChild.id),
          api.getActivityStatus(selectedChild.id),
        ]);
        if (!mounted) return;
        setBaselineReady(status.baseline_ready);
        if (actStatus.session_active && actStatus.started_at) {
          const elapsed = Math.floor((Date.now() - new Date(actStatus.started_at).getTime()) / 1000);
          const remaining = Math.max(0, SESSION_SECONDS - elapsed);
          setActivity(actStatus.activity || activities[0] || "");
          setSecondsLeft(remaining);
          setIsRunning(remaining > 0);
          if (remaining <= 0) {
            try { await api.finishActivitySession(selectedChild.id); setIsComplete(true); } catch {}
          }
        }
      } catch { setBaselineReady(false); }
    };
    void verify();
    return () => { mounted = false; };
  }, [selectedChild]);

  // ── countdown tick ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isRunning) return;
    const tick = setInterval(() => setSecondsLeft(p => Math.max(0, p - 1)), 1000);
    return () => clearInterval(tick);
  }, [isRunning]);

  // ── sensor status poll (2s) ──────────────────────────────────────────────
  useEffect(() => {
    if (!selectedChild) return;
    const poll = setInterval(async () => {
      try {
        const [sRes, stRes] = await Promise.allSettled([
          api.getSensorStatus(selectedChild.id),
          api.getSensorStreamDebug(),
        ]);
        const sensor = sRes.status === "fulfilled" ? sRes.value : null;
        const stream = stRes.status === "fulfilled" ? stRes.value : [];

        const childRows = (Array.isArray(stream) ? stream : [])
          .filter((r: any) => resolveChildId(r?.child_id) === selectedChild.id)
          .sort((a: any, b: any) => new Date(b?.timestamp||0).getTime() - new Date(a?.timestamp||0).getTime());

        const latest = childRows[0] ?? null;
        const ts = latest?.timestamp ? new Date(latest.timestamp).getTime() : 0;
        const fresh = ts > 0 && Date.now() - ts <= SENSOR_STREAM_STALE_MS;
        const online = sensor?.device_status === "online" || fresh;

        setSensorOnline(online);
        setSensorReady(online);
        setSensorHint(online
          ? (sensor?.heart_rate ? "Sensor connected. Live readings are valid." : "Place finger on sensor and wait for stable readings.")
          : "No sensor reading detected. Please attach the sensor and run the bridge.");
      } catch {
        setSensorOnline(false); setSensorReady(false);
        setSensorHint("Unable to read sensor status.");
      }
    }, 2000);
    return () => clearInterval(poll);
  }, [selectedChild]);

  // ── live data poll while session running (2s) ────────────────────────────
  useEffect(() => {
    if (!isRunning || !selectedChild) return;
    const poll = setInterval(async () => {
      try {
        const [sensor, realtime] = await Promise.all([
          api.getSensorStatus(selectedChild.id),
          api.getRealtimeAnalytics(selectedChild.id),
        ]);
        setLiveData({ sensor, realtime });
      } catch {}
    }, 2000);
    return () => clearInterval(poll);
  }, [isRunning, selectedChild]);

  // ── auto-finish at 0 ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isRunning || !selectedChild || secondsLeft > 0 || finishTriggeredRef.current) return;
    finishTriggeredRef.current = true;
    setIsSubmitting(true);
    void (async () => {
      try {
        const result = await api.finishActivitySession(selectedChild.id);
        setIsComplete(true); setIsRunning(false);
        alert(`Session finished.\nDuration: ${result.duration_seconds}s\nAvg Engagement: ${result.avg_engagement ?? "N/A"}`);
      } catch (e: any) { setError(e?.response?.data?.message || "Failed to finish session."); }
      finally { setIsSubmitting(false); }
    })();
  }, [secondsLeft, isRunning, selectedChild]);

  const progressPct = useMemo(() => {
    return Math.max(0, Math.min(100, ((SESSION_SECONDS - secondsLeft) / SESSION_SECONDS) * 100));
  }, [secondsLeft]);

  // ── handlers ─────────────────────────────────────────────────────────────
  const handleStart = async () => {
    if (!selectedChild || !baselineReady || isRunning || isSubmitting) return;
    if (!sensorReady) { setError("Attach sensor and wait until valid readings are available."); return; }
    setError(""); setIsSubmitting(true); setIsComplete(false); finishTriggeredRef.current = false;
    try {
      await api.startActivitySession(selectedChild.id, activity);
      setSecondsLeft(SESSION_SECONDS); setIsRunning(true); setLiveData(null);
    } catch (e: any) { setError(e?.response?.data?.message || "Failed to start session."); }
    finally { setIsSubmitting(false); }
  };

  const handleStop = async () => {
    if (!selectedChild || !isRunning || isSubmitting) return;
    if (!confirm("End session early? Engagement summary will be computed for collected data.")) return;
    finishTriggeredRef.current = true; setIsSubmitting(true);
    try {
      const result = await api.finishActivitySession(selectedChild.id);
      setIsComplete(true); setIsRunning(false); setSecondsLeft(0);
      alert(`Session ended.\nDuration: ${result.duration_seconds}s\nAvg Engagement: ${result.avg_engagement ?? "N/A"}`);
    } catch (err: any) { alert("Failed to stop: " + (err?.response?.data?.message || err.message)); finishTriggeredRef.current = false; }
    finally { setIsSubmitting(false); }
  };

  // ── guards ────────────────────────────────────────────────────────────────
  if (!selectedChild) return (
    <div className="p-8">
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-muted-foreground">Select a child profile first to start a hobby monitoring session.</p>
      </div>
    </div>
  );

  if (!baselineReady) return (
    <div className="p-8">
      <div className="mx-auto max-w-2xl rounded-lg border border-amber-500/40 bg-amber-500/10 p-6">
        <h1 className="text-2xl font-bold">Hobby Monitoring Session</h1>
        <p className="mt-3 text-amber-200">Baseline calibration is required before hobby monitoring can begin.</p>
        <button onClick={() => navigate("/app/baseline")} className="mt-4 rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white transition hover:bg-amber-700">
          Go To Baseline Calibration
        </button>
      </div>
    </div>
  );

  // ── derived live values ───────────────────────────────────────────────────
  const liveHR      = liveData?.sensor?.heart_rate ?? null;
  const liveHRV     = liveData?.sensor?.hrv_rmssd  ?? null;
  const liveMotion  = liveData?.sensor?.motion_level ?? null;
  const liveScore   = liveData?.realtime?.latest_engagement?.engagement_score ?? null;
  const hrBaseline  = selectedChild.hr_baseline  || 0;
  const hrvBaseline = selectedChild.rmssd_baseline || 0;

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Hobby Monitoring Session</h1>
        <p className="mt-1 text-muted-foreground">
          {isRunning
            ? `Recording "${activity}" — engagement is being computed in real time`
            : `Configure and start an activity session for ${selectedChild.child_name}`}
        </p>
      </div>

      {/* ── RECORDING BANNER ─────────────────────────────────────────────── */}
      {isRunning && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
          <span className="h-3 w-3 animate-pulse rounded-full bg-emerald-400" />
          <div className="flex-1">
            <p className="font-semibold text-emerald-300">
              <Radio className="mr-1 inline h-3 w-3" />
              RECORDING — {activity} ({category})
            </p>
            <p className="text-xs text-muted-foreground">Engagement scores being computed and stored</p>
          </div>
          <button onClick={handleStop} disabled={isSubmitting}
            className="rounded bg-red-600 px-4 py-1 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60">
            Stop Early
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      <div className="mx-auto max-w-3xl space-y-6 rounded-xl border border-border bg-card p-8">

        {/* ── ACTIVITY SELECTOR ──────────────────────────────────────────── */}
        <div>
          <label className="mb-2 block text-sm text-muted-foreground">Activity name</label>
          <div className="flex items-center gap-3">
            <select value={activity} onChange={e => setActivity(e.target.value)}
              disabled={isRunning || activitiesLoading}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 disabled:opacity-60">
              {activitiesLoading ? <option>Loading...</option>
                : activities.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <span className={`shrink-0 rounded-lg border px-4 py-2 text-sm font-bold ${
              category === "active"
                ? "border-orange-500/40 bg-orange-500/20 text-orange-300"
                : "border-blue-500/40 bg-blue-500/20 text-blue-300"
            }`}>
              {category === "active" ? "🏃 ACTIVE" : "📖 SEDENTARY"}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {category === "active"
              ? "Motion is interpreted as engagement (running, playing = engaged)"
              : "Motion is interpreted as restlessness (fidgeting = disengaged)"}
          </p>
        </div>

        {/* ── TIMER + SENSOR STATUS ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="mb-2 flex items-center gap-2 text-muted-foreground"><Clock3 className="h-4 w-4" /> Countdown</div>
            <p className="text-3xl font-semibold tabular-nums">{formatTime(secondsLeft)}</p>
            <p className={`mt-1 text-xs ${sensorOnline ? "text-emerald-400" : "text-amber-400"}`}>{sensorHint}</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="mb-2 flex items-center gap-2 text-muted-foreground"><Zap className="h-4 w-4" /> Progress</div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full bg-cyan-500 transition-all duration-700" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{progressPct.toFixed(0)}%</p>
          </div>
        </div>

        {/* ── LIVE METRIC CARDS ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {/* Heart Rate */}
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="mb-1 text-xs text-muted-foreground">Heart Rate</p>
            <p className="text-2xl font-bold">
              {liveHR ?? "—"}{liveHR && <span className="ml-1 text-sm font-normal text-muted-foreground">bpm</span>}
            </p>
            {liveHR && hrBaseline > 0 && (
              <p className={`mt-1 text-xs ${
                liveHR > hrBaseline + 10 ? "text-orange-400" :
                liveHR < hrBaseline - 5  ? "text-blue-400"   : "text-emerald-400"}`}>
                {liveHR > hrBaseline + 10 ? "↑ Elevated" : liveHR < hrBaseline - 5 ? "↓ Calm" : "≈ Normal"}
              </p>
            )}
          </div>

          {/* HRV */}
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="mb-1 text-xs text-muted-foreground">HRV</p>
            <p className="text-2xl font-bold">
              {liveHRV != null ? liveHRV.toFixed(0) : "—"}
              {liveHRV != null && <span className="ml-1 text-sm font-normal text-muted-foreground">ms</span>}
            </p>
            {liveHRV != null && hrvBaseline > 0 && (
              <p className={`mt-1 text-xs ${liveHRV < hrvBaseline * 0.7 ? "text-orange-400" : "text-emerald-400"}`}>
                {liveHRV < hrvBaseline * 0.7 ? "↓ Stress" : "≈ Healthy"}
              </p>
            )}
          </div>

          {/* Motion — context-aware */}
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="mb-1 text-xs text-muted-foreground">Motion</p>
            <p className="text-2xl font-bold">{liveMotion != null ? liveMotion.toFixed(2) : "—"}</p>
            {liveMotion != null && (
              <p className={`mt-1 text-xs ${
                category === "active"
                  ? liveMotion > 1  ? "text-emerald-400" : "text-muted-foreground"
                  : liveMotion > 0.5 ? "text-orange-400"  : "text-emerald-400"
              }`}>
                {category === "active"
                  ? liveMotion > 1  ? "✓ Engaged movement" : "Low movement"
                  : liveMotion > 0.5 ? "⚠ Restless"        : "✓ Still"}
              </p>
            )}
          </div>

          {/* Engagement */}
          <div className="rounded-lg border border-purple-500/30 bg-gradient-to-br from-purple-900/20 to-blue-900/20 p-4">
            <p className="mb-1 text-xs text-purple-300">Engagement</p>
            <p className="text-2xl font-bold">
              {liveScore != null ? `${Math.round(liveScore * 100)}%` : "—"}
            </p>
            {liveScore != null && (
              <p className={`mt-1 text-xs ${
                liveScore >= 0.7 ? "text-emerald-400" :
                liveScore >= 0.4 ? "text-amber-400"   : "text-red-400"}`}>
                {liveScore >= 0.7 ? "🔥 Highly engaged" : liveScore >= 0.4 ? "👍 Engaged" : "💭 Disengaged"}
              </p>
            )}
          </div>
        </div>

        {/* ── SCORING EXPLAINER ─────────────────────────────────────────── */}
        <div className={`rounded-lg border p-5 ${
          category === "active"
            ? "border-orange-500/30 bg-orange-500/5"
            : "border-blue-500/30 bg-blue-500/5"
        }`}>
          <h4 className={`mb-3 flex items-center gap-2 font-semibold ${
            category === "active" ? "text-orange-300" : "text-blue-300"
          }`}>
            💡 How "{activity}" is scored
          </h4>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Heart Rate ↑</p>
              <p className="text-muted-foreground">Indicates arousal — excitement, focus, or stress</p>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">HRV ↓</p>
              <p className="text-muted-foreground">Lower variability = sympathetic nervous activation</p>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Motion</p>
              <p className={category === "active" ? "text-orange-300" : "text-blue-300"}>
                {category === "active"
                  ? "✓ HIGH motion = good (active engagement)"
                  : "✗ HIGH motion = bad (restlessness)"}
              </p>
            </div>
          </div>
          <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
            Engagement = sigmoid(arousal) × sigmoid(
            <span className="font-mono font-semibold text-foreground">
              {category === "active" ? "+0.3" : "−1.0"}
            </span>
            × motion){" "}
            <span className="text-muted-foreground/50">
              — motion coefficient flips sign based on activity category
            </span>
          </p>
        </div>

        {/* ── START / IN-PROGRESS BUTTONS ──────────────────────────────── */}
        {!isComplete && !isRunning && (
          <button onClick={handleStart}
            disabled={isRunning || isSubmitting || !sensorReady || activitiesLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-5 py-3 font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60">
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Start Activity Session
          </button>
        )}

        {isRunning && (
          <div className="flex flex-wrap gap-3">
            <p className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200">
              <Radio className="h-4 w-4" /> Collecting sensor data for activity analytics.
            </p>
            <button onClick={handleStop} disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-3 font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Stop Session
            </button>
          </div>
        )}

        {isComplete && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-emerald-200">
            <p className="font-semibold">Activity session finished successfully.</p>
            <p className="mt-1 text-sm">You can now review engagement trends in Dashboard and Analytics.</p>
            <button onClick={() => navigate("/app/analytics")}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white transition hover:bg-emerald-700">
              <Zap className="h-4 w-4" /> View Analytics
            </button>
          </div>
        )}
      </div>

      {/* ── PAST SESSIONS TABLE ───────────────────────────────────────────── */}
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Past Sessions</h2>
          {history.length > 0 && (
            <span className="text-sm text-muted-foreground">
              Last {history.length} session{history.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {historyLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : history.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <div className="mb-2 text-4xl">📊</div>
            <p className="text-muted-foreground">No past sessions yet.</p>
            <p className="mt-1 text-xs text-muted-foreground">Start your first activity session above to see history here.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="p-3 text-left font-semibold text-muted-foreground">Activity</th>
                  <th className="p-3 text-left font-semibold text-muted-foreground">Started</th>
                  <th className="p-3 text-left font-semibold text-muted-foreground">Duration</th>
                  <th className="p-3 text-left font-semibold text-muted-foreground">Avg Engagement</th>
                  <th className="p-3 text-left font-semibold text-muted-foreground">Samples</th>
                </tr>
              </thead>
              <tbody>
                {history.map((s: any) => (
                  <tr key={s._id} className="border-t border-border/50 transition-colors hover:bg-secondary/30">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{s.activity}</span>
                        {s.category && (
                          <span className={`rounded px-2 py-0.5 text-xs ${
                            s.category === "active"
                              ? "bg-orange-500/20 text-orange-300"
                              : "bg-blue-500/20 text-blue-300"
                          }`}>{s.category}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{new Date(s.started_at).toLocaleString()}</td>
                    <td className="p-3">
                      {s.duration_seconds ? formatDuration(s.duration_seconds) : "—"}
                    </td>
                    <td className="p-3">
                      {s.avg_engagement != null ? (
                        <span className={`font-mono font-bold ${
                          s.avg_engagement >= 0.7 ? "text-emerald-400" :
                          s.avg_engagement >= 0.4 ? "text-amber-400"   : "text-red-400"
                        }`}>{(s.avg_engagement * 100).toFixed(0)}%</span>
                      ) : "—"}
                    </td>
                    <td className="p-3 text-muted-foreground">{s.sample_count || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
