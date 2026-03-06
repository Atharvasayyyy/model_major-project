const mongoose = require("mongoose");

const RECONNECT_DELAY_MS = 10000;
let reconnectTimer = null;

const isDbReady = () => mongoose.connection.readyState === 1;

const scheduleReconnect = () => {
  if (reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    await connectDB();
  }, RECONNECT_DELAY_MS);
};

const connectDB = async () => {
  if (isDbReady()) {
    return;
  }

  if (!process.env.MONGO_URI) {
    console.error("MongoDB connection error: MONGO_URI is not set");
    scheduleReconnect();
    return;
  }

  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log("MongoDB connected");
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    scheduleReconnect();
  }
};

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB disconnected. Retrying...");
  scheduleReconnect();
});

module.exports = {
  connectDB,
  isDbReady,
};
