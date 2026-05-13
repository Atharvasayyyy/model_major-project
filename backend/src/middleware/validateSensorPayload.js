const mongoose = require("mongoose");

function isValidNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// Sensor plausibility thresholds (must match bridge constants)
const HEART_RATE_MIN = 40;
const HEART_RATE_MAX = 200;
const HRV_RMSSD_MAX  = 500; // ms — above this = no finger on MAX30100

function validateSensorPayload(req, res, next) {
  const body = req.body || {};

  // ── Field extraction — accept snake_case only (bridge converts for us) ──
  const child_id          = body.child_id;
  const heart_rate        = body.heart_rate;
  const hrv_rmssd         = body.hrv_rmssd;
  const motion_level      = body.motion_level;   // already gravity-removed by bridge
  const spo2              = body.spo2;
  const restlessness_index = body.restlessness_index;
  const session_id        = body.session_id;
  const timestamp         = body.timestamp;

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
  };

  // ── Structural validation — required fields must be numeric ─────────────
  if (!isValidNumber(motion_level)) {
    return res.status(400).json({
      message: "Invalid sensor data format",
      details: { received: { motion_level }, reason: "motion_level must be a finite number" },
    });
  }
  if (child_id !== undefined && !(typeof child_id === "string" && mongoose.Types.ObjectId.isValid(child_id))) {
    return res.status(400).json({
      message: "Invalid sensor data format",
      details: { received: { child_id }, reason: "child_id must be a valid ObjectId string" },
    });
  }
  if (spo2 !== undefined && !(isValidNumber(spo2) && spo2 >= 0 && spo2 <= 100)) {
    // Out-of-range spo2 (e.g. ESP32 artifact spo2=120 when no finger lock) —
    // strip the field rather than rejecting the whole payload, so HR/HRV still get stored.
    console.warn(`[SENSOR WARN] spo2=${spo2} out of range — dropping field, keeping rest of payload`);
    delete req.body.spo2;
  }
  if (restlessness_index !== undefined && !(isValidNumber(restlessness_index) && restlessness_index >= 0)) {
    return res.status(400).json({
      message: "Invalid sensor data format",
      details: { received: { restlessness_index }, reason: "restlessness_index must be >= 0" },
    });
  }

  // ── Physiological plausibility — reject garbage readings ────────────────
  // heartRate=0 or hrvRmssd>500 means no finger is on the MAX30100.
  // These readings must be rejected so they don't pollute the DB.
  if (isValidNumber(heart_rate)) {
    if (heart_rate === 0) {
      return res.status(400).json({
        message: `Invalid sensor reading: heart_rate=0 (no finger detected on MAX30100)`,
        details: { heart_rate, hrv_rmssd },
      });
    }
    if (heart_rate < HEART_RATE_MIN || heart_rate > HEART_RATE_MAX) {
      return res.status(400).json({
        message: `Invalid sensor reading: heart_rate=${heart_rate} is outside valid range (${HEART_RATE_MIN}–${HEART_RATE_MAX} bpm)`,
        details: { heart_rate },
      });
    }
  }

  if (isValidNumber(hrv_rmssd)) {
    if (hrv_rmssd <= 0 || hrv_rmssd > HRV_RMSSD_MAX) {
      return res.status(400).json({
        message: `Invalid sensor reading: hrv_rmssd=${hrv_rmssd} is outside plausible range (0–${HRV_RMSSD_MAX} ms). Place finger on MAX30100.`,
        details: { hrv_rmssd },
      });
    }
  }

  return next();
}

module.exports = validateSensorPayload;