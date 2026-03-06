const express = require("express");
const { ingestSensorData } = require("../controllers/sensorDataController");
const validateSensorPayload = require("../middleware/validateSensorPayload");

const router = express.Router();

router.post("/", validateSensorPayload, ingestSensorData);

module.exports = router;
