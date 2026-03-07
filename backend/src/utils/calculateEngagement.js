const { clamp01 } = require("./normalizeValue");

function sigmoid(value) {
  const bounded = Math.max(-60, Math.min(60, value));
  return 1 / (1 + Math.exp(-bounded));
}

function calculateEngagement(heartRate, hrvRmssd, hrBaseline, rmssdBaseline, motionLevel) {
  const safeHrBaseline = hrBaseline > 0 ? hrBaseline : 1;
  const safeRmssdBaseline = rmssdBaseline > 0 ? rmssdBaseline : 1;

  const hrNorm = (heartRate - safeHrBaseline) / safeHrBaseline;
  const rmssdNorm = (hrvRmssd - safeRmssdBaseline) / safeRmssdBaseline;

  const arousal = sigmoid(hrNorm - rmssdNorm);
  const valence = sigmoid(-motionLevel);
  const engagement_score = clamp01(arousal * valence);

  return {
    arousal,
    valence,
    engagement_score,
  };
}

module.exports = { calculateEngagement };
