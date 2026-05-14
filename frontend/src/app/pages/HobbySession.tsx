import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Clock3, Loader2, Radio, Zap } from "lucide-react";
import { useChildren } from "../context/ChildrenContext";
import { api } from "../services/api";

// FIX A2 spec: SESSION_SECONDS matches baseline duration (180 s = 3 min)
const SESSION_SECONDS = 3 * 60;
const SENSOR_STREAM_STALE_MS = 30_000;

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function resolveChildId(value: any): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    if (typeof value.$oid === "string") return value.$oid;
    if (typeof value._id === "string") return value._id;
  }
  return "";
}

export const HobbySession = () => {
  const navigate = useNavigate();
  const { selectedChild } = useChildren();

  // ── FIX A1: activities / activitiesLoading state (spec names) ──────────────
  const [activities, setActivities] = useState<string[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [activity, setActivity] = useState("");

  // ── FIX B3: history / historyLoading state (spec names) ───────────────────
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [secondsLeft, setSecondsLeft] = useState(SESSION_SECONDS);
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [baselineReady, setBaselineReady] = useState(false);
  const [sensorOnline, setSensorOnline] = useState(false);
  const [sensorReady, setSensorReady] = useState(false);
  const [sensorHint, setSensorHint] = useState("Attach the sensor and wait for live readings.");
  const [error, setError] = useState("");
  const [live, setLive] = useState<{
    heart_rate: number | null;
    hrv_rmssd: number | null;
    motion_level: number | null;
    engagement_score: number | null;
  }>({ heart_rate: null, hrv_rmssd: null, motion_level: null, engagement_score: null });

  const finishTriggeredRef = useRef(false);

  const isValidSensorReading = (heartRate: number | null, hrv: number | null) =>
    heartRate !== null && Number.isFinite(heartRate) && heartRate >= 40 && heartRate <= 200
    && hrv !== null && Number.isFinite(hrv) && hrv > 0 && hrv <= 200;

  // ── FIX A1: Fetch categories from API on mount ─────────────────────────────
  useEffect(() => {
    api.getActivityCategories()
      .then((data: any) => {
        const list: string[] = data?.activities || [];
        setActivities(list);
        // Default to "Reading" if present, otherwise first item
        setActivity(list.includes("Reading") ? "Reading" : (list[0] || ""));
        setActivitiesLoading(false);
      })
      .catch((err: any) => {
        console.error("Failed to load activities", err);
        setActivitiesLoading(false);
      });
  }, []);

  // ── FIX B3: Fetch history on mount and after a session completes ────────────
  useEffect(() => {
    if (!selectedChild) return;
    setHistoryLoading(true);
    api.getActivityHistory(selectedChild.id, 10)
      .then((data: any) => {
        setHistory(data?.sessions || []);
        setHistoryLoading(false);
      })
      .catch(() => setHistoryLoading(false));
  }, [selectedChild, isComplete]); // re-fetch when a session ends

  // ── Baseline + in-progress session recovery ────────────────────────────────
  useEffect(() => {
    if (!selectedChild) return;
    let mounted = true;

    const verifyBaseline = async () => {
      try {
        const [status, activityStatus] = await Promise.all([
          api.getBaselineStatus(selectedChild.id),
          api.getActivityStatus(selectedChild.id),
        ]);
        if (!mounted) return;
        setBaselineReady(status.baseline_ready);

        if (activityStatus.session_active && activityStatus.started_at) {
          const startedAt = new Date(activityStatus.started_at).getTime();
          const elapsed = Math.floor((Date.now() - startedAt) / 1000);
          const remaining = Math.max(0, SESSION_SECONDS - elapsed);

          setActivity(activityStatus.activity || activities[0] || "");
          setSecondsLeft(remaining);
          setIsRunning(remaining > 0);

          if (remaining <= 0) {
            try {
              await api.finishActivitySession(selectedChild.id);
              setIsComplete(true);
            } catch {
              // If finish fails, keep screen interactive for manual recovery.
            }
          }
        }
      } catch {
        setBaselineReady(false);
      }
    };

    void verifyBaseline();
    return () => { mounted = false; };
  }, [selectedChild]);

  // ── Countdown tick ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isRunning) return;
    const tick = setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, [isRunning]);

  // ── Sensor status poll ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedChild) return;
    const statusPoll = setInterval(async () => {
      try {
        const [sensorResult, streamResult] = await Promise.allSettled([
          api.getSensorStatus(selectedChild.id),
          api.getSensorStreamDebug(),
        ]);
        const sensor = sensorResult.status === "fulfilled" ? sensorResult.value : null;
        const stream = streamResult.status === "fulfilled" ? streamResult.value : [];

        const childStreamRows = (Array.isArray(stream) ? stream : [])
          .filter((row: any) => resolveChildId(row?.child_id) === selectedChild.id)
          .sort((a: any, b: any) => new Date(b?.timestamp || 0).getTime() - new Date(a?.timestamp || 0).getTime());

        const latestChildStream = childStreamRows[0] ?? null;
        const latestStreamTs = latestChildStream?.timestamp ? new Date(latestChildStream.timestamp).getTime() : 0;
        const streamIsFresh = Number.isFinite(latestStreamTs) && latestStreamTs > 0
          && (Date.now() - latestStreamTs) <= SENSOR_STREAM_STALE_MS;

        const hr = Number(sensor?.heart_rate ?? latestChildStream?.heart_rate);
        const hrv = Number(sensor?.hrv_rmssd ?? latestChildStream?.hrv_rmssd);
        const sensorIsOnline = sensor?.device_status === "online";
        const online = sensorIsOnline || streamIsFresh;

        const safeHr  = Number.isFinite(hr)  ? hr  : null;
        const safeHrv = Number.isFinite(hrv) ? hrv : null;

        setSensorOnline(online);
        setSensorReady(online);

        if (!online) {
          setSensorHint("No sensor reading detected. Please attach the sensor and run the bridge.");

        } else if (!isValidSensorReading(safeHr, safeHrv)) {
          setSensorHint("Place finger on sensor and wait for stable readings.");
        } else {
          setSensorHint("Sensor connected. Live readings are valid.");
        }
      } catch {
        setSensorOnline(false);
        setSensorReady(false);
        setSensorHint("Unable to read sensor status. Check connection and stream.");
      }
    }, 2000);
    return () => clearInterval(statusPoll);
  }, [selectedChild]);

  // ── Live engagement poll during session ────────────────────────────────────
  useEffect(() => {
    if (!isRunning || !selectedChild) return;
    const pullLive = setInterval(async () => {
      try {
        const realtime = await api.getRealtimeAnalytics(selectedChild.id);
        if (!realtime) return;
        setLive({
          heart_rate:      Number(realtime.heart_rate      || 0),
          hrv_rmssd:       Number(realtime.hrv_rmssd       || 0),
          motion_level:    Number(realtime.motion_level    || 0),
          engagement_score: Number(realtime.engagement_score || 0),
        });
      } catch {
        // Timer keeps running even if polling temporarily fails.
      }
    }, 3000);
    return () => clearInterval(pullLive);
  }, [isRunning, selectedChild]);

  // ── Auto-finish when timer reaches 0 ──────────────────────────────────────
  useEffect(() => {
    if (!isRunning || !selectedChild) return;
    if (secondsLeft > 0 || finishTriggeredRef.current) return;

    finishTriggeredRef.current = true;
    setIsSubmitting(true);

    void (async () => {
      try {
        const result = await api.finishActivitySession(selectedChild.id);
        setIsComplete(true);
        setIsRunning(false);
        // Show summary alert consistent with manual-stop flow
        alert(
          `Session finished automatically.\nDuration: ${result.duration_seconds}s\nAvg Engagement: ${result.avg_engagement ?? "N/A"}`
        );
      } catch (e: any) {
        setError(e?.response?.data?.message || "Failed to finish activity session.");
      } finally {
        setIsSubmitting(false);
      }
    })();
  }, [secondsLeft, isRunning, selectedChild]);

  const progressPct = useMemo(() => {
    const elapsed = SESSION_SECONDS - secondsLeft;
    return Math.max(0, Math.min(100, (elapsed / SESSION_SECONDS) * 100));
  }, [secondsLeft]);

  // ── FIX A1: Start handler ──────────────────────────────────────────────────
  const handleStart = async () => {
    if (!selectedChild || !baselineReady || isRunning || isSubmitting) return;
    if (!sensorReady) {
      setError("Attach sensor and wait until valid readings are available before starting session.");
      return;
    }
    setError("");
    setIsSubmitting(true);
    setIsComplete(false);
    finishTriggeredRef.current = false;
    try {
      await api.startActivitySession(selectedChild.id, activity);
      setSecondsLeft(SESSION_SECONDS);
      setIsRunning(true);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to start activity session.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── FIX A2: Stop handler with confirm() + alert() summary (spec) ───────────
  const handleStop = async () => {
    if (!selectedChild || !isRunning || isSubmitting) return;
    if (!confirm("End session early? Engagement summary will be computed for collected data.")) return;

    finishTriggeredRef.current = true;
    setIsSubmitting(true);
    try {
      const result = await api.finishActivitySession(selectedChild.id);
      setIsComplete(true);
      setIsRunning(false);
      setSecondsLeft(0);
      alert(
        `Session ended.\nDuration: ${result.duration_seconds}s\nAvg Engagement: ${result.avg_engagement ?? "N/A"}`
      );
    } catch (err: any) {
      alert("Failed to stop session: " + (err?.response?.data?.message || err.message));
      finishTriggeredRef.current = false; // allow retry
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Early-return guards ────────────────────────────────────────────────────
  if (!selectedChild) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">Select a child profile first to start a hobby monitoring session.</p>
        </div>
      </div>
    );
  }

  if (!baselineReady) {
    return (
      <div className="p-8">
        <div className="mx-auto max-w-2xl rounded-lg border border-amber-500/40 bg-amber-500/10 p-6">
          <h1 className="text-2xl font-bold">Hobby Monitoring Session</h1>
          <p className="mt-3 text-amber-200">
            Baseline calibration is required before hobby monitoring can begin.
          </p>
          <button
            onClick={() => navigate("/app/baseline")}
            className="mt-4 rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white transition hover:bg-amber-700"
          >
            Go To Baseline Calibration
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mx-auto max-w-3xl space-y-6 rounded-xl border border-border bg-card p-8">
        <div>
          <h1 className="text-3xl font-bold">Hobby Monitoring Session</h1>
          <p className="mt-2 text-muted-foreground">
            Continue performing the selected activity while wearing the device.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* ── FIX A1: dropdown uses activities state with loading guard ── */}
          <div>
            <label className="mb-2 block text-sm text-muted-foreground">Activity name</label>
            <select
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              disabled={isRunning || activitiesLoading}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 disabled:opacity-60"
            >
              {activitiesLoading
                ? <option>Loading...</option>
                : activities.map((a) => <option key={a} value={a}>{a}</option>)
              }
            </select>
          </div>
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="mb-2 flex items-center gap-2 text-muted-foreground">
              <Clock3 className="h-4 w-4" /> Countdown
            </div>
            <p className="text-3xl font-semibold tabular-nums">{formatTime(secondsLeft)}</p>
            <p className={`mt-1 text-xs ${sensorOnline ? "text-emerald-300" : "text-amber-300"}`}>{sensorHint}</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-cyan-500 transition-all duration-700" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="text-sm text-muted-foreground">Session progress: {progressPct.toFixed(0)}%</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {[
            { label: "Heart Rate", value: live.heart_rate ?? "--" },
            { label: "HRV", value: live.hrv_rmssd ?? "--" },
            { label: "Motion", value: live.motion_level ?? "--" },
            { label: "Engagement Preview", value: live.engagement_score !== null ? `${(live.engagement_score * 100).toFixed(0)}%` : "--" },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-border bg-background p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-semibold">{String(value)}</p>
            </div>
          ))}
        </div>

        {/* ── FIX A2: buttons ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-4">
          {!isComplete && !isRunning && (
            <button
              onClick={handleStart}
              disabled={isRunning || isSubmitting || !sensorReady || activitiesLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-5 py-3 font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Start Activity Session
            </button>
          )}

          {/* FIX A2 spec: Stop Session visible only when isRunning */}
          {isRunning && (
            <button
              onClick={handleStop}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-3 font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Stop Session
            </button>
          )}
        </div>

        {isRunning && (
          <p className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200">
            <Radio className="h-4 w-4" />
            System is collecting sensor data for activity analytics.
          </p>
        )}

        {isComplete && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-emerald-200">
            <p className="font-semibold">Activity session finished successfully.</p>
            <p className="mt-1 text-sm">You can now review engagement trends in Dashboard and Analytics.</p>
            <button
              onClick={() => navigate("/app/analytics")}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white transition hover:bg-emerald-700"
            >
              <Zap className="h-4 w-4" />
              View Analytics
            </button>
          </div>
        )}

        {/* ── FIX B3: Past Sessions table (spec) ──────────────────────────── */}
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-semibold">Past Sessions</h2>
          {historyLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No past sessions yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 text-left font-semibold">Activity</th>
                  <th className="py-2 text-left font-semibold">Started</th>
                  <th className="py-2 text-left font-semibold">Duration</th>
                  <th className="py-2 text-left font-semibold">Engagement</th>
                </tr>
              </thead>
              <tbody>
                {history.map((s: any) => (
                  <tr key={s._id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="py-2">
                      <span
                        className={`inline-block rounded px-2 py-1 text-xs font-medium ${
                          s.category === "active"
                            ? "bg-orange-100 text-orange-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {s.activity}
                      </span>
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {new Date(s.started_at).toLocaleString()}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {s.duration_seconds ? formatDuration(s.duration_seconds) : "—"}
                    </td>
                    <td className="py-2">
                      {s.avg_engagement !== null && s.avg_engagement !== undefined ? (
                        <span className="font-mono">{s.avg_engagement.toFixed(2)}</span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
