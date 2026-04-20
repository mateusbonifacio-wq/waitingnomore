import Link from "next/link";
import StatCard from "../../components/StatCard";
import { getSupabaseServerClient } from "../../lib/supabase/server";

export const metadata = {
  title: "Dashboard",
  description: "Session stats and recent activity from your idle-time micro-interactions."
};

function formatHps(n) {
  return Number.isFinite(n) ? n.toFixed(2) : "—";
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    });
  } catch {
    return iso;
  }
}

function modeBadgeClass(mode) {
  if (mode === "play") return "badge badge-play";
  if (mode === "brain") return "badge badge-brain";
  return "badge badge-focus";
}

function computeAggregates(sessions) {
  const totalSessions = sessions.length;
  const totalHits = sessions.reduce((acc, s) => acc + (Number(s.totalHits) || 0), 0);
  const hps = sessions.map((s) => Number(s.hitsPerSecond) || 0).filter((n) => Number.isFinite(n));
  const averageHitsPerSecond = hps.length ? hps.reduce((a, b) => a + b, 0) / hps.length : 0;
  const bestHitsPerSecond = hps.length ? Math.max(...hps) : 0;
  return { totalSessions, totalHits, averageHitsPerSecond, bestHitsPerSecond };
}

export default async function DashboardPage() {
  let user = null;
  let sessions = [];
  try {
    const supabase = getSupabaseServerClient();
    const {
      data: { user: authUser }
    } = await supabase.auth.getUser();
    user = authUser;

    if (user) {
      const { data } = await supabase
        .from("idle_sessions")
        .select("id,timestamp,mode,total_hits,duration_seconds,hits_per_second,generation_ended_successfully")
        .eq("user_id", user.id)
        .order("timestamp", { ascending: false })
        .limit(50);
      sessions = (data || []).map((row) => ({
        id: row.id,
        timestamp: row.timestamp,
        mode: row.mode,
        totalHits: row.total_hits,
        durationSeconds: row.duration_seconds,
        hitsPerSecond: row.hits_per_second,
        generationEndedSuccessfully: row.generation_ended_successfully
      }));
    }
  } catch {
    sessions = [];
  }
  const stats = computeAggregates(sessions);
  const recent = sessions.slice(0, 8);

  return (
    <main className="page">
      <h1 className="page-title">Dashboard</h1>
      <p className="page-sub">
        Overview of synced session stats for your account.
      </p>
      {!user ? (
        <p className="muted-note">
          <Link href="/login?next=/dashboard">Login</Link> to see your synced session data.
        </p>
      ) : null}

      <div className="stats-grid">
        <StatCard label="Total sessions" value={String(stats.totalSessions)} />
        <StatCard label="Total hits" value={String(stats.totalHits)} hint="Across all recorded sessions" />
        <StatCard label="Avg hits / sec" value={formatHps(stats.averageHitsPerSecond)} hint="Mean of per-session rate" />
        <StatCard label="Best hits / sec" value={formatHps(stats.bestHitsPerSecond)} hint="Top session so far" />
      </div>

      <p className="section-title">Recent sessions</p>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Mode</th>
              <th>Hits</th>
              <th>Duration</th>
              <th>H/s</th>
              <th>Ended OK</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((s) => (
              <tr key={s.id}>
                <td>{formatDate(s.timestamp)}</td>
                <td>
                  <span className={modeBadgeClass(s.mode)}>{s.mode}</span>
                </td>
                <td>{s.totalHits}</td>
                <td>{Number(s.durationSeconds || 0).toFixed(1)}s</td>
                <td>{formatHps(s.hitsPerSecond)}</td>
                <td className={s.generationEndedSuccessfully ? "badge-ok" : "badge-warn"}>
                  {s.generationEndedSuccessfully ? "Yes" : "No"}
                </td>
              </tr>
            ))}
            {!recent.length ? (
              <tr>
                <td colSpan={6} className="muted-note" style={{ textAlign: "center" }}>
                  No synced sessions yet. Install the extension and enable upload in a later step.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
