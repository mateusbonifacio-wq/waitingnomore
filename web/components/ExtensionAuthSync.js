"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase/client";

const WEB = "keel-web";
const EXT = "keel-extension";

function postToExtension(kind, payload) {
  if (typeof window === "undefined") return Promise.resolve({ ok: false, reason: "no_window" });
  const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onReply);
      resolve({ ok: false, reason: "bridge_timeout" });
    }, 4500);

    function onReply(event) {
      if (event.source !== window) return;
      const d = event.data;
      if (!d || d.source !== EXT || d.nonce !== nonce) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener("message", onReply);
      resolve({ ok: d.ok === true, error: d.error || null });
    }

    window.addEventListener("message", onReply);
    window.postMessage({ source: WEB, kind, nonce, ...payload }, "*");
  });
}

/**
 * When the Keel extension is installed on this origin, push Supabase session tokens so the
 * extension background can POST game/brain events to /api/events while you use ChatGPT.
 */
export default function ExtensionAuthSync() {
  useEffect(() => {
    let cancelled = false;
    let unsubscribe = null;

    (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { session }
        } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session?.access_token) {
          await postToExtension("push-keel-api-auth", {
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
            expiresAt: session.expires_at,
            apiOrigin: window.location.origin
          });
        }

        if (cancelled) return;
        const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
          if (cancelled) return;
          if (!newSession?.access_token) {
            void postToExtension("clear-keel-api-auth", {});
            return;
          }
          void postToExtension("push-keel-api-auth", {
            accessToken: newSession.access_token,
            refreshToken: newSession.refresh_token,
            expiresAt: newSession.expires_at,
            apiOrigin: window.location.origin
          });
        });
        unsubscribe = () => data.subscription.unsubscribe();
      } catch {
        /* Supabase env not configured in browser build */
      }
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return null;
}
