const express = require("express");
const { register, login, getActiveChild, setActiveChild } = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);

// Active child routing — auth required
router.get("/active-child",  authMiddleware, getActiveChild);
router.put("/active-child",  authMiddleware, setActiveChild);

module.exports = router;

