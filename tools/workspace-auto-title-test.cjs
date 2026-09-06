#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;
const settle = () => new Promise((resolve) => { setImmediate(resolve); });

function fakeFrame({ appId = "grok", currentHref = "", currentThreadHref = "" } = {}) {
  const dataset = { appId };
  if (currentHref) dataset.currentHref = currentHref;
  if (currentThreadHref) dataset.currentThreadHref = currentThreadHref;
  return { isConnected: true, dataset };
}

function fakeTimers() {
  const timers = new Map();
  let nextId = 1;
  return {
    setTimer(callback, ms) {
      const id = nextId++;
      timers.set(id, { callback, ms });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    pending() {
      return [...timers.values()].map((timer) => timer.ms);
    },
    async fire() {
      const [first] = timers.entries();
      if (!first) return false;
      const [id, timer] = first;
      timers.delete(id);
      timer.callback();
      await settle();
      await settle();
      return true;
    }
  };
}

function harness({
  responses = {},
  topicTitle: topicTitleOverrides = {},
  workspaceId = () => "page-aaaaaaaaaaaa",
  probeConfig = () => ({ adapter: "generic", messageSelector: "article" }),
  createController,
  delays = [10, 20, 30]
} = {}) {
  const timers = fakeTimers();
  const sends = [];
  const state = { title: "", custom: false, generated: [], adopted: [] };
  const topicTitle = {
    canAutoGenerate: () => !state.custom && !state.title,
    maybeAdoptTitle(title) {
      state.adopted.push(title);
      if (!topicTitle.canAutoGenerate()) return state.title;
      state.title = title;
      return title;
    },
    async maybeGenerateFromPrompt(prompt, { stillWanted = () => true } = {}) {
      state.generated.push(prompt);
      await Promise.resolve();
      if (!topicTitle.canAutoGenerate()) return state.title;
      if (!stillWanted()) return "";
      state.title = `Generated: ${prompt}`;
      return state.title;
    },
    ...topicTitleOverrides
  };
  const controller = createController({
    topicTitle,
    sendToContentFrame: async (iframe, action, data) => {
      sends.push({ iframe, action, data });
      const response = typeof responses[action] === "function" ? responses[action](iframe, data) : responses[action];
      if (response instanceof Error) throw response;
      return response;
    },
    frameApp: (iframe) => ({ id: iframe.dataset.appId, name: iframe.dataset.appId === "grok" ? "Grok" : iframe.dataset.appId }),
    inferAppName: (app) => app?.name || "",
    probeConfigForFrame: probeConfig,
    workspaceId,
    delays,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer
  });
  return { controller, timers, sends, state, topicTitle };
}

(async () => {
  const {
    createWorkspaceAutoTitleController,
    openingPromptFromPocketEntries
  } = await import(moduleUrl("app/workspace/auto-title-controller.js"));
  const { markFrameNewChatPending, clearFrameNewChatPending } = await import(moduleUrl("app/workspace/frame-loading.js"));
  const createController = createWorkspaceAutoTitleController;

  assert.throws(() => createController({}), /requires/);

  {
    // The default schedule is bounded and backs off; every attempt is a real timer.
    const timers = fakeTimers();
    const defaults = createController({
      topicTitle: { canAutoGenerate: () => true, maybeAdoptTitle: () => "", maybeGenerateFromPrompt: async () => "" },
      sendToContentFrame: async () => ({}),
      frameApp: () => ({}),
      probeConfigForFrame: () => null,
      workspaceId: () => "page-aaaaaaaaaaaa",
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer
    });
    const frame = fakeFrame({ currentHref: "https://grok.com/c/abc123" });
    const delays = [];
    assert.equal(defaults.observeFrame(frame), true);
    while (timers.pending().length && delays.length < 10) {
      delays.push(timers.pending()[0]);
      await timers.fire();
    }
    assert.ok(delays.length >= 3 && delays.length <= 6, `bounded schedule, got ${delays.length} attempts`);
    assert.ok(delays.every((ms, index) => ms > 0 && (index === 0 || ms > delays[index - 1])), `probe delays back off: ${delays.join(", ")}`);
    assert.ok(delays.at(-1) <= 15000, "the last attempt stays within a short window after the load");
    assert.equal(defaults.isObserving(frame), false);
  }

  {
    // The site-published conversation title wins without touching the title API.
    const { controller, timers, sends, state } = harness({
      createController,
      responses: { getPageMeta: { href: "https://grok.com/c/abc123", title: "Kyoto trip - Grok" } }
    });
    const frame = fakeFrame({ currentHref: "https://grok.com/c/abc123" });
    assert.equal(controller.observeFrame(frame), true);
    assert.equal(controller.isObserving(frame), true);
    assert.deepEqual(timers.pending(), [10]);
    assert.equal(controller.observeFrame(frame), true, "re-observing the same conversation keeps the schedule");
    assert.deepEqual(timers.pending(), [10]);
    await timers.fire();
    assert.equal(state.title, "Kyoto trip");
    assert.deepEqual(state.generated, []);
    assert.deepEqual(sends.map((send) => send.action), ["getPageMeta"]);
    assert.equal(controller.isObserving(frame), false, "a named desk stops probing");
    assert.deepEqual(timers.pending(), []);
  }

  {
    // A bare brand title falls through to the first user message and the title generator.
    const { controller, timers, sends, state } = harness({
      createController,
      responses: {
        getPageMeta: { href: "https://grok.com/c/abc123", title: "Grok" },
        getConversationOpening: {
          ok: true,
          href: "https://grok.com/c/abc123",
          title: "Grok",
          openingText: "Help me plan a weekend in Kyoto"
        }
      }
    });
    const frame = fakeFrame({ currentHref: "https://grok.com/c/abc123" });
    controller.observeFrame(frame);
    await timers.fire();
    assert.equal(state.title, "Generated: Help me plan a weekend in Kyoto");
    assert.deepEqual(sends.map((send) => send.action), ["getPageMeta", "getConversationOpening"]);
    assert.equal(sends[1].data.config.summaryMaxChars, 180, "the probe asks for a longer opening than the navigator summary");
    assert.equal(sends[1].data.config.messageSelector, "article");
    assert.equal(controller.isObserving(frame), false);
  }

  {
    // Nothing usable yet: retry on the bounded schedule, then give up.
    const { controller, timers, sends, state } = harness({
      createController,
      responses: {
        getPageMeta: { href: "https://grok.com/c/abc123", title: "Grok" },
        getConversationOpening: { ok: true, href: "https://grok.com/c/abc123", title: "Grok", openingText: "" }
      }
    });
    const frame = fakeFrame({ currentHref: "https://grok.com/c/abc123" });
    controller.observeFrame(frame);
    await timers.fire();
    assert.deepEqual(timers.pending(), [20]);
    await timers.fire();
    assert.deepEqual(timers.pending(), [30]);
    await timers.fire();
    assert.deepEqual(timers.pending(), []);
    assert.equal(controller.isObserving(frame), false, "the schedule is bounded");
    assert.equal(state.title, "");
    assert.equal(sends.length, 6);
    assert.equal(controller.observeFrame(frame), true, "a later frame event may start a fresh schedule");
    assert.deepEqual(timers.pending(), [10]);
  }

  {
    // Frames without a conversation, New Chat resets, and named desks are never probed.
    const { controller, timers } = harness({ createController });
    assert.equal(controller.observeFrame(fakeFrame({ currentHref: "https://grok.com/" })), false, "app home is not a conversation");
    assert.equal(controller.observeFrame(fakeFrame({ currentHref: "https://chatgpt.com/" })), false);
    assert.equal(controller.observeFrame(fakeFrame()), false);
    assert.equal(controller.observeFrame(null), false);
    const resetting = fakeFrame({ currentHref: "https://grok.com/c/abc123" });
    markFrameNewChatPending(resetting);
    assert.equal(controller.observeFrame(resetting), false, "a frame heading to New Chat home is not probed");
    clearFrameNewChatPending(resetting);
    assert.equal(controller.observeFrame(resetting), true);
    assert.deepEqual(timers.pending(), [10]);
    markFrameNewChatPending(resetting);
    assert.equal(controller.observeFrame(resetting), false, "New Chat cancels a scheduled probe");
    assert.deepEqual(timers.pending(), []);
    const named = harness({ createController, topicTitle: { canAutoGenerate: () => false } });
    assert.equal(named.controller.observeFrame(fakeFrame({ currentHref: "https://grok.com/c/abc123" })), false, "a titled desk is never renamed");
  }

  {
    // A probe answer for a conversation the frame has left is discarded.
    const { controller, timers, state } = harness({
      createController,
      responses: {
        getPageMeta: { href: "https://grok.com/c/other", title: "Other thread - Grok" },
        getConversationOpening: { ok: true, href: "https://grok.com/c/other", openingText: "other question" }
      }
    });
    const frame = fakeFrame({ currentHref: "https://grok.com/c/abc123" });
    controller.observeFrame(frame);
    await timers.fire();
    assert.equal(state.title, "", "a title reported for another conversation is not adopted");
    assert.deepEqual(state.generated, []);
    assert.deepEqual(timers.pending(), [20], "the probe retries for the conversation the frame still shows");
  }

  {
    // Navigating the frame to another conversation restarts the schedule for the new one.
    const seen = [];
    const { controller, timers, state } = harness({
      createController,
      responses: {
        getPageMeta: (iframe) => {
          seen.push(iframe.dataset.currentHref);
          return { href: iframe.dataset.currentHref, title: `${iframe.dataset.currentHref.split("/").pop()} title - Grok` };
        }
      }
    });
    const frame = fakeFrame({ currentHref: "https://grok.com/c/first" });
    controller.observeFrame(frame);
    frame.dataset.currentHref = "https://grok.com/c/second";
    assert.equal(controller.observeFrame(frame), true);
    assert.deepEqual(timers.pending(), [10], "the stale schedule is replaced, not stacked");
    await timers.fire();
    assert.deepEqual(seen, ["https://grok.com/c/second"]);
    assert.equal(state.title, "second title");
  }

  {
    // New Chat rebinds the page to another workspace id while a probe is in flight: drop it.
    let currentWorkspace = "page-aaaaaaaaaaaa";
    const { controller, timers, state } = harness({
      createController,
      workspaceId: () => currentWorkspace,
      responses: {
        getPageMeta: () => {
          currentWorkspace = "page-bbbbbbbbbbbb";
          return { href: "https://grok.com/c/abc123", title: "Kyoto trip - Grok" };
        }
      }
    });
    const frame = fakeFrame({ currentHref: "https://grok.com/c/abc123" });
    controller.observeFrame(frame);
    await timers.fire();
    assert.equal(state.title, "", "a title for the previous workspace id must not land on the rebound desk");
    assert.equal(controller.isObserving(frame), false);
    assert.deepEqual(timers.pending(), []);
  }

  {
    // A late generator result is dropped when the frame moved on meanwhile.
    let releaseGenerate;
    const generateGate = new Promise((resolve) => { releaseGenerate = resolve; });
    const { controller, timers, state, topicTitle } = harness({
      createController,
      responses: {
        getPageMeta: { href: "https://grok.com/c/abc123", title: "Grok" },
        getConversationOpening: { ok: true, href: "https://grok.com/c/abc123", openingText: "slow question" }
      },
      topicTitle: {
        async maybeGenerateFromPrompt(prompt, { stillWanted = () => true } = {}) {
          await generateGate;
          if (!stillWanted()) return "";
          state.title = `Generated: ${prompt}`;
          return state.title;
        }
      }
    });
    const frame = fakeFrame({ currentHref: "https://grok.com/c/abc123" });
    controller.observeFrame(frame);
    const firing = timers.fire();
    await settle();
    frame.dataset.currentHref = "https://grok.com/";
    releaseGenerate();
    await firing;
    await settle();
    assert.equal(state.title, "", "the generated title must not be applied to a frame that left the conversation");
    assert.equal(topicTitle.canAutoGenerate(), true);
    assert.equal(controller.isObserving(frame), false);
  }

  {
    // While the composer prompt is still being turned into a title, the probe waits instead of racing it.
    let generating = true;
    const { controller, timers, sends, state } = harness({
      createController,
      topicTitle: { isGenerating: () => generating },
      responses: { getPageMeta: { href: "https://grok.com/c/abc123", title: "Kyoto trip - Grok" } }
    });
    const frame = fakeFrame({ currentHref: "https://grok.com/c/abc123" });
    controller.observeFrame(frame);
    await timers.fire();
    assert.deepEqual(sends, [], "no probe is sent while a composer title is in flight");
    assert.deepEqual(timers.pending(), [20], "the attempt is deferred, not consumed");
    generating = false;
    await timers.fire();
    assert.equal(state.title, "Kyoto trip");
  }

  {
    // Transport failures are tolerated and retried; dispose() clears everything.
    const { controller, timers, state } = harness({
      createController,
      responses: {
        getPageMeta: new Error("NOT_REGISTERED"),
        getConversationOpening: new Error("TIMEOUT")
      }
    });
    const first = fakeFrame({ currentHref: "https://grok.com/c/one" });
    const second = fakeFrame({ currentHref: "https://kagi.com/assistant/thread-2", appId: "kagi" });
    assert.equal(controller.observeFrames([first, second, fakeFrame()]), 2);
    await timers.fire();
    assert.equal(state.title, "");
    assert.equal(timers.pending().length, 2);
    controller.dispose();
    assert.deepEqual(timers.pending(), []);
    assert.equal(controller.isObserving(first), false);
    assert.equal(controller.isObserving(second), false);
  }

  {
    // A site without a Message Navigator config only gets the document-title path.
    const { controller, timers, sends, state } = harness({
      createController,
      probeConfig: () => null,
      responses: { getPageMeta: { href: "https://example.com/chat/9", title: "Example" } }
    });
    const frame = fakeFrame({ currentHref: "https://example.com/chat/9", appId: "example" });
    controller.observeFrame(frame);
    await timers.fire();
    assert.deepEqual(sends.map((send) => send.action), ["getPageMeta"], "no navigator config means no conversation probe");
    assert.equal(state.title, "", "the custom app's own name is not a conversation title");
  }

  {
    // Notion conversations live in the query string; the probe keys on the full href.
    const { controller, timers, state } = harness({
      createController,
      responses: { getPageMeta: { href: "https://app.notion.com/chat?t=thread-1", title: "Roadmap review | Notion" } }
    });
    const frame = fakeFrame({ currentHref: "https://app.notion.com/chat?t=thread-1", appId: "notion" });
    assert.equal(controller.observeFrame(frame), true);
    await timers.fire();
    assert.equal(state.title, "Roadmap review");
  }

  assert.equal(openingPromptFromPocketEntries([]), "");
  assert.equal(openingPromptFromPocketEntries(null), "");
  assert.equal(openingPromptFromPocketEntries([{ userMessage: "   " }, { userMessage: "  Plan   a trip\nto Kyoto " }]), "Plan a trip to Kyoto");
  assert.ok(openingPromptFromPocketEntries([{ userMessage: "x".repeat(5000) }]).length <= 720);

  console.log("workspace auto title: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
