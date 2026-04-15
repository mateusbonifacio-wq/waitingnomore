"use client";

import { useState } from "react";

export default function SettingsForm() {
  const [extensionEnabled, setExtensionEnabled] = useState(true);
  const [defaultMode, setDefaultMode] = useState("play");
  const [showSummary, setShowSummary] = useState(true);
  const [soundHints, setSoundHints] = useState(false);

  return (
    <>
      <section className="settings-section" aria-labelledby="settings-general">
        <h2 id="settings-general">Extension</h2>
        <div className="setting-row">
          <span className="setting-label">Enable overlay while ChatGPT generates</span>
          <button
            type="button"
            className="toggle"
            aria-checked={extensionEnabled}
            aria-label="Toggle extension"
            onClick={() => setExtensionEnabled((v) => !v)}
          />
        </div>
        <div className="setting-row">
          <span className="setting-label">Default mode on session start</span>
          <div className="setting-control">
            <select
              className="input"
              value={defaultMode}
              onChange={(e) => setDefaultMode(e.target.value)}
              aria-label="Default mode"
            >
              <option value="play">Play</option>
              <option value="brain">Brain</option>
              <option value="focus">Focus</option>
            </select>
          </div>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="settings-session">
        <h2 id="settings-session">Session</h2>
        <div className="setting-row">
          <span className="setting-label">Show end-of-session summary</span>
          <button
            type="button"
            className="toggle"
            aria-checked={showSummary}
            aria-label="Toggle session summary"
            onClick={() => setShowSummary((v) => !v)}
          />
        </div>
        <div className="setting-row">
          <span className="setting-label">Sound hints (future)</span>
          <button
            type="button"
            className="toggle"
            aria-checked={soundHints}
            aria-label="Toggle sound hints"
            onClick={() => setSoundHints((v) => !v)}
          />
        </div>
      </section>

      <p className="muted-note">
        These controls are local placeholders for the MVP. Sync with the extension and account preferences will ship
        when the backend is connected.
      </p>
    </>
  );
}
