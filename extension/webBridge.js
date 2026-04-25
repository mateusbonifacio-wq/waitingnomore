/**
 * Runs on the Keel web app origin only. Bridges window.postMessage <-> extension background
 * so testers never need NEXT_PUBLIC_EXTENSION_ID on pages where this script is injected.
 */
(() => {
  const WEB = "keel-web";
  const EXT = "keel-extension";
  const allowedOrigin = window.location.origin;

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.origin !== allowedOrigin) return;
    const msg = event.data;
    if (!msg || msg.source !== WEB || typeof msg.nonce !== "string" || typeof msg.kind !== "string") return;

    function reply(payload) {
      window.postMessage({ source: EXT, nonce: msg.nonce, ...payload }, allowedOrigin);
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
      return;
    }

    if (msg.kind === "push-keel-api-auth") {
      chrome.runtime.sendMessage(
        {
          type: "wnm-push-keel-api-auth",
          accessToken: msg.accessToken,
          refreshToken: msg.refreshToken || null,
          expiresAt: msg.expiresAt || null,
          apiOrigin: msg.apiOrigin
        },
        (response) => {
          const err = chrome.runtime.lastError?.message || null;
          reply({ ok: !err && response && response.ok !== false, response: response || null, error: err });
        }
      );
      return;
    }

    if (msg.kind === "clear-keel-api-auth") {
      chrome.runtime.sendMessage({ type: "wnm-clear-keel-api-auth" }, (response) => {
        const err = chrome.runtime.lastError?.message || null;
        reply({ ok: !err && response && response.ok !== false, response: response || null, error: err });
      });
      return;
    }
  });
})();
