/**
 * Instantiates a micro-game by id. Requires __KEEL_GAME_CREATORS populated by game modules.
 */
(() => {
  globalThis.__KEEL_createMicroGame = function createMicroGame(gameId, ctx) {
    const creators = globalThis.__KEEL_GAME_CREATORS || {};
    const id = typeof gameId === "string" && creators[gameId] ? gameId : "current";
    const create = creators[id] || creators.current;
    if (typeof create !== "function") {
      return {
        init() {},
        render() {},
        destroy() {}
      };
    }
    const inst = create(ctx);
    if (typeof inst.init === "function") inst.init(ctx);
    if (typeof inst.render === "function") inst.render(ctx);
    return inst;
  };
})();
