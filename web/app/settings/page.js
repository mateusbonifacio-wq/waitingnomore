import Link from "next/link";
import SettingsForm from "../../components/SettingsForm";
import { getSupabaseServerClient } from "../../lib/supabase/server";

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
          "overlay_while_generating,default_session_mode,show_session_summary,play_intensity,trigger_when,smart_trigger_min_generation_sec,theme_mode"
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
          themeMode: data.theme_mode
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
      <p className="page-sub">
        Calm controls for how Keel behaves on ChatGPT. When you are signed in, these sync to your account.
      </p>
      {!user ? (
        <p className="muted-note">
          You are using local browser settings only.{" "}
          <Link href="/login?next=/settings">
            Login
          </Link>{" "}
          to save settings per account.
        </p>
      ) : null}
      <SettingsForm isAuthenticated={Boolean(user)} initialCloudSettings={initialCloudSettings} />
    </main>
  );
}
