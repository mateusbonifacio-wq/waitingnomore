import Link from "next/link";
import { getSupabaseServerClient } from "../../lib/supabase/server";

export const metadata = {
  title: "Dashboard",
  description: "Keel leaderboards for Game Mode and Brain Mode."
};

const GAME_OPTIONS = [
  { id: "keep_alive", label: "Orbit (Keep alive)" },
  { id: "quick_pattern", label: "Quick pattern" },
  { id: "micro_memory", label: "Micro memory" },
  { id: "current", label: "Reaction targets" }
];

const MODE_OPTIONS = [
  { id: "chill", label: "Chill" },
  { id: "medium", label: "Medium" },
  { id: "intense", label: "Intense" }
];

const PERIOD_OPTIONS = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" }
];

function periodStart(period) {
  const now = Date.now();
  const span = period === "week" ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  return new Date(now - span).toISOString();
}

function parseQuery(searchParams) {
  const game = GAME_OPTIONS.some((g) => g.id === searchParams?.game) ? searchParams.game : "keep_alive";
  const gameMode = MODE_OPTIONS.some((m) => m.id === searchParams?.game_mode) ? searchParams.game_mode : "medium";
  const gamePeriod = PERIOD_OPTIONS.some((p) => p.id === searchParams?.game_period) ? searchParams.game_period : "day";
  const brainPeriod = PERIOD_OPTIONS.some((p) => p.id === searchParams?.brain_period) ? searchParams.brain_period : "day";
  return { game, gameMode, gamePeriod, brainPeriod };
}

function metricDisplay(label, value, unit) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (unit === "s") return `${label}: ${n.toFixed(1)}s`;
  return `${label}: ${Math.round(n)}`;
}

function resolveDisplayName(profile) {
  const displayName = typeof profile?.display_name === "string" ? profile.display_name.trim() : "";
  if (displayName) return displayName;
  const username = typeof profile?.username === "string" ? profile.username.trim() : "";
  if (username) return username;
  const emailPrefix = typeof profile?.email_prefix === "string" ? profile.email_prefix.trim() : "";
  if (emailPrefix) return emailPrefix;
  return "Anonymous";
}

function buildGameLeaderboard(rows, game, gameMode) {
  const bestByUser = new Map();
  for (const r of rows) {
    const d = r.data || {};
    const rowGame = d.game_type || d.game;
    const rowMode = d.mode || "medium";
    if (rowGame !== game) continue;
    if (rowMode !== gameMode) continue;
    const metricType = d.metric_type || d.metric_key;
    const metricValue = Number(d.metric_value);
    if (!metricType || !Number.isFinite(metricValue)) continue;
    const key = r.user_id;
    const current = bestByUser.get(key);
    if (!current || metricValue > current.metricValue) {
      bestByUser.set(key, {
        userId: r.user_id,
        metricType,
        metricLabel: d.metric_label || (metricType === "time_survived" ? "Time survived" : "Score"),
        metricUnit: d.metric_unit || (metricType === "time_survived" ? "s" : "pts"),
        metricValue
      });
    }
  }
  return [...bestByUser.values()].sort((a, b) => b.metricValue - a.metricValue).slice(0, 25);
}

function buildBrainLeaderboard(rows, period) {
  const minAnswers = period === "week" ? 20 : 10;
  const agg = new Map();
  for (const r of rows) {
    const d = r.data || {};
    const userId = r.user_id;
    const correct = d.correct === true;
    const item = agg.get(userId) || { userId, total: 0, correct: 0 };
    item.total += 1;
    if (correct) item.correct += 1;
    agg.set(userId, item);
  }
  return [...agg.values()]
    .filter((x) => x.total >= minAnswers)
    .map((x) => ({ ...x, accuracy: x.total ? (100 * x.correct) / x.total : 0 }))
    .sort((a, b) => {
      if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
      return b.total - a.total;
    })
    .slice(0, 25);
}

