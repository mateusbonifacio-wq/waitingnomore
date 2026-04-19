"use client";

import { useEffect, useState } from "react";
import {
  defaultExtensionSettings,
  EXTENSION_SETTINGS_STORAGE_KEY,
  loadExtensionSettings,
  saveExtensionSettings
} from "../lib/extensionSettings";

export default function SettingsForm() {
  const [ready, setReady] = useState(false);
  const [overlayWhileGenerating, setOverlayWhileGenerating] = useState(defaultExtensionSettings.overlayWhileGenerating);
  const [defaultSessionMode, setDefaultSessionMode] = useState(defaultExtensionSettings.defaultSessionMode);
  const [showSessionSummary, setShowSessionSummary] = useState(defaultExtensionSettings.showSessionSummary);
  const [playIntensity, setPlayIntensity] = useState(defaultExtensionSettings.playIntensity);
  const [triggerWhen, setTriggerWhen] = useState(defaultExtensionSettings.triggerWhen);
  const [themeMode, setThemeMode] = useState(defaultExtensionSettings.themeMode);

  useEffect(() => {
    const s = loadExtensionSettings();
    setOverlayWhileGenerating(s.overlayWhileGenerating);
    setDefaultSessionMode(s.defaultSessionMode);
    setShowSessionSummary(s.showSessionSummary);
    setPlayIntensity(s.playIntensity);
    setTriggerWhen(s.triggerWhen);
    setThemeMode(s.themeMode);
    setReady(true);
  }, []);

  function persist(partial) {
    saveExtensionSettings(partial);
  }

  if (!ready) {
    return <p className="muted-note">Loading preferences…</p>;
  }

  return (
    <>
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
        <code>NEXT_PUBLIC_EXTENSION_ID</code> set to your extension ID (from chrome://extensions), changes also push
        live to the extension via <code>chrome.storage.local</code> — open ChatGPT and change theme, intensity, or
        trigger: the overlay strip and colors should update within about a second, no tab reload. Default session mode
        and summary toggle apply on the <strong>next</strong> generation session. If push fails, use the extension{" "}
        <strong>Options</strong> page or add your site origin to <code>externally_connectable</code> in the extension
        manifest.
      </p>
    </>
  );
}
