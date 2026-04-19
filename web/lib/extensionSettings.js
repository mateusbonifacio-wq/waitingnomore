/**
 * Single source of truth for extension-related preferences (web + Chrome extension).
 *
 * Shape matches `extension/content.js` / `extension/background.js` coerceUserPrefs.
 *
 * Live sync: `NEXT_PUBLIC_EXTENSION_ID` must be set to the unpacked extension ID.
 * The site origin must appear under `externally_connectable` in `extension/manifest.json`.
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
 * Push full settings object to the extension (background writes `chrome.storage.local`).
 * @param {ExtensionSettingsV1} settings
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export function pushSettingsToExtension(settings) {
  return new Promise((resolve) => {
    const extensionId = getExtensionIdForLiveSync();
    if (!extensionId) {
      wwarn(
        "WEB: push skipped — set NEXT_PUBLIC_EXTENSION_ID to your extension id (chrome://extensions → Developer mode → ID)."
      );
      resolve({ ok: false, reason: "missing_NEXT_PUBLIC_EXTENSION_ID" });
      return;
    }
    if (typeof window === "undefined") {
      resolve({ ok: false, reason: "no_window" });
      return;
    }
    const chromeApi = getChromeRuntime();
    if (!chromeApi?.runtime?.sendMessage) {
      wwarn("WEB: push skipped — chrome.runtime.sendMessage not available (open the site in Chrome with the extension).");
      resolve({ ok: false, reason: "no_chrome_runtime" });
      return;
    }
    wlog("WEB: sending to extension (wnm-settings-v1)", settings);
    try {
      chromeApi.runtime.sendMessage(
        extensionId,
        { type: LIVE_SYNC_MESSAGE_TYPE, settings },
        (response) => {
          const last = chromeApi.runtime.lastError;
          if (last) {
            wwarn("WEB: sendMessage failed — check extension manifest externally_connectable matches this page origin.", last.message);
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
        }
      );
    } catch (e) {
      resolve({ ok: false, reason: String(e && e.message ? e.message : e) });
    }
  });
}

function sendExtensionTyped(type) {
  return new Promise((resolve) => {
    const extensionId = getExtensionIdForLiveSync();
    if (!extensionId) {
      resolve({ ok: false, reason: "missing_NEXT_PUBLIC_EXTENSION_ID" });
      return;
    }
    const chromeApi = getChromeRuntime();
    if (!chromeApi?.runtime?.sendMessage) {
      resolve({ ok: false, reason: "no_chrome_runtime" });
      return;
    }
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
  themeMode: "dark"
};

const INTENSITY = new Set(["chill", "normal", "intense"]);
const TRIGGER = new Set(["always", "smart"]);
const MODE = new Set(["play", "brain", "focus"]);
const THEME = new Set(["light", "dark"]);

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
    wlog("WEB: could not read settings from extension (expected if ID/origin missing)", r.reason);
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
