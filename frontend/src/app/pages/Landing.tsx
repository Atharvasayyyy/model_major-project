import { Link } from "react-router";
import { Activity, HeartPulse, ShieldCheck, BarChart3 } from "lucide-react";

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
      </div>
    </div>
  );
};