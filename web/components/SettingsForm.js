"use client";

import { useEffect, useState } from "react";
import {
  defaultExtensionSettings,
  EXTENSION_SETTINGS_STORAGE_KEY,
  loadExtensionSettings,
  normalizeEnabledGamesList,
  saveExtensionSettings
} from "../lib/extensionSettings";

const GAME_OPTIONS = [
  { id: "current", label: "Reaction targets", hint: "Original tap game." },
  { id: "keep_alive", label: "Keep alive", hint: "Tap before the dot lands." },
  { id: "quick_pattern", label: "Quick pattern", hint: "Watch arrows, repeat the sequence." },
  { id: "micro_memory", label: "Micro memory", hint: "Flash of symbols, pick the pair you saw." }
];

export default function SettingsForm({ isAuthenticated = false, initialCloudSettings = null }) {
  const [ready, setReady] = useState(false);
  const [overlayWhileGenerating, setOverlayWhileGenerating] = useState(defaultExtensionSettings.overlayWhileGenerating);
  const [defaultSessionMode, setDefaultSessionMode] = useState(defaultExtensionSettings.defaultSessionMode);
  const [showSessionSummary, setShowSessionSummary] = useState(defaultExtensionSettings.showSessionSummary);
  const [playIntensity, setPlayIntensity] = useState(defaultExtensionSettings.playIntensity);
  const [triggerWhen, setTriggerWhen] = useState(defaultExtensionSettings.triggerWhen);
  const [themeMode, setThemeMode] = useState(defaultExtensionSettings.themeMode);
  const [enabledGames, setEnabledGames] = useState(defaultExtensionSettings.enabledGames);

  useEffect(() => {
    const s = loadExtensionSettings();
    setOverlayWhileGenerating(s.overlayWhileGenerating);
    setDefaultSessionMode(s.defaultSessionMode);
    setShowSessionSummary(s.showSessionSummary);
    setPlayIntensity(s.playIntensity);
    setTriggerWhen(s.triggerWhen);
    setThemeMode(s.themeMode);
    setEnabledGames(normalizeEnabledGamesList(s.enabledGames));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!initialCloudSettings || typeof initialCloudSettings !== "object") return;
    const s = initialCloudSettings;
    setOverlayWhileGenerating(Boolean(s.overlayWhileGenerating));
    setDefaultSessionMode(s.defaultSessionMode || defaultExtensionSettings.defaultSessionMode);
    setShowSessionSummary(Boolean(s.showSessionSummary));
    setPlayIntensity(s.playIntensity || defaultExtensionSettings.playIntensity);
    setTriggerWhen(s.triggerWhen || defaultExtensionSettings.triggerWhen);
    setThemeMode(s.themeMode || defaultExtensionSettings.themeMode);
    setEnabledGames(normalizeEnabledGamesList(s.enabledGames));
    void saveExtensionSettings(s);
  }, [initialCloudSettings]);

  useEffect(() => {
    function onWnmSettings(e) {
      const s = e.detail;
      if (!s || typeof s !== "object") return;
      if (typeof s.overlayWhileGenerating === "boolean") setOverlayWhileGenerating(s.overlayWhileGenerating);
      if (s.defaultSessionMode) setDefaultSessionMode(s.defaultSessionMode);
      if (typeof s.showSessionSummary === "boolean") setShowSessionSummary(s.showSessionSummary);
      if (s.playIntensity) setPlayIntensity(s.playIntensity);
      if (s.triggerWhen) setTriggerWhen(s.triggerWhen);
      if (s.themeMode === "light" || s.themeMode === "dark") setThemeMode(s.themeMode);
      if (Array.isArray(s.enabledGames)) setEnabledGames(normalizeEnabledGamesList(s.enabledGames));
    }
    window.addEventListener("wnm-settings-changed", onWnmSettings);
    return () => window.removeEventListener("wnm-settings-changed", onWnmSettings);
  }, []);

  async function persist(partial) {
    const merged = await saveExtensionSettings(partial);
    if (!isAuthenticated) return;
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(merged)
    });
  }

  function toggleGame(gameId) {
    const next = enabledGames.includes(gameId)
      ? enabledGames.filter((g) => g !== gameId)
      : [...enabledGames, gameId];
    const normalized = normalizeEnabledGamesList(next.length ? next : ["current"]);
    setEnabledGames(normalized);
    void persist({ enabledGames: normalized });
  }

  if (!ready) {
    return <p className="muted-note">Loading preferences…</p>;
  }

  return (
    <>
      <section className="settings-section" aria-labelledby="settings-appearance">
        <h2 id="settings-appearance">Appearance</h2>
        <div className="setting-row">
          <span className="setting-label">Theme</span>
          <div className="setting-control">
            <select
              className="input"
              value={themeMode}
              onChange={(e) => {
                const v = e.target.value;
                setThemeMode(v);
                persist({ themeMode: v });
              }}
              aria-label="Color theme"
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="settings-extension">
        <h2 id="settings-extension">Extension</h2>
        <div className="setting-row">
          <span className="setting-label">Overlay while ChatGPT generates</span>
          <button
            type="button"
            className="toggle"
            aria-checked={overlayWhileGenerating}
            aria-label="Overlay while ChatGPT generates"
            onClick={() => {
              const next = !overlayWhileGenerating;
              setOverlayWhileGenerating(next);
              persist({ overlayWhileGenerating: next });
            }}
          />
        </div>
        <div className="setting-row">
          <span className="setting-label">Default mode on session start</span>
          <div className="setting-control">
            <select
              className="input"
              value={defaultSessionMode}
              onChange={(e) => {
                const v = e.target.value;
                setDefaultSessionMode(v);
                persist({ defaultSessionMode: v });
              }}
              aria-label="Default mode on session start"
            >
              <option value="play">Play</option>
              <option value="brain">Brain</option>
              <option value="focus">Focus</option>
            </select>
          </div>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="settings-play">
        <h2 id="settings-play">Play mode</h2>
        <div className="setting-row setting-row--stack">
          <div className="setting-label-block">
            <span className="setting-label" id="label-intensity">
              Intensity
            </span>
            <span className="setting-hint">Targets, visibility, and pace — calmer to sharper.</span>
          </div>
          <div className="setting-control">
            <select
              className="input"
              value={playIntensity}
              onChange={(e) => {
                const v = e.target.value;
                setPlayIntensity(v);
                persist({ playIntensity: v });
              }}
              aria-labelledby="label-intensity"
            >
              <option value="chill">Chill — slower, less pressure</option>
              <option value="normal">Normal — balanced</option>
              <option value="intense">Intense — faster, more demanding</option>
            </select>
          </div>
        </div>
        <div className="setting-row setting-row--stack">
          <div className="setting-label-block">
            <span className="setting-label" id="label-trigger">
              When to show overlay
            </span>
            <span className="setting-hint">Smart waits until a reply is taking a few seconds.</span>
          </div>
          <div className="setting-control">
            <select
              className="input"
              value={triggerWhen}
              onChange={(e) => {
                const v = e.target.value;
                setTriggerWhen(v);
                persist({ triggerWhen: v });
              }}
              aria-labelledby="label-trigger"
            >
              <option value="always">Always — every generation</option>
              <option value="smart">Smart — longer replies only (~3s+)</option>
            </select>
          </div>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="settings-games">
        <h2 id="settings-games">Games</h2>
        <p className="setting-hint" style={{ marginTop: 0, marginBottom: 12 }}>
          While a reply generates, Keel picks one of the games you enable here (random each time). At least one stays on.
        </p>
        {GAME_OPTIONS.map((g) => (
          <div key={g.id} className="setting-row setting-row--stack">
            <div className="setting-label-block">
              <span className="setting-label" id={`label-game-${g.id}`}>
                {g.label}
              </span>
              <span className="setting-hint">{g.hint}</span>
            </div>
            <div className="setting-control">
              <button
                type="button"
                className="toggle"
                aria-labelledby={`label-game-${g.id}`}
                aria-checked={enabledGames.includes(g.id)}
                onClick={() => toggleGame(g.id)}
              />
            </div>
          </div>
        ))}
      </section>

      <section className="settings-section" aria-labelledby="settings-session">
        <h2 id="settings-session">Session</h2>
        <div className="setting-row">
          <span className="setting-label">End-of-session summary</span>
          <button
            type="button"
            className="toggle"
            aria-checked={showSessionSummary}
            aria-label="End-of-session summary"
            onClick={() => {
              const next = !showSessionSummary;
              setShowSessionSummary(next);
              persist({ showSessionSummary: next });
            }}
          />
        </div>
      </section>

      <p className="muted-note">
        Saved as <code>{EXTENSION_SETTINGS_STORAGE_KEY}</code> in this site&apos;s localStorage. With{" "}
        <code>NEXT_PUBLIC_EXTENSION_ID</code> set (from <code>chrome://extensions</code>), changes push to Keel via{" "}
        <code>chrome.storage.local</code> — on ChatGPT, the strip and theme update without reloading the tab. Default
        session mode and summary apply on the <strong>next</strong> generation. If push fails, use Keel{" "}
        <strong>Options</strong> or add this site under <code>externally_connectable</code> in the extension manifest.
      </p>
    </>
  );
}
