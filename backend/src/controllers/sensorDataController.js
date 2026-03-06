const Child = require("../models/Child");
const SensorData = require("../models/SensorData");
const EngagementResult = require("../models/EngagementResult");
const ActivitySession = require("../models/ActivitySession");
const Alert = require("../models/Alert");
const { predictEngagement } = require("../services/engagementModel");

const SENSOR_OFFLINE_THRESHOLD_MS = 10_000;

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
    const { child_id, heart_rate, hrv_rmssd, motion_level, timestamp } = req.body;

    if (req.sensorPayloadSource === "serial-bridge") {
      console.log("[SERIAL SENSOR DATA RECEIVED]");
      console.log(`heart_rate: ${heart_rate}`);
      console.log(`hrv_rmssd: ${hrv_rmssd}`);
      console.log(`motion_level: ${motion_level}`);
    } else {
      console.log("[SENSOR DATA RECEIVED]");
      console.log(`child_id: ${child_id}`);
      console.log(`heart_rate: ${heart_rate}`);
      console.log(`hrv_rmssd: ${hrv_rmssd}`);
      console.log(`motion_level: ${motion_level}`);
    }

    const child = await Child.findById(child_id);
    if (!child) {
      return res.status(404).json({ message: "Child not found" });
    }

    const session = await ActivitySession.findOne({ child_id: child._id });
    if (!session) {
      return res.status(400).json({ message: "No active activity session. Set activity from dashboard first." });
    }

    const activity = session.activity;
    const activity_category = session.category;

    if (!Number.isFinite(child.hr_baseline) || child.hr_baseline <= 0
      || !Number.isFinite(child.rmssd_baseline) || child.rmssd_baseline <= 0) {
      return res.status(400).json({ message: "Baseline calibration required before analytics." });
    }

    const eventTime = timestamp ? new Date(timestamp) : new Date();

    const prediction = await predictEngagement({
      heart_rate,
      hrv_rmssd,
      motion_level,
      hr_baseline: child.hr_baseline,
      rmssd_baseline: child.rmssd_baseline,
      activity_category,
    });

    const rawRow = await SensorData.create({
      child_id,
      activity,
      activity_category,
      heart_rate,
      hrv_rmssd,
      motion_level,
      engagement_score: prediction.engagement_score,
      timestamp: eventTime,
    });

    const resultRow = await EngagementResult.create({
      child_id,
      activity,
      activity_category,
      heart_rate,
      hrv_rmssd,
      motion_level,
      arousal: prediction.arousal,
      valence: prediction.valence,
      engagement_score: prediction.engagement_score,
      timestamp: eventTime,
    });

    const alerts = await createAlertsIfNeeded({
      child,
      child_id,
      heart_rate,
      hrv_rmssd,
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
    const { child_id } = req.params;
    const child = await Child.findOne({ _id: child_id, parent_id: req.user._id });
    if (!child) {
      return res.status(404).json({ message: "Child not found" });
    }

    const latest = await SensorData.findOne({ child_id }).sort({ timestamp: -1 });
    if (!latest) {
      return res.json({
        child_id,
        last_reading: null,
        heart_rate: null,
        hrv_rmssd: null,
        motion_level: null,
        device_status: "offline",
      });
    }

    const lastReading = new Date(latest.timestamp);
    const ageMs = Date.now() - lastReading.getTime();
    const device_status = ageMs <= SENSOR_OFFLINE_THRESHOLD_MS ? "online" : "offline";

    return res.json({
      child_id,
      last_reading: lastReading.toISOString(),
      heart_rate: latest.heart_rate,
      hrv_rmssd: latest.hrv_rmssd,
      motion_level: latest.motion_level,
      device_status,
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
      .select("child_id activity heart_rate hrv_rmssd motion_level timestamp");

    return res.json(readings);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch sensor stream", error: error.message });
  }
}

module.exports = { ingestSensorData, getSensorStatus, getSensorStreamDebug };
