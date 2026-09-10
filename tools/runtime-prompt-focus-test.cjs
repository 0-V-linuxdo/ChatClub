#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { functionSource } = require("./function-source.cjs");

const root = path.resolve(__dirname, "..");
const runtime = fs.readFileSync(path.join(root, "app/runtime.js"), "utf8");
const focusControllerSource = fs.readFileSync(path.join(root, "app/prompt-focus/controller.js"), "utf8");
const composerSource = fs.readFileSync(path.join(root, "app/composer/controller.js"), "utf8");
const frameController = fs.readFileSync(path.join(root, "app/workspace/frame-controller.js"), "utf8");
const viewController = fs.readFileSync(path.join(root, "app/workspace/view-controller.js"), "utf8");
const chatclubCss = fs.readFileSync(path.join(root, "styles/chatclub.css"), "utf8");
const render = functionSource(runtime, "render");
const init = functionSource(runtime, "init", true);

assert.match(runtime, /import\("\.\/prompt-focus\/controller\.js"\)/);
assert.ok(
  render.indexOf("syncTopbar();") < render.indexOf("workspaceController.syncWorkspaceIsland(shell);"),
  "the workspace iframe elements must be isolated after the topbar is rendered"
);
assert.ok(
  init.indexOf("await promptFocusPromise;") < init.indexOf("render();"),
  "iframe construction must wait until the prompt focus controller is installed"
);
assert.match(composerSource, /claimPromptCaret\(e\.target\)/);
assert.match(composerSource, /composer: true/);
assert.match(composerSource, /mode: "overlay"/);
assert.doesNotMatch(composerSource, /mode: "page"/);
assert.match(composerSource, /claimOverlaySearchCaret/);
assert.match(functionSource(composerSource, "handlePointerDown"), /if \(inputNode\.value\)/);
assert.match(focusControllerSource, /event\.type === "pointerdown" \|\| \(event\.type === "keydown"/);
assert.match(focusControllerSource, /isOverlayTarget\(document\.activeElement\)/);
assert.match(focusControllerSource, /isOverlayTarget\(event\?\.target\)/);
assert.match(focusControllerSource, /contains\?\.\("modal"\)/);
assert.match(focusControllerSource, /workspace-tabs-sidebar-search-input/);
assert.match(focusControllerSource, /document\.querySelector\("\.modal"\)/);
assert.match(frameController, /document\.documentElement\.dataset\.p/);
assert.match(viewController, /inert: true/);
assert.match(viewController, /tabindex: "-1"/);
assert.match(chatclubCss, /\.prompt-input:not\(\.prompt-input-expanded\):focus\s*\{[\s\S]*caret-color: var\(--text\)/);
assert.match(chatclubCss, /\.prompt-collapsed-preview\s*\{[\s\S]*?pointer-events:\s*none;/);
assert.match(focusControllerSource, /\["focus", "focusin"\]/);

const executableSource = focusControllerSource
  .replace('import { FRAME_USER_INTENT_POST_MESSAGE_SOURCE } from "../../shared/protocol.js";\n\n', '')
  .replace("export function createPromptFocusController", "function createPromptFocusController")
  .replace("export function installPromptFocusController", "function installPromptFocusController")
  .concat("\nglobalThis.createPromptFocusController = createPromptFocusController;\n");

class MockNode {}

function makeContext({ options = false } = {}) {
  const prompt = Object.assign(new MockNode(), {
    isConnected: true,
    contains(target) {
      if (!(target instanceof MockNode)) throw new TypeError("parameter 1 is not of type 'Node'");
      return target === this || target.parentNode === this;
    }
  });
  const promptChild = Object.assign(new MockNode(), { parentNode: prompt });
  const body = {};
  const documentElement = { dataset: {} };
  const listeners = new Map();
  const timers = [];
  const document = {
    activeElement: body,
    body,
    documentElement,
    querySelector(selector) {
      if (!selector || selector === ".prompt-input") return prompt;
      return null;
    }
  };
  const window = {
    addEventListener(type, listener) { listeners.set(type, listener); }
  };
  // The controller only reads `Date.now()`; a controllable clock lets the tests step across the
  // chat-frame pointer report grace and the 1 s recent-pointer window deterministically.
  const clock = {
    now: 10_000,
    advance(ms) { clock.now += ms; }
  };
  const context = vm.createContext({
    Date: { now: () => clock.now },
    document,
    globalThis: undefined,
    Node: MockNode,
    setTimeout(callback) { timers.push(callback); return timers.length; },
    window,
    isOptionsPage: options
  });
  context.globalThis = context;
  vm.runInContext(executableSource, context);
  return { clock, context, document, listeners, prompt, promptChild, body, timers, window };
}

const INITIAL_PROMPT_FOCUS_RESTORE_MS = 50;
const CHAT_FRAME_POINTER_EVENT = "chatclub:chat-frame-pointer";
const CHAT_FRAME_POINTER_REPORT_GRACE_MS = 120;
assert.match(focusControllerSource, /const INITIAL_PROMPT_FOCUS_RESTORE_MS = 50;/);
assert.match(focusControllerSource, /const CHAT_FRAME_POINTER_EVENT = "chatclub:chat-frame-pointer";/);
assert.match(focusControllerSource, /const CHAT_FRAME_POINTER_REPORT_GRACE_MS = 120;/);
assert.match(focusControllerSource, /window\.addEventListener\(CHAT_FRAME_POINTER_EVENT, onFramePointerReport\)/);
assert.match(runtime, /ensureChatFramePointerReports\(\);\nconst promptFocusPromise/, "the chat-frame pointer report listeners must be installed before the prompt focus controller");

const workspace = makeContext();
let focusCalls = 0;
const controller = workspace.context.createPromptFocusController({
  isOptionsPage: false,
  focusInput() {
    focusCalls += 1;
    workspace.document.activeElement = workspace.prompt;
  }
});
assert.equal(workspace.document.documentElement.dataset.p, "1", "workspace bootstrap must publish the iframe focus lock");
controller.focusInitialPromptInput();
assert.equal(focusCalls, 1, "workspace bootstrap must focus the top prompt");
assert.equal(workspace.document.activeElement, workspace.prompt);

const iframe = Object.assign(new MockNode(), {
  classList: { contains(name) { return name === "chat-frame"; } }
});
workspace.document.activeElement = iframe;
controller.focusInitialPromptInput();
assert.equal(focusCalls, 2, "an automatic iframe focus must be pulled back to the prompt");
workspace.document.activeElement = iframe;
workspace.listeners.get("focusin")({ target: iframe });
workspace.timers.shift()?.();
assert.equal(focusCalls, 2, "focus entering a chat-frame must first wait for the child pointer report");
workspace.clock.advance(CHAT_FRAME_POINTER_REPORT_GRACE_MS - 1);
workspace.listeners.get("focusin")({ target: iframe });
workspace.timers.shift()?.();
assert.equal(focusCalls, 2, "the report grace must cover the whole window, not only the first restore tick");
workspace.clock.advance(1);
workspace.listeners.get("focusin")({ target: iframe });
workspace.timers.shift()?.();
assert.equal(focusCalls, 3, "an unreported iframe focus must return the caret to the prompt once the grace ends");
assert.equal(workspace.document.activeElement, workspace.prompt);
workspace.document.activeElement = iframe;
workspace.listeners.get("focusin")({ target: iframe });
workspace.timers.shift()?.();
assert.equal(focusCalls, 3, "a fresh frame focus after a reclaim must start a new grace instead of reusing the expired one");
workspace.clock.advance(CHAT_FRAME_POINTER_REPORT_GRACE_MS);
workspace.listeners.get("focusin")({ target: iframe });
workspace.timers.shift()?.();
assert.equal(focusCalls, 4, "the renewed grace must still end in a reclaim without a report");
const modalInput = Object.assign(new MockNode(), {
  classList: { contains(name) { return name === "modal"; } }
});
workspace.document.activeElement = modalInput;
workspace.listeners.get("focusin")({ target: modalInput });
workspace.timers.shift()?.();
assert.equal(focusCalls, 4, "typed modal focus must not be pulled back to the prompt");
workspace.document.activeElement = iframe;
workspace.listeners.get("load")({ target: iframe });
workspace.timers.at(-1)?.();
assert.equal(focusCalls, 5, "iframe load must still restore prompt focus");
{
  const modalLoad = makeContext();
  let modalFocusCalls = 0;
  const modalNode = Object.assign(new MockNode(), {
    classList: { contains(name) { return name === "modal"; } }
  });
  modalLoad.document.querySelector = (selector) => {
    if (!selector || selector === ".prompt-input") return modalLoad.prompt;
    if (String(selector).includes(".modal")) return modalNode;
    return null;
  };
  const modalController = modalLoad.context.createPromptFocusController({
    focusInput() {
      modalFocusCalls += 1;
      modalLoad.document.activeElement = modalLoad.prompt;
    }
  });
  modalController.focusInitialPromptInput();
  const afterModalInit = modalFocusCalls;
  const modalFrame = Object.assign(new MockNode(), {
    classList: { contains(name) { return name === "chat-frame"; } }
  });
  modalLoad.document.activeElement = modalFrame;
  modalLoad.listeners.get("load")({ target: modalFrame });
  modalLoad.timers.at(-1)?.();
  assert.equal(modalFocusCalls, afterModalInit, "iframe load must not restore prompt focus while a typed modal is open");
}
workspace.document.activeElement = workspace.prompt;
assert.doesNotThrow(
  () => workspace.listeners.get("focus")({ target: workspace.window }),
  "a non-Node Window focus target must not be passed to Node.contains"
);
workspace.timers.shift()?.();
assert.equal(focusCalls, 6, "regaining the top-level window must restart prompt focus without waiting for an iframe event");

workspace.listeners.get("pointerdown")({ isTrusted: true, type: "pointerdown", target: workspace.promptChild });
assert.equal(workspace.document.documentElement.dataset.p, undefined, "a prompt click must end the initial iframe focus lock");
const afterPromptClick = focusCalls;
workspace.document.activeElement = iframe;
workspace.listeners.get("focusin")({ target: iframe });
workspace.timers.shift()?.();
assert.equal(focusCalls, afterPromptClick, "iframe focus after a prompt click must not steal the caret back");
controller.focusInitialPromptInput();
assert.equal(focusCalls, afterPromptClick, "automatic focus restoration must stop after user interaction");

const outsideRelease = makeContext();
outsideRelease.context.createPromptFocusController({ focusInput() {} });
outsideRelease.listeners.get("pointerdown")({ isTrusted: true, type: "pointerdown", target: new MockNode() });
assert.equal(outsideRelease.document.documentElement.dataset.p, undefined, "trusted top-level interaction must release the lock");

const iframeInteraction = makeContext();
let iframeFocusCalls = 0;
const iframeController = iframeInteraction.context.createPromptFocusController({
  focusInput() { iframeFocusCalls += 1; }
});
iframeInteraction.listeners.get("pointerdown")({ isTrusted: true, type: "pointerdown", target: iframe });
iframeController.focusInitialPromptInput();
assert.equal(iframeFocusCalls, 0, "manual iframe interaction must be able to take focus");

{
  // 2026-09-10 Arc report: the user's first interaction on a fresh page was a click inside a
  // site-isolated chat-frame. The parent never sees that pointerdown; focus moves to the frame and
  // the child shield reports the click 1–40 ms later. The 50 ms restore loop used to refocus the
  // prompt in between, so the caret "came back" to the composer.
  const fresh = makeContext();
  let freshFocusCalls = 0;
  const freshController = fresh.context.createPromptFocusController({
    focusInput() {
      freshFocusCalls += 1;
      fresh.document.activeElement = fresh.prompt;
    }
  });
  freshController.focusInitialPromptInput();
  assert.equal(freshFocusCalls, 1);
  assert.equal(fresh.document.documentElement.dataset.p, "1");
  const freshFrame = Object.assign(new MockNode(), {
    classList: { contains(name) { return name === "chat-frame"; } }
  });
  fresh.document.activeElement = freshFrame;
  fresh.listeners.get("focusin")({ target: freshFrame });
  fresh.timers.shift()?.();
  fresh.clock.advance(INITIAL_PROMPT_FOCUS_RESTORE_MS);
  fresh.timers.shift()?.();
  assert.equal(freshFocusCalls, 1, "the restore loop must not refocus the prompt while the child pointer report can still land");
  assert.equal(fresh.document.activeElement, freshFrame);
  fresh.clock.advance(40);
  assert.ok(typeof fresh.listeners.get(CHAT_FRAME_POINTER_EVENT) === "function", "the controller must listen for the re-dispatched chat-frame pointer report");
  fresh.listeners.get(CHAT_FRAME_POINTER_EVENT)({ type: CHAT_FRAME_POINTER_EVENT, detail: { frame: freshFrame } });
  assert.equal(fresh.document.documentElement.dataset.p, undefined, "a reported chat-frame click must end the initial focus lock like a wrap pointerdown");
  fresh.clock.advance(CHAT_FRAME_POINTER_REPORT_GRACE_MS * 4);
  while (fresh.timers.length) fresh.timers.shift()?.();
  fresh.listeners.get("focusin")({ target: freshFrame });
  while (fresh.timers.length) fresh.timers.shift()?.();
  fresh.listeners.get("load")({ target: freshFrame });
  while (fresh.timers.length) fresh.timers.shift()?.();
  freshController.focusInitialPromptInput();
  assert.equal(freshFocusCalls, 1, "after the reported click nothing may pull the caret back to the prompt");
  assert.equal(fresh.document.activeElement, freshFrame);
}

{
  // A report that arrives while the frame `load` restore is pending must also win: the load handler
  // checks the recent-pointer window when it fires, not when it was scheduled.
  const late = makeContext();
  let lateFocusCalls = 0;
  const lateController = late.context.createPromptFocusController({
    focusInput() {
      lateFocusCalls += 1;
      late.document.activeElement = late.prompt;
    }
  });
  lateController.focusInitialPromptInput();
  const lateFrame = Object.assign(new MockNode(), {
    classList: { contains(name) { return name === "chat-frame"; } }
  });
  late.document.activeElement = lateFrame;
  late.listeners.get("load")({ target: lateFrame });
  late.listeners.get(CHAT_FRAME_POINTER_EVENT)({ type: CHAT_FRAME_POINTER_EVENT, detail: { frame: lateFrame } });
  while (late.timers.length) late.timers.shift()?.();
  assert.equal(lateFocusCalls, 1, "a frame load right after the reported click must not restore prompt focus");
  assert.equal(late.document.activeElement, lateFrame);
}

{
  // The report is only meaningful while the lock is pending; afterwards it is a no-op.
  const released = makeContext();
  released.context.createPromptFocusController({ focusInput() {} });
  released.listeners.get("pointerdown")({ isTrusted: true, type: "pointerdown", target: new MockNode() });
  assert.equal(released.document.documentElement.dataset.p, undefined);
  assert.doesNotThrow(() => released.listeners.get(CHAT_FRAME_POINTER_EVENT)({ type: CHAT_FRAME_POINTER_EVENT, detail: {} }));
  assert.equal(released.document.documentElement.dataset.p, undefined);
}

const optionsContext = makeContext({ options: true });
optionsContext.context.createPromptFocusController({ isOptionsPage: true, focusInput() {} });
assert.equal(optionsContext.document.documentElement.dataset.p, undefined, "the options page must not install a workspace focus lock");

console.log("runtime prompt focus isolation tests passed");
