"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase/client";

const WEB = "keel-web";
const EXT = "keel-extension";
const MESSAGE_PUSH_AUTH = "wnm-push-keel-api-auth";
const MESSAGE_CLEAR_AUTH = "wnm-clear-keel-api-auth";

function postToExtension(kind, payload) {
  if (typeof window === "undefined") return Promise.resolve({ ok: false, reason: "no_window" });
  const targetOrigin = window.location.origin;
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
      if (event.origin !== targetOrigin) return;
      const d = event.data;
      if (!d || d.source !== EXT || d.nonce !== nonce) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener("message", onReply);
      resolve({ ok: d.ok === true, error: d.error || null });
    }

    window.addEventListener("message", onReply);
    window.postMessage({ source: WEB, kind, nonce, ...payload }, targetOrigin);
  });
}

function getExtensionIdFallback() {
  const raw = process.env.NEXT_PUBLIC_EXTENSION_ID;
  return typeof raw === "string" ? raw.trim() : "";
}

function postViaExtensionId(message) {
  if (typeof window === "undefined") return Promise.resolve({ ok: false, reason: "no_window" });
  const extensionId = getExtensionIdFallback();
  if (!extensionId) return Promise.resolve({ ok: false, reason: "no_extension_id" });
  const chromeApi = window.chrome;
  if (!chromeApi?.runtime?.sendMessage) return Promise.resolve({ ok: false, reason: "no_chrome_runtime" });
  return new Promise((resolve) => {
    try {
      chromeApi.runtime.sendMessage(extensionId, message, (response) => {
        const err = chromeApi.runtime.lastError;
        if (err) {
          resolve({ ok: false, reason: err.message || "send_message_failed" });
          return;
        }
        resolve(response && typeof response === "object" ? response : { ok: true });
      });
    } catch (e) {
      resolve({ ok: false, reason: String(e && e.message ? e.message : e) });
    }
  });
}

async function sendAuthToExtension(session) {
  const payload = {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at,
    apiOrigin: window.location.origin
  };
  const viaBridge = await postToExtension("push-keel-api-auth", payload);
  if (viaBridge.ok) {
    console.info("[keel auth sync] push via bridge OK");
    return;
  }
  const viaId = await postViaExtensionId({ type: MESSAGE_PUSH_AUTH, ...payload });
  if (viaId?.ok) {
    console.info("[keel auth sync] push via extension id fallback OK");
    return;
  }
  console.warn("[keel auth sync] push failed", { viaBridge, viaId });
}

async function clearAuthInExtension() {
  const viaBridge = await postToExtension("clear-keel-api-auth", {});
  if (viaBridge.ok) {
    console.info("[keel auth sync] clear via bridge OK");
    return;
  }
  const viaId = await postViaExtensionId({ type: MESSAGE_CLEAR_AUTH });
  if (viaId?.ok) {
    console.info("[keel auth sync] clear via extension id fallback OK");
    return;
  }
  console.warn("[keel auth sync] clear failed", { viaBridge, viaId });
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
          await sendAuthToExtension(session);
        }

        if (cancelled) return;
        const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
          if (cancelled) return;
          if (!newSession?.access_token) {
            void clearAuthInExtension();
            return;
          }
          void sendAuthToExtension(newSession);
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
