const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["parent"], default: "parent" },
    // Active child for sensor routing — whichever child the user has selected in the dashboard.
    // Sensor bridge data is routed here automatically. null = fall back to most-recent child.
    active_child_id: { type: mongoose.Schema.Types.ObjectId, ref: "Child", default: null },
  },
  { timestamps: true },  // createdAt + updatedAt (updatedAt used for active-child routing)
);

module.exports = mongoose.model("User", userSchema);
