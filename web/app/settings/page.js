import Link from "next/link";
import SettingsForm from "../../components/SettingsForm";
import { getSupabaseServerClient } from "../../lib/supabase/server";
import { normalizeEnabledGamesList, normalizeEnabledTopicsList } from "../../lib/extensionSettings";

export const metadata = {
  title: "Settings",
  description: "Keel preferences — overlay, rhythm, and appearance for ChatGPT."
};

export default async function SettingsPage() {
  let user = null;
  let initialCloudSettings = null;

  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      user = null;
    } else {
      const {
        data: { user: authUser }
      } = await supabase.auth.getUser();
      user = authUser;

      if (user) {
        const { data } = await supabase
          .from("user_settings")
          .select(
            "overlay_while_generating,default_session_mode,show_session_summary,play_intensity,trigger_when,smart_trigger_min_generation_sec,theme_mode,enabled_games,enabled_topics"
          )
          .eq("user_id", user.id)
          .maybeSingle();

        if (data) {
          initialCloudSettings = {
            schemaVersion: 1,
            overlayWhileGenerating: data.overlay_while_generating,
            defaultSessionMode: data.default_session_mode,
            showSessionSummary: data.show_session_summary,
            playIntensity: data.play_intensity,
            triggerWhen: data.trigger_when,
            smartTriggerMinGenerationSec: data.smart_trigger_min_generation_sec,
            themeMode: data.theme_mode,
            enabledGames: normalizeEnabledGamesList(data.enabled_games),
            enabledTopics: normalizeEnabledTopicsList(data.enabled_topics)
          };
        }
      }
    }
  } catch {
    user = null;
  }

  return (
    <main className="page">
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Keel on ChatGPT — account, overlay behavior, and micro-games.</p>

      <section className="settings-section settings-section--general" aria-labelledby="settings-general">
        <h2 id="settings-general" className="settings-category-title">
          General
        </h2>
        <p className="section-lead">Who you are on this site and how sign-in relates to the controls below.</p>
        {user ? (
          <div className="settings-account-block">
            <p className="settings-account-line">
              Signed in as <strong className="settings-account-email">{user.email}</strong>
            </p>
            <form action="/auth/signout" method="post" className="settings-account-actions">
              <button type="submit" className="btn btn-ghost">
                Log out
              </button>
            </form>
            <p className="muted-note settings-account-hint">
              Extension preferences below are saved to your account when you change them (and still mirrored in this
              browser&apos;s localStorage for the extension).
            </p>
          </div>
        ) : (
          <div className="settings-account-block">
            <p className="settings-account-line">
              You are not signed in. Preferences below apply in this browser only until you{" "}
              <Link href="/login?next=/settings" prefetch={false}>
                sign in
              </Link>
              .
            </p>
          </div>
        )}
      </section>

      <SettingsForm isAuthenticated={Boolean(user)} initialCloudSettings={initialCloudSettings} />
    </main>
  );
}
