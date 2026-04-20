import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page">
      <section className="hero">
        <span className="hero-badge">Chrome extension + web</span>
        <h1>Turn AI waiting time into fast micro-interactions</h1>
        <p className="hero-lead">
          While ChatGPT generates, Waiting No More keeps you engaged with quick play, brain teasers, and focus prompts
          — then summarizes each session so you can track momentum over time.
        </p>
        <div className="cta-row">
          <Link href="/install" className="btn btn-primary">
            Install extension
          </Link>
          <Link href="/dashboard" className="btn btn-primary">
            Open dashboard
          </Link>
          <Link href="/settings" className="btn btn-ghost">
            Control panel
          </Link>
        </div>

        <div className="feature-grid">
          <div className="feature-card">
            <h3>Automatic sessions</h3>
            <p>The overlay appears when generation starts and wraps up with a short score summary when it ends.</p>
          </div>
          <div className="feature-card">
            <h3>Fair scoring</h3>
            <p>Hits per second normalizes performance across short and long replies.</p>
          </div>
          <div className="feature-card">
            <h3>Built for later sync</h3>
            <p>Local history today; connect this dashboard to your data when you are ready.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
