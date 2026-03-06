import axios from "axios";

const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL || "http://localhost:5000/api").replace(/\/$/, "");

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("mindpulse_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function mapUser(raw) {
  return {
    id: String(raw?.id || raw?._id || ""),
    name: String(raw?.name || ""),
    email: String(raw?.email || ""),
  };
}

function mapSensor(entry, childId) {
  return {
    id: String(entry?.id || entry?._id || `SD${Date.now()}`),
    child_id: String(entry?.child_id || childId || ""),
    activity: String(entry?.activity || "Unknown"),
    heart_rate: Number(entry?.heart_rate || 0),
    hrv_rmssd: Number(entry?.hrv_rmssd || 0),
    motion_level: Number(entry?.motion_level || 0),
    engagement_score: Number(entry?.engagement_score || 0),
    arousal: Number(entry?.arousal || 0),
    valence: Number(entry?.valence || 0),
    timestamp: String(entry?.timestamp || new Date().toISOString()),
  };
}

function mapAlert(alert, childId) {
  const type = String(alert?.alert_type || alert?.type || "low_engagement");
  return {
    id: String(alert?.id || alert?._id || `A${Date.now()}`),
    child_id: String(alert?.child_id || childId || ""),
    type,
    message: String(alert?.message || "Alert detected."),
    timestamp: String(alert?.createdAt || alert?.timestamp || new Date().toISOString()),
    read: Boolean(alert?.read || false),
  };
}

export async function registerUser(payload) {
  const { data } = await apiClient.post("/auth/register", payload);
  return {
    token: data?.token || null,
    user: mapUser(data?.user || data),
  };
}

export async function loginUser(payload) {
  const { data } = await apiClient.post("/auth/login", payload);
  return {
    token: data?.token || null,
    user: mapUser(data?.user || data),
  };
}

export async function getChildren() {
  const { data } = await apiClient.get("/children");
  return Array.isArray(data) ? data : data?.children || [];
}

export async function createChild(payload) {
  const { data } = await apiClient.post("/children", payload);
  return data;
}

export async function getChildById(childId) {
  const { data } = await apiClient.get(`/children/${childId}`);
  return data;
}

export async function updateChild(childId, payload) {
  const { data } = await apiClient.put(`/children/${childId}`, payload);
  return data;
}

export async function deleteChild(childId) {
  await apiClient.delete(`/children/${childId}`);
}

export async function startBaseline(child_id) {
  const { data } = await apiClient.post("/baseline/start", { child_id });
  return data;
}

export async function recordBaseline(payload) {
  const { data } = await apiClient.post("/baseline/record", payload);
  return data;
}

export async function finishBaseline(child_id) {
  const { data } = await apiClient.post("/baseline/finish", { child_id });
  return data;
}

export async function postSensorData(payload) {
  const { data } = await apiClient.post("/sensor-data", payload);
  return data;
}

export async function getRealtimeAnalytics(childId) {
  const { data } = await apiClient.get(`/analytics/realtime/${childId}`);
  const latestSensor = data?.latest_sensor || null;
  const latestEngagement = data?.latest_engagement || null;

  if (!latestSensor && !latestEngagement) {
    return null;
  }

  return mapSensor(
    {
      ...latestSensor,
      ...latestEngagement,
      child_id: latestSensor?.child_id || latestEngagement?.child_id || childId,
      activity: latestSensor?.activity || latestEngagement?.activity,
      heart_rate: latestSensor?.heart_rate || latestEngagement?.heart_rate,
      hrv_rmssd: latestSensor?.hrv_rmssd || latestEngagement?.hrv_rmssd,
      motion_level: latestSensor?.motion_level || latestEngagement?.motion_level,
      timestamp: latestEngagement?.timestamp || latestSensor?.timestamp,
    },
    childId,
  );
}

export async function getEngagementTrend(childId) {
  const { data } = await apiClient.get(`/analytics/engagement-trend/${childId}`);
  if (!Array.isArray(data)) return [];
  return data.map((row) => mapSensor(row, childId));
}

export async function getActivityInsights(childId) {
  const { data } = await apiClient.get(`/analytics/activity-insights/${childId}`);
  return Array.isArray(data) ? data : [];
}

export async function getDailySummary(childId) {
  const { data } = await apiClient.get(`/analytics/daily-summary/${childId}`);
  return {
    average_heart_rate: Number(data?.average_heart_rate || 0),
    average_hrv: Number(data?.average_hrv || 0),
    average_engagement_score: Number(data?.average_engagement_score || 0),
  };
}

export async function getAlerts(childId) {
  const { data } = await apiClient.get(`/alerts/${childId}`);
  if (!Array.isArray(data)) return [];
  return data.map((row) => mapAlert(row, childId));
}

export const api = {
  baseUrl: API_BASE_URL,
  client: apiClient,
  registerUser,
  loginUser,
  getChildren,
  createChild,
  getChildById,
  updateChild,
  deleteChild,
  startBaseline,
  recordBaseline,
  finishBaseline,
  postSensorData,
  getRealtimeAnalytics,
  getEngagementTrend,
  getActivityInsights,
  getDailySummary,
  getAlerts,

  // Compatibility wrappers for existing app context usage
  async register(name, email, password) {
    return registerUser({ name, email, password });
  },
  async login(email, password) {
    return loginUser({ email, password });
  },
};
