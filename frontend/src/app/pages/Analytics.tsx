import { useState, useEffect } from "react";
import { useChildren } from "../context/ChildrenContext";
import { TrendingUp, Clock, Activity, BarChart2 } from "lucide-react";
import { api } from "../services/api";
import {
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

// ─── helpers ────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function engagementBarColor(score: number) {
  if (score >= 0.8) return "#22c55e";
  if (score >= 0.6) return "#06b6d4";
  if (score >= 0.4) return "#f59e0b";
  return "#ef4444";
}

function CategoryBadge({ category }: { category: string | null }) {
  const isActive = category === "active";
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
        isActive
          ? "bg-orange-500/20 text-orange-400"
          : "bg-blue-500/20 text-blue-400"
      }`}
    >
      {category ?? "—"}
    </span>
  );
}

// ─── tooltip components ──────────────────────────────────────────────────────

function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value;
  return (
    <div className="min-w-[170px] rounded-lg border border-border/80 bg-background/95 px-3 py-2 shadow-xl backdrop-blur">
      <p className="mb-1 text-xs font-semibold text-foreground">{label}</p>
      <p className="text-xs text-cyan-400">
        Avg Engagement: {v != null ? (v * 100).toFixed(1) : "—"}%
      </p>
      <p className="text-xs text-muted-foreground">
        Samples: {payload[0]?.payload?.sample_count ?? 0}
      </p>
    </div>
  );
}

function ActivityBarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const pct = ((row?.avg_engagement ?? 0) * 100).toFixed(1);
  return (
    <div className="min-w-[200px] rounded-lg border border-border/80 bg-background/95 px-3 py-2 shadow-xl backdrop-blur">
      <p className="mb-1 text-xs font-semibold text-foreground">#{row?.rank} {label}</p>
      <p className="text-xs text-cyan-400">Avg Engagement: {pct}%</p>
      <p className="text-xs text-muted-foreground">
        Samples: {row?.sample_count ?? 0}
      </p>
      <CategoryBadge category={row?.activity_category ?? null} />
    </div>
  );
}

function TimeStatsTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value;
  return (
    <div className="min-w-[180px] rounded-lg border border-border/80 bg-background/95 px-3 py-2 shadow-xl backdrop-blur">
      <p className="mb-1 text-xs font-semibold text-foreground">{label}</p>
      <p className="text-xs text-emerald-400">
        Time: {v != null ? formatDuration(v) : "—"}
      </p>
      <p className="text-xs text-muted-foreground">
        Sessions: {payload[0]?.payload?.session_count ?? 0}
      </p>
    </div>
  );
}

function TodTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value;
  const samples = payload[0]?.payload?.sample_count ?? 0;
  return (
    <div className="min-w-[180px] rounded-lg border border-border/80 bg-background/95 px-3 py-2 shadow-xl backdrop-blur">
      <p className="mb-1 text-xs font-semibold text-foreground">
        {label}:00 – {Number(label) + 1}:00
      </p>
      {v != null ? (
        <>
          <p className="text-xs text-amber-400">
            Avg Engagement: {(v * 100).toFixed(1)}%
          </p>
          <p className="text-xs text-muted-foreground">Samples: {samples}</p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">No data</p>
      )}
    </div>
  );
}

// ─── loading / empty states ──────────────────────────────────────────────────

function LoadingCard() {
  return (
    <div className="flex h-40 items-center justify-center rounded-lg border border-border bg-card">
      <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>
    </div>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border bg-card/50">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// ─── window selector ─────────────────────────────────────────────────────────

const WINDOW_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "7d",    label: "Last 7 days" },
  { value: "30d",   label: "Last 30 days" },
  { value: "all",   label: "All time" },
] as const;

type WindowValue = (typeof WINDOW_OPTIONS)[number]["value"];

// ─── main component ──────────────────────────────────────────────────────────

export const Analytics = () => {
  const { selectedChild } = useChildren();
  const [win, setWin] = useState<WindowValue>("7d");

  // Section B/C — activity insights
  const [insightsData, setInsightsData] = useState<{
    activities: any[];
    window: string;
    total_samples: number;
  }>({ activities: [], window: "7d", total_samples: 0 });
  const [insightsLoading, setInsightsLoading] = useState(false);

  // Section A — daily summary
  const [summary, setSummary] = useState({
    average_heart_rate: 0,
    average_hrv: 0,
    average_engagement_score: 0,
    sample_count: 0,
    sensor_count: 0,
    window: "today",
  });
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Section D — trend
  const [trendData, setTrendData] = useState<{ trend: any[]; window: string }>(
    { trend: [], window: "7d" },
  );
  const [trendLoading, setTrendLoading] = useState(false);

  // Section E — time stats
  const [timeStats, setTimeStats] = useState<{
    activities: any[];
    total_seconds: number;
    total_sessions: number;
  }>({ activities: [], total_seconds: 0, total_sessions: 0 });
  const [timeStatsLoading, setTimeStatsLoading] = useState(false);

  // Section F — time of day
  const [timeOfDay, setTimeOfDay] = useState<{
    hourly: any[];
    activity: string | null;
  }>({ hourly: [], activity: null });
  const [todLoading, setTodLoading] = useState(false);
  const [tofActivity, setTofActivity] = useState("");

  // ── fetch when child or window changes ──────────────────────────────────
  useEffect(() => {
    if (!selectedChild) return;
    let alive = true;

    const load = async () => {
      // All three main sections share the same window
      setInsightsLoading(true);
      setSummaryLoading(true);
      setTrendLoading(true);
      setTimeStatsLoading(true);

      const [insights, sum, trend, ts] = await Promise.allSettled([
        api.getActivityInsights(selectedChild.id, win),
        api.getDailySummary(selectedChild.id, win),
        api.getEngagementTrend(selectedChild.id, win),
        api.getActivityTimeStats(selectedChild.id, win),
      ]);

      if (!alive) return;

      if (insights.status === "fulfilled") setInsightsData(insights.value);
      if (sum.status === "fulfilled") setSummary(sum.value);
      if (trend.status === "fulfilled") setTrendData(trend.value);
      if (ts.status === "fulfilled") setTimeStats(ts.value);

      setInsightsLoading(false);
      setSummaryLoading(false);
      setTrendLoading(false);
      setTimeStatsLoading(false);
    };

    void load();
    return () => { alive = false; };
  }, [selectedChild, win]);

  // ── time-of-day: re-fetch when activity filter changes ───────────────────
  useEffect(() => {
    if (!selectedChild) return;
    let alive = true;
    setTodLoading(true);

    api
      .getTimeOfDayPattern(selectedChild.id, "30d", tofActivity || null)
      .then((d) => { if (alive) { setTimeOfDay(d); setTodLoading(false); } })
      .catch(() => { if (alive) setTodLoading(false); });

    return () => { alive = false; };
  }, [selectedChild, tofActivity]);

  // ── no child selected ────────────────────────────────────────────────────
  if (!selectedChild) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">
            No child profile selected. Please select or add a child first.
          </p>
        </div>
      </div>
    );
  }

  const engPct = (summary.average_engagement_score * 100).toFixed(1);

  return (
    <div className="space-y-8 p-8">

      {/* ── Header + window selector ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">
            Engagement insights for{" "}
            <span className="font-semibold">{selectedChild.child_name}</span>
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {WINDOW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setWin(opt.value)}
              className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
                win === opt.value
                  ? "bg-emerald-500 text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── SECTION A — Summary cards ────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
          <TrendingUp className="h-5 w-5 text-purple-400" /> Overview
        </h2>
        {summaryLoading ? (
          <LoadingCard />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Engagement */}
            <div className="rounded-lg border border-border bg-card p-6">
              <p className="mb-1 text-sm text-muted-foreground">
                Avg. Engagement
              </p>
              {summary.sample_count === 0 ? (
                <p className="text-lg text-muted-foreground">
                  No data for this window
                </p>
              ) : (
                <>
                  <p className="text-3xl font-bold">{engPct}%</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Based on {summary.sample_count} readings
                  </p>
                </>
              )}
            </div>

            {/* Heart Rate */}
            <div className="rounded-lg border border-border bg-card p-6">
              <p className="mb-1 text-sm text-muted-foreground">
                Avg. Heart Rate
              </p>
              {summary.sensor_count === 0 ? (
                <p className="text-lg text-muted-foreground">
                  No data for this window
                </p>
              ) : (
                <>
                  <p className="text-3xl font-bold">
                    {summary.average_heart_rate.toFixed(0)} bpm
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Based on {summary.sensor_count} sensor readings
                  </p>
                </>
              )}
            </div>

            {/* HRV */}
            <div className="rounded-lg border border-border bg-card p-6">
              <p className="mb-1 text-sm text-muted-foreground">Avg. HRV</p>
              {summary.sensor_count === 0 ? (
                <p className="text-lg text-muted-foreground">
                  No data for this window
                </p>
              ) : (
                <>
                  <p className="text-3xl font-bold">
                    {summary.average_hrv.toFixed(0)} ms
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    RMSSD
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── SECTION B/C — Activity bar chart + table ─────────────────────── */}
      <section>
        <h2 className="mb-1 flex items-center gap-2 text-xl font-semibold">
          <BarChart2 className="h-5 w-5 text-cyan-400" /> Activity vs
          Engagement
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          {insightsData.total_samples} total readings ·{" "}
          <span className="inline-block rounded bg-orange-500/20 px-1.5 text-orange-400">
            active
          </span>{" "}
          <span className="ml-1 inline-block rounded bg-blue-500/20 px-1.5 text-blue-400">
            sedentary
          </span>
        </p>

        {insightsLoading ? (
          <LoadingCard />
        ) : insightsData.activities.length === 0 ? (
          <EmptyCard message="No engagement data for this time window." />
        ) : (
          <>
            <div className="mb-6 rounded-lg border border-border bg-card p-6">
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={insightsData.activities}>
                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="4 8"
                    stroke="rgba(113,113,130,0.26)"
                  />
                  <XAxis
                    dataKey="activity"
                    axisLine={false}
                    tickLine={false}
                    stroke="#717182"
                    tick={{ fontSize: 12 }}
                    interval={0}
                    angle={-12}
                    textAnchor="end"
                    height={56}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    stroke="#717182"
                    tick={{ fontSize: 12 }}
                    domain={[0, 1]}
                    tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  />
                  <Tooltip
                    content={<ActivityBarTooltip />}
                    cursor={{ fill: "rgba(148,163,184,0.12)" }}
                  />
                  <Bar dataKey="avg_engagement" radius={[8, 8, 0, 0]} barSize={32}>
                    {insightsData.activities.map((item) => (
                      <Cell
                        key={item.activity}
                        fill={engagementBarColor(item.avg_engagement)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Table */}
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full">
                <thead className="bg-secondary">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
                      #
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
                      Activity
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
                      Category
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">
                      Avg. Engagement
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">
                      Samples
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {insightsData.activities.map((item) => {
                    const pct = (item.avg_engagement * 100).toFixed(1);
                    return (
                      <tr
                        key={item.activity}
                        className="hover:bg-secondary/50"
                      >
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {item.rank}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {item.activity}
                        </td>
                        <td className="px-4 py-3">
                          <CategoryBadge
                            category={item.activity_category ?? null}
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {pct}%
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                          {item.sample_count}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* ── SECTION D — Engagement trend (daily buckets) ─────────────────── */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
          <Activity className="h-5 w-5 text-sky-400" /> Engagement Trend
        </h2>
        {trendLoading ? (
          <LoadingCard />
        ) : trendData.trend.length === 0 ? (
          <EmptyCard message="No trend data for this time window." />
        ) : (
          <div className="rounded-lg border border-border bg-card p-6">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendData.trend}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="4 8"
                  stroke="rgba(113,113,130,0.26)"
                />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  stroke="#717182"
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  stroke="#717182"
                  tick={{ fontSize: 12 }}
                  domain={[0, 1]}
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                />
                <Tooltip
                  content={<TrendTooltip />}
                  cursor={{ stroke: "rgba(14,165,233,0.45)", strokeWidth: 1.5 }}
                />
                <Area
                  type="monotone"
                  dataKey="avg_engagement"
                  stroke="none"
                  fill="url(#trendFill)"
                />
                <Line
                  type="monotone"
                  dataKey="avg_engagement"
                  stroke="#0ea5e9"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 5, fill: "#0ea5e9", stroke: "#fff", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* ── SECTION E — Time per activity ────────────────────────────────── */}
      <section>
        <h2 className="mb-1 flex items-center gap-2 text-xl font-semibold">
          <Clock className="h-5 w-5 text-emerald-400" /> Time Spent per
          Activity
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Completed sessions only
        </p>

        {timeStatsLoading ? (
          <LoadingCard />
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-border bg-card p-5">
                <p className="mb-1 text-sm text-muted-foreground">
                  Total Time
                </p>
                <p className="text-2xl font-bold">
                  {timeStats.total_seconds > 0
                    ? formatDuration(timeStats.total_seconds)
                    : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-card p-5">
                <p className="mb-1 text-sm text-muted-foreground">
                  Total Sessions
                </p>
                <p className="text-2xl font-bold">
                  {timeStats.total_sessions}
                </p>
              </div>
            </div>

            {timeStats.activities.length === 0 ? (
              <EmptyCard message="No completed sessions in this window." />
            ) : (
              <div className="rounded-lg border border-border bg-card p-6">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={timeStats.activities}>
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="4 8"
                      stroke="rgba(113,113,130,0.26)"
                    />
                    <XAxis
                      dataKey="activity"
                      axisLine={false}
                      tickLine={false}
                      stroke="#717182"
                      tick={{ fontSize: 12 }}
                      interval={0}
                      angle={-12}
                      textAnchor="end"
                      height={56}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      stroke="#717182"
                      tick={{ fontSize: 12 }}
                      tickFormatter={(s) => `${Math.round(s / 60)}m`}
                    />
                    <Tooltip content={<TimeStatsTooltip />} cursor={{ fill: "rgba(148,163,184,0.12)" }} />
                    <Bar dataKey="total_seconds" radius={[8, 8, 0, 0]} barSize={32} fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── SECTION F — Time-of-Day pattern ──────────────────────────────── */}
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <BarChart2 className="h-5 w-5 text-amber-400" /> Engagement by
              Time of Day
            </h2>
            <p className="text-xs text-muted-foreground">
              Last 30 days ·{" "}
              {tofActivity
                ? `filtered to "${tofActivity}"`
                : "all activities"}
            </p>
          </div>

          <select
            value={tofActivity}
            onChange={(e) => setTofActivity(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
          >
            <option value="">All Activities</option>
            {timeStats.activities.map((a) => (
              <option key={a.activity} value={a.activity}>
                {a.activity}
              </option>
            ))}
          </select>
        </div>

        {todLoading ? (
          <LoadingCard />
        ) : (
          <div className="rounded-lg border border-border bg-card p-6">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={timeOfDay.hourly}>
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="4 8"
                  stroke="rgba(113,113,130,0.26)"
                />
                <XAxis
                  dataKey="hour"
                  axisLine={false}
                  tickLine={false}
                  stroke="#717182"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(h) => `${h}:00`}
                  interval={2}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  stroke="#717182"
                  tick={{ fontSize: 12 }}
                  domain={[0, 1]}
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                />
                <Tooltip content={<TodTooltip />} cursor={{ fill: "rgba(148,163,184,0.12)" }} />
                <Bar dataKey="avg_engagement" radius={[4, 4, 0, 0]} barSize={18}>
                  {timeOfDay.hourly.map((entry) => (
                    <Cell
                      key={entry.hour}
                      fill={
                        entry.avg_engagement != null
                          ? "#f59e0b"
                          : "rgba(113,113,130,0.18)"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="mt-2 text-xs text-muted-foreground">
              Greyed bars have no data for that hour.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};
