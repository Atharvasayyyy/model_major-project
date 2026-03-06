const { normalizeValue, clamp01 } = require("./normalizeValue");

function calculateEngagement(heartRate, hrvRmssd, hrBaseline, rmssdBaseline) {
  const safeHrBaseline = hrBaseline > 0 ? hrBaseline : 1;
  const safeRmssdBaseline = rmssdBaseline > 0 ? rmssdBaseline : 1;

  const hrNorm = (heartRate - safeHrBaseline) / safeHrBaseline;
  const rmssdNorm = hrvRmssd / safeRmssdBaseline;

  const arousal = normalizeValue(hrNorm, -0.5, 1.0);
  const valence = normalizeValue(rmssdNorm, 0.2, 2.0);
  const engagement_score = clamp01(arousal * valence);

  return {
    arousal,
    valence,
    engagement_score,
  };
}

module.exports = { calculateEngagement };
