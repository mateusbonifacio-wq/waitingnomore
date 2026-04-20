/**
 * Google Gemini (gemini.google.com) — generation detection.
 * DOM changes over time; keep selectors defensive and update here when needed.
 * Loaded before content.js; registers globalThis.__KEEL_GENERATION_API.
 */
(() => {
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
    if (!button || !(button instanceof Element)) return false;
    const label = (button.getAttribute("aria-label") || "").toLowerCase();
    const title = (button.getAttribute("title") || "").toLowerCase();
    const text = (button.textContent || "").trim().toLowerCase();
    if (label.includes("stop") && (label.includes("generat") || label.includes("response") || label.includes("stream")))
      return true;
    if (label === "stop" || title === "stop") return true;
    if (text === "stop" && text.length <= 12) return true;
    if (label.includes("cancel") && label.includes("generat")) return true;
    return false;
  }

  function hasVisibleStopControl() {
    return Array.from(document.querySelectorAll("button, [role='button']")).some(
      (el) => isStopGenerationControl(el) && isElementInteractable(el)
    );
  }

  /** Best-effort streaming / in-flight UI (Gemini markup varies by experiment). */
  function hasStreamingDomSignals() {
    if (document.querySelector('[aria-busy="true"]')) return true;
    if (document.querySelector(".mat-mdc-progress-bar[mode='indeterminate']")) return true;
    if (document.querySelector("mat-progress-bar[mode='indeterminate']")) return true;
    const candidates = document.querySelectorAll("[class*='streaming' i], [class*='thinking' i], [data-is-streaming='true']");
    return candidates.length > 0;
  }

  function detectGeneratingState() {
    if (hasVisibleStopControl()) return true;
    if (hasStreamingDomSignals()) return true;
    return false;
  }

  globalThis.__KEEL_GENERATION_API = {
    siteId: "gemini",
    isStopGenerationControl,
    detectGeneratingState
  };
})();
