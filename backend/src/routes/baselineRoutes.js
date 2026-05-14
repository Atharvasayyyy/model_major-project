const express = require("express");
const {
  getBaselineStatus,
  startBaseline,
  recordBaseline,
  finishBaseline,
  cancelBaseline, // Fix 2.4
} = require("../controllers/baselineController");

const router = express.Router();

router.get("/status/:child_id", getBaselineStatus);
router.post("/start",   startBaseline);
router.post("/record",  recordBaseline);
router.post("/finish",  finishBaseline);
router.post("/cancel",  cancelBaseline); // Fix 2.4

module.exports = router;

