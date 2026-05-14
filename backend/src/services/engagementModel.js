const calculateEngagement = require("../utils/calculateEngagement");

/**
 * Backend-facing ML abstraction point.
 * Wraps calculateEngagement so callers use the same interface
 * regardless of whether the underlying scorer is deterministic or a remote model.
 *
 * activity_category MUST now be passed — the formula uses it to flip
 * the motion weight sign for active vs sedentary activities.
 */
async function predictEngagement({
  heart_rate,
  hrv_rmssd,
  motion_level,
  hr_baseline,
  rmssd_baseline,
  activity_category,
}) {
  return calculateEngagement({
    heart_rate,
    hrv_rmssd,
    motion_level,
    hr_baseline,
    rmssd_baseline,
    activity_category,
  });
}

module.exports = { predictEngagement };
