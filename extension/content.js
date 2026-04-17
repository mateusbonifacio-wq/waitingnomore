(() => {
  /** Bump this string before each test build — also check DevTools console + overlay label. */
  const IDLE_EXTENSION_VERSION = "1.0.2";

  if (window.__chatgptIdleOverlayInjected) return;
  window.__chatgptIdleOverlayInjected = true;
  console.log(`Idle Extension v${IDLE_EXTENSION_VERSION} loaded`);

  const MODES = { PLAY: "play", BRAIN: "brain", FOCUS: "focus" };
  const SUMMARY_MIN_MS = 2800;
  const SUMMARY_MAX_MS = 7200;
  const GENERATION_POLL_MS = 280;
  const MAX_STORED_SESSIONS = 200;
  const MAX_STORED_EVENTS = 600;
  const STORAGE_KEYS = {
    sessions: "idle_overlay_sessions",
    eventQueue: "idle_overlay_event_queue",
    meta: "idle_overlay_meta"
  };

  const EXTENSION_SETTINGS_KEY = "waitingnomore.extensionSettings.v1";
  const defaultUserPrefs = {
    schemaVersion: 1,
    overlayWhileGenerating: true,
    defaultSessionMode: "play",
    showSessionSummary: true,
    playIntensity: "normal",
    triggerWhen: "always",
    smartTriggerMinGenerationSec: 3
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
  let playMoveTimer = null;
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
    const sec = Number(raw.smartTriggerMinGenerationSec);
    if (Number.isFinite(sec) && sec >= 1 && sec <= 30) base.smartTriggerMinGenerationSec = sec;
    return base;
  }

  async function refreshUserPrefs() {
    if (!globalThis.chrome?.storage?.local) return;
    const data = await chrome.storage.local.get(EXTENSION_SETTINGS_KEY);
    userPrefs = coerceUserPrefs(data[EXTENSION_SETTINGS_KEY]);
  }

  function getPlayTuning() {
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
    return {
      id: runtimeStats.currentSessionId,
      schemaVersion: 1,
      timestamp: new Date().toISOString(),
      mode: currentMode,
      totalHits: summary.hits,
      totalMisses: Number(summary.misses) || 0,
      durationSeconds: Number(summary.durationSec.toFixed(3)),
      hitsPerSecond: Number(summary.hitsPerSecond.toFixed(4)),
      averageReactionMs: avgRt == null ? null : Number(avgRt.toFixed(1)),
      generationStarted: true,
      generationEndedSuccessfully,
      metrics: {
        normalizedScore: Number(summary.hitsPerSecond.toFixed(4)),
        averageReactionMs: avgRt == null ? null : Number(avgRt.toFixed(1)),
        totalMisses: Number(summary.misses) || 0
      }
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
    badge.textContent = "Idle overlay on";
    document.documentElement.appendChild(badge);
  }

  function createOverlay() {
    root = document.createElement("div");
    root.id = "idle-time-overlay-root";
    root.innerHTML = `
      <div class="idle-time-card hidden" role="status" aria-live="polite">
        <span class="idle-time-version" aria-hidden="true">v${IDLE_EXTENSION_VERSION}</span>
        <div class="idle-time-header"><span class="idle-time-title">Idle-Time Interaction</span></div>
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
    if (playMoveTimer) clearTimeout(playMoveTimer);
    if (brainNextTimer) clearTimeout(brainNextTimer);
    if (summaryHideTimer) clearTimeout(summaryHideTimer);
    if (summaryExitTimer) clearTimeout(summaryExitTimer);
    playMoveTimer = null;
    brainNextTimer = null;
    summaryHideTimer = null;
    summaryExitTimer = null;
  }

  function clearModeTimersKeepSummaryTimer() {
    if (playMoveTimer) clearTimeout(playMoveTimer);
    if (brainNextTimer) clearTimeout(brainNextTimer);
    playMoveTimer = null;
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
    const hits = Number(summary.hits) || 0;
    const misses = Number(summary.misses) || 0;
    const hasAvg = summary.averageReactionMs != null && hits > 0;
    const fromDuration = Math.min(1100, Math.round(durationSec * 140));
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
    modeBody.innerHTML = `
      <div class="play-react">
        <div class="play-hud" aria-live="polite">
          <span class="play-hud-stat"><span class="play-hud-label">hit</span> <strong data-play-hits>0</strong></span>
          <span class="play-hud-stat"><span class="play-hud-label">miss</span> <strong data-play-miss>0</strong></span>
          <span class="play-hud-stat play-hud-avg"><span class="play-hud-label">avg</span> <strong data-play-avg>—</strong></span>
        </div>
        <div class="play-area" aria-label="Reaction targets"></div>
      </div>
    `;
    const area = modeBody.querySelector(".play-area");
    const elHits = modeBody.querySelector("[data-play-hits]");
    const elMiss = modeBody.querySelector("[data-play-miss]");
    const elAvg = modeBody.querySelector("[data-play-avg]");
    let spawnSerial = 0;
    let activeTarget = null;

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

    function difficultyWindowMs() {
      const t = getPlayTuning();
      const rounds = runtimeStats.hits + runtimeStats.playMisses;
      return Math.max(t.minV, Math.min(t.maxV, Math.round(t.base - rounds * t.step)));
    }

    function nextGapMs() {
      const t = getPlayTuning();
      const rounds = runtimeStats.hits + runtimeStats.playMisses;
      return Math.max(36, Math.round(t.gapMin + Math.random() * t.gapSpread - Math.min(38, rounds * t.gapRamp)));
    }

    function clearActiveRound() {
      if (playMoveTimer) {
        clearTimeout(playMoveTimer);
        playMoveTimer = null;
      }
      if (activeTarget && activeTarget.parentNode) activeTarget.remove();
      activeTarget = null;
    }

    function showReactionPop(clientX, clientY, ms) {
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

    function spawn() {
      clearActiveRound();
      if (currentMode !== MODES.PLAY || !area.isConnected) return;
      const serial = ++spawnSerial;
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
      activeTarget = target;

      playMoveTimer = window.setTimeout(() => {
        if (serial !== spawnSerial) return;
        if (!activeTarget || activeTarget !== target) return;
        target.remove();
        activeTarget = null;
        runtimeStats.playMisses += 1;
        trackEvent("play_miss", { totalMisses: runtimeStats.playMisses, totalHits: runtimeStats.hits });
        updateHud();
        playMoveTimer = window.setTimeout(spawn, nextGapMs());
      }, windowMs);

      target.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (serial !== spawnSerial || activeTarget !== target) return;
          window.clearTimeout(playMoveTimer);
          playMoveTimer = null;
          const reactionMs = Math.round(performance.now() - spawnAt);
          runtimeStats.reactionMsSamples.push(reactionMs);
          runtimeStats.hits += 1;
          trackEvent("play_hit", { totalHits: runtimeStats.hits, reactionMs });
          target.classList.remove("play-target--live");
          target.classList.add("play-target--hit");
          showReactionPop(event.clientX, event.clientY, reactionMs);
          activeTarget = null;
          window.setTimeout(() => {
            if (target.parentNode) target.remove();
          }, 140);
          updateHud();
          playMoveTimer = window.setTimeout(spawn, nextGapMs());
        },
        { passive: false }
      );
    }

    updateHud();
    playMoveTimer = window.setTimeout(spawn, getPlayTuning().spawnDelay);
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
        feedbackEl.textContent = isCorrect ? "Correct" : "Incorrect";
        feedbackEl.classList.toggle("correct", isCorrect);
        feedbackEl.classList.toggle("incorrect", !isCorrect);
        answersEl.querySelectorAll("button").forEach((btn) => (btn.disabled = true));
        trackEvent("brain_answer", { correct: isCorrect });
        brainNextTimer = setTimeout(() => {
          brainIndex = (brainIndex + 1) % brainQuestions.length;
          renderBrainMode();
        }, 1000);
      });
      answersEl.appendChild(button);
    });
  }

  function renderFocusMode() {
    modeBody.innerHTML = `<div class="focus-prompt">${focusPrompts[focusIndex]}</div><button class="focus-next">Next Prompt</button>`;
    modeBody.querySelector(".focus-next").addEventListener("click", () => {
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
    runtimeStats.events = [];
    trackEvent("session_started", { mode: currentMode });
  }

  function finishSession(generationEndedSuccessfully) {
    if (!runtimeStats.sessionActive) return null;
    runtimeStats.sessionActive = false;
    const durationMs = Math.max(1, Date.now() - runtimeStats.sessionStartMs);
    const durationSec = durationMs / 1000;
    const hitsPerSecond = runtimeStats.hits / durationSec;
    runtimeStats.bestHpsToday = Math.max(runtimeStats.bestHpsToday, hitsPerSecond);
    const samples = runtimeStats.reactionMsSamples;
    const averageReactionMs =
      samples.length > 0 ? samples.reduce((a, b) => a + b, 0) / samples.length : null;
    const summary = {
      hits: runtimeStats.hits,
      misses: runtimeStats.playMisses,
      durationSec,
      hitsPerSecond,
      bestHpsToday: runtimeStats.bestHpsToday,
      averageReactionMs
    };
    const sessionRecord = createSessionRecord(summary, generationEndedSuccessfully);
    trackEvent("session_ended", {
      hits: summary.hits,
      misses: summary.misses,
      durationMs,
      hitsPerSecond,
      averageReactionMs: summary.averageReactionMs,
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
    const hits = summary.hits;
    const hps = summary.hitsPerSecond.toFixed(2);
    const avgMs =
      summary.averageReactionMs != null && summary.hits > 0 ? Math.round(summary.averageReactionMs) : null;
    const avgHtml =
      avgMs != null
        ? `<span class="session-summary-line-emoji" aria-hidden="true">⚡</span><span class="session-summary-line-text">${avgMs}ms avg</span>`
        : `<span class="session-summary-line-emoji" aria-hidden="true">⚡</span><span class="session-summary-line-text muted">—</span>`;
    const hitsLabel = hits === 1 ? "hit" : "hits";
    modeBody.innerHTML = `
      <div class="session-summary session-summary--react session-summary-panel" role="status" aria-label="Session results">
        <div class="session-summary-kicker">Session complete</div>
        <div class="session-summary-primary" aria-label="Hits per second">
          <span class="session-summary-primary-emoji" aria-hidden="true">🔥</span>
          <span class="session-summary-primary-value">${hps}</span>
          <span class="session-summary-primary-unit">hits/sec</span>
        </div>
        <div class="session-summary-secondary">
          <div class="session-summary-line">${avgHtml}</div>
          <div class="session-summary-line"><span class="session-summary-line-emoji" aria-hidden="true">🎯</span><span class="session-summary-line-text">${hits} ${hitsLabel}</span></div>
        </div>
        <p class="session-summary-hint">Tap anywhere to close</p>
      </div>
    `;
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

  function isStopGenerationControl(button) {
    const testId = (button.getAttribute("data-testid") || "").toLowerCase();
    const label = (button.getAttribute("aria-label") || "").toLowerCase();
    const text = (button.textContent || "").trim().toLowerCase();
    if (testId.includes("stop-button") || (testId.includes("stop") && testId.includes("button"))) return true;
    if (label.includes("stop generating")) return true;
    if (text === "stop" || text === "stop generating") return true;
    return false;
  }

  function hasVisibleStopControl() {
    return Array.from(document.querySelectorAll("button")).some(
      (button) => isStopGenerationControl(button) && isElementInteractable(button)
    );
  }

  function hasStreamingDomSignals() {
    if (document.querySelector(".result-streaming")) return true;
    if (document.querySelector('[data-is-streaming="true"]')) return true;
    if (document.querySelector("[aria-live='assertive'] .result-streaming")) return true;
    return false;
  }

  function detectGeneratingState() {
    if (hasVisibleStopControl()) return true;
    if (hasStreamingDomSignals()) return true;
    const stopGen = document.querySelector("[aria-label='Stop generating']");
    return !!(stopGen && isElementInteractable(stopGen));
  }

  function syncGenerationOverlay() {
    const raw = detectGeneratingState();
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
      if (!isStopGenerationControl(btn) || !isElementInteractable(btn)) return;
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

  function observeChatGptDom() {
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
        if (area !== "local" || !changes[EXTENSION_SETTINGS_KEY]) return;
        userPrefs = coerceUserPrefs(changes[EXTENSION_SETTINGS_KEY].newValue);
        syncGenerationOverlay();
      });
    }
    await persistence.load();
    exposeInternalHistory();
    createTestBadge();
    createOverlay();
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
    observeChatGptDom();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void init(), { once: true });
  } else {
    void init();
  }
})();
