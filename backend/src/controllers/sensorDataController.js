const Child = require("../models/Child");
const SensorData = require("../models/SensorData");
const EngagementResult = require("../models/EngagementResult");
const ActivitySession = require("../models/ActivitySession");
const BaselineSample = require("../models/BaselineSample");
const Alert = require("../models/Alert");
const { predictEngagement } = require("../services/engagementModel");

const SENSOR_OFFLINE_THRESHOLD_MS = 30_000;
// Max motion (m/s², post gravity-removal) allowed during baseline sample collection.
// A resting, still child should show < 0.3. Walking/fidgeting produces > 1.0.
const BASELINE_MAX_MOTION = 0.3;

function isStrictEngagementSignal(heart_rate, hrv_rmssd) {
  return Number.isFinite(heart_rate) && heart_rate >= 40 && heart_rate <= 200
    && Number.isFinite(hrv_rmssd) && hrv_rmssd > 0;
}

async function createAlertsIfNeeded({ child, child_id, heart_rate, hrv_rmssd, engagement_score }) {
  const alerts = [];

  if (engagement_score < 0.2) {
    alerts.push({
      child_id,
      alert_type: "low_engagement",
      message: "Low engagement detected. Possible stress state.",
    });
  }

  if (heart_rate > child.hr_baseline + 40) {
    alerts.push({
      child_id,
      alert_type: "abnormal_heart_rate",
      message: "Abnormally high heart rate detected.",
    });
  }

  if (hrv_rmssd < child.rmssd_baseline * 0.5) {
    alerts.push({
      child_id,
      alert_type: "high_stress",
      message: "Possible stress condition detected from low HRV.",
    });
  }

  if (alerts.length > 0) {
    await Alert.insertMany(alerts);
  }

  return alerts;
}

