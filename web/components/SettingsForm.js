"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BRAIN_TOPIC_OPTIONS,
  defaultExtensionSettings,
  EXTENSION_SETTINGS_STORAGE_KEY,
  loadExtensionSettings,
  normalizeEnabledGamesList,
  normalizeEnabledTopicsList,
  saveExtensionSettings
} from "../lib/extensionSettings";

const GAME_OPTIONS = [
  { id: "current", label: "Reaction targets", hint: "Original tap game." },
  { id: "keep_alive", label: "Keep alive", hint: "Tap before the dot lands." },
  { id: "quick_pattern", label: "Quick pattern", hint: "Watch arrows, repeat the sequence." },
  { id: "micro_memory", label: "Micro memory", hint: "Flash of symbols, pick the pair you saw." }
];

const BRAIN_TOPIC_IDS = BRAIN_TOPIC_OPTIONS.map((t) => t.id);
const SECTION_ORDER = ["general", "experience", "games", "brain", "focus"];
const SECTION_LABELS = {
  general: "General",
  experience: "Experience",
  games: "Games",
  brain: "Brain Mode",
  focus: "Focus Mode"
};

export default function SettingsForm({ isAuthenticated = false, userEmail = "", initialCloudSettings = null }) {
  const [ready, setReady] = useState(false);
  const [activeSection, setActiveSection] = useState("general");
  const [overlayWhileGenerating, setOverlayWhileGenerating] = useState(defaultExtensionSettings.overlayWhileGenerating);
  const [defaultSessionMode, setDefaultSessionMode] = useState(defaultExtensionSettings.defaultSessionMode);
  const [showSessionSummary, setShowSessionSummary] = useState(defaultExtensionSettings.showSessionSummary);
  const [playIntensity, setPlayIntensity] = useState(defaultExtensionSettings.playIntensity);
  const [triggerWhen, setTriggerWhen] = useState(defaultExtensionSettings.triggerWhen);
  const [themeMode, setThemeMode] = useState(defaultExtensionSettings.themeMode);
  const [enabledGames, setEnabledGames] = useState(defaultExtensionSettings.enabledGames);
  const [enabledTopics, setEnabledTopics] = useState(defaultExtensionSettings.enabledTopics);
  const [focusModeEnabled, setFocusModeEnabled] = useState(defaultExtensionSettings.focusModeEnabled);

  useEffect(() => {
    const s = loadExtensionSettings();
    setOverlayWhileGenerating(s.overlayWhileGenerating);
    setDefaultSessionMode(s.defaultSessionMode);
    setShowSessionSummary(s.showSessionSummary);
    setPlayIntensity(s.playIntensity);
    setTriggerWhen(s.triggerWhen);
    setThemeMode(s.themeMode);
    setEnabledGames(normalizeEnabledGamesList(s.enabledGames));
    setEnabledTopics(normalizeEnabledTopicsList(s.enabledTopics));
    setFocusModeEnabled(Boolean(s.focusModeEnabled));
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
    setEnabledTopics(normalizeEnabledTopicsList(s.enabledTopics));
    setFocusModeEnabled(typeof s.focusModeEnabled === "boolean" ? s.focusModeEnabled : defaultExtensionSettings.focusModeEnabled);
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
      if (Array.isArray(s.enabledTopics)) setEnabledTopics(normalizeEnabledTopicsList(s.enabledTopics));
      if (typeof s.focusModeEnabled === "boolean") setFocusModeEnabled(s.focusModeEnabled);
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

  function topicToggleOn(topicId) {
    if (enabledTopics.length === 0) return true;
    return enabledTopics.includes(topicId);
  }

  function toggleBrainTopic(topicId) {
    let next;
    if (enabledTopics.length === 0) {
      next = BRAIN_TOPIC_IDS.filter((id) => id !== topicId);
    } else if (enabledTopics.includes(topicId)) {
      next = enabledTopics.filter((id) => id !== topicId);
    } else {
      next = [...enabledTopics, topicId];
    }
    if (next.length === 0 || next.length >= BRAIN_TOPIC_IDS.length) {
      next = [];
    }
    const normalized = normalizeEnabledTopicsList(next);
    setEnabledTopics(normalized);
    void persist({ enabledTopics: normalized });
  }

  if (!ready) {
    return <p className="muted-note">Loading preferences…</p>;
  }

  return (
    <>
      <div className="settings-shell">
        <aside className="settings-sidebar" aria-label="Settings sections">
          <p className="settings-sidebar-title">Sections</p>
          <nav className="settings-sidebar-nav">
            {SECTION_ORDER.map((id) => (
              <button
                key={id}
                type="button"
                className="settings-nav-item"
                aria-current={activeSection === id ? "page" : undefined}
                onClick={() => setActiveSection(id)}
              >
                {SECTION_LABELS[id]}
              </button>
            ))}
          </nav>
        </aside>

        <div className="settings-panel">
          {activeSection === "general" ? (
            <section className="settings-section" aria-labelledby="settings-general">
              <h2 id="settings-general" className="settings-category-title">
                General
              </h2>
              <p className="section-lead">Account-level actions and sync status.</p>
              {isAuthenticated ? (
                <div className="settings-account-block">
                  <p className="settings-account-line">
                    Signed in as <strong className="settings-account-email">{userEmail}</strong>
                  </p>
                  <form action="/auth/signout" method="post" className="settings-account-actions">
                    <button type="submit" className="btn btn-ghost">
                      Log out
                    </button>
                  </form>
                  <p className="muted-note settings-account-hint">
                    Preferences in other sections sync to your account and are mirrored in localStorage for the extension.
                  </p>
                </div>
              ) : (
                <div className="settings-account-block">
                  <p className="settings-account-line">
                    You are not signed in. Preferences stay local until you{" "}
                    <Link href="/login?next=/settings" prefetch={false}>
                      sign in
                    </Link>
                    .
                  </p>
                </div>
              )}
            </section>
          ) : null}

          {activeSection === "experience" ? (
            <section className="settings-section" aria-labelledby="settings-experience">
              <h2 id="settings-experience" className="settings-category-title">
                Experience
              </h2>
              <p className="section-lead">Overlay, theme, and how Keel behaves while a reply is generating.</p>

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

              <div className="setting-row setting-row--stack">
                <div className="setting-label-block">
                  <span className="setting-label" id="label-intensity">
                    Play intensity
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
          ) : null}

          {activeSection === "games" ? (
            <section className="settings-section" aria-labelledby="settings-games">
              <h2 id="settings-games" className="settings-category-title">
                Games
              </h2>
              <p className="section-lead">In Play mode, Keel picks one enabled game per wait. At least one stays on.</p>
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
          ) : null}

          {activeSection === "brain" ? (
            <section className="settings-section" aria-labelledby="settings-brain">
              <h2 id="settings-brain" className="settings-category-title">
                Brain Mode
              </h2>
              <p className="section-lead">
                Short multiple-choice prompts. All topics on by default; turn topics off to narrow the pool.
              </p>
              {BRAIN_TOPIC_OPTIONS.map((t) => (
                <div key={t.id} className="setting-row setting-row--stack">
                  <div className="setting-label-block">
                    <span className="setting-label" id={`label-brain-${t.id}`}>
                      {t.label}
                    </span>
                    <span className="setting-hint">{t.hint}</span>
                  </div>
                  <div className="setting-control">
                    <button
                      type="button"
                      className="toggle"
                      aria-labelledby={`label-brain-${t.id}`}
                      aria-checked={topicToggleOn(t.id)}
                      onClick={() => toggleBrainTopic(t.id)}
                    />
                  </div>
                </div>
              ))}
            </section>
          ) : null}

          {activeSection === "focus" ? (
            <section className="settings-section" aria-labelledby="settings-focus">
              <h2 id="settings-focus" className="settings-category-title">
                Focus Mode
              </h2>
              <p className="section-lead">Soft breathing circle while a response is generating.</p>

              <div className="setting-row">
                <span className="setting-label">Enable Focus Mode</span>
                <button
                  type="button"
                  className="toggle"
                  aria-checked={focusModeEnabled}
                  aria-label="Enable Focus Mode"
                  onClick={() => {
                    const next = !focusModeEnabled;
                    setFocusModeEnabled(next);
                    void persist({ focusModeEnabled: next });
                  }}
                />
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <p className="muted-note">
        Preferences save to <code>{EXTENSION_SETTINGS_STORAGE_KEY}</code> in this site&apos;s localStorage. With{" "}
        <code>NEXT_PUBLIC_EXTENSION_ID</code> set, updates also reach Keel on ChatGPT via{" "}
        <code>chrome.storage.local</code> (strip and theme refresh without reloading). Default mode and summary apply on
        the next generation. If sync fails, use Keel <strong>Options</strong> or add this origin under{" "}
        <code>externally_connectable</code> in the extension manifest.
      </p>
    </>
  );
}
