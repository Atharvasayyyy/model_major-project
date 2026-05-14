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
const alertsRoutes    = require("./src/routes/alertsRoutes");
const aiRoutes        = require("./src/routes/aiRoutes");

dotenv.config();
connectDB();

const app = express();

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (req.method === 'POST' && req.url === '/api/sensor-data') {
    console.log(`Sensor Payload Body: ${JSON.stringify(req.body)}`);
  }
  next();
});

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
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
// /api/activity/categories is public (frontend dropdown population)
app.use("/api/activity", activityRoutes.publicRouter);
// All other /api/activity/* routes require auth
app.use("/api/activity", authMiddleware, activityRoutes.router);

app.use("/api/sensor-data", sensorDataRoutes);
app.use("/api/sensor-status", authMiddleware, sensorStatusRoutes);
app.use("/api/debug", authMiddleware, debugRoutes);
app.use("/api/analytics", authMiddleware, analyticsRoutes);
app.use("/api/alerts",    authMiddleware, alertsRoutes);
app.use("/api/ai",        aiRoutes);  // auth handled inside aiRoutes

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
