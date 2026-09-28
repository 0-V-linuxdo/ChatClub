import {
  FULLTEXT_LEDGER_TAIL,
  FULLTEXT_LEDGER_VERSION,
  fullTextTextsOverlap,
  normalizeLedgerGranularity,
  normalizeLedgerTail
} from "../../shared/fulltext-ledger.js";

// The Record Full Text decision: pure functions over a live conversation
// ledger, the mark stored with the last Copy, and this session's retry
// state. Kept apart from the reconciler loop so every rule is testable on
// plain data, and out of the bootstrap graph because only the lazy Summary
// controller needs it.
export const FULLTEXT_CAPTURE_STATE_SESSION_KEY = "chatclub.fullTextCaptureState.v1";

export const FULLTEXT_CAPTURE_TIMINGS = Object.freeze({
  heartbeatMs: 25_000,
  // A reply that showed a generating signal only needs its ledger to hold
  // this long; without that signal the page has to hold still for longer.
  settleAfterGeneratingMs: 5_000,
  settleNoSignalMs: 20_000,
  generatingMemoryMs: 10 * 60_000,
  userQuietMs: 8_000,
  minCaptureGapMs: 45_000,
  maxCapturesPerHour: 8,
  unmatchedRetryMs: 5 * 60_000,
  errorBackoffMs: Object.freeze([30_000, 120_000, 600_000]),
  abortBackoffMs: 15_000,
  maxAborts: 4,
  sendHintTtlMs: 45 * 60_000
});

const HOUR_MS = 60 * 60_000;
const CAPTURE_STATE_MAX_ENTRIES = 200;
const LAST_USER_SAMPLE_CHARS = 160;

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function sampleText(value) {
  return String(value || "").slice(0, LAST_USER_SAMPLE_CHARS);
}

// Validates a getConversationFingerprint answer. Anything else, including an
// older content bundle that still answers with the pre-ledger fingerprint,
// yields null and the parent must not Copy on it.
export function normalizeLedger(raw) {
  if (!raw || typeof raw !== "object" || raw.ledgerVersion !== FULLTEXT_LEDGER_VERSION) return null;
  const granularity = normalizeLedgerGranularity(raw.granularity);
  const lastUser = raw.lastUser && typeof raw.lastUser === "object"
    ? { head: sampleText(raw.lastUser.head), tail: sampleText(raw.lastUser.tail) }
    : null;
  const input = raw.input && typeof raw.input === "object" ? raw.input : {};
  return {
    ledgerVersion: FULLTEXT_LEDGER_VERSION,
    ledgerId: String(raw.ledgerId || ""),
    documentId: String(raw.documentId || ""),
    href: String(raw.href || ""),
    conversationKey: String(raw.conversationKey || ""),
    revision: Math.max(0, Math.floor(Number(raw.revision) || 0)),
    granularity,
    turnCount: Math.max(0, Math.floor(Number(raw.turnCount) || 0)),
    hasPair: raw.hasPair === true,
    digest: /^[0-9a-f]{16}$/.test(String(raw.digest || "")) ? String(raw.digest) : "",
    tail: normalizeLedgerTail(raw.tail),
    lastUser: lastUser && (lastUser.head || lastUser.tail) ? lastUser : null,
    containsPrompt: raw.containsPrompt === true,
    generating: raw.generating === true,
    generatingSeenAgoMs: finiteOrNull(raw.generatingSeenAgoMs),
    stableForMs: Math.max(0, Number(raw.stableForMs) || 0),
    viewportAtEnd: raw.viewportAtEnd === true,
    input: {
      seen: input.seen === true,
      idleMs: finiteOrNull(input.idleMs),
      editing: input.editing === true
    }
  };
}

