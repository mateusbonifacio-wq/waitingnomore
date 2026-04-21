import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { getSupabaseEnv } from "./lib/supabase/env";

/**
 * Refreshes the Supabase auth session on each matched request so Server Components
 * and API routes keep a valid JWT (cookie-based persistence).
 */
export async function middleware(request) {
  const env = getSupabaseEnv();
  if (!env) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers
    }
  });

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set({ name, value, ...options });
        });
        supabaseResponse = NextResponse.next({
          request: {
            headers: request.headers
          }
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
        if (headers && typeof headers === "object") {
          Object.entries(headers).forEach(([key, value]) => {
            if (typeof value === "string") supabaseResponse.headers.set(key, value);
          });
        }
      }
    }
  });

  await supabase.auth.getUser();
  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
