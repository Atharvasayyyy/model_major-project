const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema(
  {
    child_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Child",
      required: true,
    },
    alert_type: {
      type: String,
      enum: ["high_stress", "low_engagement", "abnormal_heart_rate"],
      required: true,
    },
    message:      { type: String, required: true },
    is_read:      { type: Boolean, default: false },
    read_at:      { type: Date,    default: null },
    timestamp:    { type: Date,    default: Date.now },
    activity:     { type: String,  default: null },
    metric_value: { type: Number,  default: null },
    triggered_by_session_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ActivitySession",
      default: null,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

module.exports = mongoose.model("Alert", alertSchema);