export function markFromLedger(ledger, { source = "idle", now = Date.now() } = {}) {
  if (!ledger?.conversationKey) return null;
  return {
    v: FULLTEXT_LEDGER_VERSION,
    conversationKey: String(ledger.conversationKey),
    granularity: normalizeLedgerGranularity(ledger.granularity),
    digest: String(ledger.digest || ""),
    tail: normalizeLedgerTail(ledger.tail),
    turnCount: Math.max(0, Math.floor(Number(ledger.turnCount) || 0)),
    capturedAt: new Date(Number(now) || Date.now()).toISOString(),
    source: String(source || "idle")
  };
}

// How the live tail relates to the tail stored at the last Copy.
//   none          the stored last turn is still last
//   append        turns were added after the stored last turn
//   behind        the live window ends at an older stored turn (virtualized or scrolled up)
//   last-changed  only the final assistant turn differs
//   rewound       an older stored turn is followed by new ones (edit, regenerate)
//   diverged      nothing lines up
export function alignLedgerTails(stored = [], live = []) {
  const S = normalizeLedgerTail(stored);
  const L = normalizeLedgerTail(live);
  if (!S.length || !L.length) return { kind: "diverged" };
  const last = S[S.length - 1];
  for (let position = L.length - 1; position >= 0; position -= 1) {
    if (L[position] !== last) continue;
    let confirmed = true;
    for (let step = 1; step <= 2; step += 1) {
      const storedIndex = S.length - 1 - step;
      const liveIndex = position - step;
      if (storedIndex < 0 || liveIndex < 0) break;
      if (S[storedIndex] !== L[liveIndex]) {
        confirmed = false;
        break;
      }
    }
    if (!confirmed) continue;
    const newTurns = L.length - 1 - position;
    if (!newTurns) return { kind: "none" };
    const added = L.slice(position + 1);
    return {
      kind: "append",
      firstNew: position + 1,
      newTurns,
      newUserTurns: added.filter((entry) => entry.startsWith("u:")).length
    };
  }
  const liveLast = L[L.length - 1];
  if (S.length >= 2 && S.lastIndexOf(liveLast, S.length - 2) >= 0) return { kind: "behind" };
  if (
    L.length >= 2
    && S.length >= 2
    && liveLast.startsWith("a:")
    && last.startsWith("a:")
    && L[L.length - 2] === S[S.length - 2]
  ) {
    return { kind: "last-changed", firstNew: L.length - 1 };
  }
  for (let index = S.length - 1; index >= 0; index -= 1) {
    const found = L.lastIndexOf(S[index]);
    if (found >= 0) return { kind: "rewound", firstNew: found + 1 };
  }
  return { kind: "diverged" };
}

// Turns to Copy from the end so the slice starts on the user turn that
// opened the first new exchange. 0 means the whole conversation.
export function captureTurnCount(live = [], firstNew = 0) {
  const L = normalizeLedgerTail(live);
  if (!L.length) return 0;
  let start = Math.max(0, Math.min(L.length - 1, Math.floor(Number(firstNew) || 0)));
  while (start > 0 && !L[start].startsWith("u:")) start -= 1;
  return Math.max(2, L.length - start);
}

// The ledger only ships the head and tail of the last user turn; either one
// overlapping the stored or copied text is enough (a file chip can lead the
// DOM text without being part of the typed prompt).
export function ledgerLastUserOverlaps(lastUser, text) {
  if (!lastUser || !String(text || "").trim()) return false;
  return [lastUser.head, lastUser.tail].some((sample) => {
    const value = String(sample || "").trim();
    return Boolean(value) && fullTextTextsOverlap(value, text);
  });
}

function normalizeCaptureStateEntry(raw = {}) {
  const entry = raw && typeof raw === "object" ? raw : {};
  return {
    digest: String(entry.digest || ""),
    kind: ["unmatched", "error", "busy"].includes(entry.kind) ? entry.kind : "",
    attempts: Math.max(0, Math.floor(Number(entry.attempts) || 0)),
    aborts: Math.max(0, Math.floor(Number(entry.aborts) || 0)),
    nextAt: Math.max(0, Number(entry.nextAt) || 0),
    noiseStreak: Math.max(0, Math.floor(Number(entry.noiseStreak) || 0)),
    captureTimes: (Array.isArray(entry.captureTimes) ? entry.captureTimes : [])
      .map((at) => Number(at))
      .filter((at) => Number.isFinite(at) && at > 0)
      .slice(-16),
    at: Math.max(0, Number(entry.at) || 0)
  };
}

