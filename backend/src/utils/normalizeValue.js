function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeValue(value, min, max) {
  if (max <= min) return 0;
  const normalized = (value - min) / (max - min);
  return clamp01(normalized);
}

module.exports = { normalizeValue, clamp01 };
