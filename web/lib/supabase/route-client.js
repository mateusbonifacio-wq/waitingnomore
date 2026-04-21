import { createServerClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";

/**
 * Supabase client for Route Handlers: session writes must land on the same
 * {@link import('next/server').NextResponse} you return (PKCE / sign-out).
 *
 * @param {Request} request
 * @param {import('next/server').NextResponse} response
 */
export function createSupabaseRouteHandlerClient(request, response) {
  const env = getSupabaseEnv();
  if (!env) return null;

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        if (headers && typeof headers === "object") {
          Object.entries(headers).forEach(([key, value]) => {
            if (typeof value === "string") response.headers.set(key, value);
          });
        }
      }
    }
  });
}
