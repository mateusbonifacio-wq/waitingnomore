"use client";

import { useState } from "react";
import { fetchFullSettingsFromExtension } from "../lib/extensionSettings";

export default function ExtensionInstallPanel({ isAuthenticated }) {
  const [status, setStatus] = useState("");
  const [checking, setChecking] = useState(false);

  async function verifyExtension() {
    setChecking(true);
    setStatus("Checking extension connection...");
    try {
      const result = await fetchFullSettingsFromExtension();
      if (!result.ok) {
        setStatus(`Could not reach extension: ${result.reason || "unknown error"}`);
        return;
      }
      setStatus("Extension connected. Settings bridge is active.");
      if (isAuthenticated) {
        await fetch("/api/extension-install", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source: "web_install_page", extensionDetected: true })
        });
      }
    } catch (err) {
      setStatus(err?.message || "Could not verify extension connection.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <section className="settings-section">
      <h2>Verify install</h2>
      <p className="muted-note">
        After loading the unpacked extension in Chrome, click verify. This confirms that your web app can reach the
        extension bridge.
      </p>
      <button type="button" className="btn btn-primary" onClick={verifyExtension} disabled={checking}>
        {checking ? "Checking..." : "Verify extension connection"}
      </button>
      {status ? <p className="muted-note">{status}</p> : null}
    </section>
  );
}
