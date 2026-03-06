const express = require("express");
const {
  getRealtime,
  getEngagementTrend,
  getActivityInsights,
  getDailySummary,
  getAlerts,
} = require("../controllers/analyticsController");

const router = express.Router();

router.get("/realtime/:child_id", getRealtime);
router.get("/engagement-trend/:child_id", getEngagementTrend);
router.get("/activity-insights/:child_id", getActivityInsights);
router.get("/daily-summary/:child_id", getDailySummary);
router.get("/alerts/:child_id", getAlerts);

module.exports = router;
