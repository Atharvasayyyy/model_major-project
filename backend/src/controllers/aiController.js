const { chat } = require("../services/aiService");
const Child = require("../models/Child");
const EngagementResult = require("../models/EngagementResult");
const ActivitySession = require("../models/ActivitySession");
const Alert = require("../models/Alert");

// ─── Shared helpers ───────────────────────────────────────────────────────────

const EXCLUDED = ["Sensor Stream", "Baseline Calibration"];

async function ensureChildOwnership(childId, parentId) {
  return Child.findOne({ _id: childId, parent_id: parentId });
}

/**
 * Aggregate a rich analytics context for the AI.
 * Pulls last 7 days; returns plain JSON-serialisable object.
 */
async function buildChildContext(child) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const baseMatch = {
    child_id:  child._id,
    activity:  { $nin: EXCLUDED },
    timestamp: { $gte: sevenDaysAgo },
  };

  // Per-activity engagement ranking
  const activityStats = await EngagementResult.aggregate([
    { $match: baseMatch },
    {
      $group: {
        _id:            "$activity",
        avg_engagement: { $avg: "$engagement_score" },
        sample_count:   { $sum: 1 },
        category:       { $first: "$activity_category" },
      },
    },
    { $sort: { avg_engagement: -1 } },
  ]);

  // Recent completed sessions
  const recentSessions = await ActivitySession.find({
    child_id:       child._id,
    session_active: false,
    started_at:     { $gte: sevenDaysAgo },
    activity:       { $nin: EXCLUDED },
  })
    .sort({ started_at: -1 })
    .limit(10)
    .select("activity category started_at duration_seconds avg_engagement");

  // Recent alerts
  const recentAlerts = await Alert.find({
    child_id:  child._id,
    createdAt: { $gte: sevenDaysAgo },
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .select("alert_type message createdAt");

  // Top-3 engagement hours
  const hourlyStats = await EngagementResult.aggregate([
    { $match: baseMatch },
    {
      $group: {
        _id:            { $hour: "$timestamp" },
        avg_engagement: { $avg: "$engagement_score" },
        sample_count:   { $sum: 1 },
      },
    },
    { $sort: { avg_engagement: -1 } },
    { $limit: 3 },
  ]);

  return {
    child_name:      child.child_name,
    age:             child.age ?? null,
    grade:           child.grade ?? null,
    baseline:        { hr: child.hr_baseline ?? null, hrv: child.rmssd_baseline ?? null },
    activities:      activityStats.map((a) => ({
      name:           a._id,
      avg_engagement: Math.round(a.avg_engagement * 100),
      sample_count:   a.sample_count,
      category:       a.category ?? "unknown",
    })),
    recent_sessions: recentSessions.map((s) => ({
      activity:     s.activity,
      category:     s.category ?? null,
      duration_min: Math.round((s.duration_seconds || 0) / 60),
      engagement:   s.avg_engagement != null ? Math.round(s.avg_engagement * 100) : null,
    })),
    alerts:      recentAlerts.map((a) => ({ type: a.alert_type, message: a.message })),
    peak_hours:  hourlyStats.map((h) => ({ hour: h._id, engagement: Math.round(h.avg_engagement * 100) })),
  };
}

// ─── Prompt helpers ───────────────────────────────────────────────────────────

function activityLines(ctx) {
  return ctx.activities.length > 0
    ? ctx.activities.map((a) => `- ${a.name} (${a.category}): ${a.avg_engagement}% avg, ${a.sample_count} readings`).join("\n")
    : "No activity sessions yet.";
}

function sessionLines(ctx) {
  return ctx.recent_sessions.length > 0
    ? ctx.recent_sessions.slice(0, 5).map((s) => `- ${s.activity}: ${s.duration_min}min, engagement ${s.engagement ?? "—"}%`).join("\n")
    : "No recent sessions.";
}

// ─── POST /api/ai/chat ────────────────────────────────────────────────────────

async function aiChat(req, res) {
  try {
    const { child_id, message, history = [] } = req.body;
    if (!child_id || !message) {
      return res.status(400).json({ message: "child_id and message are required" });
    }

    const child = await ensureChildOwnership(child_id, req.user._id);
    if (!child) return res.status(404).json({ message: "Child not found" });

    const ctx = await buildChildContext(child);

    const systemPrompt = `You are MindPulse, a warm AI wellbeing assistant helping parents understand their child's engagement and physiological data from real sensors.

You have live data for ${ctx.child_name}${ctx.age ? ` (age ${ctx.age})` : ""}${ctx.grade ? `, grade ${ctx.grade}` : ""}.

CONTEXT — last 7 days:
HR Baseline : ${ctx.baseline.hr ?? "not calibrated"} bpm
HRV Baseline: ${ctx.baseline.hrv ?? "not calibrated"} ms

Activities tracked:
${activityLines(ctx)}

Recent sessions:
${sessionLines(ctx)}

Alerts (last 7 days): ${ctx.alerts.length > 0 ? ctx.alerts.length + " alerts" : "none"}
Peak hours: ${ctx.peak_hours.length > 0 ? ctx.peak_hours.map((h) => `${h.hour}:00 (${h.engagement}%)`).join(", ") : "insufficient data"}

RULES:
- Be warm, brief, parent-friendly (no jargon)
- Reference real numbers when answering
- Keep responses under 150 words
- Use 1–2 emojis max for warmth
- For medical concerns suggest a pediatrician
- If data is insufficient say so honestly`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...history.slice(-6),
      { role: "user", content: message },
    ];

    const response = await chat(messages, { temperature: 0.7, max_tokens: 300 });
    return res.json({
      response,
      context_used: {
        activities_count: ctx.activities.length,
        sessions_count:   ctx.recent_sessions.length,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "AI chat failed", error: error.message });
  }
}

// ─── GET /api/ai/insights/:child_id ──────────────────────────────────────────

async function aiInsights(req, res) {
  try {
    const { child_id } = req.params;
    const child = await ensureChildOwnership(child_id, req.user._id);
    if (!child) return res.status(404).json({ message: "Child not found" });

    const ctx = await buildChildContext(child);

    if (ctx.activities.length === 0) {
      return res.json({
        insights: [{
          type:        "info",
          title:       "Start tracking activities",
          description: `Complete a few activity sessions for ${ctx.child_name} to see personalised insights here.`,
          icon:        "💡",
        }],
        generated_at: new Date().toISOString(),
      });
    }

    const prompt = `You are an AI wellbeing analyst. Generate exactly 3 actionable insights for this child based on the data.

DATA:
${JSON.stringify(ctx, null, 2)}

Return ONLY a valid JSON array (no markdown fencing, no explanation):
[
  {
    "type": "positive" | "warning" | "suggestion",
    "title": "Short title (max 8 words)",
    "description": "One sentence referencing specific numbers (max 30 words)",
    "icon": "🏆" | "⚠️" | "💡" | "📈" | "🎯"
  }
]

Be SPECIFIC — use the actual percentages and activity names from the data.`;

    const raw = await chat([{ role: "user", content: prompt }], { temperature: 0.6, max_tokens: 600 });

    let insights;
    try {
      const cleaned = raw.replace(/^```json\n?|^```\n?|```\n?$/gm, "").trim();
      insights = JSON.parse(cleaned);
    } catch (_) {
      console.error("[AI] insights parse error:", raw);
      insights = [{ type: "info", title: "Insights summary", description: raw.slice(0, 200), icon: "💡" }];
    }

    return res.json({ insights, generated_at: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ message: "AI insights failed", error: error.message });
  }
}

// ─── GET /api/ai/recommendations/:child_id ───────────────────────────────────

async function aiRecommendations(req, res) {
  try {
    const { child_id } = req.params;
    const child = await ensureChildOwnership(child_id, req.user._id);
    if (!child) return res.status(404).json({ message: "Child not found" });

    const ctx = await buildChildContext(child);

    if (ctx.activities.length < 2) {
      return res.json({
        recommendations: [],
        message: "Need at least 2 different activities to generate recommendations.",
      });
    }

    const prompt = `You are an AI wellbeing coach for parents. Suggest 2 specific activity recommendations.

DATA:
${JSON.stringify(ctx, null, 2)}

Return ONLY valid JSON (no markdown):
{
  "recommendations": [
    {
      "title": "Short suggestion title (max 6 words)",
      "reason": "Why, referencing specific data (1 sentence, max 25 words)",
      "action": "What the parent should do (1 sentence, max 25 words)",
      "priority": "high" | "medium" | "low"
    }
  ]
}`;

    const raw = await chat([{ role: "user", content: prompt }], { temperature: 0.6, max_tokens: 400 });

    let parsed;
    try {
      const cleaned = raw.replace(/^```json\n?|^```\n?|```\n?$/gm, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (_) {
      parsed = { recommendations: [], message: "Could not parse AI response." };
    }

    return res.json(parsed);
  } catch (error) {
    return res.status(500).json({ message: "AI recommendations failed", error: error.message });
  }
}

// ─── GET /api/ai/summary/:child_id ───────────────────────────────────────────

async function aiSummary(req, res) {
  try {
    const { child_id } = req.params;
    const { period = "weekly" } = req.query;

    const child = await ensureChildOwnership(child_id, req.user._id);
    if (!child) return res.status(404).json({ message: "Child not found" });

    const ctx = await buildChildContext(child);

    if (ctx.activities.length === 0) {
      return res.json({
        summary:      `No activity data for ${ctx.child_name} yet. Complete a few sessions to generate a ${period} summary.`,
        period,
        generated_at: new Date().toISOString(),
      });
    }

    const prompt = `Write a warm, parent-friendly ${period} wellbeing summary for ${ctx.child_name}.

DATA:
${JSON.stringify(ctx, null, 2)}

RULES:
- 4–6 sentences, flowing paragraph (no bullet points)
- Start with overall impression
- Mention 1–2 specific positive observations with real percentages
- Mention 1 area for attention if applicable
- End with 1 actionable suggestion
- Use child's name once or twice
- No medical advice, no jargon`;

    const raw = await chat([{ role: "user", content: prompt }], { temperature: 0.75, max_tokens: 350 });

    return res.json({
      summary:      raw.trim(),
      period,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ message: "AI summary failed", error: error.message });
  }
}

// ─── exports ──────────────────────────────────────────────────────────────────

module.exports = {
  aiChat,
  aiInsights,
  aiRecommendations,
  aiSummary,
};
