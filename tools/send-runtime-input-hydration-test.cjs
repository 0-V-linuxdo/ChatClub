#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

class FakeEvent {
  constructor(type, init = {}) {
    this.type = type;
    Object.assign(this, init);
  }
}

class FakeInput {
  get value() {
    return this._value || "";
  }

  set value(next) {
    this._value = String(next || "");
  }
}

class FakeTextArea extends FakeInput {
  constructor(scope, onMutation) {
    super();
    this.scope = scope;
    this.onMutation = onMutation;
  }

  get value() {
    return super.value;
  }

  set value(next) {
    this.onMutation?.("value");
    super.value = next;
  }

  closest(selector) {
    return selector === "form" ? this.scope : null;
  }

  dispatchEvent() {
    this.onMutation("input-event");
    return true;
  }

  focus() {
    this.onMutation("focus");
  }

  getBoundingClientRect() {
    return { left: 10, right: 610, top: 500, bottom: 550, width: 600, height: 50 };
  }

  setSelectionRange() {
    this.onMutation("selection");
  }
}

class FakeSearchInput extends FakeInput {
  constructor(onMutation) {
    super();
    this.onMutation = onMutation;
  }

  get value() {
    return super.value;
  }

  set value(next) {
    this.onMutation?.("value");
    super.value = next;
  }

  dispatchEvent() {
    this.onMutation("input-event");
    return true;
  }

  focus() {
    this.onMutation("focus");
  }

  getBoundingClientRect() {
    return { left: 20, right: 300, top: 80, bottom: 120, width: 280, height: 40 };
  }

  setSelectionRange() {
    this.onMutation("selection");
  }
}

function createScope() {
  return {
    querySelectorAll() {
      return [];
    }
  };
}

async function runHydrationCase(createSendCapability, {
  mountAfterMs = Infinity,
  deadlineAfterMs,
  initialComposerText = "",
  hideComposerAfterFirstMatch = false
}) {
  let now = 10_000;
  const startedAt = now;
  const scope = createScope();
  const mutations = [];
  const input = new FakeTextArea(scope, (type) => mutations.push({ type, at: now }));
  input._value = initialComposerText;
  const searchMutations = [];
  const searchInput = new FakeSearchInput((type) => searchMutations.push({ type, at: now }));
  const activations = [];
  const marks = [];
  const inputLookups = [];
  const searchLookups = [];
  let composerMatches = 0;
  const button = {
    click() {
      activations.push({ at: now, text: input.value });
    },
    focus() {},
    scrollIntoView() {},
    matches(selector) {
      return selector === "button[data-testid='send-button']" || selector === "button[type='submit']";
    },
    getAttribute(attribute) {
      if (attribute === "aria-label") return "Send";
      if (attribute === "data-testid") return "send-button";
      if (attribute === "type") return "submit";
      return "";
    },
    getBoundingClientRect() {
      return { left: 620, right: 660, top: 505, bottom: 545, width: 40, height: 40 };
    }
  };

  globalThis.document = {
    activeElement: null,
    body: scope,
    documentElement: scope,
    execCommand() { return true; }
  };
  globalThis.location = { hostname: "assistant.kagi.com", href: "https://assistant.kagi.com/" };
  globalThis.window = {};

  const realDateNow = Date.now;
  const realSetTimeout = globalThis.setTimeout;
  Date.now = () => now;
  globalThis.setTimeout = () => 0;
  try {
    const qsa = (selector, targetRoot) => {
      if (targetRoot === scope) return scope.querySelectorAll(selector);
      if (selector === "#composer") inputLookups.push(now);
      if ((selector === "#composer" || selector === "textarea") && now - startedAt >= mountAfterMs) {
        composerMatches += 1;
        if (!hideComposerAfterFirstMatch || composerMatches === 1) return [input];
      }
      if (selector === "input[type='text']") {
        searchLookups.push(now);
        return [searchInput];
      }
      if (selector === "#send" || /button\[data-testid='send-button'\]/.test(selector)) return [button];
      return [];
    };
    const capability = createSendCapability({
      qsa,
      visible: () => true,
      normalize: (value) => String(value || "").replace(/\s+/g, " ").trim(),
      isDisabledElement: () => false,
      sleep: async (ms) => { now += Math.max(1, Number(ms) || 1); },
      PROMPT_IMAGE_PASTE_STRATEGY_BATCH: "batch",
      buttonText: () => "Send",
      text: (target) => target.value,
      NOTION_SEND_PROMPT_SOURCE: "chatclub:notion-send-prompt:test",
      NOTION_SEND_PROMPT_EVENT: "chatclub-notion-send-prompt-test",
      NOTION_SEND_TEXT_SOURCE: "chatclub:notion-send-text:test",
      NOTION_SEND_TEXT_EVENT: "chatclub-notion-send-text-test",
      contentBridgeIsCurrent: () => true,
      markSubmissionNavigation: (...args) => { marks.push(args); return null; }
    });
    const result = await capability.sendText({
      sendId: `kagi-hydration-${mountAfterMs}`,
      deadlineAt: startedAt + deadlineAfterMs,
      appId: "Kagi",
      appName: "Kagi Assistant",
      inputSelector: "#composer",
      sendButtonSelector: "#send",
      text: "hydrated prompt",
      images: []
    });
    return { result, activations, inputLookups, marks, mutations, now, searchInput, searchLookups, searchMutations, startedAt };
  } finally {
    Date.now = realDateNow;
    globalThis.setTimeout = realSetTimeout;
  }
}

