import {
  FULLTEXT_CAPTURE_TIMINGS,
  alignLedgerTails,
  captureStateEntry,
  captureStateKey,
  decideFullTextCapture,
  ledgerLastUserOverlaps,
  markFromLedger,
  nextCaptureStateEntry,
  normalizeCaptureState,
  normalizeLedger,
  putCaptureStateEntry
} from "./fulltext-decision.js";
import { workspaceTabFullTextConversation } from "../../shared/workspace-tab-fulltext.js";

export const FULLTEXT_RECONCILER_DEFAULTS = Object.freeze({
  // Re-list the active frames this often; a frame that is not collectable
  // (start page, no collector) is looked at again on the same cadence.
  tickMs: 5_000,
  heartbeatMs: FULLTEXT_CAPTURE_TIMINGS.heartbeatMs,
  minPollMs: 1_000,
  probeRetryMs: 5_000,
  // Frame RPC clamps command timeouts at 60s; a Last-N Copy must finish inside.
  collectTimeoutMs: 60_000,
  // After a Copy, how long to wait for the ledger that the Copy's own hover
  // and scrolling may have produced, so it becomes the mark instead of the
  // next capture.
  postCaptureProbeMs: 5_000,
  // A user-initiated collect (Summary, Share, Probe) keeps idle Copy off the
  // frames for this long after it cancelled one.
  cancelPauseMs: 5_000,
  markDebounceMs: 2_000,
  // A frame's conversation counts as already open (restored, not navigated
  // to) when it is the first one the watch sees, or appears within this long
  // of the watch starting on a start page that redirects.
  restoreSettleMs: 10_000,
  // Other writers (Summary, History, quick save) persist full text too; a
  // short cache keeps one storage read per desk per heartbeat at most.
  recordCacheMs: 10_000,
  // Desk-wide circuit breaker: more Copies than this in the window means the
  // ledger is fighting the page; stop and report instead of hovering on.
  breakerWindowMs: 10 * 60_000,
  breakerMax: 20,
  breakerPauseMs: 10 * 60_000
});

function lastUserMessage(messages) {
  const list = Array.isArray(messages) ? messages : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (list[index]?.role === "user") return String(list[index].text || list[index].content || "");
  }
  return "";
}

function messagesHavePair(messages) {
  const list = Array.isArray(messages) ? messages : [];
  return list.some((message) => message?.role === "user" && String(message.text || "").trim())
    && list.some((message) => message?.role === "assistant" && String(message.text || "").trim());
}

