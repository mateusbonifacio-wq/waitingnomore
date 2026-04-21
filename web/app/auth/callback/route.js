import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "../../../lib/supabase/route-client";

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = requestUrl.searchParams.get("next") || "/settings";
  const redirectUrl = new URL(nextPath, requestUrl.origin);

  /** Redirect target must receive Set-Cookie from PKCE exchange on this same response. */
  let response = NextResponse.redirect(redirectUrl);
  const supabase = createSupabaseRouteHandlerClient(request, response);
  if (!supabase) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const login = new URL("/login", requestUrl.origin);
      login.searchParams.set("error", "auth_callback");
      return NextResponse.redirect(login);
    }
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

  return response;
}
