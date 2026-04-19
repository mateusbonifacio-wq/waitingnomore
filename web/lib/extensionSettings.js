/**
 * Shared preference shape for the Waiting No More companion extension.
 *
 * - **Web app**: `localStorage` + optional live push to the extension.
 * - **Extension**: `chrome.storage.local` + `background.js` external message handler.
 *
 * Live sync: set `NEXT_PUBLIC_EXTENSION_ID` (unpacked ID from chrome://extensions).
 * The web app calls `chrome.runtime.sendMessage`; the extension manifest lists allowed
 * origins under `externally_connectable`. `background.js` writes `chrome.storage.local`;
 * the ChatGPT content script uses `chrome.storage.onChanged` (no tab reload). Theme, strip,
 * and default session mode apply live while a generation session is active; summary toggle applies
 * when the next session ends.
 */

export const EXTENSION_SETTINGS_STORAGE_KEY = "waitingnomore.extensionSettings.v1";

/** Must match extension `THEME_STORAGE_KEY` — written by background with full settings push. */
export const THEME_STORAGE_KEY = "theme";

const LIVE_SYNC_MESSAGE_TYPE = "wnm-settings-v1";
const MESSAGE_GET_THEME = "wnm-get-theme-v1";

function getExtensionIdForLiveSync() {
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_EXTENSION_ID) {
    return String(process.env.NEXT_PUBLIC_EXTENSION_ID).trim();
  }
  return "";
}

/**
 * Push full settings to the Chrome extension (updates open ChatGPT tabs via storage).
 * @param {ExtensionSettingsV1} settings
 */
/**
 * Read canonical theme from the extension (chrome.storage.local.theme).
 * @returns {Promise<{ ok: boolean, theme?: "light"|"dark", reason?: string }>}
 */
export function fetchThemeFromExtension() {
  return new Promise((resolve) => {
    const extensionId = getExtensionIdForLiveSync();
    if (!extensionId) {
      resolve({ ok: false, reason: "missing_NEXT_PUBLIC_EXTENSION_ID" });
      return;
    }
    if (typeof window === "undefined") {
      resolve({ ok: false, reason: "no_window" });
      return;
    }
    const chromeApi = window.chrome;
    if (!chromeApi?.runtime?.sendMessage) {
      resolve({ ok: false, reason: "no_chrome_runtime" });
      return;
    }
    try {
      chromeApi.runtime.sendMessage(extensionId, { type: MESSAGE_GET_THEME }, (response) => {
        const last = chromeApi.runtime.lastError;
        if (last) {
          resolve({ ok: false, reason: last.message });
          return;
        }
        if (response && response.ok && (response.theme === "light" || response.theme === "dark")) {
          resolve({ ok: true, theme: response.theme });
          return;
        }
        resolve({ ok: false, reason: "bad_response" });
      });
    } catch (e) {
      resolve({ ok: false, reason: String(e && e.message ? e.message : e) });
    }
  });
}

/** Apply theme to the document root (web app UI). */
export function applyWebDocumentTheme(theme) {
  if (typeof document === "undefined") return;
  const t = theme === "light" || theme === "dark" ? theme : "dark";
  document.documentElement.dataset.theme = t;
  document.documentElement.style.colorScheme = t === "light" ? "light" : "dark";
}

export function pushSettingsToExtension(settings) {
  return new Promise((resolve) => {
    const extensionId = getExtensionIdForLiveSync();
    if (!extensionId) {
      resolve({ ok: false, reason: "missing_NEXT_PUBLIC_EXTENSION_ID" });
      return;
    }
    if (typeof window === "undefined") {
      resolve({ ok: false, reason: "no_window" });
      return;
    }
    const chromeApi = window.chrome;
    if (!chromeApi?.runtime?.sendMessage) {
      resolve({ ok: false, reason: "no_chrome_runtime" });
      return;
    }
    try {
      chromeApi.runtime.sendMessage(
        extensionId,
        { type: LIVE_SYNC_MESSAGE_TYPE, settings },
        (response) => {
          const last = chromeApi.runtime.lastError;
          if (last) {
            resolve({ ok: false, reason: last.message });
            return;
          }
          resolve(response && typeof response === "object" ? response : { ok: true });
        }
      );
    } catch (e) {
      resolve({ ok: false, reason: String(e && e.message ? e.message : e) });
    }
  });
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

function coerceSettings(raw) {
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

/**
 * @param {Partial<ExtensionSettingsV1>} partial
 * @returns {ExtensionSettingsV1}
 */
export function saveExtensionSettings(partial) {
  const next = coerceSettings({ ...loadExtensionSettings(), ...partial, schemaVersion: 1 });
  window.localStorage.setItem(EXTENSION_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  if (Object.prototype.hasOwnProperty.call(partial, "themeMode")) {
    console.log("Theme set:", next.themeMode);
  }
  console.log("[wnm settings] web wrote localStorage + push to extension", {
    defaultSessionMode: next.defaultSessionMode,
    playIntensity: next.playIntensity,
    triggerWhen: next.triggerWhen,
    themeMode: next.themeMode
  });
  applyWebDocumentTheme(next.themeMode);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("wnm-theme-changed", { detail: { themeMode: next.themeMode } })
    );
  }
  void pushSettingsToExtension(next);
  return next;
}

/**
 * On load: paint from localStorage immediately, then reconcile theme from extension storage (no extra push).
 */
export async function syncThemeFromExtensionOnLoad() {
  if (typeof window === "undefined") return;
  const local = loadExtensionSettings();
  applyWebDocumentTheme(local.themeMode);
  const r = await fetchThemeFromExtension();
  if (r.ok && r.theme) {
    applyWebDocumentTheme(r.theme);
    if (local.themeMode !== r.theme) {
      const next = coerceSettings({ ...local, themeMode: r.theme, schemaVersion: 1 });
      window.localStorage.setItem(EXTENSION_SETTINGS_STORAGE_KEY, JSON.stringify(next));
    }
    window.dispatchEvent(
      new CustomEvent("wnm-theme-changed", { detail: { themeMode: r.theme } })
    );
  }
}
