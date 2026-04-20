(() => {
  /** Bump this string before each test build — also check DevTools console + overlay label. */
  const IDLE_EXTENSION_VERSION = "1.0.16";

  // Context export feature is currently paused
  // Reason: unreliable results and not part of core product
  // Can be revisited later
  // (code preserved under extension/experimental/contextExport/)

  if (window.__keelOverlayInjected) return;
  window.__keelOverlayInjected = true;

  const gen = globalThis.__KEEL_GENERATION_API;
  if (!gen || typeof gen.detectGeneratingState !== "function" || typeof gen.isStopGenerationControl !== "function") {
    console.error("Keel: missing __KEEL_GENERATION_API (site script must load before content.js).");
    return;
  }

  console.log(`Keel v${IDLE_EXTENSION_VERSION} loaded [${gen.siteId || "unknown"}]`);

  const MODES = { PLAY: "play", BRAIN: "brain", FOCUS: "focus" };
  const SUMMARY_MIN_MS = 2800;
  const SUMMARY_MAX_MS = 7200;
  /** Delay before the next brain question after an answer. Independent of play intensity (chill/normal/intense). */
  const BRAIN_NEXT_QUESTION_DELAY_MS = 1000;
  const GENERATION_POLL_MS = 280;
  const MAX_STORED_SESSIONS = 200;
  const MAX_STORED_EVENTS = 600;
  const STORAGE_KEYS = {
    sessions: "idle_overlay_sessions",
    eventQueue: "idle_overlay_event_queue",
    meta: "idle_overlay_meta"
  };

  const EXTENSION_SETTINGS_KEY = "waitingnomore.extensionSettings.v1";
  const THEME_STORAGE_KEY = "theme";
  const defaultUserPrefs = {
    schemaVersion: 1,
    overlayWhileGenerating: true,
    defaultSessionMode: "play",
    showSessionSummary: true,
    playIntensity: "normal",
    triggerWhen: "always",
    smartTriggerMinGenerationSec: 3,
    themeMode: "dark",
    enabledGames: ["current"]
  };
  let userPrefs = { ...defaultUserPrefs };
  let rawGenerationSince = 0;

  const brainQuestions = [
    { question: "If all Bloops are Razzies and all Razzies are Lazzies, are all Bloops Lazzies?", answers: ["Yes", "No", "Cannot know"], correct: 0 },
    { question: "A clock shows 3:15. What is the angle between hands?", answers: ["7.5 deg", "0 deg", "15 deg"], correct: 0 },
    { question: "Which is next: 2, 6, 12, 20, ?", answers: ["28", "30", "32"], correct: 1 }
  ];
  const focusPrompts = ["Roll your shoulders.", "Take one deep breath.", "Look away from the screen for 3 seconds.", "Relax your jaw."];

  let currentMode = MODES.PLAY;
  let isGenerating = false;
  let brainNextTimer = null;
  let summaryHideTimer = null;
  let summaryExitTimer = null;
  let brainIndex = 0;
  let focusIndex = 0;
  let root;
  let card;
  let modeBody;
  let generationPollTimer = null;
  let summaryDismissAbort = null;
  /** Which micro-game runs for this generation (set in startSession). */
  let sessionPlayGameId = "current";
  /** Cleanup for the active play-mode micro-game (set by renderPlayMode). */
  let destroyActivePlayGame = null;
  const DEBUG_PLAY = false;
  /** Set false to silence settings sync logs after validation. */
  const DEBUG_SETTINGS_SYNC = true;
  /** Temporary: full-chain sync logging ([wnm sync] matches web + background). */
  const WNM_SYNC_LOG = true;

  function debugPlay(...args) {
    if (DEBUG_PLAY) console.log("[idle play]", ...args);
  }

  function voidPlayRound(reason) {
    debugPlay("void", reason);
    if (destroyActivePlayGame) {
      try {
        destroyActivePlayGame(reason);
      } catch (_e) {
        /* ignore teardown errors */
      }
      destroyActivePlayGame = null;
    }
  }

  const persistenceState = {
    sessions: [],
    eventQueue: [],
    meta: { lastSessionId: 0, schemaVersion: 1 }
  };

  const runtimeStats = {
    sessionActive: false,
    currentSessionId: "",
    sessionStartMs: 0,
    hits: 0,
    playMisses: 0,
    reactionMsSamples: [],
    brainAnswered: 0,
    brainCorrect: 0,
    focusPromptsCompleted: 0,
    events: [],
    bestHpsToday: 0,
    bestDayKey: "",
    sessionHistory: []
  };

  const persistence = {
    isAvailable() {
      return !!(globalThis.chrome && chrome.storage && chrome.storage.local);
    },
    async load() {
      if (!this.isAvailable()) return;
      const data = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
      persistenceState.sessions = Array.isArray(data[STORAGE_KEYS.sessions]) ? data[STORAGE_KEYS.sessions] : [];
      persistenceState.eventQueue = Array.isArray(data[STORAGE_KEYS.eventQueue]) ? data[STORAGE_KEYS.eventQueue] : [];
      persistenceState.meta =
        data[STORAGE_KEYS.meta] && typeof data[STORAGE_KEYS.meta] === "object"
          ? data[STORAGE_KEYS.meta]
          : { lastSessionId: 0, schemaVersion: 1 };
      runtimeStats.sessionHistory = persistenceState.sessions.slice(-10).reverse();
      ensureDailyBestWindow();
      const today = getDayKey();
      const bestToday = persistenceState.sessions
        .filter((session) => typeof session.timestamp === "string" && session.timestamp.startsWith(today))
        .map((session) => Number(session.hitsPerSecond) || 0);
      runtimeStats.bestHpsToday = bestToday.length ? Math.max(...bestToday) : 0;
    },
    async flush() {
      if (!this.isAvailable()) return;
      await chrome.storage.local.set({
        [STORAGE_KEYS.sessions]: persistenceState.sessions,
        [STORAGE_KEYS.eventQueue]: persistenceState.eventQueue,
        [STORAGE_KEYS.meta]: persistenceState.meta
      });
    },
    nextSessionId() {
      persistenceState.meta.lastSessionId = Number(persistenceState.meta.lastSessionId || 0) + 1;
      return `sess_${persistenceState.meta.lastSessionId}_${Date.now()}`;
    },
    async saveSession(sessionRecord) {
      persistenceState.sessions.push(sessionRecord);
      if (persistenceState.sessions.length > MAX_STORED_SESSIONS) {
        persistenceState.sessions = persistenceState.sessions.slice(-MAX_STORED_SESSIONS);
      }
      runtimeStats.sessionHistory = persistenceState.sessions.slice(-10).reverse();
      await this.flush();
    },
    async enqueueEvent(eventRecord) {
      persistenceState.eventQueue.push(eventRecord);
      if (persistenceState.eventQueue.length > MAX_STORED_EVENTS) {
        persistenceState.eventQueue = persistenceState.eventQueue.slice(-MAX_STORED_EVENTS);
      }
      await this.flush();
    },
    getLatestSessions(limit = 10) {
      return persistenceState.sessions.slice(-limit).reverse();
    }
  };

  function coerceUserPrefs(raw) {
    const base = { ...defaultUserPrefs };
    if (!raw || typeof raw !== "object") return base;
    if (typeof raw.overlayWhileGenerating === "boolean") base.overlayWhileGenerating = raw.overlayWhileGenerating;
    if (typeof raw.showSessionSummary === "boolean") base.showSessionSummary = raw.showSessionSummary;
    if (["play", "brain", "focus"].includes(raw.defaultSessionMode)) base.defaultSessionMode = raw.defaultSessionMode;
    if (["chill", "normal", "intense"].includes(raw.playIntensity)) base.playIntensity = raw.playIntensity;
    if (["always", "smart"].includes(raw.triggerWhen)) base.triggerWhen = raw.triggerWhen;
    if (raw.themeMode === "light" || raw.themeMode === "dark") base.themeMode = raw.themeMode;
    const sec = Number(raw.smartTriggerMinGenerationSec);
    if (Number.isFinite(sec) && sec >= 1 && sec <= 30) base.smartTriggerMinGenerationSec = sec;
    const gr = globalThis.__KEEL_GAMES_REGISTRY;
    if (gr && typeof gr.normalizeEnabledGames === "function") {
      base.enabledGames = gr.normalizeEnabledGames(raw.enabledGames);
    } else if (Array.isArray(raw.enabledGames)) {
      const validIds = new Set(["current", "keep_alive", "quick_pattern", "micro_memory"]);
      const filtered = raw.enabledGames.filter((x) => typeof x === "string" && validIds.has(x));
      const uniq = [...new Set(filtered)];
      base.enabledGames = uniq.length ? uniq : ["current"];
    }
    return base;
  }

  function formatSettingsStrip() {
    const theme = userPrefs.themeMode === "light" ? "Light" : "Dark";
    const intensity =
      userPrefs.playIntensity === "chill" ? "Chill" : userPrefs.playIntensity === "intense" ? "Intense" : "Normal";
    const trigger = userPrefs.triggerWhen === "smart" ? "Smart" : "Always";
    const def =
      userPrefs.defaultSessionMode === "brain" ? "Brain" : userPrefs.defaultSessionMode === "focus" ? "Focus" : "Play";
    return `${theme} / ${intensity} / ${trigger} · Default ${def}`;
  }

  function applyDefaultSessionModeFromPrefs() {
    if (!root || !card || !modeBody) return;
    if (card.classList.contains("idle-time-card--summary")) return;
    if (!isGenerating) return;
    const target = defaultModeFromPrefs();
    if (currentMode === target) return;
    if (DEBUG_SETTINGS_SYNC) {
      console.log("[wnm sync] EXT content: apply default session mode (live)", { to: target, was: currentMode });
    }
    setMode(target);
  }

  function normalizeTheme(value) {
    return value === "light" || value === "dark" ? value : null;
  }

  function applyTheme(theme) {
    const t = normalizeTheme(theme);
    if (!t) return;
    userPrefs.themeMode = t;
    if (WNM_SYNC_LOG) console.log("[wnm sync] EXT content: theme key applied", t);
  }

  function logAppliedUserPrefs(reason) {
    if (!WNM_SYNC_LOG) return;
    console.log("[wnm sync] EXT content: settings applied (" + reason + ")", {
      overlayWhileGenerating: userPrefs.overlayWhileGenerating,
      defaultSessionMode: userPrefs.defaultSessionMode,
      showSessionSummary: userPrefs.showSessionSummary,
      playIntensity: userPrefs.playIntensity,
      triggerWhen: userPrefs.triggerWhen,
      smartTriggerMinGenerationSec: userPrefs.smartTriggerMinGenerationSec,
      themeMode: userPrefs.themeMode,
      enabledGames: userPrefs.enabledGames
    });
  }

  function applyPrefsToOverlay() {
    if (!root) return;
    root.classList.toggle("idle-time-root--theme-light", userPrefs.themeMode === "light");
    const strip = root.querySelector("[data-settings-strip]");
    if (strip) strip.textContent = formatSettingsStrip();
    applyDefaultSessionModeFromPrefs();
    syncGenerationOverlay();
  }

  async function refreshUserPrefs() {
    if (!globalThis.chrome?.storage?.local) return;
    const data = await chrome.storage.local.get([EXTENSION_SETTINGS_KEY, THEME_STORAGE_KEY]);
    userPrefs = coerceUserPrefs(data[EXTENSION_SETTINGS_KEY]);
    const t = normalizeTheme(data[THEME_STORAGE_KEY]);
    if (t) userPrefs.themeMode = t;
    logAppliedUserPrefs("initial load from chrome.storage.local");
  }


  /** Play-mode reaction game only. Do not use for brain or focus timing. */
  function getPlayModeTuning() {
    const p = userPrefs.playIntensity;
    if (p === "chill") {
      return {
        base: 840,
        minV: 520,
        maxV: 960,
        step: 10,
        gapMin: 72,
        gapSpread: 110,
        gapRamp: 1.4,
        spawnDelay: 130
      };
    }
    if (p === "intense") {
      return {
        base: 660,
        minV: 320,
        maxV: 720,
        step: 20,
        gapMin: 34,
        gapSpread: 75,
        gapRamp: 2.8,
        spawnDelay: 48
      };
    }
    return {
      base: 760,
      minV: 400,
      maxV: 780,
      step: 14,
      gapMin: 55,
      gapSpread: 85,
      gapRamp: 2,
      spawnDelay: 80
    };
  }

  function defaultModeFromPrefs() {
    const m = userPrefs.defaultSessionMode;
    if (m === "brain") return MODES.BRAIN;
    if (m === "focus") return MODES.FOCUS;
    return MODES.PLAY;
  }

  function getDayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function ensureDailyBestWindow() {
    const today = getDayKey();
    if (runtimeStats.bestDayKey !== today) {
      runtimeStats.bestDayKey = today;
      runtimeStats.bestHpsToday = 0;
    }
  }

  function trackEvent(type, payload = {}) {
    const eventRecord = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      schemaVersion: 1,
      eventType: type,
      timestamp: new Date().toISOString(),
      source: "content_script",
      sessionId: runtimeStats.currentSessionId || null,
      payload
    };
    runtimeStats.events.push(eventRecord);
    void persistence.enqueueEvent(eventRecord);
  }

  function createSessionRecord(summary, generationEndedSuccessfully) {
    const avgRt = summary.averageReactionMs;
    const modeKey = summary.sessionMode || currentMode;
    const metrics = {
      normalizedScore: Number(summary.hitsPerSecond.toFixed(4)),
      averageReactionMs: avgRt == null ? null : Number(avgRt.toFixed(1)),
      totalMisses: Number(summary.misses) || 0,
      brainAnswered: summary.brainAnswered ?? null,
      brainCorrect: summary.brainCorrect ?? null,
      accuracyPct: summary.accuracyPct != null ? Number(summary.accuracyPct.toFixed(1)) : null,
      focusPromptsCompleted: summary.focusPromptsCompleted ?? null
    };
    return {
      id: runtimeStats.currentSessionId,
      schemaVersion: 1,
      timestamp: new Date().toISOString(),
      mode: modeKey,
      totalHits: summary.hits,
      totalMisses: Number(summary.misses) || 0,
      durationSeconds: Number(summary.durationSec.toFixed(3)),
      hitsPerSecond: Number(summary.hitsPerSecond.toFixed(4)),
      averageReactionMs: avgRt == null ? null : Number(avgRt.toFixed(1)),
      generationStarted: true,
      generationEndedSuccessfully,
      metrics
    };
  }

  function exposeInternalHistory() {
    window.__idleOverlayHistory = {
      getLatestSessions: (limit = 10) => persistence.getLatestSessions(limit),
      getQueuedEventsCount: () => persistenceState.eventQueue.length
    };
  }

  function createTestBadge() {
    const badge = document.createElement("div");
    badge.id = "idle-time-test-badge";
    badge.textContent = "Keel";
    document.documentElement.appendChild(badge);
  }

  function createOverlay() {
    root = document.createElement("div");
    root.id = "idle-time-overlay-root";
    root.innerHTML = `
      <div class="idle-time-card hidden" role="status" aria-live="polite">
        <span class="idle-time-version" aria-hidden="true">v${IDLE_EXTENSION_VERSION}</span>
        <div class="idle-time-header">
          <span class="idle-time-title">Keel</span>
          <span class="idle-time-tagline">Before you drift.</span>
        </div>
        <p class="idle-time-settings-strip" data-settings-strip aria-live="polite" aria-label="Current preferences">${formatSettingsStrip()}</p>
        <div class="idle-time-tabs">
          <button class="idle-time-tab active" data-mode="play">Play Mode</button>
          <button class="idle-time-tab" data-mode="brain">Brain Mode</button>
          <button class="idle-time-tab" data-mode="focus">Focus Mode</button>
        </div>
        <div class="idle-time-body"></div>
      </div>
    `;
    document.documentElement.appendChild(root);
    card = root.querySelector(".idle-time-card");
    modeBody = root.querySelector(".idle-time-body");

    root.querySelector(".idle-time-tabs").addEventListener("click", (event) => {
      if (card && card.classList.contains("idle-time-card--summary")) return;
      const button = event.target.closest(".idle-time-tab");
      if (!button) return;
      setMode(button.dataset.mode);
      trackEvent("mode_change", { mode: button.dataset.mode });
    });
    renderMode();
  }

  function setMode(mode) {
    currentMode = mode;
    const tabs = root.querySelectorAll(".idle-time-tab");
    tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
    renderMode();
  }

  function clearModeTimers() {
    voidPlayRound("clearModeTimers");
    if (brainNextTimer) clearTimeout(brainNextTimer);
    if (summaryHideTimer) clearTimeout(summaryHideTimer);
    if (summaryExitTimer) clearTimeout(summaryExitTimer);
    brainNextTimer = null;
    summaryHideTimer = null;
    summaryExitTimer = null;
  }

  function clearModeTimersKeepSummaryTimer() {
    voidPlayRound("clearModeTimersKeepSummaryTimer");
    if (brainNextTimer) clearTimeout(brainNextTimer);
    brainNextTimer = null;
  }

  function freezeActiveSessionUi() {
    clearModeTimersKeepSummaryTimer();
    if (!modeBody) return;
    modeBody.querySelectorAll("button, [role='button']").forEach((el) => {
      el.setAttribute("disabled", "");
      el.setAttribute("aria-disabled", "true");
    });
    modeBody.style.pointerEvents = "none";
  }

  function detachSummaryDismissListener() {
    if (summaryDismissAbort) {
      summaryDismissAbort.abort();
      summaryDismissAbort = null;
    }
  }

  function clearSummaryUiState() {
    detachSummaryDismissListener();
    if (summaryExitTimer) {
      clearTimeout(summaryExitTimer);
      summaryExitTimer = null;
    }
    if (card) {
      card.classList.remove("idle-time-card--summary");
      card.classList.remove("idle-time-card--summary-exit");
    }
    if (modeBody) {
      modeBody.style.pointerEvents = "";
      modeBody.style.opacity = "";
      modeBody.style.transform = "";
      modeBody.style.transition = "";
    }
  }

  function computeSummaryVisibleMs(summary) {
    const durationSec = Number(summary.durationSec) || 0;
    const mode = summary.sessionMode || MODES.PLAY;
    const fromDuration = Math.min(1100, Math.round(durationSec * 140));
    if (mode === MODES.BRAIN) {
      const n = Number(summary.brainAnswered) || 0;
      const fromRounds = Math.min(900, n * 65);
      return Math.min(SUMMARY_MAX_MS, Math.max(SUMMARY_MIN_MS, SUMMARY_MIN_MS + fromDuration + fromRounds + 300));
    }
    if (mode === MODES.FOCUS) {
      const n = Number(summary.focusPromptsCompleted) || 0;
      const fromRounds = Math.min(700, n * 80);
      return Math.min(SUMMARY_MAX_MS, Math.max(SUMMARY_MIN_MS, SUMMARY_MIN_MS + fromDuration + fromRounds + 240));
    }
    const hits = Number(summary.hits) || 0;
    const misses = Number(summary.misses) || 0;
    const hasAvg = summary.averageReactionMs != null && hits > 0;
    const fromRounds = Math.min(900, hits * 55 + misses * 30);
    const readingTail = hasAvg ? 320 : 180;
    return Math.min(SUMMARY_MAX_MS, Math.max(SUMMARY_MIN_MS, SUMMARY_MIN_MS + fromDuration + fromRounds + readingTail));
  }

  function hideSummaryWithExitAnimation() {
    if (!card || !modeBody) return;
    if (summaryHideTimer) {
      clearTimeout(summaryHideTimer);
      summaryHideTimer = null;
    }
    if (summaryExitTimer) {
      clearTimeout(summaryExitTimer);
      summaryExitTimer = null;
    }
    detachSummaryDismissListener();
    modeBody.style.pointerEvents = "none";
    const panel = modeBody.querySelector(".session-summary-panel");
    if (panel) {
      panel.classList.add("session-summary-panel--out");
      card.classList.add("idle-time-card--summary-exit");
      summaryExitTimer = window.setTimeout(() => {
        summaryExitTimer = null;
        setOverlayVisibility(false);
      }, 340);
      return;
    }
    setOverlayVisibility(false);
  }

  function attachSummaryDismissListener() {
    detachSummaryDismissListener();
    if (!modeBody) return;
    const ctrl = new AbortController();
    summaryDismissAbort = ctrl;
    modeBody.addEventListener(
      "click",
      () => {
        if (!isGenerating) hideSummaryWithExitAnimation();
      },
      { signal: ctrl.signal, capture: true }
    );
  }

  function renderMode() {
    clearModeTimers();
    if (!modeBody) return;
    modeBody.style.pointerEvents = "";
    if (currentMode === MODES.PLAY) renderPlayMode();
    else if (currentMode === MODES.BRAIN) renderBrainMode();
    else renderFocusMode();
    lastOverlayPositionMs = 0;
    window.requestAnimationFrame(() => updateOverlaySafePosition());
  }

  function renderPlayMode() {
    voidPlayRound("renderPlayMode");
    modeBody.innerHTML = `
      <div class="play-react">
        <div class="play-hud" aria-live="polite">
          <span class="play-hud-stat"><span class="play-hud-label">hit</span> <strong data-play-hits>0</strong></span>
          <span class="play-hud-stat"><span class="play-hud-label">miss</span> <strong data-play-miss>0</strong></span>
          <span class="play-hud-stat play-hud-avg"><span class="play-hud-label">avg</span> <strong data-play-avg>—</strong></span>
        </div>
        <div class="play-area" aria-label="Micro-game"></div>
      </div>
    `;
    const area = modeBody.querySelector(".play-area");
    const elHits = modeBody.querySelector("[data-play-hits]");
    const elMiss = modeBody.querySelector("[data-play-miss]");
    const elAvg = modeBody.querySelector("[data-play-avg]");

    function updateHud() {
      elHits.textContent = String(runtimeStats.hits);
      elMiss.textContent = String(runtimeStats.playMisses);
      const samples = runtimeStats.reactionMsSamples;
      if (!samples.length) {
        elAvg.textContent = "—";
        return;
      }
      const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
      elAvg.textContent = `${avg}ms`;
    }

    const ctx = {
      gameId: sessionPlayGameId,
      modeBody,
      area,
      elHits,
      elMiss,
      elAvg,
      card,
      isPlayMode: () => currentMode === MODES.PLAY,
      isGenerating: () => isGenerating,
      isCardHidden: () => card.classList.contains("hidden"),
      getPlayModeTuning,
      runtimeStats,
      trackEvent,
      debugPlay,
      updateHud
    };

    const create = globalThis.__KEEL_createMicroGame;
    if (typeof create !== "function") {
      console.error("Keel: missing __KEEL_createMicroGame (game scripts must load before content.js).");
      return;
    }
    const inst = create(sessionPlayGameId, ctx);
    destroyActivePlayGame = () => {
      if (inst && typeof inst.destroy === "function") inst.destroy(ctx);
    };
  }

  function renderBrainMode() {
    const item = brainQuestions[brainIndex];
    modeBody.innerHTML = `<div class="brain-question">${item.question}</div><div class="brain-answers"></div><div class="brain-feedback"></div>`;
    const answersEl = modeBody.querySelector(".brain-answers");
    const feedbackEl = modeBody.querySelector(".brain-feedback");
    item.answers.forEach((answer, index) => {
      const button = document.createElement("button");
      button.className = "brain-answer";
      button.textContent = answer;
      button.addEventListener("click", () => {
        const isCorrect = index === item.correct;
        runtimeStats.brainAnswered += 1;
        if (isCorrect) runtimeStats.brainCorrect += 1;
        feedbackEl.textContent = isCorrect ? "Correct" : "Incorrect";
        feedbackEl.classList.toggle("correct", isCorrect);
        feedbackEl.classList.toggle("incorrect", !isCorrect);
        answersEl.querySelectorAll("button").forEach((btn) => (btn.disabled = true));
        trackEvent("brain_answer", { correct: isCorrect });
        brainNextTimer = setTimeout(() => {
          brainIndex = (brainIndex + 1) % brainQuestions.length;
          renderBrainMode();
        }, BRAIN_NEXT_QUESTION_DELAY_MS);
      });
      answersEl.appendChild(button);
    });
  }

  function renderFocusMode() {
    modeBody.innerHTML = `<div class="focus-prompt">${focusPrompts[focusIndex]}</div><button class="focus-next">Next Prompt</button>`;
    modeBody.querySelector(".focus-next").addEventListener("click", () => {
      runtimeStats.focusPromptsCompleted += 1;
      focusIndex = (focusIndex + 1) % focusPrompts.length;
      trackEvent("focus_prompt_next", { focusIndex });
      renderFocusMode();
    });
  }

  function resetSessionState() {
    brainIndex = Math.floor(Math.random() * brainQuestions.length);
    focusIndex = Math.floor(Math.random() * focusPrompts.length);
    setMode(defaultModeFromPrefs());
  }

  function startSession() {
    ensureDailyBestWindow();
    runtimeStats.sessionActive = true;
    runtimeStats.currentSessionId = persistence.nextSessionId();
    runtimeStats.sessionStartMs = Date.now();
    runtimeStats.hits = 0;
    runtimeStats.playMisses = 0;
    runtimeStats.reactionMsSamples = [];
    runtimeStats.brainAnswered = 0;
    runtimeStats.brainCorrect = 0;
    runtimeStats.focusPromptsCompleted = 0;
    runtimeStats.events = [];
    const gReg = globalThis.__KEEL_GAMES_REGISTRY;
    sessionPlayGameId =
      gReg && typeof gReg.pickRandomGameId === "function"
        ? gReg.pickRandomGameId(userPrefs.enabledGames)
        : "current";
    trackEvent("session_started", { mode: currentMode, microGame: sessionPlayGameId });
  }

  function finishSession(generationEndedSuccessfully) {
    if (!runtimeStats.sessionActive) return null;
    runtimeStats.sessionActive = false;
    const durationMs = Math.max(1, Date.now() - runtimeStats.sessionStartMs);
    const durationSec = durationMs / 1000;
    const modeKey = currentMode;
    const samples = runtimeStats.reactionMsSamples;
    let summary;
    if (modeKey === MODES.PLAY) {
      const hitsPerSecond = runtimeStats.hits / durationSec;
      runtimeStats.bestHpsToday = Math.max(runtimeStats.bestHpsToday, hitsPerSecond);
      const averageReactionMs =
        samples.length > 0 ? samples.reduce((a, b) => a + b, 0) / samples.length : null;
      summary = {
        sessionMode: MODES.PLAY,
        hits: runtimeStats.hits,
        misses: runtimeStats.playMisses,
        durationSec,
        hitsPerSecond,
        bestHpsToday: runtimeStats.bestHpsToday,
        averageReactionMs
      };
    } else if (modeKey === MODES.BRAIN) {
      const answered = runtimeStats.brainAnswered;
      const correct = runtimeStats.brainCorrect;
      const wrong = Math.max(0, answered - correct);
      const accuracyPct = answered > 0 ? (100 * correct) / answered : 0;
      const hitsPerSecond = answered / durationSec;
      summary = {
        sessionMode: MODES.BRAIN,
        durationSec,
        brainAnswered: answered,
        brainCorrect: correct,
        accuracyPct,
        hits: answered,
        misses: wrong,
        hitsPerSecond,
        bestHpsToday: runtimeStats.bestHpsToday,
        averageReactionMs: null
      };
    } else {
      const n = runtimeStats.focusPromptsCompleted;
      const hitsPerSecond = n / durationSec;
      summary = {
        sessionMode: MODES.FOCUS,
        durationSec,
        focusPromptsCompleted: n,
        hits: n,
        misses: 0,
        hitsPerSecond,
        bestHpsToday: runtimeStats.bestHpsToday,
        averageReactionMs: null
      };
    }
    const sessionRecord = createSessionRecord(summary, generationEndedSuccessfully);
    trackEvent("session_ended", {
      sessionMode: summary.sessionMode,
      hits: summary.hits,
      misses: summary.misses,
      durationMs,
      hitsPerSecond: summary.hitsPerSecond,
      averageReactionMs: summary.averageReactionMs,
      brainAnswered: summary.brainAnswered,
      brainCorrect: summary.brainCorrect,
      accuracyPct: summary.accuracyPct,
      focusPromptsCompleted: summary.focusPromptsCompleted,
      generationEndedSuccessfully
    });
    void persistence.saveSession(sessionRecord);
    runtimeStats.currentSessionId = "";
    return summary;
  }

  function renderSessionSummary(summary) {
    if (!modeBody || !card) return;
    detachSummaryDismissListener();
    card.classList.remove("idle-time-card--summary-exit");
    card.classList.add("idle-time-card--summary");
    modeBody.style.pointerEvents = "auto";
    modeBody.style.opacity = "0";
    modeBody.style.transform = "translateY(6px) scale(0.98)";
    modeBody.style.transition = "none";
    const mode = summary.sessionMode || MODES.PLAY;
    const durSec = Number(summary.durationSec) || 0;
    const durLabel = durSec >= 60 ? `${Math.floor(durSec / 60)}m ${Math.round(durSec % 60)}s` : `${durSec.toFixed(1)}s`;

    let inner;
    if (mode === MODES.BRAIN) {
      const answered = Number(summary.brainAnswered) || 0;
      const correct = Number(summary.brainCorrect) || 0;
      const acc = answered > 0 ? summary.accuracyPct.toFixed(0) : "—";
      inner = `
      <div class="session-summary session-summary--brain session-summary-panel" role="status" aria-label="Session results">
        <div class="session-summary-kicker">Session complete · Brain</div>
        <div class="session-summary-primary" aria-label="Accuracy">
          <span class="session-summary-primary-emoji" aria-hidden="true">🧠</span>
          <span class="session-summary-primary-value">${acc}</span>
          <span class="session-summary-primary-unit">${answered > 0 ? "% correct" : "no answers yet"}</span>
        </div>
        <div class="session-summary-secondary">
          <div class="session-summary-line"><span class="session-summary-line-emoji" aria-hidden="true">✅</span><span class="session-summary-line-text">${correct} correct</span></div>
          <div class="session-summary-line"><span class="session-summary-line-emoji" aria-hidden="true">📝</span><span class="session-summary-line-text">${answered} answered</span></div>
          <div class="session-summary-line"><span class="session-summary-line-emoji" aria-hidden="true">⏱</span><span class="session-summary-line-text">${durLabel}</span></div>
        </div>
        <p class="session-summary-hint">Tap anywhere to close</p>
      </div>`;
    } else if (mode === MODES.FOCUS) {
      const n = Number(summary.focusPromptsCompleted) || 0;
      inner = `
      <div class="session-summary session-summary--focus session-summary-panel" role="status" aria-label="Session results">
        <div class="session-summary-kicker">Session complete · Focus</div>
        <div class="session-summary-primary" aria-label="Prompts completed">
          <span class="session-summary-primary-emoji" aria-hidden="true">🌿</span>
          <span class="session-summary-primary-value">${n}</span>
          <span class="session-summary-primary-unit">${n === 1 ? "prompt" : "prompts"}</span>
        </div>
        <div class="session-summary-secondary">
          <div class="session-summary-line"><span class="session-summary-line-emoji" aria-hidden="true">⏱</span><span class="session-summary-line-text">${durLabel} session</span></div>
        </div>
        <p class="session-summary-hint">Tap anywhere to close</p>
      </div>`;
    } else {
      const hits = summary.hits;
      const misses = Number(summary.misses) || 0;
      const hps = summary.hitsPerSecond.toFixed(2);
      const avgMs =
        summary.averageReactionMs != null && hits > 0 ? Math.round(summary.averageReactionMs) : null;
      const avgHtml =
        avgMs != null
          ? `<span class="session-summary-line-emoji" aria-hidden="true">⚡</span><span class="session-summary-line-text">${avgMs}ms avg</span>`
          : `<span class="session-summary-line-emoji" aria-hidden="true">⚡</span><span class="session-summary-line-text muted">—</span>`;
      const hitsLabel = hits === 1 ? "hit" : "hits";
      const missLabel = misses === 1 ? "miss" : "misses";
      inner = `
      <div class="session-summary session-summary--react session-summary-panel" role="status" aria-label="Session results">
        <div class="session-summary-kicker">Session complete · Play</div>
        <div class="session-summary-primary" aria-label="Hits per second">
          <span class="session-summary-primary-emoji" aria-hidden="true">🔥</span>
          <span class="session-summary-primary-value">${hps}</span>
          <span class="session-summary-primary-unit">hits/sec</span>
        </div>
        <div class="session-summary-secondary">
          <div class="session-summary-line">${avgHtml}</div>
          <div class="session-summary-line"><span class="session-summary-line-emoji" aria-hidden="true">🎯</span><span class="session-summary-line-text">${hits} ${hitsLabel}</span></div>
          <div class="session-summary-line"><span class="session-summary-line-emoji" aria-hidden="true">✖</span><span class="session-summary-line-text">${misses} ${missLabel}</span></div>
        </div>
        <p class="session-summary-hint">Tap anywhere to close</p>
      </div>`;
    }

    modeBody.innerHTML = inner;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!modeBody.isConnected) return;
        modeBody.style.transition = "opacity 0.34s ease, transform 0.34s ease";
        modeBody.style.opacity = "1";
        modeBody.style.transform = "translateY(0) scale(1)";
      });
    });
    attachSummaryDismissListener();
    lastOverlayPositionMs = 0;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => updateOverlaySafePosition());
    });
  }

  function setOverlayVisibility(visible) {
    if (!card) return;
    if (!visible) {
      card.classList.add("hidden");
      clearSummaryUiState();
      return;
    }
    card.classList.remove("hidden");
    lastOverlayPositionMs = 0;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => updateOverlaySafePosition());
    });
  }

  function isElementInteractable(el) {
    if (!el || !(el instanceof Element)) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return false;
    const style = globalThis.getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") return false;
    if (Number(style.opacity) === 0) return false;
    if (style.pointerEvents === "none") return false;
    return true;
  }

  function syncGenerationOverlay() {
    const raw = gen.detectGeneratingState();
    const now = Date.now();
    if (raw && !rawGenerationSince) rawGenerationSince = now;
    if (!raw) rawGenerationSince = 0;

    let want = false;
    if (!userPrefs.overlayWhileGenerating) want = false;
    else if (!raw) want = false;
    else if (userPrefs.triggerWhen === "always") want = true;
    else {
      const th = (Number(userPrefs.smartTriggerMinGenerationSec) || 3) * 1000;
      want = rawGenerationSince > 0 && now - rawGenerationSince >= th;
    }

    if (want !== isGenerating) onGenerationStateChange(want);
  }

  let lastOverlayPositionMs = 0;
  function updateOverlaySafePosition() {
    if (!root || !card || card.classList.contains("hidden")) return;
    const now = Date.now();
    if (now - lastOverlayPositionMs < 320) return;
    lastOverlayPositionMs = now;
    const vpH = window.innerHeight;
    const vpW = window.innerWidth;
    const pad = Math.max(24, Math.min(40, Math.round(26 + vpW * 0.012)));
    const clearance = 24;
    let minObstacleTop = Infinity;

    document.querySelectorAll("textarea, [contenteditable='true']").forEach((el) => {
      if (el.closest("#idle-time-overlay-root")) return;
      const r = el.getBoundingClientRect();
      if (r.width < 100 || r.height < 16) return;
      if (r.top < vpH * 0.45) return;
      minObstacleTop = Math.min(minObstacleTop, r.top);
    });

    document.querySelectorAll("button").forEach((btn) => {
      if (btn.closest("#idle-time-overlay-root")) return;
      if (btn.closest("#idle-context-pin-root")) return;
      if (!gen.isStopGenerationControl(btn) || !isElementInteractable(btn)) return;
      const r = btn.getBoundingClientRect();
      if (r.top < vpH * 0.35) return;
      minObstacleTop = Math.min(minObstacleTop, r.top);
    });

    root.style.top = "auto";
    root.style.right = "auto";
    root.style.left = `${Math.max(pad, 0)}px`;

    let bottomPx = Math.max(pad, clearance);
    const rootH = root.offsetHeight || 280;
    if (Number.isFinite(minObstacleTop)) {
      const lift = vpH - minObstacleTop + clearance;
      bottomPx = Math.max(bottomPx, lift);
      const maxBottom = Math.max(pad, vpH - rootH - 10);
      bottomPx = Math.min(maxBottom, bottomPx);
      bottomPx = Math.max(pad, bottomPx);
    }
    root.style.bottom = `${bottomPx}px`;
  }

  function onGenerationStateChange(nextState) {
    if (isGenerating === nextState) return;
    isGenerating = nextState;
    if (isGenerating) {
      if (summaryHideTimer) clearTimeout(summaryHideTimer);
      summaryHideTimer = null;
      if (summaryExitTimer) clearTimeout(summaryExitTimer);
      summaryExitTimer = null;
      clearSummaryUiState();
      startSession();
      resetSessionState();
      setOverlayVisibility(true);
      return;
    }
    freezeActiveSessionUi();
    const summary = finishSession(true);
    if (!summary) {
      clearModeTimers();
      return setOverlayVisibility(false);
    }
    if (!userPrefs.showSessionSummary) {
      clearModeTimers();
      setOverlayVisibility(false);
      return;
    }
    renderSessionSummary(summary);
    setOverlayVisibility(true);
    const summaryMs = computeSummaryVisibleMs(summary);
    summaryHideTimer = window.setTimeout(() => {
      summaryHideTimer = null;
      if (!isGenerating) hideSummaryWithExitAnimation();
    }, summaryMs);
  }

  function observeHostDom() {
    const tick = () => {
      syncGenerationOverlay();
      updateOverlaySafePosition();
    };
    const observer = new MutationObserver(() => tick());
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    tick();
    generationPollTimer = setInterval(tick, GENERATION_POLL_MS);
  }

  function handlePageUnload() {
    if (generationPollTimer) {
      clearInterval(generationPollTimer);
      generationPollTimer = null;
    }
    if (!runtimeStats.sessionActive) return;
    clearModeTimers();
    finishSession(false);
  }

  async function init() {
    await refreshUserPrefs();
    if (globalThis.chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        if (!changes[EXTENSION_SETTINGS_KEY] && !changes[THEME_STORAGE_KEY]) return;
        const keys = Object.keys(changes);
        if (WNM_SYNC_LOG) {
          console.log("[wnm sync] EXT content: received chrome.storage.onChanged (from background)", { keys });
        }
        if (changes[EXTENSION_SETTINGS_KEY]) {
          const ch = changes[EXTENSION_SETTINGS_KEY];
          const oldVal = ch.oldValue ? coerceUserPrefs(ch.oldValue) : null;
          userPrefs = coerceUserPrefs(ch.newValue);
          if (DEBUG_SETTINGS_SYNC && WNM_SYNC_LOG) {
            console.log("[wnm sync] EXT content: parsed settings blob (diff)", {
              previousDefaultMode: oldVal?.defaultSessionMode,
              nextDefaultMode: userPrefs.defaultSessionMode,
              previousIntensity: oldVal?.playIntensity,
              nextIntensity: userPrefs.playIntensity
            });
          }
        }
        if (changes[THEME_STORAGE_KEY]) {
          applyTheme(changes[THEME_STORAGE_KEY].newValue);
        }
        applyPrefsToOverlay();
        logAppliedUserPrefs("live storage change (after applyPrefsToOverlay)");
      });
    }
    await persistence.load();
    exposeInternalHistory();
    createTestBadge();
    createOverlay();
    applyPrefsToOverlay();
    let resizeDebounce = null;
    window.addEventListener(
      "resize",
      () => {
        if (resizeDebounce) clearTimeout(resizeDebounce);
        resizeDebounce = setTimeout(() => {
          resizeDebounce = null;
          lastOverlayPositionMs = 0;
          updateOverlaySafePosition();
        }, 140);
      },
      { passive: true }
    );
    window.addEventListener("beforeunload", handlePageUnload);
    observeHostDom();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void init(), { once: true });
  } else {
    void init();
  }
})();
