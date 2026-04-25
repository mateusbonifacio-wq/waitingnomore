/**
 * Claude (claude.ai) — generation: MutationObserver (primary) on conversation text + button hints.
 * With all_frames, mount only the frame that holds the real composer/scroll region.
 */
(() => {
  const AUTH_PREFIXES = ["/login", "/signin", "/sign-in", "/signup", "/register", "/forgot", "/oauth", "/saml"];

  const LOG_ENABLED = (() => {
    try {
      const v = globalThis.localStorage && globalThis.localStorage.getItem("keelClaudeLog");
      return v !== "0" && v !== "false";
    } catch {
      return true;
    }
  })();

  const DEBUG_EXTRA = (() => {
    try {
      return globalThis.localStorage && globalThis.localStorage.getItem("keelDebugClaude") === "1";
    } catch {
      return false;
    }
  })();

  /** Stream start/end + container: always (diagnostics). Other lines: use logOptional. */
  function logRequired(...args) {
    // eslint-disable-next-line no-console
    console.log("[Keel/Claude]", ...args);
  }
  function logOptional(...args) {
    if (!LOG_ENABLED) return;
    // eslint-disable-next-line no-console
    console.log("[Keel/Claude]", ...args);
  }

  function findMainComposer() {
    return document.querySelector('textarea, [contenteditable="true"], [role="textbox"]');
  }

  function findMainBlock() {
    return document.querySelector("main[role]") || document.querySelector("main");
  }

  function findChatContainer() {
    if (!document.body) return null;
    const strong =
      document.querySelector("main[role]") ||
      document.querySelector("[class*='Conversation' i]") ||
      document.querySelector("[class*='message-list' i]") ||
      document.querySelector("[class*='MessageList' i]") ||
      document.querySelector("[data-testid*='conversation' i]") ||
      document.querySelector("section[aria-label*='Chat' i]") ||
      document.querySelector("[data-testid*='thread' i]") ||
      document.querySelector("[class*='thread' i]") ||
      document.querySelector("[class*='chat' i]");
    if (strong) return strong;
    const main = document.querySelector("main");
    if (main && main.querySelector("article, .prose, p, pre, code")) return main;
    return null;
  }

  function getConversationTextLength(rootOverride) {
    const root = rootOverride || findChatContainer();
    if (!root) return 0;
    const comp = findMainComposer();
    if (comp && root.contains(comp) && (comp instanceof Element)) {
      const full = (root.innerText || "").length;
      if (comp instanceof HTMLTextAreaElement) {
        const cLen = (comp.value || "").length;
        if (cLen) return Math.max(0, full - cLen);
      }
      const cLen2 = (comp.textContent || "").length;
      if (cLen2) return Math.max(0, full - cLen2);
    }
    return (root.innerText || "").length;
  }

  let cachedProgressRoot = null;
  let cachedProgressRootAt = 0;
  let lastProgressRootSig = "";

  function isVisibleBox(el) {
    if (!el || !(el instanceof Element)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 220 || r.height < 120) return false;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
    return true;
  }

  function getBestTextRoot() {
    const now = Date.now();
    if (
      cachedProgressRoot &&
      cachedProgressRoot.isConnected &&
      now - cachedProgressRootAt < 5000 &&
      isVisibleBox(cachedProgressRoot)
    ) {
      return cachedProgressRoot;
    }
    const direct = findChatContainer();
    if (direct && isVisibleBox(direct)) {
      cachedProgressRoot = direct;
      cachedProgressRootAt = now;
      return direct;
    }
    const composer = findMainComposer();
    const candidates = Array.from(
      document.querySelectorAll("main, article, section, [role='main'], div, [class*='conversation' i], [class*='thread' i]")
    ).slice(0, 400);
    let best = null;
    let bestScore = -1;
    for (const el of candidates) {
      if (!(el instanceof Element) || !isVisibleBox(el)) continue;
      const cls = (el.getAttribute("class") || "").toLowerCase();
      if (/sidebar|navigation|nav|menu/.test(cls)) continue;
      const txt = (el.innerText || "").length;
      if (txt < 60) continue;
      const scrollBonus = Math.max(0, Math.min(1200, (el.scrollHeight || 0) - (el.clientHeight || 0)));
      const msgBonus = el.querySelector("article, .prose, pre, code, p") ? 280 : 0;
      const composerPenalty = composer && el.contains(composer) ? 420 : 0;
      const score = txt + scrollBonus + msgBonus - composerPenalty;
      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    }
    cachedProgressRoot = best || findMainBlock() || document.body || null;
    cachedProgressRootAt = now;
    if (cachedProgressRoot) {
      const sig = `${cachedProgressRoot.tagName}:${(cachedProgressRoot.getAttribute("class") || "").slice(0, 64)}`;
      if (sig !== lastProgressRootSig) {
        lastProgressRootSig = sig;
        logRequired("progress root selected", sig);
      }
    }
    return cachedProgressRoot;
  }

  function getFrameInjection() {
    const isTop = self === top;
    const ifrN = document.getElementsByTagName("iframe").length;
    const hasComp = !!findMainComposer();
    const mainB = findMainBlock();
    const mainLen = mainB && (mainB.innerText || "").length ? (mainB.innerText || "").length : 0;
    const bodyLen = (document.body && (document.body.innerText || "").trim().length) || 0;
    if (!location.hostname.endsWith("claude.ai")) {
      return { ok: true, reason: "not-claude", isTop, ifrN, hasComp, mainLen, bodyLen };
    }
    // IMPORTANT: do not block top frame just because iframes exist.
    // Claude can render chat in top DOM without a plain textarea/contenteditable selector.
    if (isTop && ifrN > 0 && !hasComp) {
      return {
        ok: true,
        reason: "top+ifr+no composer: still mount top (avoid false negative)",
        isTop,
        ifrN,
        hasComp,
        mainLen,
        bodyLen
      };
    }
    if (!isTop) {
      if (hasComp || (mainB && mainLen > 30) || bodyLen > 80) {
        return { ok: true, reason: "subframe: composer or main/body", isTop, ifrN, hasComp, mainLen, bodyLen };
      }
      return { ok: false, reason: "subframe: empty / not the chat", isTop, ifrN, hasComp, mainLen, bodyLen };
    }
    return { ok: true, reason: "top document hosts chat (no ifr) or ifr+composer in top", isTop, ifrN, hasComp, mainLen, bodyLen };
  }

  function shouldInjectInFrame() {
    return getFrameInjection().ok;
  }

  function inActiveChatContext() {
    if (!location.hostname.endsWith("claude.ai")) return false;
    const path = (location.pathname || "/").toLowerCase();
    for (const p of AUTH_PREFIXES) {
      if (path === p || path.startsWith(p + "/")) return false;
    }
    return true;
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

  function isLooselyVisibleForGenHint(el) {
    if (!el || !(el instanceof Element)) return false;
    if (el.hasAttribute("hidden")) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const st = globalThis.getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return false;
    if (Number(st.opacity) < 0.1) return false;
    if (st.pointerEvents === "none") return true;
    return true;
  }

  function accessibleStopHint(el) {
    if (!el || !(el instanceof Element)) return "";
    const parts = [
      (el.getAttribute("aria-label") || "").trim(),
      (el.getAttribute("title") || "").trim(),
      (el.textContent || "").trim()
    ];
    const sr = el.querySelector(".sr-only, [class*='sr-only'], [class*='visually-hidden']");
    if (sr) parts.push((sr.textContent || "").trim());
    const t = el.querySelector("svg title");
    if (t) parts.push((t.textContent || "").trim());
    return parts
      .filter(Boolean)
      .join(" | ")
      .toLowerCase();
  }

  function forEachElementDeep(root, visit, maxNodes) {
    const cap = maxNodes || 10000;
    let n = 0;
    const walk = (node) => {
      if (!node || n >= cap) return;
      if (node instanceof Element) {
        visit(node);
        n += 1;
        const sr = node.shadowRoot;
        if (sr) walk(sr);
        for (const c of node.children) walk(c);
      }
    };
    if (root) walk(root);
  }

  function isStopMatchFromStrings(lbl, ttl, accHint, testId) {
    const tId = (testId || "").toLowerCase();
    if (tId && tId.includes("stop") && !/stopwatch|nonstop|pitstop|busstop|doorstop|non-stop|non_stopp/i.test(tId))
      return true;
    for (const s of [lbl, ttl, accHint]) {
      if (!s || !s.toLowerCase().includes("stop") || /stopwatch|stopping\.\.\.|non-stop|nonstop|backstop/i.test(s))
        continue;
      const low = s.toLowerCase().trim();
      if (low === "stop" || low === "stop." || low.startsWith("stop ")) return true;
      if (/(generat|respons|stream|output|claude|answer|complet|reply|think|creat|writ)/i.test(s)) return true;
    }
    return false;
  }

  function isStopElement(el) {
    if (!(el instanceof Element)) return false;
    const tag = el.tagName;
    if (tag === "BUTTON") return true;
    if (tag === "INPUT" && (el.getAttribute("type") === "submit" || el.getAttribute("type") === "button")) return true;
    if (el.getAttribute("role") === "button") return true;
    return false;
  }

  function isStopGenerationControl(button) {
    if (!button || !isStopElement(button)) return false;
    const label = (button.getAttribute("aria-label") || "").toLowerCase().trim();
    const title = (button.getAttribute("title") || "").toLowerCase().trim();
    const accHint = accessibleStopHint(button);
    const testId = (button.getAttribute("data-testid") || "").toLowerCase();
    const text = (button.textContent || "").trim().toLowerCase();
    if (isStopMatchFromStrings(label, title, accHint, testId)) return true;
    if (text === "stop" || text === "stop response" || text === "stop generation") return true;
    return false;
  }

  const LIGHT_STOPS = "button, [role='button'], input[type='button'], input[type='submit']";

  function hasVisibleStopControl() {
    const use = (el) => isStopGenerationControl(el) && (isElementInteractable(el) || isLooselyVisibleForGenHint(el));
    if (Array.from(document.querySelectorAll(LIGHT_STOPS)).some((el) => use(el))) return true;
    let found = false;
    forEachElementDeep(
      document.body,
      (el) => {
        if (found) return;
        if (!isStopElement(el)) return;
        if (isStopGenerationControl(el) && (isElementInteractable(el) || isLooselyVisibleForGenHint(el))) found = true;
      },
      12000
    );
    return found;
  }

  function hasStreamingDomSignals() {
    if (document.querySelector('[aria-busy="true"]')) return true;
    if (document.querySelector("[data-testid*='stream' i], [data-testid*='generat' i], [data-testid*='thinking' i]")) {
      return true;
    }
    if (document.querySelector("[class*='result-stream' i], [class*='_streaming' i]")) return true;
    if (document.querySelector("[class*='_thinking' i]")) return true;
    let found = false;
    forEachElementDeep(
      document.body,
      (el) => {
        if (found) return;
        if (!(el instanceof Element)) return;
        if (el.getAttribute("aria-busy") === "true") {
          found = true;
          return;
        }
        const tid = (el.getAttribute("data-testid") || "").toLowerCase();
        const cl = (el.getAttribute("class") || "").toLowerCase();
        if (tid && /stream|generat|think|compos|reply|assistant/.test(tid)) {
          found = true;
          return;
        }
        if (cl && /result-stream|_streaming|_thinking_|is-streaming|animate-stream/.test(cl)) found = true;
      },
      12000
    );
    return found;
  }

  const STREAM_END_STABLE_MS = 2300;
  const BOOT_GRACE_MS = 4500;
  const JUMP_NEW_BLOCK = 500;
  const GROWTH_MIN = 2;
  // Adaptive end timing: fast when we have strong completion evidence, slower otherwise.
  const END_FAST_AFTER_STOP_GONE_MS = 1200;
  const END_FAST_TEXT_IDLE_MS = 900;
  const END_NORMAL_ACTIVITY_IDLE_MS = 2600;
  const END_NORMAL_TEXT_IDLE_MS = 1800;
  const MIN_SESSION_MS = 1500;

  let isStreamingByObserver = false;
  let lastLenSnapshot = 0;
  let quietTimer = null;
  const streamBoot = Date.now();
  let isStreamingByProgress = false;
  let lastProgressLen = 0;
  let lastProgressGrowthAt = 0;
  let lastProgressSampleAt = 0;
  let generationActive = false;
  let generationStartedAt = 0;
  let generationLastActivityAt = 0;
  let generationLastTextGrowthAt = 0;
  let generationLastMeasuredLen = 0;
  let generationLastDomMutationAt = 0;
  let generationHadStopSignal = false;
  let generationStopSeenAt = 0;
  let generationStopGoneAt = 0;

  function isPastBootGrace() {
    return Date.now() - streamBoot > BOOT_GRACE_MS;
  }

  function onConversationMeasure(len) {
    if (!inActiveChatContext() || !isPastBootGrace()) {
      lastLenSnapshot = len;
      if (isStreamingByObserver) {
        isStreamingByObserver = false;
        logRequired("streaming end (left chat or boot)", { len });
      }
      if (quietTimer) {
        clearTimeout(quietTimer);
        quietTimer = null;
      }
      return;
    }
    if (len < lastLenSnapshot) {
      lastLenSnapshot = len;
      return;
    }
    const d = len - lastLenSnapshot;
    if (d <= 0) return;
    lastLenSnapshot = len;
    if (d > JUMP_NEW_BLOCK) {
      if (d > 800 && isStreamingByObserver) {
        isStreamingByObserver = false;
        if (quietTimer) {
          clearTimeout(quietTimer);
          quietTimer = null;
        }
        logRequired("streaming end (large non-streaming jump)", { d, len });
      }
      return;
    }
    if (d < GROWTH_MIN) return;
    if (!isStreamingByObserver) {
      logRequired("streaming start detected (conversation text growing)", { d, len });
    }
    isStreamingByObserver = true;
    if (quietTimer) clearTimeout(quietTimer);
    quietTimer = setTimeout(() => {
      isStreamingByObserver = false;
      quietTimer = null;
      logRequired("streaming end detected (text stable)", { lastLen: lastLenSnapshot });
    }, STREAM_END_STABLE_MS);
  }

  function detectFromObserver() {
    return inActiveChatContext() && isStreamingByObserver;
  }

  function updateProgressStreamingSignal() {
    if (!inActiveChatContext() || !isPastBootGrace()) {
      if (isStreamingByProgress) {
        isStreamingByProgress = false;
        logRequired("streaming end (progress reset)");
      }
      return false;
    }
    const now = Date.now();
    const root = getBestTextRoot();
    const len = getConversationTextLength(root);
    const d = len - lastProgressLen;
    const dt = lastProgressSampleAt ? now - lastProgressSampleAt : 0;
    lastProgressSampleAt = now;

    // Ignore cold-start and large chunk jumps that usually indicate completed block insertion.
    if (!lastProgressLen) {
      lastProgressLen = len;
    } else if (d > JUMP_NEW_BLOCK) {
      lastProgressLen = len;
    } else if (d >= GROWTH_MIN && dt <= 1400) {
      lastProgressLen = len;
      lastProgressGrowthAt = now;
      if (!isStreamingByProgress) {
        isStreamingByProgress = true;
        logRequired("streaming start detected (progress growth)", { d, len, dt });
      }
    } else if (d > 0) {
      // Keep position synced even when growth is small or slow.
      lastProgressLen = len;
    }

    if (isStreamingByProgress && lastProgressGrowthAt > 0 && now - lastProgressGrowthAt > STREAM_END_STABLE_MS) {
      isStreamingByProgress = false;
      logRequired("streaming end detected (progress stable)", { len, idleMs: now - lastProgressGrowthAt });
    }
    return isStreamingByProgress;
  }

  let containerObserver = null;
  let bodyProbeObserver = null;
  let rafId = 0;
  let bodyProbeRaf = 0;

  function runMeasureTick() {
    generationLastDomMutationAt = Date.now();
    onConversationMeasure(getConversationTextLength());
  }

  function watchContainer(node) {
    if (containerObserver) {
      try {
        containerObserver.disconnect();
      } catch { /* */ }
    }
    containerObserver = new MutationObserver(() => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        runMeasureTick();
      });
    });
    containerObserver.observe(node, { childList: true, subtree: true, characterData: true, attributes: true });
  }

  function startBodyProbeOnce() {
    if (bodyProbeObserver || !document.body) return;
    bodyProbeObserver = new MutationObserver(() => {
      if (bodyProbeRaf) cancelAnimationFrame(bodyProbeRaf);
      bodyProbeRaf = requestAnimationFrame(() => {
        bodyProbeRaf = 0;
        const c = findChatContainer();
        if (c) {
          logRequired("chat container: detected (success) — attaching observer", c.tagName, (c.getAttribute("class") || "").slice(0, 72));
          watchContainer(c);
          if (bodyProbeObserver) {
            try {
              bodyProbeObserver.disconnect();
            } catch { /* */ }
            bodyProbeObserver = null;
          }
          runMeasureTick();
        }
      });
    });
    bodyProbeObserver.observe(document.body, { childList: true, subtree: true });
  }

  function bootstrapGenerationWatch() {
    logRequired("frame", self === top ? "top" : "child", { href: location.href, ...getFrameInjection() });
    logOptional("(optional detail: set localStorage.keelClaudeLog=0 to hide non-critical logs)");

    const c0 = findChatContainer();
    if (c0) {
      logRequired("chat container: found on bootstrap", c0.tagName, (c0.getAttribute("class") || "").slice(0, 80));
      watchContainer(c0);
    } else {
      logRequired("chat container: not found on bootstrap — will probe <body> and poll");
      startBodyProbeOnce();
      const p = setInterval(() => {
        const c1 = findChatContainer();
        if (c1) {
          clearInterval(p);
          if (!containerObserver) {
            logRequired("chat container: found on retry — attaching observer", c1.tagName, (c1.getAttribute("class") || "").slice(0, 64));
            watchContainer(c1);
            if (bodyProbeObserver) {
              try {
                bodyProbeObserver.disconnect();
              } catch { /* */ }
              bodyProbeObserver = null;
            }
            runMeasureTick();
          }
        }
      }, 500);
      setTimeout(() => clearInterval(p), 20000);
    }
    setTimeout(() => {
      if (!containerObserver) {
        const late = findChatContainer();
        if (late) {
          logRequired("chat container: late find — attaching", late.tagName);
          watchContainer(late);
          runMeasureTick();
        } else {
          logRequired("chat container: not found (still) — set localStorage.keelDebugClaude=1 for details; DOM may not expose main/scroll", {
            hasBody: !!document.body
          });
        }
      }
    }, 12000);
  }

  function detectGeneratingState() {
    if (!inActiveChatContext()) return false;
    const a = detectFromObserver();
    const p = updateProgressStreamingSignal();
    const s = hasVisibleStopControl();
    const h = hasStreamingDomSignals();
    const rawSignal = a || p || s || h;
    const now = Date.now();
    const len = getConversationTextLength(getBestTextRoot());
    const d = len - generationLastMeasuredLen;
    const hasTextGrowth = d >= GROWTH_MIN && d < 4000;
    if (len >= 0) generationLastMeasuredLen = len;

    if (s) {
      generationHadStopSignal = true;
      generationStopSeenAt = now;
      generationStopGoneAt = 0;
    } else if (generationActive && generationHadStopSignal && generationStopGoneAt === 0) {
      generationStopGoneAt = now;
    }

    if (rawSignal || hasTextGrowth) generationLastActivityAt = now;
    if (hasTextGrowth) generationLastTextGrowthAt = now;

    if (!generationActive && (rawSignal || hasTextGrowth)) {
      generationActive = true;
      generationStartedAt = now;
      generationHadStopSignal = s;
      generationStopSeenAt = s ? now : 0;
      generationStopGoneAt = 0;
      if (!generationLastActivityAt) generationLastActivityAt = now;
      if (!generationLastTextGrowthAt) generationLastTextGrowthAt = now;
      logRequired("generation session START", { via: { observer: a, progress: p, stop: s, heur: h }, len, d });
    }

    if (generationActive) {
      const activeFor = now - generationStartedAt;
      const idleFor = now - generationLastActivityAt;
      const textIdleFor = now - generationLastTextGrowthAt;
      const domIdleFor = generationLastDomMutationAt ? now - generationLastDomMutationAt : Number.POSITIVE_INFINITY;
      const stopGoneFor = generationStopGoneAt ? now - generationStopGoneAt : 0;
      // Hard keep while explicit stop control exists.
      if (s) return true;

      const hasStrongCompletion = generationHadStopSignal && generationStopGoneAt > 0;
      const fastKeep = stopGoneFor < END_FAST_AFTER_STOP_GONE_MS || textIdleFor < END_FAST_TEXT_IDLE_MS;
      const normalKeep =
        idleFor < END_NORMAL_ACTIVITY_IDLE_MS || textIdleFor < END_NORMAL_TEXT_IDLE_MS || domIdleFor < END_NORMAL_ACTIVITY_IDLE_MS;

      // Keep active through normal Claude pauses and non-text content updates.
      if (activeFor < MIN_SESSION_MS || (hasStrongCompletion ? fastKeep : normalKeep)) {
        if (DEBUG_EXTRA) {
          // eslint-disable-next-line no-console
          console.log("[Keel/Claude:session]", {
            activeFor,
            idleFor,
            textIdleFor,
            domIdleFor,
            stopGoneFor,
            hasStrongCompletion,
            len,
            rawSignal,
            hasTextGrowth
          });
        }
        return true;
      }
      generationActive = false;
      generationStartedAt = 0;
      generationLastActivityAt = 0;
      generationLastTextGrowthAt = 0;
      generationLastMeasuredLen = len;
      generationLastDomMutationAt = 0;
      generationHadStopSignal = false;
      generationStopSeenAt = 0;
      generationStopGoneAt = 0;
      logRequired("generation session END", {
        activeFor,
        idleFor,
        textIdleFor,
        domIdleFor,
        hasStrongCompletion,
        stopGoneFor,
        len
      });
      return false;
    }

    const on = false;
    if (DEBUG_EXTRA) {
      // eslint-disable-next-line no-console
      console.log("[Keel/Claude:debug]", {
        observerStream: a,
        progressStream: p,
        stop: s,
        heur: h,
        hasTextGrowth,
        d,
        rawSignal,
        on,
        len
      });
    }
    return on;
  }

  globalThis.__KEEL_GENERATION_API = {
    siteId: "claude",
    shouldInjectInFrame,
    getFrameInjection,
    isStopGenerationControl,
    detectGeneratingState,
    bootstrapGenerationWatch
  };
})();
