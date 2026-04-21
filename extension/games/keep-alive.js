/**
 * Falling ball — tap before it hits the bottom.
 * Physics tuned for a quick, fair bounce; hits register in the lower band with a short cooldown.
 */
(() => {
  globalThis.__KEEL_GAME_CREATORS = globalThis.__KEEL_GAME_CREATORS || {};

  globalThis.__KEEL_GAME_CREATORS.keep_alive = function createKeepAliveGame(ctx) {
    let rafId = 0;
    let destroyed = false;
    let onPointerDown = null;
    let layerEl = null;

    function physicsClock() {
      const pace = globalThis.__KEEL_playPace;
      return typeof pace?.intensityClockRatio === "function" ? pace.intensityClockRatio(ctx) : 1;
    }

    return {
      init() {},
      render() {
        const area = ctx.area;
        area.innerHTML =
          '<div class="keep-alive-layer" aria-label="Keep the dot up">' +
          '<div class="keep-alive-ball" aria-hidden="true"></div>' +
          '<p class="keep-alive-hint">Tap when it drops low</p></div>';
        layerEl = area.querySelector(".keep-alive-layer");
        const ball = area.querySelector(".keep-alive-ball");
        const r = 9;
        const clock = physicsClock();
        /** Gentler fall, stronger tap — feels controllable in ~1–2s. */
        const g = 0.2 * clock;
        const kick = -6.4 * clock;
        const maxDownVy = 7.2 * clock;
        const maxUpVy = 8.5;
        let x = 0;
        let y = 14;
        let vy = 0;
        let lastSaveMs = 0;
        let dangerEnteredAt = 0;
        let started = false;

        function layoutSize() {
          const w = Math.max(56, area.clientWidth || 0);
          const h = Math.max(72, area.clientHeight || 0);
          return { w, h, floor: h - r - 4, dangerY: h * 0.46 };
        }

        function resetBall() {
          const { w, h } = layoutSize();
          x = 12 + Math.random() * Math.max(8, w - 24);
          y = 12 + Math.random() * Math.min(22, h * 0.22);
          vy = 0.35 * clock;
          dangerEnteredAt = 0;
        }

        function tick() {
          if (destroyed || !area.isConnected) return;
          if (!ctx.isPlayMode() || !ctx.isGenerating() || ctx.isCardHidden()) {
            rafId = window.requestAnimationFrame(tick);
            return;
          }
          const { w, h, floor, dangerY } = layoutSize();
          vy += g;
          vy = Math.min(maxDownVy, vy);
          y += vy;
          if (dangerEnteredAt > 0 && (y < dangerY - 12 || vy < -0.05)) {
            dangerEnteredAt = 0;
          }
          if (dangerEnteredAt === 0 && y > dangerY && vy > 0.12) {
            dangerEnteredAt = performance.now();
          }
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
          ball.style.left = `${Math.max(r, Math.min(w - r, x)) - r}px`;
          ball.style.top = `${Math.max(r, Math.min(h - r, y)) - r}px`;
          rafId = window.requestAnimationFrame(tick);
        }

        onPointerDown = (_e) => {
          if (destroyed || !ctx.isPlayMode() || !ctx.isGenerating() || ctx.isCardHidden()) return;
          const { w, h, floor, dangerY } = layoutSize();
          const now = performance.now();
          vy += kick;
          vy = Math.max(-maxUpVy, vy);

          const inDanger = y > dangerY - 4 && vy > 0.08;
          if (inDanger && now - lastSaveMs > 110) {
            lastSaveMs = now;
            const reactionMs =
              dangerEnteredAt > 0 ? Math.max(35, Math.round(now - dangerEnteredAt)) : Math.round(55 + Math.random() * 40);
            dangerEnteredAt = 0;
            ctx.runtimeStats.reactionMsSamples.push(reactionMs);
            ctx.runtimeStats.hits += 1;
            ctx.trackEvent("play_hit", { microGame: ctx.gameId, totalHits: ctx.runtimeStats.hits, reactionMs });
            ctx.updateHud();
          }

          if (y >= floor - 0.5) {
            y = Math.min(y, floor - 1);
          }
        };

        layerEl.addEventListener("pointerdown", onPointerDown, { passive: true });

        function startLoop() {
          if (destroyed || !area.isConnected) return;
          resetBall();
          ctx.updateHud();
          rafId = window.requestAnimationFrame(tick);
        }

        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            if (destroyed || started) return;
            started = true;
            startLoop();
          });
        });
      },
      destroy() {
        destroyed = true;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
        if (layerEl && onPointerDown) {
          layerEl.removeEventListener("pointerdown", onPointerDown);
        }
        layerEl = null;
        onPointerDown = null;
        if (ctx.area) ctx.area.replaceChildren();
      }
    };
  };
})();
