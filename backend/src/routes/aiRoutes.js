const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { aiChat, aiInsights, aiRecommendations, aiSummary } = require("../controllers/aiController");

const router = express.Router();

// All AI routes require authentication
router.use(authMiddleware);

router.post("/chat",                       aiChat);
router.get("/insights/:child_id",          aiInsights);
router.get("/recommendations/:child_id",   aiRecommendations);
router.get("/summary/:child_id",           aiSummary);

module.exports = router;
