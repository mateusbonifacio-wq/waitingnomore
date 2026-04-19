"use client";

import { useEffect } from "react";
import { syncSettingsFromExtensionOnLoad } from "../lib/extensionSettings";

/** Pulls canonical settings from extension storage on first paint (no reload). */
export default function ThemeBootstrap() {
  useEffect(() => {
    void syncSettingsFromExtensionOnLoad();
  }, []);
  return null;
}
