/**
 * Keel — extension-related preferences (web + Chrome extension).
 *
 * Shape matches `extension/content.js` / `extension/background.js` coerceUserPrefs.
 *
 * Primary: `extension/webBridge.js` on this origin (postMessage — no per-user extension ID).
 * Fallback: `NEXT_PUBLIC_EXTENSION_ID` + `chrome.runtime.sendMessage` for custom domains not in the manifest.
 */

export const EXTENSION_SETTINGS_STORAGE_KEY = "waitingnomore.extensionSettings.v1";

/** Must match extension `THEME_STORAGE_KEY`. */
export const THEME_STORAGE_KEY = "theme";

const LIVE_SYNC_MESSAGE_TYPE = "wnm-settings-v1";
const MESSAGE_GET_THEME = "wnm-get-theme-v1";
const MESSAGE_GET_SETTINGS = "wnm-get-settings-v1";

/** Full-chain sync logging — filter DevTools console by: [wnm sync] */
const WNM_SYNC_LOG = true;

function wlog(msg, detail) {
  if (!WNM_SYNC_LOG) return;
  if (detail !== undefined) console.log("[wnm sync] " + msg, detail);
  else console.log("[wnm sync] " + msg);
}

function wwarn(msg, detail) {
  if (!WNM_SYNC_LOG) return;
  if (detail !== undefined) console.warn("[wnm sync] " + msg, detail);
  else console.warn("[wnm sync] " + msg);
}

const BRIDGE_WEB = "keel-web";
const BRIDGE_EXT = "keel-extension";

function getExtensionIdForLiveSync() {
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_EXTENSION_ID) {
    return String(process.env.NEXT_PUBLIC_EXTENSION_ID).trim();
  }
  return "";
}

function getChromeRuntime() {
  if (typeof window === "undefined") return null;
  return window.chrome;
}

/**
 * @param {string} kind verify | push-settings | get-theme | get-settings
 * @param {Record<string, unknown>} payload
 * @param {number} timeoutMs
 * @returns {Promise<{ connected: boolean, ok?: boolean, version?: string, response?: unknown, error?: string | null, reason?: string }>}
 */
function bridgeCall(kind, payload = {}, timeoutMs = 3500) {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve({ connected: false, reason: "no_window" });
      return;
    }
    const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onReply);
      resolve({ connected: false, reason: "bridge_timeout" });
    }, timeoutMs);

    function onReply(event) {
      if (event.source !== window) return;
      const d = event.data;
      if (!d || d.source !== BRIDGE_EXT || d.nonce !== nonce) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener("message", onReply);
      resolve({
        connected: true,
        ok: d.ok === true,
        version: d.version,
        response: d.response,
        error: d.error
      });
    }

    window.addEventListener("message", onReply);
    window.postMessage({ source: BRIDGE_WEB, kind, nonce, ...payload }, "*");
  });
}

/**
 * Lightweight ping — does not read storage.
 * @returns {Promise<{ ok: boolean, version?: string, reason?: string }>}
 */
export async function verifyKeelExtensionBridge() {
  const r = await bridgeCall("verify", {}, 2500);
  if (!r.connected) return { ok: false, reason: r.reason || "bridge_unavailable" };
  if (r.ok && r.version) return { ok: true, version: String(r.version) };
  return { ok: false, reason: r.error || "verify_failed" };
}

