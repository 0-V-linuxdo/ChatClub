#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function createFakeClock() {
  let nowMs = 0;
  const pending = [];
  return {
    now: () => nowMs,
    sleep(ms) {
      return new Promise((resolve) => {
        pending.push({ at: nowMs + Math.max(0, Number(ms) || 0), resolve });
      });
    },
    async advance(ms) {
      const target = nowMs + Math.max(0, Number(ms) || 0);
      while (nowMs < target || pending.some((item) => item.at <= target)) {
        pending.sort((left, right) => left.at - right.at);
        const next = pending.find((item) => item.at <= target);
        if (!next) {
          nowMs = target;
          return;
        }
        nowMs = Math.max(nowMs, next.at);
        const due = [];
        while (pending.length && pending[0].at <= nowMs) due.push(pending.shift());
        for (const item of due) item.resolve();
        await Promise.resolve();
        await Promise.resolve();
      }
      nowMs = target;
    },
    get pendingCount() {
      return pending.length;
    }
  };
}

async function waitForSleep(clock) {
  for (let index = 0; index < 30; index += 1) {
    if (clock.pendingCount) return;
    await Promise.resolve();
  }
  throw new Error("idle capture scheduler did not park on sleep");
}

function previewItem(instanceId, prompt, assistant) {
  return {
    status: "ok",
    instanceId,
    page: {
      instanceId,
      messages: assistant
        ? [{ role: "user", text: prompt }, { role: "assistant", text: assistant }]
        : [{ role: "user", text: prompt }]
    }
  };
}

