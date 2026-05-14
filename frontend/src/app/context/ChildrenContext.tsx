import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { api } from "../services/api";
import { useAuth } from "./AuthContext";

export interface Child {
  id: string;
  child_name: string;
  age: number;
  grade: string;
  sensor_last_seen_at?: string | null;
  hr_baseline: number;
  rmssd_baseline: number;
  isCalibrated: boolean;
}

interface ChildrenContextType {
  children: Child[];
  addChild: (child: Omit<Child, "id" | "isCalibrated">) => Promise<void>;
  updateChild: (id: string, child: Partial<Child>) => Promise<void>;
  deleteChild: (id: string) => Promise<void>;
  getChild: (id: string) => Child | undefined;
  selectedChild: Child | null;
  setSelectedChild: (child: Child | null) => void;
}

const ChildrenContext = createContext<ChildrenContextType | undefined>(undefined);

function normalizeChild(raw: any): Child {
  const hrBaselineRaw = raw?.hr_baseline;
  const rmssdBaselineRaw = raw?.rmssd_baseline;
  const hrBaseline = hrBaselineRaw === null || hrBaselineRaw === undefined ? 0 : Number(hrBaselineRaw);
  const rmssdBaseline = rmssdBaselineRaw === null || rmssdBaselineRaw === undefined ? 0 : Number(rmssdBaselineRaw);
  return {
    id: String(raw?.id ?? raw?._id ?? raw?.child_id ?? `C${Math.random().toString(36).slice(2, 9)}`),
    child_name: String(raw?.child_name ?? "Unknown"),
    age: Number(raw?.age ?? 10),
    grade: String(raw?.grade ?? "N/A"),
    sensor_last_seen_at: raw?.sensor_last_seen_at ? String(raw.sensor_last_seen_at) : null,
    hr_baseline: hrBaseline,
    rmssd_baseline: rmssdBaseline,
    isCalibrated: Boolean(raw?.isCalibrated ?? (hrBaseline > 0 && rmssdBaseline > 0)),
  };
}

export const ChildrenProvider = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated } = useAuth();
  const [childrenList, setChildrenList] = useState<Child[]>(() => {
    const saved = localStorage.getItem("mindpulse_children");
    return saved ? JSON.parse(saved) : [];
  });
  
  const [selectedChild, _setSelectedChild] = useState<Child | null>(
    () => childrenList[0] || null
  );

  // Sync the active child to the backend every time the selection changes so
  // the sensor bridge automatically routes data to the right profile.
  const setSelectedChild = (child: Child | null) => {
    _setSelectedChild(child);
    if (child?.id) {
      api.setActiveChild(child.id).catch((err: any) =>
        console.warn("[ACTIVE CHILD] Failed to sync to backend:", err?.message)
      );
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setChildrenList([]);
      setSelectedChild(null);
      localStorage.removeItem("mindpulse_children");
      return;
    }

    const loadChildren = async () => {
      try {
        const rows = await api.getChildren();
        const normalized: Child[] = rows.map(normalizeChild);
        setChildrenList(normalized);
        localStorage.setItem("mindpulse_children", JSON.stringify(normalized));
        setSelectedChild((prev) => {
          if (!normalized.length) {
            return null;
          }

          const now = Date.now();
          const onlineLikeChild = normalized.find((c) => {
            if (!c.sensor_last_seen_at) return false;
            const lastSeen = new Date(c.sensor_last_seen_at).getTime();
            return Number.isFinite(lastSeen) && now - lastSeen <= 30_000;
          });

          if (onlineLikeChild) {
            return onlineLikeChild;
          }

          const existing = prev ? normalized.find((c) => c.id === prev.id) : null;
          return existing || normalized[0];
        });
      } catch {
        const cached = localStorage.getItem("mindpulse_children");
        if (cached) {
          const parsed = JSON.parse(cached) as Child[];
          setChildrenList(parsed);
          setSelectedChild(parsed[0] || null);
        }
      }
    };

    void loadChildren();
  }, [isAuthenticated]);

  const addChild = async (child: Omit<Child, "id" | "isCalibrated">) => {
    const payload = {
      child_name: child.child_name,
      age: child.age,
      grade: child.grade,
      hr_baseline: child.hr_baseline,
      rmssd_baseline: child.rmssd_baseline,
      isCalibrated: false,
    };

    const raw = await api.createChild(payload);
    const newChild = normalizeChild(raw);
    const updated = [...childrenList, newChild];
    setChildrenList(updated);
    setSelectedChild((prev) => prev || newChild);
    localStorage.setItem("mindpulse_children", JSON.stringify(updated));
  };

  const updateChild = async (id: string, updates: Partial<Child>) => {
    const raw = await api.updateChild(id, updates);
    const next = normalizeChild(raw);
    const updated = childrenList.map((child) => (child.id === id ? next : child));
    setChildrenList(updated);
    localStorage.setItem("mindpulse_children", JSON.stringify(updated));
    if (selectedChild?.id === id) {
      setSelectedChild(next);
    }
  };

  const deleteChild = async (id: string) => {
    try {
      await api.deleteChild(id);
    } catch {
      // Keep local deletion behavior if backend endpoint is unavailable.
    }

    const updated = childrenList.filter((child) => child.id !== id);
    setChildrenList(updated);
    localStorage.setItem("mindpulse_children", JSON.stringify(updated));

    if (selectedChild?.id === id) {
      setSelectedChild(updated[0] || null);
    }
  };

  const getChild = (id: string) => {
    return childrenList.find((child) => child.id === id);
  };

  return (
    <ChildrenContext.Provider
      value={{
        children: childrenList,
        addChild,
        updateChild,
        deleteChild,
        getChild,
        selectedChild,
        setSelectedChild,
      }}
    >
      {children}
    </ChildrenContext.Provider>
  );
};

export const useChildren = () => {
  const context = useContext(ChildrenContext);
  if (context === undefined) {
    throw new Error("useChildren must be used within a ChildrenProvider");
  }
  return context;
};
