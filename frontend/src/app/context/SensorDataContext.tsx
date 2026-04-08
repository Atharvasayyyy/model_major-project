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
  spo2: number;
  restlessness_index: number;
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
    spo2: Number(raw?.spo2 ?? 0),
    restlessness_index: Number(raw?.restlessness_index ?? 0),
    engagement_score: Number(raw?.engagement_score ?? 0),
    arousal: Number(raw?.arousal ?? 0),
    valence: Number(raw?.valence ?? 0),
    timestamp: String(raw?.timestamp ?? new Date().toISOString()),
  };
}

function resolveChildId(value: any, fallbackChildId: string): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    if (typeof value.$oid === "string") return value.$oid;
    if (typeof value._id === "string") return value._id;
  }
  return fallbackChildId;
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
      const [sensorStatusResult, sensorStreamResult] = await Promise.allSettled([
        api.getSensorStatus(selectedChild.id),
        api.getSensorStreamDebug(),
      ]);

      if (!isMounted) return;

      const sensorStatus = sensorStatusResult.status === "fulfilled" ? sensorStatusResult.value : null;
      const sensorStream = sensorStreamResult.status === "fulfilled" ? sensorStreamResult.value : [];

      const normalizedStream = (sensorStream || [])
        .filter((row: any) => resolveChildId(row?.child_id, "") === selectedChild.id)
        .map((row: any) => normalizeSensor(row, selectedChild.id))
        .sort((a: SensorData, b: SensorData) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      setSensorData(normalizedStream);

      const statusRow = sensorStatus
        ? normalizeSensor(
          {
            child_id: selectedChild.id,
            activity: normalizedStream.length ? normalizedStream[normalizedStream.length - 1].activity : "Sensor Stream",
            heart_rate: sensorStatus?.heart_rate,
            hrv_rmssd: sensorStatus?.hrv_rmssd,
            motion_level: sensorStatus?.motion_level,
            spo2: sensorStatus?.spo2,
            restlessness_index: sensorStatus?.restlessness_index,
            timestamp: sensorStatus?.last_reading_timestamp || new Date().toISOString(),
          },
          selectedChild.id,
        )
        : null;

      setLatestData(statusRow ?? (normalizedStream.length ? normalizedStream[normalizedStream.length - 1] : null));
      setAlerts([]);
    };

    const loadRealtime = async () => {
      const [sensorStatusResult, sensorStreamResult, baselineResult, activityResult] = await Promise.allSettled([
        api.getSensorStatus(selectedChild.id),
        api.getSensorStreamDebug(),
        api.getBaselineStatus(selectedChild.id),
        api.getActivityStatus(selectedChild.id),
      ]);

      if (!isMounted) return;

      const sensorStatus = sensorStatusResult.status === "fulfilled" ? sensorStatusResult.value : null;
      const sensorStream = sensorStreamResult.status === "fulfilled" ? sensorStreamResult.value : [];
      const status = baselineResult.status === "fulfilled" ? baselineResult.value : null;
      const sessionStatus = activityResult.status === "fulfilled" ? activityResult.value : null;

      const ready = Boolean(status?.baseline_ready) && !Boolean(status?.baseline_in_progress);
      const sessionActive = Boolean(sessionStatus?.session_active);

      const normalizedStream = (sensorStream || [])
        .filter((row: any) => resolveChildId(row?.child_id, "") === selectedChild.id)
        .map((row: any) => normalizeSensor(row, selectedChild.id))
        .sort((a: SensorData, b: SensorData) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      const statusRow = sensorStatus
        ? normalizeSensor(
          {
            child_id: selectedChild.id,
            activity: normalizedStream.length ? normalizedStream[normalizedStream.length - 1].activity : "Sensor Stream",
            heart_rate: sensorStatus?.heart_rate,
            hrv_rmssd: sensorStatus?.hrv_rmssd,
            motion_level: sensorStatus?.motion_level,
            spo2: sensorStatus?.spo2,
            restlessness_index: sensorStatus?.restlessness_index,
            timestamp: sensorStatus?.last_reading_timestamp || new Date().toISOString(),
          },
          selectedChild.id,
        )
        : null;

      let effectiveLatest = statusRow ?? (normalizedStream.length ? normalizedStream[normalizedStream.length - 1] : null);

      if (ready && sessionActive) {
        const [realtimeResult, alertsResult] = await Promise.allSettled([
          api.getRealtimeAnalytics(selectedChild.id),
          api.getAlerts(selectedChild.id),
        ]);

        if (!isMounted) return;

        if (realtimeResult.status === "fulfilled" && realtimeResult.value) {
          effectiveLatest = normalizeSensor(realtimeResult.value, selectedChild.id);
        }

        if (alertsResult.status === "fulfilled") {
          setAlerts((alertsResult.value || []).map((row: any) => normalizeAlert(row, selectedChild.id)));
        }
      } else {
        setAlerts([]);
      }

      setSensorData(normalizedStream);
      setLatestData(effectiveLatest);
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
