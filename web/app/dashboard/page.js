import StatCard from "../../components/StatCard";
import { computeAggregates, mockSessions } from "../../lib/mockSessions";

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

export default function DashboardPage() {
  const stats = computeAggregates(mockSessions);
  const recent = [...mockSessions].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 8);

  return (
    <main className="page">
      <h1 className="page-title">Dashboard</h1>
      <p className="page-sub">
        Overview of idle-time sessions (mock data for now — syncs with your extension after backend wiring).
      </p>

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
                <td>{s.durationSeconds.toFixed(1)}s</td>
                <td>{formatHps(s.hitsPerSecond)}</td>
                <td className={s.generationEndedSuccessfully ? "badge-ok" : "badge-warn"}>
                  {s.generationEndedSuccessfully ? "Yes" : "No"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
