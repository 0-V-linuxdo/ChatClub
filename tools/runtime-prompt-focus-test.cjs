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
assert.match(composerSource, /onfocus:e=>!document\.documentElement\.dataset\.p&&expandInput\(e\.target\)/);
assert.match(functionSource(composerSource, "handlePointerDown"), /if \(inputNode\.value\)/);
assert.match(focusControllerSource, /event\.type === "pointerdown" \|\| \(event\.type === "keydown"/);
assert.match(focusControllerSource, /isFrameTarget\(document\.activeElement\)/);
assert.match(focusControllerSource, /isFrameTarget\(event\?\.target\)/);
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
    querySelector() { return prompt; }
  };
  const window = {
    addEventListener(type, listener) { listeners.set(type, listener); }
  };
  const context = vm.createContext({
    Date,
    document,
    globalThis: undefined,
    Node: MockNode,
    setTimeout(callback) { timers.push(callback); return timers.length; },
    window,
    isOptionsPage: options
  });
  context.globalThis = context;
  vm.runInContext(executableSource, context);
  return { context, document, listeners, prompt, promptChild, body, timers, window };
}

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
assert.equal(focusCalls, 2, "iframe focusin must not steal a later copy or caret click");
workspace.document.activeElement = iframe;
workspace.listeners.get("load")({ target: iframe });
workspace.timers.at(-1)?.();
assert.equal(focusCalls, 3, "iframe load must still restore prompt focus");
workspace.document.activeElement = workspace.prompt;
assert.doesNotThrow(
  () => workspace.listeners.get("focus")({ target: workspace.window }),
  "a non-Node Window focus target must not be passed to Node.contains"
);
workspace.timers.shift()?.();
assert.equal(focusCalls, 4, "regaining the top-level window must restart prompt focus without waiting for an iframe event");

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

const optionsContext = makeContext({ options: true });
optionsContext.context.createPromptFocusController({ isOptionsPage: true, focusInput() {} });
assert.equal(optionsContext.document.documentElement.dataset.p, undefined, "the options page must not install a workspace focus lock");

console.log("runtime prompt focus isolation tests passed");
