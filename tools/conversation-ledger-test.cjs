#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function matchSimple(node, selector) {
  const sel = selector.trim();
  let match;
  if ((match = /^([a-z][a-z0-9-]*)$/i.exec(sel))) return node.tag === match[1].toLowerCase();
  if ((match = /^\.([\w-]+)$/.exec(sel))) return String(node.attrs.class || "").split(/\s+/).includes(match[1]);
  if ((match = /^\[([\w-]+)\]$/.exec(sel))) return node.attrs[match[1]] !== undefined;
  if ((match = /^\[([\w-]+)=['"]([^'"]*)['"]\]$/.exec(sel))) return node.attrs[match[1]] === match[2];
  if ((match = /^\[([\w-]+)\*=['"]([^'"]*)['"](\s+i)?\]$/.exec(sel))) {
    const value = node.attrs[match[1]];
    if (value === undefined) return false;
    return match[3] ? String(value).toLowerCase().includes(match[2].toLowerCase()) : String(value).includes(match[2]);
  }
  throw new Error(`unsupported selector in fake DOM: ${sel}`);
}

function matches(node, selector) {
  return node?.nodeType === 1 && selector.split(",").some((part) => matchSimple(node, part));
}

function textNode(value) {
  return { nodeType: 3, nodeValue: String(value), parentNode: null, get textContent() { return this.nodeValue; } };
}

function el(tag, attrs = {}, children = []) {
  const node = {
    nodeType: 1,
    tag,
    attrs,
    parentNode: null,
    childNodes: [],
    get textContent() {
      return this.childNodes.map((child) => child.textContent).join("");
    }
  };
  for (const child of children) append(node, typeof child === "string" ? textNode(child) : child);
  return node;
}

function append(parent, child) {
  child.parentNode = parent;
  parent.childNodes.push(child);
  return child;
}

function createClock() {
  let nowMs = 1_000_000;
  let nextId = 1;
  const timers = new Map();
  return {
    now: () => nowMs,
    setTimer(ms, callback) {
      const id = nextId++;
      timers.set(id, { at: nowMs + Math.max(0, ms), callback });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    advance(ms) {
      const target = nowMs + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((left, right) => left[1].at - right[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        nowMs = Math.max(nowMs, due[1].at);
        due[1].callback();
      }
      nowMs = target;
    },
    get pending() {
      return timers.size;
    }
  };
}

function createObserverClass() {
  const instances = [];
  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.connected = false;
      instances.push(this);
    }
    observe(target, options) {
      this.target = target;
      this.options = options;
      this.connected = true;
    }
    disconnect() {
      this.connected = false;
    }
  }
  return {
    FakeMutationObserver,
    instances,
    notify(target) {
      for (const observer of instances) if (observer.connected) observer.callback([{ target }]);
    }
  };
}

