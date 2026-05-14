const mongoose = require("mongoose");
const Child = require("../models/Child");
const ActivitySession = require("../models/ActivitySession");
const EngagementResult = require("../models/EngagementResult");
const SensorData = require("../models/SensorData");
const {
  ACTIVITY_LIST,
  ACTIVE_ACTIVITIES,
  SEDENTARY_ACTIVITIES,
  isValidActivity,
  categorizeActivity,
} = require("../config/activityCategories");

function isBaselineReady(child) {
  return Number.isFinite(child?.hr_baseline) && child.hr_baseline > 0
    && Number.isFinite(child?.rmssd_baseline) && child.rmssd_baseline > 0;
}

// ─── HELPER: Close Session and Compute Stats ─────────────────────────────────
async function closeSession(session) {
  const finishedAt      = new Date();
  const durationSeconds = Math.round((finishedAt - new Date(session.started_at)) / 1000);

  const [engagementStats, sensorStats] = await Promise.all([
    EngagementResult.aggregate([
      { $match: { activity_session_id: session._id } },
      { $group: { _id: null, avg_engagement: { $avg: "$engagement_score" }, sample_count: { $sum: 1 } } },
    ]),
    SensorData.aggregate([
      { $match: { activity_session_id: session._id } },
      {
        $group: {
          _id: null,
          avg_heart_rate:   { $avg: "$heart_rate" },
          avg_hrv_rmssd:    { $avg: "$hrv_rmssd" },
          avg_motion_level: { $avg: "$motion_level" },
        },
      },
    ]),
  ]);

  const eStat = engagementStats[0] || {};
  const sStat = sensorStats[0] || {};

  session.session_active    = false;
  session.finished_at       = finishedAt;
  session.duration_seconds  = durationSeconds;
  session.sample_count      = eStat.sample_count || 0;
  session.avg_engagement    = eStat.avg_engagement   != null ? Number(eStat.avg_engagement.toFixed(4))   : null;
  session.avg_heart_rate    = sStat.avg_heart_rate   != null ? Number(sStat.avg_heart_rate.toFixed(2))   : null;
  session.avg_hrv_rmssd     = sStat.avg_hrv_rmssd    != null ? Number(sStat.avg_hrv_rmssd.toFixed(2))    : null;
  session.avg_motion_level  = sStat.avg_motion_level != null ? Number(sStat.avg_motion_level.toFixed(3)) : null;
  
  await session.save();
  return session;
}

// ─── GET /activity/categories (no auth required — Fix 10) ────────────────────
function getActivityCategories(req, res) {
  return res.json({
    activities: ACTIVITY_LIST,
    groups: {
      active:    ACTIVE_ACTIVITIES,
      sedentary: SEDENTARY_ACTIVITIES,
    },
  });
}

