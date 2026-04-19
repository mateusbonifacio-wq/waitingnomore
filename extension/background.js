/**
 * Receives settings from the companion web app (externally_connectable origins)
 * and writes chrome.storage.local so open ChatGPT tabs update via storage.onChanged.
 *
 * Context export feature is currently paused
 * Reason: unreliable results and not part of core product
 * Can be revisited later
 * (No background logic was tied to context export; this service worker is unchanged.)
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
  themeMode: "dark"
};

function coerceUserPrefs(raw) {
  const base = { ...defaultUserPrefs };
  if (!raw || typeof raw !== "object") return base;
  if (typeof raw.overlayWhileGenerating === "boolean") base.overlayWhileGenerating = raw.overlayWhileGenerating;
  if (typeof raw.showSessionSummary === "boolean") base.showSessionSummary = raw.showSessionSummary;
  if (["play", "brain", "focus"].includes(raw.defaultSessionMode)) base.defaultSessionMode = raw.defaultSessionMode;
  if (["chill", "normal", "intense"].includes(raw.playIntensity)) base.playIntensity = raw.playIntensity;
  if (["always", "smart"].includes(raw.triggerWhen)) base.triggerWhen = raw.triggerWhen;
  if (["light", "dark"].includes(raw.themeMode)) base.themeMode = raw.themeMode;
  const sec = Number(raw.smartTriggerMinGenerationSec);
  if (Number.isFinite(sec) && sec >= 1 && sec <= 30) base.smartTriggerMinGenerationSec = sec;
  return base;
}

const MESSAGE_TYPE = "wnm-settings-v1";
const MESSAGE_GET_THEME = "wnm-get-theme-v1";
const MESSAGE_GET_SETTINGS = "wnm-get-settings-v1";

/** Canonical theme key for live sync (web app + extension). */
const THEME_STORAGE_KEY = "theme";

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

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
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
});
