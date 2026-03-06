const express = require("express");
const {
  getBaselineStatus,
  startBaseline,
  recordBaseline,
  finishBaseline,
} = require("../controllers/baselineController");

const router = express.Router();

router.get("/status/:child_id", getBaselineStatus);
router.post("/start", startBaseline);
router.post("/record", recordBaseline);
router.post("/finish", finishBaseline);

module.exports = router;
