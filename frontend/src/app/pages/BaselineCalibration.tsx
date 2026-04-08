import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Activity, Clock3, Heart, Loader2, ShieldCheck } from "lucide-react";
import { useChildren } from "../context/ChildrenContext";
import { api } from "../services/api";

const BASELINE_DURATION_SECONDS = 5 * 60;
const SENSOR_STREAM_STALE_MS = 30_000;

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function resolveChildId(value: any): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    if (typeof value.$oid === "string") return value.$oid;
    if (typeof value._id === "string") return value._id;
  }
  return "";
}

export const BaselineCalibration = () => {
  const navigate = useNavigate();
  const { selectedChild, updateChild } = useChildren();

  const [secondsLeft, setSecondsLeft] = useState(BASELINE_DURATION_SECONDS);
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState("");
  const [liveHeartRate, setLiveHeartRate] = useState<number | null>(null);
  const [statusLabel, setStatusLabel] = useState("Ready");
  const [sensorOnline, setSensorOnline] = useState(false);
  const [sensorReady, setSensorReady] = useState(false);
  const [sensorHint, setSensorHint] = useState("Attach the sensor and wait for live readings.");
  const [result, setResult] = useState<{ hr_baseline: number; rmssd_baseline: number } | null>(null);
  const [baselineInProgress, setBaselineInProgress] = useState(false);
  const [baselineSampleCount, setBaselineSampleCount] = useState(0);
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
    const checkStatus = async () => {
      try {
        const status = await api.getBaselineStatus(selectedChild.id);
        if (!mounted) return;

        setBaselineInProgress(Boolean(status.baseline_in_progress));
        setBaselineSampleCount(Number(status.baseline_sample_count || 0));

        if (status.baseline_ready) {
          setIsComplete(true);
          setResult({
            hr_baseline: Number(status.hr_baseline || selectedChild.hr_baseline || 0),
            rmssd_baseline: Number(status.rmssd_baseline || selectedChild.rmssd_baseline || 0),
          });
          setStatusLabel("Completed");
          setSecondsLeft(0);
        } else if (status.baseline_in_progress) {
          const startedAt = status.baseline_started_at ? new Date(status.baseline_started_at).getTime() : null;
          if (startedAt && Number.isFinite(startedAt)) {
            const elapsed = Math.floor((Date.now() - startedAt) / 1000);
            setSecondsLeft(Math.max(0, BASELINE_DURATION_SECONDS - elapsed));
          }
          setIsRunning(true);
          setStatusLabel("Collecting baseline samples");
        } else {
          setIsRunning(false);
          setStatusLabel("Ready to start baseline session");
        }
      } catch {
        // Keep UI usable if status endpoint temporarily fails.
      }
    };

    void checkStatus();
    return () => {
      mounted = false;
    };
  }, [selectedChild]);

  useEffect(() => {
    if (!isRunning || !selectedChild) return;

    const tick = setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(tick);
  }, [isRunning, selectedChild]);

  useEffect(() => {
    if (!selectedChild) return;

    const sensorPoll = setInterval(async () => {
      try {
        const [sensorResult, streamResult] = await Promise.allSettled([
          api.getSensorStatus(selectedChild.id),
          api.getSensorStreamDebug(),
        ]);

        const sensor = sensorResult.status === "fulfilled" ? sensorResult.value : null;
        const stream = streamResult.status === "fulfilled" ? streamResult.value : [];

        const childStreamRows = (Array.isArray(stream) ? stream : [])
          .filter((row: any) => resolveChildId(row?.child_id) === selectedChild.id)
          .sort(
            (a: any, b: any) =>
              new Date(b?.timestamp || 0).getTime() - new Date(a?.timestamp || 0).getTime(),
          );

        const latestChildStream = childStreamRows.length ? childStreamRows[0] : null;
        const latestStreamTs = latestChildStream?.timestamp ? new Date(latestChildStream.timestamp).getTime() : 0;
        const streamIsFresh = Number.isFinite(latestStreamTs)
          && latestStreamTs > 0
          && (Date.now() - latestStreamTs) <= SENSOR_STREAM_STALE_MS;

        const hr = Number(sensor?.heart_rate ?? latestChildStream?.heart_rate);
        const hrv = Number(sensor?.hrv_rmssd ?? latestChildStream?.hrv_rmssd);
        const motion = Number(sensor?.motion_level ?? latestChildStream?.motion_level);
        const sensorOnline = sensor?.device_status === "online";
        const online = sensorOnline || streamIsFresh;

        setSensorOnline(online);

        const safeHr = Number.isFinite(hr) ? hr : null;
        const safeHrv = Number.isFinite(hrv) ? hrv : null;
        const safeMotion = Number.isFinite(motion) ? motion : null;
        setLiveHeartRate(safeHr);

        const hasValidPhysiology = isValidSensorReading(safeHr, safeHrv);
        const ready = online;
        setSensorReady(ready);

        if (!online) {
          const hasOtherChildData = Array.isArray(stream) && stream.some((row: any) => resolveChildId(row?.child_id) !== selectedChild.id);
          if (hasOtherChildData) {
            setSensorHint("Sensor stream detected for another child profile. Select the correct child or reconnect this child device.");
          } else {
            setSensorHint("No sensor reading detected. Please attach the sensor.");
          }
        } else if (!hasValidPhysiology) {
          setSensorHint("Place finger on sensor and wait for stable readings.");
        } else {
          setSensorHint("Sensor connected. Live readings are valid.");
        }

        if (baselineInProgress) {
          try {
            const status = await api.getBaselineStatus(selectedChild.id);
            setBaselineSampleCount(Number(status?.baseline_sample_count || 0));
          } catch {
            // Keep previous sample count when status call fails.
          }
        }
      } catch {
        setSensorOnline(false);
        setSensorReady(false);
        setSensorHint("Unable to read sensor status. Check connection and stream.");
      }
    }, 2000);

    return () => clearInterval(sensorPoll);
  }, [baselineInProgress, isRunning, selectedChild]);

  useEffect(() => {
    if (!isRunning || !selectedChild) return;
    if (secondsLeft > 0 || finishTriggeredRef.current) return;

    finishTriggeredRef.current = true;
    setIsSubmitting(true);
    setStatusLabel("Finalizing baseline values");

    void (async () => {
      try {
        const status = await api.getBaselineStatus(selectedChild.id);
        const sampleCount = Number(status?.baseline_sample_count || 0);
        setBaselineSampleCount(sampleCount);

        const response = await api.finishBaseline(selectedChild.id);
        const hrBaseline = Number(response?.hr_baseline || 0);
        const rmssdBaseline = Number(response?.rmssd_baseline || 0);

        await updateChild(selectedChild.id, {
          hr_baseline: hrBaseline,
          rmssd_baseline: rmssdBaseline,
          isCalibrated: true,
        });

        setResult({ hr_baseline: hrBaseline, rmssd_baseline: rmssdBaseline });
        setBaselineInProgress(false);

        if (Number.isFinite(hrBaseline) && hrBaseline > 0 && Number.isFinite(rmssdBaseline) && rmssdBaseline > 0) {
          setIsComplete(true);
          setStatusLabel("Completed");
        } else {
          setStatusLabel("Finished with warning");
          setError(response?.warning || "Baseline finished, but no usable samples were available.");
        }
      } catch (e: any) {
        setError(e?.response?.data?.message || "Failed to finish baseline calibration.");
        setStatusLabel("Failed");
      } finally {
        setIsRunning(false);
        setIsSubmitting(false);
      }
    })();
  }, [secondsLeft, isRunning, selectedChild, updateChild]);

  const progressPct = useMemo(() => {
    const elapsed = BASELINE_DURATION_SECONDS - secondsLeft;
    return Math.max(0, Math.min(100, (elapsed / BASELINE_DURATION_SECONDS) * 100));
  }, [secondsLeft]);

  const handleStart = async () => {
    if (!selectedChild || isRunning || isSubmitting || isComplete) return;
    if (!sensorReady) {
      setError("Attach sensor and wait until valid readings are available before starting calibration.");
      return;
    }

    setError("");
    setIsSubmitting(true);
    setStatusLabel("Starting baseline session");
    finishTriggeredRef.current = false;

    try {
      await api.startBaseline(selectedChild.id);
      setBaselineInProgress(true);
      setBaselineSampleCount(0);
      setSecondsLeft(BASELINE_DURATION_SECONDS);
      setIsRunning(true);
      setStatusLabel("Collecting baseline samples");
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to start baseline calibration.");
      setStatusLabel("Failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!selectedChild) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">Select a child profile first to run baseline calibration.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mx-auto max-w-3xl space-y-6 rounded-xl border border-border bg-card p-8">
        <div>
          <h1 className="text-3xl font-bold">Baseline Calibration</h1>
          <p className="mt-2 text-muted-foreground">
            To establish your physiological baseline, please remain calm and sit still for the next 5 minutes.
            Do not move your hand or talk during this process.
          </p>
          {!baselineInProgress && !isComplete && (
            <p className="mt-2 text-sm text-amber-300">Baseline session not started yet. Start calibration to begin timer.</p>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="mb-2 flex items-center gap-2 text-muted-foreground">
              <Clock3 className="h-4 w-4" /> Timer
            </div>
            <p className="text-3xl font-semibold tabular-nums">{formatTime(secondsLeft)}</p>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <div className="mb-2 flex items-center gap-2 text-muted-foreground">
              <Activity className="h-4 w-4" /> Status
            </div>
            <p className="text-lg font-semibold">{statusLabel}</p>
            <p className={`mt-1 text-xs ${sensorOnline ? "text-emerald-300" : "text-amber-300"}`}>{sensorHint}</p>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <div className="mb-2 flex items-center gap-2 text-muted-foreground">
              <Heart className="h-4 w-4 text-red-400" /> Heart Rate Live Preview
            </div>
            <p className="text-3xl font-semibold">{liveHeartRate ?? "--"} {liveHeartRate ? "bpm" : ""}</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-emerald-500 transition-all duration-700" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="text-sm text-muted-foreground">Progress: {progressPct.toFixed(0)}%</p>
          {baselineInProgress && !isComplete && (
            <p className="text-xs text-muted-foreground">Samples collected: {baselineSampleCount}</p>
          )}
        </div>

        {!isComplete && (
          <button
            onClick={handleStart}
            disabled={isRunning || isSubmitting || !sensorReady}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {(isRunning || isSubmitting) && <Loader2 className="h-4 w-4 animate-spin" />}
            {isRunning ? "Collecting Baseline Data" : "Start Baseline Calibration"}
          </button>
        )}

        {isComplete && result && (
          <div className="space-y-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-5">
            <div className="flex items-center gap-2 text-emerald-300">
              <ShieldCheck className="h-5 w-5" />
              <p className="font-semibold">Baseline calibration completed successfully.</p>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <p>Heart Rate Baseline: <strong>{result.hr_baseline} bpm</strong></p>
              <p>HRV Baseline: <strong>{result.rmssd_baseline} ms</strong></p>
            </div>
            <button
              onClick={() => navigate("/app/hobby-session")}
              className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white transition hover:bg-emerald-700"
            >
              Continue To Hobby Monitoring
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
