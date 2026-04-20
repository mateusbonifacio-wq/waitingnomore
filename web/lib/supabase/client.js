"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";

let browserClient = null;

export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient;
  const env = getSupabaseEnv();
  if (!env) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and either NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (same public key from Supabase → Settings → API)."
    );
  }
  browserClient = createBrowserClient(env.url, env.anonKey);
  return browserClient;
}
