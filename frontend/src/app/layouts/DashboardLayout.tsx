import { Outlet, useNavigate, useLocation, Navigate } from "react-router";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useChildren } from "../context/ChildrenContext";
import { useSensorData } from "../context/SensorDataContext";
import { api } from "../services/api";
import {
  Activity,
  LayoutDashboard,
  Users,
  Clock3,
  Timer,
  Radio,
  TrendingUp,
  FileText,
  Bell,
  LogOut,
  ChevronDown,
} from "lucide-react";

export const DashboardLayout = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const { selectedChild, children, setSelectedChild } = useChildren();
  const { alerts } = useSensorData();
  const navigate = useNavigate();
  const location = useLocation();
  const [baselineReady, setBaselineReady] = useState<boolean | null>(null);
  const [activeSession, setActiveSession] = useState<{ active: boolean; activity: string | null } | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !selectedChild) {
      setActiveSession(null);
      return;
    }

    let mounted = true;
    const pollActivity = async () => {
      try {
        const res = await api.getActivityStatus(selectedChild.id);
        if (mounted) {
          setActiveSession({ active: res.session_active, activity: res.activity });
        }
      } catch {
        // ignore
      }
    };

    pollActivity();
    const intervalId = setInterval(pollActivity, 10000);
    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, [isAuthenticated, selectedChild]);

  useEffect(() => {
    let mounted = true;

    const checkBaseline = async () => {
      if (!isAuthenticated || !selectedChild) {
        if (mounted) setBaselineReady(null);
        return;
      }

      try {
        const status = await api.getBaselineStatus(selectedChild.id);
        if (!mounted) return;

        setBaselineReady(status.baseline_ready);

        const allowed = ["/app/baseline", "/app/children"];
        if (!status.baseline_ready && !allowed.some((prefix) => location.pathname.startsWith(prefix))) {
          navigate("/app/baseline", { replace: true });
        }
      } catch {
        if (mounted) setBaselineReady(null);
      }
    };

    void checkBaseline();
    return () => {
      mounted = false;
    };
  }, [isAuthenticated, selectedChild, location.pathname, navigate]);

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
  }

  const navItems = [
    { path: "/app", icon: LayoutDashboard, label: "Dashboard" },
    { path: "/app/children", icon: Users, label: "Children" },
    { path: "/app/baseline", icon: Clock3, label: "Baseline Calibration" },
    { path: "/app/hobby-session", icon: Timer, label: "Hobby Session" },
    { path: "/app/monitoring", icon: Radio, label: "Live Monitoring" },
    { path: "/app/analytics", icon: TrendingUp, label: "Analytics" },
    { path: "/app/reports", icon: FileText, label: "Reports" },
    { path: "/app/alerts", icon: Bell, label: "Alerts", badge: alerts.filter(a => !a.read).length },
  ];

  const handleLogout = () => {
    logout();
    navigate("/auth/login");
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border flex flex-col">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-2">
            <Activity className="w-8 h-8 text-purple-500" />
            <h1 className="text-xl font-bold">MindPulse</h1>
          </div>
        </div>

        {/* Child Selector */}
        {children.length > 0 && (
          <div className="p-4 border-b border-border">
            <label className="text-sm text-muted-foreground mb-2 block">
              Selected Child
            </label>
            <div className="relative">
              <select
                value={selectedChild?.id || ""}
                onChange={(e) => {
                  const child = children.find((c) => c.id === e.target.value);
                  if (child) setSelectedChild(child);
                }}
                className="w-full bg-secondary text-foreground rounded-lg px-3 py-2 pr-8 appearance-none cursor-pointer"
              >
                {children.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.child_name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        )}

        {/* Global Session Indicator */}
        {activeSession?.active && (
          <div className="px-4 pb-4 border-b border-border">
            <div className="rounded-lg bg-cyan-500/10 border border-cyan-500/30 p-3 flex flex-col gap-1">
              <div className="flex items-center gap-2 text-cyan-400 text-sm font-semibold">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                </span>
                Active Session
              </div>
              <p className="text-white font-medium text-sm">{activeSession.activity}</p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                disabled={
                  baselineReady === false
                  && item.path !== "/app/children"
                  && item.path !== "/app/baseline"
                }
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? "bg-purple-600 text-white"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Icon className="w-5 h-5" />
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User Section */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-white font-semibold">
              {user?.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{user?.name}</p>
              <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
};
