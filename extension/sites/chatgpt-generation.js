/**
 * ChatGPT — generation detection for Keel overlay.
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

  function detectGeneratingState() {
    if (hasVisibleStopControl()) return true;
    if (hasStreamingDomSignals()) return true;
    const stopGen = document.querySelector("[aria-label='Stop generating']");
    return !!(stopGen && isElementInteractable(stopGen));
  }

  globalThis.__KEEL_GENERATION_API = {
    siteId: "chatgpt",
    isStopGenerationControl,
    detectGeneratingState
  };
})();
