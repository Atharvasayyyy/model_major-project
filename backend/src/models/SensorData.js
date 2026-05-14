const mongoose = require("mongoose");

const sensorDataSchema = new mongoose.Schema(
  {
    child_id:             { type: mongoose.Schema.Types.ObjectId, ref: "Child", required: true },
    // activity_session_id: MongoDB ObjectId of the ActivitySession document active when
    // this reading arrived. null when no session was active (raw stream or baseline mode).
    activity_session_id:  { type: mongoose.Schema.Types.ObjectId, ref: "ActivitySession", default: null },
    activity:             { type: String, required: true },
    heart_rate:           { type: Number, required: true },
    hrv_rmssd:            { type: Number, required: true },
    motion_level:         { type: Number, required: true },
    spo2:                 { type: Number, default: null },
    restlessness_index:   { type: Number, default: null },
    // session_id: traces a group of readings back to one ESP32 BOOT session (not an ActivitySession).
    // A change in this value indicates a device power-cycle.
    session_id:           { type: String, default: null },
    // esp32_uptime_ms: raw millis() from the ESP32 at send time.
    // A sudden drop to a low value means the device rebooted.
    esp32_uptime_ms:      { type: Number, default: null },
    timestamp:            { type: Date, required: true },
  },
  { versionKey: false },
);

// Compound index: primary access pattern — "last N readings for child X"
sensorDataSchema.index({ child_id: 1, timestamp: -1 });
// Single-field index: admin queries across all children ordered by time
sensorDataSchema.index({ timestamp: -1 });
// Fix 4: per-session queries — "all readings for session X ordered by time"
sensorDataSchema.index({ activity_session_id: 1, timestamp: -1 });


module.exports = mongoose.model("SensorData", sensorDataSchema);
