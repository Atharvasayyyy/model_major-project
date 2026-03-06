const express = require("express");
const { ingestSensorData } = require("../controllers/sensorDataController");

const router = express.Router();

router.post("/", ingestSensorData);

module.exports = router;
