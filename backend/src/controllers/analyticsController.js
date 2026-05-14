const SensorData = require("../models/SensorData");
const EngagementResult = require("../models/EngagementResult");
const ActivitySession = require("../models/ActivitySession");
const Alert = require("../models/Alert");
const Child = require("../models/Child");
const { buildTimeMatch } = require("../utils/timeWindow");

// ─── helpers ────────────────────────────────────────────────────────────────

async function ensureChildOwnership(childId, parentId) {
  return Child.findOne({ _id: childId, parent_id: parentId });
}

function isBaselineReady(child) {
  return (
    Number.isFinite(child?.hr_baseline) &&
    child.hr_baseline > 0 &&
    Number.isFinite(child?.rmssd_baseline) &&
    child.rmssd_baseline > 0
  );
}

// ─── Placeholder labels that must never appear in user-facing analytics ────────
const EXCLUDED_LABELS = ["Sensor Stream", "Baseline Calibration"];

// ─── EXISTING (unchanged) ────────────────────────────────────────────────────

async function getRealtime(req, res) {
  try {
    const { child_id } = req.params;
    const child = await ensureChildOwnership(child_id, req.user._id);
    if (!child) return res.status(404).json({ message: "Child not found" });
    if (!isBaselineReady(child)) {
      return res.json({
        latest_sensor: null,
        latest_engagement: null,
        message: "No engagement data yet",
      });
    }

    const latestSensor = await SensorData.findOne({ child_id }).sort({
      timestamp: -1,
    });
    const latestEngagement = await EngagementResult.findOne({
      child_id,
    }).sort({ timestamp: -1 });

    return res.json({
      latest_sensor: latestSensor,
      latest_engagement: latestEngagement,
    });
  } catch (error) {
    return res
      .status(500)
      .json({
        message: "Failed to fetch realtime analytics",
        error: error.message,
      });
  }
}

async function getAlerts(req, res) {
  try {
    const { child_id } = req.params;
    const child = await ensureChildOwnership(child_id, req.user._id);
    if (!child) return res.status(404).json({ message: "Child not found" });

    // NOTE: No baseline guard here — alerts are always meaningful regardless of baseline.
    const alerts = await Alert.find({ child_id })
      .sort({ is_read: 1, createdAt: -1 }) // unread first, then newest
      .limit(100);

    const summary = {
      total:  alerts.length,
      unread: alerts.filter((a) => !a.is_read).length,
      by_type: {
        high_stress:         alerts.filter((a) => a.alert_type === "high_stress").length,
        low_engagement:      alerts.filter((a) => a.alert_type === "low_engagement").length,
        abnormal_heart_rate: alerts.filter((a) => a.alert_type === "abnormal_heart_rate").length,
      },
    };

    return res.json({ alerts, summary });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch alerts", error: error.message });
  }
}

async function markAlertAsRead(req, res) {
  try {
    const { alertId } = req.params;
    const alert = await Alert.findById(alertId);
    if (!alert) return res.status(404).json({ message: "Alert not found" });

    // Verify parent owns this child
    const child = await Child.findOne({ _id: alert.child_id, parent_id: req.user._id });
    if (!child) return res.status(403).json({ message: "Not authorized" });

    alert.is_read = true;
    alert.read_at = new Date();
    await alert.save();

    return res.json({ message: "Alert marked as read", alert });
  } catch (error) {
    return res.status(500).json({ message: "Failed to mark alert as read", error: error.message });
  }
}

async function markAllAlertsAsRead(req, res) {
  try {
    const { childId } = req.params;
    const child = await Child.findOne({ _id: childId, parent_id: req.user._id });
    if (!child) return res.status(403).json({ message: "Not authorized" });

    const result = await Alert.updateMany(
      { child_id: childId, is_read: false },
      { $set: { is_read: true, read_at: new Date() } },
    );

    return res.json({ message: "All alerts marked as read", modified: result.modifiedCount });
  } catch (error) {
    return res.status(500).json({ message: "Failed to mark all alerts as read", error: error.message });
  }
}

// ─── FIX 1.3 — refactored getActivityInsights ────────────────────────────────

