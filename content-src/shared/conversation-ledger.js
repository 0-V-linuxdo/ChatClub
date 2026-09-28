import {
  FULLTEXT_LEDGER_TAIL,
  FULLTEXT_LEDGER_VERSION,
  conversationKeyFromHref,
  ledgerDigest,
  ledgerTurnEntry
} from "../../shared/fulltext-ledger.js";

export const CONVERSATION_LEDGER_TIMINGS = Object.freeze({
  // Frame RPC clamps a command at 60s; one long poll stays well inside that
  // so the parent's own timeout (waitMs plus a margin) never reaches the clamp.
  maxWaitMs: 25_000,
  // A streaming reply mutates the DOM continuously: recompute once it has
  // been quiet this long, and at least this often while it keeps mutating.
  quietMs: 1_200,
  maxDirtyMs: 4_000,
  // Nobody has asked for a while: stop observing until the next request.
  idleDisconnectMs: 5 * 60_000
});
const CONVERSATION_LEDGER_MAX_WAIT_MS = CONVERSATION_LEDGER_TIMINGS.maxWaitMs;
const CONVERSATION_LEDGER_QUIET_MS = CONVERSATION_LEDGER_TIMINGS.quietMs;
const CONVERSATION_LEDGER_MAX_DIRTY_MS = CONVERSATION_LEDGER_TIMINGS.maxDirtyMs;
const CONVERSATION_LEDGER_IDLE_DISCONNECT_MS = CONVERSATION_LEDGER_TIMINGS.idleDisconnectMs;
// A caret in the site's own composer only counts as editing while the user
// has touched the frame recently; an autofocused composer must not block.
const EDITING_RECENT_INPUT_MS = 30_000;

// Controls, chrome and form fields inside a turn never count as its text.
const LEDGER_HARD_SKIP_SELECTOR = [
  "button",
  "[role='button']",
  "[role='toolbar']",
  "[role='menu']",
  "[role='menuitem']",
  "[aria-label*='copy' i]",
  "[title*='copy' i]",
  "[data-testid*='copy' i]",
  ".code-buttons",
  "svg",
  "style",
  "script",
  "template",
  "noscript",
  "textarea",
  "input",
  "select",
  "[contenteditable='true']",
  "[contenteditable='']"
].join(",");

// Timestamps, screen-reader labels and live status regions change without the
// conversation changing. They are skipped only while short, so a site that
// wraps a whole reply in a live region still has that reply counted.
const LEDGER_SOFT_SKIP_SELECTOR = [
  "time",
  "[datetime]",
  "relative-time",
  ".sr-only",
  ".visually-hidden",
  "[class*='sr-only']",
  "[aria-live]",
  "[role='status']",
  "[role='alert']",
  "[role='progressbar']",
  "[role='tooltip']",
  "[data-radix-popper-content-wrapper]"
].join(",");
const LEDGER_SOFT_SKIP_MAX_CHARS = 160;
const LEDGER_NOISE_SEGMENT_MAX_CHARS = 80;
const LEDGER_NOISE_SEGMENTS = Object.freeze([
  /^(?:thought|reasoned|worked|thinking|searched|analy[sz]ed)\s+for\s+[\d.,:]+\s*(?:ms|s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?)?\b.*$/i,
  /^(?:thinking|reasoning|searching(?:\s+the\s+web)?|analy[sz]ing|generating|writing)\s*[.。…]*$/i,
  /^(?:已)?(?:深度)?思考(?:了|中|完成)?\s*(?:[（(]?\s*用时)?\s*[\d.,]*\s*(?:秒|分钟|分|s)?\s*[）)]?\s*[.。…]*$/,
  /^(?:just now|now|today|yesterday|edited|\d+\s*(?:s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|d|days?|w|wks?|weeks?|mo|months?|y|yrs?|years?)\s+ago)$/i,
  /^(?:刚刚|今天|昨天|已编辑|\d+\s*(?:秒|分钟|小时|天|周|个月|年)前)$/,
  /^\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?$/i
]);
const MAX_WALK_DEPTH = 96;

function safeMatches(matches, node, selector) {
  try { return Boolean(matches(node, selector)); } catch { return false; }
}

