import Link from "next/link";
import StatCard from "../../components/StatCard";
import { getSupabaseServerClient } from "../../lib/supabase/server";

export const metadata = {
  title: "Dashboard",
  description: "Keel — game and brain activity synced from the extension."
};

const GAME_LABELS = {
  current: "Reaction targets",
  keep_alive: "Keep alive",
  quick_pattern: "Quick pattern",
  micro_memory: "Micro memory"
};

const TOPIC_LABELS = {
  general_knowledge: "General knowledge",
  pop_culture: "Pop culture",
  science: "Science",
  geography: "Geography",
  logic: "Logic & riddles",
  fun_random: "Fun & random"
};

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

function labelGame(id) {
  return GAME_LABELS[id] || id;
}

function labelTopic(id) {
  return TOPIC_LABELS[id] || id;
}

function aggregateEvents(rows) {
  const gameRows = [];
  const brainRows = [];
  for (const r of rows) {
    if (r.type === "game_played") gameRows.push(r);
    else if (r.type === "brain_answer") brainRows.push(r);
  }

  const gameScores = gameRows.map((r) => Number(r.data?.score)).filter((n) => Number.isFinite(n));
  const totalGames = gameRows.length;
  const bestScore = gameScores.length ? Math.max(...gameScores) : 0;
  const recentGames = gameRows.slice(0, 12).map((r) => ({
    id: r.id,
    occurredAt: r.occurred_at,
    game: r.data?.game,
    score: Number(r.data?.score) || 0
  }));

  let brainCorrect = 0;
  const byTopic = {};
  for (const r of brainRows) {
    const topic = typeof r.data?.topic === "string" ? r.data.topic : "unknown";
    const correct = r.data?.correct === true;
    if (correct) brainCorrect += 1;
    if (!byTopic[topic]) byTopic[topic] = { answered: 0, correct: 0 };
    byTopic[topic].answered += 1;
    if (correct) byTopic[topic].correct += 1;
  }
  const totalBrain = brainRows.length;
  const brainAccuracyPct = totalBrain ? Math.round((100 * brainCorrect) / totalBrain) : null;

  const topicStats = Object.entries(byTopic)
    .map(([topic, v]) => ({
      topic,
      answered: v.answered,
      correct: v.correct,
      pct: v.answered ? Math.round((100 * v.correct) / v.answered) : 0
    }))
    .sort((a, b) => b.answered - a.answered);

  return {
    totalGames,
    bestScore,
    recentGames,
    totalBrain,
    brainAccuracyPct,
    topicStats
  };
}

export default async function DashboardPage() {
  let user = null;
  let events = [];
  let loadError = null;

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
          .select("id,type,data,occurred_at")
          .eq("user_id", user.id)
          .in("type", ["game_played", "brain_answer"])
          .order("occurred_at", { ascending: false })
          .limit(800);

        if (error) loadError = error.message;
        else events = data || [];
      }
    }
  } catch (e) {
    loadError = String(e?.message || e);
    events = [];
  }

  const stats = aggregateEvents(events);

  return (
    <main className="page">
      <h1 className="page-title">Dashboard</h1>
      <p className="page-sub">
        Game and brain activity from the Keel extension. Open this site while signed in so the extension can sync
        events to your account.
      </p>

      {!user ? (
        <p className="muted-note">
          <Link href="/login?next=/dashboard">Log in</Link> to see your activity.
        </p>
      ) : null}

      {loadError ? (
        <p className="muted-note" role="alert">
          Could not load events: {loadError}. If you just added the table, run the latest SQL from{" "}
          <code>web/supabase/schema.sql</code> in the Supabase SQL editor.
        </p>
      ) : null}

      {user ? (
        <>
          <p className="section-title">Game mode</p>
          <div className="stats-grid">
            <StatCard label="Games played" value={String(stats.totalGames)} hint="Finished play sessions (per reply)" />
            <StatCard label="Best score" value={String(stats.bestScore)} hint="Highest hit count in one session" />
            <StatCard
              label="Tracked events"
              value={String(events.length)}
              hint="Game + brain rows loaded (cap 800)"
            />
          </div>

          <p className="section-title">Recent games</p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Game</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentGames.map((g) => (
                  <tr key={g.id}>
                    <td>{formatDate(g.occurredAt)}</td>
                    <td>{labelGame(g.game)}</td>
                    <td>{g.score}</td>
                  </tr>
                ))}
                {!stats.recentGames.length ? (
                  <tr>
                    <td colSpan={3} className="muted-note" style={{ textAlign: "center" }}>
                      No games yet. Use Play mode on ChatGPT with Keel while logged in here in another tab (same
                      browser) so the extension receives your session.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <p className="section-title">Brain mode</p>
          <div className="stats-grid">
            <StatCard label="Questions answered" value={String(stats.totalBrain)} hint="All brain answers recorded" />
            <StatCard
              label="Accuracy"
              value={stats.brainAccuracyPct != null ? `${stats.brainAccuracyPct}%` : "—"}
              hint={stats.totalBrain ? "Correct ÷ total" : "No brain data yet"}
            />
          </div>

          <p className="section-title">Activity by topic</p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Answered</th>
                  <th>Correct</th>
                  <th>Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {stats.topicStats.map((t) => (
                  <tr key={t.topic}>
                    <td>{labelTopic(t.topic)}</td>
                    <td>{t.answered}</td>
                    <td>{t.correct}</td>
                    <td>{t.answered ? `${t.pct}%` : "—"}</td>
                  </tr>
                ))}
                {!stats.topicStats.length ? (
                  <tr>
                    <td colSpan={4} className="muted-note" style={{ textAlign: "center" }}>
                      No brain answers yet.
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
