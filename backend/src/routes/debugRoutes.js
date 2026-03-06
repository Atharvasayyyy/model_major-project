const express = require("express");
const { getSensorStreamDebug } = require("../controllers/sensorDataController");

const router = express.Router();

router.get("/sensor-stream", getSensorStreamDebug);

module.exports = router;