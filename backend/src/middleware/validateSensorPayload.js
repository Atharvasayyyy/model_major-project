const mongoose = require("mongoose");

function isValidNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validateSensorPayload(req, res, next) {
  const body = req.body || {};

  const child_id = body.child_id;
  const device_id = typeof body.device_id === "string" ? body.device_id.trim() : undefined;
  const heart_rate = body.heart_rate ?? body.heartRate;
  const hrv_rmssd = body.hrv_rmssd ?? body.hrvRmssd;
  const spo2 = body.spo2;
  const restlessness_index = body.restlessness_index ?? body.restlessnessIndex;

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
    device_id,
    heart_rate,
    hrv_rmssd,
    motion_level,
    spo2,
    restlessness_index,
  };

  req.sensorPayloadSource = (body.heartRate !== undefined || body.hrvRmssd !== undefined || hasSerialMotion)
    ? "serial-bridge"
    : "default";

  const isValid =
    ((typeof child_id === "string" && mongoose.Types.ObjectId.isValid(child_id)) || Boolean(device_id))
    && isValidNumber(motion_level)
    && (heart_rate === undefined || isValidNumber(heart_rate))
    && (hrv_rmssd === undefined || isValidNumber(hrv_rmssd))
    && (spo2 === undefined || (isValidNumber(spo2) && spo2 >= 0 && spo2 <= 100))
    && (restlessness_index === undefined
      || (isValidNumber(restlessness_index) && restlessness_index >= 0 && restlessness_index <= 10));

  if (!isValid) {
    return res.status(400).json({ message: "Invalid sensor data format" });
  }

  return next();
}

module.exports = validateSensorPayload;