const mongoose = require("mongoose");

const engagementResultSchema = new mongoose.Schema(
  {
    child_id: { type: mongoose.Schema.Types.ObjectId, ref: "Child", required: true },
    activity: { type: String, required: true },
    arousal: { type: Number, required: true },
    valence: { type: Number, required: true },
    engagement_score: { type: Number, required: true },
    timestamp: { type: Date, required: true },
  },
  { versionKey: false },
);

module.exports = mongoose.model("EngagementResult", engagementResultSchema);
