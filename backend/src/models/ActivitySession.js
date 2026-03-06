const mongoose = require("mongoose");

const activitySessionSchema = new mongoose.Schema(
  {
    child_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Child",
      required: true,
      unique: true,
      index: true,
    },
    activity: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    started_at: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false },
);

module.exports = mongoose.model("ActivitySession", activitySessionSchema);