const express = require("express");
const {
  getRealtime,
  getEngagementTrend,
  getActivityInsights,
  getDailySummary,
  getAlerts,
  getActivityTimeStats,
  getTimeOfDayPattern,
} = require("../controllers/analyticsController");

const router = express.Router();

// Existing routes
router.get("/realtime/:child_id", getRealtime);
router.get("/engagement-trend/:child_id", getEngagementTrend);
router.get("/activity-insights/:child_id", getActivityInsights);
router.get("/daily-summary/:child_id", getDailySummary);
router.get("/alerts/:child_id", getAlerts);

// New routes (Step 8 Phase 1)
router.get("/activity-time-stats/:child_id", getActivityTimeStats);
router.get("/time-of-day/:child_id", getTimeOfDayPattern);

module.exports = router;
