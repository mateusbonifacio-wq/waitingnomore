const EXTENSION_SETTINGS_KEY = "waitingnomore.extensionSettings.v1";

const defaultUserPrefs = {
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

function coerceUserPrefs(raw) {
  const base = { ...defaultUserPrefs };
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

function formToObject() {
  return {
    schemaVersion: 1,
    overlayWhileGenerating: document.getElementById("overlayWhileGenerating").checked,
    defaultSessionMode: document.getElementById("defaultSessionMode").value,
    showSessionSummary: document.getElementById("showSessionSummary").checked,
    playIntensity: document.getElementById("playIntensity").value,
    triggerWhen: document.getElementById("triggerWhen").value,
    smartTriggerMinGenerationSec: defaultUserPrefs.smartTriggerMinGenerationSec
  };
}

function applyToForm(prefs) {
  document.getElementById("overlayWhileGenerating").checked = prefs.overlayWhileGenerating;
  document.getElementById("defaultSessionMode").value = prefs.defaultSessionMode;
  document.getElementById("showSessionSummary").checked = prefs.showSessionSummary;
  document.getElementById("playIntensity").value = prefs.playIntensity;
  document.getElementById("triggerWhen").value = prefs.triggerWhen;
}

async function load() {
  const data = await chrome.storage.local.get(EXTENSION_SETTINGS_KEY);
  const prefs = coerceUserPrefs(data[EXTENSION_SETTINGS_KEY]);
  applyToForm(prefs);
  setStatus("Loaded.");
}

function setStatus(msg) {
  document.getElementById("status").textContent = msg;
}

document.getElementById("save").addEventListener("click", async () => {
  const btn = document.getElementById("save");
  btn.disabled = true;
  try {
    const next = coerceUserPrefs(formToObject());
    await chrome.storage.local.set({ [EXTENSION_SETTINGS_KEY]: next });
    setStatus("Saved. Reload any open ChatGPT tabs to be sure the overlay picks changes up.");
  } catch (e) {
    setStatus(String(e && e.message ? e.message : e));
  } finally {
    btn.disabled = false;
  }
});

void load();