export function captureStateKey(workspaceId, conversationKey) {
  const desk = String(workspaceId || "").trim();
  const key = String(conversationKey || "").trim();
  return desk && key ? `${desk}|${key}` : "";
}

export function normalizeCaptureState(raw) {
  const source = raw && typeof raw === "object" && raw.entries && typeof raw.entries === "object" ? raw.entries : {};
  const entries = Object.entries(source)
    .filter(([key]) => typeof key === "string" && key.includes("|"))
    .map(([key, value]) => [key, normalizeCaptureStateEntry(value)])
    .sort(([, left], [, right]) => right.at - left.at)
    .slice(0, CAPTURE_STATE_MAX_ENTRIES);
  return { v: 1, entries: Object.fromEntries(entries) };
}

export function captureStateEntry(state, key) {
  const entry = state?.entries?.[key];
  return entry ? normalizeCaptureStateEntry(entry) : null;
}

export function putCaptureStateEntry(state, key, entry) {
  const current = normalizeCaptureState(state);
  if (!key) return current;
  return normalizeCaptureState({ entries: { ...current.entries, [key]: entry } });
}

// What one Copy outcome does to that conversation's retry state. Failures
// are tied to the ledger digest they were seen on: the same unchanged content
// is not Copied again, a changed digest starts over.
export function nextCaptureStateEntry(entry, outcome, { digest = "", now = Date.now(), timings } = {}) {
  const T = { ...FULLTEXT_CAPTURE_TIMINGS, ...(timings || {}) };
  const previous = normalizeCaptureStateEntry(entry || {});
  const sameDigest = Boolean(digest) && previous.digest === digest;
  const captureTimes = [...previous.captureTimes.filter((at) => now - at < HOUR_MS), now].slice(-16);
  switch (outcome) {
    case "saved":
      return { ...previous, digest: "", kind: "", attempts: 0, aborts: 0, nextAt: 0, noiseStreak: 0, captureTimes, at: now };
    case "unchanged":
      return { ...previous, digest: "", kind: "", attempts: 0, aborts: 0, nextAt: 0, noiseStreak: previous.noiseStreak + 1, captureTimes, at: now };
    case "unmatched": {
      const attempts = sameDigest && previous.kind === "unmatched" ? previous.attempts + 1 : 1;
      return { ...previous, digest, kind: "unmatched", attempts, nextAt: attempts === 1 ? now + T.unmatchedRetryMs : 0, captureTimes, at: now };
    }
    case "error": {
      const attempts = sameDigest && previous.kind === "error" ? previous.attempts + 1 : 1;
      const delay = T.errorBackoffMs[attempts - 1];
      return { ...previous, digest, kind: "error", attempts, nextAt: delay ? now + delay : 0, captureTimes, at: now };
    }
    case "aborted": {
      const aborts = sameDigest && previous.kind === "busy" ? previous.aborts + 1 : 1;
      return { ...previous, digest, kind: "busy", aborts, nextAt: aborts >= T.maxAborts ? 0 : now + T.abortBackoffMs, at: now };
    }
    default:
      return { ...previous, at: now };
  }
}

function skip(reason) {
  return { action: "skip", reason };
}

function wait(reason, waitMs) {
  return { action: "wait", reason, waitMs: Math.max(0, Math.ceil(Number(waitMs) || 0)) };
}