(async () => {
  const {
    CONVERSATION_LEDGER_TIMINGS,
    createConversationLedger,
    ledgerTurnText
  } = await import(pathToFileURL(path.join(root, "content-src/shared/conversation-ledger.js")).href);
  const {
    idleDisconnectMs: CONVERSATION_LEDGER_IDLE_DISCONNECT_MS,
    maxDirtyMs: CONVERSATION_LEDGER_MAX_DIRTY_MS,
    quietMs: CONVERSATION_LEDGER_QUIET_MS
  } = CONVERSATION_LEDGER_TIMINGS;
  assert.ok(CONVERSATION_LEDGER_TIMINGS.maxWaitMs < 60_000, "one long poll stays inside the Frame RPC clamp");
  const { FULLTEXT_LEDGER_VERSION } = await import(pathToFileURL(path.join(root, "shared/fulltext-ledger.js")).href);
  const { normalizeLedger } = await import(pathToFileURL(path.join(root, "app/summary/fulltext-decision.js")).href);
  const frameCommands = await import(pathToFileURL(path.join(root, "shared/frame-commands.js")).href);

  const spec = frameCommands.FRAME_COMMAND_SPECS.getConversationFingerprint;
  assert.equal(spec.capability, "base");
  assert.equal(spec.mutating, false);
  const cancelSpec = frameCommands.FRAME_COMMAND_SPECS.cancelSummaryCollection;
  assert.deepEqual([...cancelSpec.features], ["summary"]);
  assert.equal(cancelSpec.mutating, true);

  // Turn text: controls, chrome and noise never count.
  const turnText = (node) => ledgerTurnText(node, matches);
  const reply = el("div", {}, [
    el("span", { class: "sr-only" }, ["ChatGPT said:"]),
    el("p", {}, ["The answer is ", el("strong", {}, ["42"]), "."]),
    el("button", { "aria-label": "Copy" }, ["Copy"]),
    el("div", { role: "toolbar" }, [el("span", {}, ["Good response"])]),
    el("time", { datetime: "2026-09-28" }, ["3 minutes ago"]),
    el("span", {}, ["Thought for ", "12", " seconds"]),
    el("div", { contenteditable: "true" }, ["draft edit"]),
    el("svg", {}, [el("title", {}, ["icon"])])
  ]);
  assert.equal(turnText(reply), "The answer is 42 .");
  const liveRegion = el("div", {}, [el("div", { "aria-live": "polite" }, ["x".repeat(400)])]);
  assert.equal(turnText(liveRegion).length, 400, "a reply wrapped in a live region still counts");
  assert.equal(turnText(el("div", {}, [el("span", {}, ["刚刚"]), "你好"])), "你好");
  assert.equal(turnText(el("div", {}, [el("span", {}, ["已深度思考（用时 12 秒）"]), "答案"])), "答案");
  assert.equal(turnText(el("div", {}, ["ｆｕｌｌ　ｗｉｄｔｈ"])), "full width", "text is NFKC-normalized");

  // A ledger over fake turns.
  function createPage() {
    const turns = [
      el("article", { role: "user" }, ["Explain ChatClub idle capture"]),
      el("article", { role: "assistant" }, ["It records conversations."])
    ];
    const body = el("body", {}, turns);
    return { body, turns };
  }

  function setup(options = {}) {
    const clock = createClock();
    const observers = createObserverClass();
    const page = createPage();
    const state = {
      href: "https://chatgpt.com/c/abc",
      generating: false,
      idleMs: null,
      editable: false,
      atEnd: true,
      preferredGroups: [],
      pageText: ""
    };
    let pageHide = null;
    const ledger = createConversationLedger({
      documentId: "doc-1",
      ledgerId: "L1",
      listTurns: (preferred) => {
        state.preferredGroups.push(preferred);
        return { nodes: page.turns.filter((turn) => page.body.childNodes.includes(turn)), group: 0 };
      },
      turnRole: (node) => node.attrs.role || "",
      isGenerating: () => state.generating,
      matches,
      locationHref: () => state.href,
      pageTextSample: () => state.pageText,
      inputIdleMs: () => state.idleMs,
      editableFocused: () => state.editable,
      viewportAtEnd: () => state.atEnd,
      observeTarget: () => page.body,
      onPageHide: (handler) => {
        pageHide = handler;
        return () => { pageHide = null; };
      },
      MutationObserver: observers.FakeMutationObserver,
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      ...options
    });
    const mutate = (turn, text) => {
      const node = turn.childNodes[0];
      node.nodeValue = text;
      observers.notify(node);
    };
    return { clock, observers, page, state, ledger, mutate, firePageHide: () => pageHide?.() };
  }

  {
    const { clock, observers, page, state, ledger, mutate } = setup();
    const first = await ledger.whenChanged({});
    assert.equal(first.ledgerVersion, FULLTEXT_LEDGER_VERSION);
    assert.ok(normalizeLedger(first), "the parent accepts the answer");
    assert.equal(first.conversationKey, "chatgpt:abc");
    assert.equal(first.granularity, "turns");
    assert.equal(first.turnCount, 2);
    assert.equal(first.hasPair, true);
    assert.equal(first.tail.length, 2);
    assert.match(first.digest, /^[0-9a-f]{16}$/);
    assert.equal(first.lastUser.head, "Explain ChatClub idle capture");
    assert.deepEqual(first.input, { seen: false, idleMs: null, editing: false, at: clock.now() }, "a frame nobody touched reports no input, not busy");
    assert.equal(first.generatingSeenAgoMs, null);
    assert.equal(first.stableForMs, 0, "the first answer does not claim a history it never saw");
    assert.equal(observers.instances.length, 1);
    assert.deepEqual(observers.instances[0].options.attributeFilter, ["aria-busy", "data-is-streaming"]);

    clock.advance(30_000);
    const again = await ledger.whenChanged({});
    assert.equal(again.revision, first.revision, "time passing is not a change");
    assert.equal(again.digest, first.digest);
    assert.equal(again.stableForMs, 30_000);
    assert.equal(state.preferredGroups.at(-1), 0, "the ledger asks for the group that yielded turns");

    // Long poll: answers at the deadline with a fresh ledger when nothing changed.
    const since = { ledgerId: again.ledgerId, revision: again.revision, conversationKey: again.conversationKey };
    let settled = null;
    ledger.whenChanged({ waitMs: 10_000, since }).then((value) => { settled = value; });
    clock.advance(9_999);
    await Promise.resolve();
    assert.equal(settled, null);
    clock.advance(1);
    await Promise.resolve();
    assert.equal(settled.revision, again.revision);
    assert.equal(settled.stableForMs, 40_000);

    // Long poll: answers after the quiet window once a mutation changed the ledger.
    settled = null;
    ledger.whenChanged({ waitMs: 20_000, since }).then((value) => { settled = value; });
    mutate(page.turns[1], "It records conversations. And more.");
    clock.advance(CONVERSATION_LEDGER_QUIET_MS - 1);
    await Promise.resolve();
    assert.equal(settled, null, "a mutation burst is recomputed once it goes quiet");
    clock.advance(1);
    await Promise.resolve();
    assert.equal(settled.revision, again.revision + 1);
    assert.notEqual(settled.digest, again.digest);
    assert.equal(settled.stableForMs, 0);

    // Noise mutations that leave the turn text alone do not answer early.
    const noisy = { ledgerId: settled.ledgerId, revision: settled.revision, conversationKey: settled.conversationKey };
    let noiseAnswer = null;
    ledger.whenChanged({ waitMs: 20_000, since: noisy }).then((value) => { noiseAnswer = value; });
    const toolbar = append(page.turns[1], el("div", { role: "toolbar" }, [el("button", {}, ["Copied!"])]));
    observers.notify(toolbar);
    const stamp = append(page.turns[1], el("time", { datetime: "x" }, ["just now"]));
    observers.notify(stamp);
    clock.advance(CONVERSATION_LEDGER_QUIET_MS);
    await Promise.resolve();
    assert.equal(noiseAnswer, null, "hover toolbars and timestamps are not a change");
    clock.advance(20_000);
    await Promise.resolve();
    assert.equal(noiseAnswer.digest, settled.digest);

    // Continuous mutation still recomputes at least every MAX_DIRTY window.
    const since2 = { ledgerId: noiseAnswer.ledgerId, revision: noiseAnswer.revision, conversationKey: noiseAnswer.conversationKey };
    let streamed = null;
    const streamStartedAt = clock.now();
    ledger.whenChanged({ waitMs: 20_000, since: since2 }).then((value) => { streamed = value; });
    for (let step = 1; step <= 10; step += 1) {
      mutate(page.turns[1], `streaming ${step}`);
      clock.advance(500);
      await Promise.resolve();
      if (streamed) break;
    }
    assert.ok(streamed, "a page that never goes quiet still answers");
    assert.ok(clock.now() - streamStartedAt <= CONVERSATION_LEDGER_MAX_DIRTY_MS + 500, "continuous mutation is recomputed within the max-dirty window");
    assert.ok(clock.now() - streamStartedAt < 20_000, "and does not wait for the deadline");

    // Generating is part of the revision; the tail stays content-only.
    state.generating = true;
    const generating = await ledger.whenChanged({});
    assert.equal(generating.generating, true);
    assert.equal(generating.revision, streamed.revision + 1);
    state.generating = false;
    clock.advance(3_000);
    const finished = await ledger.whenChanged({});
    assert.equal(finished.generating, false);
    assert.equal(finished.generatingSeenAgoMs, 3_000);
    assert.equal(finished.digest, generating.digest);
  }

  {
    // Conversation changes, roles, prompts, input.
    const { page, state, ledger } = setup();
    const first = await ledger.whenChanged({ prompt: "Explain   ChatClub idle capture" });
    assert.equal(first.containsPrompt, true, "the prompt is matched on normalized text");
    state.href = "https://chatgpt.com/c/other";
    const moved = await ledger.whenChanged({});
    assert.equal(moved.conversationKey, "chatgpt:other");
    assert.equal(moved.revision, first.revision + 1);
    state.href = "https://chatgpt.com/";
    assert.equal((await ledger.whenChanged({})).conversationKey, "", "a start page has no conversation key");

    page.turns.forEach((turn) => { delete turn.attrs.role; });
    state.href = "https://example.com/chat/1";
    const blocks = await ledger.whenChanged({});
    assert.equal(blocks.granularity, "blocks");
    assert.equal(blocks.hasPair, false);
    assert.ok(blocks.tail.every((entry) => entry.startsWith("?:")));
    page.body.childNodes.length = 0;
    state.pageText = "Hello from the page text sample";
    const none = await ledger.whenChanged({ prompt: "from the page" });
    assert.equal(none.granularity, "none");
    assert.equal(none.digest, "");
    assert.equal(none.containsPrompt, true, "without turns the prompt falls back to the page text sample");

    state.idleMs = 2_000;
    state.editable = true;
    assert.deepEqual((await ledger.whenChanged({})).input.editing, true);
    state.idleMs = 60_000;
    assert.equal((await ledger.whenChanged({})).input.editing, false, "an autofocused composer the user left alone is not editing");
    assert.equal((await ledger.whenChanged({})).input.seen, true);
  }

  {
    // Lifecycle: stale since, pagehide, idle disconnect, dispose.
    const { clock, observers, ledger, firePageHide } = setup();
    const first = await ledger.whenChanged({});
    const other = await ledger.whenChanged({ waitMs: 10_000, since: { ledgerId: "someone-else", revision: first.revision, conversationKey: first.conversationKey } });
    assert.equal(other.revision, first.revision, "a since from another ledger instance answers at once");

    let hidden = null;
    ledger.whenChanged({ waitMs: 20_000, since: { ledgerId: first.ledgerId, revision: first.revision, conversationKey: first.conversationKey } })
      .then((value) => { hidden = value; });
    firePageHide();
    await Promise.resolve();
    assert.ok(hidden, "pagehide answers a pending poll");
    assert.equal(ledger.observing, false);
    await ledger.whenChanged({});
    assert.equal(ledger.observing, true, "the next request observes again");
    assert.equal(observers.instances.length, 2);

    clock.advance(CONVERSATION_LEDGER_IDLE_DISCONNECT_MS);
    assert.equal(ledger.observing, false, "an unused ledger stops observing");

    ledger.dispose();
    const afterDispose = await ledger.whenChanged({ waitMs: 20_000, since: { ledgerId: first.ledgerId, revision: first.revision, conversationKey: first.conversationKey } });
    assert.ok(afterDispose, "a disposed ledger still answers, without waiting");
    assert.equal(ledger.observing, false);
  }

  // Wiring.
  const content = read("content-src/content.js");
  assert.match(content, /getConversationFingerprint:\s*\(data\)\s*=>\s*conversationLedger\.whenChanged\(data\)/);
  assert.match(content, /from "\.\/shared\/conversation-ledger\.js"/);
  assert.match(content, /function activateContentGeneration\(\) \{[\s\S]*?installUserActivityTracking\(\);[\s\S]*?\n  \}/, "input tracking starts with the content generation, not the first probe");
  assert.match(content, /__CHATCLUB_CONVERSATION_LEDGER_CLEANUP__/, "a superseding generation disposes the previous ledger");
  assert.equal(fs.existsSync(path.join(root, "content-src/shared/conversation-observer.js")), false);
  const summaryRuntime = read("content-src/shared/summary-runtime.js");
  const turnGroup = summaryRuntime.match(/function conversationTurnGroup\(selector, nodes\) \{[\s\S]*?\n\}/);
  assert.ok(turnGroup);
  assert.match(turnGroup[0], /filter\(controlLayoutVisible\)/, "turn discovery must not drop opacity:0 turns");
  assert.match(summaryRuntime, /function collectConversationTurns\(preferredGroup = -1\)/);
  assert.match(summaryRuntime, /function conversationTurnsAreGenerating\(turns = \[\]\)/);
  assert.doesNotMatch(summaryRuntime, /function conversationFingerprint\b/);
  assert.doesNotMatch(summaryRuntime, /tailHash/);

  console.log("conversation ledger: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
