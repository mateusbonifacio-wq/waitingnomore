import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page">
      <section className="hero">
        <span className="hero-badge">Before you drift.</span>
        <h1>Keel</h1>
        <p className="hero-lead">
          Keel is what keeps you steady when you start to drift. A quiet overlay on ChatGPT — structured moments while
          a reply generates, then a composed recap when it stops.
        </p>
        <div className="cta-row">
          <Link href="/install" className="btn btn-primary">
            Install
          </Link>
          <Link href="/dashboard" className="btn btn-ghost">
            Dashboard
          </Link>
          <Link href="/settings" className="btn btn-ghost">
            Settings
          </Link>
        </div>

        <div className="feature-grid">
          <div className="feature-card">
            <h3>Steady presence</h3>
            <p>Surfaces only when generation runs, so attention stays where it belongs.</p>
          </div>
          <div className="feature-card">
            <h3>Clear closure</h3>
            <p>Each run ends with a concise summary — signal without noise.</p>
          </div>
          <div className="feature-card">
            <h3>Your account</h3>
            <p>Sign in to keep preferences and history aligned across devices.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