async function getActivityInsights(req, res) {
  try {
    const { child_id } = req.params;
    const window = req.query.window || "7d";

    const child = await ensureChildOwnership(child_id, req.user._id);
    if (!child) return res.status(404).json({ message: "Child not found" });

    if (!isBaselineReady(child)) {
      return res.json({
        activities: [],
        window,
        total_samples: 0,
        message: "Baseline not yet established",
      });
    }

    const timeMatch = buildTimeMatch(window);

    const insights = await EngagementResult.aggregate([
      {
        $match: {
          child_id: child._id,
          activity: { $nin: EXCLUDED_LABELS },
          ...timeMatch,
        },
      },
      {
        $group: {
          _id: "$activity",
          avg_engagement: { $avg: "$engagement_score" },
          sample_count: { $sum: 1 },
          // Carry forward the category stored on the EngagementResult document
          activity_category: { $first: "$activity_category" },
        },
      },
      {
        $project: {
          _id: 0,
          activity: "$_id",
          activity_category: 1,
          avg_engagement: { $round: ["$avg_engagement", 4] },
          sample_count: 1,
        },
      },
      { $sort: { avg_engagement: -1 } },
    ]);

    // Attach rank (1-based) after sorting
    const ranked = insights.map((item, idx) => ({ ...item, rank: idx + 1 }));
    const total_samples = ranked.reduce((sum, i) => sum + i.sample_count, 0);

    return res.json({ activities: ranked, window, total_samples });
  } catch (error) {
    if (error.message?.startsWith("Invalid window")) {
      return res.status(400).json({ message: error.message });
    }
    return res
      .status(500)
      .json({
        message: "Failed to fetch activity insights",
        error: error.message,
      });
  }
}

// ─── FIX 1.4 — refactored getEngagementTrend (daily buckets) ─────────────────

async function getEngagementTrend(req, res) {
  try {
    const { child_id } = req.params;
    const window = req.query.window || "7d";

    const child = await ensureChildOwnership(child_id, req.user._id);
    if (!child) return res.status(404).json({ message: "Child not found" });

    if (!isBaselineReady(child)) {
      return res.json({ trend: [], window });
    }

    const timeMatch = buildTimeMatch(window);

    // NOTE: timezone is set to "Asia/Kolkata" so daily buckets align with the
    // server's local calendar day (UTC+5:30).  Change to "UTC" or your actual
    // timezone if deploying outside India.
    const trend = await EngagementResult.aggregate([
      {
        $match: {
          child_id: child._id,
          activity: { $nin: EXCLUDED_LABELS },
          ...timeMatch,
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$timestamp",
              timezone: "Asia/Kolkata",
            },
          },
          avg_engagement: { $avg: "$engagement_score" },
          sample_count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          date: "$_id",
          avg_engagement: { $round: ["$avg_engagement", 4] },
          sample_count: 1,
        },
      },
      { $sort: { date: 1 } },
    ]);

    return res.json({ trend, window });
  } catch (error) {
    if (error.message?.startsWith("Invalid window")) {
      return res.status(400).json({ message: error.message });
    }
    return res
      .status(500)
      .json({
        message: "Failed to fetch engagement trend",
        error: error.message,
      });
  }
}

// ─── FIX 1.5 — NEW getActivityTimeStats ──────────────────────────────────────

async function getActivityTimeStats(req, res) {
  try {
    const { child_id } = req.params;
    const window = req.query.window || "7d";

    const child = await ensureChildOwnership(child_id, req.user._id);
    if (!child) return res.status(404).json({ message: "Child not found" });

    // buildTimeMatch filters on started_at (ActivitySession field)
    const timeMatch = buildTimeMatch(window, "started_at");

    const stats = await ActivitySession.aggregate([
      {
        $match: {
          child_id: child._id,
          session_active: false,
          duration_seconds: { $ne: null, $gt: 0 },
          activity: { $nin: EXCLUDED_LABELS },
          ...timeMatch,
        },
      },
      {
        $group: {
          _id: "$activity",
          // ActivitySession stores category in the "category" field
          activity_category: { $first: "$category" },
          total_seconds: { $sum: "$duration_seconds" },
          session_count: { $sum: 1 },
          avg_engagement: { $avg: "$avg_engagement" },
        },
      },
      {
        $project: {
          _id: 0,
          activity: "$_id",
          activity_category: 1,
          total_seconds: 1,
          session_count: 1,
          avg_engagement: {
            $cond: [
              { $eq: ["$avg_engagement", null] },
              null,
              { $round: ["$avg_engagement", 4] },
            ],
          },
        },
      },
      { $sort: { total_seconds: -1 } },
    ]);

    const total_seconds = stats.reduce((sum, s) => sum + s.total_seconds, 0);
    const total_sessions = stats.reduce((sum, s) => sum + s.session_count, 0);

    return res.json({ activities: stats, window, total_seconds, total_sessions });
  } catch (error) {
    if (error.message?.startsWith("Invalid window")) {
      return res.status(400).json({ message: error.message });
    }
    return res
      .status(500)
      .json({
        message: "Failed to fetch activity time stats",
        error: error.message,
      });
  }
}

