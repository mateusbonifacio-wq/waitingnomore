import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "../../../lib/supabase/env";
import { getAuthenticatedUser } from "../../../lib/supabase/request-user";

const GAME_IDS = new Set(["current", "keep_alive", "quick_pattern", "micro_memory"]);
const MAX_BATCH = 40;

/**
 * @param {string} type
 * @param {unknown} data
 * @returns {boolean}
 */
function isValidEventPayload(type, data) {
  if (!data || typeof data !== "object") return false;
  if (type === "game_played") {
    const game = data.game;
    const mode = typeof data.mode === "string" ? data.mode.trim() : "";
    const metricType = typeof data.metric_type === "string" ? data.metric_type.trim() : "";
    const metricKey = typeof data.metric_key === "string" ? data.metric_key.trim() : "";
    const metricLabel = typeof data.metric_label === "string" ? data.metric_label.trim() : "";
    const metricUnit = typeof data.metric_unit === "string" ? data.metric_unit.trim() : "";
    const metricValue = Number(data.metric_value);
    if (typeof game !== "string" || !GAME_IDS.has(game)) return false;
    if (!["chill", "medium", "intense"].includes(mode)) return false;
    if (!metricType || metricType.length > 48) return false;
    if (!metricKey || metricKey.length > 48) return false;
    if (!metricLabel || metricLabel.length > 64) return false;
    if (metricUnit.length > 16) return false;
    if (!Number.isFinite(metricValue) || metricValue < 0 || metricValue > 500000) return false;
    if (game === "keep_alive" && (metricType !== "time_survived" || metricKey !== "time_survived")) return false;
    if (game !== "keep_alive" && (metricType !== "score" || metricKey !== "score")) return false;
    return true;
  }
  if (type === "brain_answer") {
    if (typeof data.topic !== "string" || !data.topic.trim()) return false;
    if (data.topic.length > 96) return false;
    if (typeof data.correct !== "boolean") return false;
    return true;
  }
  return false;
}

export async function POST(request) {
  const env = getSupabaseEnv();
  if (!env) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  }

  const { user, error: authErr } = await getAuthenticatedUser(request);
  if (!user) {
    console.warn("[api/events] unauthorized request", { authErr });
    return NextResponse.json(
      { ok: false, error: authErr === "supabase_not_configured" ? authErr : "unauthorized" },
      { status: authErr === "supabase_not_configured" ? 503 : 401 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const rawEvents = Array.isArray(body?.events) ? body.events : null;
  if (!rawEvents || rawEvents.length === 0) {
    return NextResponse.json({ ok: false, error: "events_required" }, { status: 400 });
  }
  if (rawEvents.length > MAX_BATCH) {
    return NextResponse.json({ ok: false, error: "batch_too_large" }, { status: 400 });
  }

  const rows = [];
  for (const ev of rawEvents) {
    const type = ev?.type;
    const data = ev?.data;
    if (type !== "game_played" && type !== "brain_answer") {
      return NextResponse.json({ ok: false, error: "invalid_type" }, { status: 400 });
    }
    if (!isValidEventPayload(type, data)) {
      return NextResponse.json({ ok: false, error: "invalid_payload", type }, { status: 400 });
    }
    let occurredAt = typeof ev?.occurred_at === "string" ? ev.occurred_at : null;
    if (occurredAt) {
      const t = Date.parse(occurredAt);
      if (!Number.isFinite(t)) occurredAt = null;
    }
    rows.push({
      user_id: user.id,
      type,
      data,
      occurred_at: occurredAt || new Date().toISOString()
    });
  }

  const authHeader = request.headers.get("authorization") || "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";

  let supabase;
  if (bearer) {
    supabase = createClient(env.url, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } }
    });
  } else {
    const cookieStore = cookies();
    supabase = createServerClient(env.url, env.anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          /* Session refresh handled by middleware. */
        }
      }
    });
  }

  const { error } = await supabase.from("events").insert(rows);
  if (error) {
    console.error("[api/events] insert failed", { message: error.message, rows: rows.length, userId: user.id });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  console.info("[api/events] inserted", { rows: rows.length, userId: user.id });
  return NextResponse.json({ ok: true, inserted: rows.length });
}
