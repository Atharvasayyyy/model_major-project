const mongoose = require("mongoose");
const Child = require("../models/Child");
const ActivitySession = require("../models/ActivitySession");
const { categorizeActivity } = require("../utils/categorizeActivity");

async function setActivity(req, res) {
  try {
    const { child_id, activity } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(child_id) || typeof activity !== "string" || activity.trim().length === 0) {
      return res.status(400).json({ message: "child_id and activity are required" });
    }

    const child = await Child.findOne({ _id: child_id, parent_id: req.user._id });
    if (!child) {
      return res.status(404).json({ message: "Child not found" });
    }

    const normalizedActivity = activity.trim();
    const category = categorizeActivity(normalizedActivity);

    await ActivitySession.findOneAndUpdate(
      { child_id: child._id },
      {
        activity: normalizedActivity,
        category,
        started_at: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return res.json({
      message: "Activity updated",
      activity: normalizedActivity,
      category,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update activity", error: error.message });
  }
}

module.exports = { setActivity };