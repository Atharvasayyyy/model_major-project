import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { api } from "../services/api";
import { useAuth } from "./AuthContext";

const viteEnv = (import.meta as any).env as Record<string, string> | undefined;
const DEV_AUTO_LOGIN = viteEnv?.VITE_DEV_AUTO_LOGIN === "true";

export interface Child {
  id: string;
  child_name: string;
  age: number;
  grade: string;
  device_id: string;
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
  const hrBaseline = Number(raw?.hr_baseline ?? 78);
  const rmssdBaseline = Number(raw?.rmssd_baseline ?? 52);
  return {
    id: String(raw?.id ?? raw?._id ?? raw?.child_id ?? `C${Math.random().toString(36).slice(2, 9)}`),
    child_name: String(raw?.child_name ?? "Unknown"),
    age: Number(raw?.age ?? 10),
    grade: String(raw?.grade ?? "N/A"),
    device_id: String(raw?.device_id ?? "MP-000"),
    hr_baseline: hrBaseline,
    rmssd_baseline: rmssdBaseline,
    isCalibrated: Boolean(raw?.isCalibrated ?? (hrBaseline > 0 && rmssdBaseline > 0)),
  };
}

export const ChildrenProvider = ({ children }: { children: ReactNode }) => {
  const { token, isAuthenticated } = useAuth();
  const [childrenList, setChildrenList] = useState<Child[]>(() => {
    const saved = localStorage.getItem("mindpulse_children");
    return saved ? JSON.parse(saved) : [];
  });
  
  const [selectedChild, setSelectedChild] = useState<Child | null>(
    () => childrenList[0] || null
  );

  useEffect(() => {
    if (!isAuthenticated) {
      setChildrenList([]);
      setSelectedChild(null);
      localStorage.removeItem("mindpulse_children");
      return;
    }

    const loadChildren = async () => {
      try {
        const rows = await api.getChildren(token);
        const normalized = rows.map(normalizeChild);
        const withFallback =
          DEV_AUTO_LOGIN && normalized.length === 0
            ? [
                {
                  id: "DEV-C001",
                  child_name: "Demo Child",
                  age: 10,
                  grade: "5th Grade",
                  device_id: "MP-DEV-01",
                  hr_baseline: 78,
                  rmssd_baseline: 52,
                  isCalibrated: true,
                },
              ]
            : normalized;
        setChildrenList(withFallback);
        localStorage.setItem("mindpulse_children", JSON.stringify(withFallback));
        setSelectedChild((prev) => {
          if (!withFallback.length) {
            return null;
          }
          const existing = prev ? withFallback.find((c) => c.id === prev.id) : null;
          return existing || withFallback[0];
        });
      } catch {
        const cached = localStorage.getItem("mindpulse_children");
        if (cached) {
          const parsed = JSON.parse(cached) as Child[];
          setChildrenList(parsed);
          setSelectedChild(parsed[0] || null);
        } else if (DEV_AUTO_LOGIN) {
          const demoChild: Child = {
            id: "DEV-C001",
            child_name: "Demo Child",
            age: 10,
            grade: "5th Grade",
            device_id: "MP-DEV-01",
            hr_baseline: 78,
            rmssd_baseline: 52,
            isCalibrated: true,
          };
          setChildrenList([demoChild]);
          setSelectedChild(demoChild);
          localStorage.setItem("mindpulse_children", JSON.stringify([demoChild]));
        }
      }
    };

    void loadChildren();
  }, [isAuthenticated, token]);

  const addChild = async (child: Omit<Child, "id" | "isCalibrated">) => {
    const payload = {
      child_name: child.child_name,
      age: child.age,
      grade: child.grade,
      device_id: child.device_id,
      hr_baseline: child.hr_baseline,
      rmssd_baseline: child.rmssd_baseline,
      isCalibrated: false,
    };

    try {
      const raw = await api.createChild(payload, token);
      const newChild = normalizeChild(raw);
      const updated = [...childrenList, newChild];
      setChildrenList(updated);
      setSelectedChild((prev) => prev || newChild);
      localStorage.setItem("mindpulse_children", JSON.stringify(updated));
    } catch {
      const newChild: Child = {
        ...child,
        id: `C${Math.random().toString(36).slice(2, 9)}`,
        isCalibrated: false,
      };
      const updated = [...childrenList, newChild];
      setChildrenList(updated);
      setSelectedChild((prev) => prev || newChild);
      localStorage.setItem("mindpulse_children", JSON.stringify(updated));
    }
  };

  const updateChild = async (id: string, updates: Partial<Child>) => {
    try {
      const raw = await api.updateChild(id, updates, token);
      const next = normalizeChild(raw);
      const updated = childrenList.map((child) => (child.id === id ? next : child));
      setChildrenList(updated);
      localStorage.setItem("mindpulse_children", JSON.stringify(updated));
      if (selectedChild?.id === id) {
        setSelectedChild(next);
      }
      return;
    } catch {
      const updated = childrenList.map((child) => (child.id === id ? { ...child, ...updates } : child));
      setChildrenList(updated);
      localStorage.setItem("mindpulse_children", JSON.stringify(updated));
      if (selectedChild?.id === id) {
        setSelectedChild({ ...selectedChild, ...updates });
      }
    }
  };

  const deleteChild = async (id: string) => {
    try {
      await api.deleteChild(id, token);
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
