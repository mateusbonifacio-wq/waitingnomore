/**
 * Shared preference shape for the Waiting No More companion extension.
 *
 * - **Web app**: persists to `localStorage` (this origin only).
 * - **Extension**: reads/writes the same object under `chrome.storage.local`
 *   using `EXTENSION_SETTINGS_STORAGE_KEY` (see `extension/options.html`).
 *
 * ChatGPT cannot see the website’s localStorage — use extension options (or
 * future sync) so the overlay actually receives updates. Field names stay stable.
 */

export const EXTENSION_SETTINGS_STORAGE_KEY = "waitingnomore.extensionSettings.v1";

/** @typedef {"chill" | "normal" | "intense"} PlayIntensity */
/** @typedef {"always" | "smart"} TriggerWhen */
/** @typedef {"play" | "brain" | "focus"} SessionMode */

/**
 * @typedef {Object} ExtensionSettingsV1
 * @property {1} schemaVersion
 * @property {boolean} overlayWhileGenerating
 * @property {SessionMode} defaultSessionMode
 * @property {boolean} showSessionSummary
 * @property {PlayIntensity} playIntensity
 * @property {TriggerWhen} triggerWhen
 * @property {number} smartTriggerMinGenerationSec
 */

/** @type {ExtensionSettingsV1} */
export const defaultExtensionSettings = {
  schemaVersion: 1,
  overlayWhileGenerating: true,
  defaultSessionMode: "play",
  showSessionSummary: true,
  playIntensity: "normal",
  triggerWhen: "always",
  smartTriggerMinGenerationSec: 3
};

const INTENSITY = new Set(["chill", "normal", "intense"]);
const TRIGGER = new Set(["always", "smart"]);
const MODE = new Set(["play", "brain", "focus"]);

function coerceSettings(raw) {
  const base = { ...defaultExtensionSettings };
  if (!raw || typeof raw !== "object") return base;
  if (typeof raw.overlayWhileGenerating === "boolean") base.overlayWhileGenerating = raw.overlayWhileGenerating;
  if (typeof raw.showSessionSummary === "boolean") base.showSessionSummary = raw.showSessionSummary;
  if (MODE.has(raw.defaultSessionMode)) base.defaultSessionMode = raw.defaultSessionMode;
  if (INTENSITY.has(raw.playIntensity)) base.playIntensity = raw.playIntensity;
  if (TRIGGER.has(raw.triggerWhen)) base.triggerWhen = raw.triggerWhen;
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
  return next;
}