/**
 * Push full settings object to the extension (background writes `chrome.storage.local`).
 * @param {ExtensionSettingsV1} settings
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function pushSettingsToExtension(settings) {
  if (typeof window === "undefined") {
    return { ok: false, reason: "no_window" };
  }

  const br = await bridgeCall("push-settings", { settings }, 4000);
  if (br.connected) {
    if (br.ok) {
      wlog("WEB: push via on-page bridge OK (wnm-settings-v1)", settings);
      return { ok: true };
    }
    wwarn("WEB: bridge push failed", br.error || br.response);
    return { ok: false, reason: br.error || "bridge_push_failed" };
  }

  const extensionId = getExtensionIdForLiveSync();
  if (!extensionId) {
    wwarn(
      "WEB: push skipped — extension not detected on this page (load Keel unpacked) and no NEXT_PUBLIC_EXTENSION_ID fallback."
    );
    return { ok: false, reason: "no_bridge_no_extension_id" };
  }

  const chromeApi = getChromeRuntime();
  if (!chromeApi?.runtime?.sendMessage) {
    wwarn("WEB: push skipped — not in Chrome or extension bridge unavailable.");
    return { ok: false, reason: "no_chrome_runtime" };
  }

  wlog("WEB: sending to extension via extension id (wnm-settings-v1)", settings);
  return new Promise((resolve) => {
    try {
      chromeApi.runtime.sendMessage(extensionId, { type: LIVE_SYNC_MESSAGE_TYPE, settings }, (response) => {
        const last = chromeApi.runtime.lastError;
        if (last) {
          wwarn("WEB: sendMessage failed — origin may be missing from manifest.", last.message);
          resolve({ ok: false, reason: last.message });
          return;
        }
        const ok = response && response.ok !== false;
        if (ok) {
          wlog("WEB: extension acknowledged — background should persist to chrome.storage.local");
        } else {
          wwarn("WEB: extension returned failure", response);
        }
        resolve(response && typeof response === "object" ? response : { ok: true });
      });
    } catch (e) {
      resolve({ ok: false, reason: String(e && e.message ? e.message : e) });
    }
  });
}

async function sendExtensionTyped(type) {
  const kind = type === MESSAGE_GET_THEME ? "get-theme" : type === MESSAGE_GET_SETTINGS ? "get-settings" : null;
  if (kind) {
    const br = await bridgeCall(kind, {}, 3500);
    if (br.connected && br.response && typeof br.response === "object") {
      return /** @type {Record<string, unknown>} */ (br.response);
    }
    if (br.connected) {
      return { ok: false, reason: br.error || "bridge_failed" };
    }
  }

  const extensionId = getExtensionIdForLiveSync();
  if (!extensionId) {
    return { ok: false, reason: "no_bridge_no_extension_id" };
  }
  const chromeApi = getChromeRuntime();
  if (!chromeApi?.runtime?.sendMessage) {
    return { ok: false, reason: "no_chrome_runtime" };
  }
  return new Promise((resolve) => {
    try {
      chromeApi.runtime.sendMessage(extensionId, { type }, (response) => {
        const last = chromeApi.runtime.lastError;
        if (last) {
          resolve({ ok: false, reason: last.message });
          return;
        }
        resolve(response && typeof response === "object" ? response : { ok: false, reason: "bad_response" });
      });
    } catch (e) {
      resolve({ ok: false, reason: String(e && e.message ? e.message : e) });
    }
  });
}

/**
 * Read canonical theme from extension storage.
 * @returns {Promise<{ ok: boolean, theme?: "light"|"dark", reason?: string }>}
 */
export async function fetchThemeFromExtension() {
  const r = await sendExtensionTyped(MESSAGE_GET_THEME);
  if (r.ok && (r.theme === "light" || r.theme === "dark")) {
    return { ok: true, theme: r.theme };
  }
  return { ok: false, reason: r.reason || "bad_response" };
}

/**
 * Read full merged settings from extension (same object content script uses).
 * @returns {Promise<{ ok: boolean, settings?: ExtensionSettingsV1, reason?: string }>}
 */
export async function fetchFullSettingsFromExtension() {
  const r = await sendExtensionTyped(MESSAGE_GET_SETTINGS);
  if (r.ok && r.settings && typeof r.settings === "object") {
    const settings = coerceSettings({ ...r.settings, schemaVersion: 1 });
    return { ok: true, settings };
  }
  return { ok: false, reason: r.reason || "bad_response" };
}

/** Apply theme to the web app document root. */
export function applyWebDocumentTheme(theme) {
  if (typeof document === "undefined") return;
  const t = theme === "light" || theme === "dark" ? theme : "dark";
  document.documentElement.dataset.theme = t;
  document.documentElement.style.colorScheme = t === "light" ? "light" : "dark";
}

/** @typedef {"chill" | "normal" | "intense"} PlayIntensity */
/** @typedef {"always" | "smart"} TriggerWhen */
/** @typedef {"play" | "brain" | "focus"} SessionMode */
/** @typedef {"light" | "dark"} ThemeMode */
/** @typedef {"current" | "keep_alive" | "quick_pattern" | "micro_memory"} MicroGameId */

/**
 * @typedef {Object} ExtensionSettingsV1
 * @property {1} schemaVersion
 * @property {boolean} overlayWhileGenerating
 * @property {SessionMode} defaultSessionMode
 * @property {boolean} showSessionSummary
 * @property {PlayIntensity} playIntensity
 * @property {TriggerWhen} triggerWhen
 * @property {number} smartTriggerMinGenerationSec
 * @property {ThemeMode} themeMode
 * @property {MicroGameId[]} enabledGames
 */

/** @type {ExtensionSettingsV1} */
export const defaultExtensionSettings = {
  schemaVersion: 1,
  overlayWhileGenerating: true,
  defaultSessionMode: "play",
  showSessionSummary: true,
  playIntensity: "normal",
  triggerWhen: "always",
  smartTriggerMinGenerationSec: 3,
  themeMode: "dark",
  enabledGames: ["current"]
};

