import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Activity, Clock3, Loader2, Radio, Zap } from "lucide-react";
import { useChildren } from "../context/ChildrenContext";
import { api } from "../services/api";

const SESSION_SECONDS = 5 * 60;
const ACTIVITY_OPTIONS = [
  "Reading",
  "Homework",
  "Drawing",
  "Football",
  "Cycling",
  "Gaming",
  "Other",
];

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export const HobbySession = () => {
  const navigate = useNavigate();
  const { selectedChild } = useChildren();

  const [activity, setActivity] = useState("Reading");
  const [secondsLeft, setSecondsLeft] = useState(SESSION_SECONDS);
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [baselineReady, setBaselineReady] = useState(false);
  const [sensorOnline, setSensorOnline] = useState(false);
  const [sensorReady, setSensorReady] = useState(false);
  const [sensorHint, setSensorHint] = useState("Attach the sensor and wait for live readings.");
  const [error, setError] = useState("");
  const [live, setLive] = useState<{ heart_rate: number | null; hrv_rmssd: number | null; motion_level: number | null; engagement_score: number | null }>({
    heart_rate: null,
    hrv_rmssd: null,
    motion_level: null,
    engagement_score: null,
  });

  const finishTriggeredRef = useRef(false);

  const isValidSensorReading = (heartRate: number | null, hrv: number | null) => (
    heartRate !== null
    && Number.isFinite(heartRate)
    && heartRate >= 40
    && heartRate <= 200
    && hrv !== null
    && Number.isFinite(hrv)
    && hrv > 0
    && hrv <= 200
  );

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

          setActivity(activityStatus.activity || "Reading");
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
    return () => {
      mounted = false;
    };
  }, [selectedChild]);

  useEffect(() => {
    if (!isRunning) return;

    const tick = setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(tick);
  }, [isRunning]);

  useEffect(() => {
    if (!selectedChild) return;

    const statusPoll = setInterval(async () => {
      try {
        const sensor = await api.getSensorStatus(selectedChild.id);
        const hr = Number(sensor?.heart_rate);
        const hrv = Number(sensor?.hrv_rmssd);
        const motion = Number(sensor?.motion_level);
        const online = sensor?.device_status === "online";

        const safeHr = Number.isFinite(hr) ? hr : null;
        const safeHrv = Number.isFinite(hrv) ? hrv : null;
        const safeMotion = Number.isFinite(motion) ? motion : null;

        setSensorOnline(online);
        const hasValidPhysiology = isValidSensorReading(safeHr, safeHrv);
        const ready = online;
        setSensorReady(ready);

        if (!online) {
          setSensorHint("No sensor reading detected. Please attach the sensor.");
        } else if (!hasValidPhysiology) {
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

  useEffect(() => {
    if (!isRunning || !selectedChild) return;

    const pullLive = setInterval(async () => {
      try {
        const realtime = await api.getRealtimeAnalytics(selectedChild.id);
        if (!realtime) return;

        setLive({
          heart_rate: Number(realtime.heart_rate || 0),
          hrv_rmssd: Number(realtime.hrv_rmssd || 0),
          motion_level: Number(realtime.motion_level || 0),
          engagement_score: Number(realtime.engagement_score || 0),
        });
      } catch {
        // Timer keeps running even if polling temporarily fails.
      }
    }, 3000);

    return () => clearInterval(pullLive);
  }, [isRunning, selectedChild]);

  useEffect(() => {
    if (!isRunning || !selectedChild) return;
    if (secondsLeft > 0 || finishTriggeredRef.current) return;

    finishTriggeredRef.current = true;
    setIsSubmitting(true);

    void (async () => {
      try {
        await api.finishActivitySession(selectedChild.id);
        setIsComplete(true);
        setIsRunning(false);
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
          <div>
            <label className="mb-2 block text-sm text-muted-foreground">Activity name</label>
            <select
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              disabled={isRunning}
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
            >
              {ACTIVITY_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
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
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="text-xs text-muted-foreground">Heart Rate</p>
            <p className="text-2xl font-semibold">{live.heart_rate ?? "--"}</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="text-xs text-muted-foreground">HRV</p>
            <p className="text-2xl font-semibold">{live.hrv_rmssd ?? "--"}</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="text-xs text-muted-foreground">Motion</p>
            <p className="text-2xl font-semibold">{live.motion_level ?? "--"}</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="text-xs text-muted-foreground">Engagement Preview</p>
            <p className="text-2xl font-semibold">{live.engagement_score !== null ? `${(live.engagement_score * 100).toFixed(0)}%` : "--"}</p>
          </div>
        </div>

        {!isComplete && (
          <button
            onClick={handleStart}
            disabled={isRunning || isSubmitting || !sensorReady}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-5 py-3 font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {(isRunning || isSubmitting) && <Loader2 className="h-4 w-4 animate-spin" />}
            {isRunning ? "Collecting Activity Data" : "Start Activity Session"}
          </button>
        )}

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
      </div>
    </div>
  );
};
