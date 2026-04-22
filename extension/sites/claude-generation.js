/**
 * Claude (claude.ai) — generation detection for Keel overlay.
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

  /**
   * Claude's active chat pages keep a composer region present.
   * We use this to avoid false positives on auth/landing pages.
   */
  function inActiveChatContext() {
    if (!location.hostname.endsWith("claude.ai")) return false;
    const path = location.pathname || "";
    const maybeChatPath = path.startsWith("/chat") || path.startsWith("/new");
    const hasComposer =
      !!document.querySelector("fieldset div[contenteditable='true']") ||
      !!document.querySelector("div[contenteditable='true'][data-placeholder]") ||
      !!document.querySelector("form textarea") ||
      !!document.querySelector("button[aria-label*='Send' i]");
    return maybeChatPath || hasComposer;
  }

  function isStopGenerationControl(button) {
    if (!button || !(button instanceof Element)) return false;
    const label = (button.getAttribute("aria-label") || "").toLowerCase();
    const title = (button.getAttribute("title") || "").toLowerCase();
    const text = (button.textContent || "").trim().toLowerCase();
    const testId = (button.getAttribute("data-testid") || "").toLowerCase();

    if (testId.includes("stop")) return true;
    if (label.includes("stop") && (label.includes("response") || label.includes("generat") || label.includes("stream")))
      return true;
    if (title.includes("stop") && (title.includes("response") || title.includes("generat"))) return true;
    if (text === "stop" || text === "stop response") return true;
    return false;
  }

  function hasVisibleStopControl() {
    return Array.from(document.querySelectorAll("button, [role='button']")).some(
      (el) => isStopGenerationControl(el) && isElementInteractable(el)
    );
  }

  /**
   * Best-effort streaming signals for Claude:
   * - aria-busy regions
   * - "thinking/streaming/generating" class/test-id hints
   */
  function hasStreamingDomSignals() {
    if (document.querySelector('[aria-busy="true"]')) return true;
    if (document.querySelector("[data-testid*='stream' i], [data-testid*='generat' i], [data-testid*='thinking' i]"))
      return true;
    if (document.querySelector("[class*='stream' i], [class*='generat' i], [class*='thinking' i]")) return true;
    return false;
  }

  function detectGeneratingState() {
    if (!inActiveChatContext()) return false;
    if (hasVisibleStopControl()) return true;
    if (hasStreamingDomSignals()) return true;
    return false;
  }

  globalThis.__KEEL_GENERATION_API = {
    siteId: "claude",
    isStopGenerationControl,
    detectGeneratingState
  };
})();

