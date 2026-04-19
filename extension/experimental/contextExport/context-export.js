/**
 * Context export / chat summarization (experimental, paused)
 * ----------------------------------------------------------------
 * This file is NOT loaded by the active extension build.
 *
 * Context export feature is currently paused
 * Reason: unreliable results and not part of core product
 * Can be revisited later
 *
 * To re-enable: add to manifest.json content_scripts:
 *   "js": [ "experimental/contextExport/vendor/jspdf.umd.min.js", "experimental/contextExport/context-export.js", "content.js" ]
 *   "css": [ "styles.css", "experimental/contextExport/context-export.css" ]
 * Then in content.js init(), after trackEvent exists, call:
 *   globalThis.__wnmExperimentalContextExport?.install({
 *     trackEvent,
 *     debugLog: (...a) => { if (DEBUG_SETTINGS_SYNC) console.log(...a); }
 *   });
 * and wire applyPrefsToOverlay to __wnmExperimentalContextExport?.setThemeLight?.(userPrefs.themeMode === 'light')
 */
(function (global) {
  let contextPinRoot = null;
  let contextLastPdfBlob = null;
  let contextLastPlainText = "";

  let _trackEvent = function () {};
  let _debugLog = function () {};

  function setDeps(deps) {
    if (deps && typeof deps.trackEvent === "function") _trackEvent = deps.trackEvent;
    if (deps && typeof deps.debugLog === "function") _debugLog = deps.debugLog;
  }

  function ctxSleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  /** Best-effort: scrollable region that holds chat turns (ChatGPT lazy-loads older turns). */
  function findChatScrollContainer() {
    const msg = document.querySelector("[data-message-author-role]");
    if (msg) {
      let el = msg.parentElement;
      for (let i = 0; i < 24 && el; i++) {
        const st = window.getComputedStyle(el);
        const oy = st.overflowY;
        if ((oy === "auto" || oy === "scroll" || oy === "overlay") && el.scrollHeight > el.clientHeight + 40) {
          return el;
        }
        el = el.parentElement;
      }
    }
    const main = document.querySelector("main");
    if (main) {
      const st = window.getComputedStyle(main);
      if ((st.overflowY === "auto" || st.overflowY === "scroll") && main.scrollHeight > main.clientHeight + 40) {
        return main;
      }
      const inner = main.querySelector("div[class*='overflow-y'], [class*='overflow-y-auto']");
      if (inner && inner.scrollHeight > inner.clientHeight + 40) return inner;
    }
    return main || document.scrollingElement || document.documentElement;
  }

  /**
   * Scroll upward in steps so lazy-loaded older messages mount; then short settle delay.
   * @param {{ statusEl: HTMLElement, maxMs?: number }} opts
   */
  async function ensureFullChatLoaded(opts) {
    const { statusEl, maxMs = 5000 } = opts;
    const el = findChatScrollContainer();
    const start = Date.now();
    let lastH = el.scrollHeight;
    let lastN = document.querySelectorAll("[data-message-author-role]").length;
    let idleAtTop = 0;

    statusEl.textContent = "Loading full conversation…";

    while (Date.now() - start < maxMs) {
      const beforeTop = el.scrollTop;
      const beforeH = el.scrollHeight;
      const beforeN = document.querySelectorAll("[data-message-author-role]").length;

      const step = Math.min(520, Math.max(0, beforeTop));
      el.scrollTop = Math.max(0, beforeTop - step);

      await ctxSleep(130 + Math.floor(Math.random() * 130));

      const afterH = el.scrollHeight;
      const afterTop = el.scrollTop;
      const afterN = document.querySelectorAll("[data-message-author-role]").length;

      const contentGrew = afterH > beforeH || afterN > beforeN;
      const scrolled = Math.abs(afterTop - beforeTop) > 0.5 || step > 0;

      if (contentGrew) {
        lastH = afterH;
        lastN = afterN;
        idleAtTop = 0;
        continue;
      }

      if (afterTop <= 3) {
        await ctxSleep(160);
        const h2 = el.scrollHeight;
        const n2 = document.querySelectorAll("[data-message-author-role]").length;
        if (h2 === afterH && n2 === afterN) {
          idleAtTop += 1;
          if (idleAtTop >= 3) break;
        } else {
          idleAtTop = 0;
        }
      } else if (!scrolled && beforeTop === afterTop) {
        idleAtTop += 1;
        if (idleAtTop >= 4) break;
      } else {
        idleAtTop = 0;
      }

      lastH = afterH;
      lastN = afterN;
    }

    statusEl.textContent = "Preparing chat…";
    await ctxSleep(220);
  }

  function extractChatTurnsFromPage() {
    const turns = [];
    const seen = new Set();
    document.querySelectorAll("[data-message-author-role]").forEach((node) => {
      if (seen.has(node)) return;
      seen.add(node);
      const role = (node.getAttribute("data-message-author-role") || "").toLowerCase();
      if (role !== "user" && role !== "assistant" && role !== "system") return;
      const article = node.closest("article") || node;
      const text = (article.innerText || "").replace(/\s+/g, " ").trim();
      if (text.length < 2) return;
      turns.push({ role, text });
    });
    if (turns.length) return turns;
    document.querySelectorAll('[data-testid="conversation-turn"]').forEach((el, i) => {
      const text = (el.innerText || "").replace(/\s+/g, " ").trim();
      if (text.length < 20) return;
      turns.push({ role: i % 2 === 0 ? "user" : "assistant", text });
    });
    return turns;
  }

  function contextTrimWords(s, max) {
    const t = (s || "").replace(/\s+/g, " ").trim();
    if (!t) return "";
    if (t.length <= max) return t;
    const cut = t.slice(0, max - 1);
    const sp = cut.lastIndexOf(" ");
    return (sp > 24 ? cut.slice(0, sp) : cut) + "…";
  }

  /** Tokens for overlap checks — blocks accidental quotation of the thread. */
  function ctxTokenize(s) {
    return String(s)
      .toLowerCase()
      .replace(/[^a-z0-9\u00C0-\u024F\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 0);
  }

  function ctxBuildCorpusNgrams(userMsgs, asstMsgs, n) {
    const tokens = ctxTokenize([...userMsgs, ...asstMsgs].join("\n"));
    const set = new Set();
    if (tokens.length < n) return set;
    for (let i = 0; i <= tokens.length - n; i++) {
      set.add(tokens.slice(i, i + n).join(" "));
    }
    return set;
  }

  function ctxHasNgramOverlap(text, ngramSet, n) {
    if (!ngramSet || !ngramSet.size) return false;
    const tokens = ctxTokenize(text);
    if (tokens.length < n) return false;
    for (let i = 0; i <= tokens.length - n; i++) {
      if (ngramSet.has(tokens.slice(i, i + n).join(" "))) return true;
    }
    return false;
  }

  const CTX_SAFE_FALLBACKS = [
    "Continue from the direction implied by the latest assistant reply.",
    "Prioritize one clear next move instead of restating earlier wording.",
    "Use this brief for orientation; keep detailed evidence in the original thread.",
    "Treat the most recent assistant message as the working checklist until it is superseded.",
    "Prefer small, verifiable steps over broad rewrites when resuming work."
  ];

  function ctxSanitizeAgainstCorpus(line, ngram4, ngram5) {
    let s = String(line).replace(/\s+/g, " ").trim();
    let guard = 0;
    while (
      (ctxHasNgramOverlap(s, ngram5, 5) || ctxHasNgramOverlap(s, ngram4, 4)) &&
      guard < 28
    ) {
      s = CTX_SAFE_FALLBACKS[guard % CTX_SAFE_FALLBACKS.length];
      guard++;
    }
    return s;
  }

  function ctxThreadProfile(turns, userMsgs, asstMsgs) {
    const all = turns.map((t) => t.text).join("\n");
    const lower = all.toLowerCase();
    const lastTurn = turns.length ? turns[turns.length - 1] : null;
    const lastSpeaker = lastTurn ? lastTurn.role : "assistant";
    const lastAsst = asstMsgs.length ? asstMsgs[asstMsgs.length - 1] : "";

    const topics = {
      extension:
        /\b(extension|chrome|manifest|content script|content\.js|browser|reload\s+extension)\b/i.test(all),
      contextExport:
        /\b(context|pdf|export|handoff|summar|brief|analyze\s+context)\b/i.test(all),
      chatgptUi: /\b(chatgpt|assistant\s+reply|conversation|thread)\b/i.test(all),
      code: /```/.test(all) || /\b(javascript|typescript|css|html)\b/i.test(all),
      quality:
        /\b(quality|acceptable|better|improve|rewrite|fragment|keyword|raw\s+text|echo|transformation)\b/i.test(
          all
        ),
      loading: /\b(load|lazy|scroll|full\s+thread)\b/i.test(all)
    };

    let intent = "other";
    if (topics.quality && topics.contextExport) intent = "improve_handoff";
    else if (/\b(fix|bug|error|broken|fail|crash)\b/i.test(lower)) intent = "debug";
    else if (/\b(build|implement|add\s+feature|ship)\b/i.test(lower)) intent = "build";
    else if (/\b(understand|explain|why|how\s+does)\b/i.test(lower)) intent = "explain";
    else if (topics.quality) intent = "improve_quality";
    else if (/\b(configure|setting|deploy|vercel)\b/i.test(lower)) intent = "configure";

    const userFrustration =
      /\b(still not|not good enough|not acceptable|still bad|must fix|wrong|terrible|poor|not\s+good)\b/i.test(
        lower
      ) || (lastSpeaker === "user" && /\b(still|again)\b/i.test(lower.slice(-800)));

    const listLinesInLast = lastAsst
      ? lastAsst.split("\n").filter((l) => {
          const x = l.trim();
          return /^[-*•]\s/.test(x) || /^\d+[.)]\s/.test(x);
        }).length
      : 0;

    const assistantGaveCaveats = /\b(however|limitation|cannot|trade-?off|risk|caveat)\b/i.test(
      asstMsgs.slice(-1).join(" ")
    );

    return {
      topics,
      intent,
      userFrustration,
      listLinesInLast,
      lastSpeaker,
      assistantGaveCaveats,
      hasCodeBlocks: /```/.test(all),
      userTurns: userMsgs.length,
      asstTurns: asstMsgs.length
    };
  }

  const CTX_OBJECTIVE_BY_INTENT = {
    improve_handoff:
      "Produce a continuation brief that reads as if someone skimmed the whole exchange and wrote fresh prose: tight sections, plain words, and no pasted lines. The aim is practical orientation for a brand-new chat, not a transcript digest.",
    improve_quality:
      "Lift summarization from snippet assembly to deliberate wording so each part has one job. Outcomes should feel composed, not mined from the scrollback.",
    debug:
      "Remove the defect that started the thread and prove the fix under realistic use, including edge cases called out along the way.",
    build:
      "Ship the capability under discussion with clear verification, leaving no ambiguous setup or half-finished wiring.",
    explain:
      "Establish a crisp mental model of the idea or mechanism so later decisions stay consistent with that understanding.",
    configure:
      "Align configuration and deployment with the intended runtime behavior, then confirm with a quick smoke check.",
    other:
      "Move the thread forward with shared context and minimal duplicated effort, keeping the next session pointed at the real bottleneck."
  };

  function ctxBuildObjectiveRewrite(profile, ngram4, ngram5, used) {
    let body = CTX_OBJECTIVE_BY_INTENT[profile.intent] || CTX_OBJECTIVE_BY_INTENT.other;
    if (
      profile.intent === "other" &&
      profile.topics.extension &&
      profile.topics.contextExport
    ) {
      body =
        "Evolve the browser add-on so its context export helps a newcomer resume work without wading through raw logs. Favor rewritten prose over extracted chatter.";
    }
    if (profile.topics.loading && profile.topics.contextExport) {
      body =
        "Once the full thread is reachable, shift attention to how text is shaped: short sections, distinct roles, and language that does not echo the source lines.";
    }
    const line = ctxSanitizeAgainstCorpus(body, ngram4, ngram5);
    used.add(contextFingerprint(line));
    return contextTrimWords(line, 520);
  }

  function ctxPushBullet(text, bullets, used, maxLen, maxCount, ngram4, ngram5) {
    let t = ctxSanitizeAgainstCorpus(String(text).replace(/\s+/g, " ").trim(), ngram4, ngram5);
    t = contextTrimWords(t, maxLen);
    if (t.length < 14) return false;
    if (bullets.length >= maxCount) return false;
    const fp = contextFingerprint(t);
    if (contextOverlapsExisting(fp, used)) return false;
    used.add(fp);
    bullets.push(t);
    return true;
  }

  function ctxBuildKeyDecisionsRewrite(profile, bullets, used, ngram4, ngram5) {
    ctxPushBullet(
      "State decisions as short commitments in your own words; avoid carrying over phrasing from the transcript.",
      bullets,
      used,
      200,
      4,
      ngram4,
      ngram5
    );
    if (profile.listLinesInLast >= 2) {
      ctxPushBullet(
        "The latest reply enumerates several points; follow that sequence unless a later message explicitly reorders priorities.",
        bullets,
        used,
        200,
        4,
        ngram4,
        ngram5
      );
    } else {
      ctxPushBullet(
        "Anchor on the most recent guidance rather than older branches unless the thread revived them.",
        bullets,
        used,
        200,
        4,
        ngram4,
        ngram5
      );
    }
    if (profile.topics.contextExport) {
      ctxPushBullet(
        "Keep objective, commitments, status, risks, and follow-ups visually separate so each scans in seconds.",
        bullets,
        used,
        200,
        4,
        ngram4,
        ngram5
      );
    }
    if (profile.topics.extension) {
      ctxPushBullet(
        "Ship incremental extension changes, bump the visible version when behavior changes, and retest after a full reload.",
        bullets,
        used,
        200,
        4,
        ngram4,
        ngram5
      );
    } else if (profile.hasCodeBlocks) {
      ctxPushBullet(
        "Mirror repository changes implied by any embedded snippets before relying on manual checks alone.",
        bullets,
        used,
        200,
        4,
        ngram4,
        ngram5
      );
    }
    while (bullets.length < 2) {
      ctxPushBullet(
        CTX_SAFE_FALLBACKS[bullets.length % CTX_SAFE_FALLBACKS.length],
        bullets,
        used,
        200,
        4,
        ngram4,
        ngram5
      );
    }
    return bullets.slice(0, 4);
  }

  function ctxBuildCurrentStateRewrite(profile, ngram4, ngram5, used) {
    const bullets = [];
    if (profile.asstTurns === 0) {
      ctxPushBullet(
        "Assistant output was missing from the capture, so state cannot be summarized reliably.",
        bullets,
        used,
        220,
        3,
        ngram4,
        ngram5
      );
      return bullets;
    }
    ctxPushBullet(
      profile.lastSpeaker === "user"
        ? "The last turn is user-side feedback or a new ask; expect the next move to respond to that rather than restating earlier answers."
        : "The last turn is assistant-side guidance; treat it as the current working direction until superseded.",
      bullets,
      used,
      220,
      3,
      ngram4,
      ngram5
    );
    if (profile.assistantGaveCaveats) {
      ctxPushBullet(
        "The assistant flagged limits or trade-offs; those constraints still apply to any quick follow-up plan.",
        bullets,
        used,
        220,
        3,
        ngram4,
        ngram5
      );
    }
    if (bullets.length < 3) {
      if (profile.topics.contextExport && profile.topics.quality) {
        ctxPushBullet(
          "Attention is on how exported context reads: clarity and rewrite quality matter as much as capturing length.",
          bullets,
          used,
          220,
          3,
          ngram4,
          ngram5
        );
      } else if (profile.topics.extension) {
        ctxPushBullet(
          "Work sits in the extension surface: behavior changes should be validated in the real browser session.",
          bullets,
          used,
          220,
          3,
          ngram4,
          ngram5
        );
      } else {
        ctxPushBullet(
          "Overall progress should be judged by whether the latest guidance resolves the open concern, not by message count alone.",
          bullets,
          used,
          220,
          3,
          ngram4,
          ngram5
        );
      }
    }
    return bullets.slice(0, 3);
  }

  function ctxBuildProblemsRewrite(profile, ngram4, ngram5, used) {
    const bullets = [];
    if (profile.userFrustration && profile.topics.contextExport) {
      ctxPushBullet(
        "Exported context still fails the handoff test when it resembles stitched lines; the gap is rewrite fidelity, not missing scrollback.",
        bullets,
        used,
        220,
        3,
        ngram4,
        ngram5
      );
    } else if (profile.userFrustration) {
      ctxPushBullet(
        "Feedback suggests the last answer missed the target; the next round needs a sharper definition of “done.”",
        bullets,
        used,
        220,
        3,
        ngram4,
        ngram5
      );
    }
    if (profile.assistantGaveCaveats && bullets.length < 2) {
      ctxPushBullet(
        "Built-in summarization has a ceiling: without a hosted language model, nuance and tone will stay approximate.",
        bullets,
        used,
        220,
        3,
        ngram4,
        ngram5
      );
    }
    if (bullets.length === 0) {
      ctxPushBullet(
        "No separate hard blocker showed up beyond ordinary iteration; flag one only if progress is actually stuck.",
        bullets,
        used,
        220,
        3,
        ngram4,
        ngram5
      );
    }
    return bullets.slice(0, 3);
  }

  function ctxBuildNextStepsRewrite(profile, ngram4, ngram5, used) {
    const bullets = [];
    if (profile.topics.extension) {
      ctxPushBullet(
        "Reload the unpacked add-on, refresh the site, and run the context export again on this same thread to validate wording.",
        bullets,
        used,
        220,
        5,
        ngram4,
        ngram5
      );
    }
    if (profile.intent === "improve_handoff" || profile.intent === "improve_quality") {
      ctxPushBullet(
        "Inspect each exported section for accidental overlap with source lines; tighten rewrite logic if echoes appear.",
        bullets,
        used,
        220,
        5,
        ngram4,
        ngram5
      );
    }
    if (profile.lastSpeaker === "user" && profile.userFrustration) {
      ctxPushBullet(
        "In the next chat, name one failing section and describe the tone you want in a single sentence so feedback stays actionable.",
        bullets,
        used,
        220,
        5,
        ngram4,
        ngram5
      );
    }
    ctxPushBullet(
      "Open a fresh session, paste this brief, and ask for exactly one next implementation or test based on it.",
      bullets,
      used,
      220,
      5,
      ngram4,
      ngram5
    );
    return bullets.slice(0, 5);
  }

  function contextFingerprint(s) {
    return (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\u00C0-\u024F\s]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 96);
  }

  function contextOverlapsExisting(fp, used) {
    if (!fp || used.has(fp)) return true;
    for (const u of used) {
      const n = Math.min(fp.length, u.length, 28);
      if (n >= 22 && fp.slice(0, n) === u.slice(0, n)) return true;
    }
    return false;
  }

  function bulletsToBlock(lines) {
    return lines.map((l) => `• ${l}`).join("\n");
  }

  function buildStructuredContext(turns) {
    const userMsgs = turns.filter((t) => t.role === "user").map((t) => t.text);
    const asstMsgs = turns.filter((t) => t.role === "assistant").map((t) => t.text);
    const used = new Set();
    const ngram4 = ctxBuildCorpusNgrams(userMsgs, asstMsgs, 4);
    const ngram5 = ctxBuildCorpusNgrams(userMsgs, asstMsgs, 5);
    const profile = ctxThreadProfile(turns, userMsgs, asstMsgs);

    const objective = !userMsgs.length
      ? "No user messages were visible in the extracted thread."
      : ctxBuildObjectiveRewrite(profile, ngram4, ngram5, used);

    const decisionBullets = [];
    ctxBuildKeyDecisionsRewrite(profile, decisionBullets, used, ngram4, ngram5);
    decisionBullets.forEach((b) => used.add(contextFingerprint(b)));

    const stateBullets = ctxBuildCurrentStateRewrite(profile, ngram4, ngram5, used);
    stateBullets.forEach((b) => used.add(contextFingerprint(b)));

    const problemBullets = ctxBuildProblemsRewrite(profile, ngram4, ngram5, used);

    const nextBullets = ctxBuildNextStepsRewrite(profile, ngram4, ngram5, used);

    return {
      title: "Context from previous chat",
      intro:
        "Continuation handoff — rewritten from thread signals, not quoted lines. Paste into a new chat to resume.",
      objective,
      keyDecisions: bulletsToBlock(decisionBullets),
      currentState: bulletsToBlock(stateBullets),
      problems: bulletsToBlock(problemBullets),
      nextSteps: bulletsToBlock(nextBullets)
    };
  }

  function buildContextPdfBlob(ctx) {
    const jsPDF = globalThis.jspdf?.jsPDF;
    if (typeof jsPDF !== "function") throw new Error("jsPDF not loaded");
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 44;
    const pageH = doc.internal.pageSize.getHeight();
    const pageW = doc.internal.pageSize.getWidth();
    const maxW = pageW - margin * 2;
    let y = margin;
    const lineH = 13;
    function ensureSpace(linesNeeded) {
      if (y + linesNeeded * lineH > pageH - margin) {
        doc.addPage();
        y = margin;
      }
    }
    function addSectionBlock(heading, body) {
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      ensureSpace(2);
      doc.text(heading, margin, y);
      y += lineH + 6;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const blocks = String(body || "")
        .split(/\n/)
        .map((b) => b.trim())
        .filter(Boolean);
      for (const block of blocks) {
        const lines = doc.splitTextToSize(block, maxW);
        for (let i = 0; i < lines.length; i++) {
          ensureSpace(1);
          doc.text(lines[i], margin, y);
          y += lineH;
        }
        y += 4;
      }
      y += 10;
    }
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(ctx.title, margin, y);
    y += 26;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const introLines = doc.splitTextToSize(ctx.intro, maxW);
    for (const line of introLines) {
      ensureSpace(1);
      doc.text(line, margin, y);
      y += lineH;
    }
    y += 14;
    addSectionBlock("Objective", ctx.objective);
    addSectionBlock("Key decisions", ctx.keyDecisions);
    addSectionBlock("Current state", ctx.currentState);
    addSectionBlock("Problems", ctx.problems);
    addSectionBlock("Next steps", ctx.nextSteps);
    return doc.output("blob");
  }

  function plainTextFromContext(ctx) {
    return [
      ctx.title,
      "",
      ctx.intro,
      "",
      "Objective",
      ctx.objective,
      "",
      "Key decisions",
      ctx.keyDecisions,
      "",
      "Current state",
      ctx.currentState,
      "",
      "Problems",
      ctx.problems,
      "",
      "Next steps",
      ctx.nextSteps
    ].join("\n");
  }

  function createContextPin() {
    contextPinRoot = document.createElement("div");
    contextPinRoot.id = "idle-context-pin-root";
    contextPinRoot.innerHTML = `
      <button type="button" class="idle-context-pin-btn" aria-expanded="false" aria-label="Context export" title="Context export">◇</button>
      <div class="idle-context-panel hidden" role="dialog" aria-label="Context export panel">
        <div class="idle-context-panel-inner">
          <div class="idle-context-panel-head">Context</div>
          <button type="button" class="idle-context-analyze">Analyze context</button>
          <div class="idle-context-status" aria-live="polite"></div>
          <div class="idle-context-actions hidden">
            <p class="idle-context-ready">Context ready</p>
            <button type="button" class="idle-context-download">Download PDF</button>
            <button type="button" class="idle-context-copy">Copy context</button>
            <p class="idle-context-hint">Open a new chat and drag the file in, or paste copied text.</p>
          </div>
        </div>
      </div>
    `;
    document.documentElement.appendChild(contextPinRoot);

    const btn = contextPinRoot.querySelector(".idle-context-pin-btn");
    const panel = contextPinRoot.querySelector(".idle-context-panel");
    const statusEl = contextPinRoot.querySelector(".idle-context-status");
    const actionsEl = contextPinRoot.querySelector(".idle-context-actions");
    const analyzeBtn = contextPinRoot.querySelector(".idle-context-analyze");
    const downloadBtn = contextPinRoot.querySelector(".idle-context-download");
    const copyBtn = contextPinRoot.querySelector(".idle-context-copy");

    function setPanelOpen(open) {
      panel.classList.toggle("hidden", !open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    }

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setPanelOpen(panel.classList.contains("hidden"));
    });

    document.addEventListener(
      "click",
      (e) => {
        if (!contextPinRoot.contains(e.target)) setPanelOpen(false);
      },
      true
    );

    analyzeBtn.addEventListener("click", async () => {
      analyzeBtn.disabled = true;
      actionsEl.classList.add("hidden");
      contextLastPdfBlob = null;
      contextLastPlainText = "";
      try {
        await ensureFullChatLoaded({ statusEl, maxMs: 5000 });
        statusEl.textContent = "Analyzing chat…";
        const turns = extractChatTurnsFromPage();
        _debugLog("[wnm context] turns extracted", turns.length);
        if (!turns.length) {
          statusEl.textContent = "No conversation visible — scroll the chat into view and try again.";
          return;
        }
        const ctx = buildStructuredContext(turns);
        contextLastPlainText = plainTextFromContext(ctx);
        contextLastPdfBlob = buildContextPdfBlob(ctx);
        statusEl.textContent = "Summary ready.";
        actionsEl.classList.remove("hidden");
        _trackEvent("context_analyze_done", { turns: turns.length });
      } catch (err) {
        statusEl.textContent = String(err && err.message ? err.message : err);
        _trackEvent("context_analyze_error", { message: String(err) });
      } finally {
        analyzeBtn.disabled = false;
      }
    });

    downloadBtn.addEventListener("click", () => {
      if (!contextLastPdfBlob) return;
      const url = URL.createObjectURL(contextLastPdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chat-context-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      _trackEvent("context_pdf_download", {});
    });

    copyBtn.addEventListener("click", async () => {
      if (!contextLastPlainText) return;
      try {
        await navigator.clipboard.writeText(contextLastPlainText);
        statusEl.textContent = "Copied to clipboard.";
        _trackEvent("context_copy", {});
      } catch {
        statusEl.textContent = "Copy failed — select text or download PDF.";
      }
    });
  }
  global.__wnmExperimentalContextExport = {
    install(deps) {
      setDeps(deps || {});
      createContextPin();
    },
    setThemeLight(isLight) {
      if (contextPinRoot) {
        contextPinRoot.classList.toggle("idle-context-root--light", !!isLight);
      }
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
