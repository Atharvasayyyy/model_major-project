import { useMemo } from "react";
import { useChildren } from "../context/ChildrenContext";
import { useSensorData } from "../context/SensorDataContext";
import { FileText, TrendingUp, TrendingDown, Award, AlertTriangle } from "lucide-react";

export const Reports = () => {
  const { selectedChild } = useChildren();
  const { sensorData } = useSensorData();

  const weeklyReport = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekData = sensorData.filter((d) => new Date(d.timestamp) >= weekAgo);

    if (weekData.length === 0) {
      return null;
    }

    // Activity engagement
    const activityMap = new Map<string, { total: number; count: number }>();
    weekData.forEach((d) => {
      const existing = activityMap.get(d.activity) || { total: 0, count: 0 };
      activityMap.set(d.activity, {
        total: existing.total + d.engagement_score,
        count: existing.count + 1,
      });
    });

    const activities = Array.from(activityMap.entries())
      .map(([activity, data]) => ({
        activity,
        avgEngagement: data.total / data.count,
      }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement);

    const topActivities = activities.slice(0, 3);
    const lowActivities = activities.slice(-3).reverse();

    // Overall metrics
    const avgEngagement =
      weekData.reduce((sum, d) => sum + d.engagement_score, 0) / weekData.length;
    const avgHR = weekData.reduce((sum, d) => sum + d.heart_rate, 0) / weekData.length;
    const avgHRV = weekData.reduce((sum, d) => sum + d.hrv_rmssd, 0) / weekData.length;

    // Stress events
    const stressEvents = weekData.filter((d) => d.engagement_score < 0.2).length;
    const highEngagementEvents = weekData.filter((d) => d.engagement_score >= 0.8).length;

    return {
      topActivities,
      lowActivities,
      avgEngagement,
      avgHR,
      avgHRV,
      stressEvents,
      highEngagementEvents,
      totalSessions: weekData.length,
    };
  }, [sensorData]);

  if (!selectedChild) {
    return (
      <div className="p-8">
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <p className="text-muted-foreground">
            No child profile selected. Please select or add a child first.
          </p>
        </div>
      </div>
    );
  }

  if (!weeklyReport) {
    return (
      <div className="p-8">
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <p className="text-xl text-muted-foreground">No data available for report</p>
          <p className="text-sm text-muted-foreground mt-2">
            Data will appear here once monitoring begins
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Weekly Report</h1>
        <p className="text-muted-foreground">
          Wellbeing summary for {selectedChild.child_name}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString()} -{" "}
          {new Date().toLocaleDateString()}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm opacity-90">Avg. Engagement</p>
            <TrendingUp className="w-5 h-5 opacity-90" />
          </div>
          <p className="text-3xl font-bold">
            {(weeklyReport.avgEngagement * 100).toFixed(1)}%
          </p>
        </div>

        <div className="bg-gradient-to-br from-red-600 to-red-700 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm opacity-90">Avg. Heart Rate</p>
            <TrendingUp className="w-5 h-5 opacity-90" />
          </div>
          <p className="text-3xl font-bold">{weeklyReport.avgHR.toFixed(0)} bpm</p>
        </div>

        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm opacity-90">Avg. HRV</p>
            <TrendingUp className="w-5 h-5 opacity-90" />
          </div>
          <p className="text-3xl font-bold">{weeklyReport.avgHRV.toFixed(0)} ms</p>
        </div>

        <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm opacity-90">Total Sessions</p>
            <Award className="w-5 h-5 opacity-90" />
          </div>
          <p className="text-3xl font-bold">{weeklyReport.totalSessions}</p>
        </div>
      </div>

      {/* Top Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Award className="w-6 h-6 text-green-500" />
            <h2 className="text-xl font-semibold">Top Performing Activities</h2>
          </div>
          <div className="space-y-4">
            {weeklyReport.topActivities.map((item, index) => (
              <div key={item.activity} className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center font-bold">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <p className="font-semibold">{item.activity}</p>
                  <div className="w-full bg-secondary rounded-full h-2 mt-2">
                    <div
                      className="bg-green-500 h-2 rounded-full"
                      style={{ width: `${item.avgEngagement * 100}%` }}
                    />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-green-500">
                    {(item.avgEngagement * 100).toFixed(0)}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-6 h-6 text-orange-500" />
            <h2 className="text-xl font-semibold">Low Engagement Activities</h2>
          </div>
          <div className="space-y-4">
            {weeklyReport.lowActivities.map((item, index) => (
              <div key={item.activity} className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-orange-500/20 text-orange-500 flex items-center justify-center font-bold">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <p className="font-semibold">{item.activity}</p>
                  <div className="w-full bg-secondary rounded-full h-2 mt-2">
                    <div
                      className="bg-orange-500 h-2 rounded-full"
                      style={{ width: `${item.avgEngagement * 100}%` }}
                    />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-orange-500">
                    {(item.avgEngagement * 100).toFixed(0)}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Key Insights */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Key Insights</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-green-500" />
              <p className="font-semibold text-green-500">High Engagement Sessions</p>
            </div>
            <p className="text-3xl font-bold mb-2">{weeklyReport.highEngagementEvents}</p>
            <p className="text-sm text-muted-foreground">
              {weeklyReport.topActivities.length > 0 && (
                <>
                  Most common during <strong>{weeklyReport.topActivities[0].activity}</strong>
                </>
              )}
            </p>
          </div>

          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-5 h-5 text-red-500" />
              <p className="font-semibold text-red-500">Stress Events Detected</p>
            </div>
            <p className="text-3xl font-bold mb-2">{weeklyReport.stressEvents}</p>
            <p className="text-sm text-muted-foreground">
              {weeklyReport.lowActivities.length > 0 && (
                <>
                  Most common during <strong>{weeklyReport.lowActivities[0].activity}</strong>
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Recommendations</h2>
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-4 bg-purple-500/10 border border-purple-500/50 rounded-lg">
            <Award className="w-5 h-5 text-purple-500 mt-0.5" />
            <div>
              <p className="font-semibold text-purple-500">Encourage Top Activities</p>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedChild.child_name} shows high engagement during{" "}
                {weeklyReport.topActivities.map((a) => a.activity).join(", ")}. Consider
                increasing time spent on these activities.
              </p>
            </div>
          </div>

          {weeklyReport.stressEvents > 5 && (
            <div className="flex items-start gap-3 p-4 bg-orange-500/10 border border-orange-500/50 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-orange-500 mt-0.5" />
              <div>
                <p className="font-semibold text-orange-500">Monitor Stress Levels</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Multiple stress events detected this week. Consider breaks during{" "}
                  {weeklyReport.lowActivities.map((a) => a.activity).join(", ")}.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/50 rounded-lg">
            <TrendingUp className="w-5 h-5 text-blue-500 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-500">Balanced Routine</p>
              <p className="text-sm text-muted-foreground mt-1">
                Maintain a balanced mix of high-engagement activities with adequate rest
                periods for optimal wellbeing.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