// ─── FIX 1.6 — NEW getTimeOfDayPattern ───────────────────────────────────────

async function getTimeOfDayPattern(req, res) {
  try {
    const { child_id } = req.params;
    const window = req.query.window || "30d";
    const activityFilter = req.query.activity; // optional

    const child = await ensureChildOwnership(child_id, req.user._id);
    if (!child) return res.status(404).json({ message: "Child not found" });

    if (!isBaselineReady(child)) {
      // Return 24 empty hours so the chart still renders cleanly
      const empty = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        avg_engagement: null,
        sample_count: 0,
      }));
      return res.json({ hourly: empty, window, activity: activityFilter || null });
    }

    const timeMatch = buildTimeMatch(window);
    const activityMatch = activityFilter ? { activity: activityFilter } : {};

    const results = await EngagementResult.aggregate([
      {
        $match: {
          child_id: child._id,
          activity: { $nin: EXCLUDED_LABELS },
          ...timeMatch,
          ...activityMatch,
        },
      },
      {
        $group: {
          _id: {
            $hour: {
              date: "$timestamp",
              timezone: "Asia/Kolkata", // must match getEngagementTrend
            },
          },
          avg_engagement: { $avg: "$engagement_score" },
          sample_count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          hour: "$_id",
          avg_engagement: { $round: ["$avg_engagement", 4] },
          sample_count: 1,
        },
      },
    ]);

    // Fill in ALL 24 hours so chart renders cleanly regardless of data gaps
    const hourMap = new Map(results.map((r) => [r.hour, r]));
    const hourly = Array.from({ length: 24 }, (_, hour) => {
      const existing = hourMap.get(hour);
      return existing || { hour, avg_engagement: null, sample_count: 0 };
    });

    return res.json({
      hourly,
      window,
      activity: activityFilter || null,
    });
  } catch (error) {
    if (error.message?.startsWith("Invalid window")) {
      return res.status(400).json({ message: error.message });
    }
    return res
      .status(500)
      .json({
        message: "Failed to fetch time-of-day pattern",
        error: error.message,
      });
  }
}

// ─── FIX 1.7 — refactored getDailySummary (window-aware) ─────────────────────

async function getDailySummary(req, res) {
  try {
    const { child_id } = req.params;
    const window = req.query.window || "today";

    const child = await ensureChildOwnership(child_id, req.user._id);
    if (!child) return res.status(404).json({ message: "Child not found" });

    if (!isBaselineReady(child)) {
      return res.json({
        average_heart_rate: 0,
        average_hrv: 0,
        average_engagement_score: 0,
        sample_count: 0,
        sensor_count: 0,
        window,
        message: "No engagement data yet",
      });
    }

    const timeMatch = buildTimeMatch(window);

    const [sensorAgg] = await SensorData.aggregate([
      { $match: { child_id: child._id, ...timeMatch } },
      {
        $group: {
          _id: null,
          average_heart_rate: { $avg: "$heart_rate" },
          average_hrv: { $avg: "$hrv_rmssd" },
          sensor_count: { $sum: 1 },
        },
      },
    ]);

    const [engagementAgg] = await EngagementResult.aggregate([
      {
        $match: {
          child_id: child._id,
          activity: { $nin: EXCLUDED_LABELS },
          ...timeMatch,
        },
      },
      {
        $group: {
          _id: null,
          average_engagement_score: { $avg: "$engagement_score" },
          engagement_count: { $sum: 1 },
        },
      },
    ]);

    return res.json({
      average_heart_rate: sensorAgg
        ? Number(sensorAgg.average_heart_rate.toFixed(2))
        : 0,
      average_hrv: sensorAgg ? Number(sensorAgg.average_hrv.toFixed(2)) : 0,
      average_engagement_score: engagementAgg
        ? Number(engagementAgg.average_engagement_score.toFixed(4))
        : 0,
      sample_count: engagementAgg?.engagement_count || 0,
      sensor_count: sensorAgg?.sensor_count || 0,
      window,
    });
  } catch (error) {
    if (error.message?.startsWith("Invalid window")) {
      return res.status(400).json({ message: error.message });
    }
    return res
      .status(500)
      .json({
        message: "Failed to fetch daily summary",
        error: error.message,
      });
  }
}

// ─── exports ─────────────────────────────────────────────────────────────────

module.exports = {
  getRealtime,
  getEngagementTrend,
  getActivityInsights,
  getDailySummary,
  getAlerts,
  markAlertAsRead,
  markAllAlertsAsRead,
  getActivityTimeStats,
  getTimeOfDayPattern,
};