function normalizeLedgerText(value) {
  const text = String(value || "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
  if (!text) return "";
  try {
    return text.normalize("NFKC").replace(/\s+/g, " ").trim();
  } catch {
    return text;
  }
}

function noiseSegment(segment) {
  const text = segment.replace(/\s+/g, " ").trim();
  if (!text) return true;
  if (text.length > LEDGER_NOISE_SEGMENT_MAX_CHARS) return false;
  return LEDGER_NOISE_SEGMENTS.some((pattern) => pattern.test(text));
}

// The text a turn is hashed on. Walks childNodes (no TreeWalker, no layout)
// and keeps the text of each element's own text nodes as one segment so a
// chip rendered as "Thought for " + "12" + "s" is dropped as a whole.
export function ledgerTurnText(turn, matches = (node, selector) => node?.matches?.(selector)) {
  if (!turn) return "";
  const segments = [];
  const walk = (node, depth) => {
    if (depth > MAX_WALK_DEPTH) return;
    let buffer = "";
    for (const child of node.childNodes || []) {
      if (child.nodeType === 3) {
        buffer += child.nodeValue || "";
        continue;
      }
      if (child.nodeType !== 1) continue;
      if (buffer) {
        segments.push(buffer);
        buffer = "";
      }
      if (safeMatches(matches, child, LEDGER_HARD_SKIP_SELECTOR)) continue;
      if (
        safeMatches(matches, child, LEDGER_SOFT_SKIP_SELECTOR)
        && String(child.textContent || "").length <= LEDGER_SOFT_SKIP_MAX_CHARS
      ) continue;
      walk(child, depth + 1);
    }
    if (buffer) segments.push(buffer);
  };
  walk(turn, 0);
  return normalizeLedgerText(segments.filter((segment) => !noiseSegment(segment)).join(" "));
}

function documentEditableFocused() {
  const doc = globalThis.document;
  if (!doc) return false;
  if (typeof doc.hasFocus === "function" && !doc.hasFocus()) return false;
  const active = doc.activeElement;
  if (!active || active === doc.body || active === doc.documentElement) return false;
  const tag = String(active.tagName || "").toLowerCase();
  return tag === "textarea" || tag === "input" || active.isContentEditable === true;
}

// The last turn is on screen or close below it; a diverged tail seen while
// the user reads far above the end is not trusted as new content.
function lastTurnNearViewport(nodes = []) {
  const last = nodes[nodes.length - 1];
  if (!last?.getBoundingClientRect) return true;
  const height = Number(globalThis.innerHeight) || Number(globalThis.document?.documentElement?.clientHeight) || 0;
  if (!height) return true;
  return last.getBoundingClientRect().top <= height * 1.5;
}

function windowPageHide(handler) {
  if (typeof globalThis.addEventListener !== "function") return null;
  globalThis.addEventListener("pagehide", handler, true);
  return () => globalThis.removeEventListener("pagehide", handler, true);
}

function defaultTimer(ms, callback) {
  return setTimeout(callback, Math.max(0, Number(ms) || 0));
}

function randomLedgerId() {
  try {
    const bytes = new Uint8Array(6);
    globalThis.crypto.getRandomValues(bytes);
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return Math.random().toString(16).slice(2, 14);
  }
}

// One observer per document keeps a per-turn ledger of the conversation:
// role + hash of each rendered turn, a digest over them, and a revision that
// only moves when the digest, the generating state or the conversation
// changes. The parent long-polls it and decides whether to Copy.
export function createConversationLedger(deps = {}) {
  const documentId = String(deps.documentId || "");
  const listTurns = typeof deps.listTurns === "function" ? deps.listTurns : () => ({ nodes: [], group: -1 });
  const turnRole = typeof deps.turnRole === "function" ? deps.turnRole : () => "";
  const isGenerating = typeof deps.isGenerating === "function" ? deps.isGenerating : () => false;
  const matches = typeof deps.matches === "function" ? deps.matches : (node, selector) => node?.matches?.(selector);
  const locationHref = typeof deps.locationHref === "function" ? deps.locationHref : () => String(globalThis.location?.href || "");
  const pageTextSample = typeof deps.pageTextSample === "function" ? deps.pageTextSample : () => "";
  const inputIdleMs = typeof deps.inputIdleMs === "function" ? deps.inputIdleMs : () => null;
  const editableFocused = typeof deps.editableFocused === "function" ? deps.editableFocused : documentEditableFocused;
  const viewportAtEnd = typeof deps.viewportAtEnd === "function" ? deps.viewportAtEnd : lastTurnNearViewport;
  const observeTarget = typeof deps.observeTarget === "function"
    ? deps.observeTarget
    : () => globalThis.document?.body || globalThis.document?.documentElement || null;
  const onPageHide = deps.onPageHide === undefined ? windowPageHide : typeof deps.onPageHide === "function" ? deps.onPageHide : null;
  const MutationObserverImpl = deps.MutationObserver === undefined ? globalThis.MutationObserver : deps.MutationObserver;
  const now = typeof deps.now === "function" ? deps.now : () => Date.now();
  const setTimer = typeof deps.setTimer === "function" ? deps.setTimer : defaultTimer;
  const clearTimer = typeof deps.clearTimer === "function" ? deps.clearTimer : (id) => clearTimeout(id);
  const ledgerId = String(deps.ledgerId || randomLedgerId());

  let textCache = new WeakMap();
  let observer = null;
  let removePageHide = null;
  let installedAt = 0;
  let lastMutationAt = 0;
  let firstDirtyAt = 0;
  let lastRequestAt = 0;
  let quietTimer = null;
  let idleTimer = null;
  let disposed = false;
  let revision = 0;
  let conversationKey = null;
  let stickyGroup = -1;
  let lastDigest = null;
  let lastGenerating = null;
  let digestChangedAt = 0;
  let generatingSeenAt = 0;
  const waiters = new Set();

  function invalidate(target) {
    for (let node = target, depth = 0; node && depth < MAX_WALK_DEPTH; node = node.parentNode, depth += 1) {
      if (textCache.has(node)) textCache.delete(node);
    }
  }

  function scheduleQuietRecompute() {
    if (!waiters.size) return;
    if (quietTimer !== null) clearTimer(quietTimer);
    const at = now();
    const maxDirty = firstDirtyAt ? Math.max(0, firstDirtyAt + CONVERSATION_LEDGER_MAX_DIRTY_MS - at) : CONVERSATION_LEDGER_QUIET_MS;
    quietTimer = setTimer(Math.min(CONVERSATION_LEDGER_QUIET_MS, maxDirty), () => {
      quietTimer = null;
      firstDirtyAt = 0;
      for (const waiter of [...waiters]) {
        const current = compute(waiter.prompt);
        if (differs(current, waiter.since)) finish(waiter, current);
      }
    });
  }

  function onMutations(records) {
    const at = now();
    lastMutationAt = at;
    if (!firstDirtyAt) firstDirtyAt = at;
    for (const record of records || []) invalidate(record?.target);
    scheduleQuietRecompute();
  }

  function install() {
    if (observer || disposed || typeof MutationObserverImpl !== "function") return;
    const target = observeTarget();
    if (!target) return;
    try {
      observer = new MutationObserverImpl(onMutations);
      observer.observe(target, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["aria-busy", "data-is-streaming"]
      });
    } catch {
      observer = null;
      return;
    }
    installedAt = now();
    lastMutationAt = 0;
    firstDirtyAt = 0;
    textCache = new WeakMap();
    if (onPageHide && !removePageHide) {
      try { removePageHide = onPageHide(handlePageHide) || null; } catch { removePageHide = null; }
    }
  }

  function disconnect() {
    try { observer?.disconnect?.(); } catch {}
    observer = null;
    textCache = new WeakMap();
    if (quietTimer !== null) clearTimer(quietTimer);
    quietTimer = null;
    if (idleTimer !== null) clearTimer(idleTimer);
    idleTimer = null;
    try { removePageHide?.(); } catch {}
    removePageHide = null;
  }

  function armIdleDisconnect() {
    if (idleTimer !== null) clearTimer(idleTimer);
    idleTimer = setTimer(CONVERSATION_LEDGER_IDLE_DISCONNECT_MS, () => {
      idleTimer = null;
      if (waiters.size || now() - lastRequestAt < CONVERSATION_LEDGER_IDLE_DISCONNECT_MS) return;
      disconnect();
    });
  }

  function turnText(node) {
    let value = textCache.get(node);
    if (value === undefined) {
      value = ledgerTurnText(node, matches);
      textCache.set(node, value);
    }
    return value;
  }

  function inputState(at) {
    let idleMs = null;
    try {
      const value = inputIdleMs();
      idleMs = value === null || value === undefined ? null : Math.max(0, Number(value) || 0);
    } catch {}
    let editing = false;
    try { editing = idleMs !== null && idleMs < EDITING_RECENT_INPUT_MS && editableFocused() === true; } catch {}
    return { seen: idleMs !== null, idleMs, editing, at };
  }

  function compute(prompt = "") {
    const at = now();
    const href = String(locationHref() || "");
    const key = conversationKeyFromHref(href);
    if (key !== conversationKey) {
      if (conversationKey !== null) revision += 1;
      conversationKey = key;
      stickyGroup = -1;
      lastDigest = null;
      lastGenerating = null;
      generatingSeenAt = 0;
    }
    let listed = null;
    try { listed = listTurns(stickyGroup); } catch { listed = null; }
    const nodes = Array.isArray(listed?.nodes) ? listed.nodes : [];
    if (Number.isInteger(listed?.group) && listed.group >= 0) stickyGroup = listed.group;
    const classified = [];
    const all = [];
    const haystack = [];
    let users = 0;
    let assistants = 0;
    let lastUserText = "";
    for (const node of nodes) {
      const text = turnText(node);
      if (!text) continue;
      let role = "";
      try { role = String(turnRole(node) || ""); } catch {}
      const entry = ledgerTurnEntry(role, text);
      all.push(entry);
      haystack.push(text);
      if (role === "user") {
        users += 1;
        lastUserText = text;
        classified.push(entry);
      } else if (role === "assistant") {
        assistants += 1;
        classified.push(entry);
      }
    }
    const granularity = !all.length ? "none" : users && assistants ? "turns" : "blocks";
    const entries = granularity === "turns" ? classified : all;
    const digest = ledgerDigest(granularity, entries);
    let generating = false;
    try { generating = isGenerating(nodes) === true; } catch {}
    if (generating) generatingSeenAt = at;
    if (digest !== lastDigest) {
      if (lastDigest !== null) revision += 1;
      lastDigest = digest;
      digestChangedAt = at;
    }
    if (generating !== lastGenerating) {
      if (lastGenerating !== null) revision += 1;
      lastGenerating = generating;
    }
    const needle = normalizeLedgerText(prompt);
    let containsPrompt = false;
    if (needle) {
      const text = haystack.join(" ");
      if (text) containsPrompt = text.includes(needle);
      else {
        try { containsPrompt = normalizeLedgerText(pageTextSample()).includes(needle); } catch {}
      }
    }
    let atEnd = true;
    try { atEnd = viewportAtEnd(nodes) !== false; } catch {}
    return {
      ledgerVersion: FULLTEXT_LEDGER_VERSION,
      ledgerId,
      documentId,
      href,
      conversationKey: key,
      revision,
      granularity,
      turnCount: entries.length,
      hasPair: users > 0 && assistants > 0,
      digest,
      tail: entries.slice(-FULLTEXT_LEDGER_TAIL),
      lastUser: lastUserText ? { head: lastUserText.slice(0, 160), tail: lastUserText.slice(-160) } : null,
      containsPrompt,
      generating,
      generatingSeenAgoMs: generatingSeenAt ? Math.max(0, at - generatingSeenAt) : null,
      stableForMs: Math.max(0, at - digestChangedAt),
      quietForMs: lastMutationAt ? Math.max(0, at - lastMutationAt) : Math.max(0, at - installedAt),
      viewportAtEnd: atEnd,
      input: inputState(at)
    };
  }

  function differs(current, since) {
    if (!since || typeof since !== "object") return true;
    return String(since.ledgerId || "") !== current.ledgerId
      || Number(since.revision) !== current.revision
      || String(since.conversationKey || "") !== current.conversationKey;
  }

  function finish(waiter, current) {
    if (!waiters.delete(waiter)) return;
    if (waiter.timer !== null) clearTimer(waiter.timer);
    waiter.resolve(current || compute(waiter.prompt));
  }

  function handlePageHide() {
    for (const waiter of [...waiters]) finish(waiter, null);
    disconnect();
  }

  // One ledger now; with `waitMs` and a `since` that still matches, hold the
  // answer until the revision moves or the deadline passes. The deadline
  // answer is recomputed so stableForMs keeps counting.
  function whenChanged(data = {}) {
    lastRequestAt = now();
    install();
    if (!disposed) armIdleDisconnect();
    const prompt = String(data?.prompt || "");
    const waitMs = Math.max(0, Math.min(CONVERSATION_LEDGER_MAX_WAIT_MS, Number(data?.waitMs) || 0));
    const since = data?.since && typeof data.since === "object" ? data.since : null;
    const current = compute(prompt);
    if (!waitMs || !since || differs(current, since) || !observer) return Promise.resolve(current);
    return new Promise((resolve) => {
      const waiter = { resolve, prompt, since, timer: null };
      waiter.timer = setTimer(waitMs, () => {
        waiter.timer = null;
        finish(waiter, null);
      });
      waiters.add(waiter);
    });
  }

  function dispose() {
    disposed = true;
    for (const waiter of [...waiters]) finish(waiter, null);
    disconnect();
  }

  return Object.freeze({
    whenChanged,
    dispose,
    get observing() {
      return Boolean(observer);
    }
  });
}