// ─── POST /activity/start (Fix 7) ────────────────────────────────────────────
async function startActivity(req, res) {
  try {
    const { child_id, activity } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(child_id)) {
      return res.status(400).json({ message: "child_id is required and must be a valid ObjectId" });
    }

    if (typeof activity !== "string" || activity.trim().length === 0) {
      return res.status(400).json({ message: "activity is required" });
    }

    // Fix 7 — enum validation BEFORE hitting the DB
    if (!isValidActivity(activity)) {
      return res.status(400).json({
        message: `Invalid activity. Must be one of: ${ACTIVITY_LIST.join(", ")}`,
        received: activity,
        allowed: ACTIVITY_LIST,
      });
    }

    const child = await Child.findOne({ _id: child_id, parent_id: req.user._id });
    if (!child) {
      return res.status(404).json({ message: "Child not found" });
    }

    if (!isBaselineReady(child)) {
      return res.status(400).json({ message: "Baseline calibration required before activity monitoring." });
    }

    const normalizedActivity = activity.trim();

    // Fix 7 — concurrent-session guard: reject instead of silently overwriting
    const existingActive = await ActivitySession.findOne({ child_id: child._id, session_active: true });
    if (existingActive) {
      return res.status(409).json({
        message: "An activity session is already in progress for this child. End it before starting a new one.",
        active_session: {
          _id:         existingActive._id,
          activity:    existingActive.activity,
          started_at:  existingActive.started_at,
        },
      });
    }

    // Create a brand-new document (history preserved — no upsert)
    const session = await ActivitySession.create({
      child_id:       child._id,
      activity:       normalizedActivity,
      category:       categorizeActivity(normalizedActivity),
      started_at:     new Date(),
      session_active: true,
    });

    return res.status(201).json({
      message:     "Activity session started",
      session_id:  session._id,
      activity:    session.activity,
      category:    session.category,
      started_at:  session.started_at,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to start activity session", error: error.message });
  }
}

// ─── POST /activity/finish (Fix 9) ───────────────────────────────────────────
async function finishActivity(req, res) {
  try {
    const { child_id } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(child_id)) {
      return res.status(400).json({ message: "child_id is required" });
    }

    const child = await Child.findOne({ _id: child_id, parent_id: req.user._id });
    if (!child) {
      return res.status(404).json({ message: "Child not found" });
    }

    const session = await ActivitySession.findOne({ child_id: child._id, session_active: true });
    if (!session) {
      return res.status(400).json({ message: "No active activity session found." });
    }

    const closedSession = await closeSession(session);

    return res.json({
      message:           "Activity session finished",
      session_id:        closedSession._id,
      activity:          closedSession.activity,
      category:          closedSession.category,
      started_at:        closedSession.started_at,
      finished_at:       closedSession.finished_at,
      duration_seconds:  closedSession.duration_seconds,
      sample_count:      closedSession.sample_count,
      avg_engagement:    closedSession.avg_engagement,
      avg_heart_rate:    closedSession.avg_heart_rate,
      avg_hrv_rmssd:     closedSession.avg_hrv_rmssd,
      avg_motion_level:  closedSession.avg_motion_level,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to finish activity session", error: error.message });
  }
}

// 6 hours — long enough not to interrupt real long sessions, safe enough to catch "forgot to end"
const STUCK_SESSION_THRESHOLD_MS = 6 * 60 * 60 * 1000;

// ─── GET /activity/status/:child_id ──────────────────────────────────────────
async function getActivityStatus(req, res) {
  try {
    const { child_id } = req.params || {};

    if (!mongoose.Types.ObjectId.isValid(child_id)) {
      return res.status(400).json({ message: "child_id is required" });
    }

    const child = await Child.findOne({ _id: child_id, parent_id: req.user._id });
    if (!child) {
      return res.status(404).json({ message: "Child not found" });
    }

    let session = await ActivitySession.findOne({ child_id: child._id, session_active: true });

    // Auto-end if stuck for >6 hours (e.g. user closed tab and forgot)
    if (session && session.started_at) {
      const elapsedMs = Date.now() - new Date(session.started_at).getTime();
      if (elapsedMs > STUCK_SESSION_THRESHOLD_MS) {
        console.warn(`[ACTIVITY] Auto-ending stuck session ${session._id} (elapsed: ${Math.round(elapsedMs / 3600000)}h)`);
        session.session_active   = false;
        session.finished_at      = new Date();
        session.duration_seconds = Math.round(elapsedMs / 1000);
        await session.save();
        session = null;  // Don't return the now-ended session
      }
    }

    if (!session) {
      return res.json({ session_active: false, activity: null, category: null, started_at: null, finished_at: null });
    }

    return res.json({
      session_active: true,
      session_id:     session._id,
      activity:       session.activity,
      category:       session.category,
      started_at:     session.started_at,
      finished_at:    session.finished_at,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch activity status", error: error.message });
  }
}

// setActivity: backward-compat alias for startActivity
async function setActivity(req, res) {
  return startActivity(req, res);
}

// ─── GET /activity/history/:child_id ──────────────────────────────────────────
async function getActivityHistory(req, res) {
  try {
    const { child_id } = req.params || {};

    if (!mongoose.Types.ObjectId.isValid(child_id)) {
      return res.status(400).json({ message: "child_id is required" });
    }

    const child = await Child.findOne({ _id: child_id, parent_id: req.user._id });
    if (!child) {
      return res.status(404).json({ message: "Child not found" });
    }

    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip  = parseInt(req.query.skip) || 0;

    const filter = { child_id: child._id, session_active: false };

    const [sessions, total] = await Promise.all([
      ActivitySession.find(filter)
        .sort({ started_at: -1 })
        .skip(skip)
        .limit(limit)
        .select("activity category started_at finished_at duration_seconds sample_count avg_engagement avg_heart_rate avg_hrv_rmssd avg_motion_level")
        .lean(),
      ActivitySession.countDocuments(filter),
    ]);

    return res.json({
      sessions,
      pagination: {
        total,
        limit,
        skip,
        has_more: skip + sessions.length < total,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch activity history", error: error.message });
  }
}

module.exports = { getActivityCategories, setActivity, startActivity, finishActivity, getActivityStatus, getActivityHistory };