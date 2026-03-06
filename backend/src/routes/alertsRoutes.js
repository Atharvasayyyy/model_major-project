const express = require("express");
const { getAlerts } = require("../controllers/analyticsController");

const router = express.Router();

router.get("/:child_id", getAlerts);

module.exports = router;
