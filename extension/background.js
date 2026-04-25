/**
 * Keel background: settings from web (external postMessage bridge OR chrome.runtime.sendMessage from web page)
 * and from the webBridge content script (internal chrome.runtime.sendMessage).
 * Writes chrome.storage.local so ChatGPT tabs update via storage.onChanged.
 */

const EXTENSION_SETTINGS_KEY = "waitingnomore.extensionSettings.v1";

const defaultUserPrefs = {
  schemaVersion: 1,
  overlayWhileGenerating: true,
  defaultSessionMode: "play",
  showSessionSummary: true,
  playIntensity: "normal",
  triggerWhen: "always",
  smartTriggerMinGenerationSec: 3,
  themeMode: "dark",
  selectedPlayGame: "auto",
  enabledGames: ["current"],
  selectedBrainTopic: "auto",
  enabledTopics: [],
  focusModeEnabled: true
};

const BRAIN_TOPIC_IDS = ["general_knowledge", "pop_culture", "science", "geography", "logic", "fun_random"];
const MICRO_GAME_IDS = new Set(["current", "keep_alive", "quick_pattern", "micro_memory"]);

function normalizeEnabledGamesList(raw) {
  if (!Array.isArray(raw)) return ["current"];
  const out = [];
  for (const x of raw) {
    if (typeof x === "string" && MICRO_GAME_IDS.has(x) && !out.includes(x)) out.push(x);
  }
  return out.length ? out : ["current"];
}

function coerceUserPrefs(raw) {
  const base = { ...defaultUserPrefs };
  if (!raw || typeof raw !== "object") return base;
  if (typeof raw.overlayWhileGenerating === "boolean") base.overlayWhileGenerating = raw.overlayWhileGenerating;
  if (typeof raw.showSessionSummary === "boolean") base.showSessionSummary = raw.showSessionSummary;
  if (["play", "brain", "focus"].includes(raw.defaultSessionMode)) base.defaultSessionMode = raw.defaultSessionMode;
  if (["chill", "normal", "intense"].includes(raw.playIntensity)) base.playIntensity = raw.playIntensity;
  if (["always", "smart"].includes(raw.triggerWhen)) base.triggerWhen = raw.triggerWhen;
  if (["light", "dark"].includes(raw.themeMode)) base.themeMode = raw.themeMode;
  if (raw.selectedPlayGame === "auto" || MICRO_GAME_IDS.has(raw.selectedPlayGame)) {
    base.selectedPlayGame = raw.selectedPlayGame;
  }
  if (raw.selectedBrainTopic === "auto" || BRAIN_TOPIC_IDS.includes(raw.selectedBrainTopic)) {
    base.selectedBrainTopic = raw.selectedBrainTopic;
  }
  const sec = Number(raw.smartTriggerMinGenerationSec);
  if (Number.isFinite(sec) && sec >= 1 && sec <= 30) base.smartTriggerMinGenerationSec = sec;
  base.enabledGames = normalizeEnabledGamesList(raw.enabledGames);
  if (Array.isArray(raw.enabledTopics)) {
    if (raw.enabledTopics.length === 0) {
      base.enabledTopics = [];
    } else {
      const filt = raw.enabledTopics.filter((t) => typeof t === "string" && BRAIN_TOPIC_IDS.includes(t));
      base.enabledTopics = [...new Set(filt)];
    }
  }
  if (typeof raw.focusModeEnabled === "boolean") base.focusModeEnabled = raw.focusModeEnabled;
  return base;
}

const MESSAGE_TYPE = "wnm-settings-v1";
const MESSAGE_GET_THEME = "wnm-get-theme-v1";
const MESSAGE_GET_SETTINGS = "wnm-get-settings-v1";

const THEME_STORAGE_KEY = "theme";

/** Saved when user visits Keel web while signed in (webBridge). Used to POST /api/events from the service worker. */
const KEEL_API_AUTH_KEY = "waitingnomore.keelApiAuth.v1";
/** Pending { id, type, data, occurred_at } rows until upload succeeds. */
const KEEL_OUTBOUND_EVENTS_KEY = "waitingnomore.keelOutboundEvents.v1";

