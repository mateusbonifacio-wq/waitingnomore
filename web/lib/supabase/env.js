/**
 * @returns {{ url: string, anonKey: string } | null}
 * Never throws — missing env must not break `next build` (e.g. Vercel previews without vars).
 */
export function getSupabaseEnv() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}
