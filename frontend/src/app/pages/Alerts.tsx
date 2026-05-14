import { useState, useEffect, useCallback } from "react";
import { useChildren } from "../context/ChildrenContext";
import { api } from "../services/api";
import {
  Bell, AlertTriangle, AlertCircle, Heart,
  Check, CheckCheck, Filter, CheckCircle,
} from "lucide-react";

// ─── alert type config ────────────────────────────────────────────────────────

const ALERT_META: Record<string, {
  label: string;
  Icon: typeof AlertCircle;
  bg: string;
  border: string;
  text: string;
  badgeBg: string;
}> = {
  high_stress: {
    label: "High Stress",
    Icon: AlertCircle,
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-300",
    badgeBg: "bg-red-500",
  },
  low_engagement: {
    label: "Low Engagement",
    Icon: AlertTriangle,
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-300",
    badgeBg: "bg-amber-500",
  },
  abnormal_heart_rate: {
    label: "Abnormal Heart Rate",
    Icon: Heart,
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    text: "text-orange-300",
    badgeBg: "bg-orange-500",
  },
};

const FALLBACK_META = ALERT_META.low_engagement;

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── filter pill labels ───────────────────────────────────────────────────────

const FILTER_OPTIONS = [
  { value: "all",                 label: "All" },
  { value: "unread",              label: "Unread" },
  { value: "high_stress",         label: "High Stress" },
  { value: "low_engagement",      label: "Low Engagement" },
  { value: "abnormal_heart_rate", label: "Abnormal HR" },
];

// ─── main component ───────────────────────────────────────────────────────────

