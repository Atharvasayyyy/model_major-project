const mongoose = require("mongoose");
const { ACTIVITY_LIST } = require("../config/activityCategories");

// Fix 3 — schema overhaul:
//   • Removed unique:true from child_id (was destroying session history)
//   • Added enum constraints on activity and category
//   • Added summary fields populated at session close
//   • Added compound indexes for session queries
const activitySessionSchema = new mongoose.Schema(
  {
    child_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Child",
      required: true,
      // NOTE: unique:true intentionally removed — multiple sessions per child must be preserved.
    },
    activity: {
      type: String,
      required: true,
      trim: true,
      enum: {
        values: ACTIVITY_LIST,
        message: `activity must be one of: ${ACTIVITY_LIST.join(", ")}`,
      },
    },
    category: {
      type: String,
      required: true,
      enum: ["active", "sedentary"],
      default: "sedentary",
    },
    started_at:   { type: Date, required: true, default: Date.now },
    finished_at:  { type: Date, default: null },
    session_active: { type: Boolean, required: true, default: true },

    // Summary fields — computed and stored when finishActivity is called
    duration_seconds:  { type: Number, default: null },
    sample_count:      { type: Number, default: 0 },
    avg_engagement:    { type: Number, default: null },
    avg_heart_rate:    { type: Number, default: null },
    avg_hrv_rmssd:     { type: Number, default: null },
    avg_motion_level:  { type: Number, default: null },
  },
  { versionKey: false },
);

// "Find active session for child" — used by sensorDataController on every sensor read
activitySessionSchema.index({ child_id: 1, session_active: 1 });
// "List past sessions for child, newest first"
activitySessionSchema.index({ child_id: 1, started_at: -1 });

module.exports = mongoose.model("ActivitySession", activitySessionSchema);