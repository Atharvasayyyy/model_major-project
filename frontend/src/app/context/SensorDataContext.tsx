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
  type: string;
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
    child_id: String(raw?.child_id ?? fallbackChildId),
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
  return {
    id: String(raw?.id ?? raw?._id ?? `A${Date.now()}${Math.random().toString(36).slice(2, 6)}`),
    child_id: String(raw?.child_id ?? fallbackChildId),
    type: String(raw?.type ?? raw?.alert_type ?? "low_engagement"),
    message: String(raw?.message ?? "Alert detected."),
    timestamp: String(raw?.timestamp ?? raw?.createdAt ?? new Date().toISOString()),
    read: Boolean(raw?.read ?? false),
  };
}

export const SensorDataProvider = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated } = useAuth();
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

    const loadInitialData = async () => {
      try {
        const [trendRows, alertRows] = await Promise.all([
          api.getEngagementTrend(selectedChild.id),
          api.getAlerts(selectedChild.id),
        ]);

        if (!isMounted) return;

        const normalizedTrend = (trendRows || [])
          .map((row: any) => normalizeSensor(row, selectedChild.id))
          .sort((a: SensorData, b: SensorData) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        setSensorData(normalizedTrend);
        setLatestData(normalizedTrend.length ? normalizedTrend[normalizedTrend.length - 1] : null);
        setAlerts((alertRows || []).map((row: any) => normalizeAlert(row, selectedChild.id)));
      } catch {
        // Keep current local state if backend is temporarily unavailable.
      }
    };

    const loadRealtime = async () => {
      try {
        const [realtimeRow, alertRows] = await Promise.all([
          api.getRealtimeAnalytics(selectedChild.id),
          api.getAlerts(selectedChild.id),
        ]);

        if (!isMounted) return;

        if (realtimeRow) {
          const normalized = normalizeSensor(realtimeRow, selectedChild.id);
          setLatestData(normalized);
          setSensorData((prev) => {
            const exists = prev.some((row) => row.timestamp === normalized.timestamp && row.activity === normalized.activity);
            if (exists) return prev;
            return [...prev.slice(-299), normalized];
          });
        }

        setAlerts((alertRows || []).map((row: any) => normalizeAlert(row, selectedChild.id)));
      } catch {
        // Keep displaying previous data while polling retries.
      }
    };

    void loadInitialData();
    void loadRealtime();

    const interval = setInterval(() => {
      void loadRealtime();
    }, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isAuthenticated, selectedChild]);

  const addSensorData = async (data: Omit<SensorData, "id" | "timestamp">) => {
    if (!selectedChild) return;

    const payload = {
      child_id: selectedChild.id,
      activity: data.activity,
      heart_rate: data.heart_rate,
      hrv_rmssd: data.hrv_rmssd,
      motion_level: data.motion_level,
      timestamp: new Date().toISOString(),
    };

    try {
      await api.postSensorData(payload);
      const realtimeRow = await api.getRealtimeAnalytics(selectedChild.id);
      if (realtimeRow) {
        const normalized = normalizeSensor(realtimeRow, selectedChild.id);
        setLatestData(normalized);
        setSensorData((prev) => [...prev.slice(-299), normalized]);
      }
      const alertRows = await api.getAlerts(selectedChild.id);
      setAlerts((alertRows || []).map((row: any) => normalizeAlert(row, selectedChild.id)));
    } catch {
      // If backend write fails, keep UI stable and retry on next poll.
    }
  };

  const markAlertAsRead = (id: string) => {
    setAlerts((prev) => prev.map((alert) => (alert.id === id ? { ...alert, read: true } : alert)));
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