export const Alerts = () => {
  const { selectedChild } = useChildren();

  const [alertList, setAlertList] = useState<any[]>([]);
  const [summary,   setSummary]   = useState<any>(null);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState("all");

  // ── fetch ──────────────────────────────────────────────────────────────────
  const fetchAlerts = useCallback(async () => {
    if (!selectedChild) return;
    try {
      const res = await api.getAlerts(selectedChild.id);
      // Handle both new shape { alerts, summary } and legacy raw array
      if (Array.isArray(res)) {
        setAlertList(res);
        setSummary({
          total:  res.length,
          unread: res.filter((a: any) => !a.is_read).length,
          by_type: {
            high_stress:         res.filter((a: any) => a.alert_type === "high_stress").length,
            low_engagement:      res.filter((a: any) => a.alert_type === "low_engagement").length,
            abnormal_heart_rate: res.filter((a: any) => a.alert_type === "abnormal_heart_rate").length,
          },
        });
      } else {
        setAlertList(res.alerts ?? []);
        setSummary(res.summary ?? null);
      }
    } catch (err) {
      console.error("Failed to fetch alerts:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedChild]);

  useEffect(() => {
    setLoading(true);
    void fetchAlerts();
    const id = setInterval(fetchAlerts, 5000);
    return () => clearInterval(id);
  }, [fetchAlerts]);

  // ── actions ────────────────────────────────────────────────────────────────
  const handleMarkRead = async (alertId: string) => {
    try {
      await api.markAlertRead(alertId);
      void fetchAlerts();
    } catch (err) {
      console.error("Mark read failed:", err);
    }
  };

  const handleMarkAllRead = async () => {
    if (!selectedChild) return;
    try {
      await api.markAllAlertsRead(selectedChild.id);
      void fetchAlerts();
    } catch (err) {
      console.error("Mark all read failed:", err);
    }
  };

  // ── derived ────────────────────────────────────────────────────────────────
  const filtered = alertList.filter((a) => {
    if (filter === "all")    return true;
    if (filter === "unread") return !a.is_read;
    return a.alert_type === filter;
  });

  const unread = summary?.unread ?? 0;

  // ── no child ───────────────────────────────────────────────────────────────
  if (!selectedChild) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">Select a child profile first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-8">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-3xl font-bold">Alerts</h1>
          <p className="text-muted-foreground">
            Notifications for{" "}
            <span className="font-semibold">{selectedChild.child_name}</span>
          </p>
        </div>

        {unread > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-700"
          >
            <CheckCheck size={16} />
            Mark All Read ({unread})
          </button>
        )}
      </div>

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-2 flex items-center gap-2 text-sm text-purple-300">
            <Bell size={16} /> Total Alerts
          </div>
          <p className="text-4xl font-bold">{summary?.total ?? 0}</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-2 flex items-center gap-2 text-sm text-amber-300">
            <AlertCircle size={16} /> Unread
          </div>
          <p className="text-4xl font-bold text-amber-400">{unread}</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-2 flex items-center gap-2 text-sm text-emerald-300">
            <Check size={16} /> Read
          </div>
          <p className="text-4xl font-bold text-emerald-400">
            {(summary?.total ?? 0) - unread}
          </p>
        </div>
      </div>

      {/* ── By-type breakdown ─────────────────────────────────────────────── */}
      {summary?.by_type && (
        <div className="grid grid-cols-3 gap-4">
          {Object.entries(ALERT_META).map(([key, meta]) => {
            const count = summary.by_type[key] ?? 0;
            return (
              <div key={key} className={`rounded-lg border ${meta.border} ${meta.bg} p-4`}>
                <div className={`mb-1 flex items-center gap-2 text-sm ${meta.text}`}>
                  <meta.Icon size={16} /> {meta.label}
                </div>
                <p className="text-2xl font-bold">{count}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Filter pills ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter size={16} className="text-muted-foreground" />
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`rounded-full px-3 py-1 text-sm transition ${
              filter === opt.value
                ? "bg-purple-600 text-white"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ── Alert list ────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground animate-pulse">
          Loading alerts…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card py-16 text-center">
          <CheckCircle className="mx-auto mb-4 h-14 w-14 text-emerald-400" />
          <p className="text-xl font-bold">All Clear!</p>
          <p className="mt-1 text-muted-foreground">
            {filter === "all"
              ? "No alerts for this child"
              : filter === "unread"
              ? "No unread alerts"
              : `No ${ALERT_META[filter]?.label ?? filter} alerts`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((alert: any) => {
            const meta = ALERT_META[alert.alert_type] ?? FALLBACK_META;
            const Icon = meta.Icon;
            const ts   = alert.timestamp ?? alert.createdAt;

            return (
              <div
                key={alert._id}
                className={`flex items-start gap-4 rounded-lg border p-4 transition-opacity ${meta.bg} ${meta.border} ${
                  alert.is_read ? "opacity-55" : ""
                }`}
              >
                {/* Icon */}
                <div className={`mt-0.5 rounded-lg p-2 ${meta.bg}`}>
                  <Icon className={meta.text} size={22} />
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className={`font-semibold ${meta.text}`}>{meta.label}</span>
                    {!alert.is_read && (
                      <span className={`rounded-full px-2 py-0.5 text-xs text-white ${meta.badgeBg}`}>
                        NEW
                      </span>
                    )}
                  </div>

                  <p className="mb-2 text-sm text-foreground">{alert.message}</p>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>{formatRelativeTime(ts)}</span>
                    {alert.activity && (
                      <span>· During <strong>{alert.activity}</strong></span>
                    )}
                    {alert.metric_value != null && (
                      <span>· Score: {(alert.metric_value * 100).toFixed(0)}%</span>
                    )}
                  </div>
                </div>

                {/* Mark read button */}
                {!alert.is_read && (
                  <button
                    onClick={() => handleMarkRead(alert._id)}
                    className="flex shrink-0 items-center gap-1 rounded bg-secondary px-3 py-1 text-sm text-muted-foreground transition hover:text-foreground hover:bg-accent"
                  >
                    <Check size={14} /> Mark Read
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Legend ────────────────────────────────────────────────────────── */}
      <div className="border-t border-border pt-6">
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">About Alert Types</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <p className="font-semibold text-red-300">High Stress</p>
            <p className="text-xs text-muted-foreground">Engagement score below 0.2 during a session</p>
          </div>
          <div>
            <p className="font-semibold text-amber-300">Low Engagement</p>
            <p className="text-xs text-muted-foreground">Engagement score between 0.2–0.4</p>
          </div>
          <div>
            <p className="font-semibold text-orange-300">Abnormal Heart Rate</p>
            <p className="text-xs text-muted-foreground">Heart rate significantly above baseline</p>
          </div>
        </div>
      </div>
    </div>
  );
};
