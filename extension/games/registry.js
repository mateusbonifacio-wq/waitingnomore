/**
 * Keel micro-games: shared registry + enabled list helpers.
 * Loaded before individual game modules and content.js.
 */
(() => {
  const VALID = new Set(["current", "keep_alive", "quick_pattern", "micro_memory"]);

  function normalizeEnabledGames(raw) {
    if (!Array.isArray(raw)) return ["current"];
    const out = [];
    for (const x of raw) {
      if (typeof x === "string" && VALID.has(x) && !out.includes(x)) out.push(x);
    }
    return out.length ? out : ["current"];
  }

  function pickRandomGameId(enabled) {
    const list = normalizeEnabledGames(enabled);
    return list[Math.floor(Math.random() * list.length)];
  }

  globalThis.__KEEL_GAMES_REGISTRY = {
    VALID,
    normalizeEnabledGames,
    pickRandomGameId
  };
})();
