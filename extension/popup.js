/**
 * Popup: open Keel web for login / auth sync.
 * URL resolution: manifest `homepage_url` (production) → last synced `apiOrigin` → DEFAULT_KEEL_WEB_APP_ORIGIN.
 * Keep `homepage_url` in manifest.json aligned with production (same host as `NEXT_PUBLIC_APP_URL` in web/.env).
 */

const KEEL_API_AUTH_KEY = "waitingnomore.keelApiAuth.v1";

/**
 * Last-resort origin if manifest has no homepage_url and extension storage has no apiOrigin yet.
 * Prefer setting `homepage_url` in manifest.json instead (see README).
 */
const DEFAULT_KEEL_WEB_APP_ORIGIN = "";

function normalizeOrigin(raw) {
  if (!raw || typeof raw !== "string") return null;
  const t = raw.trim();
  try {
    const u = new URL(t.includes("://") ? t : `https://${t}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * Full URL from manifest (may include a path).
 * @returns {string | null}
 */
function manifestHomepageOpenUrl() {
  const raw = chrome.runtime.getManifest().homepage_url;
  if (!raw || typeof raw !== "string") return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * @param {unknown} auth
 * @returns {boolean}
 */
function isAuthMissingOrExpired(auth) {
  if (!auth || typeof auth !== "object" || !auth.accessToken || !auth.apiOrigin) return true;
  const exp = auth.expiresAt;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return false;
  const nowSec = Date.now() / 1000;
  return exp <= nowSec + 120;
}

/** @returns {Promise<string | null>} absolute URL to open */
async function resolveKeelOpenUrl() {
  const fromHomepage = manifestHomepageOpenUrl();
  if (fromHomepage) return fromHomepage;

  const data = await chrome.storage.local.get(KEEL_API_AUTH_KEY);
  const auth = data[KEEL_API_AUTH_KEY];
  const fromAuth = normalizeOrigin(auth?.apiOrigin);
  if (fromAuth) return new URL("/", fromAuth).href;

  const fromDefault = normalizeOrigin(DEFAULT_KEEL_WEB_APP_ORIGIN);
  if (fromDefault) return new URL("/", fromDefault).href;

  return null;
}

function openKeelTab(url) {
  chrome.tabs.create({ url, active: true });
}

function init() {
  const btn = document.getElementById("open-keel");
  const iconBtn = document.getElementById("open-keel-icon");
  const hint = document.getElementById("open-keel-hint");
  const noUrl = document.getElementById("open-keel-no-url");
  const title = document.getElementById("popup-title");
  const body = document.getElementById("popup-body");

  async function refresh() {
    const openUrl = await resolveKeelOpenUrl();
    const data = await chrome.storage.local.get(KEEL_API_AUTH_KEY);
    const auth = data[KEEL_API_AUTH_KEY];
    const hasAuth = !!(auth && typeof auth === "object" && auth.accessToken && auth.apiOrigin);
    const expired = hasAuth && isAuthMissingOrExpired(auth);

    if (!openUrl) {
      btn.disabled = true;
      if (iconBtn) iconBtn.disabled = true;
      btn.textContent = "Set Keel URL in manifest";
      if (title) title.textContent = "Connect Keel";
      if (body) body.textContent = "Set homepage_url in the extension manifest to enable web app connection.";
      hint.textContent = "Add homepage_url to manifest.json (see README).";
      noUrl.hidden = false;
      return;
    }

    noUrl.hidden = true;
    btn.disabled = false;
    if (iconBtn) iconBtn.disabled = false;
    if (!hasAuth) {
      if (title) title.textContent = "Connect Keel";
      if (body) {
        body.textContent = "Log in once on the Keel web app to save your scores and appear on the leaderboard.";
      }
      btn.textContent = "Open web app";
      hint.textContent = "Opens Keel in a new tab for login and automatic sync.";
      return;
    }

    if (expired) {
      if (title) title.textContent = "Reconnect Keel";
      if (body) body.textContent = "Your session expired. Log in again to keep saving your progress.";
      btn.textContent = "Reconnect";
      hint.textContent = "Opens Keel in a new tab so you can log in again.";
      return;
    }

    if (title) title.textContent = "Keel is connected";
    if (body) body.textContent = "Your scores and Brain Mode answers will be saved.";
    btn.textContent = "Open dashboard";
    hint.textContent = "Opens your Keel dashboard in a new tab.";
  }

  btn.addEventListener("click", async () => {
    const openUrl = await resolveKeelOpenUrl();
    if (!openUrl) return;
    const data = await chrome.storage.local.get(KEEL_API_AUTH_KEY);
    const auth = data[KEEL_API_AUTH_KEY];
    const hasAuth = !!(auth && typeof auth === "object" && auth.accessToken && auth.apiOrigin);
    const expired = hasAuth && isAuthMissingOrExpired(auth);
    if (hasAuth && !expired) {
      openKeelTab(new URL("/dashboard", openUrl).href);
    } else if (expired) {
      openKeelTab(new URL("/login?next=/dashboard", openUrl).href);
    } else {
      openKeelTab(new URL("/", openUrl).href);
    }
    window.close();
  });

  if (iconBtn) {
    iconBtn.addEventListener("click", async () => {
      const openUrl = await resolveKeelOpenUrl();
      if (!openUrl) return;
      openKeelTab(openUrl);
      window.close();
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[KEEL_API_AUTH_KEY]) return;
    void refresh();
  });

  void refresh();
}

document.addEventListener("DOMContentLoaded", init);
