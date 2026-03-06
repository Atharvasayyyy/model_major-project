const mongoose = require("mongoose");

function isValidNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validateSensorPayload(req, res, next) {
  const body = req.body || {};

  const child_id = body.child_id;
  const heart_rate = body.heart_rate ?? body.heartRate;
  const hrv_rmssd = body.hrv_rmssd ?? body.hrvRmssd;

  // Serial payload contains gravity-inclusive motionLevel; normalize to delta from 9.8.
  let motion_level = body.motion_level;
  const hasSerialMotion = body.motionLevel !== undefined;
  if (motion_level === undefined && hasSerialMotion) {
    motion_level = isValidNumber(body.motionLevel)
      ? Number(Math.abs(body.motionLevel - 9.8).toFixed(3))
      : body.motionLevel;
  }

  req.body = {
    ...body,
    child_id,
    heart_rate,
    hrv_rmssd,
    motion_level,
  };

  req.sensorPayloadSource = (body.heartRate !== undefined || body.hrvRmssd !== undefined || hasSerialMotion)
    ? "serial-bridge"
    : "default";

  const isValid =
    typeof child_id === "string"
    && mongoose.Types.ObjectId.isValid(child_id)
    && isValidNumber(heart_rate)
    && heart_rate >= 40
    && heart_rate <= 200
    && isValidNumber(hrv_rmssd)
    && hrv_rmssd >= 0
    && hrv_rmssd <= 200
    && isValidNumber(motion_level);

  if (!isValid) {
    return res.status(400).json({ message: "Invalid sensor data format" });
  }

  return next();
}

module.exports = validateSensorPayload;