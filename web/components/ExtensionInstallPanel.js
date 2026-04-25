"use client";

import { useEffect, useState } from "react";
import { verifyKeelExtensionBridge } from "../lib/extensionSettings";

export default function ExtensionInstallPanel({ isAuthenticated }) {
  const [connected, setConnected] = useState(null);
  const [status, setStatus] = useState("");
  const [checking, setChecking] = useState(false);

  async function refreshBridgeStatus() {
    setChecking(true);
    setStatus("Checking extension status…");
    try {
      const result = await verifyKeelExtensionBridge();
      if (!result.ok) {
        setConnected(false);
        setStatus("Install the Chrome extension and log in to start saving progress.");
        return;
      }
      setConnected(true);
      setStatus(
        result.version
          ? `Extension connected (v${result.version}). Log in once and Keel will sync automatically.`
          : "Extension connected. Log in once and Keel will sync automatically."
      );
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

  useEffect(() => {
    void refreshBridgeStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  return (
    <section className="settings-section">
      <h2>Extension status</h2>
      <p className="muted-note">
        Log in once and Keel will connect automatically.
      </p>
      {connected === true ? <p className="muted-note">Extension connected.</p> : null}
      {connected === false ? <p className="muted-note">Install the Chrome extension and log in to start saving progress.</p> : null}
      <button type="button" className="btn btn-ghost" onClick={refreshBridgeStatus} disabled={checking}>
        {checking ? "Checking…" : "Sync again"}
      </button>
      {status ? <p className="muted-note">{status}</p> : null}
    </section>
  );
}
