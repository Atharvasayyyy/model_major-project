const express = require("express");
const {
  getRealtime,
  getEngagementTrend,
  getActivityInsights,
  getDailySummary,
  getAlerts,
  markAlertAsRead,
  markAllAlertsAsRead,
  getActivityTimeStats,
  getTimeOfDayPattern,
} = require("../controllers/analyticsController");

const router = express.Router();

// Analytics
router.get("/realtime/:child_id",           getRealtime);
router.get("/engagement-trend/:child_id",   getEngagementTrend);
router.get("/activity-insights/:child_id",  getActivityInsights);
router.get("/daily-summary/:child_id",      getDailySummary);
router.get("/activity-time-stats/:child_id",getActivityTimeStats);
router.get("/time-of-day/:child_id",        getTimeOfDayPattern);

// Alerts
router.get("/alerts/:child_id",             getAlerts);
router.put("/alerts/:alertId/read",         markAlertAsRead);
router.put("/alerts/read-all/:childId",     markAllAlertsAsRead);

module.exports = router;
