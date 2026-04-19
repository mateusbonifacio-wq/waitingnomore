"use client";

import { useEffect, useState } from "react";
import { loadExtensionSettings, saveExtensionSettings } from "../lib/extensionSettings";

export default function ThemeToggle() {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    setTheme(loadExtensionSettings().themeMode);
    function onWnmSettings(e) {
      const d = e.detail;
      if (d && (d.themeMode === "light" || d.themeMode === "dark")) {
        setTheme(d.themeMode);
      }
    }
    window.addEventListener("wnm-settings-changed", onWnmSettings);
    return () => window.removeEventListener("wnm-settings-changed", onWnmSettings);
  }, []);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    void saveExtensionSettings({ themeMode: next });
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
      title={theme === "light" ? "Dark mode" : "Light mode"}
    >
      <span className="theme-toggle__track" aria-hidden="true">
        <span className="theme-toggle__thumb" />
      </span>
      <span className="theme-toggle__label">{theme === "light" ? "Light" : "Dark"}</span>
    </button>
  );
}
