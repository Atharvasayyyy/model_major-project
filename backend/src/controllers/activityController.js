const mongoose = require("mongoose");
const Child = require("../models/Child");
const ActivitySession = require("../models/ActivitySession");
const { categorizeActivity } = require("../utils/categorizeActivity");

function isBaselineReady(child) {
  return Number.isFinite(child?.hr_baseline) && child.hr_baseline > 0
    && Number.isFinite(child?.rmssd_baseline) && child.rmssd_baseline > 0;
}

async function startActivity(req, res) {
  try {
    const { child_id, activity } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(child_id) || typeof activity !== "string" || activity.trim().length === 0) {
      return res.status(400).json({ message: "child_id and activity are required" });
    }

    const child = await Child.findOne({ _id: child_id, parent_id: req.user._id });
    if (!child) {
      return res.status(404).json({ message: "Child not found" });
    }

    if (!isBaselineReady(child)) {
      return res.status(400).json({ message: "Baseline calibration required before activity monitoring." });
    }

    const normalizedActivity = activity.trim();
    const category = categorizeActivity(normalizedActivity);

    const session = await ActivitySession.findOneAndUpdate(
      { child_id: child._id },
      {
        activity: normalizedActivity,
        category,
        started_at: new Date(),
        finished_at: null,
        session_active: true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return res.json({
      message: "Activity session started",
      activity: normalizedActivity,
      category,
      started_at: session.started_at,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to start activity session", error: error.message });
  }
}

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

    session.session_active = false;
    session.finished_at = new Date();
    await session.save();

    return res.json({
      message: "Activity session finished",
      activity: session.activity,
      started_at: session.started_at,
      finished_at: session.finished_at,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to finish activity session", error: error.message });
  }
}

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

    const session = await ActivitySession.findOne({ child_id: child._id, session_active: true });
    if (!session) {
      return res.json({
        session_active: false,
        activity: null,
        category: null,
        started_at: null,
        finished_at: null,
      });
    }

    return res.json({
      session_active: true,
      activity: session.activity,
      category: session.category,
      started_at: session.started_at,
      finished_at: session.finished_at,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch activity status", error: error.message });
  }
}

async function setActivity(req, res) {
  return startActivity(req, res);
}

module.exports = { setActivity, startActivity, finishActivity, getActivityStatus };