async function ingestSensorData(req, res) {
  try {
    const {
      child_id,
      heart_rate,
      hrv_rmssd,
      motion_level,
      spo2,
      restlessness_index,
      session_id,
      esp32_uptime_ms,
    } = req.body;

    if (req.sensorPayloadSource === "serial-bridge") {
      console.log("[SERIAL SENSOR DATA RECEIVED]");
      console.log(`heart_rate: ${heart_rate}`);
      console.log(`hrv_rmssd: ${hrv_rmssd}`);
      console.log(`motion_level: ${motion_level}`);
      if (spo2 !== undefined) console.log(`spo2: ${spo2}`);
      if (restlessness_index !== undefined) console.log(`restlessness_index: ${restlessness_index}`);
    } else {
      console.log("[SENSOR DATA RECEIVED]");
      console.log(`child_id: ${child_id}`);
      console.log(`heart_rate: ${heart_rate}`);
      console.log(`hrv_rmssd: ${hrv_rmssd}`);
      console.log(`motion_level: ${motion_level}`);
      if (spo2 !== undefined) console.log(`spo2: ${spo2}`);
      if (restlessness_index !== undefined) console.log(`restlessness_index: ${restlessness_index}`);
    }

    let child = null;
    let resolvedChildId = child_id;

    if (typeof child_id === "string" && child_id) {
      // child_id was explicitly provided — look it up and REJECT if not found.
      // Do NOT silently fall back to another child; that masked data-routing bugs before.
      child = await Child.findById(child_id);
      if (!child) {
        return res.status(404).json({ message: `Child with id=${child_id} not found. Provide a valid child_id or omit it to use the most recently created profile.` });
      }
    }

    if (!child) {
      // No child_id supplied — fall back to the most recently created child profile.
      child = await Child.findOne().sort({ createdAt: -1 });
      resolvedChildId = child ? String(child._id) : null;
    }

    if (!child) {
      return res.status(404).json({ message: "No child profiles exist to attach sensor data to" });
    }

    console.log(`[SENSOR ROUTING] Mapped to child_id=${resolvedChildId}`);

    const eventTime = new Date();
    const normalizedHeartRate = Number.isFinite(heart_rate) ? heart_rate : 0;
    const normalizedHrvRmssd  = Number.isFinite(hrv_rmssd)  ? hrv_rmssd  : 0;

    // Track device liveness even for warm-up/invalid physiological values.
    await Child.updateOne({ _id: resolvedChildId }, { sensor_last_seen_at: eventTime });

    // Fix 8 — Look up the activity session BEFORE creating the SensorData row so we can
    // (a) set activity correctly in the first write (kills the two-step write bug), and
    // (b) set activity_session_id on the raw row without a second save().
    // Baseline mode short-circuits below so we only need the session during normal scoring.
    let activitySession     = null;
    let activitySessionId   = null;
    let sessionActivity     = null;
    let sessionCategory     = null;

    if (!child.baseline_in_progress) {
      activitySession   = await ActivitySession.findOne({ child_id: child._id, session_active: true });
      activitySessionId = activitySession ? activitySession._id : null;
      sessionActivity   = activitySession ? activitySession.activity   : null;
      sessionCategory   = activitySession ? activitySession.category   : null;
    }

    // Activity label written at creation time (not patched in a second save)
    const rawActivity = child.baseline_in_progress
      ? "Baseline Calibration"
      : (activitySession ? activitySession.activity : "Sensor Stream");

    const rawRow = await SensorData.create({
      child_id:            resolvedChildId,
      activity_session_id: activitySessionId, // Fix 8 — set at creation (was null before)
      activity:            rawActivity,        // Fix 8 — correct label on first write
      heart_rate:          normalizedHeartRate,
      hrv_rmssd:           normalizedHrvRmssd,
      motion_level,
      spo2,
      restlessness_index,
      session_id:      session_id ?? null,
      esp32_uptime_ms: esp32_uptime_ms ?? null,
      timestamp:       eventTime,
    });

    if (child.baseline_in_progress) {
      // Fix 1.1 — motion quality gate: reject samples where the child was moving.
      // Still saved to SensorData (raw history preserved), but NOT counted toward the baseline.
      if (Number.isFinite(motion_level) && Math.abs(motion_level) > BASELINE_MAX_MOTION) {
        return res.status(202).json({
          message: "Sample rejected from baseline: child not still",
          baseline_mode: true,
          rejected: true,
          reason: `motion_level=${motion_level} exceeds calibration threshold (${BASELINE_MAX_MOTION} m/s²)`,
          sensor_data: rawRow, // raw row still saved to SensorData above
        });
      }

      await BaselineSample.create({
        child_id: resolvedChildId,
        heart_rate: normalizedHeartRate,
        hrv_rmssd: normalizedHrvRmssd,
        motion_level,
        timestamp: eventTime,
        session_active: true,
      });

      return res.status(201).json({
        message: "Baseline sample collected",
        baseline_mode: true,
        sensor_data: rawRow,
      });
    }

    const baselineReady = Number.isFinite(child.hr_baseline) && child.hr_baseline > 0
      && Number.isFinite(child.rmssd_baseline) && child.rmssd_baseline > 0;
    // activitySession already resolved above (before SensorData.create)

    if (!baselineReady || !activitySession) {
      return res.status(201).json({
        message: "Sensor data stored. Engagement scoring skipped until baseline is ready and activity session is active.",
        scoring_skipped:         true,
        baseline_ready:          baselineReady,
        activity_session_active: Boolean(activitySession),
        sensor_data:             rawRow,
      });
    }

    if (!isStrictEngagementSignal(normalizedHeartRate, normalizedHrvRmssd)) {
      return res.status(202).json({
        message: "Stored sensor reading but skipped engagement scoring",
        ignored: true,
        reason: "Engagement mode requires heart_rate in 40..200 and hrv_rmssd > 0",
        sensor_data: rawRow,
      });
    }

    const activity          = sessionActivity;
    const activity_category = sessionCategory;

    const prediction = await predictEngagement({
      heart_rate:        normalizedHeartRate,
      hrv_rmssd:         normalizedHrvRmssd,
      motion_level,
      hr_baseline:       child.hr_baseline,
      rmssd_baseline:    child.rmssd_baseline,
      activity_category, // Fix 8 — now flows into the formula (was discarded before)
    });

    // Fix 8 — activity already set at creation; no second rawRow.save() needed.

    const resultRow = await EngagementResult.create({
      child_id:            resolvedChildId,
      activity_session_id: activitySessionId, // Fix 8 — links score to session
      activity,
      arousal:          prediction.arousal,
      valence:          prediction.valence,
      engagement_score: prediction.engagement_score,
      timestamp:        eventTime,
    });

    const alerts = await createAlertsIfNeeded({
      child,
      child_id: resolvedChildId,
      heart_rate: normalizedHeartRate,
      hrv_rmssd: normalizedHrvRmssd,
      engagement_score: prediction.engagement_score,
    });

    return res.status(201).json({
      message: "Sensor data processed successfully",
      sensor_data: rawRow,
      engagement_result: resultRow,
      alerts_count: alerts.length,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to process sensor data", error: error.message });
  }
}

async function getSensorStatus(req, res) {
  try {
    const child_id = req.params.child_id;
    let child = null;
    
    if (child_id && child_id !== "undefined") {
      child = await Child.findOne({ _id: child_id, parent_id: req.user._id });
    } else {
      child = await Child.findOne({ parent_id: req.user._id }).sort({ createdAt: -1 });
    }

    if (!child) {
      return res.status(404).json({ message: "Child not found" });
    }

    let latest = await SensorData.findOne({ child_id: child._id }).sort({ timestamp: -1 });

    const lastSeen = child.sensor_last_seen_at ? new Date(child.sensor_last_seen_at) : null;
    const baselineExists = Number.isFinite(child.hr_baseline) && child.hr_baseline > 0 &&
                           Number.isFinite(child.rmssd_baseline) && child.rmssd_baseline > 0;

    // Mark device online when any recent sensor row has been received.
    const latestRowTime = latest ? new Date(latest.timestamp) : null;
    const referenceTime = latestRowTime ?? lastSeen;
    const ageMs = referenceTime ? Date.now() - referenceTime.getTime() : Number.POSITIVE_INFINITY;
    const device_status = ageMs <= SENSOR_OFFLINE_THRESHOLD_MS ? "online" : "offline";

    if (!latest) {
      return res.json({
        child_id: child._id,
        last_reading: null,
        last_reading_timestamp: null,
        last_sensor_ping_at: lastSeen ? lastSeen.toISOString() : null,
        heart_rate: null,
        hrv_rmssd: null,
        motion_level: null,
        spo2: null,
        restlessness_index: null,
        device_status,
        baseline_exists: baselineExists,
      });
    }

    const lastReading = new Date(latest.timestamp);

    return res.json({
      child_id: child._id,
      last_reading: lastReading.toISOString(),
      last_reading_timestamp: lastReading.toISOString(),
      last_sensor_ping_at: lastSeen ? lastSeen.toISOString() : lastReading.toISOString(),
      heart_rate: latest.heart_rate,
      hrv_rmssd: latest.hrv_rmssd,
      motion_level: latest.motion_level,
      spo2: latest.spo2 ?? null,
      restlessness_index: latest.restlessness_index ?? null,
      device_status,
      baseline_exists: baselineExists,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch sensor status", error: error.message });
  }
}

async function getSensorStreamDebug(req, res) {
  try {
    const childIds = (await Child.find({ parent_id: req.user._id }).select("_id")).map((row) => row._id);
    const readings = await SensorData.find({ child_id: { $in: childIds } })
      .sort({ timestamp: -1 })
      .limit(20)
      .select("child_id activity heart_rate hrv_rmssd motion_level spo2 restlessness_index timestamp");

    return res.json(readings);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch sensor stream", error: error.message });
  }
}

module.exports = { ingestSensorData, getSensorStatus, getSensorStreamDebug };