function readMergedSettingsFromStorage(callback) {
  chrome.storage.local.get([EXTENSION_SETTINGS_KEY, THEME_STORAGE_KEY], (result) => {
    if (chrome.runtime.lastError) {
      callback({ error: chrome.runtime.lastError.message });
      return;
    }
    const prefs = coerceUserPrefs(result[EXTENSION_SETTINGS_KEY]);
    const fromThemeKey = result[THEME_STORAGE_KEY];
    if (fromThemeKey === "light" || fromThemeKey === "dark") {
      prefs.themeMode = fromThemeKey;
    }
    callback({ prefs });
  });
}

/**
 * @param {unknown} message
 * @param {(response: unknown) => void} sendResponse
 * @returns {boolean} true if sendResponse will be called asynchronously
 */
function handleWebSettingsMessage(message, sendResponse) {
  if (!message || typeof message.type !== "string") {
    sendResponse({ ok: false, error: "unknown_type" });
    return false;
  }
  if (message.type === MESSAGE_GET_THEME) {
    readMergedSettingsFromStorage((r) => {
      if (r.error) {
        sendResponse({ ok: false, error: r.error });
        return;
      }
      console.log("[wnm sync] EXT background: read theme for web", r.prefs.themeMode);
      sendResponse({ ok: true, theme: r.prefs.themeMode });
    });
    return true;
  }
  if (message.type === MESSAGE_GET_SETTINGS) {
    readMergedSettingsFromStorage((r) => {
      if (r.error) {
        sendResponse({ ok: false, error: r.error });
        return;
      }
      console.log("[wnm sync] EXT background: read full settings for web", r.prefs);
      sendResponse({ ok: true, settings: r.prefs });
    });
    return true;
  }
  if (message.type !== MESSAGE_TYPE) {
    sendResponse({ ok: false, error: "unknown_type" });
    return false;
  }
  console.log("[wnm sync] EXT background: incoming raw settings from web", message.settings);
  const merged = coerceUserPrefs(message.settings);
  console.log("[Keel settings] synced selected game:", merged.selectedPlayGame);
  console.log("[wnm sync] EXT background: coerced → persisted", merged);
  chrome.storage.local.set(
    {
      [EXTENSION_SETTINGS_KEY]: merged,
      [THEME_STORAGE_KEY]: merged.themeMode
    },
    () => {
      if (chrome.runtime.lastError) {
        console.error("[wnm sync] EXT background: chrome.storage.local.set failed", chrome.runtime.lastError.message);
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      console.log("[wnm sync] EXT background: chrome.storage.local write OK (settings + theme keys)");
      sendResponse({ ok: true });
    }
  );
  return true;
}

/**
 * @param {unknown} ev
 * @returns {{ ok: true, event: { id: string, type: string, data: object, occurred_at: string } } | { ok: false, reason: string }}
 */
function validateOutboundEvent(ev) {
  if (!ev || typeof ev !== "object") return { ok: false, reason: "not_an_object" };
  const type = ev.type;
  if (type !== "game_played" && type !== "brain_answer") return { ok: false, reason: "invalid_type" };
  const data = ev.data;
  if (!data || typeof data !== "object") return { ok: false, reason: "missing_data" };
  if (type === "game_played") {
    const mode = typeof data.mode === "string" ? data.mode : "";
    const metricType = typeof data.metric_type === "string" ? data.metric_type : "";
    const metricKey = typeof data.metric_key === "string" ? data.metric_key : "";
    const metricLabel = typeof data.metric_label === "string" ? data.metric_label : "";
    const metricUnit = typeof data.metric_unit === "string" ? data.metric_unit : "";
    const metricValue = Number(data.metric_value);
    if (typeof data.game !== "string" || !MICRO_GAME_IDS.has(data.game)) return { ok: false, reason: "invalid_game_id" };
    if (!["chill", "medium", "intense"].includes(mode)) return { ok: false, reason: "invalid_mode" };
    if (!metricType || metricType.length > 48) return { ok: false, reason: "invalid_metric_type" };
    if (!metricKey || metricKey.length > 48) return { ok: false, reason: "invalid_metric_key" };
    if (!metricLabel || metricLabel.length > 64) return { ok: false, reason: "invalid_metric_label" };
    if (!Number.isFinite(metricValue) || metricValue < 0 || metricValue > 500000) {
      return { ok: false, reason: "invalid_metric_value" };
    }
    if (metricUnit.length > 16) return { ok: false, reason: "metric_unit_too_long" };
    if (data.game === "keep_alive" && (metricType !== "time_survived" || metricKey !== "time_survived")) {
      return { ok: false, reason: "keep_alive_metric_mismatch" };
    }
    if (data.game !== "keep_alive" && (metricType !== "score" || metricKey !== "score")) {
      return { ok: false, reason: "game_metric_mismatch" };
    }
  } else {
    const topic = typeof data.topic === "string" ? data.topic.trim() : "";
    if (!topic || topic.length > 96 || typeof data.correct !== "boolean") {
      return { ok: false, reason: "invalid_brain_answer_payload" };
    }
  }
  const id = typeof ev.id === "string" && ev.id ? ev.id : `kce_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const occurred_at =
    typeof ev.occurred_at === "string" && ev.occurred_at ? ev.occurred_at : new Date().toISOString();
  return { ok: true, event: { id, type, data, occurred_at } };
}

function isAllowedKeelApiOrigin(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
    if (u.hostname.endsWith(".vercel.app")) return true;
    return false;
  } catch {
    return false;
  }
}

function flushKeelOutboundQueue() {
  return new Promise((resolve) => {
    chrome.storage.local.get([KEEL_OUTBOUND_EVENTS_KEY, KEEL_API_AUTH_KEY], (r) => {
      if (chrome.runtime.lastError) {
        console.error("[keel events] storage get failed", chrome.runtime.lastError.message);
        resolve({ ok: false, reason: chrome.runtime.lastError.message });
        return;
      }
      const auth = r[KEEL_API_AUTH_KEY];
      let queue = r[KEEL_OUTBOUND_EVENTS_KEY];
      if (!Array.isArray(queue)) queue = [];
      if (!auth || typeof auth !== "object" || !auth.accessToken || !auth.apiOrigin) {
        if (queue.length > 0) {
          console.error(
            "[keel events] flush blocked: no Keel session in extension storage (open Keel web signed in to sync auth). Queued events:",
            queue.length
          );
        } else {
          console.warn("[keel events] flush skipped: no auth in extension storage");
        }
        resolve({ ok: false, reason: "no_auth", queued: queue.length });
        return;
      }
      if (!isAllowedKeelApiOrigin(auth.apiOrigin)) {
        if (queue.length > 0) {
          console.error("[keel events] flush blocked: disallowed api origin", auth.apiOrigin, "queued:", queue.length);
        } else {
          console.warn("[keel events] flush skipped: invalid api origin", auth.apiOrigin);
        }
        resolve({ ok: false, reason: "bad_origin", queued: queue.length });
        return;
      }
      if (queue.length === 0) {
        resolve({ ok: true, sent: 0 });
        return;
      }
      const batch = queue.slice(0, 40);
      const origin = String(auth.apiOrigin).replace(/\/$/, "");
      const body = JSON.stringify({
        events: batch.map((ev) => ({
          type: ev.type,
          data: ev.data,
          occurred_at: ev.occurred_at
        }))
      });
      fetch(`${origin}/api/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.accessToken}`
        },
        body
      })
        .then(async (res) => {
          if (res.status === 401) {
            await new Promise((r2) => {
              chrome.storage.local.remove(KEEL_API_AUTH_KEY, () => r2());
            });
            return { ok: false, reason: "unauthorized" };
          }
          if (!res.ok) {
            const t = await res.text();
            console.error("[keel events] api insert failed", { status: res.status, body: t.slice(0, 400) });
            return { ok: false, reason: `http_${res.status}`, detail: t.slice(0, 400) };
          }
          const remaining = queue.slice(batch.length);
          await new Promise((r2) => {
            chrome.storage.local.set({ [KEEL_OUTBOUND_EVENTS_KEY]: remaining }, () => r2());
          });
          return { ok: true, sent: batch.length };
        })
        .then(resolve)
        .catch((e) => {
          console.error("[keel events] fetch network error", e);
          return resolve({ ok: false, reason: "network", detail: String(e && e.message ? e.message : e) });
        });
    });
  });
}

/**
 * @param {unknown} event
 * @param {(r: unknown) => void} sendResponse
 */
function pushKeelEventAndFlush(event, sendResponse) {
  const validated = validateOutboundEvent(event);
  if (!validated.ok) {
    console.error("[keel events] outbound event rejected (not queued)", validated.reason, event);
    sendResponse({ ok: false, error: "bad_event", reason: validated.reason });
    return;
  }
  const sanitized = validated.event;
  chrome.storage.local.get([KEEL_OUTBOUND_EVENTS_KEY], (r) => {
    if (chrome.runtime.lastError) {
      sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      return;
    }
    let queue = r[KEEL_OUTBOUND_EVENTS_KEY];
    if (!Array.isArray(queue)) queue = [];
    queue.push(sanitized);
    if (queue.length > 400) queue = queue.slice(-400);
    chrome.storage.local.set({ [KEEL_OUTBOUND_EVENTS_KEY]: queue }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      flushKeelOutboundQueue().then((res) => {
        if (!res?.ok) {
          console.error("[keel events] flush failed after enqueue", res);
        } else if (res.sent > 0) {
          console.info("[keel events] flush ok", { sent: res.sent });
        }
        sendResponse(res);
      });
    });
  });
}

/**
 * @param {unknown} message
 * @param {(r: unknown) => void} sendResponse
 */
function handleKeelApiAuthStore(message, sendResponse) {
  const apiOrigin = typeof message.apiOrigin === "string" ? message.apiOrigin.trim() : "";
  const accessToken = typeof message.accessToken === "string" ? message.accessToken.trim() : "";
  if (!apiOrigin || !accessToken || !isAllowedKeelApiOrigin(apiOrigin)) {
    sendResponse({ ok: false, error: "missing_or_invalid_fields" });
    return;
  }
  const rec = {
    accessToken,
    refreshToken: typeof message.refreshToken === "string" ? message.refreshToken : null,
    expiresAt: typeof message.expiresAt === "number" ? message.expiresAt : null,
    apiOrigin
  };
  chrome.storage.local.set({ [KEEL_API_AUTH_KEY]: rec }, () => {
    if (chrome.runtime.lastError) {
      sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      return;
    }
    flushKeelOutboundQueue().then(sendResponse);
  });
}

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message?.type === "wnm-push-keel-api-auth") {
    if (!sender.url || !isAllowedKeelApiOrigin(sender.url)) {
      sendResponse({ ok: false, error: "origin_not_allowed" });
      return false;
    }
    handleKeelApiAuthStore(message, sendResponse);
    return true;
  }
  if (message?.type === "wnm-clear-keel-api-auth") {
    if (!sender.url || !isAllowedKeelApiOrigin(sender.url)) {
      sendResponse({ ok: false, error: "origin_not_allowed" });
      return false;
    }
    chrome.storage.local.remove(KEEL_API_AUTH_KEY, () => {
      if (chrome.runtime.lastError) sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      else sendResponse({ ok: true });
    });
    return true;
  }
  return handleWebSettingsMessage(message, sendResponse);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const t = message?.type;
  if (t === "wnm-push-keel-event") {
    if (!sender || sender.id !== chrome.runtime.id) {
      sendResponse({ ok: false, error: "invalid_sender" });
      return false;
    }
    pushKeelEventAndFlush(message.event, sendResponse);
    return true;
  }
  if (t === "wnm-flush-keel-events") {
    if (!sender || sender.id !== chrome.runtime.id) {
      sendResponse({ ok: false, error: "invalid_sender" });
      return false;
    }
    flushKeelOutboundQueue().then(sendResponse);
    return true;
  }
  if (t === "wnm-push-keel-api-auth") {
    if (!sender || sender.id !== chrome.runtime.id) {
      sendResponse({ ok: false, error: "invalid_sender" });
      return false;
    }
    handleKeelApiAuthStore(message, sendResponse);
    return true;
  }
  if (t === "wnm-clear-keel-api-auth") {
    if (!sender || sender.id !== chrome.runtime.id) {
      sendResponse({ ok: false, error: "invalid_sender" });
      return false;
    }
    chrome.storage.local.remove(KEEL_API_AUTH_KEY, () => {
      if (chrome.runtime.lastError) sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      else sendResponse({ ok: true });
    });
    return true;
  }
  if (t !== MESSAGE_TYPE && t !== MESSAGE_GET_THEME && t !== MESSAGE_GET_SETTINGS) {
    return false;
  }
  if (!sender || sender.id !== chrome.runtime.id) {
    sendResponse({ ok: false, error: "invalid_sender" });
    return false;
  }
  return handleWebSettingsMessage(message, sendResponse);
});
