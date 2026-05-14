import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useChildren, Child } from "../context/ChildrenContext";
import { Plus, Edit, Trash2, User } from "lucide-react";
import { ChildDialog } from "../components/ChildDialog";
import { CalibrationDialog } from "../components/CalibrationDialog";
import { api } from "../services/api";

// ─── helper ───────────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string | null | undefined): string {
  if (!isoString) return "";
  const diff = Date.now() - new Date(isoString).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── types ────────────────────────────────────────────────────────────────────

interface ChildStat {
  sensor:        any | null;
  summary:       any | null;
  topActivity:   any | null;
  activeSession: any | null;
}

// ─── main component ───────────────────────────────────────────────────────────

export const Children = () => {
  const navigate = useNavigate();
  const { children, deleteChild, selectedChild, setSelectedChild } = useChildren();

  const [dialogOpen,       setDialogOpen]       = useState(false);
  const [calibrationOpen,  setCalibrationOpen]  = useState(false);
  const [editingChild,     setEditingChild]      = useState<Child | null>(null);
  const [calibratingChild, setCalibratingChild] = useState<Child | null>(null);
  const [childStats,       setChildStats]        = useState<Record<string, ChildStat>>({});

  // ── fetch per-child stats ──────────────────────────────────────────────────
  useEffect(() => {
    if (!children.length) return;
    let alive = true;

    const fetchAll = async () => {
      const stats: Record<string, ChildStat> = {};

      await Promise.allSettled(
        children.map(async (child) => {
          const [sensor, summary, insights, session] = await Promise.allSettled([
            api.getSensorStatus(child.id),
            api.getDailySummary(child.id, "7d"),
            api.getActivityInsights(child.id, "7d"),
            api.getActivityStatus(child.id),
          ]);

          stats[child.id] = {
            sensor:
              sensor.status === "fulfilled" ? sensor.value : null,
            summary:
              summary.status === "fulfilled" ? summary.value : null,
            topActivity:
              insights.status === "fulfilled"
                ? insights.value?.activities?.[0] ?? null
                : null,
            activeSession:
              session.status === "fulfilled" ? session.value : null,
          };
        }),
      );

      if (alive) setChildStats(stats);
    };

    void fetchAll();
    const timer = setInterval(fetchAll, 10_000);
    return () => { alive = false; clearInterval(timer); };
  }, [children]);

  // ── handlers ──────────────────────────────────────────────────────────────
  const handleEdit = (child: Child) => {
    setEditingChild(child);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this child profile?")) {
      await deleteChild(id);
    }
  };

  const handleCalibrate = async (child: Child) => {
    try {
      const status = await api.getSensorStatus(child.id);
      if (status?.device_status !== "online") {
        alert("Sensor is not attached or offline. Please connect the sensor before starting Baseline Calibration.");
        return;
      }
      setSelectedChild(child);
      setCalibratingChild(child);
      setCalibrationOpen(true);
    } catch {
      alert("Failed to check sensor status. Make sure the sensor is attached.");
    }
  };

  const handleAddNew = () => {
    setEditingChild(null);
    setDialogOpen(true);
  };

  // ── derived counts ─────────────────────────────────────────────────────────
  const calibratedCount = children.filter((c) => c.isCalibrated).length;
  const activeCount     = Object.values(childStats).filter(
    (s) => s?.activeSession?.session_active,
  ).length;

  return (
    <div className="space-y-6 p-8">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-3xl font-bold">Child Profiles</h1>
          <p className="text-muted-foreground">
            Manage child profiles and view per-child insights
          </p>
        </div>
        <button
          onClick={handleAddNew}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-3 font-semibold text-white transition hover:bg-purple-700"
        >
          <Plus className="h-5 w-5" /> Add Child
        </button>
      </div>

      {/* ── Summary bar ───────────────────────────────────────────────────── */}
      {children.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Total Children</p>
            <p className="text-3xl font-bold">{children.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Calibrated</p>
            <p className="text-3xl font-bold text-emerald-400">
              {calibratedCount}
              <span className="ml-1 text-sm text-muted-foreground">/ {children.length}</span>
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Currently Active</p>
            <p className="text-3xl font-bold text-purple-400">{activeCount}</p>
          </div>
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {children.length === 0 ? (
        <div className="rounded-lg border border-border bg-card py-20 text-center">
          <div className="mb-4 text-6xl">👶</div>
          <h2 className="mb-2 text-2xl font-bold">No children added yet</h2>
          <p className="mb-6 text-muted-foreground">
            Add your first child profile to start monitoring engagement and stress patterns.
          </p>
          <button
            onClick={handleAddNew}
            className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-6 py-3 font-semibold text-white transition hover:bg-purple-700"
          >
            <Plus className="h-5 w-5" /> Add Your First Child
          </button>
        </div>
      ) : (

        /* ── Children grid ──────────────────────────────────────────────── */
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {children.map((child) => {
            const stat      = childStats[child.id] ?? null;
            const isOnline  = stat?.sensor?.device_status === "online";
            const isActive  = selectedChild?.id === child.id;
            const inSession = stat?.activeSession?.session_active ?? false;
            const summary   = stat?.summary;
            const topAct    = stat?.topActivity;

            return (
              <div
                key={child.id}
                className={`flex flex-col rounded-xl border-2 bg-card p-5 transition-all ${
                  isActive
                    ? "border-purple-500 shadow-lg shadow-purple-500/20"
                    : "border-border hover:border-purple-500/40"
                }`}
              >
                {/* ── TOP: avatar + name + LIVE badge ─────────────────── */}
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-purple-600/20 text-2xl font-bold text-purple-300">
                      {child.child_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-lg font-bold leading-tight">{child.child_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {child.age} yrs · Grade {child.grade}
                      </p>
                    </div>
                  </div>

                  {inSession && (
                    <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-1">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                      <span className="text-xs font-semibold text-emerald-300">LIVE</span>
                    </div>
                  )}
                </div>

                {/* ── SENSOR STATUS STRIP ──────────────────────────────── */}
                <div
                  className={`mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
                    isOnline
                      ? "bg-emerald-500/10 text-emerald-300"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${isOnline ? "bg-emerald-400" : "bg-muted-foreground"}`} />
                  <span>
                    {isOnline
                      ? `Sensor live · HR ${stat.sensor.heart_rate} bpm`
                      : "Sensor offline"}
                  </span>
                  {stat?.sensor?.last_reading && (
                    <span className="ml-auto text-muted-foreground">
                      {formatRelativeTime(stat.sensor.last_reading)}
                    </span>
                  )}
                </div>

                {/* ── BASELINE INFO ─────────────────────────────────────── */}
                <div className="mb-4 grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-secondary/50 p-2.5">
                    <p className="text-xs text-muted-foreground">HR Baseline</p>
                    <p className="text-sm font-semibold">
                      {child.hr_baseline ? `${child.hr_baseline.toFixed(1)} bpm` : "—"}
                    </p>
                  </div>
                  <div className="rounded-lg bg-secondary/50 p-2.5">
                    <p className="text-xs text-muted-foreground">HRV Baseline</p>
                    <p className="text-sm font-semibold">
                      {child.rmssd_baseline ? `${child.rmssd_baseline.toFixed(1)} ms` : "—"}
                    </p>
                  </div>
                </div>

                {/* ── 7-DAY INSIGHTS (calibrated only) ─────────────────── */}
                {child.isCalibrated && (
                  <div className="mb-4 rounded-lg border border-purple-500/20 bg-gradient-to-br from-purple-900/20 to-blue-900/20 p-3">
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">
                      Last 7 Days
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Avg Engagement</p>
                        <p className="text-lg font-bold text-emerald-400">
                          {summary?.sample_count > 0 && summary?.average_engagement_score != null
                            ? `${(summary.average_engagement_score * 100).toFixed(0)}%`
                            : "No data"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Readings</p>
                        <p className="text-lg font-bold">
                          {summary?.sample_count ?? 0}
                        </p>
                      </div>
                    </div>

                    {topAct && (
                      <div className="mt-3 flex items-center gap-2 border-t border-purple-500/20 pt-3">
                        <span className="text-lg">🏆</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-muted-foreground">Best Activity</p>
                          <p className="truncate text-sm font-semibold">
                            {topAct.activity}
                            <span className="ml-1 text-xs text-muted-foreground">
                              ({(topAct.avg_engagement * 100).toFixed(0)}%)
                            </span>
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded px-2 py-0.5 text-xs ${
                            topAct.activity_category === "active"
                              ? "bg-orange-500/20 text-orange-300"
                              : "bg-blue-500/20 text-blue-300"
                          }`}
                        >
                          {topAct.activity_category}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* ── STATUS BADGE ─────────────────────────────────────── */}
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Status</span>
                  {child.isCalibrated ? (
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400">
                      ✓ Calibrated
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-400">
                      ⚠ Needs Calibration
                    </span>
                  )}
                </div>

                {/* ── ACTION BUTTONS ────────────────────────────────────── */}
                <div className="mt-auto flex gap-2">
                  {child.isCalibrated ? (
                    <button
                      onClick={() => {
                        setSelectedChild(child);
                        navigate("/app/hobby-session");
                      }}
                      className="flex-1 rounded-lg bg-purple-600 py-2 text-sm font-semibold text-white transition hover:bg-purple-700"
                    >
                      Start Session
                    </button>
                  ) : (
                    <button
                      onClick={() => handleCalibrate(child)}
                      className="flex-1 rounded-lg bg-amber-500 py-2 text-sm font-semibold text-white transition hover:bg-amber-600"
                    >
                      Calibrate Now
                    </button>
                  )}

                  <button
                    onClick={() => setSelectedChild(child)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                      isActive
                        ? "bg-emerald-600 text-white"
                        : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                    title={isActive ? "Active" : "Select"}
                  >
                    {isActive ? "✓" : "Select"}
                  </button>

                  <button
                    onClick={() => handleEdit(child)}
                    className="rounded-lg bg-secondary px-3 py-2 text-sm transition hover:bg-accent"
                    title="Edit"
                  >
                    <Edit className="h-4 w-4" />
                  </button>

                  <button
                    onClick={() => handleDelete(child.id)}
                    className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 transition hover:bg-red-500/20"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Dialogs ───────────────────────────────────────────────────────── */}
      {dialogOpen && (
        <ChildDialog
          child={editingChild}
          onClose={() => { setDialogOpen(false); setEditingChild(null); }}
        />
      )}

      {calibrationOpen && calibratingChild && (
        <CalibrationDialog
          child={calibratingChild}
          onClose={() => { setCalibrationOpen(false); setCalibratingChild(null); }}
        />
      )}
    </div>
  );
};