export default async function DashboardPage({ searchParams }) {
  const filters = parseQuery(searchParams || {});
  const minStartIso = periodStart("week");
  const gameStartIso = periodStart(filters.gamePeriod);
  const brainStartIso = periodStart(filters.brainPeriod);

  let user = null;
  let loadError = null;
  let rows = [];

  try {
    const supabase = getSupabaseServerClient();
    if (supabase) {
      const {
        data: { user: authUser }
      } = await supabase.auth.getUser();
      user = authUser;
      if (user) {
        const { data, error } = await supabase
          .from("events")
          .select("user_id,type,data,occurred_at")
          .in("type", ["game_played", "brain_answer"])
          .gte("occurred_at", minStartIso)
          .order("occurred_at", { ascending: false })
          .limit(5000);
        if (error) loadError = error.message;
        else rows = data || [];
      }
    }
  } catch (e) {
    loadError = String(e?.message || e);
  }

  const gameRows = rows.filter((r) => r.type === "game_played" && r.occurred_at >= gameStartIso);
  const brainRows = rows.filter((r) => r.type === "brain_answer" && r.occurred_at >= brainStartIso);
  const gameLeaderboard = buildGameLeaderboard(gameRows, filters.game, filters.gameMode);
  const brainLeaderboard = buildBrainLeaderboard(brainRows, filters.brainPeriod);
  const brainMinAnswers = filters.brainPeriod === "week" ? 20 : 10;
  const userIds = Array.from(
    new Set([...gameLeaderboard.map((x) => x.userId), ...brainLeaderboard.map((x) => x.userId)].filter(Boolean))
  );
  let profilesByUserId = {};
  if (user && userIds.length) {
    const supabase = getSupabaseServerClient();
    if (supabase) {
      const { data } = await supabase
        .from("profiles")
        .select("user_id,display_name,username,email_prefix")
        .in("user_id", userIds);
      for (const p of data || []) profilesByUserId[p.user_id] = p;
    }
  }

  return (
    <main className="page">
      <h1 className="page-title">Leaderboard</h1>
      <p className="page-sub">Separated, fair rankings for Game Mode and Brain Mode.</p>

      {!user ? (
        <p className="muted-note">
          <Link href="/login?next=/dashboard">Log in</Link> to view leaderboards.
        </p>
      ) : null}

      {loadError ? (
        <p className="muted-note" role="alert">
          Could not load leaderboard data: {loadError}
        </p>
      ) : null}

      {user && !loadError ? (
        <>
          <p className="section-title">Game mode leaderboard</p>
          <form method="get" className="settings-section" style={{ marginBottom: 12 }}>
            <div className="setting-row">
              <span className="setting-label">Game</span>
              <div className="setting-control">
                <select name="game" className="input" defaultValue={filters.game}>
                  {GAME_OPTIONS.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="setting-row">
              <span className="setting-label">Mode</span>
              <div className="setting-control">
                <select name="game_mode" className="input" defaultValue={filters.gameMode}>
                  {MODE_OPTIONS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="setting-row">
              <span className="setting-label">Time</span>
              <div className="setting-control">
                <select name="game_period" className="input" defaultValue={filters.gamePeriod}>
                  {PERIOD_OPTIONS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <input type="hidden" name="brain_period" value={filters.brainPeriod} />
            <button type="submit" className="btn btn-ghost">
              Apply game filters
            </button>
          </form>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>User</th>
                  <th>Best performance</th>
                </tr>
              </thead>
              <tbody>
                {gameLeaderboard.map((row, idx) => (
                  <tr key={`${row.userId}-${idx}`}>
                    <td>#{idx + 1}</td>
                    <td>{resolveDisplayName(profilesByUserId[row.userId])}</td>
                    <td>{metricDisplay(row.metricLabel, row.metricValue, row.metricUnit)}</td>
                  </tr>
                ))}
                {!gameLeaderboard.length ? (
                  <tr>
                    <td colSpan={3} className="muted-note" style={{ textAlign: "center" }}>
                      No qualifying sessions for this game + mode + period.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <p className="section-title">Brain mode leaderboard</p>
          <form method="get" className="settings-section" style={{ marginBottom: 12 }}>
            <div className="setting-row">
              <span className="setting-label">Time</span>
              <div className="setting-control">
                <select name="brain_period" className="input" defaultValue={filters.brainPeriod}>
                  {PERIOD_OPTIONS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <input type="hidden" name="game" value={filters.game} />
            <input type="hidden" name="game_mode" value={filters.gameMode} />
            <input type="hidden" name="game_period" value={filters.gamePeriod} />
            <button type="submit" className="btn btn-ghost">
              Apply brain filter
            </button>
          </form>

          <p className="muted-note" style={{ marginTop: 0 }}>
            Qualification: minimum {brainMinAnswers} answers ({filters.brainPeriod === "week" ? "week" : "day"}).
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>User</th>
                  <th>Accuracy</th>
                  <th>Total answers</th>
                </tr>
              </thead>
              <tbody>
                {brainLeaderboard.map((row, idx) => (
                  <tr key={`${row.userId}-${idx}`}>
                    <td>#{idx + 1}</td>
                    <td>{resolveDisplayName(profilesByUserId[row.userId])}</td>
                    <td>{row.accuracy.toFixed(1)}%</td>
                    <td>{row.total}</td>
                  </tr>
                ))}
                {!brainLeaderboard.length ? (
                  <tr>
                    <td colSpan={4} className="muted-note" style={{ textAlign: "center" }}>
                      No qualified users yet for this period.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </main>
  );
}
