export const metadata = {
  title: "Privacy Policy",
  description: "Keel privacy policy for Chrome extension and web app."
};

export default function PrivacyPage() {
  return (
    <main className="page">
      <h1 className="page-title">Privacy Policy</h1>
      <p className="page-sub">Last updated: 2026-04-25</p>

      <section className="settings-section">
        <h2 className="section-title">What Keel collects</h2>
        <p className="muted-note">
          Keel collects limited product and analytics data required to run the extension and leaderboards.
        </p>
        <ul className="muted-note">
          <li>Account data: email-based account/session from Supabase authentication.</li>
          <li>Profile/settings data: display name, username, extension preferences.</li>
          <li>
            Gameplay analytics events: <code>game_played</code> and <code>brain_answer</code> with game/topic metrics,
            timestamps, and your user ID.
          </li>
          <li>
            Extension install/connect pings used to confirm extension setup (including extension version and browser
            user-agent).
          </li>
        </ul>
      </section>

      <section className="settings-section">
        <h2 className="section-title">What Keel does not collect</h2>
        <ul className="muted-note">
          <li>Keel does not collect AI prompts or AI responses for analytics storage.</li>
          <li>Keel does not transmit full page URLs for analytics.</li>
          <li>Keel does not collect full browsing history.</li>
          <li>Keel does not capture screenshots.</li>
          <li>Keel does not log keystrokes as user typing telemetry.</li>
          <li>Keel does not sell personal data.</li>
          <li>Keel does not use data for personalized advertising.</li>
        </ul>
      </section>

      <section className="settings-section">
        <h2 className="section-title">Why data is collected</h2>
        <ul className="muted-note">
          <li>To authenticate users and sync settings between web app and extension.</li>
          <li>To power Game and Brain mode leaderboards.</li>
          <li>To monitor reliability and debug event delivery issues.</li>
        </ul>
      </section>

      <section className="settings-section">
        <h2 className="section-title">Where data is stored and processed</h2>
        <ul className="muted-note">
          <li>
            <strong>Supabase</strong> is used for authentication and database storage.
          </li>
          <li>
            <strong>Vercel</strong> is used to host the web application and API routes.
          </li>
          <li>Some extension preferences and short-lived queues are stored locally in Chrome storage.</li>
        </ul>
      </section>

      <section className="settings-section">
        <h2 className="section-title">Contact</h2>
        <p className="muted-note">
          For privacy questions, contact the Keel project maintainer via the support channel listed in the Chrome Web
          Store listing.
        </p>
      </section>
    </main>
  );
}
