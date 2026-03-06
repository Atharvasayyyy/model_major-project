const SensorData = require("../models/SensorData");
const EngagementResult = require("../models/EngagementResult");
const Alert = require("../models/Alert");
const Child = require("../models/Child");

async function ensureChildOwnership(childId, parentId) {
  return Child.findOne({ _id: childId, parent_id: parentId });
}

function isBaselineReady(child) {
  return Number.isFinite(child?.hr_baseline) && child.hr_baseline > 0
    && Number.isFinite(child?.rmssd_baseline) && child.rmssd_baseline > 0;
}

function requireBaselineReady(child, res) {
  if (isBaselineReady(child)) {
    return true;
  }

  res.status(400).json({ message: "Baseline calibration required before analytics." });
  return false;
}

async function getRealtime(req, res) {
  try {
    const { child_id } = req.params;
    const child = await ensureChildOwnership(child_id, req.user._id);
    if (!child) return res.status(404).json({ message: "Child not found" });
    if (!requireBaselineReady(child, res)) return;

    const latestSensor = await SensorData.findOne({ child_id }).sort({ timestamp: -1 });
    const latestEngagement = await EngagementResult.findOne({ child_id }).sort({ timestamp: -1 });

    return res.json({ latest_sensor: latestSensor, latest_engagement: latestEngagement });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch realtime analytics", error: error.message });
  }
}

async function getEngagementTrend(req, res) {
  try {
    const { child_id } = req.params;
    const child = await ensureChildOwnership(child_id, req.user._id);
    if (!child) return res.status(404).json({ message: "Child not found" });
    if (!requireBaselineReady(child, res)) return;

    const trend = await EngagementResult.find({ child_id })
      .sort({ timestamp: 1 });

    return res.json(trend);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch engagement trend", error: error.message });
  }
}

async function getActivityInsights(req, res) {
  try {
    const { child_id } = req.params;
    const child = await ensureChildOwnership(child_id, req.user._id);
    if (!child) return res.status(404).json({ message: "Child not found" });
    if (!requireBaselineReady(child, res)) return;

    const insights = await EngagementResult.aggregate([
      { $match: { child_id: child._id } },
      {
        $group: {
          _id: "$activity",
          avg_engagement: { $avg: "$engagement_score" },
        },
      },
      {
        $project: {
          _id: 0,
          activity: "$_id",
          avg_engagement: { $round: ["$avg_engagement", 3] },
        },
      },
      { $sort: { avg_engagement: -1 } },
    ]);

    return res.json(insights);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch activity insights", error: error.message });
  }
}

async function getDailySummary(req, res) {
  try {
    const { child_id } = req.params;
    const child = await ensureChildOwnership(child_id, req.user._id);
    if (!child) return res.status(404).json({ message: "Child not found" });
    if (!requireBaselineReady(child, res)) return;

    const [sensorAgg] = await SensorData.aggregate([
      { $match: { child_id: child._id } },
      {
        $group: {
          _id: null,
          average_heart_rate: { $avg: "$heart_rate" },
          average_hrv: { $avg: "$hrv_rmssd" },
        },
      },
    ]);

    const [engagementAgg] = await EngagementResult.aggregate([
      { $match: { child_id: child._id } },
      {
        $group: {
          _id: null,
          average_engagement_score: { $avg: "$engagement_score" },
        },
      },
    ]);

    return res.json({
      average_heart_rate: sensorAgg ? Number(sensorAgg.average_heart_rate.toFixed(2)) : 0,
      average_hrv: sensorAgg ? Number(sensorAgg.average_hrv.toFixed(2)) : 0,
      average_engagement_score: engagementAgg ? Number(engagementAgg.average_engagement_score.toFixed(3)) : 0,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch daily summary", error: error.message });
  }
}

async function getAlerts(req, res) {
  try {
    const { child_id } = req.params;
    const child = await ensureChildOwnership(child_id, req.user._id);
    if (!child) return res.status(404).json({ message: "Child not found" });
    if (!requireBaselineReady(child, res)) return;

    const alerts = await Alert.find({ child_id }).sort({ createdAt: -1 }).limit(50);
    return res.json(alerts);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch alerts", error: error.message });
  }
}

module.exports = {
  getRealtime,
  getEngagementTrend,
  getActivityInsights,
  getDailySummary,
  getAlerts,
};
