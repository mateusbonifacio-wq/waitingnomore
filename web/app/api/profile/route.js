import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase/server";

async function getUserOr401(supabase) {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  return { user };
}

function normalizeName(v, max = 50) {
  if (typeof v !== "string") return null;
  const trimmed = v.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  }
  const { user, response } = await getUserOr401(supabase);
  if (!user) return response;

  const { data, error } = await supabase
    .from("profiles")
    .select("display_name,username,email_prefix")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, profile: data || null });
}

export async function PUT(request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  }
  const { user, response } = await getUserOr401(supabase);
  if (!user) return response;

  const body = await request.json().catch(() => ({}));
  const displayName = normalizeName(body?.displayName, 50);
  const username = normalizeName(body?.username, 32);

  const { data: existing } = await supabase.from("profiles").select("email_prefix").eq("user_id", user.id).maybeSingle();
  const emailPrefix = existing?.email_prefix || (user.email ? user.email.split("@")[0] : null);

  const payload = {
    user_id: user.id,
    display_name: displayName,
    username,
    email_prefix: emailPrefix
  };

  const { data, error } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select("display_name,username,email_prefix")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, profile: data });
}
