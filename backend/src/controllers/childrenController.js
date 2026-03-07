const Child = require("../models/Child");

async function createChild(req, res) {
  try {
    const { child_name, age, grade, device_id } = req.body;
    if (!child_name || age === undefined || !grade || !device_id) {
      return res.status(400).json({ message: "child_name, age, grade and device_id are required" });
    }

    const child = await Child.create({
      child_name,
      age,
      grade,
      device_id,
      parent_id: req.user._id,
      hr_baseline: null,
      rmssd_baseline: null,
      baseline_in_progress: false,
    });

    return res.status(201).json(child);
  } catch (error) {
    return res.status(500).json({ message: "Failed to create child", error: error.message });
  }
}

async function getChildren(req, res) {
  try {
    const children = await Child.find({ parent_id: req.user._id }).sort({ createdAt: -1 });
    return res.json(children);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch children", error: error.message });
  }
}

async function getChildById(req, res) {
  try {
    const child = await Child.findOne({ _id: req.params.id, parent_id: req.user._id });
    if (!child) {
      return res.status(404).json({ message: "Child not found" });
    }
    return res.json(child);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch child", error: error.message });
  }
}

async function updateChild(req, res) {
  try {
    const allowed = ["child_name", "age", "grade", "device_id", "hr_baseline", "rmssd_baseline"];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const child = await Child.findOneAndUpdate(
      { _id: req.params.id, parent_id: req.user._id },
      updates,
      { new: true, runValidators: true },
    );

    if (!child) {
      return res.status(404).json({ message: "Child not found" });
    }

    return res.json(child);
  } catch (error) {
    return res.status(500).json({ message: "Failed to update child", error: error.message });
  }
}

async function deleteChild(req, res) {
  try {
    const child = await Child.findOneAndDelete({ _id: req.params.id, parent_id: req.user._id });
    if (!child) {
      return res.status(404).json({ message: "Child not found" });
    }
    return res.json({ message: "Child deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete child", error: error.message });
  }
}

module.exports = { createChild, getChildren, getChildById, updateChild, deleteChild };
