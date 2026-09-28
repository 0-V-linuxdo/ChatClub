#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const MINUTE = 60_000;

function createClock() {
  let nowMs = 1_000_000;
  const pending = [];
  const flush = async () => {
    for (let index = 0; index < 6; index += 1) await new Promise((resolve) => { setImmediate(resolve); });
  };
  return {
    now: () => nowMs,
    sleep(ms) {
      return new Promise((resolve) => {
        pending.push({ at: nowMs + Math.max(0, Number(ms) || 0), resolve });
      });
    },
    flush,
    async advance(ms) {
      const target = nowMs + Math.max(0, ms);
      await flush();
      for (;;) {
        pending.sort((left, right) => left.at - right.at);
        const next = pending[0];
        if (!next || next.at > target) break;
        nowMs = Math.max(nowMs, next.at);
        while (pending.length && pending[0].at <= nowMs) pending.shift().resolve();
        await flush();
      }
      nowMs = target;
      await flush();
    }
  };
}

(async () => {
  const { createFullTextReconciler } = await import(pathToFileURL(path.join(root, "app/summary/fulltext-reconciler.js")).href);
  const {
    FULLTEXT_LEDGER_VERSION,
    conversationKeyFromHref,
    ledgerDigest,
    ledgerTurnEntry
  } = await import(pathToFileURL(path.join(root, "shared/fulltext-ledger.js")).href);
  const {
    FULLTEXT_CAPTURE_TIMINGS: T,
    markFromLedger,
    normalizeLedger
  } = await import(pathToFileURL(path.join(root, "app/summary/fulltext-decision.js")).href);
  const {
    applyWorkspaceTabFullTextMarks,
    framesFromSummaryPreviewItems,
    mergeWorkspaceTabFullTextFrames,
    workspaceTabFullTextFramesEqual,
    workspaceTabFullTextMarksEqual
  } = await import(pathToFileURL(path.join(root, "shared/workspace-tab-fulltext.js")).href);

  const DESK = "page-abcdefghijkl";

  function pair(index) {
    return [
      { role: "user", text: `Question ${index} about ChatClub` },
      { role: "assistant", text: `Answer ${index} with details` }
    ];
  }

  // One fake chat frame: its messages are what the page renders; the ledger
  // is derived from them like the content side would.
  function createFrame(key, conversationId, pairs = 2) {
    const frame = {
      key,
      href: `https://chatgpt.com/c/${conversationId}`,
      messages: [...Array(pairs)].flatMap((_, index) => pair(index + 1)),
      prepended: [],
      generating: false,
      generatingSeenAt: 0,
      changedAt: 0,
      revision: 0,
      idleMs: null,
      ledgerVersion: FULLTEXT_LEDGER_VERSION,
      noiseSuffix: "",
      waiters: new Set(),
      change(clock, patch = {}) {
        Object.assign(frame, patch);
        if (patch.generating === true) frame.generatingSeenAt = clock.now();
        frame.revision += 1;
        frame.changedAt = clock.now();
        for (const wake of [...frame.waiters]) wake();
      }
    };
    return frame;
  }

  function ledgerOf(frame, clock) {
    const rendered = [...frame.prepended, ...frame.messages];
    const entries = rendered.map((message, index) => ledgerTurnEntry(
      message.role,
      index === rendered.length - 1 ? `${message.text}${frame.noiseSuffix}` : message.text
    ));
    const users = rendered.filter((message) => message.role === "user");
    const last = users[users.length - 1]?.text || "";
    return {
      ledgerVersion: frame.ledgerVersion,
      ledgerId: `ledger-${frame.key}`,
      href: frame.href,
      conversationKey: conversationKeyFromHref(frame.href),
      revision: frame.revision,
      granularity: entries.length ? "turns" : "none",
      turnCount: entries.length,
      hasPair: rendered.some((message) => message.role === "assistant") && users.length > 0,
      digest: ledgerDigest("turns", entries),
      tail: entries.slice(-12),
      lastUser: last ? { head: last.slice(0, 160), tail: last.slice(-160) } : null,
      containsPrompt: Boolean(frame.prompt) && rendered.some((message) => message.text.includes(frame.prompt)),
      generating: frame.generating,
      generatingSeenAgoMs: frame.generatingSeenAt ? clock.now() - frame.generatingSeenAt : null,
      stableForMs: clock.now() - frame.changedAt,
      viewportAtEnd: true,
      input: { seen: frame.idleMs !== null, idleMs: frame.idleMs === null ? null : frame.idleMs, editing: false }
    };
  }

  function recordedFrame(frame, clock, { withMark = true } = {}) {
    const ledger = normalizeLedger(ledgerOf(frame, clock));
    return framesFromSummaryPreviewItems([{
      status: "ok",
      instanceId: frame.key,
      captureMark: withMark ? markFromLedger(ledger, { now: clock.now() }) : undefined,
      page: { href: frame.href, messages: frame.messages }
    }])[0];
  }

  function harness({ frames, record = null, session = { value: null }, visible = { value: true } } = {}) {
    const clock = createClock();
    for (const frame of frames) frame.changedAt = clock.now() - 30 * MINUTE;
    const desk = { workspaceId: DESK, frames: typeof record === "function" ? record(clock) : record || [] };
    const collects = [];
    const behaviour = { collect: null, persistPaused: null };
    let enabled = true;
    const visibilityWaiters = new Set();
    const reconciler = createFullTextReconciler({
      now: clock.now,
      sleep: clock.sleep,
      isEnabled: () => enabled,
      isVisible: () => visible.value,
      waitUntilVisible: () => (visible.value ? undefined : new Promise((resolve) => { visibilityWaiters.add(resolve); })),
      listFrames: () => frames.map((frame) => ({ key: frame.key, frame })),
      frameCollectable: () => true,
      probe: async ({ frame }, { waitMs = 0, since = null, prompt = "" } = {}) => {
        frame.prompt = prompt;
        if (waitMs && since && since.revision === frame.revision && since.ledgerId === `ledger-${frame.key}`) {
          await new Promise((resolve) => {
            const wake = () => {
              frame.waiters.delete(wake);
              resolve();
            };
            frame.waiters.add(wake);
            clock.sleep(waitMs).then(wake);
          });
        }
        return frame.ledgerVersion === FULLTEXT_LEDGER_VERSION ? ledgerOf(frame, clock) : { turnCount: 2, tailHash: "ab" };
      },
      collectFrame: async ({ frame }, { turns, runId, isCancelled }) => {
        collects.push({ key: frame.key, turns, runId, at: clock.now() });
        if (behaviour.collect) return behaviour.collect(frame, { turns, runId, isCancelled });
        await clock.sleep(1_000);
        const messages = turns ? frame.messages.slice(-turns) : frame.messages;
        return { status: "ok", instanceId: frame.key, page: { href: frame.href, messages } };
      },
      persist: async (item, captureMark) => {
        const incoming = framesFromSummaryPreviewItems([{ ...item, captureMark }]);
        const merged = mergeWorkspaceTabFullTextFrames(desk.frames, incoming);
        if (workspaceTabFullTextFramesEqual(desk.frames, merged)) {
          const unchangedMarks = workspaceTabFullTextMarksEqual(desk.frames, merged);
          desk.frames = merged;
          return { saved: true, unchanged: true, markOnly: !unchangedMarks };
        }
        desk.frames = merged;
        return { saved: true };
      },
      persistMarks: async ({ marks }) => {
        desk.frames = applyWorkspaceTabFullTextMarks(desk.frames, marks);
        desk.markWrites = (desk.markWrites || 0) + 1;
        return { saved: true, unchanged: true, markOnly: true };
      },
      loadRecord: async () => ({ ...desk, frames: desk.frames }),
      workspaceId: () => DESK,
      loadCaptureState: async () => session.value,
      saveCaptureState: async (value) => { session.value = JSON.parse(JSON.stringify(value)); },
      cancelCollect: () => undefined
    });
    return {
      clock,
      desk,
      collects,
      behaviour,
      reconciler,
      setVisible(value) {
        visible.value = value;
        if (value) for (const resolve of [...visibilityWaiters]) { visibilityWaiters.delete(resolve); resolve(); }
      },
      disable() { enabled = false; }
    };
  }

  function markFor(desk, frame) {
    const key = conversationKeyFromHref(frame.href);
    return desk.frames.find((stored) => stored.capture?.conversationKey === key)?.capture || null;
  }

  // 1. Reopening a recorded desk, toggling visibility and leaving Settings
  //    open for a quarter of an hour never Copies.
  {
    const frame = createFrame("f1", "abc");
    const h = harness({ frames: [frame], record: (clock) => [recordedFrame(frame, clock)] });
    h.reconciler.start();
    for (let index = 0; index < 10; index += 1) {
      await h.clock.advance(30_000);
      h.setVisible(false);
      await h.clock.advance(20_000);
      h.setVisible(true);
    }
    await h.clock.advance(15 * MINUTE);
    assert.equal(h.collects.length, 0, "an unchanged recorded conversation is never Copied");
    h.reconciler.stop();
  }

  // 2. A frame nobody touched grows: exactly one tail Copy once the reply
  //    settles, then nothing.
  {
    const frame = createFrame("f1", "abc");
    const h = harness({ frames: [frame], record: (clock) => [recordedFrame(frame, clock)] });
    h.reconciler.start();
    await h.clock.advance(MINUTE);
    frame.change(h.clock, { messages: [...frame.messages, pair(3)[0]], generating: true });
    await h.clock.advance(10_000);
    frame.change(h.clock, { messages: [...frame.messages, pair(3)[1]], generating: false });
    await h.clock.advance(T.settleAfterGeneratingMs - 1_000);
    assert.equal(h.collects.length, 0, "the reply must settle first");
    await h.clock.advance(5_000);
    assert.equal(h.collects.length, 1, "one Copy after the settle window, not at a wall timeout");
    assert.equal(h.collects[0].turns, 2, "only the new exchange is Copied");
    await h.clock.advance(20 * MINUTE);
    assert.equal(h.collects.length, 1);
    assert.equal(h.desk.frames[0].messages.length, 6, "the new exchange was merged into the record");
    assert.equal(markFor(h.desk, frame).digest, normalizeLedger(ledgerOf(frame, h.clock)).digest, "the mark follows the Copy");
    h.reconciler.stop();
  }

  // 3. A conversation this desk never recorded is recorded once.
  {
    const frame = createFrame("f1", "fresh");
    const h = harness({ frames: [frame] });
    h.reconciler.start();
    await h.clock.advance(30 * MINUTE);
    assert.equal(h.collects.length, 1);
    assert.equal(h.collects[0].turns, 0, "first sight Copies the whole conversation");
    assert.ok(markFor(h.desk, frame));
    h.reconciler.stop();
  }

  // 4. A record written before marks existed is adopted, not Copied again;
  //    growth afterwards is Copied once.
  {
    const frame = createFrame("f1", "legacy");
    const h = harness({ frames: [frame], record: (clock) => [recordedFrame(frame, clock, { withMark: false })] });
    h.reconciler.start();
    await h.clock.advance(5 * MINUTE);
    assert.equal(h.collects.length, 0, "a matching legacy record is adopted");
    assert.ok(markFor(h.desk, frame), "the adopted mark is written");
    assert.ok(h.desk.markWrites >= 1);
    frame.change(h.clock, { messages: [...frame.messages, ...pair(9)] });
    await h.clock.advance(5 * MINUTE);
    assert.equal(h.collects.length, 1);
    h.reconciler.stop();
  }

  // 5. A Copy whose result does not match is retried once, then parked until
  //    the conversation changes; the park survives a page reload.
  {
    const frame = createFrame("f1", "unmatched");
    const session = { value: null };
    const h = harness({ frames: [frame], session });
    h.behaviour.collect = async () => ({ status: "ok", instanceId: frame.key, page: { href: frame.href, messages: [{ role: "user", text: "nothing like it" }] } });
    h.reconciler.start();
    await h.clock.advance(60 * MINUTE);
    assert.equal(h.collects.length, 2, "one retry, then parked");
    h.reconciler.stop();
    const reloaded = harness({ frames: [frame], session });
    reloaded.behaviour.collect = h.behaviour.collect;
    reloaded.reconciler.start();
    await reloaded.clock.advance(30 * MINUTE);
    assert.equal(reloaded.collects.length, 0, "a reload does not retry the same unchanged content");
    frame.change(reloaded.clock, { messages: [...frame.messages, ...pair(7)] });
    reloaded.behaviour.collect = null;
    await reloaded.clock.advance(5 * MINUTE);
    assert.equal(reloaded.collects.length, 1, "a changed conversation is tried again");
    reloaded.reconciler.stop();
  }

  // 6. Older turns loading above (scroll-up, virtualization) are not growth.
  {
    const frame = createFrame("f1", "long");
    const h = harness({ frames: [frame], record: (clock) => [recordedFrame(frame, clock)] });
    h.reconciler.start();
    await h.clock.advance(MINUTE);
    frame.change(h.clock, { prepended: [...pair(-2), ...pair(-1)] });
    await h.clock.advance(10 * MINUTE);
    assert.equal(h.collects.length, 0);
    h.reconciler.stop();
  }

  // 7. Navigating inside the frame: an unrecorded conversation is recorded
  //    once, going back to a recorded one Copies nothing.
  {
    const frame = createFrame("f1", "abc");
    const h = harness({ frames: [frame], record: (clock) => [recordedFrame(frame, clock)] });
    h.reconciler.start();
    await h.clock.advance(MINUTE);
    const original = { href: frame.href, messages: frame.messages };
    frame.change(h.clock, { href: "https://chatgpt.com/c/other", messages: [...pair(4), ...pair(5)] });
    await h.clock.advance(5 * MINUTE);
    assert.equal(h.collects.length, 1);
    frame.change(h.clock, original);
    await h.clock.advance(10 * MINUTE);
    assert.equal(h.collects.length, 1, "the recorded conversation keeps its own mark");
    h.reconciler.stop();
  }

  // 8. A send to three frames where only two answer Copies two frames.
  {
    const frames = [createFrame("f1", "one"), createFrame("f2", "two"), createFrame("f3", "three")];
    const h = harness({ frames, record: (clock) => frames.map((frame) => recordedFrame(frame, clock)) });
    h.reconciler.start();
    await h.clock.advance(MINUTE);
    h.reconciler.hintSend("Compare them");
    for (const frame of frames.slice(0, 2)) {
      frame.change(h.clock, { messages: [...frame.messages, { role: "user", text: "Compare them" }], generating: true });
    }
    await h.clock.advance(20_000);
    for (const frame of frames.slice(0, 2)) {
      frame.change(h.clock, { messages: [...frame.messages, { role: "assistant", text: "Here is the comparison" }], generating: false });
    }
    await h.clock.advance(30 * MINUTE);
    assert.deepEqual(h.collects.map((entry) => entry.key).sort(), ["f1", "f2"], "the frame that did not answer is never Copied");
    h.reconciler.stop();
  }

  // 9. An older content bundle without a ledger never Copies.
  {
    const frame = createFrame("f1", "stale");
    frame.ledgerVersion = 0;
    const h = harness({ frames: [frame] });
    h.reconciler.start();
    await h.clock.advance(30 * MINUTE);
    assert.equal(h.collects.length, 0);
    h.reconciler.stop();
  }

  // 10. A Copy that comes back with unchanged text adopts the ledger; a site
  //     whose last turn keeps flickering ends in strict mode.
  {
    const frame = createFrame("f1", "noisy");
    const h = harness({ frames: [frame], record: (clock) => [recordedFrame(frame, clock)] });
    h.reconciler.start();
    for (let index = 1; index <= 6; index += 1) {
      await h.clock.advance(2 * MINUTE);
      frame.change(h.clock, { noiseSuffix: ` (${index})` });
    }
    await h.clock.advance(20 * MINUTE);
    assert.ok(h.collects.length <= 2, `a flickering last turn stops being Copied (got ${h.collects.length})`);
    h.reconciler.stop();
  }

  // 11. The user in the frame holds a Copy back until they stop.
  {
    const frame = createFrame("f1", "busy");
    frame.idleMs = 1_000;
    const h = harness({ frames: [frame], record: (clock) => [recordedFrame(frame, clock)] });
    h.reconciler.start();
    await h.clock.advance(MINUTE);
    frame.change(h.clock, { messages: [...frame.messages, ...pair(5)] });
    await h.clock.advance(5 * MINUTE);
    assert.equal(h.collects.length, 0, "no Copy while the user is working in the frame");
    frame.idleMs = 60_000;
    await h.clock.advance(MINUTE);
    assert.equal(h.collects.length, 1);
    h.reconciler.stop();
  }

  // 12. A hidden ChatClub tab never Copies; showing it again only re-probes.
  {
    const frame = createFrame("f1", "hidden");
    const visible = { value: false };
    const h = harness({ frames: [frame], record: (clock) => [recordedFrame(frame, clock)], visible });
    h.reconciler.start();
    frame.change(h.clock, { messages: [...frame.messages, ...pair(5)] });
    await h.clock.advance(30 * MINUTE);
    assert.equal(h.collects.length, 0);
    h.setVisible(true);
    await h.clock.advance(MINUTE);
    assert.equal(h.collects.length, 1, "the real change is recorded once the tab is visible");
    h.reconciler.stop();
  }

  // 13. A user-initiated collect cancels the idle Copy; the decision is taken
  //     again under the lock, and turning the option off stops everything.
  {
    const frame = createFrame("f1", "cancel");
    const h = harness({ frames: [frame], record: (clock) => [recordedFrame(frame, clock)] });
    let release = null;
    h.behaviour.collect = async (_frame, { isCancelled }) => {
      await new Promise((resolve) => { release = resolve; });
      return isCancelled() ? { aborted: true } : { status: "ok", instanceId: frame.key, page: { href: frame.href, messages: frame.messages } };
    };
    h.reconciler.start();
    await h.clock.advance(MINUTE);
    frame.change(h.clock, { messages: [...frame.messages, ...pair(6)] });
    await h.clock.advance(T.settleNoSignalMs + 2_000);
    assert.equal(h.collects.length, 1);
    assert.equal(h.reconciler.cancelInFlight(), true);
    release();
    await h.clock.advance(3_000);
    h.behaviour.collect = null;
    h.disable();
    await h.clock.advance(30 * MINUTE);
    assert.equal(h.reconciler.isRunning(), false, "the reconciler stops once the option is off");
    assert.equal(h.collects.length, 1);
  }

  // Wiring.
  const summary = read("app/summary/controller.js");
  assert.match(summary, /createFullTextReconciler\(/);
  assert.match(summary, /getConversationFingerprint/);
  assert.match(summary, /\{ prompt, waitMs, since \}/);
  assert.match(summary, /timeoutMs: waitMs \+ 8000, skipEnsure: false/);
  assert.match(summary, /runExclusive: withSummaryCollectionLock/);
  assert.match(summary, /idleFullText \? \{ \.\.\.runtimeConfig, idleFullText: true, idleFullTextTurns \} : runtimeConfig/);
  assert.match(summary, /recordFailures: false/);
  assert.match(summary, /FULLTEXT_CAPTURE_STATE_SESSION_KEY/);
  assert.match(summary, /state\.topicTitle/);
  assert.doesNotMatch(summary, /visibilitychange", \(\) => \{\s*if \(document\.visibilityState === "visible"\) schedule/, "becoming visible must not start a Copy scan");
  assert.doesNotMatch(summary, /idle-capture/);
  assert.equal(fs.existsSync(path.join(root, "app/summary/idle-capture.js")), false);
  const runtime = read("app/runtime.js");
  assert.ok(
    runtime.indexOf("waitForInitialWorkspaceFrameRestoration()") < runtime.lastIndexOf("startFullTextCapture();"),
    "the reconciler starts after restored frames are ready"
  );
  assert.match(runtime, /result\?\.saved && result\.unchanged !== true/, "mark-only writes do not refresh History or Tabs");
  const tabSearch = read("app/workspace/tab-search.js");
  assert.match(tabSearch, /updatedAt: current\.updatedAt/, "mark-only writes keep the desk's recency");
  assert.match(read("content-src/capabilities/summary-runtime.js"), /wait: !idleFullText/);
  assert.match(read("content-src/capabilities/summary-runtime.js"), /!idleFullText && config\.userscriptRunMode !== "serial"/);

  console.log("fulltext reconciler: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
