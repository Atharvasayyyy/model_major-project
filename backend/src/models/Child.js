const mongoose = require("mongoose");

const childSchema = new mongoose.Schema(
  {
    child_name: { type: String, required: true, trim: true },
    age: { type: Number, required: true },
    grade: { type: String, required: true },
    parent_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    device_id: { type: String, required: true, trim: true },
    hr_baseline: { type: Number, default: null },
    rmssd_baseline: { type: Number, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

module.exports = mongoose.model("Child", childSchema);
