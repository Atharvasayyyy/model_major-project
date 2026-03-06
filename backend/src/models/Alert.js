const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema(
  {
    child_id: { type: mongoose.Schema.Types.ObjectId, ref: "Child", required: true },
    alert_type: {
      type: String,
      enum: ["high_stress", "low_engagement", "abnormal_heart_rate"],
      required: true,
    },
    message: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

module.exports = mongoose.model("Alert", alertSchema);
