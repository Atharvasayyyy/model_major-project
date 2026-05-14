const Child = require("../models/Child");
const BaselineSample = require("../models/BaselineSample");
const SensorData = require("../models/SensorData");

// ─── Calibration constants ────────────────────────────────────────────────────
// BASELINE_DURATION_SECONDS is the single source of truth for the backend.
// The frontend constant MUST be kept in sync with this value.
const BASELINE_MIN_SAMPLES      = 30;   // hard minimum — fewer samples = untrustworthy baseline
const BASELINE_DURATION_SECONDS = 180;  // 3-minute collection window
// Auto-cancel stuck sessions after duration + 2 min grace period
const STUCK_THRESHOLD_MS        = (BASELINE_DURATION_SECONDS + 120) * 1000;

function isBaselineReady(child) {
  return Number.isFinite(child?.hr_baseline) && child.hr_baseline > 0
    && Number.isFinite(child?.rmssd_baseline) && child.rmssd_baseline > 0;
}

// ─── GET /baseline/status/:child_id ──────────────────────────────────────────
async function getBaselineStatus(req, res) {
  try {
    const { child_id } = req.params;
    const child = await Child.findOne({ _id: child_id, parent_id: req.user._id });
    if (!child) {
      return res.status(404).json({ message: "Child not found" });
    }

    // Fix 2.6 — auto-cancel calibrations stuck by tab-close or crashes.
    // Anything still "in_progress" beyond duration + 2 min grace is treated as abandoned.
    if (child.baseline_in_progress && child.baseline_started_at) {
      const elapsedMs = Date.now() - new Date(child.baseline_started_at).getTime();
      if (elapsedMs > STUCK_THRESHOLD_MS) {
        console.warn(
          `[BASELINE] Auto-cancelling stuck calibration for child ${child._id}` +
          ` (elapsed: ${Math.round(elapsedMs / 1000)}s, threshold: ${Math.round(STUCK_THRESHOLD_MS / 1000)}s)`,
        );
        child.baseline_in_progress = false;
        child.baseline_started_at = null;
        await child.save();
        await BaselineSample.deleteMany({ child_id: child._id });
      }
    }

    const baseline_sample_count = child.baseline_in_progress
      ? await BaselineSample.countDocuments({ child_id })
      : 0;

    return res.json({
      baseline_ready: isBaselineReady(child),
      baseline_in_progress: Boolean(child.baseline_in_progress),
      baseline_started_at: child.baseline_started_at,
      baseline_sample_count,
      hr_baseline: child.hr_baseline,
      rmssd_baseline: child.rmssd_baseline,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch baseline status", error: error.message });
  }
}

// ─── POST /baseline/start ─────────────────────────────────────────────────────
async function startBaseline(req, res) {
  try {
    const { child_id } = req.body;
    if (!child_id) {
      return res.status(400).json({ message: "child_id is required" });
    }

    const child = await Child.findOne({ _id: child_id, parent_id: req.user._id });
    if (!child) {
      return res.status(404).json({ message: "Child not found" });
    }

    // Fix 2.2 — idempotency guard: reject if calibration is already in progress with time remaining
    if (child.baseline_in_progress) {
      const elapsedMs = child.baseline_started_at
        ? Date.now() - new Date(child.baseline_started_at).getTime()
        : 0;
      const remainingMs = (BASELINE_DURATION_SECONDS * 1000) - elapsedMs;

      if (remainingMs > 0) {
        return res.status(409).json({
          message: "Baseline calibration already in progress",
          baseline_in_progress: true,
          seconds_remaining: Math.ceil(remainingMs / 1000),
          baseline_started_at: child.baseline_started_at,
        });
      }
      // Elapsed time exceeds duration — session is stuck; allow restart
      console.log(`[BASELINE] Restarting stuck calibration for child ${child_id}`);
    }

    // Fix 2.3 — clear old baseline so isBaselineReady() returns false during recalibration.
    // This pauses engagement scoring on the stale old baseline while the new one is collected.
    child.hr_baseline = null;
    child.rmssd_baseline = null;

    await BaselineSample.deleteMany({ child_id });
    child.baseline_in_progress = true;
    child.baseline_started_at = new Date();
    await child.save();

    return res.json({ message: "Baseline session started", child_id });
  } catch (error) {
    return res.status(500).json({ message: "Failed to start baseline", error: error.message });
  }
}

// ─── POST /baseline/record ────────────────────────────────────────────────────
// Manual sample recording endpoint (used by legacy / test flows).
// Primary flow: sensorDataController writes to BaselineSample automatically.
async function recordBaseline(req, res) {
  try {
    const { child_id, heart_rate, hrv_rmssd, motion_level } = req.body;
    if (!child_id || heart_rate === undefined || hrv_rmssd === undefined || motion_level === undefined) {
      return res.status(400).json({ message: "child_id, heart_rate, hrv_rmssd, motion_level are required" });
    }

    const child = await Child.findOne({ _id: child_id, parent_id: req.user._id });
    if (!child) {
      return res.status(404).json({ message: "Child not found" });
    }

    const sample = await BaselineSample.create({ child_id, heart_rate, hrv_rmssd, motion_level });
    return res.status(201).json({ message: "Baseline sample stored", sample_id: sample._id });
  } catch (error) {
    return res.status(500).json({ message: "Failed to record baseline", error: error.message });
  }
}

// ─── POST /baseline/finish ────────────────────────────────────────────────────
async function finishBaseline(req, res) {
  try {
    const { child_id } = req.body;
    if (!child_id) {
      return res.status(400).json({ message: "child_id is required" });
    }

    const child = await Child.findOne({ _id: child_id, parent_id: req.user._id });
    if (!child) {
      return res.status(404).json({ message: "Child not found" });
    }

    const baselineSamples = await BaselineSample.find({ child_id }).sort({ timestamp: 1 });

    let source = "baseline-samples";
    let samples = baselineSamples;

    // Fallback: if no baseline samples exist, try recent SensorData rows
    if (!samples.length) {
      const recentSensorRows = await SensorData.find({ child_id })
        .sort({ timestamp: -1 })
        .limit(BASELINE_MIN_SAMPLES * 2)
        .select("heart_rate hrv_rmssd motion_level timestamp");

      const usableSensorRows = recentSensorRows.filter(
        (row) => Number.isFinite(row.heart_rate) && row.heart_rate > 0
          && Number.isFinite(row.hrv_rmssd) && row.hrv_rmssd > 0,
      );

      if (usableSensorRows.length) {
        source = "sensor-data-fallback";
        samples = usableSensorRows.reverse();
      }
    }

    // Zero samples — sensor was completely offline
    if (!samples.length) {
      child.baseline_in_progress = false;
      child.baseline_started_at = null;
      await child.save();

      return res.status(200).json({
        baseline_ready: false,
        message: "Baseline session finished, but no usable sensor samples were available to calculate a baseline.",
        samples_collected: 0,
        samples_required: BASELINE_MIN_SAMPLES,
        warning: "Attach the sensor and keep it stable while baseline is running, then try again.",
      });
    }

    // Fix 1.2 — hard minimum sample count: advisory warning is not enough.
    // Baseline computed from < 30 samples is statistically unreliable.
    // Samples are intentionally NOT deleted here so the user can inspect them.
    if (samples.length < BASELINE_MIN_SAMPLES) {
      child.baseline_in_progress = false;
      child.baseline_started_at = null;
      await child.save();

      return res.status(422).json({
        baseline_ready: false,
        message: `Calibration failed: only ${samples.length} valid samples collected (minimum ${BASELINE_MIN_SAMPLES} required). ` +
          "Please ensure the sensor is attached and the child sits still, then click Recalibrate.",
        samples_collected: samples.length,
        samples_required: BASELINE_MIN_SAMPLES,
      });
    }

    // Compute baseline — simple arithmetic mean over accepted (motion-filtered) samples
    const hrBaseline    = samples.reduce((sum, row) => sum + row.heart_rate, 0) / samples.length;
    const rmssdBaseline = samples.reduce((sum, row) => sum + row.hrv_rmssd, 0) / samples.length;

    // Fix 3.2 — quality metrics
    const motionValues = samples.map((s) => Math.abs(s.motion_level || 0));
    const avgMotion    = motionValues.reduce((a, b) => a + b, 0) / motionValues.length;

    let qualityLabel = "LOW";
    if (samples.length >= 50 && avgMotion < 0.15) qualityLabel = "HIGH";
    else if (samples.length >= 30 && avgMotion < 0.25) qualityLabel = "MEDIUM";

    // Fix 1.3 — save baseline FIRST, delete samples AFTER.
    // If save succeeds but deleteMany crashes, samples remain for the next attempt (non-fatal).
    child.hr_baseline           = Number(hrBaseline.toFixed(2));
    child.rmssd_baseline        = Number(rmssdBaseline.toFixed(2));
    child.baseline_in_progress  = false;
    child.baseline_started_at   = null;
    child.baseline_completed_at = new Date(); // Fix 3.1
    await child.save();

    try {
      await BaselineSample.deleteMany({ child_id });
    } catch (err) {
      console.warn(`[BASELINE] Failed to clean up samples for ${child_id}:`, err.message);
      // Non-fatal — baseline is already durably saved
    }

    return res.json({
      baseline_ready: true,
      message: "Baseline established successfully",
      child_id,
      hr_baseline:           child.hr_baseline,
      rmssd_baseline:        child.rmssd_baseline,
      samples_used:          samples.length,
      avg_motion:            Number(avgMotion.toFixed(3)),
      quality:               qualityLabel,
      baseline_completed_at: child.baseline_completed_at,
      source,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to finish baseline", error: error.message });
  }
}

// ─── POST /baseline/cancel ────────────────────────────────────────────────────
// Fix 2.4 — explicit abort endpoint so users can cancel mid-calibration.
async function cancelBaseline(req, res) {
  try {
    const { child_id } = req.body;
    if (!child_id) return res.status(400).json({ message: "child_id is required" });

    const child = await Child.findOne({ _id: child_id, parent_id: req.user._id });
    if (!child) return res.status(404).json({ message: "Child not found" });

    if (!child.baseline_in_progress) {
      return res.status(400).json({ message: "No active calibration to cancel" });
    }

    child.baseline_in_progress = false;
    child.baseline_started_at  = null;
    await child.save();
    await BaselineSample.deleteMany({ child_id });

    return res.json({ message: "Baseline calibration cancelled", child_id });
  } catch (error) {
    return res.status(500).json({ message: "Failed to cancel baseline", error: error.message });
  }
}

module.exports = { getBaselineStatus, startBaseline, recordBaseline, finishBaseline, cancelBaseline };
