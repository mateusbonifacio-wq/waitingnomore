/**
 * Runs on the Keel web app origin only. Bridges window.postMessage <-> extension background
 * so testers never need NEXT_PUBLIC_EXTENSION_ID on pages where this script is injected.
 */
(() => {
  const WEB = "keel-web";
  const EXT = "keel-extension";

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== WEB || typeof msg.nonce !== "string" || typeof msg.kind !== "string") return;

    function reply(payload) {
      window.postMessage({ source: EXT, nonce: msg.nonce, ...payload }, "*");
    }

    if (msg.kind === "verify") {
      reply({ ok: true, version: chrome.runtime.getManifest().version, error: null, response: null });
      return;
    }

    if (msg.kind === "push-settings") {
      chrome.runtime.sendMessage({ type: "wnm-settings-v1", settings: msg.settings }, (response) => {
        const err = chrome.runtime.lastError?.message || null;
        reply({ ok: !err && response && response.ok !== false, response: response || null, error: err });
      });
      return;
    }

    if (msg.kind === "get-theme") {
      chrome.runtime.sendMessage({ type: "wnm-get-theme-v1" }, (response) => {
        const err = chrome.runtime.lastError?.message || null;
        reply({ ok: !err, response: response || null, error: err });
      });
      return;
    }

    if (msg.kind === "get-settings") {
      chrome.runtime.sendMessage({ type: "wnm-get-settings-v1" }, (response) => {
        const err = chrome.runtime.lastError?.message || null;
        reply({ ok: !err, response: response || null, error: err });
      });
    }
  });
})();
