import { Link } from "react-router";
import { motion } from "motion/react";
import {
  Activity,
  HeartPulse,
  ShieldCheck,
  BarChart3,
  Brain,
  Sparkles,
  Move3D,
  ArrowRight,
  Radar,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const signalCards = [
  {
    title: "Heart Rate",
    description: "Shows how active the body is",
    icon: HeartPulse,
    iconClass: "text-rose-500",
    glowClass: "from-rose-500/20 to-orange-400/5",
  },
  {
    title: "HRV",
    description: "Shows how calm or stressed the mind is",
    icon: Brain,
    iconClass: "text-blue-500",
    glowClass: "from-blue-500/20 to-cyan-400/5",
  },
  {
    title: "Motion",
    description: "Shows physical activity level",
    icon: Move3D,
    iconClass: "text-violet-500",
    glowClass: "from-violet-500/20 to-indigo-400/5",
  },
];

const trendData = [
  { time: "9:00", heartRate: 76, hrv: 62 },
  { time: "9:10", heartRate: 88, hrv: 55 },
  { time: "9:20", heartRate: 102, hrv: 42 },
  { time: "9:30", heartRate: 90, hrv: 58 },
  { time: "9:40", heartRate: 84, hrv: 66 },
  { time: "9:50", heartRate: 79, hrv: 72 },
];

const flowSteps = [
  { title: "Sensors", text: "Wearable sensors collect heart rate, HRV, and motion." },
  { title: "AI Model", text: "MindPulse checks patterns using valence and arousal." },
  { title: "Insights", text: "Dashboard shows engagement, stress, and calm moments." },
];

export const Landing = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <header className="mb-12">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
            <Activity className="h-4 w-4 text-purple-500" />
            MindPulse - IoT Based Student Engagement Monitoring
          </div>
          <h1 className="mb-4 text-4xl font-bold leading-tight md:text-5xl">
            Student engagement insights from wearable physiological signals
          </h1>
          <p className="max-w-3xl text-lg text-muted-foreground">
            MindPulse collects heart rate, HRV and motion data, performs baseline-aware engagement scoring,
            and provides actionable analytics and alerts for parents.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/auth/login"
              className="rounded-lg bg-purple-600 px-5 py-3 font-semibold text-white transition-colors hover:bg-purple-700"
            >
              Login
            </Link>
            <Link
              to="/auth/register"
              className="rounded-lg border border-border bg-card px-5 py-3 font-semibold transition-colors hover:bg-secondary"
            >
              Sign Up
            </Link>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-5">
            <HeartPulse className="mb-3 h-6 w-6 text-red-500" />
            <h2 className="mb-2 text-lg font-semibold">Realtime Monitoring</h2>
            <p className="text-sm text-muted-foreground">
              Track heart rate, HRV and motion with baseline calibration for each child.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <BarChart3 className="mb-3 h-6 w-6 text-blue-500" />
            <h2 className="mb-2 text-lg font-semibold">Engagement Analytics</h2>
            <p className="text-sm text-muted-foreground">
              View engagement trends, activity insights, daily summary and latest predictions.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <ShieldCheck className="mb-3 h-6 w-6 text-green-500" />
            <h2 className="mb-2 text-lg font-semibold">Safety Alerts</h2>
            <p className="text-sm text-muted-foreground">
              Get low engagement, high stress and abnormal heart rate alerts for timely intervention.
            </p>
          </div>
        </section>

        <section className="relative mt-16 overflow-hidden rounded-3xl border border-blue-200/40 bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 p-6 text-slate-100 shadow-2xl shadow-blue-900/30 md:p-10">
          <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-violet-400/20 blur-3xl" />

          <motion.div
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.6 }}
            className="relative z-10 mx-auto mb-10 max-w-3xl text-center"
          >
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
              <Sparkles className="h-3.5 w-3.5" />
              The Science Behind MindPulse
            </p>
            <h2 className="mb-3 text-3xl font-semibold tracking-tight md:text-5xl">
              The Science Behind MindPulse
            </h2>
            <p className="text-sm text-blue-100/90 md:text-lg">
              Understanding your child&apos;s emotions through real physiological signals.
            </p>
          </motion.div>

          <div className="relative z-10 mb-10 grid grid-cols-1 gap-4 md:grid-cols-3">
            {signalCards.map((card, index) => {
              const Icon = card.icon;
              return (
                <motion.article
                  key={card.title}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.35 }}
                  transition={{ duration: 0.45, delay: index * 0.1 }}
                  whileHover={{ y: -4, scale: 1.01 }}
                  className="group rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-md"
                >
                  <div className={`mb-4 inline-flex rounded-xl bg-gradient-to-br p-3 ${card.glowClass}`}>
                    <Icon className={`h-6 w-6 ${card.iconClass}`} />
                  </div>
                  <h3 className="mb-1 text-lg font-semibold text-white">{card.title}</h3>
                  <p className="text-sm text-blue-100/85">{card.description}</p>
                </motion.article>
              );
            })}
          </div>

          <div className="relative z-10 mb-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.55 }}
              className="rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-md"
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Signal Change Over Time</h3>
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-cyan-100">
                  Heart Rate vs HRV
                </span>
              </div>
              <p className="mb-4 text-sm text-blue-100/85">
                See how body signals change during different activities.
              </p>
              <div className="h-64 w-full rounded-xl bg-slate-950/40 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 8, right: 12, left: 0, bottom: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                    <XAxis dataKey="time" tick={{ fill: "#cbd5e1", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#cbd5e1", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: "rgba(15, 23, 42, 0.95)",
                        border: "1px solid rgba(148, 163, 184, 0.3)",
                        borderRadius: "12px",
                        color: "#e2e8f0",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="heartRate"
                      stroke="#fb7185"
                      strokeWidth={3}
                      dot={{ r: 3, fill: "#fb7185" }}
                      animationDuration={1200}
                      name="Heart Rate"
                    />
                    <Line
                      type="monotone"
                      dataKey="hrv"
                      stroke="#60a5fa"
                      strokeWidth={3}
                      dot={{ r: 3, fill: "#60a5fa" }}
                      animationDuration={1400}
                      name="HRV"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.55, delay: 0.08 }}
              className="rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-md"
            >
              <div className="mb-3 flex items-center gap-2">
                <Radar className="h-5 w-5 text-cyan-300" />
                <h3 className="text-lg font-semibold text-white">Emotion Mapping (Valence-Arousal)</h3>
              </div>
              <p className="mb-4 text-sm text-blue-100/85">
                MindPulse places your child&apos;s state in this model.
              </p>

              <div className="relative h-64 rounded-xl border border-white/15 bg-slate-950/45">
                <div className="absolute left-1/2 top-0 h-full w-px bg-white/20" />
                <div className="absolute left-0 top-1/2 h-px w-full bg-white/20" />

                <div className="absolute right-3 top-3 rounded-md bg-emerald-400/15 px-2 py-1 text-xs font-medium text-emerald-200">
                  Engaged 😊
                </div>
                <div className="absolute left-3 top-3 rounded-md bg-rose-400/15 px-2 py-1 text-xs font-medium text-rose-200">
                  Stressed 😰
                </div>
                <div className="absolute right-3 bottom-3 rounded-md bg-cyan-400/15 px-2 py-1 text-xs font-medium text-cyan-200">
                  Relaxed 😌
                </div>
                <div className="absolute left-3 bottom-3 rounded-md bg-amber-300/15 px-2 py-1 text-xs font-medium text-amber-200">
                  Bored 😴
                </div>

                <motion.div
                  initial={{ opacity: 0, scale: 0.7 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ delay: 0.2, duration: 0.4 }}
                  className="absolute left-[62%] top-[34%] h-4 w-4 rounded-full bg-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.9)]"
                />

                <p className="absolute left-2 top-1/2 -translate-y-1/2 -rotate-90 text-xs text-blue-100/80">
                  Arousal (Low to High)
                </p>
                <p className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-blue-100/80">
                  Valence (Negative to Positive)
                </p>
              </div>

              <div className="mt-4 grid gap-2 text-sm text-blue-100/90">
                <p className="rounded-lg bg-rose-400/10 px-3 py-2">High heart rate + low HRV = stress</p>
                <p className="rounded-lg bg-cyan-400/10 px-3 py-2">Moderate heart rate + high HRV = engagement</p>
                <p className="rounded-lg bg-emerald-400/10 px-3 py-2">Low heart rate + high HRV = relaxed</p>
              </div>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.5 }}
            className="relative z-10 mb-8 rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-md"
          >
            <h3 className="mb-4 text-lg font-semibold text-white">How MindPulse Works in 3 Simple Steps</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:items-stretch">
              {flowSteps.map((step, index) => (
                <div key={step.title} className="relative rounded-xl border border-white/15 bg-slate-900/40 p-4">
                  <div className="mb-2 text-sm font-semibold text-cyan-200">{index + 1}. {step.title}</div>
                  <p className="text-sm text-blue-100/85">{step.text}</p>
                  {index < flowSteps.length - 1 && (
                    <ArrowRight className="absolute -right-2 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-cyan-200 md:block" />
                  )}
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-blue-100/85">
              Motion is key: it helps us tell sports activity from stress.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.5 }}
            className="relative z-10 rounded-2xl border border-cyan-200/40 bg-gradient-to-r from-cyan-400/15 via-blue-400/10 to-violet-400/15 p-6 text-center"
          >
            <p className="mx-auto max-w-3xl text-base font-medium leading-relaxed text-white md:text-xl">
              MindPulse doesn&apos;t just track health - it understands how your child feels during every activity.
            </p>
            <p className="mt-2 text-xs uppercase tracking-[0.16em] text-cyan-100/80">
              Inspired by real wearable research and stress detection studies
            </p>
          </motion.div>
        </section>

        <footer className="mt-10 border-t border-border pt-6 text-center text-sm text-muted-foreground">
          Codebase: <a
            href="https://github.com/Atharvasayyyy/model_major-project"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-blue-600 underline-offset-4 hover:underline"
          >
            model_major-project
          </a>
        </footer>
      </div>
    </div>
  );
};