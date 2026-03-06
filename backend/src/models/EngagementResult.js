const mongoose = require("mongoose");

const engagementResultSchema = new mongoose.Schema(
  {
    child_id: { type: mongoose.Schema.Types.ObjectId, ref: "Child", required: true },
    activity: { type: String, required: true },
    activity_category: { type: String, required: true },
    heart_rate: { type: Number, required: true },
    hrv_rmssd: { type: Number, required: true },
    motion_level: { type: Number, required: true },
    arousal: { type: Number, required: true },
    valence: { type: Number, required: true },
    engagement_score: { type: Number, required: true },
    timestamp: { type: Date, required: true },
  },
  { versionKey: false },
);

module.exports = mongoose.model("EngagementResult", engagementResultSchema);
