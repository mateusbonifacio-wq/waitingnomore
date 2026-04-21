import { NextResponse } from "next/server";
import {
  defaultExtensionSettings,
  normalizeEnabledGamesList,
  normalizeEnabledTopicsList
} from "../../../lib/extensionSettings";
import { getSupabaseServerClient } from "../../../lib/supabase/server";

const SETTINGS_COLUMNS =
  "overlay_while_generating,default_session_mode,show_session_summary,play_intensity,trigger_when,smart_trigger_min_generation_sec,theme_mode,enabled_games,enabled_topics,focus_mode_enabled,updated_at";

function mapDbToSettings(row) {
  if (!row) return { ...defaultExtensionSettings };
  return {
    schemaVersion: 1,
    overlayWhileGenerating: row.overlay_while_generating,
    defaultSessionMode: row.default_session_mode,
    showSessionSummary: row.show_session_summary,
    playIntensity: row.play_intensity,
    triggerWhen: row.trigger_when,
    smartTriggerMinGenerationSec: row.smart_trigger_min_generation_sec,
    themeMode: row.theme_mode,
    enabledGames: normalizeEnabledGamesList(row.enabled_games),
    enabledTopics: normalizeEnabledTopicsList(row.enabled_topics),
    focusModeEnabled: row.focus_mode_enabled !== false
  };
}

function mapBodyToDb(payload) {
  return {
    overlay_while_generating: payload.overlayWhileGenerating,
    default_session_mode: payload.defaultSessionMode,
    show_session_summary: payload.showSessionSummary,
    play_intensity: payload.playIntensity,
    trigger_when: payload.triggerWhen,
    smart_trigger_min_generation_sec: payload.smartTriggerMinGenerationSec,
    theme_mode: payload.themeMode,
    enabled_games: normalizeEnabledGamesList(payload.enabledGames),
    enabled_topics: normalizeEnabledTopicsList(payload.enabledTopics),
    focus_mode_enabled: payload.focusModeEnabled !== false
  };
}

async function getUserOr401(supabase) {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  return { user };
}

export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  }
  const { user, response } = await getUserOr401(supabase);
  if (!user) return response;

  const { data, error } = await supabase.from("user_settings").select(SETTINGS_COLUMNS).eq("user_id", user.id).maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, settings: mapDbToSettings(data), updatedAt: data?.updated_at || null });
}

export async function PUT(request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  }
  const { user, response } = await getUserOr401(supabase);
  if (!user) return response;

  const payload = await request.json();
  const dbPayload = mapBodyToDb(payload);
  const { data, error } = await supabase
    .from("user_settings")
    .upsert({ user_id: user.id, ...dbPayload }, { onConflict: "user_id" })
    .select(SETTINGS_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, settings: mapDbToSettings(data), updatedAt: data.updated_at });
}