(async () => {
  globalThis.Event = FakeEvent;
  globalThis.InputEvent = FakeEvent;
  globalThis.KeyboardEvent = FakeEvent;
  globalThis.MouseEvent = FakeEvent;
  globalThis.HTMLInputElement = FakeInput;
  globalThis.HTMLTextAreaElement = FakeTextArea;

  const { createSendCapability } = await import(pathToFileURL(
    path.join(root, "content-src/capabilities/send-runtime.js")
  ).href);

  const hydrated = await runHydrationCase(createSendCapability, {
    mountAfterMs: 240,
    deadlineAfterMs: 2_000
  });
  assert.equal(hydrated.result.sent, true);
  assert.equal(hydrated.result.deliveryState, "sent");
  assert.ok(hydrated.inputLookups.length >= 3, "the first missing Kagi input must be polled until it mounts");
  assert.ok(hydrated.mutations.length > 0, "the mounted composer must receive the frozen prompt");
  assert.ok(hydrated.mutations.every(({ at }) => at >= hydrated.startedAt + 240), "input discovery must not mutate the DOM before the composer mounts");
  assert.equal(hydrated.searchInput.value, "", "the visible Kagi thread search must not receive prompt text");
  assert.deepEqual(hydrated.searchMutations, [], "the visible Kagi thread search must not be mutated");
  assert.deepEqual(hydrated.searchLookups, [], "Kagi input discovery must not use the generic text-input fallback");
  assert.equal(hydrated.activations.length, 1, "the hydrated composer must submit exactly once");
  assert.equal(hydrated.activations[0].text, "hydrated prompt");
  assert.ok(hydrated.activations[0].at >= hydrated.startedAt + 240 && hydrated.activations[0].at < hydrated.startedAt + 2_000);
  assert.equal(hydrated.marks.length, 1, "submission correlation must be armed once for the single activation");

  const requery = await runHydrationCase(createSendCapability, {
    mountAfterMs: 240,
    deadlineAfterMs: 2_000,
    initialComposerText: "stale composer text",
    hideComposerAfterFirstMatch: true
  });
  assert.equal(requery.result.sent, true);
  assert.equal(requery.activations.length, 1, "a Kagi composer requery must retain the original textarea");
  assert.equal(requery.activations[0].text, "hydrated prompt");
  assert.equal(requery.searchInput.value, "", "a Kagi requery must not substitute the visible thread search");
  assert.deepEqual(requery.searchMutations, [], "a Kagi requery must never mutate the thread search");
  assert.deepEqual(requery.searchLookups, [], "Kagi requeries must keep the text-input fallback disabled");

  const expired = await runHydrationCase(createSendCapability, {
    deadlineAfterMs: 360
  });
  assert.equal(expired.result.sent, false);
  assert.equal(expired.result.deliveryState, "not-sent", "missing input is a proven pre-activation failure");
  assert.equal(expired.result.reason, "Input element not found");
  assert.equal(expired.now, expired.startedAt + 360, "input polling must consume only the existing send deadline");
  assert.ok(expired.inputLookups.length >= 4, "the missing input must be checked through the deadline");
  assert.deepEqual(expired.mutations, [], "an absent composer must never be mutated");
  assert.equal(expired.searchInput.value, "", "deadline expiry must leave the Kagi thread search empty");
  assert.deepEqual(expired.searchMutations, [], "deadline expiry must not mutate the Kagi thread search");
  assert.deepEqual(expired.searchLookups, [], "deadline polling must never consider the Kagi thread search");
  assert.deepEqual(expired.activations, [], "deadline expiry must not activate submit");
  assert.deepEqual(expired.marks, [], "deadline expiry must not enter unknown-delivery state");

  console.log("send runtime input hydration: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
