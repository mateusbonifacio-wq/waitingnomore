import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "../../../lib/supabase/route-client";

export async function POST(request) {
  const requestUrl = new URL(request.url);
  const loginUrl = new URL("/login", requestUrl.origin);
  let response = NextResponse.redirect(loginUrl);

  const supabase = createSupabaseRouteHandlerClient(request, response);
  if (supabase) {
    await supabase.auth.signOut();
  }

  return response;
}
