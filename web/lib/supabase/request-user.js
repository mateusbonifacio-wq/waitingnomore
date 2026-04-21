import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env";

/**
 * Resolve the signed-in user from a Route Handler request:
 * - Prefer `Authorization: Bearer <jwt>` (Chrome extension → Keel API).
 * - Else use Supabase cookie session (web app).
 *
 * @param {Request} request
 * @returns {Promise<{ user: import("@supabase/supabase-js").User | null, error?: string }>}
 */
export async function getAuthenticatedUser(request) {
  const env = getSupabaseEnv();
  if (!env) {
    return { user: null, error: "supabase_not_configured" };
  }

  const authHeader = request.headers.get("authorization") || "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";

  if (bearer) {
    const supabase = createClient(env.url, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } }
    });
    const {
      data: { user },
      error
    } = await supabase.auth.getUser();
    if (error) return { user: null, error: error.message };
    return { user: user || null };
  }

  const cookieStore = cookies();
  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        /* Route handlers may be read-only for cookies; middleware refreshes session. */
      }
    }
  });
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();
  if (error) return { user: null, error: error.message };
  return { user: user || null };
}
