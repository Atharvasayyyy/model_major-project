const mongoose = require("mongoose");

const baselineSampleSchema = new mongoose.Schema(
  {
    child_id:     { type: mongoose.Schema.Types.ObjectId, ref: "Child", required: true },
    heart_rate:   { type: Number, required: true },
    hrv_rmssd:    { type: Number, required: true },
    motion_level: { type: Number, required: true },
    timestamp:    { type: Date, default: Date.now },
    session_active: { type: Boolean, default: true },
  },
  { versionKey: false },
);

// Fix 2.5 — index for finishBaseline find/sort and getBaselineStatus countDocuments
baselineSampleSchema.index({ child_id: 1, timestamp: -1 });

module.exports = mongoose.model("BaselineSample", baselineSampleSchema);

