"use client";

import { useEffect, useState } from "react";
import { loadExtensionSettings, saveExtensionSettings } from "../lib/extensionSettings";

export default function ThemeToggle() {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    setTheme(loadExtensionSettings().themeMode);
    function onWnmTheme(e) {
      if (e.detail?.themeMode === "light" || e.detail?.themeMode === "dark") {
        setTheme(e.detail.themeMode);
      }
    }
    window.addEventListener("wnm-theme-changed", onWnmTheme);
    return () => window.removeEventListener("wnm-theme-changed", onWnmTheme);
  }, []);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    saveExtensionSettings({ themeMode: next });
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