const INTENSITY = new Set(["chill", "normal", "intense"]);
const TRIGGER = new Set(["always", "smart"]);
const MODE = new Set(["play", "brain", "focus"]);
const THEME = new Set(["light", "dark"]);
const MICRO_GAME_IDS = new Set(["current", "keep_alive", "quick_pattern", "micro_memory"]);

export function normalizeEnabledGamesList(raw) {
  if (!Array.isArray(raw)) return ["current"];
  const out = [];
  for (const x of raw) {
    if (typeof x === "string" && MICRO_GAME_IDS.has(x) && !out.includes(x)) out.push(x);
  }
  return out.length ? out : ["current"];
}

export function coerceSettings(raw) {
  const base = { ...defaultExtensionSettings };
  if (!raw || typeof raw !== "object") return base;
  if (typeof raw.overlayWhileGenerating === "boolean") base.overlayWhileGenerating = raw.overlayWhileGenerating;
  if (typeof raw.showSessionSummary === "boolean") base.showSessionSummary = raw.showSessionSummary;
  if (MODE.has(raw.defaultSessionMode)) base.defaultSessionMode = raw.defaultSessionMode;
  if (INTENSITY.has(raw.playIntensity)) base.playIntensity = raw.playIntensity;
  if (TRIGGER.has(raw.triggerWhen)) base.triggerWhen = raw.triggerWhen;
  if (THEME.has(raw.themeMode)) base.themeMode = raw.themeMode;
  const sec = Number(raw.smartTriggerMinGenerationSec);
  if (Number.isFinite(sec) && sec >= 1 && sec <= 30) base.smartTriggerMinGenerationSec = sec;
  base.enabledGames = normalizeEnabledGamesList(raw.enabledGames);
  return base;
}

/** @returns {ExtensionSettingsV1} */
export function loadExtensionSettings() {
  if (typeof window === "undefined") return { ...defaultExtensionSettings };
  try {
    const raw = window.localStorage.getItem(EXTENSION_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...defaultExtensionSettings };
    return coerceSettings(JSON.parse(raw));
  } catch {
    return { ...defaultExtensionSettings };
  }
}

function dispatchSettingsChanged(next) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("wnm-settings-changed", { detail: next }));
}

/**
 * Merge partial into saved settings, persist locally, push to extension, update web UI theme.
 * @param {Partial<ExtensionSettingsV1>} partial
 * @returns {Promise<ExtensionSettingsV1>}
 */
export async function saveExtensionSettings(partial) {
  if (typeof window === "undefined") {
    return coerceSettings({ ...defaultExtensionSettings, ...partial, schemaVersion: 1 });
  }
  wlog("WEB: setting change requested (partial from UI)", partial);
  const next = coerceSettings({ ...loadExtensionSettings(), ...partial, schemaVersion: 1 });
  wlog("WEB: merged full settings (localStorage + next push)", next);
  window.localStorage.setItem(EXTENSION_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  applyWebDocumentTheme(next.themeMode);
  dispatchSettingsChanged(next);

  const pushResult = await pushSettingsToExtension(next);
  if (pushResult.ok) {
    wlog("WEB: push finished OK — ChatGPT tab content script should log receive + apply next");
  } else {
    wwarn("WEB: push FAILED — extension unchanged. localStorage on this site still saved.", pushResult.reason);
  }
  return next;
}

/**
 * On load: apply localStorage, then pull canonical settings from extension when available.
 */
export async function syncSettingsFromExtensionOnLoad() {
  if (typeof window === "undefined") return;
  const local = loadExtensionSettings();
  applyWebDocumentTheme(local.themeMode);
  wlog("WEB: initial localStorage snapshot", local);

  const r = await fetchFullSettingsFromExtension();
  if (!r.ok || !r.settings) {
    wlog("WEB: could not read settings from extension (install extension or check origin in manifest)", r.reason);
    return;
  }
  const merged = coerceSettings({ ...r.settings, schemaVersion: 1 });
  window.localStorage.setItem(EXTENSION_SETTINGS_STORAGE_KEY, JSON.stringify(merged));
  applyWebDocumentTheme(merged.themeMode);
  wlog("WEB: reconciled from extension storage", merged);
  dispatchSettingsChanged(merged);
}

/** @deprecated Use syncSettingsFromExtensionOnLoad */
export async function syncThemeFromExtensionOnLoad() {
  await syncSettingsFromExtensionOnLoad();
}
