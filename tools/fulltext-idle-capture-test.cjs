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

async function settleCapture(clock, done, maxMs = 60_000, step = 1_000) {
  const started = clock.now();
  let settled = false;
  const tracked = Promise.resolve(done).then(
    (value) => {
      settled = true;
      return value;
    },
    (error) => {
      settled = true;
      throw error;
    }
  );
  while (!settled && clock.now() - started < maxMs) {
    if (clock.pendingCount) await clock.advance(step);
    else await new Promise((resolve) => { setTimeout(resolve, 0); });
  }
  if (!settled) {
    throw new Error(`idle capture scheduler did not finish by ${clock.now()}`);
  }
  return tracked;
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
  const { fullTextMessagesHavePair, fullTextMessagesMatchPrompt, fullTextContentMetricsFromMessages, fullTextContentSignature } = fullTextModule;

  assert.equal(IDLE_FULLTEXT_CAPTURE_DEFAULTS.idleMs, 30_000);
  assert.equal(IDLE_FULLTEXT_CAPTURE_DEFAULTS.maxAttempts, 3);
  assert.equal(IDLE_FULLTEXT_CAPTURE_DEFAULTS.collectTimeoutMs, 60_000);
  assert.match(summary, /timeoutMs:\s*IDLE_FULLTEXT_CAPTURE_DEFAULTS\.collectTimeoutMs/);
  assert.match(summary, /idleFullText:\s*true/);
  assert.match(summary, /idleFullText \? \{ \.\.\.runtimeConfig, idleFullText: true \} : runtimeConfig/);
  assert.match(read("content-src/capabilities/summary-runtime.js"), /idleFullText === true/);
  assert.match(read("content-src/capabilities/summary-runtime.js"), /wait: !idleFullText/);
  assert.match(read("content-src/capabilities/summary-runtime.js"), /!idleFullText && config\.userscriptRunMode !== "serial"/);
  assert.match(read("app/workspace/tab-search.js"), /fullTextMessagesHavePair\(frame\.messages\)/);
  assert.match(read("userscripts/grok.js"), /messageActions\(\)/);
  assert.match(read("userscripts/grok.js"), /copyActions\.slice\(-8\)/);
  assert.match(read("userscripts/grok.js"), /copyActions\.slice\(-2\)/);
  assert.match(read("userscripts/grok-dairoot.js"), /copyActions\.slice\(-8\)/);
  assert.match(read("userscripts/grok-dairoot.js"), /copyActions\.slice\(-2\)/);
  assert.match(read("userscripts/kagi.js"), /actions\.slice\(-2\)/);
  assert.match(read("userscripts/kagi.js"), /actions\.slice\(0, 24\)/);
  assert.match(read("userscripts/notion.js"), /idleFullText \? 2 : 8/);
  assert.match(read("userscripts/notion.js"), /collectPromptRange/);
  assert.doesNotMatch(
    read("userscripts/notion.js"),
    /idleFullText\) \{\n  const fallback = notionDomTextFallback/,
    "idle Notion collection must not skip Copy in favor of a one-line DOM fallback"
  );
  assert.doesNotMatch(read("userscripts/grok.js"), /slice\(-24\)/);
  assert.doesNotMatch(read("userscripts/notion.js"), /slice\(-24\)/);
  assert.equal(
    conversationFingerprintSignature({
      documentId: "d",
      href: "https://x",
      turnCount: 4,
      userChars: 12,
      assistantChars: 9,
      tailHash: "ab",
      now: 99,
      childCount: 88,
      textLength: 240,
      generating: true
    }),
    "4\n12\n9\nab",
    "idle signatures must be content-only: turnCount, userChars, assistantChars, tailHash"
  );
  assert.equal(
    conversationFingerprintSignature({
      turnCount: 4,
      userChars: 12,
      assistantChars: 9,
      tailHash: "ab",
      generating: false
    }),
    conversationFingerprintSignature({
      turnCount: 4,
      userChars: 12,
      assistantChars: 9,
      tailHash: "ab",
      generating: true
    }),
    "generating must not change the idle content signature"
  );

  const prompt = "Explain ChatClub idle capture";
  const fingerprintOf = (overrides = {}) => ({
    documentId: "one",
    href: "https://x",
    turnCount: 2,
    userChars: 10,
    assistantChars: 20,
    tailHash: "a",
    containsPrompt: true,
    ...overrides
  });

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
    if (!persisted.includes("slow")) await clock.advance(30_000);
    if (!persisted.includes("slow")) await clock.advance(60_000);
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
        return collects.length >= 4
          ? previewItem("one", prompt, "late reply")
          : previewItem("one", prompt);
      },
      itemMatchesPrompt: (item, text) => fullTextMessagesMatchPrompt(item?.page?.messages, text),
      persistItem: async () => {}
    });
    const done = scheduler.schedule(prompt);
    await waitForSleep(clock);
    await settleCapture(clock, done);
    assert.equal(collects.length, 4, "unmatched collects must keep waiting for a long reply instead of exhausting");
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
    await settleCapture(clock, done);
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
    await settleCapture(clock, done);
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
    await settleCapture(clock, done);
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
    await settleCapture(clock, send);
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
    await settleCapture(clock, Promise.all([existing, send]));
    assert.deepEqual(collected, [prompt], "a new send must cancel existing-tab idle capture");
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
        return previewItem("one", prompt, "reply");
      },
      itemMatchesPrompt: (item, text) => fullTextMessagesMatchPrompt(item?.page?.messages, text),
      persistItem: async () => ({ saved: false })
    });
    const done = scheduler.schedule(prompt);
    await waitForSleep(clock);
    await settleCapture(clock, done);
    assert.equal(collects.length, 3, "an empty persist result must keep retrying instead of pretending the write succeeded");
  }

  {
    const clock = createFakeClock();
    const collects = [];
    let probe = 0;
    const scheduler = createIdleFullTextCaptureScheduler({
      now: clock.now,
      sleep: clock.sleep,
      idleMs: 4_000,
      pollMs: 1_000,
      maxAttempts: 3,
      wallMs: 60_000,
      listFrames: () => [{ key: "one" }],
      getFingerprint: async () => {
        probe += 1;
        return fingerprintOf({
          childCount: probe,
          textLength: probe * 17,
          now: clock.now()
        });
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
    await settleCapture(clock, done);
    assert.equal(collects.length, 1, "composer and timestamp chrome must not restart the idle window");
    assert.equal(collects[0] >= 4_000, true);
  }

  {
    const clock = createFakeClock();
    const collects = [];
    const persisted = [];
    const scheduler = createIdleFullTextCaptureScheduler({
      now: clock.now,
      sleep: clock.sleep,
      idleMs: 5_000,
      pollMs: 1_000,
      maxAttempts: 3,
      wallMs: 60_000,
      listFrames: () => [{ key: "one" }],
      getFingerprint: async () => fingerprintOf({
        href: "https://chatgpt.com/c/1",
        containsPrompt: false
      }),
      collectFrame: async () => {
        collects.push(clock.now());
        return previewItem("one", "older question", "older answer");
      },
      itemMatchesPrompt: existingMatcher,
      persistItem: async (item) => { persisted.push(item.instanceId); }
    });
    const first = scheduler.schedule("", { existing: true });
    await waitForSleep(clock);
    await settleCapture(clock, first);
    assert.deepEqual(persisted, ["one"]);
    assert.equal(collects.length, 1, "an idle iframe must collect at most once");
    const second = await scheduler.schedule("", { existing: true });
    assert.equal(second.scheduled, true);
    assert.equal(collects.length, 1, "a later existing capture must skip a saved signature without collecting");
  }

  {
    const clock = createFakeClock();
    const collects = [];
    const scheduler = createIdleFullTextCaptureScheduler({
      now: clock.now,
      sleep: clock.sleep,
      idleMs: 5_000,
      pollMs: 1_000,
      maxAttempts: 3,
      wallMs: 60_000,
      listFrames: () => [{ key: "one" }],
      getFingerprint: async () => fingerprintOf(),
      collectFrame: async (_frame, text) => {
        collects.push(text || "existing");
        return previewItem("one", text || prompt, "reply");
      },
      itemMatchesPrompt: existingMatcher,
      persistItem: async () => {}
    });
    const existing = scheduler.schedule("", { existing: true });
    await waitForSleep(clock);
    await settleCapture(clock, existing);
    assert.deepEqual(collects, ["existing"]);
    const send = scheduler.schedule(prompt);
    await waitForSleep(clock);
    await settleCapture(clock, send);
    assert.deepEqual(collects, ["existing", prompt], "a send must still wait for idle and collect after a saved existing snapshot");
  }

  function storedSnapshot(frame, messages) {
    const metrics = fullTextContentMetricsFromMessages(messages);
    const keys = [];
    const instanceId = String(frame.key || frame.instanceId || "").trim();
    if (instanceId) {
      keys.push(instanceId);
      keys.push(`id:${instanceId}`);
    }
    if (frame.href) keys.push(`href:${frame.href}`);
    return {
      keys,
      signature: fullTextContentSignature(metrics),
      hasPair: true,
      ...metrics
    };
  }

  const coveredMessages = [
    { role: "user", text: "older question" },
    { role: "assistant", text: "older answer" }
  ];
  const coveredMetrics = fullTextContentMetricsFromMessages(coveredMessages);
  const coveredFrame = { key: "one", instanceId: "one", href: "https://chatgpt.com/c/1" };
  const coveredFingerprint = () => fingerprintOf({
    href: coveredFrame.href,
    turnCount: coveredMetrics.turnCount,
    userChars: coveredMetrics.userChars,
    assistantChars: coveredMetrics.assistantChars,
    tailHash: coveredMetrics.tailHash,
    containsPrompt: false
  });

  {
    const clock = createFakeClock();
    const collects = [];
    const scheduler = createIdleFullTextCaptureScheduler({
      now: clock.now,
      sleep: clock.sleep,
      idleMs: 5_000,
      pollMs: 1_000,
      maxAttempts: 3,
      wallMs: 60_000,
      listFrames: () => [coveredFrame],
      loadStoredSnapshots: async () => [storedSnapshot(coveredFrame, coveredMessages)],
      getFingerprint: async () => coveredFingerprint(),
      collectFrame: async () => {
        collects.push(clock.now());
        return previewItem("one", "older question", "older answer");
      },
      itemMatchesPrompt: existingMatcher,
      persistItem: async () => {}
    });
    const first = scheduler.schedule("", { existing: true });
    await settleCapture(clock, first);
    assert.equal(collects.length, 0, "hydrated existing capture must skip Copy when the store already covers the live conversation");
    const second = scheduler.schedule("", { existing: true });
    await settleCapture(clock, second);
    assert.equal(collects.length, 0, "a later visibility existing scan must still skip Copy when the conversation is unchanged");
  }

  {
    const clock = createFakeClock();
    const collects = [];
    let probe = 0;
    const scheduler = createIdleFullTextCaptureScheduler({
      now: clock.now,
      sleep: clock.sleep,
      idleMs: 5_000,
      pollMs: 1_000,
      maxAttempts: 3,
      wallMs: 60_000,
      listFrames: () => [coveredFrame],
      loadStoredSnapshots: async () => [storedSnapshot(coveredFrame, coveredMessages)],
      getFingerprint: async () => fingerprintOf({
        ...coveredFingerprint(),
        generating: probe++ % 2 === 0
      }),
      collectFrame: async () => {
        collects.push(clock.now());
        return previewItem("one", "older question", "older answer");
      },
      itemMatchesPrompt: existingMatcher,
      persistItem: async () => {}
    });
    const done = scheduler.schedule("", { existing: true });
    await settleCapture(clock, done);
    assert.equal(collects.length, 0, "generating flicker must not collect when stored content already covers the conversation");
  }

  {
    const clock = createFakeClock();
    const collects = [];
    const grownMessages = [
      ...coveredMessages,
      { role: "user", text: "follow up" },
      { role: "assistant", text: "new reply" }
    ];
    const grownMetrics = fullTextContentMetricsFromMessages(grownMessages);
    let live = { ...grownMetrics };
    const scheduler = createIdleFullTextCaptureScheduler({
      now: clock.now,
      sleep: clock.sleep,
      idleMs: 5_000,
      pollMs: 1_000,
      maxAttempts: 3,
      wallMs: 60_000,
      listFrames: () => [coveredFrame],
      loadStoredSnapshots: async () => [storedSnapshot(coveredFrame, coveredMessages)],
      getFingerprint: async () => fingerprintOf({
        href: coveredFrame.href,
        turnCount: live.turnCount,
        userChars: live.userChars,
        assistantChars: live.assistantChars,
        tailHash: live.tailHash,
        containsPrompt: false
      }),
      collectFrame: async () => {
        collects.push(clock.now());
        return {
          status: "ok",
          instanceId: "one",
          page: { instanceId: "one", messages: grownMessages }
        };
      },
      itemMatchesPrompt: existingMatcher,
      persistItem: async () => {}
    });
    const first = scheduler.schedule("", { existing: true });
    await waitForSleep(clock);
    await settleCapture(clock, first);
    assert.equal(collects.length, 1, "turn growth against a stored pair must collect once");
    const second = scheduler.schedule("", { existing: true });
    await settleCapture(clock, second);
    assert.equal(collects.length, 1, "after a growth collect, an unchanged existing scan must skip Copy");
  }

  {
    const clock = createFakeClock();
    const collects = [];
    const rewritten = { ...coveredMetrics, tailHash: "deadbeef" };
    let live = { ...rewritten };
    const scheduler = createIdleFullTextCaptureScheduler({
      now: clock.now,
      sleep: clock.sleep,
      idleMs: 5_000,
      pollMs: 1_000,
      maxAttempts: 3,
      wallMs: 60_000,
      listFrames: () => [coveredFrame],
      loadStoredSnapshots: async () => [storedSnapshot(coveredFrame, coveredMessages)],
      getFingerprint: async () => fingerprintOf({
        href: coveredFrame.href,
        turnCount: live.turnCount,
        userChars: live.userChars,
        assistantChars: live.assistantChars,
        tailHash: live.tailHash,
        containsPrompt: false
      }),
      collectFrame: async () => {
        collects.push(clock.now());
        return previewItem("one", "older question", "rewritten answer");
      },
      itemMatchesPrompt: existingMatcher,
      persistItem: async () => {}
    });
    const first = scheduler.schedule("", { existing: true });
    await waitForSleep(clock);
    await settleCapture(clock, first);
    assert.equal(collects.length, 1, "a tail-hash change against a stored pair must collect once");
    const second = scheduler.schedule("", { existing: true });
    await settleCapture(clock, second);
    assert.equal(collects.length, 1, "after a hash-change collect, an unchanged existing scan must skip Copy");
  }

  {
    const clock = createFakeClock();
    const collects = [];
    const scheduler = createIdleFullTextCaptureScheduler({
      now: clock.now,
      sleep: clock.sleep,
      idleMs: 30_000,
      pollMs: 1_000,
      maxAttempts: 3,
      wallMs: 8_000,
      listFrames: () => [coveredFrame],
      loadStoredSnapshots: async () => [storedSnapshot(coveredFrame, coveredMessages)],
      getFingerprint: async () => fingerprintOf({
        href: coveredFrame.href,
        turnCount: 0,
        userChars: 0,
        assistantChars: 0,
        tailHash: "",
        containsPrompt: false
      }),
      collectFrame: async () => {
        collects.push(clock.now());
        return previewItem("one", "older question", "older answer");
      },
      itemMatchesPrompt: existingMatcher,
      persistItem: async () => {}
    });
    const done = scheduler.schedule("", { existing: true });
    await waitForSleep(clock);
    await settleCapture(clock, done);
    assert.equal(collects.length, 0, "wallHit with a stored pair and no live growth must not Copy");
  }

  {
    const clock = createFakeClock();
    const collects = [];
    const scheduler = createIdleFullTextCaptureScheduler({
      now: clock.now,
      sleep: clock.sleep,
      idleMs: 5_000,
      pollMs: 1_000,
      maxAttempts: 3,
      wallMs: 60_000,
      listFrames: () => [coveredFrame],
      loadStoredSnapshots: async () => [storedSnapshot(coveredFrame, coveredMessages)],
      getFingerprint: async () => fingerprintOf({
        ...coveredFingerprint(),
        containsPrompt: true
      }),
      collectFrame: async (_frame, text) => {
        collects.push(text || "existing");
        return previewItem("one", text || prompt, "reply");
      },
      itemMatchesPrompt: (item, text) => fullTextMessagesMatchPrompt(item?.page?.messages, text),
      persistItem: async () => {}
    });
    const done = scheduler.schedule(prompt);
    await waitForSleep(clock);
    await settleCapture(clock, done);
    assert.deepEqual(collects, [prompt], "send capture must still collect even when the store already covers the conversation");
  }

  {
    const clock = createFakeClock();
    let generating = true;
    const collects = [];
    const scheduler = createIdleFullTextCaptureScheduler({
      now: clock.now,
      sleep: clock.sleep,
      idleMs: 4_000,
      pollMs: 1_000,
      maxAttempts: 3,
      wallMs: 60_000,
      listFrames: () => [{ key: "one" }],
      getFingerprint: async () => fingerprintOf({ generating, tailHash: "stable" }),
      collectFrame: async () => {
        collects.push(clock.now());
        return previewItem("one", prompt, "reply");
      },
      itemMatchesPrompt: (item, text) => fullTextMessagesMatchPrompt(item?.page?.messages, text),
      persistItem: async () => {}
    });
    const done = scheduler.schedule(prompt);
    await waitForSleep(clock);
    await clock.advance(45_000);
    assert.equal(collects.length, 0, "thinking pauses must not collect while generating");
    generating = false;
    await settleCapture(clock, done);
    assert.equal(collects.length, 1);
    assert.equal(collects[0] >= 49_000, true, "the idle window must start only after generating ends");
  }

  {
    const clock = createFakeClock();
    let collected = false;
    const scheduler = createIdleFullTextCaptureScheduler({
      now: clock.now,
      sleep: clock.sleep,
      idleMs: 30_000,
      pollMs: 1_000,
      maxAttempts: 3,
      wallMs: 8_000,
      generatingWallMs: 8_000,
      listFrames: () => [{ key: "one" }],
      getFingerprint: async () => fingerprintOf({ generating: true, containsPrompt: true }),
      collectFrame: async () => {
        collected = true;
        return previewItem("one", prompt, "partial");
      },
      itemMatchesPrompt: (item, text) => fullTextMessagesMatchPrompt(item?.page?.messages, text),
      persistItem: async () => {}
    });
    const done = scheduler.schedule(prompt);
    await waitForSleep(clock);
    await settleCapture(clock, done);
    assert.equal(collected, false, "the generating wall must not persist a still-generating reply");
  }

  {
    const clock = createFakeClock();
    let generating = true;
    const collects = [];
    const scheduler = createIdleFullTextCaptureScheduler({
      now: clock.now,
      sleep: clock.sleep,
      idleMs: 4_000,
      pollMs: 1_000,
      maxAttempts: 3,
      wallMs: 8_000,
      generatingWallMs: 60_000,
      listFrames: () => [{ key: "one" }],
      getFingerprint: async () => fingerprintOf({ generating, containsPrompt: true, tailHash: generating ? "think" : "done" }),
      collectFrame: async () => {
        collects.push(clock.now());
        return previewItem("one", prompt, "late reply");
      },
      itemMatchesPrompt: (item, text) => fullTextMessagesMatchPrompt(item?.page?.messages, text),
      persistItem: async () => {}
    });
    const done = scheduler.schedule(prompt);
    await waitForSleep(clock);
    await clock.advance(20_000);
    assert.equal(collects.length, 0, "a long-thinking iframe must keep waiting past the idle wall");
    generating = false;
    await settleCapture(clock, done);
    assert.equal(collects.length, 1);
    assert.equal(collects[0] >= 20_000, true, "a long-thinking iframe must collect only after generating ends");
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
      wallMs: 8_000,
      generatingWallMs: 40_000,
      listFrames: () => [{ key: "one" }],
      getFingerprint: async () => fingerprintOf({ containsPrompt: true, tailHash: "prompt" }),
      collectFrame: async () => {
        collects.push(clock.now());
        return clock.now() >= 12_000
          ? previewItem("one", prompt, "late fable reply")
          : previewItem("one", prompt);
      },
      itemMatchesPrompt: (item, text) => fullTextMessagesMatchPrompt(item?.page?.messages, text),
      persistItem: async () => {}
    });
    const done = scheduler.schedule(prompt);
    await waitForSleep(clock);
    await clock.advance(10_000);
    assert.equal(collects.some((at) => at <= 8_000), true);
    assert.equal(collects.every((at) => at < 12_000) || collects[collects.length - 1] < 12_000, true);
    await settleCapture(clock, done);
    assert.equal(collects.at(-1) >= 12_000, true, "an unmatched send must keep waiting past the idle wall for a long reply");
  }

  {
    const clock = createFakeClock();
    let collected = false;
    const scheduler = createIdleFullTextCaptureScheduler({
      now: clock.now,
      sleep: clock.sleep,
      idleMs: 4_000,
      pollMs: 1_000,
      maxAttempts: 3,
      wallMs: 8_000,
      generatingWallMs: 12_000,
      listFrames: () => [{ key: "one" }],
      getFingerprint: async () => {
        throw new Error("fingerprint timeout");
      },
      collectFrame: async () => {
        collected = true;
        return previewItem("one", prompt, "partial");
      },
      itemMatchesPrompt: (item, text) => fullTextMessagesMatchPrompt(item?.page?.messages, text),
      persistItem: async () => {}
    });
    const done = scheduler.schedule(prompt);
    await waitForSleep(clock);
    await settleCapture(clock, done);
    assert.equal(collected, false, "a failed fingerprint probe must not collect a long-running iframe");
  }

  {
    const clock = createFakeClock();
    let generating = true;
    let failProbe = false;
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
        if (failProbe) throw new Error("fingerprint timeout");
        return fingerprintOf({ generating, tailHash: generating ? "think" : "done" });
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
    await clock.advance(6_000);
    generating = false;
    await clock.advance(2_000);
    failProbe = true;
    await settleCapture(clock, done);
    assert.equal(collects.length, 1, "a finished iframe must still collect if later fingerprint probes time out");
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
      getFingerprint: async () => fingerprintOf(),
      collectFrame: async () => {
        collects.push(clock.now());
        return previewItem("one", prompt, "reply");
      },
      itemMatchesPrompt: (item, text) => fullTextMessagesMatchPrompt(item?.page?.messages, text),
      persistItem: async () => {}
    });
    const first = scheduler.schedule(prompt);
    await waitForSleep(clock);
    await settleCapture(clock, first);
    assert.equal(collects.length, 1);
    const second = scheduler.schedule(prompt);
    await waitForSleep(clock);
    await settleCapture(clock, second);
    assert.equal(collects.length, 1, "a later send of the same idle snapshot must not click Copy again");
  }

  const idleSource = read("app/summary/idle-capture.js");
  assert.match(idleSource, /persisted === false \|\| persisted\?\.saved === false/);
  assert.match(idleSource, /status: "unchanged"/);
  assert.match(idleSource, /savedSignatures/);
  assert.match(idleSource, /alreadySavedIdleSnapshot/);
  assert.match(idleSource, /lastKnownGenerating/);
  assert.match(idleSource, /hydrateFromStore/);
  assert.match(idleSource, /loadStoredSnapshots/);
  assert.match(idleSource, /fullTextExistingNeedsCollect/);
  assert.match(idleSource, /fullTextExistingIsCovered/);
  assert.match(runtime, /result\?\.saved && result\.unchanged !== true/);
  assert.match(runtime, /historyController\?\.notifyFullTextChanged/);
  assert.match(runtime, /loadWorkspaceTabFullText:\s*loadWorkspaceTabFullTextStore/);
  assert.match(summary, /loadStoredSnapshots/);
  assert.match(summary, /fullTextContentMetricsFromMessages/);
  assert.match(summary, /workspaceTabFullTextFrameIdentityKey/);
  const tabSearch = read("app/workspace/tab-search.js");
  assert.match(tabSearch, /workspaceTabFullTextFramesEqual/);
  assert.match(tabSearch, /unchanged:\s*true/);
  const summaryRuntime = read("content-src/shared/summary-runtime.js");
  assert.match(summaryRuntime, /function conversationTurnFingerprintText/);
  assert.match(summaryRuntime, /turnCount:\s*classified/);
  assert.doesNotMatch(summaryRuntime, /turns\.length \|\| Math\.min\(lines\.length/);
  assert.doesNotMatch(summaryRuntime, /if \(!lastText\) lastText = tail/);
  assert.doesNotMatch(summaryRuntime, /if \(!assistantChars\) assistantChars = tail\.length/);
  assert.match(summaryRuntime, /function conversationHref/);
  assert.match(summaryRuntime, /function conversationTurnNodes/);
  assert.match(summaryRuntime, /generating:\s*conversationComposerIsGenerating\(\)/);
  assert.match(summaryRuntime, /function conversationToolActivityIsActive/);
  assert.match(summaryRuntime, /loading web page/);
  assert.match(summaryRuntime, /searching the web/);
  const toolActivity = summaryRuntime.match(/function conversationToolActivityFromLines\(lines\) \{[\s\S]*?\n\}/);
  assert.ok(toolActivity, "conversationToolActivityFromLines must exist");
  assert.doesNotMatch(toolActivity[0], /aria-busy/, "leftover aria-busy chrome must not keep a finished reply generating");
  assert.match(summaryRuntime, /function conversationSampleRoot/);
  assert.match(summaryRuntime, /conversationSampleRoot\(\)\?\.textContent/);
  assert.match(summaryRuntime, /crafting\|noodling\|contemplating/);
  assert.doesNotMatch(
    summaryRuntime.slice(
      summaryRuntime.indexOf("function lastAssistantTurnIsStreaming"),
      summaryRuntime.indexOf("function conversationIsGenerating")
    ),
    /querySelector/,
    "nested leftover aria-busy must not keep a finished Fable turn generating"
  );
  assert.match(summaryRuntime, /function shouldRefuseLiveAssistantCopy/);
  assert.match(idleSource, /fingerprintIsGenerating/);
  assert.match(idleSource, /generating && generatingCapHit/);
  assert.match(idleSource, /generatingWallMs/);
  assert.match(idleSource, /waitingForReply/);
  assert.match(idleSource, /probeFailed/);
  assert.equal(IDLE_FULLTEXT_CAPTURE_DEFAULTS.generatingWallMs, 45 * 60 * 1000);
  assert.match(summary, /generatingWallMs:\s*IDLE_FULLTEXT_CAPTURE_DEFAULTS\.generatingWallMs/);
  assert.match(read("userscripts/notion.js"), /copyLimit = idleFullText \? 2 : 8/);
  assert.match(summary, /timeoutMs:\s*8000,\s*skipEnsure:\s*false/);
  assert.doesNotMatch(summaryRuntime, /function conversationRoot/);
  assert.doesNotMatch(summaryRuntime, /childCount:/);
  const historySource = read("app/history/controller.js");
  assert.match(historySource, /hasLiveSnapshot/);
  assert.match(historySource, /!hasPages && !hasLiveSnapshot/);
  const navigatorEngine = read("content-src/message-navigator/engine.js");
  assert.match(navigatorEngine, /messagesSignature/);
  assert.match(navigatorEngine, /record\.target === this\.root \|\| this\.root\.contains\(record\.target\)/);

  console.log("fulltext idle capture: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
