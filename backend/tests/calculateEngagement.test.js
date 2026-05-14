/**
 * Unit tests for calculateEngagement.js — pure function, no DB/IO required.
 * Run with: node --test tests/calculateEngagement.test.js
 */
const test   = require("node:test");
const assert = require("node:assert/strict");
const calculateEngagement = require("../src/utils/calculateEngagement");

// ─── Test 1 — Neutral input produces midpoint engagement ─────────────────────
test("formula matches spec for neutral input (HR=baseline, HRV=baseline, motion=0, sedentary)", () => {
  const result = calculateEngagement({
    heart_rate:      70,
    hrv_rmssd:       45,
    motion_level:    0,
    hr_baseline:     70,
    rmssd_baseline:  45,
    activity_category: "sedentary",
  });
  // HR_norm=0, RMSSD_norm=0 → arousal = sigmoid(0) = 0.5
  // motion=0, coeff=-1.0   → valence = sigmoid(0)  = 0.5
  // engagement = 0.5 × 0.5 = 0.25
  assert.equal(result.arousal,          0.5,  `arousal expected 0.5, got ${result.arousal}`);
  assert.equal(result.valence,          0.5,  `valence expected 0.5, got ${result.valence}`);
  assert.equal(result.engagement_score, 0.25, `engagement expected 0.25, got ${result.engagement_score}`);
});

// ─── Test 2 — Activity-aware scoring diverges on same input ──────────────────
test("activity-aware scoring: same input produces different scores in active vs sedentary", () => {
  const input = {
    heart_rate:     80,
    hrv_rmssd:      35,
    motion_level:   5,
    hr_baseline:    70,
    rmssd_baseline: 45,
  };

  const sedentary = calculateEngagement({ ...input, activity_category: "sedentary" });
  const active    = calculateEngagement({ ...input, activity_category: "active" });

  assert.ok(
    active.engagement_score > sedentary.engagement_score,
    `Expected active (${active.engagement_score}) > sedentary (${sedentary.engagement_score})`,
  );
});

// ─── Test 3 — Zero-baseline guard prevents NaN / infinity ────────────────────
test("baseline=0 fallback prevents division by zero", () => {
  const result = calculateEngagement({
    heart_rate:     80,
    hrv_rmssd:      50,
    motion_level:   0.5,
    hr_baseline:    0,   // pathological
    rmssd_baseline: 0,   // pathological
    activity_category: "sedentary",
  });
  assert.ok(Number.isFinite(result.engagement_score),
    `engagement_score should be finite, got ${result.engagement_score}`);
  assert.ok(Number.isFinite(result.arousal),
    `arousal should be finite, got ${result.arousal}`);
  assert.ok(Number.isFinite(result.valence),
    `valence should be finite, got ${result.valence}`);
});

// ─── Test 4 — engagement_score always in [0, 1] ──────────────────────────────
test("engagement_score is always in [0, 1]", () => {
  const cases = [
    { heart_rate: 200, hrv_rmssd:   1, motion_level: 30, hr_baseline: 60, rmssd_baseline: 50 },
    { heart_rate:  40, hrv_rmssd: 200, motion_level:  0, hr_baseline: 60, rmssd_baseline: 50 },
    { heart_rate: 100, hrv_rmssd:  30, motion_level: 15, hr_baseline: 70, rmssd_baseline: 40 },
  ];

  for (const input of cases) {
    for (const category of ["active", "sedentary"]) {
      const result = calculateEngagement({ ...input, activity_category: category });
      assert.ok(
        result.engagement_score >= 0 && result.engagement_score <= 1,
        `engagement_score out of bounds: ${result.engagement_score} for ${JSON.stringify(input)} (${category})`,
      );
    }
  }
});

// ─── Test 5 — Omitted activity_category defaults to sedentary ────────────────
test("undefined activity_category defaults to sedentary", () => {
  const result = calculateEngagement({
    heart_rate:     80,
    hrv_rmssd:      35,
    motion_level:   5,
    hr_baseline:    70,
    rmssd_baseline: 45,
    // activity_category intentionally omitted
  });
  assert.equal(result.activity_category, "sedentary");
});

// ─── Test 6 — Unknown category falls back to sedentary motion coefficient ─────
test("invalid activity_category falls back to sedentary behavior", () => {
  const common = {
    heart_rate:     80,
    hrv_rmssd:      35,
    motion_level:   5,
    hr_baseline:    70,
    rmssd_baseline: 45,
  };

  const unknown   = calculateEngagement({ ...common, activity_category: "unknown_category" });
  const sedentary = calculateEngagement({ ...common, activity_category: "sedentary" });

  assert.equal(
    unknown.engagement_score,
    sedentary.engagement_score,
    `unknown category should behave like sedentary: got ${unknown.engagement_score} vs ${sedentary.engagement_score}`,
  );
});

// ─── Test 7 — Output rounded to ≤ 4 decimal places ───────────────────────────
test("results rounded to 4 decimal places", () => {
  const result = calculateEngagement({
    heart_rate:     75,
    hrv_rmssd:      42,
    motion_level:   0.3,
    hr_baseline:    70,
    rmssd_baseline: 45,
    activity_category: "sedentary",
  });

  const decimals = (n) => (n.toString().split(".")[1] || "").length;
  assert.ok(decimals(result.arousal)          <= 4, `arousal has >4 decimals: ${result.arousal}`);
  assert.ok(decimals(result.valence)          <= 4, `valence has >4 decimals: ${result.valence}`);
  assert.ok(decimals(result.engagement_score) <= 4, `engagement_score has >4 decimals: ${result.engagement_score}`);
});
