import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase/server";

export async function POST(request) {
  const supabase = getSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  const url = new URL("/login", request.url);
  return NextResponse.redirect(url);
}
