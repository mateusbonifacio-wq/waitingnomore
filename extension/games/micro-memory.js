/**
 * Briefly show two symbols, then pick the matching pair from four options.
 */
(() => {
  globalThis.__KEEL_GAME_CREATORS = globalThis.__KEEL_GAME_CREATORS || {};

  const POOL = ["♦", "●", "▲", "■", "◆", "◇"];

  globalThis.__KEEL_GAME_CREATORS.micro_memory = function createMicroMemoryGame(ctx) {
    let timers = [];
    let destroyed = false;

    function clearTimers() {
      timers.forEach((id) => clearTimeout(id));
      timers = [];
    }

    function pickTwo() {
      const copy = POOL.slice();
      const a = copy.splice(Math.floor(Math.random() * copy.length), 1)[0];
      const b = copy.splice(Math.floor(Math.random() * copy.length), 1)[0];
      return [a, b];
    }

    function otherPairs(correctA, correctB, count) {
      const out = [];
      const correctKey = `${correctA}${correctB}`;
      const seen = new Set([correctKey]);
      let guard = 0;
      while (out.length < count && guard < 48) {
        guard += 1;
        const [x, y] = pickTwo();
        const key = `${x}${y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push([x, y]);
      }
      return out;
    }

    function nextRound() {
      if (destroyed || !ctx.area.isConnected) return;
      if (!ctx.isPlayMode() || !ctx.isGenerating() || ctx.isCardHidden()) return;

      const [a, b] = pickTwo();
      const correctLabel = `${a}${b}`;
      const wrong = otherPairs(a, b, 3);
      const choices = [{ pair: [a, b], ok: true }, ...wrong.map((pair) => ({ pair, ok: false }))];
      for (let i = choices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [choices[i], choices[j]] = [choices[j], choices[i]];
      }

      const area = ctx.area;
      area.innerHTML =
        '<div class="micro-memory">' +
        '<div class="micro-memory-flash" aria-live="polite"></div>' +
        '<div class="micro-memory-pad" hidden></div></div>';
      const flash = area.querySelector(".micro-memory-flash");
      const pad = area.querySelector(".micro-memory-pad");

      flash.textContent = "";
      pad.hidden = true;
      pad.innerHTML = "";

      const plan =
        globalThis.__KEEL_playPace && typeof globalThis.__KEEL_playPace.memoryFlashPlan === "function"
          ? globalThis.__KEEL_playPace.memoryFlashPlan(ctx)
          : {
              beforeFirst: 120,
              symbolGap: 500,
              afterSymbolsToPick: 160,
              afterAnswerNext: 420
            };
      const tShowA = plan.beforeFirst;
      const tShowB = tShowA + plan.symbolGap;
      const tClear = tShowB + plan.symbolGap;
      const tPick = tClear + plan.afterSymbolsToPick;

      const t1 = window.setTimeout(() => {
        if (destroyed || !ctx.isGenerating()) return;
        flash.textContent = a;
      }, tShowA);
      timers.push(t1);

      const t2 = window.setTimeout(() => {
        if (destroyed || !ctx.isGenerating()) return;
        flash.textContent = b;
      }, tShowB);
      timers.push(t2);

      const t3 = window.setTimeout(() => {
        if (destroyed || !ctx.isGenerating()) return;
        flash.textContent = "";
      }, tClear);
      timers.push(t3);

      const pickShownAt = { t: 0 };
      const t4 = window.setTimeout(() => {
        if (destroyed || !ctx.isGenerating() || ctx.isCardHidden()) return;
        flash.textContent = "Pick";
        pad.hidden = false;
        pickShownAt.t = performance.now();
        choices.forEach((ch) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "brain-answer micro-memory-btn";
          btn.textContent = `${ch.pair[0]} ${ch.pair[1]}`;
          btn.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            if (!ctx.isGenerating() || ctx.isCardHidden()) return;
            pad.querySelectorAll("button").forEach((b) => {
              b.disabled = true;
            });
            const ok = ch.ok;
            const reactionMs = Math.round(performance.now() - pickShownAt.t);
            if (ok) {
              ctx.runtimeStats.reactionMsSamples.push(reactionMs);
              ctx.runtimeStats.hits += 1;
            } else {
              ctx.runtimeStats.playMisses += 1;
            }
            ctx.updateHud();
            const t5 = window.setTimeout(() => {
              if (!destroyed) nextRound();
            }, plan.afterAnswerNext);
            timers.push(t5);
          });
          pad.appendChild(btn);
        });
      }, tPick);
      timers.push(t4);
    }

    return {
      init() {},
      render() {
        ctx.updateHud();
        nextRound();
      },
      destroy() {
        destroyed = true;
        clearTimers();
        if (ctx.area) ctx.area.replaceChildren();
      }
    };
  };
})();
