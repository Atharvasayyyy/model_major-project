const mongoose = require("mongoose");

function isValidNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// Sensor plausibility thresholds (must match bridge constants)
const HEART_RATE_MIN    = 40;
const HEART_RATE_MAX    = 200;
// Healthy adult RMSSD: 10-150ms. Children: 20-200ms.
// Values above 250ms are virtually always artifacts (missed beats, RR calculation errors,
// or sensor disconnection). 500ms was far too permissive.
const HRV_RMSSD_MIN     = 0;    // ms — 0 is valid: sensor warming up, only 1 beat captured yet
                                 //        engagement scoring already skips hrv_rmssd=0 readings
const HRV_RMSSD_MAX     = 250;  // ms — above this = sensor artifact
// After gravity removal (abs(raw - 9.8)), normal rest = ~0, vigorous shake = 5-15 m/s².
// 30 m/s² is the absolute ceiling for any human movement.
// Anything higher (e.g. 111 m/s²) is an MPU6050 I2C glitch or dropped packet.
const MOTION_LEVEL_MAX  = 30;   // m/s² post-gravity-removal
// Clinically plausible SpO2 range — below 70 is likely sensor artifact, not a real reading
const SPO2_MIN = 70;
const SPO2_MAX = 100;

function validateSensorPayload(req, res, next) {
  const body = req.body || {};

  // ── Field extraction — accept snake_case only (bridge converts for us) ──
  const child_id           = body.child_id;
  const heart_rate         = body.heart_rate;
  const hrv_rmssd          = body.hrv_rmssd;
  const motion_level       = body.motion_level;   // already gravity-removed by bridge
  const spo2               = body.spo2;
  const restlessness_index = body.restlessness_index;
  const session_id         = body.session_id;
  const esp32_uptime_ms    = body.esp32_uptime_ms;
  // timestamp is intentionally NOT forwarded; server clock is used in the controller

  // ── Detect source (serial bridge always sends snake_case after our fix) ──
  req.sensorPayloadSource = "serial-bridge";

  // ── Normalise body so the controller sees clean fields ──────────────────
  req.body = {
    ...body,
    child_id,
    heart_rate,
    hrv_rmssd,
    motion_level,
    spo2,
    restlessness_index,
    session_id,
    esp32_uptime_ms,
  };

  // ── Structural validation — required fields must all be finite numbers ───
  // Covers missing fields AND wrong types (e.g. string "75" instead of 75).
  const missingOrInvalid = [];
  if (!isValidNumber(heart_rate))  missingOrInvalid.push("heart_rate");
  if (!isValidNumber(hrv_rmssd))   missingOrInvalid.push("hrv_rmssd");
  if (!isValidNumber(motion_level)) missingOrInvalid.push("motion_level");

  if (missingOrInvalid.length > 0) {
    return res.status(400).json({
      message: "Invalid sensor data format",
      details: {
        received: { heart_rate, hrv_rmssd, motion_level },
        reason: `The following required fields are missing or not finite numbers: ${missingOrInvalid.join(", ")}`,
      },
    });
  }

  // ── Optional field — child_id format check ───────────────────────────────
  if (child_id !== undefined && !(typeof child_id === "string" && mongoose.Types.ObjectId.isValid(child_id))) {
    return res.status(400).json({
      message: "Invalid sensor data format",
      details: { received: { child_id }, reason: "child_id must be a valid ObjectId string" },
    });
  }

  // ── Optional field — session_id format check ─────────────────────────────
  if (session_id !== undefined && typeof session_id !== "string") {
    return res.status(400).json({
      message: "Invalid sensor data format",
      details: { received: { session_id }, reason: "session_id must be a string if provided" },
    });
  }

  // ── Optional field — esp32_uptime_ms format check ────────────────────────
  if (esp32_uptime_ms !== undefined && !(Number.isInteger(esp32_uptime_ms) && esp32_uptime_ms >= 0)) {
    return res.status(400).json({
      message: "Invalid sensor data format",
      details: { received: { esp32_uptime_ms }, reason: "esp32_uptime_ms must be a non-negative integer if provided" },
    });
  }

  // ── Optional field — spo2 ────────────────────────────────────────────────
  // spo2 = 0 is a sensor warmup artifact. Accept only clinically plausible range 70-100.
  // Drop out-of-range rather than rejecting the whole payload so HR/HRV still get stored.
  if (spo2 !== undefined) {
    if (!(isValidNumber(spo2) && spo2 >= SPO2_MIN && spo2 <= SPO2_MAX)) {
      console.warn(`[SENSOR WARN] spo2=${spo2} out of clinical range (${SPO2_MIN}–${SPO2_MAX}) or zero — dropping field, keeping rest of payload`);
      delete req.body.spo2;
    }
  }

  // ── Optional field — restlessness_index ─────────────────────────────────
  if (restlessness_index !== undefined && !(isValidNumber(restlessness_index) && restlessness_index >= 0)) {
    return res.status(400).json({
      message: "Invalid sensor data format",
      details: { received: { restlessness_index }, reason: "restlessness_index must be >= 0" },
    });
  }

  // ── Physiological plausibility — reject garbage readings ────────────────
  // All three required fields are guaranteed finite numbers by this point.

  if (heart_rate < HEART_RATE_MIN || heart_rate > HEART_RATE_MAX) {
    return res.status(400).json({
      message: `Invalid sensor reading: heart_rate=${heart_rate} is outside valid range (${HEART_RATE_MIN}–${HEART_RATE_MAX} bpm)`,
      details: { heart_rate },
    });
  }

  if (hrv_rmssd < HRV_RMSSD_MIN || hrv_rmssd > HRV_RMSSD_MAX) {
    return res.status(400).json({
      message: `Invalid sensor reading: hrv_rmssd=${hrv_rmssd} is outside plausible range (${HRV_RMSSD_MIN}–${HRV_RMSSD_MAX} ms). Likely sensor artifact — check finger contact on MAX30100.`,
      details: { hrv_rmssd },
    });
  }

  if (motion_level < 0 || motion_level > MOTION_LEVEL_MAX) {
    return res.status(400).json({
      message: `Invalid sensor reading: motion_level=${motion_level} is outside plausible range (0–${MOTION_LEVEL_MAX} m/s²). Likely MPU6050 glitch or I2C error.`,
      details: { motion_level },
    });
  }

  return next();
}

module.exports = validateSensorPayload;