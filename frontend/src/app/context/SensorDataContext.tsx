import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { api } from "../services/api";
import { useAuth } from "./AuthContext";
import { useChildren } from "./ChildrenContext";

export interface SensorData {
  id: string;
  child_id: string;
  activity: string;
  heart_rate: number;
  hrv_rmssd: number;
  motion_level: number;
  engagement_score: number;
  arousal: number;
  valence: number;
  timestamp: string;
}

export interface Alert {
  id: string;
  child_id: string;
  type: "stress" | "low_engagement" | "high_hr";
  message: string;
  timestamp: string;
  read: boolean;
}

interface SensorDataContextType {
  sensorData: SensorData[];
  latestData: SensorData | null;
  alerts: Alert[];
  addSensorData: (data: Omit<SensorData, "id" | "timestamp">) => Promise<void>;
  markAlertAsRead: (id: string) => void;
  clearAlerts: () => void;
}

const SensorDataContext = createContext<SensorDataContextType | undefined>(undefined);

function normalizeSensor(raw: any, fallbackChildId: string): SensorData {
  return {
    id: String(raw?.id ?? raw?._id ?? `SD${Date.now()}${Math.random().toString(36).slice(2, 6)}`),
    child_id: String(raw?.child_id ?? raw?.user_id ?? fallbackChildId),
    activity: String(raw?.activity ?? "Unknown"),
    heart_rate: Number(raw?.heart_rate ?? 0),
    hrv_rmssd: Number(raw?.hrv_rmssd ?? 0),
    motion_level: Number(raw?.motion_level ?? 0),
    engagement_score: Number(raw?.engagement_score ?? 0),
    arousal: Number(raw?.arousal ?? 0),
    valence: Number(raw?.valence ?? 0),
    timestamp: String(raw?.timestamp ?? new Date().toISOString()),
  };
}

function normalizeAlert(raw: any, fallbackChildId: string): Alert {
  const mappedType =
    raw?.type === "stress" || raw?.type === "low_engagement" || raw?.type === "high_hr"
      ? raw.type
      : "low_engagement";
  return {
    id: String(raw?.id ?? raw?._id ?? `A${Date.now()}${Math.random().toString(36).slice(2, 6)}`),
    child_id: String(raw?.child_id ?? raw?.user_id ?? fallbackChildId),
    type: mappedType,
    message: String(raw?.message ?? "Engagement alert detected."),
    timestamp: String(raw?.timestamp ?? new Date().toISOString()),
    read: Boolean(raw?.read ?? false),
  };
}

function getDerivedAlerts(entry: SensorData, hrBaseline: number): Alert[] {
  const derived: Alert[] = [];
  if (entry.engagement_score < 0.2) {
    derived.push({
      id: `A${Date.now()}stress`,
      child_id: entry.child_id,
      type: "stress",
      message: `High stress detected during ${entry.activity} session.`,
      timestamp: entry.timestamp,
      read: false,
    });
  } else if (entry.engagement_score < 0.4) {
    derived.push({
      id: `A${Date.now()}low`,
      child_id: entry.child_id,
      type: "low_engagement",
      message: `Low engagement detected during ${entry.activity}.`,
      timestamp: entry.timestamp,
      read: false,
    });
  }

  if (hrBaseline > 0 && entry.heart_rate > hrBaseline * 1.2) {
    derived.push({
      id: `A${Date.now()}hr`,
      child_id: entry.child_id,
      type: "high_hr",
      message: `Heart rate significantly above baseline during ${entry.activity}.`,
      timestamp: entry.timestamp,
      read: false,
    });
  }
  return derived;
}

export const SensorDataProvider = ({ children }: { children: ReactNode }) => {
  const { token, isAuthenticated, user } = useAuth();
  const { selectedChild } = useChildren();
  const [sensorData, setSensorData] = useState<SensorData[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const [latestData, setLatestData] = useState<SensorData | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !selectedChild) {
      setSensorData([]);
      setLatestData(null);
      setAlerts([]);
      return;
    }

    let isMounted = true;

    const loadAnalytics = async () => {
      try {
        const raw = await api.getAnalytics(selectedChild.id, token, "week");
        const rows = (raw?.sensor_data || raw?.engagement_results || raw?.data || []) as any[];
        const normalizedRows = rows
          .map((row) => normalizeSensor(row, selectedChild.id))
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        const alertRows = (raw?.alerts || []) as any[];
        const normalizedAlerts = alertRows.map((row) => normalizeAlert(row, selectedChild.id));

        if (isMounted) {
          setSensorData(normalizedRows);
          setLatestData(normalizedRows.length ? normalizedRows[normalizedRows.length - 1] : null);
          setAlerts(normalizedAlerts);
        }
      } catch {
        // Keep current data if analytics endpoint is temporarily unavailable.
      }
    };

    void loadAnalytics();
    const interval = setInterval(() => {
      void loadAnalytics();
    }, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isAuthenticated, selectedChild, token]);

  const addSensorData = async (data: Omit<SensorData, "id" | "timestamp">) => {
    if (!selectedChild) {
      return;
    }

    const payload = {
      user_id: user?.id || selectedChild.id,
      activity: data.activity,
      heart_rate: data.heart_rate,
      hrv_rmssd: data.hrv_rmssd,
      motion_level: data.motion_level,
      timestamp: new Date().toISOString(),
    };

    try {
      const response = await api.postSensorData(payload, token);
      const entry = normalizeSensor(
        {
          ...payload,
          ...response,
          child_id: data.child_id,
        },
        selectedChild.id,
      );

      setSensorData((prev) => [...prev.slice(-199), entry]);
      setLatestData(entry);

      const backendAlerts = Array.isArray(response?.alerts)
        ? response.alerts.map((row: any) => normalizeAlert(row, selectedChild.id))
        : getDerivedAlerts(entry, selectedChild.hr_baseline);

      if (backendAlerts.length) {
        setAlerts((prev) => [...backendAlerts, ...prev].slice(0, 50));
      }
    } catch {
      const fallback = normalizeSensor(
        {
          ...data,
          timestamp: new Date().toISOString(),
          id: `SD${Date.now()}`,
        },
        selectedChild.id,
      );
      setSensorData((prev) => [...prev.slice(-199), fallback]);
      setLatestData(fallback);

      const derived = getDerivedAlerts(fallback, selectedChild.hr_baseline);
      if (derived.length) {
        setAlerts((prev) => [...derived, ...prev].slice(0, 50));
      }
    }
  };

  const markAlertAsRead = (id: string) => {
    setAlerts((prev) =>
      prev.map((alert) => (alert.id === id ? { ...alert, read: true } : alert))
    );
  };

  const clearAlerts = () => {
    setAlerts([]);
  };

  return (
    <SensorDataContext.Provider
      value={{
        sensorData,
        latestData,
        alerts,
        addSensorData,
        markAlertAsRead,
        clearAlerts,
      }}
    >
      {children}
    </SensorDataContext.Provider>
  );
};

export const useSensorData = () => {
  const context = useContext(SensorDataContext);
  if (context === undefined) {
    throw new Error("useSensorData must be used within a SensorDataProvider");
  }
  return context;
};
