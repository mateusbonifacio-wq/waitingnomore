/**
 * ChatGPT — generation detection for Keel overlay.
 * Loaded before content.js; registers globalThis.__KEEL_GENERATION_API.
 */
(() => {
  const NS = "[Keel ChatGPT]";

  /** How long "not generating" must hold before we report end (avoids false ends on stream gaps). */
  const STABLE_END_MS = 1600;

  function dlog(msg, extra) {
    if (typeof console === "object" && typeof console.log === "function") {
      if (extra !== undefined) console.log(NS, msg, extra);
      else console.log(NS, msg);
    }
  }

  function isElementInteractable(el) {
    if (!el || !(el instanceof Element)) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return false;
    const style = globalThis.getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") return false;
    if (Number(style.opacity) === 0) return false;
    if (style.pointerEvents === "none") return false;
    return true;
  }

  function isStopGenerationControl(button) {
    const testId = (button.getAttribute("data-testid") || "").toLowerCase();
    const label = (button.getAttribute("aria-label") || "").toLowerCase();
    const text = (button.textContent || "").trim().toLowerCase();
    if (testId.includes("stop-button") || (testId.includes("stop") && testId.includes("button"))) return true;
    if (label.includes("stop generating")) return true;
    if (text === "stop" || text === "stop generating") return true;
    return false;
  }

  function hasVisibleStopControl() {
    return Array.from(document.querySelectorAll("button")).some(
      (button) => isStopGenerationControl(button) && isElementInteractable(button)
    );
  }

  function hasStreamingDomSignals() {
    if (document.querySelector(".result-streaming")) return true;
    if (document.querySelector('[data-is-streaming="true"]')) return true;
    if (document.querySelector("[aria-live='assertive'] .result-streaming")) return true;
    return false;
  }

  function snapshotIsGenerating() {
    if (hasVisibleStopControl()) return true;
    if (hasStreamingDomSignals()) return true;
    const stopGen = document.querySelector("[aria-label='Stop generating']");
    return !!(stopGen && isElementInteractable(stopGen));
  }

  let inGenerationCycle = false;
  let pendingEndSince = null;
  let wasSnapTrue = false;

  function detectGeneratingState() {
    const snap = snapshotIsGenerating();
    if (snap) {
      if (wasSnapTrue === false) {
        dlog("generation start detected");
      }
      wasSnapTrue = true;
      inGenerationCycle = true;
      if (pendingEndSince != null) {
        dlog("pending end cancelled, generation resumed");
      }
      pendingEndSince = null;
      return true;
    }

    if (!inGenerationCycle) {
      wasSnapTrue = false;
      return false;
    }

    if (pendingEndSince == null) {
      dlog("possible generation end detected (instant signals show idle)");
      pendingEndSince = Date.now();
      dlog("entering pending end (stable-end debounce)", { ms: STABLE_END_MS });
    }

    const held = Date.now() - pendingEndSince;
    if (held < STABLE_END_MS) {
      return true;
    }

    dlog("stable end confirmed (idle held through debounce window)", { heldMs: Math.round(held) });
    dlog("session finalized (host overlay will end generation on next poll)");
    inGenerationCycle = false;
    pendingEndSince = null;
    wasSnapTrue = false;
    return false;
  }

  globalThis.__KEEL_GENERATION_API = {
    siteId: "chatgpt",
    isStopGenerationControl,
    detectGeneratingState
  };
})();
