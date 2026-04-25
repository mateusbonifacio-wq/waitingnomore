/**
 * Original reaction-target micro-game ("current").
 */
(() => {
  globalThis.__KEEL_GAME_CREATORS = globalThis.__KEEL_GAME_CREATORS || {};

  globalThis.__KEEL_GAME_CREATORS.current = function createCurrentGame(ctx) {
    let playMoveTimer = null;
    let playRoundSeq = 0;
    let playArmedRoundId = null;
    let playActiveTargetEl = null;

    function voidLocal(reason) {
      ctx.debugPlay("void", reason, { armed: playArmedRoundId });
      if (playMoveTimer) {
        clearTimeout(playMoveTimer);
        playMoveTimer = null;
      }
      playArmedRoundId = null;
      if (playActiveTargetEl && playActiveTargetEl.parentNode) playActiveTargetEl.remove();
      playActiveTargetEl = null;
    }

    function difficultyWindowMs() {
      const t = ctx.getPlayModeTuning();
      const rounds = ctx.runtimeStats.hits + ctx.runtimeStats.playMisses;
      return Math.max(t.minV, Math.min(t.maxV, Math.round(t.base - rounds * t.step)));
    }

    function nextGapMs() {
      const t = ctx.getPlayModeTuning();
      const rounds = ctx.runtimeStats.hits + ctx.runtimeStats.playMisses;
      return Math.max(36, Math.round(t.gapMin + Math.random() * t.gapSpread - Math.min(38, rounds * t.gapRamp)));
    }

    function showReactionPop(clientX, clientY, ms) {
      const area = ctx.area;
      const rect = area.getBoundingClientRect();
      const pop = document.createElement("div");
      pop.className = "play-pop";
      pop.textContent = `${ms}ms`;
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      pop.style.left = `${Math.max(4, Math.min(rect.width - 48, x - 22))}px`;
      pop.style.top = `${Math.max(4, Math.min(rect.height - 28, y - 28))}px`;
      area.appendChild(pop);
      window.setTimeout(() => pop.remove(), 520);
    }

    function scheduleSpawn(delayMs) {
      if (playMoveTimer) {
        clearTimeout(playMoveTimer);
        playMoveTimer = null;
      }
      playMoveTimer = window.setTimeout(() => {
        playMoveTimer = null;
        spawn();
      }, delayMs);
    }

    function spawn() {
      const area = ctx.area;
      if (!ctx.isPlayMode() || !area.isConnected) return;
      if (!ctx.isGenerating()) return;
      if (ctx.isCardHidden()) return;

      window.requestAnimationFrame(() => {
        if (!ctx.isPlayMode() || !area.isConnected) return;
        if (!ctx.isGenerating()) return;
        if (ctx.isCardHidden()) return;

        voidLocal("spawnCommit");
        const roundId = ++playRoundSeq;
        playArmedRoundId = roundId;

          const target = document.createElement("button");
          target.type = "button";
          target.className = "play-target play-target--live";
          target.setAttribute("aria-label", "Hit");
          const size = 32;
          const pad = 6;
          const w = Math.max(8, area.clientWidth - size - pad * 2);
          const h = Math.max(8, area.clientHeight - size - pad * 2);
          const x = Math.floor(pad + Math.random() * w);
          const y = Math.floor(pad + Math.random() * h);
          target.style.left = `${x}px`;
          target.style.top = `${y}px`;
          const spawnAt = performance.now();
          const windowMs = difficultyWindowMs();
          area.appendChild(target);
          playActiveTargetEl = target;

          playMoveTimer = window.setTimeout(() => {
            playMoveTimer = null;
            if (playArmedRoundId !== roundId) return;
            if (!ctx.isPlayMode() || !ctx.isGenerating() || ctx.isCardHidden()) {
              voidLocal("expireAbortContext");
              return;
            }
            if (playActiveTargetEl !== target || !target.isConnected) {
              voidLocal("expireAbortNoTarget");
              if (ctx.isPlayMode() && ctx.isGenerating() && !ctx.isCardHidden()) scheduleSpawn(nextGapMs());
              return;
            }
            playArmedRoundId = null;
            playActiveTargetEl = null;
            target.remove();
            ctx.runtimeStats.playMisses += 1;
            ctx.updateHud();
            scheduleSpawn(nextGapMs());
          }, windowMs);

        target.addEventListener(
          "click",
          (event) => {
              event.preventDefault();
              event.stopPropagation();
              if (playMoveTimer) {
                clearTimeout(playMoveTimer);
                playMoveTimer = null;
              }
              if (playArmedRoundId !== roundId || playActiveTargetEl !== target) return;
              playArmedRoundId = null;
              playActiveTargetEl = null;
              const reactionMs = Math.round(performance.now() - spawnAt);
              ctx.runtimeStats.reactionMsSamples.push(reactionMs);
              ctx.runtimeStats.hits += 1;
              target.classList.remove("play-target--live");
              target.classList.add("play-target--hit");
              showReactionPop(event.clientX, event.clientY, reactionMs);
              window.setTimeout(() => {
                if (target.parentNode) target.remove();
              }, 140);
              ctx.updateHud();
              scheduleSpawn(nextGapMs());
          },
          { passive: false }
        );
      });
    }

    return {
      init() {},
      render() {
        ctx.updateHud();
        scheduleSpawn(ctx.getPlayModeTuning().spawnDelay);
      },
      destroy() {
        voidLocal("destroy");
      }
    };
  };
})();
