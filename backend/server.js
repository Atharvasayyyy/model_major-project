const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { connectDB, isDbReady } = require("./config/db");
const authMiddleware = require("./src/middleware/authMiddleware");

const authRoutes = require("./src/routes/authRoutes");
const childrenRoutes = require("./src/routes/childrenRoutes");
const baselineRoutes = require("./src/routes/baselineRoutes");
const sensorDataRoutes = require("./src/routes/sensorDataRoutes");
const sensorStatusRoutes = require("./src/routes/sensorStatusRoutes");
const debugRoutes = require("./src/routes/debugRoutes");
const activityRoutes = require("./src/routes/activityRoutes");
const analyticsRoutes = require("./src/routes/analyticsRoutes");
const alertsRoutes = require("./src/routes/alertsRoutes");

dotenv.config();
connectDB();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  const dbConnected = isDbReady();
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? "ok" : "degraded",
    service: "mindpulse-backend",
    database: dbConnected ? "connected" : "disconnected",
  });
});

app.use("/api", (_req, res, next) => {
  if (!isDbReady()) {
    return res.status(503).json({
      message: "Database unavailable. Verify Atlas Network Access and database user credentials.",
    });
  }

  next();
});

app.use("/api/auth", authRoutes);
app.use("/api/children", authMiddleware, childrenRoutes);
app.use("/api/baseline", authMiddleware, baselineRoutes);
app.use("/api/activity", authMiddleware, activityRoutes);
app.use("/api/sensor-data", sensorDataRoutes);
app.use("/api/sensor-status", authMiddleware, sensorStatusRoutes);
app.use("/api/debug", authMiddleware, debugRoutes);
app.use("/api/analytics", authMiddleware, analyticsRoutes);
app.use("/api/alerts", authMiddleware, alertsRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
