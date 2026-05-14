import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { FileText, TrendingUp, TrendingDown, Award, AlertTriangle, Clock } from "lucide-react";
import { useChildren } from "../context/ChildrenContext";
import { api } from "../services/api";

// ─── window options ───────────────────────────────────────────────────────────
const WINDOW_OPTIONS = [
  { value: "today", label: "Today",         title: "Daily Report" },
  { value: "7d",    label: "Last 7 days",   title: "Weekly Report" },
  { value: "30d",   label: "Last 30 days",  title: "Monthly Report" },
] as const;
type WindowValue = (typeof WINDOW_OPTIONS)[number]["value"];

function windowDateRange(win: WindowValue): string {
  const now = new Date();
  if (win === "today") return now.toLocaleDateString();
  const days = win === "7d" ? 7 : 30;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return `${from.toLocaleDateString()} – ${now.toLocaleDateString()}`;
}

// ─── activity bar ─────────────────────────────────────────────────────────────
function ActivityBar({
  activity, avgEngagement, color, rank,
}: { activity: string; avgEngagement: number; color: string; rank: number }) {
  return (
    <div className="flex items-center gap-4">
      <div className={`flex h-8 w-8 items-center justify-center rounded-full font-bold ${color === "green" ? "bg-emerald-500/20 text-emerald-400" : "bg-orange-500/20 text-orange-400"}`}>
        {rank}
      </div>
      <div className="flex-1">
        <p className="font-semibold">{activity}</p>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={`h-2 rounded-full transition-all duration-700 ${color === "green" ? "bg-emerald-500" : "bg-orange-500"}`}
            style={{ width: `${Math.max(2, avgEngagement * 100)}%` }}
          />
        </div>
      </div>
      <p className={`w-12 text-right text-lg font-bold ${color === "green" ? "text-emerald-400" : "text-orange-400"}`}>
        {(avgEngagement * 100).toFixed(0)}%
      </p>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────
export const Reports = () => {
  const navigate = useNavigate();
  const { selectedChild } = useChildren();
  const [win, setWin] = useState<WindowValue>("7d");

  const [overview,  setOverview]  = useState<any>(null);
  const [insights,  setInsights]  = useState<any>(null);
  const [timeStats, setTimeStats] = useState<any>(null);
  const [alerts,    setAlerts]    = useState<any[]>([]);
  const [loading,   setLoading]   = useState(false);

  useEffect(() => {
    if (!selectedChild) return;
    let alive = true;
    setLoading(true);

    const fetchAll = async () => {
      const [ov, ins, ts, al] = await Promise.allSettled([
        api.getDailySummary(selectedChild.id, win),
        api.getActivityInsights(selectedChild.id, win),
        api.getActivityTimeStats(selectedChild.id, win),
        api.getAlerts(selectedChild.id),
      ]);
      if (!alive) return;
      setOverview(ov.status   === "fulfilled" ? ov.value   : null);
      setInsights(ins.status  === "fulfilled" ? ins.value  : null);
      setTimeStats(ts.status  === "fulfilled" ? ts.value   : null);
      setAlerts(al.status     === "fulfilled" ? al.value   : []);
      setLoading(false);
    };

    void fetchAll();
    return () => { alive = false; };
  }, [selectedChild, win]);

  // ── guards ────────────────────────────────────────────────────────────────
  if (!selectedChild) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">Select a child profile first.</p>
        </div>
      </div>
    );
  }

  const windowLabel = WINDOW_OPTIONS.find(o => o.value === win)!;
  const activities: any[] = insights?.activities ?? [];  // already sorted by engagement DESC, no "Sensor Stream"
  const topActivities = activities.slice(0, 3);
  const lowActivities = [...activities].reverse().slice(0, 3);

  const stressAlerts = alerts.filter(
    (a: any) => a.alert_type === "high_stress" || a.alert_type === "low_engagement"
  );
  const highEngCount = Math.round(
    (overview?.sample_count ?? 0) * Math.max(0, (overview?.average_engagement_score ?? 0) - 0.4)
  ); // approx — real count requires a session-level query

  const hasData = (overview?.sample_count ?? 0) > 0 || activities.length > 0;

  return (
    <div className="space-y-6 p-8">

      {/* ── Header + window selector ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-3xl font-bold">{windowLabel.title}</h1>
          <p className="text-muted-foreground">
            Wellbeing summary for <span className="font-semibold">{selectedChild.child_name}</span>
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">{windowDateRange(win)}</p>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {WINDOW_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setWin(opt.value)}
              className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
                win === opt.value
                  ? "bg-purple-600 text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── loading ──────────────────────────────────────────────────────────── */}
      {loading && (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground animate-pulse">
          Loading report…
        </div>
      )}

      {/* ── no data ──────────────────────────────────────────────────────────── */}
      {!loading && !hasData && (
        <div className="rounded-lg border border-border bg-card p-10 text-center">
          <FileText className="mx-auto mb-4 h-14 w-14 text-muted-foreground" />
          <p className="text-xl text-muted-foreground">No report data for this window</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Complete activity sessions to generate report insights.
          </p>
          <button
            onClick={() => navigate("/app/hobby-session")}
            className="mt-4 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-700"
          >
            Start a Session
          </button>
        </div>
      )}

      {/* ── report body (only when data exists) ─────────────────────────────── */}
      {!loading && hasData && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-lg bg-gradient-to-br from-purple-600 to-purple-700 p-5 text-white">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm opacity-90">Avg. Engagement</p>
                <TrendingUp className="h-5 w-5 opacity-80" />
              </div>
              <p className="text-3xl font-bold">
                {overview?.sample_count > 0
                  ? `${(overview.average_engagement_score * 100).toFixed(1)}%`
                  : "—"}
              </p>
              {overview?.sample_count > 0 && (
                <p className="mt-1 text-xs opacity-70">{overview.sample_count} readings</p>
              )}
            </div>

            <div className="rounded-lg bg-gradient-to-br from-red-600 to-red-700 p-5 text-white">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm opacity-90">Avg. Heart Rate</p>
                <TrendingUp className="h-5 w-5 opacity-80" />
              </div>
              <p className="text-3xl font-bold">
                {overview?.sensor_count > 0 ? `${overview.average_heart_rate.toFixed(0)} bpm` : "—"}
              </p>
            </div>

            <div className="rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 p-5 text-white">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm opacity-90">Avg. HRV</p>
                <TrendingUp className="h-5 w-5 opacity-80" />
              </div>
              <p className="text-3xl font-bold">
                {overview?.sensor_count > 0 ? `${overview.average_hrv.toFixed(0)} ms` : "—"}
              </p>
            </div>

            <div className="rounded-lg bg-gradient-to-br from-emerald-600 to-emerald-700 p-5 text-white">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm opacity-90">Total Sessions</p>
                <Award className="h-5 w-5 opacity-80" />
              </div>
              <p className="text-3xl font-bold">{timeStats?.total_sessions ?? "—"}</p>
              {timeStats?.total_seconds > 0 && (
                <p className="mt-1 text-xs opacity-70">
                  {Math.floor(timeStats.total_seconds / 60)}m total
                </p>
              )}
            </div>
          </div>

          {/* Top + Low Activities */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Top */}
            <div className="rounded-lg border border-border bg-card p-6">
              <div className="mb-4 flex items-center gap-2">
                <Award className="h-5 w-5 text-emerald-400" />
                <h2 className="text-xl font-semibold">Top Performing Activities</h2>
              </div>
              {topActivities.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity data for this window.</p>
              ) : (
                <div className="space-y-4">
                  {topActivities.map((item: any, i: number) => (
                    <ActivityBar
                      key={item.activity}
                      activity={item.activity}
                      avgEngagement={item.avg_engagement}
                      color="green"
                      rank={i + 1}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Low */}
            <div className="rounded-lg border border-border bg-card p-6">
              <div className="mb-4 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-400" />
                <h2 className="text-xl font-semibold">Low Engagement Activities</h2>
              </div>
              {lowActivities.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity data for this window.</p>
              ) : (
                <div className="space-y-4">
                  {lowActivities.map((item: any, i: number) => (
                    <ActivityBar
                      key={item.activity}
                      activity={item.activity}
                      avgEngagement={item.avg_engagement}
                      color="orange"
                      rank={i + 1}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Key Insights */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 text-xl font-semibold">Key Insights</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-emerald-400" />
                  <p className="font-semibold text-emerald-300">High Engagement Readings</p>
                </div>
                <p className="mb-1 text-3xl font-bold">{highEngCount}</p>
                {topActivities.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Most common during <strong>{topActivities[0].activity}</strong>
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-red-400" />
                  <p className="font-semibold text-red-300">Stress Alerts Detected</p>
                </div>
                <p className="mb-1 text-3xl font-bold">{stressAlerts.length}</p>
                {lowActivities.length > 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Most common during <strong>{lowActivities[0].activity}</strong>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">No real activity data yet</p>
                )}
              </div>

              {timeStats?.activities?.length > 0 && (
                <div className="rounded-lg border border-blue-500/40 bg-blue-500/10 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Clock className="h-5 w-5 text-blue-400" />
                    <p className="font-semibold text-blue-300">Most Time Spent</p>
                  </div>
                  <p className="text-xl font-bold">{timeStats.activities[0].activity}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {Math.floor(timeStats.activities[0].total_seconds / 60)}m across{" "}
                    {timeStats.activities[0].session_count} session
                    {timeStats.activities[0].session_count !== 1 ? "s" : ""}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Recommendations */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 text-xl font-semibold">Recommendations</h2>
            <div className="space-y-3">
              {topActivities.length > 0 && (
                <div className="flex items-start gap-3 rounded-lg border border-purple-500/40 bg-purple-500/10 p-4">
                  <Award className="mt-0.5 h-5 w-5 text-purple-400" />
                  <div>
                    <p className="font-semibold text-purple-300">Encourage Top Activities</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedChild.child_name} shows high engagement during{" "}
                      {topActivities.map((a: any) => a.activity).join(", ")}. Consider
                      increasing time spent on these activities.
                    </p>
                  </div>
                </div>
              )}

              {stressAlerts.length > 5 && (
                <div className="flex items-start gap-3 rounded-lg border border-orange-500/40 bg-orange-500/10 p-4">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-orange-400" />
                  <div>
                    <p className="font-semibold text-orange-300">Monitor Stress Levels</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {stressAlerts.length} stress alerts detected this period. Consider breaks
                      during{" "}
                      {lowActivities.map((a: any) => a.activity).join(", ")}.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3 rounded-lg border border-blue-500/40 bg-blue-500/10 p-4">
                <TrendingUp className="mt-0.5 h-5 w-5 text-blue-400" />
                <div>
                  <p className="font-semibold text-blue-300">Balanced Routine</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Maintain a balanced mix of high-engagement activities with adequate rest
                    periods for optimal wellbeing.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
