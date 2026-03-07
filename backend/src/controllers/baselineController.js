const Child = require("../models/Child");
const BaselineSample = require("../models/BaselineSample");

function isBaselineReady(child) {
  return Number.isFinite(child?.hr_baseline) && child.hr_baseline > 0
    && Number.isFinite(child?.rmssd_baseline) && child.rmssd_baseline > 0;
}

async function getBaselineStatus(req, res) {
  try {
    const { child_id } = req.params;
    const child = await Child.findOne({ _id: child_id, parent_id: req.user._id });
    if (!child) {
      return res.status(404).json({ message: "Child not found" });
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

    await BaselineSample.deleteMany({ child_id });
    child.baseline_in_progress = true;
    child.baseline_started_at = new Date();
    await child.save();

    return res.json({ message: "Baseline session started", child_id });
  } catch (error) {
    return res.status(500).json({ message: "Failed to start baseline", error: error.message });
  }
}

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

    const samples = await BaselineSample.find({ child_id });
    if (!samples.length) {
      return res.status(400).json({ message: "No baseline samples found" });
    }

    if (samples.length < 200) {
      return res.status(400).json({ message: "Minimum 200 baseline samples required before finish." });
    }

    const hrBaseline = samples.reduce((sum, row) => sum + row.heart_rate, 0) / samples.length;
    const rmssdBaseline = samples.reduce((sum, row) => sum + row.hrv_rmssd, 0) / samples.length;

    child.hr_baseline = Number(hrBaseline.toFixed(2));
    child.rmssd_baseline = Number(rmssdBaseline.toFixed(2));
    child.baseline_in_progress = false;
    child.baseline_started_at = null;
    await child.save();

    await BaselineSample.deleteMany({ child_id });

    return res.json({
      message: "Baseline calibration completed",
      child_id,
      hr_baseline: child.hr_baseline,
      rmssd_baseline: child.rmssd_baseline,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to finish baseline", error: error.message });
  }
}

module.exports = { getBaselineStatus, startBaseline, recordBaseline, finishBaseline };
