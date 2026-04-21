/**
 * Short arrow pattern — user repeats with directional taps or arrow keys.
 * Keyboard uses capture on window so ChatGPT/Gemini inputs do not swallow arrows first.
 */
(() => {
  globalThis.__KEEL_GAME_CREATORS = globalThis.__KEEL_GAME_CREATORS || {};

  const ARROWS = ["↑", "→", "↓", "←"];
  const KEYS = ["up", "right", "down", "left"];

  /** @param {KeyboardEvent} e */
  function arrowIndexFromKey(e) {
    const c = e.code;
    if (c === "ArrowUp") return 0;
    if (c === "ArrowRight") return 1;
    if (c === "ArrowDown") return 2;
    if (c === "ArrowLeft") return 3;
    return -1;
  }

  globalThis.__KEEL_GAME_CREATORS.quick_pattern = function createQuickPatternGame(ctx) {
    let timers = [];
    let destroyed = false;
    let pattern = [];
    let stepIndex = 0;
    let inputStartedAt = 0;
    /** True only while the user may enter the sequence (after "Your turn"). */
    let acceptingInput = false;
    /** @type {((e: KeyboardEvent) => void) | null} */
    let keyHandler = null;

    function clearTimers() {
      timers.forEach((id) => clearTimeout(id));
      timers = [];
    }

    function detachKeyCapture() {
      if (keyHandler) {
        window.removeEventListener("keydown", keyHandler, true);
        keyHandler = null;
      }
      acceptingInput = false;
    }

    function buildPattern() {
      const pace = globalThis.__KEEL_playPace;
      const bounds =
        typeof pace?.patternLengthBounds === "function" ? pace.patternLengthBounds(ctx) : { min: 2, max: 3 };
      const span = Math.max(1, bounds.max - bounds.min + 1);
      const len = bounds.min + Math.floor(Math.random() * span);
      const p = [];
      for (let i = 0; i < len; i++) p.push(Math.floor(Math.random() * 4));
      return p;
    }

    /**
     * @param {number} idx 0–3 = up,right,down,left
     * @param {KeyboardEvent | PointerEvent | null} ev optional — for preventDefault on keys
     */
    function applyStep(idx, ev) {
      if (destroyed || !acceptingInput || !ctx.area?.isConnected) return;
      if (!ctx.isPlayMode() || !ctx.isGenerating() || ctx.isCardHidden()) return;

      const display = ctx.area.querySelector(".quick-pattern-display");
      const pad = ctx.area.querySelector(".quick-pattern-pad");
      if (!display || !pad) return;

      const pace = globalThis.__KEEL_playPace;
      const ms = (n, min) => (typeof pace?.scaleMs === "function" ? pace.scaleMs(ctx, n, min) : n);

      const expected = pattern[stepIndex];
      if (idx !== expected) {
        ctx.runtimeStats.playMisses += 1;
        ctx.trackEvent("play_miss", {
          microGame: ctx.gameId,
          totalMisses: ctx.runtimeStats.playMisses,
          totalHits: ctx.runtimeStats.hits
        });
        ctx.updateHud();
        display.textContent = "Again";
        detachKeyCapture();
        const t = window.setTimeout(() => {
          if (!destroyed) showPhaseThenInput();
        }, ms(520, 120));
        timers.push(t);
        return;
      }

      stepIndex += 1;
      if (stepIndex >= pattern.length) {
        const reactionMs = Math.round(performance.now() - inputStartedAt);
        ctx.runtimeStats.reactionMsSamples.push(reactionMs);
        ctx.runtimeStats.hits += 1;
        ctx.trackEvent("play_hit", { microGame: ctx.gameId, totalHits: ctx.runtimeStats.hits, reactionMs });
        ctx.updateHud();
        display.textContent = "Nice";
        detachKeyCapture();
        const t2 = window.setTimeout(() => {
          if (!destroyed) showPhaseThenInput();
        }, ms(380, 80));
        timers.push(t2);
        return;
      }

      if (ev && "key" in ev) {
        ev.preventDefault();
        ev.stopPropagation();
      }
    }

    function attachKeyCapture() {
      detachKeyCapture();
      acceptingInput = true;
      keyHandler = (e) => {
        if (destroyed || !acceptingInput) return;
        if (!ctx.isPlayMode() || !ctx.isGenerating() || ctx.isCardHidden()) return;
        if (e.repeat) return;
        const idx = arrowIndexFromKey(e);
        if (idx < 0) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        applyStep(idx, e);
      };
      window.addEventListener("keydown", keyHandler, true);
    }

    function showPhaseThenInput() {
      detachKeyCapture();
      if (destroyed || !ctx.area.isConnected) return;
      if (!ctx.isPlayMode() || !ctx.isGenerating() || ctx.isCardHidden()) return;

      pattern = buildPattern();
      stepIndex = 0;
      const area = ctx.area;
      area.innerHTML =
        '<div class="quick-pattern" tabindex="-1">' +
        '<div class="quick-pattern-display" aria-live="polite"></div>' +
        '<div class="quick-pattern-pad" hidden></div></div>';
      const root = area.querySelector(".quick-pattern");
      const display = area.querySelector(".quick-pattern-display");
      const pad = area.querySelector(".quick-pattern-pad");

      const pace = globalThis.__KEEL_playPace;
      const ms = (n, min) => (typeof pace?.scaleMs === "function" ? pace.scaleMs(ctx, n, min) : n);

      let i = 0;
      function flashNext() {
        if (destroyed || !ctx.area.isConnected) return;
        if (i < pattern.length && (!ctx.isGenerating() || ctx.isCardHidden())) return;

        if (i >= pattern.length) {
          display.textContent = "Your turn";
          pad.hidden = false;
          pad.innerHTML = "";
          inputStartedAt = performance.now();
          KEYS.forEach((_key, idx) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "brain-answer quick-pattern-btn";
            b.textContent = ARROWS[idx];
            b.dataset.dir = KEYS[idx];
            b.setAttribute("aria-label", `Direction ${ARROWS[idx]}`);
            b.addEventListener("click", (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              applyStep(idx, null);
            });
            pad.appendChild(b);
          });
          if (root && typeof root.focus === "function") {
            try {
              root.focus({ preventScroll: true });
            } catch (_e) {
              root.focus();
            }
          }
          attachKeyCapture();
          return;
        }
        display.textContent = ARROWS[pattern[i]];
        i += 1;
        const t = window.setTimeout(flashNext, ms(320, 48));
        timers.push(t);
      }

      display.textContent = "Watch";
      const t0 = window.setTimeout(flashNext, ms(240, 60));
      timers.push(t0);
    }

    return {
      init() {},
      render() {
        ctx.updateHud();
        showPhaseThenInput();
      },
      destroy() {
        destroyed = true;
        detachKeyCapture();
        clearTimers();
        if (ctx.area) ctx.area.replaceChildren();
      }
    };
  };
})();
