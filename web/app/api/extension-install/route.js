import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase/server";

async function getUserOr401(supabase) {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  return { user };
}

export async function POST(request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  }
  const { user, response } = await getUserOr401(supabase);
  if (!user) return response;

  const body = await request.json().catch(() => ({}));
  const source = typeof body?.source === "string" ? body.source : "web";
  const extensionDetected = body?.extensionDetected === true;
  const extensionVersion = typeof body?.extensionVersion === "string" ? body.extensionVersion : null;
  const userAgent = request.headers.get("user-agent") || null;

  const { data, error } = await supabase
    .from("extension_installs")
    .insert({
      user_id: user.id,
      install_source: source,
      extension_detected: extensionDetected,
      extension_version: extensionVersion,
      browser_user_agent: userAgent,
      last_seen_at: new Date().toISOString()
    })
    .select("id, created_at")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, installId: data.id, createdAt: data.created_at });
}
