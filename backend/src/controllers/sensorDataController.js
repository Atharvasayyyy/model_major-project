const Child = require("../models/Child");
const SensorData = require("../models/SensorData");
const EngagementResult = require("../models/EngagementResult");
const Alert = require("../models/Alert");
const { categorizeActivity } = require("../utils/categorizeActivity");
const { predictEngagement } = require("../services/engagementModel");

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
    const { child_id, activity, heart_rate, hrv_rmssd, motion_level, timestamp } = req.body;

    if (!child_id || !activity || heart_rate === undefined || hrv_rmssd === undefined || motion_level === undefined) {
      return res.status(400).json({
        message: "child_id, activity, heart_rate, hrv_rmssd, motion_level are required",
      });
    }

    const child = await Child.findOne({ _id: child_id, parent_id: req.user._id });
    if (!child) {
      return res.status(404).json({ message: "Child not found" });
    }

    if (!Number.isFinite(child.hr_baseline) || child.hr_baseline <= 0
      || !Number.isFinite(child.rmssd_baseline) || child.rmssd_baseline <= 0) {
      return res.status(400).json({ message: "Baseline calibration required before analytics." });
    }

    const activity_category = categorizeActivity(activity);
    const eventTime = timestamp ? new Date(timestamp) : new Date();

    const rawRow = await SensorData.create({
      child_id,
      activity,
      activity_category,
      heart_rate,
      hrv_rmssd,
      motion_level,
      timestamp: eventTime,
    });

    const prediction = await predictEngagement({
      heart_rate,
      hrv_rmssd,
      motion_level,
      hr_baseline: child.hr_baseline,
      rmssd_baseline: child.rmssd_baseline,
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
      message: "Sensor data processed",
      sensor_data: rawRow,
      engagement_result: resultRow,
      alerts_count: alerts.length,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to process sensor data", error: error.message });
  }
}

module.exports = { ingestSensorData };
