const express = require("express");
const { setActivity, startActivity, finishActivity, getActivityStatus } = require("../controllers/activityController");

const router = express.Router();

router.post("/set", setActivity);
router.post("/start", startActivity);
router.post("/finish", finishActivity);
router.get("/status/:child_id", getActivityStatus);

module.exports = router;