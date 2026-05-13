const mongoose = require("mongoose");
let MongoMemoryServer;
try {
  MongoMemoryServer = require("mongodb-memory-server").MongoMemoryServer;
} catch (err) {
  // Ignore
}

const RECONNECT_DELAY_MS = 10000;
let reconnectTimer = null;
let memoryServer = null;

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

  let uri = process.env.MONGO_URI;

  if (uri === "memory") {
    if (!MongoMemoryServer) {
        console.error("mongodb-memory-server not installed");
        return;
    }
    if (!memoryServer) {
        memoryServer = await MongoMemoryServer.create();
    }
    uri = memoryServer.getUri();
  } else if (!uri) {
    console.error("MongoDB connection error: MONGO_URI is not set");
    scheduleReconnect();
    return;
  }

  try {
    await mongoose.connect(uri, {
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
