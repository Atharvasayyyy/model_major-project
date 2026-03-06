const { calculateEngagement } = require("../utils/calculateEngagement");

async function predictEngagement({
  heart_rate,
  hrv_rmssd,
  motion_level,
  hr_baseline,
  rmssd_baseline,
  activity_category,
}) {
  // This service is the backend-facing ML abstraction point.
  // Replace this deterministic logic with a remote/local model call if needed.
  // activity_category is accepted for compatibility with context-aware models.
  return calculateEngagement(heart_rate, hrv_rmssd, hr_baseline, rmssd_baseline, motion_level);
}

module.exports = { predictEngagement };
