/**
 * Orbit dodge — tap to flip rotation direction and avoid obstacle contact.
 * 1 tap = immediate clockwise/counterclockwise switch.
 */
(() => {
  globalThis.__KEEL_GAME_CREATORS = globalThis.__KEEL_GAME_CREATORS || {};

  globalThis.__KEEL_GAME_CREATORS.keep_alive = function createKeepAliveGame(ctx) {
    let rafId = 0;
    let destroyed = false;
    let onPointerDown = null;
    let layerEl = null;
    let lastTs = 0;

    function speedClock() {
      const pace = globalThis.__KEEL_playPace;
      return typeof pace?.intensityClockRatio === "function" ? pace.intensityClockRatio(ctx) : 1;
    }

    function normalizeAngle(a) {
      let out = a % (Math.PI * 2);
      if (out < 0) out += Math.PI * 2;
      return out;
    }

    /** Shortest signed angular distance in radians ([-PI, PI]). */
    function angleDelta(from, to) {
      let d = normalizeAngle(to) - normalizeAngle(from);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      return d;
    }

    return {
      init() {},
      render() {
        const area = ctx.area;
        area.innerHTML =
          '<div class="keep-alive-layer keep-alive-orbit" aria-label="Flip direction to avoid collision">' +
          '<div class="keep-alive-ring" aria-hidden="true"></div>' +
          '<div class="keep-alive-core" aria-hidden="true"></div>' +
          '<div class="keep-alive-obstacle" aria-hidden="true"></div>' +
          '<div class="keep-alive-ball" aria-hidden="true"></div>' +
          '<p class="keep-alive-hint">Tap to flip direction</p></div>';
        layerEl = area.querySelector(".keep-alive-layer");
        const ball = area.querySelector(".keep-alive-ball");
        const obstacle = area.querySelector(".keep-alive-obstacle");
        const clock = speedClock();
        const ballR = 9;
        const obstacleR = 7;
        const orbitSpeed = 3.4 * clock;
        const obstacleSpeed = 0.95 * clock;
        const dangerBand = 0.48;
        const collideBand = 0.2;
        let ballAngle = Math.random() * Math.PI * 2;
        let obstacleAngle = normalizeAngle(ballAngle + Math.PI / 2);
        let dir = Math.random() > 0.5 ? 1 : -1;
        let wasNear = false;
        let inContact = false;
        let lastTapMs = 0;
        let started = false;

        function layout() {
          const w = Math.max(60, area.clientWidth || 0);
          const h = Math.max(72, area.clientHeight || 0);
          const cx = w * 0.5;
          const cy = h * 0.5;
          const orbitR = Math.max(22, Math.min(w, h) * 0.34);
          return { w, h, cx, cy, orbitR };
        }

        function place(el, cx, cy, r, angle, itemR) {
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;
          el.style.left = `${x - itemR}px`;
          el.style.top = `${y - itemR}px`;
        }

        function resetRound() {
          ballAngle = Math.random() * Math.PI * 2;
          obstacleAngle = normalizeAngle(ballAngle + (Math.random() > 0.5 ? 1 : -1) * (Math.PI * 0.45));
          dir = Math.random() > 0.5 ? 1 : -1;
          wasNear = false;
          inContact = false;
          layerEl.classList.remove("keep-alive-orbit--flip");
          layerEl.classList.remove("keep-alive-orbit--safe");
        }

        function tick(ts) {
          if (destroyed || !area.isConnected) return;
          if (!ctx.isPlayMode() || !ctx.isGenerating() || ctx.isCardHidden()) {
            lastTs = ts || 0;
            rafId = window.requestAnimationFrame(tick);
            return;
          }
          if (!lastTs) lastTs = ts || performance.now();
          const now = ts || performance.now();
          const dt = Math.min(0.05, (now - lastTs) / 1000);
          lastTs = now;

          ballAngle = normalizeAngle(ballAngle + dir * orbitSpeed * dt);
          obstacleAngle = normalizeAngle(obstacleAngle + obstacleSpeed * dt);

          const { cx, cy, orbitR } = layout();
          place(ball, cx, cy, orbitR, ballAngle, ballR);
          place(obstacle, cx, cy, orbitR, obstacleAngle, obstacleR);

          const d = Math.abs(angleDelta(ballAngle, obstacleAngle));
          const isNear = d < dangerBand;
          const isCollision = d < collideBand;

          if (wasNear && !isNear && !inContact) {
            ctx.runtimeStats.reactionMsSamples.push(95);
            ctx.runtimeStats.hits += 1;
            ctx.updateHud();
            layerEl.classList.remove("keep-alive-orbit--safe");
            // Replay feedback animation without forced synchronous layout.
            window.requestAnimationFrame(() => {
              if (!destroyed && layerEl) layerEl.classList.add("keep-alive-orbit--safe");
            });
          }

          if (isCollision && !inContact) {
            inContact = true;
            ctx.runtimeStats.playMisses += 1;
            ctx.updateHud();
            resetRound();
          }
          if (!isCollision) inContact = false;
          wasNear = isNear;

          rafId = window.requestAnimationFrame(tick);
        }

        onPointerDown = () => {
          if (destroyed || !ctx.isPlayMode() || !ctx.isGenerating() || ctx.isCardHidden()) return;
          const now = performance.now();
          if (now - lastTapMs < 45) return;
          lastTapMs = now;
          dir *= -1;
          layerEl.classList.remove("keep-alive-orbit--flip");
          window.requestAnimationFrame(() => {
            if (!destroyed && layerEl) layerEl.classList.add("keep-alive-orbit--flip");
          });
        };

        layerEl.addEventListener("pointerdown", onPointerDown, { passive: true });

        function startLoop() {
          if (destroyed || !area.isConnected) return;
          resetRound();
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
