"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";

let browserClient = null;

export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient;
  const env = getSupabaseEnv();
  if (!env) {
    throw new Error("Missing Supabase env: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  browserClient = createBrowserClient(env.url, env.anonKey);
  return browserClient;
}
