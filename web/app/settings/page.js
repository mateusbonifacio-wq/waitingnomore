import SettingsForm from "../../components/SettingsForm";
import { getSupabaseServerClient } from "../../lib/supabase/server";
import { normalizeEnabledGamesList, normalizeEnabledTopicsList } from "../../lib/extensionSettings";
import Link from "next/link";

export const metadata = {
  title: "Settings",
  description: "Keel preferences — overlay, rhythm, and appearance for ChatGPT."
};

export default async function SettingsPage() {
  let user = null;
  let initialCloudSettings = null;
  let initialProfile = null;

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
            "overlay_while_generating,default_session_mode,show_session_summary,play_intensity,trigger_when,smart_trigger_min_generation_sec,theme_mode,enabled_games,enabled_topics,focus_mode_enabled"
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
            enabledTopics: normalizeEnabledTopicsList(data.enabled_topics),
            focusModeEnabled: data.focus_mode_enabled !== false
          };
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name,username,email_prefix")
          .eq("user_id", user.id)
          .maybeSingle();
        initialProfile = profile || null;
      }
    }
  } catch {
    user = null;
  }

  return (
    <main className="page">
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Keel on ChatGPT — account, overlay behavior, and micro-games.</p>
      <p className="muted-note">
        Privacy details: <Link href="/privacy">Privacy Policy</Link>
      </p>
      <SettingsForm
        isAuthenticated={Boolean(user)}
        userEmail={user?.email || ""}
        initialCloudSettings={initialCloudSettings}
        initialProfile={initialProfile}
      />
    </main>
  );
}
