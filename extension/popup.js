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

  async function refresh() {
    const openUrl = await resolveKeelOpenUrl();
    const data = await chrome.storage.local.get(KEEL_API_AUTH_KEY);
    const auth = data[KEEL_API_AUTH_KEY];
    const needSync = isAuthMissingOrExpired(auth);

    if (!openUrl) {
      btn.disabled = true;
      if (iconBtn) iconBtn.disabled = true;
      btn.textContent = "Set Keel URL in manifest";
      hint.textContent = "Add homepage_url to manifest.json (see README).";
      noUrl.hidden = false;
      return;
    }

    noUrl.hidden = true;
    btn.disabled = false;
    if (iconBtn) iconBtn.disabled = false;
    btn.textContent = needSync ? "Open Keel to sync login" : "Open Keel";
    hint.textContent = needSync
      ? "Opens Keel in a new tab so your session can sync to this extension."
      : "Opens your Keel site in a new tab.";
  }

  btn.addEventListener("click", async () => {
    const openUrl = await resolveKeelOpenUrl();
    if (!openUrl) return;
    openKeelTab(openUrl);
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
