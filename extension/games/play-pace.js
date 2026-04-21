/**
 * Shared play intensity → timing helpers (chill / normal / intense via getPlayModeTuning + getPlayIntensity).
 * Loaded after games/registry.js, before individual games.
 */
(() => {
  const NORM_SPAWN = 80;

  globalThis.__KEEL_playPace = {
    /**
     * Stretch delays vs "normal": chill uses longer spawnDelay → longer waits; intense → shorter.
     * @param {{ getPlayModeTuning: function }} ctx
     * @param {number} msAtNormal delay tuned for normal (spawnDelay 80ms)
     * @param {number} [minMs]
     */
    scaleMs(ctx, msAtNormal, minMs) {
      const floor = minMs == null ? 32 : minMs;
      const t = ctx.getPlayModeTuning();
      const spawn = t.spawnDelay || NORM_SPAWN;
      return Math.max(floor, Math.round(msAtNormal * (spawn / NORM_SPAWN)));
    },

    /**
     * Gameplay clock vs normal: intense > 1 (faster physics), chill < 1.
     * Derived from spawnDelay only so it stays in sync with getPlayModeTuning().
     */
    intensityClockRatio(ctx) {
      return NORM_SPAWN / (ctx.getPlayModeTuning().spawnDelay || NORM_SPAWN);
    },

    /**
     * Quick pattern / similar: how many steps in the sequence.
     * @returns {{ min: number, max: number }}
     */
    patternLengthBounds(ctx) {
      const p = typeof ctx.getPlayIntensity === "function" ? ctx.getPlayIntensity() : "normal";
      if (p === "chill") return { min: 2, max: 2 };
      if (p === "intense") return { min: 3, max: 4 };
      return { min: 2, max: 3 };
    },

    /**
     * Micro-memory flash cadence (ms), all scaled from normal baselines.
     */
    memoryFlashPlan(ctx) {
      const s = (ms, min) => globalThis.__KEEL_playPace.scaleMs(ctx, ms, min);
      const beforeFirst = s(120, 40);
      const symbolGap = s(500, 80);
      const afterSymbolsToPick = s(160, 48);
      const afterAnswerNext = s(420, 80);
      return { beforeFirst, symbolGap, afterSymbolsToPick, afterAnswerNext };
    }
  };
})();
