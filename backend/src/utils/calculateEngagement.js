const { ACTIVE_CATEGORY, SEDENTARY_CATEGORY } = require("../config/activityCategories");

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
 * MOTION COEFFICIENT RATIONALE:
 *
 * The asymmetric weighting (+0.3 active vs -1.0 sedentary) reflects
 * the asymmetric semantic load of motion in each context:
 *
 * - SEDENTARY (-1.0): During reading/math, ANY significant motion
 *   indicates restlessness or distraction. The strong negative weight
 *   ensures even moderate fidgeting (motion ~1-2 m/s²) drives valence
 *   toward zero, correctly identifying disengagement.
 *
 * - ACTIVE (+0.3): During sports/play, motion is expected and high.
 *   We use a smaller positive weight because we want to differentiate
 *   between "engaged movement" (consistent motion ~5-10) and "frantic
 *   movement" (extreme motion >15) which may indicate stress or
 *   uncoordinated activity. A coefficient of +0.3 means valence
 *   saturates near 1.0 around motion=10, leaving room for
 *   discrimination.
 *
 * EDGE CASE — HEART RATE EQUALS BASELINE:
 * When heart_rate == hr_baseline, HR_norm = 0, so arousal becomes
 * sigmoid(-RMSSD_norm). If RMSSD also equals baseline, arousal = 0.5
 * (the sigmoid midpoint). This represents "no deviation from rest"
 * and is mathematically correct, though may appear counterintuitive
 * to observers expecting "no engagement" rather than "neutral state."
 *
 * Reference: Picard et al. (2001) on affective computing and
 * Healey & Picard (2005) on context-dependent physiological
 * interpretation. The HRV normalization approach follows Task Force
 * (1996) standards for short-term heart rate variability analysis.
 *
 * @param {object} params
 * @param {number} params.heart_rate
 * @param {number} params.hrv_rmssd
 * @param {number} params.motion_level
 * @param {number} params.hr_baseline
 * @param {number} params.rmssd_baseline
 * @param {"active"|"sedentary"} [params.activity_category] - defaults to SEDENTARY_CATEGORY
 * @returns {{ arousal: number, valence: number, engagement_score: number, activity_category: string }}
 */
function calculateEngagement({
  heart_rate,
  hrv_rmssd,
  motion_level,
  hr_baseline,
  rmssd_baseline,
  activity_category = SEDENTARY_CATEGORY, // safe default — import from single source of truth
}) {
  // Division-by-zero guard: if baseline is 0 or negative (pathological), fall back to 1.
  const safeHrBaseline    = hr_baseline    > 0 ? hr_baseline    : 1;
  const safeRmssdBaseline = rmssd_baseline > 0 ? rmssd_baseline : 1;

  // Baseline-normalised signals
  const hrNorm    = (heart_rate - safeHrBaseline)    / safeHrBaseline;
  const rmssdNorm = (hrv_rmssd  - safeRmssdBaseline) / safeRmssdBaseline;

  // Arousal: elevated HR + suppressed HRV = physiological arousal
  const arousal = sigmoid(hrNorm - rmssdNorm);

  // Valence: motion interpretation depends on activity context.
  // ACTIVE  (+0.3): high motion boosts valence (running = engaged)
  // SEDENTARY (-1.0): high motion suppresses valence (fidgeting = distracted)
  const motionCoefficient = activity_category === ACTIVE_CATEGORY ? 0.3 : -1.0;
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
