const { clamp01 } = require("./normalizeValue");

function sigmoid(x) {
  // Clamp to prevent Math.exp overflow on extreme inputs
  const bounded = Math.max(-60, Math.min(60, x));
  return 1 / (1 + Math.exp(-bounded));
}

function clip(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Activity-aware engagement scoring.
 *
 * For ACTIVE activities (Sports, Free Play), motion is a POSITIVE
 * engagement signal — a child running around in football is engaged.
 *
 * For SEDENTARY activities (Reading, Math, etc.), motion is a NEGATIVE
 * engagement signal — a child fidgeting during reading is disengaged.
 *
 * Reference: Picard et al. (2001) on affective computing and
 * Healey & Picard (2005) on context-dependent physiological interpretation.
 *
 * @param {object} params
 * @param {number} params.heart_rate
 * @param {number} params.hrv_rmssd
 * @param {number} params.motion_level
 * @param {number} params.hr_baseline
 * @param {number} params.rmssd_baseline
 * @param {"active"|"sedentary"} [params.activity_category="sedentary"]
 * @returns {{ arousal: number, valence: number, engagement_score: number, activity_category: string }}
 */
function calculateEngagement({
  heart_rate,
  hrv_rmssd,
  motion_level,
  hr_baseline,
  rmssd_baseline,
  activity_category = "sedentary", // safe default
}) {
  const safeHrBaseline    = hr_baseline    > 0 ? hr_baseline    : 1;
  const safeRmssdBaseline = rmssd_baseline > 0 ? rmssd_baseline : 1;

  // Baseline-normalised signals
  const hrNorm    = (heart_rate - safeHrBaseline)    / safeHrBaseline;
  const rmssdNorm = (hrv_rmssd  - safeRmssdBaseline) / safeRmssdBaseline;

  // Arousal: elevated HR + suppressed HRV = physiological arousal
  const arousal = sigmoid(hrNorm - rmssdNorm);

  // Valence: motion interpretation depends on activity context.
  // ACTIVE:    positive coefficient → high motion boosts valence
  // SEDENTARY: negative coefficient → high motion suppresses valence
  const motionCoefficient = activity_category === "active" ? 0.3 : -1.0;
  const valence = sigmoid(motionCoefficient * motion_level);

  // Engagement = arousal × valence, clipped to [0, 1]
  const engagement_score = clip(arousal * valence, 0, 1);

  return {
    arousal:          Number(arousal.toFixed(4)),
    valence:          Number(valence.toFixed(4)),
    engagement_score: Number(engagement_score.toFixed(4)),
    activity_category, // echoed back for debugging / transparency
  };
}

module.exports = calculateEngagement;