// Keeps Record Full Text in step with the frames: one watch per active frame
// long-polls that frame's conversation ledger and asks decideFullTextCapture
// whether the ledger moved away from what was last Copied. Sends, a tab
// becoming visible and restores are hints at most; none of them can start a
// Copy on their own.
export function createFullTextReconciler(deps = {}) {
  const T = { ...FULLTEXT_RECONCILER_DEFAULTS, ...(deps.timings || {}) };
  const captureTimings = { ...FULLTEXT_CAPTURE_TIMINGS, ...(deps.captureTimings || {}) };
  const now = typeof deps.now === "function" ? deps.now : () => Date.now();
  const sleep = typeof deps.sleep === "function"
    ? deps.sleep
    : (ms) => new Promise((resolve) => { setTimeout(resolve, Math.max(0, Number(ms) || 0)); });
  const isEnabled = typeof deps.isEnabled === "function" ? deps.isEnabled : () => true;
  const isVisible = typeof deps.isVisible === "function" ? deps.isVisible : () => true;
  const waitUntilVisible = typeof deps.waitUntilVisible === "function" ? deps.waitUntilVisible : () => undefined;
  const listFrames = typeof deps.listFrames === "function" ? deps.listFrames : () => [];
  const frameCollectable = typeof deps.frameCollectable === "function" ? deps.frameCollectable : () => true;
  const probe = typeof deps.probe === "function" ? deps.probe : async () => null;
  const collectFrame = typeof deps.collectFrame === "function" ? deps.collectFrame : async () => null;
  const cancelCollect = typeof deps.cancelCollect === "function" ? deps.cancelCollect : () => {};
  const runExclusive = typeof deps.runExclusive === "function" ? deps.runExclusive : (task) => task();
  const persist = typeof deps.persist === "function" ? deps.persist : async () => ({ saved: false });
  const persistMarks = typeof deps.persistMarks === "function" ? deps.persistMarks : async () => ({ saved: false });
  const loadRecord = typeof deps.loadRecord === "function" ? deps.loadRecord : async () => null;
  const workspaceId = typeof deps.workspaceId === "function" ? deps.workspaceId : () => "";
  const loadCaptureState = typeof deps.loadCaptureState === "function" ? deps.loadCaptureState : async () => null;
  const saveCaptureState = typeof deps.saveCaptureState === "function" ? deps.saveCaptureState : async () => {};
  const recordAnomaly = typeof deps.recordAnomaly === "function" ? deps.recordAnomaly : () => {};
  // Every idle Copy says why in the ChatClub page console, so a Copy the user
  // did not expect can be traced to the decision that allowed it.
  const log = typeof deps.log === "function"
    ? deps.log
    : (details) => { try { console.info("[ChatClub] Record Full Text Copy", details); } catch {} };

  const watches = new Map();
  const sendHints = new Map();
  const pendingMarks = new Map();
  const baselines = new Map();
  const cancelledRuns = new Set();
  const sleepers = new Set();
  const deskCaptureTimes = [];
  let running = false;
  let generation = 0;
  let runSequence = 0;
  let pausedUntil = 0;
  let breakerReported = false;
  let recordCache = null;
  let captureState = null;
  let captureStateLoad = null;
  let markTimer = null;

  function interruptible(promise) {
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        sleepers.delete(done);
        resolve();
      };
      sleepers.add(done);
      Promise.resolve(promise).then(done, done);
    });
  }

  function wait(ms) {
    return interruptible(sleep(Math.max(0, Number(ms) || 0)));
  }

  function wakeAll() {
    for (const done of [...sleepers]) done();
  }

  function live(gen, watch = null) {
    return running && gen === generation && (!watch || watch.alive);
  }

  async function visibleGate() {
    if (isVisible()) return;
    const gate = waitUntilVisible();
    if (gate && typeof gate.then === "function") await interruptible(gate);
    else await wait(T.tickMs);
  }

  function frameKey(frame) {
    return String(frame?.key || frame?.instanceId || "").trim();
  }

  function activeHint(key) {
    const hint = sendHints.get(key);
    if (!hint) return null;
    if (now() - hint.at > captureTimings.sendHintTtlMs) {
      sendHints.delete(key);
      return null;
    }
    return hint;
  }

  async function deskRecord(desk) {
    if (recordCache && recordCache.desk === desk && now() - recordCache.at < T.recordCacheMs) return recordCache.record;
    let record = null;
    try { record = await loadRecord(desk); } catch { record = null; }
    recordCache = { desk, record, at: now() };
    return record;
  }

  function invalidateRecord() {
    recordCache = null;
  }

  async function currentCaptureState() {
    if (captureState) return captureState;
    captureStateLoad ||= (async () => {
      let raw = null;
      try { raw = await loadCaptureState(); } catch { raw = null; }
      captureState ||= normalizeCaptureState(raw);
      return captureState;
    })();
    return captureStateLoad;
  }

  async function updateCaptureState(desk, conversationKey, outcome, digest) {
    const key = captureStateKey(desk, conversationKey);
    if (!key) return;
    // Other ChatClub tabs share this session state: start from what is
    // stored now instead of overwriting their entries with a stale copy.
    let state = await currentCaptureState();
    try { state = normalizeCaptureState(await loadCaptureState()); } catch {}
    const entry = nextCaptureStateEntry(captureStateEntry(state, key), outcome, {
      digest,
      now: now(),
      timings: captureTimings
    });
    captureState = putCaptureStateEntry(state, key, entry);
    try { await saveCaptureState(captureState); } catch {}
  }

  // What is stored for this conversation in the current desk, with any mark
  // this page adopted but has not written yet taking precedence.
  function storedConversation(record, conversationKey) {
    const found = workspaceTabFullTextConversation(record, conversationKey);
    const pending = pendingMarks.get(conversationKey);
    if (pending) return { ...(found || { hasPair: true, lastUserMessage: "" }), mark: pending.mark };
    return found;
  }

  async function decide(watch, ledger) {
    const desk = String(workspaceId() || "");
    if (!desk) return { action: "skip", reason: "no-desk" };
    const at = now();
    if (at < pausedUntil) return { action: "wait", reason: "paused", waitMs: pausedUntil - at };
    const record = await deskRecord(desk);
    const stored = storedConversation(record, ledger.conversationKey);
    const state = await currentCaptureState();
    return decideFullTextCapture(ledger, {
      mark: stored?.mark || null,
      record: stored ? { hasPair: stored.hasPair, lastUserMessage: stored.lastUserMessage } : null,
      restored: watch.initialKey === undefined || watch.initialKey === ledger.conversationKey,
      baseline: baselines.get(ledger.conversationKey) || null,
      state: captureStateEntry(state, captureStateKey(desk, ledger.conversationKey)),
      sendHint: activeHint(watch.key),
      now: at,
      visible: isVisible(),
      timings: captureTimings
    });
  }

  function queueMark(ledger, source) {
    const desk = String(workspaceId() || "");
    const mark = markFromLedger(ledger, { source, now: now() });
    if (!desk || !mark) return;
    pendingMarks.set(mark.conversationKey, { desk, mark });
    if (markTimer) return;
    markTimer = (async () => {
      await sleep(T.markDebounceMs);
      markTimer = null;
      await flushMarks();
    })();
  }

  async function flushMarks() {
    if (!pendingMarks.size) return;
    const byDesk = new Map();
    for (const [key, { desk, mark }] of pendingMarks) {
      if (!byDesk.has(desk)) byDesk.set(desk, []);
      byDesk.get(desk).push([key, mark]);
    }
    for (const [desk, entries] of byDesk) {
      try {
        await persistMarks({ workspaceId: desk, marks: entries.map(([, mark]) => mark) });
      } catch {}
      for (const [key, mark] of entries) {
        if (pendingMarks.get(key)?.mark === mark) pendingMarks.delete(key);
      }
    }
    invalidateRecord();
  }

  // The conversation a watch first finds is the one this page opened with.
  // A frame that is writing a reply was not just restored, and a start page
  // that stays one past restoreSettleMs makes every later conversation new.
  function noteInitialKey(watch, ledger) {
    if (watch.initialKey !== undefined) return;
    if (ledger && (ledger.generating || ledger.generatingSeenAgoMs !== null)) watch.initialKey = "";
    else if (ledger?.conversationKey) watch.initialKey = ledger.conversationKey;
    else if (now() - watch.startedAt >= T.restoreSettleMs) watch.initialKey = "";
  }

  // Decisions that do not Copy may still remember something: an adopted
  // mark for a record written before marks, or the baseline of a
  // conversation that was already open when this page started watching.
  function settleWithoutCopy(decision, ledger) {
    if (decision.action === "adopt") queueMark(ledger, decision.source || "adopted");
    else if (decision.action === "baseline" && !baselines.has(ledger.conversationKey)) {
      const baseline = markFromLedger(ledger, { source: "baseline", now: now() });
      if (baseline) baselines.set(ledger.conversationKey, baseline);
    }
  }

  function breakerTripped(at) {
    while (deskCaptureTimes.length && at - deskCaptureTimes[0] > T.breakerWindowMs) deskCaptureTimes.shift();
    if (deskCaptureTimes.length < T.breakerMax) return false;
    pausedUntil = Math.max(pausedUntil, at + T.breakerPauseMs);
    if (!breakerReported) {
      breakerReported = true;
      try {
        recordAnomaly({
          operation: "recordFullTextBreaker",
          message: `Record Full Text copied ${deskCaptureTimes.length} times in ${Math.round(T.breakerWindowMs / 60_000)} min; paused`
        });
      } catch {}
    }
    return true;
  }

  function copiedResultMatches(item, ledger) {
    const messages = item?.page?.messages;
    if (!messagesHavePair(messages)) return false;
    if (!ledger.lastUser) return true;
    const copied = lastUserMessage(messages);
    return ledgerLastUserOverlaps(ledger.lastUser, copied);
  }

  async function capture(watch, ledger, gen) {
    const runId = `${gen}:${watch.key}:${++runSequence}`;
    const desk = String(workspaceId() || "");
    let outcome = "skipped";
    let pre = ledger;
    watch.runId = runId;
    const isCancelled = () => cancelledRuns.has(runId) || !live(gen, watch) || !isEnabled();
    try {
      await runExclusive(async () => {
        if (isCancelled()) {
          outcome = "cancelled";
          return;
        }
        // The decision may have queued behind a user-initiated collect;
        // decide again on a fresh ledger before touching the page.
        const hint = activeHint(watch.key);
        try {
          pre = normalizeLedger(await probe(watch.frame, { waitMs: 0, since: null, prompt: hint?.prompt || "" }));
        } catch {
          pre = null;
        }
        if (!pre || isCancelled()) {
          outcome = pre ? "cancelled" : "skipped";
          return;
        }
        const again = await decide(watch, pre);
        if (again.action !== "capture") {
          settleWithoutCopy(again, pre);
          return;
        }
        const at = now();
        if (breakerTripped(at)) return;
        deskCaptureTimes.push(at);
        try {
          log({
            frame: watch.key,
            conversationKey: pre.conversationKey,
            reason: again.reason,
            alignment: again.alignment?.kind || "",
            turns: again.turns,
            granularity: pre.granularity,
            digest: pre.digest
          });
        } catch {}
        let item = null;
        try {
          item = await collectFrame(watch.frame, { turns: again.turns, runId, isCancelled });
        } catch {
          outcome = isCancelled() ? "cancelled" : "error";
          return;
        }
        if (isCancelled()) {
          outcome = "cancelled";
          return;
        }
        if (item?.aborted === true) {
          outcome = "aborted";
          return;
        }
        if (!copiedResultMatches(item, pre)) {
          outcome = "unmatched";
          return;
        }
        let result = null;
        // This Copy's mark supersedes any adoption still waiting to be written.
        pendingMarks.delete(pre.conversationKey);
        try {
          result = await persist(item, markFromLedger(pre, { source: "idle", now: now() }));
        } catch {
          result = null;
        }
        if (!result || result.saved === false) {
          outcome = "error";
          return;
        }
        outcome = result.unchanged === true ? "unchanged" : "saved";
      });
    } finally {
      if (watch.runId === runId) watch.runId = "";
      cancelledRuns.delete(runId);
    }
    invalidateRecord();
    if (!pre || outcome === "skipped" || outcome === "cancelled") return outcome;
    await updateCaptureState(desk, pre.conversationKey, outcome, pre.digest);
    if (outcome === "saved" || outcome === "unchanged") {
      sendHints.delete(watch.key);
      await adoptPostCaptureLedger(watch, pre, gen);
    }
    return outcome;
  }

  // The Copy itself hovers and scrolls; if the ledger it leaves behind is
  // the same conversation seen through that noise, it becomes the mark so
  // the Copy cannot trigger the next one.
  async function adoptPostCaptureLedger(watch, pre, gen) {
    let post = null;
    try {
      post = normalizeLedger(await probe(watch.frame, {
        waitMs: T.postCaptureProbeMs,
        since: { ledgerId: pre.ledgerId, revision: pre.revision, conversationKey: pre.conversationKey },
        prompt: ""
      }));
    } catch {
      post = null;
    }
    if (!post || !live(gen, watch) || post.generating || post.conversationKey !== pre.conversationKey) return;
    if (!post.digest || post.digest === pre.digest) return;
    const kind = alignLedgerTails(pre.tail, post.tail).kind;
    if (kind === "none" || kind === "behind" || kind === "last-changed") queueMark(post, "post-copy");
  }

  async function watchLoop(watch, gen) {
    let since = null;
    let waitMs = 0;
    let failures = 0;
    while (live(gen, watch)) {
      await visibleGate();
      if (!live(gen, watch)) break;
      if (!isEnabled()) {
        stop();
        break;
      }
      if (!frameCollectable(watch.frame)) {
        noteInitialKey(watch, null);
        since = null;
        waitMs = 0;
        await wait(T.tickMs);
        continue;
      }
      const hint = activeHint(watch.key);
      let ledger = null;
      try {
        ledger = normalizeLedger(await interruptibleProbe(watch, { waitMs, since, prompt: hint?.prompt || "" }));
      } catch {
        ledger = null;
      }
      if (!live(gen, watch)) break;
      if (!ledger) {
        // No answer, or an older content bundle without a ledger: never
        // Copy on it, and back off instead of spinning.
        since = null;
        waitMs = 0;
        failures += 1;
        await wait(Math.min(T.heartbeatMs, T.probeRetryMs * 2 ** Math.min(3, failures - 1)));
        continue;
      }
      failures = 0;
      noteInitialKey(watch, ledger);
      since = { ledgerId: ledger.ledgerId, revision: ledger.revision, conversationKey: ledger.conversationKey };
      const decision = await decide(watch, ledger);
      if (!live(gen, watch)) break;
      if (decision.action === "capture") {
        await capture(watch, ledger, gen);
        since = null;
        waitMs = 0;
        continue;
      }
      settleWithoutCopy(decision, ledger);
      waitMs = decision.action === "wait"
        ? Math.max(T.minPollMs, Math.min(T.heartbeatMs, Number(decision.waitMs) || T.heartbeatMs))
        : T.heartbeatMs;
    }
  }

  // A long poll can hold for up to heartbeatMs; stop() must not wait for it.
  function interruptibleProbe(watch, request) {
    let answer = null;
    const pending = Promise.resolve(probe(watch.frame, request)).then((value) => { answer = value; }, () => { answer = null; });
    return interruptible(pending).then(() => answer);
  }

  function syncWatches(gen) {
    let frames = [];
    try { frames = listFrames(); } catch { frames = []; }
    const seen = new Set();
    for (const frame of Array.isArray(frames) ? frames : []) {
      const key = frameKey(frame);
      if (!key) continue;
      seen.add(key);
      const existing = watches.get(key);
      if (existing) {
        existing.frame = frame;
        continue;
      }
      const watch = { key, frame, alive: true, runId: "", startedAt: now(), initialKey: undefined };
      watches.set(key, watch);
      void watchLoop(watch, gen);
    }
    for (const [key, watch] of [...watches]) {
      if (seen.has(key)) continue;
      retire(watch);
    }
  }

  function retire(watch) {
    watch.alive = false;
    watches.delete(watch.key);
    sendHints.delete(watch.key);
    if (watch.runId) {
      cancelledRuns.add(watch.runId);
      try { Promise.resolve(cancelCollect(watch.frame, watch.runId)).catch(() => {}); } catch {}
    }
  }

  async function tickLoop(gen) {
    while (live(gen)) {
      if (!isEnabled()) {
        stop();
        return;
      }
      await visibleGate();
      if (!live(gen)) return;
      syncWatches(gen);
      await wait(T.tickMs);
    }
  }

  function start() {
    if (running || !isEnabled()) return false;
    running = true;
    generation += 1;
    void tickLoop(generation);
    return true;
  }

  function stop() {
    if (!running) return;
    running = false;
    generation += 1;
    for (const watch of [...watches.values()]) retire(watch);
    sendHints.clear();
    wakeAll();
    void flushMarks();
  }

  function hintSend(prompt) {
    const text = String(prompt || "").trim();
    if (!text) return false;
    const at = now();
    let frames = [];
    try { frames = listFrames(); } catch { frames = []; }
    for (const frame of Array.isArray(frames) ? frames : []) {
      const key = frameKey(frame);
      if (key) sendHints.set(key, { prompt: text, at });
    }
    start();
    return true;
  }

  // For History, Tabs and quick save: the stored frame of this frame's
  // conversation while it still matches the live ledger, so a live preview
  // does not Copy a conversation that is already recorded. The ledger comes
  // back too, so a fresh Copy can be stored with its mark.
  async function storedTextFor(frame) {
    let ledger = null;
    try {
      ledger = normalizeLedger(await probe(frame, { waitMs: 0, since: null, prompt: "" }));
    } catch {
      ledger = null;
    }
    const desk = String(workspaceId() || "");
    if (!ledger?.conversationKey || !desk || ledger.generating) return { ledger, stored: null };
    invalidateRecord();
    const found = workspaceTabFullTextConversation(await deskRecord(desk), ledger.conversationKey);
    const mark = found?.mark;
    if (!mark || mark.v !== ledger.ledgerVersion || !found.frame) return { ledger, stored: null };
    const kind = mark.digest === ledger.digest ? "none" : alignLedgerTails(mark.tail, ledger.tail).kind;
    return { ledger, stored: kind === "none" || kind === "behind" ? found.frame : null };
  }

  // A user-initiated collect must not queue behind an idle Copy busy in the
  // same frame: stop that Copy and keep new ones off for a moment.
  function cancelInFlight() {
    let cancelled = 0;
    for (const watch of watches.values()) {
      if (!watch.runId) continue;
      cancelledRuns.add(watch.runId);
      cancelled += 1;
      try { Promise.resolve(cancelCollect(watch.frame, watch.runId)).catch(() => {}); } catch {}
    }
    pausedUntil = Math.max(pausedUntil, now() + T.cancelPauseMs);
    return cancelled > 0;
  }

  return Object.freeze({
    start,
    stop,
    hintSend,
    cancelInFlight,
    invalidateRecord,
    storedTextFor,
    isRunning: () => running
  });
}
