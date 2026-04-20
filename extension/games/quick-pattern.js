/**
 * Short arrow pattern — user repeats with directional taps.
 */
(() => {
  globalThis.__KEEL_GAME_CREATORS = globalThis.__KEEL_GAME_CREATORS || {};

  const ARROWS = ["↑", "→", "↓", "←"];
  const KEYS = ["up", "right", "down", "left"];

  globalThis.__KEEL_GAME_CREATORS.quick_pattern = function createQuickPatternGame(ctx) {
    let timers = [];
    let destroyed = false;
    let pattern = [];
    let stepIndex = 0;
    let inputStartedAt = 0;

    function clearTimers() {
      timers.forEach((id) => clearTimeout(id));
      timers = [];
    }

    function buildPattern() {
      const len = 2 + Math.floor(Math.random() * 2);
      const p = [];
      for (let i = 0; i < len; i++) p.push(Math.floor(Math.random() * 4));
      return p;
    }

    function showPhaseThenInput() {
      if (destroyed || !ctx.area.isConnected) return;
      if (!ctx.isPlayMode() || !ctx.isGenerating() || ctx.isCardHidden()) return;

      pattern = buildPattern();
      stepIndex = 0;
      const area = ctx.area;
      area.innerHTML =
        '<div class="quick-pattern">' +
        '<div class="quick-pattern-display" aria-live="polite"></div>' +
        '<div class="quick-pattern-pad" hidden></div></div>';
      const display = area.querySelector(".quick-pattern-display");
      const pad = area.querySelector(".quick-pattern-pad");

      let i = 0;
      function flashNext() {
        if (destroyed || !ctx.isGenerating() || ctx.isCardHidden()) return;
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
            b.dataset.dir = key;
            b.addEventListener("click", (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              if (!ctx.isGenerating() || ctx.isCardHidden()) return;
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
                const t = window.setTimeout(() => {
                  if (!destroyed) showPhaseThenInput();
                }, 520);
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
                const t2 = window.setTimeout(() => {
                  if (!destroyed) showPhaseThenInput();
                }, 380);
                timers.push(t2);
              }
            });
            pad.appendChild(b);
          });
          return;
        }
        display.textContent = ARROWS[pattern[i]];
        i += 1;
        const t = window.setTimeout(flashNext, 320);
        timers.push(t);
      }

      display.textContent = "Watch";
      const t0 = window.setTimeout(flashNext, 240);
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
        clearTimers();
        if (ctx.area) ctx.area.replaceChildren();
      }
    };
  };
})();
