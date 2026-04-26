/**
 * ChatGPT — generation detection for Keel overlay.
 * Loaded before content.js; registers globalThis.__KEEL_GENERATION_API.
 */
(() => {
  /** How long instant "idle" must hold before we report end (avoids false ends on stream gaps / DOM swaps). */
  const STABLE_END_MS = 2000;
  const NS = "[Keel ChatGPT]";
  const DEBUG_ENABLED = (() => {
    try {
      return globalThis?.localStorage?.keelDebug === "true";
    } catch (_e) {
      return false;
    }
  })();

  function dlog(...args) {
    if (!DEBUG_ENABLED) return;
    if (typeof console === "object" && typeof console.log === "function") {
      console.log(...args);
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

  /** Stop control present in layout but failed strict interactable checks (Mac / zoom / overlay edge cases). */
  function isStopLooselyInLayout(button) {
    if (!button || !(button instanceof Element)) return false;
    if (!isStopGenerationControl(button)) return false;
    if (button.hasAttribute("hidden")) return false;
    const rect = button.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const style = globalThis.getComputedStyle(button);
    if (style.visibility === "hidden" || style.display === "none") return false;
    if (Number(style.opacity) < 0.05) return false;
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
      (button) => isStopGenerationControl(button) && (isElementInteractable(button) || isStopLooselyInLayout(button))
    );
  }

  function hasStreamingDomSignals() {
    if (document.querySelector(".result-streaming")) return true;
    if (document.querySelector('[data-is-streaming="true"]')) return true;
    if (document.querySelector("[aria-live='assertive'] .result-streaming")) return true;
    if (document.querySelector("[class*='result-stream' i], [class*='_streaming' i], [class*='is-streaming' i]"))
      return true;
    if (document.querySelector('[data-testid*="stream" i], [data-testid*="streaming" i]')) return true;
    return false;
  }

  function snapshotSignals() {
    const visibleStop = hasVisibleStopControl();
    const streamingDom = hasStreamingDomSignals();
    const stopGen = document.querySelector("[aria-label='Stop generating']");
    const stopAria = !!(stopGen && (isElementInteractable(stopGen) || isStopLooselyInLayout(stopGen)));
    const generating = visibleStop || streamingDom || stopAria;
    return { generating, visibleStop, streamingDom, stopAria };
  }

  let inGenerationCycle = false;
  let pendingEndSince = null;
  let wasSnapTrue = false;

  function detectGeneratingState() {
    try {
      return detectGeneratingStateInner();
    } catch (_e) {
      if (inGenerationCycle) return true;
      return false;
    }
  }

  function detectGeneratingStateInner() {
    const sig = snapshotSignals();
    const snap = sig.generating;
    dlog(`${NS} generating signal:`, sig);
    if (snap) {
      if (wasSnapTrue === false) dlog(`${NS} start detected`);
      wasSnapTrue = true;
      inGenerationCycle = true;
      if (pendingEndSince != null) dlog(`${NS} end cancelled`);
      pendingEndSince = null;
      return true;
    }

    if (!inGenerationCycle) {
      wasSnapTrue = false;
      return false;
    }

    if (pendingEndSince == null) {
      pendingEndSince = Date.now();
      dlog(`${NS} possible end detected because:`, {
        reason: "all generating signals are false",
        signals: sig
      });
    }

    const held = Date.now() - pendingEndSince;
    if (held < STABLE_END_MS) {
      return true;
    }

    dlog(`${NS} end confirmed because:`, {
      reason: "non-generating signal remained stable through debounce",
      heldMs: Math.round(held),
      requiredMs: STABLE_END_MS
    });
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
