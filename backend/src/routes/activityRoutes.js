const express = require("express");
const { setActivity } = require("../controllers/activityController");

const router = express.Router();

router.post("/set", setActivity);

module.exports = router;