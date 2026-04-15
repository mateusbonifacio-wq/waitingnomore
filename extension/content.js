(() => {
  if (window.__chatgptIdleOverlayInjected) return;
  window.__chatgptIdleOverlayInjected = true;
  console.log("[ChatGPT Idle Overlay] content script injected");

  const MODES = { PLAY: "play", BRAIN: "brain", FOCUS: "focus" };
  const SUMMARY_VISIBLE_MS = 2200;
  const MAX_STORED_SESSIONS = 200;
  const MAX_STORED_EVENTS = 600;
  const STORAGE_KEYS = {
    sessions: "idle_overlay_sessions",
    eventQueue: "idle_overlay_event_queue",
    meta: "idle_overlay_meta"
  };

  const brainQuestions = [
    { question: "If all Bloops are Razzies and all Razzies are Lazzies, are all Bloops Lazzies?", answers: ["Yes", "No", "Cannot know"], correct: 0 },
    { question: "A clock shows 3:15. What is the angle between hands?", answers: ["7.5 deg", "0 deg", "15 deg"], correct: 0 },
    { question: "Which is next: 2, 6, 12, 20, ?", answers: ["28", "30", "32"], correct: 1 }
  ];
  const focusPrompts = ["Roll your shoulders.", "Take one deep breath.", "Look away from the screen for 3 seconds.", "Relax your jaw."];

  let currentMode = MODES.PLAY;
  let isGenerating = false;
  let playScore = 0;
  let playMoveTimer = null;
  let brainNextTimer = null;
  let summaryHideTimer = null;
  let brainIndex = 0;
  let focusIndex = 0;
  let root;
  let card;
  let modeBody;

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
    return {
      id: runtimeStats.currentSessionId,
      schemaVersion: 1,
      timestamp: new Date().toISOString(),
      mode: currentMode,
      totalHits: summary.hits,
      durationSeconds: Number(summary.durationSec.toFixed(3)),
      hitsPerSecond: Number(summary.hitsPerSecond.toFixed(4)),
      generationStarted: true,
      generationEndedSuccessfully,
      metrics: {
        normalizedScore: Number(summary.hitsPerSecond.toFixed(4))
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
    badge.textContent = "Extension Active";
    document.documentElement.appendChild(badge);
  }

  function createOverlay() {
    root = document.createElement("div");
    root.id = "idle-time-overlay-root";
    root.innerHTML = `
      <div class="idle-time-card hidden" role="status" aria-live="polite">
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
    if (playMoveTimer) clearInterval(playMoveTimer);
    if (brainNextTimer) clearTimeout(brainNextTimer);
    if (summaryHideTimer) clearTimeout(summaryHideTimer);
    playMoveTimer = null;
    brainNextTimer = null;
    summaryHideTimer = null;
  }

  function renderMode() {
    clearModeTimers();
    if (!modeBody) return;
    if (currentMode === MODES.PLAY) return renderPlayMode();
    if (currentMode === MODES.BRAIN) return renderBrainMode();
    renderFocusMode();
  }

  function renderPlayMode() {
    modeBody.innerHTML = `<div class="play-score">Score: <strong>${playScore}</strong></div><div class="play-area"><button class="play-target" aria-label="Target"></button></div>`;
    const target = modeBody.querySelector(".play-target");
    const area = modeBody.querySelector(".play-area");
    const moveTarget = () => {
      const x = Math.floor(Math.random() * Math.max(10, area.clientWidth - 36));
      const y = Math.floor(Math.random() * Math.max(10, area.clientHeight - 36));
      target.style.left = `${x}px`;
      target.style.top = `${y}px`;
    };
    target.addEventListener("click", () => {
      playScore += 1;
      runtimeStats.hits += 1;
      trackEvent("play_hit", { totalHits: runtimeStats.hits });
      modeBody.querySelector(".play-score strong").textContent = String(playScore);
      moveTarget();
    });
    moveTarget();
    playMoveTimer = setInterval(moveTarget, 900);
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
    playScore = 0;
    brainIndex = Math.floor(Math.random() * brainQuestions.length);
    focusIndex = Math.floor(Math.random() * focusPrompts.length);
    setMode(MODES.PLAY);
  }

  function startSession() {
    ensureDailyBestWindow();
    runtimeStats.sessionActive = true;
    runtimeStats.currentSessionId = persistence.nextSessionId();
    runtimeStats.sessionStartMs = Date.now();
    runtimeStats.hits = 0;
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
    const summary = {
      hits: runtimeStats.hits,
      durationSec,
      hitsPerSecond,
      bestHpsToday: runtimeStats.bestHpsToday
    };
    const sessionRecord = createSessionRecord(summary, generationEndedSuccessfully);
    trackEvent("session_ended", { hits: summary.hits, durationMs, hitsPerSecond, generationEndedSuccessfully });
    void persistence.saveSession(sessionRecord);
    runtimeStats.currentSessionId = "";
    return summary;
  }

  function renderSessionSummary(summary) {
    if (!modeBody) return;
    modeBody.innerHTML = `
      <div class="session-summary">
        <div class="session-summary-title">Session Result</div>
        <div class="session-summary-line">Total hits: <strong>${summary.hits}</strong></div>
        <div class="session-summary-line">Duration: <strong>${summary.durationSec.toFixed(1)}s</strong></div>
        <div class="session-summary-line">Hits/sec: <strong>${summary.hitsPerSecond.toFixed(2)}</strong></div>
        <div class="session-summary-line">Best today: <strong>${summary.bestHpsToday.toFixed(2)} h/s</strong></div>
      </div>
    `;
  }

  function setOverlayVisibility(visible) {
    if (!card) return;
    card.classList.toggle("hidden", !visible);
  }

  function isElementVisible(el) {
    return !!(el && el.offsetParent !== null);
  }

  function detectGeneratingState() {
    const hasStop = Array.from(document.querySelectorAll("button")).some((button) => {
      const label = (button.getAttribute("aria-label") || "").toLowerCase();
      const text = (button.textContent || "").trim().toLowerCase();
      const testId = (button.getAttribute("data-testid") || "").toLowerCase();
      return (label.includes("stop") || text === "stop" || text === "stop generating" || testId.includes("stop")) && isElementVisible(button);
    });
    if (hasStop) return true;
    return !!document.querySelector(".result-streaming, [data-is-streaming='true'], [aria-label='Stop generating']");
  }

  function onGenerationStateChange(nextState) {
    if (isGenerating === nextState) return;
    isGenerating = nextState;
    if (isGenerating) {
      if (summaryHideTimer) clearTimeout(summaryHideTimer);
      summaryHideTimer = null;
      startSession();
      resetSessionState();
      setOverlayVisibility(true);
      return;
    }
    clearModeTimers();
    const summary = finishSession(true);
    if (!summary) return setOverlayVisibility(false);
    renderSessionSummary(summary);
    setOverlayVisibility(true);
    summaryHideTimer = setTimeout(() => {
      if (!isGenerating) setOverlayVisibility(false);
      summaryHideTimer = null;
    }, SUMMARY_VISIBLE_MS);
  }

  function observeChatGptDom() {
    const observer = new MutationObserver(() => onGenerationStateChange(detectGeneratingState()));
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    onGenerationStateChange(detectGeneratingState());
    setInterval(() => onGenerationStateChange(detectGeneratingState()), 700);
  }

  function handlePageUnload() {
    if (!runtimeStats.sessionActive) return;
    clearModeTimers();
    finishSession(false);
  }

  async function init() {
    await persistence.load();
    exposeInternalHistory();
    createTestBadge();
    createOverlay();
    window.addEventListener("beforeunload", handlePageUnload);
    observeChatGptDom();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void init(), { once: true });
  } else {
    void init();
  }
})();