(async () => {
  const [idleModule, fullTextModule, frameCommands] = await Promise.all([
    import(pathToFileURL(path.join(root, "app/summary/idle-capture.js")).href),
    import(pathToFileURL(path.join(root, "shared/workspace-tab-fulltext.js")).href),
    import(pathToFileURL(path.join(root, "shared/frame-commands.js")).href)
  ]);

  const spec = frameCommands.FRAME_COMMAND_SPECS.getConversationFingerprint;
  assert.equal(spec.capability, "base");
  assert.equal(spec.mutating, false);
  assert.ok(spec.timeoutMs <= 1800);

  const runtime = read("app/runtime.js");
  assert.match(runtime, /scheduleIdleFullTextCapture\?\.\(text\)/);
  assert.match(runtime, /scheduleExistingIdleFullTextCapture/);
  assert.ok(
    runtime.indexOf("waitForInitialWorkspaceFrameRestoration") < runtime.indexOf("scheduleExistingIdleFullTextCapture"),
    "restored workspaces must schedule idle capture after frames are ready"
  );
  assert.doesNotMatch(runtime, /captureWorkspaceFullText/);
  const summary = read("app/summary/controller.js");
  assert.match(summary, /createIdleFullTextCaptureScheduler\(/);
  assert.match(summary, /getConversationFingerprint/);
  assert.match(summary, /recordFailures:\s*false/);
  assert.match(summary, /state\.topicTitle/);
  assert.match(summary, /visibilitychange/);
  assert.match(summary, /scheduleExistingIdleFullTextCapture/);
  assert.doesNotMatch(summary, /state\.options\?\.topicTitle/);
  const content = read("content-src/content.js");
  assert.match(content, /getConversationFingerprint:\s*\(data\)\s*=>\s*conversationFingerprint\(contentDocumentId,\s*data\)/);

  const {
    conversationFingerprintSignature,
    createIdleFullTextCaptureScheduler,
    IDLE_FULLTEXT_CAPTURE_DEFAULTS
  } = idleModule;
  const { fullTextMessagesHavePair, fullTextMessagesMatchPrompt } = fullTextModule;

  assert.equal(IDLE_FULLTEXT_CAPTURE_DEFAULTS.idleMs, 30_000);
  assert.equal(IDLE_FULLTEXT_CAPTURE_DEFAULTS.maxAttempts, 3);
  assert.equal(
    conversationFingerprintSignature({ documentId: "d", href: "https://x", childCount: 4, textLength: 12, tailHash: "ab", now: 99 }),
    "d\nhttps://x\n4\n12\nab",
    "idle signatures must ignore clocks and other extra fields"
  );

  const prompt = "Explain ChatClub idle capture";

  {
    const clock = createFakeClock();
    const fingerprints = {
      fast: { documentId: "fast", href: "https://chatgpt.com/c/1", childCount: 2, textLength: 40, tailHash: "aa", containsPrompt: true },
      slow: { documentId: "slow", href: "https://claude.ai/chat/2", childCount: 1, textLength: 10, tailHash: "s0", containsPrompt: true }
    };
    let slowTick = 0;
    const persisted = [];
    const collects = [];
    const scheduler = createIdleFullTextCaptureScheduler({
      now: clock.now,
      sleep: clock.sleep,
      idleMs: 30_000,
      pollMs: 2_500,
      maxAttempts: 3,
      wallMs: 9 * 60 * 1000,
      listFrames: () => [{ key: "fast" }, { key: "slow" }],
      getFingerprint: async (frame) => {
        if (frame.key === "slow") {
          if (fingerprints.slow.tailHash === "stable") return fingerprints.slow;
          slowTick += 1;
          return {
            ...fingerprints.slow,
            textLength: 10 + slowTick,
            tailHash: `s${slowTick}`
          };
        }
        return fingerprints.fast;
      },
      collectFrame: async (frame) => {
        collects.push({ key: frame.key, at: clock.now() });
        if (frame.key === "slow") {
          if (fingerprints.slow.tailHash !== "stable") return previewItem("slow", prompt, "");
          return previewItem("slow", prompt, "slow reply");
        }
        return previewItem("fast", prompt, "fast reply");
      },
      itemMatchesPrompt: (item, text) => fullTextMessagesMatchPrompt(item?.page?.messages, text),
      persistItem: async (item) => { persisted.push(item.instanceId); }
    });
    const done = scheduler.schedule(prompt);
    await waitForSleep(clock);
    await clock.advance(30_000);
    await Promise.resolve();
    assert.deepEqual(persisted, ["fast"], "a quiet iframe must persist without waiting for a still-streaming sibling");
    assert.equal(collects.some((entry) => entry.key === "fast"), true);
    fingerprints.slow = { ...fingerprints.slow, textLength: 80, tailHash: "stable", containsPrompt: true };
    await clock.advance(30_000);
    await done;
    assert.deepEqual(persisted, ["fast", "slow"], "the slower iframe must persist later on its own idle window");
  }

  {
    const clock = createFakeClock();
    let persistCount = 0;
    const collectedPrompts = [];
    const scheduler = createIdleFullTextCaptureScheduler({
      now: clock.now,
      sleep: clock.sleep,
      idleMs: 5_000,
      pollMs: 1_000,
      maxAttempts: 3,
      wallMs: 60_000,
      listFrames: () => [{ key: "one" }],
      getFingerprint: async () => ({ documentId: "one", href: "https://x", childCount: 1, textLength: 8, tailHash: "a", containsPrompt: true }),
      collectFrame: async (_frame, text) => {
        collectedPrompts.push(text);
        return previewItem("one", text, "first");
      },
      itemMatchesPrompt: (item, text) => fullTextMessagesMatchPrompt(item?.page?.messages, text),
      persistItem: async () => { persistCount += 1; }
    });
    const first = scheduler.schedule(prompt);
    const second = scheduler.schedule("a newer prompt");
    await waitForSleep(clock);
    await clock.advance(5_000);
    await Promise.all([first, second]);
    assert.deepEqual(collectedPrompts, ["a newer prompt"], "a new send must cancel the previous idle generation before it persists");
    assert.equal(persistCount, 1);
  }

  {
    const clock = createFakeClock();
    const collects = [];
    const scheduler = createIdleFullTextCaptureScheduler({
      now: clock.now,
      sleep: clock.sleep,
      idleMs: 4_000,
      pollMs: 1_000,
      maxAttempts: 3,
      wallMs: 60_000,
      listFrames: () => [{ key: "one" }],
      getFingerprint: async () => ({ documentId: "one", href: "https://x", childCount: 1, textLength: 8, tailHash: "a", containsPrompt: true }),
      collectFrame: async () => {
        collects.push(clock.now());
        return previewItem("one", prompt);
      },
      itemMatchesPrompt: (item, text) => fullTextMessagesMatchPrompt(item?.page?.messages, text),
      persistItem: async () => { throw new Error("must not persist unmatched snapshots"); }
    });
    const done = scheduler.schedule(prompt);
    await waitForSleep(clock);
    for (let index = 0; index < 20; index += 1) await clock.advance(1_000);
    await done;
    assert.equal(collects.length, 3);
    assert.equal(collects[0] >= 4_000, true);
  }

  {
    const clock = createFakeClock();
    let collected = false;
    const scheduler = createIdleFullTextCaptureScheduler({
      now: clock.now,
      sleep: clock.sleep,
      idleMs: 30_000,
      pollMs: 5_000,
      maxAttempts: 3,
      wallMs: 8_000,
      listFrames: () => [{ key: "one" }],
      getFingerprint: async () => ({ documentId: "one", href: "https://x", childCount: 1, textLength: 1, tailHash: "z", containsPrompt: false }),
      collectFrame: async () => {
        collected = true;
        return previewItem("one", prompt, "last chance");
      },
      itemMatchesPrompt: (item, text) => fullTextMessagesMatchPrompt(item?.page?.messages, text),
      persistItem: async () => {}
    });
    const done = scheduler.schedule(prompt);
    await waitForSleep(clock);
    await clock.advance(8_000);
    await done;
    assert.equal(collected, true, "the wall cap must still attempt one last collect");
  }

  {
    const clock = createFakeClock();
    const hashes = ["a", "b", "b", "b", "b", "b"];
    let probe = 0;
    const collects = [];
    const scheduler = createIdleFullTextCaptureScheduler({
      now: clock.now,
      sleep: clock.sleep,
      idleMs: 4_000,
      pollMs: 1_000,
      maxAttempts: 3,
      wallMs: 60_000,
      listFrames: () => [{ key: "one" }],
      getFingerprint: async () => {
        const tailHash = hashes[Math.min(probe, hashes.length - 1)];
        probe += 1;
        return { documentId: "one", href: "https://x", childCount: 1, textLength: 8, tailHash, containsPrompt: true };
      },
      collectFrame: async () => {
        collects.push(clock.now());
        return previewItem("one", prompt, "reply");
      },
      itemMatchesPrompt: (item, text) => fullTextMessagesMatchPrompt(item?.page?.messages, text),
      persistItem: async () => {}
    });
    const done = scheduler.schedule(prompt);
    await waitForSleep(clock);
    for (let index = 0; index < 12; index += 1) await clock.advance(1_000);
    await done;
    assert.equal(collects.length, 1);
    assert.equal(collects[0] >= 5_000, true, "a fingerprint change must restart the 30s idle window");
  }

  function existingMatcher(item, text) {
    return String(text || "").trim()
      ? fullTextMessagesMatchPrompt(item?.page?.messages, text)
      : fullTextMessagesHavePair(item?.page?.messages);
  }

  {
    const clock = createFakeClock();
    const persisted = [];
    const scheduler = createIdleFullTextCaptureScheduler({
      now: clock.now,
      sleep: clock.sleep,
      idleMs: 5_000,
      pollMs: 1_000,
      maxAttempts: 3,
      wallMs: 60_000,
      listFrames: () => [{ key: "one" }],
      getFingerprint: async () => ({
        documentId: "one",
        href: "https://chatgpt.com/c/1",
        childCount: 2,
        textLength: 40,
        tailHash: "idle",
        containsPrompt: false
      }),
      collectFrame: async () => previewItem("one", "older question", "older answer"),
      itemMatchesPrompt: existingMatcher,
      persistItem: async (item) => { persisted.push(item.instanceId); }
    });
    const done = scheduler.schedule("", { existing: true });
    await waitForSleep(clock);
    await clock.advance(5_000);
    await done;
    assert.deepEqual(persisted, ["one"], "an already-idle iframe must persist without a new send");
  }

  {
    const clock = createFakeClock();
    const collected = [];
    const scheduler = createIdleFullTextCaptureScheduler({
      now: clock.now,
      sleep: clock.sleep,
      idleMs: 5_000,
      pollMs: 1_000,
      maxAttempts: 3,
      wallMs: 60_000,
      listFrames: () => [{ key: "one" }],
      getFingerprint: async () => ({ documentId: "one", href: "https://x", childCount: 1, textLength: 8, tailHash: "a", containsPrompt: true }),
      collectFrame: async (_frame, text) => {
        collected.push(text || "existing");
        return previewItem("one", text || "older question", "reply");
      },
      itemMatchesPrompt: existingMatcher,
      persistItem: async () => {}
    });
    const send = scheduler.schedule(prompt);
    await waitForSleep(clock);
    const skipped = await scheduler.schedule("", { existing: true });
    assert.equal(skipped.scheduled, false, "opening a workspace must not cancel an in-flight send capture");
    assert.equal(scheduler.isRunning(), true);
    await clock.advance(5_000);
    await send;
    assert.deepEqual(collected, [prompt]);
  }

  {
    const clock = createFakeClock();
    const collected = [];
    const scheduler = createIdleFullTextCaptureScheduler({
      now: clock.now,
      sleep: clock.sleep,
      idleMs: 5_000,
      pollMs: 1_000,
      maxAttempts: 3,
      wallMs: 60_000,
      listFrames: () => [{ key: "one" }],
      getFingerprint: async () => ({ documentId: "one", href: "https://x", childCount: 1, textLength: 8, tailHash: "a", containsPrompt: true }),
      collectFrame: async (_frame, text) => {
        collected.push(text || "existing");
        return previewItem("one", text || prompt, "reply");
      },
      itemMatchesPrompt: existingMatcher,
      persistItem: async () => {}
    });
    const existing = scheduler.schedule("", { existing: true });
    await waitForSleep(clock);
    const send = scheduler.schedule(prompt);
    await waitForSleep(clock);
    await clock.advance(5_000);
    await Promise.all([existing, send]);
    assert.deepEqual(collected, [prompt], "a new send must cancel existing-tab idle capture");
  }

  console.log("fulltext idle capture: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
