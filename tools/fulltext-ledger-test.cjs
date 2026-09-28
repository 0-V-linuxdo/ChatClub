#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

(async () => {
  const ledger = await import(pathToFileURL(path.join(root, "shared/fulltext-ledger.js")).href);
  const decision = await import(pathToFileURL(path.join(root, "app/summary/fulltext-decision.js")).href);
  const {
    FULLTEXT_LEDGER_TAIL,
    FULLTEXT_LEDGER_VERSION,
    conversationKeyFromHref,
    fullTextCaptureMarksEqual,
    ledgerDigest,
    ledgerTurnEntry,
    normalizeFullTextCaptureMark
  } = ledger;
  const {
    FULLTEXT_CAPTURE_TIMINGS: T,
    alignLedgerTails,
    captureStateEntry,
    captureStateKey,
    captureTurnCount,
    decideFullTextCapture,
    ledgerLastUserOverlaps,
    markFromLedger,
    nextCaptureStateEntry,
    normalizeCaptureState,
    normalizeLedger,
    putCaptureStateEntry
  } = decision;

  // The ledger module is loaded by content bundles too; the decision stays
  // out of the bootstrap graph.
  const contentSafe = JSON.parse(fs.readFileSync(path.join(root, "tools/content-safe-shared-modules.json"), "utf8"));
  assert.ok(contentSafe.includes("shared/fulltext-ledger.js"), "the content ledger imports shared/fulltext-ledger.js");
  assert.doesNotMatch(fs.readFileSync(path.join(root, "shared/fulltext-ledger.js"), "utf8"), /decideFullTextCapture|FULLTEXT_CAPTURE_TIMINGS/);

  // One conversation key, shared by the content ledger and stored marks.
  const keys = {
    "https://chatgpt.com/c/abc?model=gpt": "chatgpt:abc",
    "https://chatgpt.com/g/g-1/c/xyz": "chatgpt:xyz",
    "https://chatgpt.com/": "",
    "https://chatgpt.com/gpts": "",
    "https://claude.ai/chat/c1": "claude:c1",
    "https://claude.ai/new": "",
    "https://gemini.google.com/app": "",
    "https://gemini.google.com/app/123": "gemini:123",
    "https://app.notion.com/chat?t=topic-1&wr=x": "notion:topic-1",
    "https://app.notion.com/chat": "",
    "https://app.notion.com/ai": "",
    "https://grok.com/": "",
    "https://grok.com/c/g1": "grok:g1",
    "https://chat.deepseek.com/a/chat/s/d1": "deepseek:d1",
    "https://kagi.com/assistant/k1": "kagi.com/assistant/k1",
    "https://app.lobehub.com/chat?topic=t1&session=s1&x=1": "app.lobehub.com/chat?session=s1&topic=t1",
    "https://app.lobehub.com/chat": "",
    "https://www.typingmind.com/#chat=xyz123": "www.typingmind.com/?chat=xyz123",
    "https://poe.com/chat/p1": "poe.com/chat/p1",
    "https://manus.im/app": "",
    "https://example.com/": "",
    "chrome-error://chromewebdata/": "",
    "": ""
  };
  for (const [href, key] of Object.entries(keys)) {
    assert.equal(conversationKeyFromHref(href), key, `conversation key for ${href || "(empty)"}`);
  }

  const u = (text) => ledgerTurnEntry("user", text);
  const a = (text) => ledgerTurnEntry("assistant", text);
  assert.match(u("hi"), /^u:[0-9a-f]{16}$/);
  assert.match(a("hi"), /^a:[0-9a-f]{16}$/);
  assert.notEqual(u("hi"), a("hi").replace(/^a/, "u"), "the role is part of the hash");
  assert.match(ledgerTurnEntry("", "hi"), /^\?:[0-9a-f]{16}$/);
  assert.equal(ledgerDigest("turns", []), "");
  assert.notEqual(ledgerDigest("turns", [u("x")]), ledgerDigest("blocks", [u("x")]));

  // Tail alignment.
  const S = [u("q1"), a("r1"), u("q2"), a("r2")];
  assert.equal(alignLedgerTails(S, S).kind, "none");
  assert.equal(alignLedgerTails(S, [u("q0"), a("r0"), ...S]).kind, "none", "older turns loading above are not growth");
  const appended = alignLedgerTails(S, [...S, u("q3"), a("r3")]);
  assert.deepEqual(appended, { kind: "append", firstNew: 4, newTurns: 2, newUserTurns: 1 });
  assert.equal(alignLedgerTails(S, [u("q1"), a("r1"), u("q2")]).kind, "behind", "a virtualized window ending early is not growth");
  assert.deepEqual(alignLedgerTails(S, [u("q1"), a("r1"), u("q2"), a("r2 regenerated")]), { kind: "last-changed", firstNew: 3 });
  assert.deepEqual(alignLedgerTails(S, [u("q1"), a("r1"), u("q2 edited"), a("r2b")]), { kind: "rewound", firstNew: 2 });
  assert.equal(alignLedgerTails(S, [u("other"), a("thread")]).kind, "diverged");
  assert.equal(alignLedgerTails([], S).kind, "diverged");
  // A repeated answer must be confirmed by its predecessors, not matched at the first copy.
  const repeated = [u("q"), a("same"), u("q2"), a("same")];
  assert.equal(alignLedgerTails([u("q"), a("same")], repeated).kind, "append");
  assert.equal(alignLedgerTails([u("q"), a("same")], repeated).firstNew, 2);

  assert.equal(captureTurnCount([...S, u("q3"), a("r3")], 4), 2);
  assert.equal(captureTurnCount([...S, a("extra")], 4), 3, "a Copy slice starts on the user turn that opened the exchange");
  assert.equal(captureTurnCount([], 0), 0);
  assert.equal(captureTurnCount([u("only")], 0), 2);

  // Ledger answers.
  assert.equal(normalizeLedger(null), null);
  assert.equal(normalizeLedger({ turnCount: 4, tailHash: "ab" }), null, "a pre-ledger fingerprint must fail closed");
  const liveOf = (overrides = {}) => normalizeLedger({
    ledgerVersion: FULLTEXT_LEDGER_VERSION,
    ledgerId: "L",
    conversationKey: "chatgpt:abc",
    href: "https://chatgpt.com/c/abc",
    revision: 3,
    granularity: "turns",
    turnCount: 4,
    hasPair: true,
    digest: ledgerDigest("turns", overrides.tail || S),
    tail: S,
    lastUser: { head: "q2 question text", tail: "q2 question text" },
    containsPrompt: false,
    generating: false,
    generatingSeenAgoMs: null,
    stableForMs: 60_000,
    viewportAtEnd: true,
    input: { seen: false, idleMs: null, editing: false },
    ...overrides
  });
  const base = liveOf();
  assert.equal(base.tail.length, 4);
  assert.equal(base.input.idleMs, null);
  assert.equal(liveOf({ tail: [...Array(20)].map((_, index) => u(`t${index}`)) }).tail.length, FULLTEXT_LEDGER_TAIL);
  assert.deepEqual(liveOf({ tail: ["bogus", u("x")] }).tail, [u("x")]);

  // Marks.
  const now = Date.UTC(2026, 8, 28, 12);
  const mark = markFromLedger(base, { now: now - 60 * 60_000 });
  assert.equal(mark.v, FULLTEXT_LEDGER_VERSION);
  assert.equal(mark.conversationKey, "chatgpt:abc");
  assert.equal(mark.digest, base.digest);
  assert.deepEqual(normalizeFullTextCaptureMark(mark), mark);
  assert.equal(normalizeFullTextCaptureMark({ v: 1 }), null);
  assert.equal(normalizeFullTextCaptureMark({ conversationKey: "x" }), null);
  assert.equal(fullTextCaptureMarksEqual(mark, { ...mark, capturedAt: "later" }), true, "capturedAt alone is not a different mark");
  assert.equal(fullTextCaptureMarksEqual(mark, { ...mark, digest: "0000000000000000" }), false);
  assert.equal(fullTextCaptureMarksEqual(null, undefined), true);

  assert.equal(ledgerLastUserOverlaps({ head: "Explain ChatClub idle capture", tail: "" }, "Explain ChatClub idle capture please"), true);
  assert.equal(ledgerLastUserOverlaps({ head: "report.pdf PDF Summarize this", tail: "Summarize this file for me" }, "Summarize this file for me"), true, "the tail sample covers a leading file chip");
  assert.equal(ledgerLastUserOverlaps({ head: "hi", tail: "hi" }, "hi"), true);
  assert.equal(ledgerLastUserOverlaps({ head: "something else entirely", tail: "" }, "Explain ChatClub"), false);

  // Decisions.
  const decide = (live, ctx = {}) => decideFullTextCapture(live, { now, visible: true, ...ctx });

  assert.equal(decide(null).action, "wait");
  assert.equal(decide(null).reason, "no-ledger");
  assert.equal(decide(liveOf({ conversationKey: "" })).action, "skip");

  // Unchanged: the same digest never Copies, whatever else is going on.
  assert.deepEqual(decide(base, { mark }), { action: "skip", reason: "same" });
  assert.equal(decide(liveOf({ input: { seen: true, idleMs: 60_000, editing: false } }), { mark }).action, "skip");
  assert.equal(decide(base, { mark, visible: false }).action, "skip");

  // Growth.
  const grownTail = [...S, u("q3"), a("r3")];
  const grown = liveOf({ tail: grownTail, digest: ledgerDigest("turns", grownTail), lastUser: { head: "q3", tail: "q3" } });
  assert.deepEqual(
    { action: decide(grown, { mark }).action, turns: decide(grown, { mark }).turns },
    { action: "capture", turns: 2 }
  );
  assert.equal(decide({ ...grown, generating: true }, { mark }).action, "wait");
  assert.equal(decide({ ...grown, stableForMs: 3_000, generatingSeenAgoMs: 4_000 }, { mark }).action, "wait");
  assert.equal(decide({ ...grown, stableForMs: 6_000, generatingSeenAgoMs: 7_000 }, { mark }).action, "capture", "a reply that showed a generating signal settles in 5s");
  const settling = decide({ ...grown, stableForMs: 6_000, generatingSeenAgoMs: null }, { mark });
  assert.equal(settling.action, "wait", "without a generating signal the ledger must hold for 20s");
  assert.equal(settling.waitMs, T.settleNoSignalMs - 6_000);

  // Not growth.
  const olderLoaded = [u("q0"), a("r0"), ...S];
  assert.equal(decide(liveOf({ tail: olderLoaded, digest: ledgerDigest("turns", olderLoaded) }), { mark }).reason, "none");
  const behindTail = [u("q1"), a("r1"), u("q2")];
  assert.equal(decide(liveOf({ tail: behindTail, digest: ledgerDigest("turns", behindTail) }), { mark }).reason, "behind");

  // Other alignments.
  // A changed tail without a new user message needs evidence.
  const regenTail = [u("q1"), a("r1"), u("q2"), a("r2 again")];
  const hovered = liveOf({ tail: regenTail, digest: ledgerDigest("turns", regenTail) });
  assert.deepEqual(decide(hovered, { mark }), { action: "skip", reason: "no-evidence" }, "hover text on the last turn is not a regenerated reply");
  assert.equal(decide({ ...hovered, generatingSeenAgoMs: 2 * 60 * 60_000 }, { mark }).reason, "no-evidence", "generating before the mark is no evidence");
  const regen = decide({ ...hovered, generatingSeenAgoMs: 30_000 }, { mark });
  assert.equal(regen.action, "capture", "a generating signal after the mark makes it a regenerate");
  assert.equal(regen.turns, 2);
  assert.equal(decide(hovered, { mark, sendHint: { prompt: "q2", at: now } }).action, "skip", "a send hint alone is not enough without the prompt on the page");
  assert.equal(decide({ ...hovered, containsPrompt: true }, { mark, sendHint: { prompt: "q2", at: now } }).action, "capture");
  const markedWithChars = markFromLedger({ ...base, tailChars: [10, 200, 10, 300] }, { now: now - 60 * 60_000 });
  assert.deepEqual(markedWithChars.tailChars, [10, 200, 10, 300]);
  assert.equal(decide({ ...hovered, tailChars: [10, 200, 10, 320] }, { mark: markedWithChars }).reason, "no-evidence", "a few characters of hover text are not growth");
  assert.equal(decide({ ...hovered, tailChars: [10, 200, 10, 1300] }, { mark: markedWithChars }).action, "capture", "a reply that kept streaming after a mid-stream mark is growth");
  assert.equal(decide({ ...hovered, tailChars: [10, 200, 10, 1300] }, { mark }).reason, "no-evidence", "a mark without counts carries no length evidence");
  const assistantOnlyTail = [...S, a("r2 continued")];
  const assistantOnly = liveOf({ tail: assistantOnlyTail, digest: ledgerDigest("turns", assistantOnlyTail) });
  assert.equal(decide(assistantOnly, { mark }).reason, "no-evidence", "an appended assistant block without a signal is not growth");
  assert.equal(decide({ ...assistantOnly, tailChars: [10, 200, 10, 300, 900] }, { mark }).action, "capture");
  const otherTail = [u("x"), a("y")];
  const diverged = liveOf({ tail: otherTail, digest: ledgerDigest("turns", otherTail), generatingSeenAgoMs: 30_000 });
  assert.equal(decide({ ...diverged, generatingSeenAgoMs: null }, { mark }).reason, "no-evidence");
  assert.equal(decide(diverged, { mark }).turns, FULLTEXT_LEDGER_TAIL);
  assert.equal(decide({ ...diverged, viewportAtEnd: false }, { mark }).action, "wait", "a diverged tail read far above the end is not trusted");

  // First sight: a conversation this frame navigated to (or was sent to) that
  // this desk never recorded is recorded once.
  const first = decide(base, {});
  assert.equal(first.action, "capture");
  assert.equal(first.reason, "first-sight");
  assert.equal(first.turns, 0);
  assert.equal(decide(liveOf({ hasPair: false }), {}).reason, "no-pair");

  // Legacy records (no mark, or an older ledger version) are adopted when the last prompt matches.
  const record = { hasPair: true, lastUserMessage: "q2 question text" };
  assert.deepEqual(decide(base, { record }), { action: "adopt", reason: "legacy", source: "adopted" });
  assert.equal(decide(base, { record, mark: { ...mark, v: FULLTEXT_LEDGER_VERSION + 1 } }).action, "adopt");
  const staleRecord = { hasPair: true, lastUserMessage: "a completely different prompt" };
  const legacyDiverged = decide(base, { record: staleRecord });
  assert.equal(legacyDiverged.action, "capture");
  assert.equal(legacyDiverged.turns, FULLTEXT_LEDGER_TAIL);
  assert.deepEqual(
    decide(base, { record: staleRecord, restored: true }),
    { action: "adopt", reason: "legacy-restored", source: "adopted-unverified" },
    "a conversation that was already open is adopted, not Copied, even when its record is behind"
  );
  const unverified = decide(grown, { mark: { ...mark, source: "adopted-unverified" } });
  assert.equal(unverified.action, "capture");
  assert.equal(unverified.turns, FULLTEXT_LEDGER_TAIL, "its first real growth Copies a wider tail to cover what the record missed");

  // Already open when the page started watching: remembered, never Copied
  // until it grows, and then Copied whole.
  assert.deepEqual(decide(base, { restored: true }), { action: "baseline", reason: "restored" });
  const baseline = markFromLedger(base, { source: "baseline", now: now - 60 * 60_000 });
  assert.equal(decide(base, { restored: true, baseline }).reason, "none");
  assert.equal(decide(hovered, { restored: true, baseline }).reason, "no-evidence");
  const restoredGrowth = decide(grown, { restored: true, baseline });
  assert.deepEqual({ action: restoredGrowth.action, turns: restoredGrowth.turns, reason: restoredGrowth.reason }, { action: "capture", turns: 0, reason: "restored-append" });
  assert.equal(
    decide({ ...base, containsPrompt: true }, { restored: true, sendHint: { prompt: "q2", at: now } }).reason,
    "first-sight",
    "a conversation this page just sent to is never treated as merely restored"
  );
  assert.equal(decide(liveOf({ lastUser: null, granularity: "blocks" }), { record }).action, "adopt");

  // Pages whose roles are not classified only Copy for a matching send.
  const blocksTail = [...S.map((entry) => entry.replace(/^[ua]/, "?")), ledgerTurnEntry("", "new block")];
  const blocks = liveOf({ granularity: "blocks", hasPair: false, tail: blocksTail, digest: ledgerDigest("blocks", blocksTail), lastUser: null });
  const blocksMark = { ...mark, granularity: "blocks", tail: blocksTail.slice(0, -1), digest: "0000000000000000" };
  assert.equal(decide(blocks, { mark: blocksMark }).reason, "no-growth-signal");
  assert.equal(decide({ ...blocks, containsPrompt: true }, { mark: blocksMark, sendHint: { prompt: "p", at: now } }).action, "capture");
  const none = liveOf({ granularity: "none", hasPair: false, turnCount: 0, tail: [], digest: "", lastUser: null });
  assert.equal(decide(none, { mark: { ...mark, digest: "" } }).reason, "no-turns");
  assert.equal(decide({ ...none, containsPrompt: true }, { mark: { ...mark, digest: "" }, sendHint: { prompt: "p", at: now } }).action, "capture");

  // Retry state is tied to the digest it failed on.
  const unmatched = nextCaptureStateEntry(null, "unmatched", { digest: grown.digest, now });
  assert.equal(unmatched.kind, "unmatched");
  assert.equal(unmatched.nextAt, now + T.unmatchedRetryMs, "one retry after the first unmatched Copy");
  assert.equal(decide(grown, { mark, state: unmatched }).action, "wait");
  assert.equal(decide(grown, { mark, state: unmatched, now: now + T.unmatchedRetryMs + 1 }).action, "capture");
  const parked = nextCaptureStateEntry(unmatched, "unmatched", { digest: grown.digest, now: now + T.unmatchedRetryMs + 1 });
  assert.equal(parked.nextAt, 0, "the second unmatched Copy parks the conversation");
  assert.equal(decide(grown, { mark, state: parked, now: now + 99 * 60 * 60_000 }).reason, "parked");
  const movedTail = [...grownTail, u("q4"), a("r4")];
  const moved = liveOf({ tail: movedTail, digest: ledgerDigest("turns", movedTail) });
  assert.equal(decide(moved, { mark, state: { ...parked, captureTimes: [] }, now: now + 2 * 60 * 60_000 }).action, "capture", "a changed digest starts over");

  const error1 = nextCaptureStateEntry(null, "error", { digest: grown.digest, now });
  const error2 = nextCaptureStateEntry(error1, "error", { digest: grown.digest, now });
  const error3 = nextCaptureStateEntry(error2, "error", { digest: grown.digest, now });
  const error4 = nextCaptureStateEntry(error3, "error", { digest: grown.digest, now });
  assert.deepEqual([error1, error2, error3, error4].map((entry) => entry.nextAt - (entry.nextAt ? now : 0)), [...T.errorBackoffMs, 0]);
  let busy = null;
  for (let index = 0; index < T.maxAborts; index += 1) busy = nextCaptureStateEntry(busy, "aborted", { digest: grown.digest, now });
  assert.equal(busy.kind, "busy");
  assert.equal(busy.nextAt, 0);
  assert.equal(busy.captureTimes.length, 0, "an aborted Copy does not count against the rate");

  // Rate limits.
  const recent = nextCaptureStateEntry(null, "saved", { now: now - 10_000 });
  assert.equal(decide(grown, { mark, state: recent }).reason, "rate");
  const hourly = { ...recent, captureTimes: [...Array(T.maxCapturesPerHour)].map((_, index) => now - 50 * 60_000 + index * 60_000) };
  assert.equal(decide(grown, { mark, state: hourly }).reason, "rate-hour");

  // Noise feedback: Copies that came back unchanged put the conversation in strict mode.
  const noisy = nextCaptureStateEntry(nextCaptureStateEntry(null, "unchanged", { now: now - 4 * 60 * 60_000 }), "unchanged", { now: now - 3 * 60 * 60_000 });
  assert.equal(noisy.noiseStreak, 2);
  assert.equal(decide({ ...hovered, generatingSeenAgoMs: 30_000 }, { mark, state: noisy }).reason, "strict");
  assert.equal(decide(grown, { mark, state: noisy }).action, "capture", "a new user turn still Copies in strict mode");
  assert.equal(nextCaptureStateEntry(noisy, "saved", { now }).noiseStreak, 0);

  // The user.
  assert.equal(decide({ ...grown, input: { seen: true, idleMs: 2_000, editing: false } }, { mark }).reason, "user-busy");
  assert.equal(decide({ ...grown, input: { seen: true, idleMs: 20_000, editing: true } }, { mark }).reason, "editing");
  assert.equal(decide({ ...grown, input: { seen: false, idleMs: null, editing: false } }, { mark }).action, "capture", "a frame nobody touched is not busy");
  assert.equal(decide(grown, { mark, visible: false }).reason, "hidden");

  // Capture state storage.
  const key = captureStateKey("page-a", "chatgpt:abc");
  assert.equal(key, "page-a|chatgpt:abc");
  assert.equal(captureStateKey("", "x"), "");
  let state = normalizeCaptureState(null);
  assert.deepEqual(state, { v: 1, entries: {} });
  state = putCaptureStateEntry(state, key, unmatched);
  assert.equal(captureStateEntry(state, key).kind, "unmatched");
  for (let index = 0; index < 250; index += 1) state = putCaptureStateEntry(state, `page-a|k${index}`, { at: index + 1 });
  assert.equal(Object.keys(normalizeCaptureState(state).entries).length, 200, "capture state is LRU-capped");
  assert.equal(captureStateEntry(state, "page-a|k249").at, 250);
  assert.equal(captureStateEntry(state, "page-a|k0"), null);

  console.log("fulltext ledger: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
