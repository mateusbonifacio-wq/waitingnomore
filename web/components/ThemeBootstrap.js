"use client";

import { useEffect } from "react";
import { syncThemeFromExtensionOnLoad } from "../lib/extensionSettings";

/** Applies saved + extension-synced theme on first client paint (no reload). */
export default function ThemeBootstrap() {
  useEffect(() => {
    void syncThemeFromExtensionOnLoad();
  }, []);
  return null;
}
