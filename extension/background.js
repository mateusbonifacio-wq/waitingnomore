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

/** Canonical theme key for live sync (web app + extension). */
const THEME_STORAGE_KEY = "theme";

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    sendResponse({ ok: false, error: "unknown_type" });
    return false;
  }
  if (message.type === MESSAGE_GET_THEME) {
    chrome.storage.local.get([THEME_STORAGE_KEY, EXTENSION_SETTINGS_KEY], (result) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      const fromKey = result[THEME_STORAGE_KEY];
      const theme =
        fromKey === "light" || fromKey === "dark"
          ? fromKey
          : coerceUserPrefs(result[EXTENSION_SETTINGS_KEY]).themeMode;
      sendResponse({ ok: true, theme });
    });
    return true;
  }
  if (message.type !== MESSAGE_TYPE) {
    sendResponse({ ok: false, error: "unknown_type" });
    return false;
  }
  const merged = coerceUserPrefs(message.settings);
  console.log("[wnm settings] background received external push → chrome.storage.local", {
    defaultSessionMode: merged.defaultSessionMode,
    playIntensity: merged.playIntensity,
    triggerWhen: merged.triggerWhen,
    themeMode: merged.themeMode
  });
  chrome.storage.local.set(
    {
      [EXTENSION_SETTINGS_KEY]: merged,
      [THEME_STORAGE_KEY]: merged.themeMode
    },
    () => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ ok: true });
    }
  );
  return true;
});
