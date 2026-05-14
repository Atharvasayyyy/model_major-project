const mongoose = require("mongoose");

// Fix 4b — added activity_session_id for per-session analytics.
// Added three compound indexes to support all access patterns without full scans.
const engagementResultSchema = new mongoose.Schema(
  {
    child_id: { type: mongoose.Schema.Types.ObjectId, ref: "Child", required: true },
    // activity_session_id: links this engagement score back to the ActivitySession
    // that was active when the sensor reading arrived.
    // null when engagement was computed outside a session (should not happen, but defensively typed).
    activity_session_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ActivitySession",
      default: null,
    },
    activity:         { type: String, required: true },
    arousal:          { type: Number, required: true },
    valence:          { type: Number, required: true },
    engagement_score: { type: Number, required: true },
    timestamp:        { type: Date, required: true },
  },
  { versionKey: false },
);

// "All scores for child X, newest first" — primary dashboard query
engagementResultSchema.index({ child_id: 1, timestamp: -1 });
// "All scores for session X, newest first" — finishActivity aggregation + session detail view
engagementResultSchema.index({ activity_session_id: 1, timestamp: -1 });
// "Avg engagement by activity for child X" — per-activity analytics (Step 8)
engagementResultSchema.index({ child_id: 1, activity: 1, timestamp: -1 });

module.exports = mongoose.model("EngagementResult", engagementResultSchema);
