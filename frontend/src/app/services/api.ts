const viteEnv = (import.meta as any).env as Record<string, string> | undefined;
const API_BASE_URL = viteEnv?.VITE_API_BASE_URL || "http://localhost:5000";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface ChildPayload {
  child_name: string;
  age: number;
  grade: string;
  device_id: string;
  hr_baseline: number;
  rmssd_baseline: number;
  isCalibrated?: boolean;
}

export interface SensorPayload {
  user_id: string;
  activity: string;
  heart_rate: number;
  hrv_rmssd: number;
  motion_level: number;
  timestamp: string;
}

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  token?: string | null;
}

function normalizeUser(raw: any): AuthUser {
  return {
    id: String(raw?.id ?? raw?._id ?? raw?.user_id ?? ""),
    name: String(raw?.name ?? ""),
    email: String(raw?.email ?? ""),
  };
}

function withBase(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(withBase(path), {
    method: options.method || "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  baseUrl: API_BASE_URL,

  async register(name: string, email: string, password: string): Promise<{ user: AuthUser; token: string | null }> {
    const raw = await request<any>("/auth/register", {
      method: "POST",
      body: { name, email, password },
    });

    const token = raw?.token ?? raw?.accessToken ?? null;
    const user = normalizeUser(raw?.user ?? raw);
    return { user, token };
  },

  async login(email: string, password: string): Promise<{ user: AuthUser; token: string | null }> {
    const raw = await request<any>("/auth/login", {
      method: "POST",
      body: { email, password },
    });

    const token = raw?.token ?? raw?.accessToken ?? null;
    const user = normalizeUser(raw?.user ?? raw);
    return { user, token };
  },

  async getChildren(token: string | null): Promise<any[]> {
    const raw = await request<any>("/children", { token });
    if (Array.isArray(raw)) {
      return raw;
    }
    if (Array.isArray(raw?.children)) {
      return raw.children;
    }
    return [];
  },

  async createChild(payload: ChildPayload, token: string | null): Promise<any> {
    return request<any>("/children", {
      method: "POST",
      body: payload,
      token,
    });
  },

  async updateChild(childId: string, payload: Partial<ChildPayload>, token: string | null): Promise<any> {
    return request<any>(`/children/${childId}`, {
      method: "PUT",
      body: payload,
      token,
    });
  },

  async deleteChild(childId: string, token: string | null): Promise<void> {
    await request<void>(`/children/${childId}`, {
      method: "DELETE",
      token,
    });
  },

  async postSensorData(payload: SensorPayload, token: string | null): Promise<any> {
    return request<any>("/sensor-data", {
      method: "POST",
      body: payload,
      token,
    });
  },

  async getAnalytics(childId: string, token: string | null, range: "today" | "week" | "month" = "week"): Promise<any> {
    const params = new URLSearchParams({ child_id: childId, range });
    return request<any>(`/analytics?${params.toString()}`, { token });
  },

  async predictMindPulse(payload: SensorPayload): Promise<any> {
    return request<any>("http://127.0.0.1:8000/predict", {
      method: "POST",
      body: payload,
    });
  },
};
