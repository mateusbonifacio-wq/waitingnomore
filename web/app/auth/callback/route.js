import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase/server";

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = requestUrl.searchParams.get("next") || "/settings";

  if (code) {
    const supabase = getSupabaseServerClient();
    if (supabase) {
      await supabase.auth.exchangeCodeForSession(code);
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("profiles").upsert(
          {
            user_id: user.id,
            display_name: user.email ? user.email.split("@")[0] : null
          },
          { onConflict: "user_id" }
        );
      }
    }
  }

  const redirectUrl = new URL(nextPath, requestUrl.origin);
  return NextResponse.redirect(redirectUrl);
}
