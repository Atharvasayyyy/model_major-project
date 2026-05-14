import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Activity, Clock3, Heart, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { useChildren } from "../context/ChildrenContext";
import { api } from "../services/api";

// Fix 3.4 — Duration is now 3 minutes (180s). Must match BASELINE_DURATION_SECONDS in baselineController.js.
const BASELINE_DURATION_SECONDS = 180;
const SENSOR_STREAM_STALE_MS    = 30_000;

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
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

// Fix 3.2 — quality badge helper
function QualityBadge({ quality }: { quality: "HIGH" | "MEDIUM" | "LOW" | null }) {
  if (!quality) return null;
  const styles: Record<string, string> = {
    HIGH:   "border-emerald-500/60 bg-emerald-500/20 text-emerald-300",
    MEDIUM: "border-amber-500/60 bg-amber-500/20 text-amber-300",
    LOW:    "border-red-500/60 bg-red-500/20 text-red-300",
  };
  const tooltips: Record<string, string> = {
    HIGH:   "Excellent calibration — many still samples collected.",
    MEDIUM: "Good calibration — acceptable number of still samples.",
    LOW:    "Poor calibration — consider recalibrating in a quieter setting.",
  };
  return (
    <span
      className={`rounded border px-2 py-0.5 text-xs font-semibold ${styles[quality]}`}
      title={tooltips[quality]}
    >
      {quality} quality
    </span>
  );
}

