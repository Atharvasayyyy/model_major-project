const express = require("express");
const { getSensorStatus } = require("../controllers/sensorDataController");

const router = express.Router();

router.get("/:child_id", getSensorStatus);

module.exports = router;