const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

async function register(req, res) {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "name, email and password are required" });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: "parent",
    });

    const token = signToken(user._id);
    return res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    return res.status(500).json({ message: "Registration failed", error: error.message });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "email and password are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = signToken(user._id);
    return res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    return res.status(500).json({ message: "Login failed", error: error.message });
  }
}

// ── Active child endpoints ────────────────────────────────────────────────────
// These let the frontend tell the backend which child is currently "active" so
// that sensor bridge data (which arrives without a child_id) routes to the right profile.

async function getActiveChild(req, res) {
  try {
    const user = await User.findById(req.user._id).populate("active_child_id");
    return res.json({
      active_child_id: user.active_child_id?._id || null,
      active_child: user.active_child_id || null,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to get active child", error: error.message });
  }
}

async function setActiveChild(req, res) {
  try {
    const { child_id } = req.body;

    if (!child_id) {
      return res.status(400).json({ message: "child_id is required" });
    }

    // Verify the child belongs to this user before accepting it.
    const Child = require("../models/Child");
    const child = await Child.findOne({ _id: child_id, parent_id: req.user._id });
    if (!child) {
      return res.status(404).json({ message: "Child not found or not owned by user" });
    }

    await User.updateOne(
      { _id: req.user._id },
      { active_child_id: child_id },
    );

    console.log(`[ACTIVE CHILD] User ${req.user._id} set active child to ${child.child_name} (${child_id})`);

    return res.json({
      message: "Active child updated",
      active_child_id: child_id,
      active_child_name: child.child_name,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to set active child", error: error.message });
  }
}

module.exports = { register, login, getActiveChild, setActiveChild };