// The one place that says whether a live ledger may start a Copy. Only a
// ledger that differs from what was last Copied, has held still, and belongs
// to a user who is not busy in the frame can ever reach "capture"; a tab
// becoming visible, Settings, History or time passing never change the ledger
// and therefore never Copy.
export function decideFullTextCapture(live, ctx = {}) {
  const T = { ...FULLTEXT_CAPTURE_TIMINGS, ...(ctx.timings || {}) };
  const now = Number(ctx.now) || 0;
  if (!live || live.ledgerVersion !== FULLTEXT_LEDGER_VERSION) return wait("no-ledger", T.heartbeatMs);
  if (!live.conversationKey) return skip("no-conversation");
  const mark = ctx.mark
    && ctx.mark.v === FULLTEXT_LEDGER_VERSION
    && ctx.mark.conversationKey === live.conversationKey
    ? ctx.mark
    : null;
  if (mark && live.digest && mark.digest === live.digest) return skip("same");
  if (live.generating) return wait("generating", T.heartbeatMs);
  const settleMs = live.generatingSeenAgoMs !== null && live.generatingSeenAgoMs < T.generatingMemoryMs
    ? T.settleAfterGeneratingMs
    : T.settleNoSignalMs;
  if (live.stableForMs < settleMs) return wait("settling", settleMs - live.stableForMs);
  const sendMatched = Boolean(ctx.sendHint) && live.containsPrompt === true;
  // Without classified roles the digest is only a hint; it may only Copy on
  // first sight or for a prompt this page was just sent.
  const growthAllowed = live.granularity === "turns" || sendMatched;
  let turns = 0;
  let alignment = null;
  let reason = "first-sight";
  if (mark) {
    if (live.granularity === "none") {
      if (!sendMatched) return skip("no-turns");
      reason = "send";
    } else {
      alignment = alignLedgerTails(mark.tail, live.tail);
      reason = alignment.kind;
      if (alignment.kind === "none" || alignment.kind === "behind") return skip(alignment.kind);
      if (!growthAllowed) return skip("no-growth-signal");
      if (alignment.kind === "append" || alignment.kind === "rewound") {
        turns = captureTurnCount(live.tail, alignment.firstNew);
      } else if (alignment.kind === "last-changed") {
        turns = 2;
      } else {
        if (!live.viewportAtEnd) return wait("diverged-away", T.heartbeatMs);
        turns = FULLTEXT_LEDGER_TAIL;
      }
    }
  } else if (ctx.record?.hasPair) {
    // A record Copied before marks existed, or under another ledger version:
    // adopt the live ledger when its last prompt is the stored one.
    const storedUser = String(ctx.record.lastUserMessage || "");
    if (!live.lastUser || !storedUser || ledgerLastUserOverlaps(live.lastUser, storedUser)) {
      return { action: "adopt", reason: "legacy" };
    }
    reason = "legacy-diverged";
    turns = FULLTEXT_LEDGER_TAIL;
  } else if (live.granularity === "turns" ? !live.hasPair : live.turnCount < 2 && !sendMatched) {
    return skip("no-pair");
  }
  const entry = ctx.state ? normalizeCaptureStateEntry(ctx.state) : null;
  if (entry?.kind && entry.digest === live.digest) {
    if (!entry.nextAt) return skip("parked");
    if (now < entry.nextAt) return wait("backoff", entry.nextAt - now);
  }
  if (entry && entry.noiseStreak >= 2 && !sendMatched && !(alignment?.kind === "append" && alignment.newUserTurns > 0)) {
    return skip("strict");
  }
  const recent = (entry?.captureTimes || []).filter((at) => now - at < HOUR_MS);
  const lastCaptureAt = recent[recent.length - 1] || 0;
  if (lastCaptureAt && now - lastCaptureAt < T.minCaptureGapMs) return wait("rate", T.minCaptureGapMs - (now - lastCaptureAt));
  if (recent.length >= T.maxCapturesPerHour) return wait("rate-hour", HOUR_MS - (now - recent[0]));
  const input = live.input || {};
  if (input.editing) return wait("editing", T.userQuietMs);
  if (input.seen && input.idleMs !== null && input.idleMs < T.userQuietMs) return wait("user-busy", T.userQuietMs - input.idleMs);
  if (ctx.visible === false) return wait("hidden", T.heartbeatMs);
  return { action: "capture", reason, turns, alignment };
}
