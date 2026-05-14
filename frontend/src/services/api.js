import axios from "axios";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api").replace(/\/$/, "");

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

let hasRedirectedForAuth = false;

function clearAuthCache() {
  localStorage.removeItem("mindpulse_user");
  localStorage.removeItem("mindpulse_token");
}

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("mindpulse_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const requestUrl = String(error?.config?.url || "");
    const isAuthRoute = requestUrl.includes("/auth/login") || requestUrl.includes("/auth/register");

    if (status === 401 && !isAuthRoute) {
      clearAuthCache();

      if (!hasRedirectedForAuth && typeof window !== "undefined") {
        hasRedirectedForAuth = true;
        window.location.replace("/auth/login");
      }
    }

    return Promise.reject(error);
  },
);

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
    spo2: Number(entry?.spo2 || 0),
    restlessness_index: Number(entry?.restlessness_index || 0),
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
  hasRedirectedForAuth = false;
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

// Fix 2.4 — cancel an in-progress baseline calibration
export async function cancelBaseline(child_id) {
  const { data } = await apiClient.post("/baseline/cancel", { child_id });
  return data;
}

export async function getBaselineStatus(childId) {
  const { data } = await apiClient.get(`/baseline/status/${childId}`);
  return {
    baseline_ready: Boolean(data?.baseline_ready),
    baseline_in_progress: Boolean(data?.baseline_in_progress),
    baseline_started_at: data?.baseline_started_at || null,
    baseline_sample_count: Number(data?.baseline_sample_count ?? 0),
    hr_baseline: Number(data?.hr_baseline ?? 0),
    rmssd_baseline: Number(data?.rmssd_baseline ?? 0),
  };
}

export async function getSensorStatus(childId) {
  const { data } = await apiClient.get(`/sensor-status/${childId}`);
  return data;
}

export async function startActivitySession(child_id, activity) {
  const { data } = await apiClient.post("/activity/start", { child_id, activity });
  return data;
}

export async function finishActivitySession(child_id) {
  const { data } = await apiClient.post("/activity/finish", { child_id });
  return data;
}

export async function getActivityStatus(childId) {
  const { data } = await apiClient.get(`/activity/status/${childId}`);
  return {
    session_active: Boolean(data?.session_active),
    activity: data?.activity || null,
    category: data?.category || null,
    started_at: data?.started_at || null,
    finished_at: data?.finished_at || null,
  };
}

export async function getActivityCategories() {
  const { data } = await apiClient.get("/activity/categories");
  return data;
}

export async function getActivityHistory(childId, limit = 20, skip = 0) {
  const { data } = await apiClient.get(`/activity/history/${childId}?limit=${limit}&skip=${skip}`);
  // Backend returns { sessions: [], pagination: { total, limit, skip, has_more } }
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
      child_id: latestSensor?.child_id ?? latestEngagement?.child_id ?? childId,
      activity: latestSensor?.activity ?? latestEngagement?.activity,
      heart_rate: latestSensor?.heart_rate ?? latestEngagement?.heart_rate,
      hrv_rmssd: latestSensor?.hrv_rmssd ?? latestEngagement?.hrv_rmssd,
      motion_level: latestSensor?.motion_level ?? latestEngagement?.motion_level,
      spo2: latestSensor?.spo2 ?? latestEngagement?.spo2,
      restlessness_index: latestSensor?.restlessness_index ?? latestEngagement?.restlessness_index,
      timestamp: latestEngagement?.timestamp ?? latestSensor?.timestamp,
    },
    childId,
  );
}

// FIX 2.1 — window-aware versions
export async function getEngagementTrend(childId, window = "7d") {
  const { data } = await apiClient.get(`/analytics/engagement-trend/${childId}?window=${window}`);
  // Backend now returns { trend: [...], window } — return the whole object
  return data && Array.isArray(data.trend) ? data : { trend: [], window };
}

export async function getActivityInsights(childId, window = "7d") {
  const { data } = await apiClient.get(`/analytics/activity-insights/${childId}?window=${window}`);
  // Backend returns { activities: [...], window, total_samples }
  return data && Array.isArray(data.activities)
    ? data
    : { activities: [], window, total_samples: 0 };
}

export async function getDailySummary(childId, window = "today") {
  const { data } = await apiClient.get(`/analytics/daily-summary/${childId}?window=${window}`);
  return {
    average_heart_rate: Number(data?.average_heart_rate || 0),
    average_hrv: Number(data?.average_hrv || 0),
    average_engagement_score: Number(data?.average_engagement_score || 0),
    sample_count: Number(data?.sample_count || 0),
    sensor_count: Number(data?.sensor_count || 0),
    window: data?.window || window,
  };
}

// FIX 2.1 — new analytics endpoints
export async function getActivityTimeStats(childId, window = "7d") {
  const { data } = await apiClient.get(`/analytics/activity-time-stats/${childId}?window=${window}`);
  return data && Array.isArray(data.activities)
    ? data
    : { activities: [], window, total_seconds: 0, total_sessions: 0 };
}

export async function getTimeOfDayPattern(childId, window = "30d", activity = null) {
  const params = new URLSearchParams({ window });
  if (activity) params.append("activity", activity);
  const { data } = await apiClient.get(`/analytics/time-of-day/${childId}?${params.toString()}`);
  return data && Array.isArray(data.hourly)
    ? data
    : { hourly: Array.from({ length: 24 }, (_, h) => ({ hour: h, avg_engagement: null, sample_count: 0 })), window, activity: null };
}

export async function getAlerts(childId) {
  const { data } = await apiClient.get(`/alerts/${childId}`);
  if (!Array.isArray(data)) return [];
  return data.map((row) => mapAlert(row, childId));
}

export async function getSensorStreamDebug() {
  const { data } = await apiClient.get("/debug/sensor-stream");
  return Array.isArray(data) ? data : [];
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
  cancelBaseline, // Fix 2.4
  getBaselineStatus,
  getSensorStatus,
  startActivitySession,
  finishActivitySession,
  getActivityStatus,
  getActivityCategories,
  getActivityHistory,
  postSensorData,
  getRealtimeAnalytics,
  getEngagementTrend,
  getActivityInsights,
  getDailySummary,
  getAlerts,
  getSensorStreamDebug,
  getActivityTimeStats,
  getTimeOfDayPattern,

  // Active child routing
  async setActiveChild(childId) {
    const { data } = await apiClient.put("/auth/active-child", { child_id: childId });
    return data;
  },
  async getActiveChild() {
    const { data } = await apiClient.get("/auth/active-child");
    return data;
  },

  // Alert management
  async markAlertRead(alertId) {
    const { data } = await apiClient.put(`/analytics/alerts/${alertId}/read`);
    return data;
  },
  async markAllAlertsRead(childId) {
    const { data } = await apiClient.put(`/analytics/alerts/read-all/${childId}`);
    return data;
  },

  // Compatibility wrappers for existing app context usage
  async register(name, email, password) {
    return registerUser({ name, email, password });
  },
  async login(email, password) {
    return loginUser({ email, password });
  },
};
