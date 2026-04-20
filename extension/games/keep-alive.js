/**
 * Falling ball — tap before it hits the bottom.
 */
(() => {
  globalThis.__KEEL_GAME_CREATORS = globalThis.__KEEL_GAME_CREATORS || {};

  globalThis.__KEEL_GAME_CREATORS.keep_alive = function createKeepAliveGame(ctx) {
    let rafId = 0;
    let destroyed = false;
    let onPointerDown = null;

    function tuningScale() {
      const t = ctx.getPlayModeTuning();
      return t.step >= 18 ? 1.15 : t.step <= 12 ? 0.88 : 1;
    }

    return {
      init() {},
      render() {
        const area = ctx.area;
        area.innerHTML =
          '<div class="keep-alive-layer" aria-label="Keep the dot up">' +
          '<div class="keep-alive-ball" aria-hidden="true"></div>' +
          '<p class="keep-alive-hint">Tap when it drops low</p></div>';
        const ball = area.querySelector(".keep-alive-ball");
        const r = 9;
        let x = area.clientWidth * 0.5;
        let y = 14;
        let vy = 0;
        const g = 0.34 * tuningScale();
        const kick = -5.2 * tuningScale();
        let lastSaveMs = 0;
        let dangerEnteredAt = 0;

        function resetBall() {
          x = 12 + Math.random() * Math.max(8, area.clientWidth - 24);
          y = 12 + Math.random() * 18;
          vy = 0.4;
          dangerEnteredAt = 0;
        }

        function tick() {
          if (destroyed || !area.isConnected) return;
          if (!ctx.isPlayMode() || !ctx.isGenerating() || ctx.isCardHidden()) {
            rafId = window.requestAnimationFrame(tick);
            return;
          }
          vy += g;
          y += vy;
          const dangerY = area.clientHeight * 0.52;
          if (dangerEnteredAt === 0 && y > dangerY && vy > 0) dangerEnteredAt = performance.now();
          const floor = area.clientHeight - r - 4;
          if (y >= floor) {
            ctx.runtimeStats.playMisses += 1;
            ctx.trackEvent("play_miss", {
              microGame: ctx.gameId,
              totalMisses: ctx.runtimeStats.playMisses,
              totalHits: ctx.runtimeStats.hits
            });
            ctx.updateHud();
            resetBall();
          }
          ball.style.left = `${Math.max(r, Math.min(area.clientWidth - r, x)) - r}px`;
          ball.style.top = `${Math.max(r, y) - r}px`;
          rafId = window.requestAnimationFrame(tick);
        }

        onPointerDown = () => {
          if (destroyed || !ctx.isPlayMode() || !ctx.isGenerating() || ctx.isCardHidden()) return;
          vy += kick;
          const now = performance.now();
          const dangerY = area.clientHeight * 0.52;
          if (y > dangerY && dangerEnteredAt > 0 && now - lastSaveMs > 280) {
            lastSaveMs = now;
            const reactionMs = Math.max(40, Math.round(now - dangerEnteredAt));
            dangerEnteredAt = 0;
            ctx.runtimeStats.reactionMsSamples.push(reactionMs);
            ctx.runtimeStats.hits += 1;
            ctx.trackEvent("play_hit", { microGame: ctx.gameId, totalHits: ctx.runtimeStats.hits, reactionMs });
            ctx.updateHud();
          }
        };

        area.querySelector(".keep-alive-layer").addEventListener("pointerdown", onPointerDown, { passive: true });
        resetBall();
        ctx.updateHud();
        rafId = window.requestAnimationFrame(tick);
      },
      destroy() {
        destroyed = true;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
        if (ctx.area && onPointerDown) {
          const layer = ctx.area.querySelector(".keep-alive-layer");
          if (layer) layer.removeEventListener("pointerdown", onPointerDown);
        }
        if (ctx.area) ctx.area.replaceChildren();
      }
    };
  };
})();