type CalibrationResult = {
  hr_baseline: number;
  rmssd_baseline: number;
  samples_used?: number;
  avg_motion?: number;
  quality?: "HIGH" | "MEDIUM" | "LOW";
};

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
  const [result, setResult] = useState<CalibrationResult | null>(null);
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
    && hrv <= 250  // Updated to match tightened validator
  );

  // ── On mount: hydrate UI from server state ──────────────────────────────────
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
            hr_baseline:   Number(status.hr_baseline || selectedChild.hr_baseline || 0),
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
    return () => { mounted = false; };
  }, [selectedChild]);

  // ── Countdown timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isRunning || !selectedChild) return;
    const tick = setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, [isRunning, selectedChild]);

  // ── Sensor status poll (every 2s) ───────────────────────────────────────────
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
          .sort((a: any, b: any) => new Date(b?.timestamp || 0).getTime() - new Date(a?.timestamp || 0).getTime());

        const latestChildStream = childStreamRows.length ? childStreamRows[0] : null;
        const latestStreamTs    = latestChildStream?.timestamp ? new Date(latestChildStream.timestamp).getTime() : 0;
        const streamIsFresh     = Number.isFinite(latestStreamTs) && latestStreamTs > 0
          && (Date.now() - latestStreamTs) <= SENSOR_STREAM_STALE_MS;

        const hr     = Number(sensor?.heart_rate ?? latestChildStream?.heart_rate);
        const hrv    = Number(sensor?.hrv_rmssd ?? latestChildStream?.hrv_rmssd);
        const online = sensor?.device_status === "online" || streamIsFresh;

        setSensorOnline(online);

        const safeHr  = Number.isFinite(hr)  ? hr  : null;
        const safeHrv = Number.isFinite(hrv) ? hrv : null;
        setLiveHeartRate(safeHr);

        const hasValidPhysiology = isValidSensorReading(safeHr, safeHrv);
        setSensorReady(online);

        if (!online) {
          const hasOtherChildData = Array.isArray(stream)
            && stream.some((row: any) => resolveChildId(row?.child_id) !== selectedChild.id);
          setSensorHint(
            hasOtherChildData
              ? "Sensor stream detected for another child profile. Select the correct child or reconnect this child device."
              : "No sensor reading detected. Please attach the sensor.",
          );
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
            // Keep previous sample count on transient failure.
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

  // ── Timer reaches zero → call /baseline/finish ──────────────────────────────
  useEffect(() => {
    if (!isRunning || !selectedChild) return;
    if (secondsLeft > 0 || finishTriggeredRef.current) return;

    finishTriggeredRef.current = true;
    setIsSubmitting(true);
    setStatusLabel("Finalizing baseline values");

    void (async () => {
      try {
        const status = await api.getBaselineStatus(selectedChild.id);
        setBaselineSampleCount(Number(status?.baseline_sample_count || 0));

        const response = await api.finishBaseline(selectedChild.id);
        const hrBaseline    = Number(response?.hr_baseline || 0);
        const rmssdBaseline = Number(response?.rmssd_baseline || 0);

        await updateChild(selectedChild.id, {
          hr_baseline:   hrBaseline,
          rmssd_baseline: rmssdBaseline,
          isCalibrated:  true,
        });

        setResult({
          hr_baseline:    hrBaseline,
          rmssd_baseline: rmssdBaseline,
          samples_used:   response?.samples_used,
          avg_motion:     response?.avg_motion,
          quality:        response?.quality,
        });
        setBaselineInProgress(false);

        if (Number.isFinite(hrBaseline) && hrBaseline > 0 && Number.isFinite(rmssdBaseline) && rmssdBaseline > 0) {
          setIsComplete(true);
          setStatusLabel("Completed");
        } else {
          setStatusLabel("Finished with warning");
          // response?.message from 422 or 200 with zero-sample warning
          setError(response?.message || response?.warning || "Baseline finished, but no usable samples were available.");
        }
      } catch (e: any) {
        const msg = e?.response?.data?.message || "Failed to finish baseline calibration.";
        setError(msg);
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

  // ── Handlers ────────────────────────────────────────────────────────────────
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
      // Fix 2.2 — show 409 conflict message clearly (double-start guard)
      setError(e?.response?.data?.message || "Failed to start baseline calibration.");
      setStatusLabel("Failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Fix 2.1 — recalibrate: reset all state and restart
  const handleRecalibrate = async () => {
    if (!selectedChild) return;
    if (!confirm("This will erase your current baseline and start a new 3-minute calibration. Continue?")) return;

    setError("");
    setIsComplete(false);
    setResult(null);
    setSecondsLeft(BASELINE_DURATION_SECONDS);
    setBaselineSampleCount(0);
    finishTriggeredRef.current = false;
    setStatusLabel("Starting baseline session");
    setIsSubmitting(true);

    try {
      await api.startBaseline(selectedChild.id);
      setBaselineInProgress(true);
      setIsRunning(true);
      setStatusLabel("Collecting baseline samples");
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to start recalibration.");
      setStatusLabel("Failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Fix 2.4 — cancel: abort mid-session and reset UI
  const handleCancel = async () => {
    if (!selectedChild || !isRunning) return;
    if (!confirm("Cancel the current baseline calibration? Collected samples will be discarded.")) return;

    setIsSubmitting(true);
    try {
      await api.cancelBaseline(selectedChild.id);
      setIsRunning(false);
      setBaselineInProgress(false);
      setBaselineSampleCount(0);
      setSecondsLeft(BASELINE_DURATION_SECONDS);
      setStatusLabel("Calibration cancelled");
      finishTriggeredRef.current = false;
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to cancel calibration.");
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
          {/* Fix 3.3 — show which child is being calibrated */}
          <h1 className="text-3xl font-bold">
            Baseline Calibration
            {selectedChild.child_name && (
              <span className="ml-2 text-emerald-400"> for {selectedChild.child_name}</span>
            )}
          </h1>
          {/* Fix 3.4 — updated duration from "1 minute" to "3 minutes" */}
          <p className="mt-2 text-muted-foreground">
            To establish your physiological baseline, please remain calm and sit still for the next 3 minutes.
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

        {/* Start button — shown when idle and not yet complete */}
        {!isComplete && !isRunning && (
          <button
            onClick={handleStart}
            disabled={isRunning || isSubmitting || !sensorReady}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Start Baseline Calibration
          </button>
        )}

        {/* Fix 2.4 — Cancel button — shown only while actively collecting */}
        {isRunning && !isComplete && (
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-600/20 border border-emerald-600/40 px-5 py-3 font-semibold text-emerald-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              Collecting Baseline Data…
            </div>
            <button
              onClick={handleCancel}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <XCircle className="h-4 w-4" />
              Cancel
            </button>
          </div>
        )}

        {/* Success card */}
        {isComplete && result && (
          <div className="space-y-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-5">
            <div className="flex items-center gap-3 text-emerald-300">
              <ShieldCheck className="h-5 w-5" />
              <p className="font-semibold">Baseline calibration completed successfully.</p>
              {/* Fix 3.2 — quality badge */}
              <QualityBadge quality={result.quality ?? null} />
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <p>Heart Rate Baseline: <strong>{result.hr_baseline} bpm</strong></p>
              <p>HRV Baseline: <strong>{result.rmssd_baseline} ms</strong></p>
              {result.samples_used !== undefined && (
                <p className="text-sm text-muted-foreground">Samples used: {result.samples_used}</p>
              )}
              {result.avg_motion !== undefined && (
                <p className="text-sm text-muted-foreground">Avg. motion: {result.avg_motion} m/s²</p>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => navigate("/app/hobby-session")}
                className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white transition hover:bg-emerald-700"
              >
                Continue To Hobby Monitoring
              </button>
              {/* Fix 2.1 — recalibrate button */}
              <button
                onClick={handleRecalibrate}
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Recalibrate
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
