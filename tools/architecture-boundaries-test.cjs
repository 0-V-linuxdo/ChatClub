#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const main = `${read("app/main.js")}\n${read("app/runtime.js")}`;
const workspace = read("app/workspace/controller.js");
const topicDelete = read("app/topic-delete/runtime.js");
const serviceWorker = `${read("background/service-worker.js")}\n${read("background/runtime.js")}`;
const serviceWorkerCode = serviceWorker.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
const trustedInput = read("background/trusted-input.js");
const state = read("app/state.js");
const storageFacade = read("shared/storage.js");
const storageSchema = read("shared/storage-schema.js");
const storageAdapter = read("shared/storage-adapter.js");

for (const source of [main, workspace]) {
  assert.doesNotMatch(source, /function topicDeleteTrusted(?:Click|Hover|MenuClick|KeySequence)/);
  assert.doesNotMatch(source, /function sendTopicDeleteToIframe/);
  assert.match(source, /executeTopicDelete\(/);
}
assert.match(topicDelete, /export function createTopicDeleteRuntime/);
assert.match(topicDelete, /framePort\.request/);
assert.doesNotMatch(topicDelete, /from "\.\.\/\.\.\/shared\/frame-rpc\.js"/);
assert.doesNotMatch(topicDelete, /topicDeleteExecutionTail/);
assert.match(topicDelete, /trustedInputExecutionTail/);
assert.match(topicDelete, /withTrustedInputLock/);
assert.match(topicDelete, /return executeTopicDeleteNow/);
assert.match(topicDelete, /shiftKey: Boolean/);
assert.match(topicDelete, /backspace\|delete/);
assert.doesNotMatch(serviceWorker, /chrome\.debugger/);
assert.match(serviceWorker, /import \* as trustedInput from "\.\/trusted-input\.js"/);
assert.doesNotMatch(serviceWorkerCode, /\bimport\s*\(/);
assert.match(trustedInput, /api\.debugger\.sendCommand/);

assert.doesNotMatch(main, /from "\.\/settings\/controller\.js"/);
assert.doesNotMatch(main, /from "\.\/summary\/controller\.js"/);
assert.doesNotMatch(main, /from "\.\/pocket\/controller\.js"/);
assert.match(main, /import\("\.\/settings\/controller\.js"\)/);
assert.match(main, /import\("\.\/summary\/controller\.js"\)/);
assert.match(main, /import\("\.\/pocket\/controller\.js"\)/);
for (const statePort of [
  "./composer/state-port.js",
  "./preferred-model/state-port.js",
  "./topbar/state-port.js",
  "./favicon/state-port.js",
  "./settings/state-ports.js"
]) {
  assert.match(main, new RegExp(`from "${statePort.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
}

assert.match(main, /createFrameBridgeController/);
assert.match(main, /createPreferredModelController/);
assert.match(main, /createTopbarEditor/);
assert.doesNotMatch(main, /function prepareContentFrameRuntimeUncached/);
assert.doesNotMatch(main, /function applyPreferredModelToFrame/);
assert.doesNotMatch(main, /function preservePreferredModelForSubmissionNavigation/);
assert.doesNotMatch(main, /function handleTopbarEditPointerMove/);
assert.doesNotMatch(read("shared/frame-rpc.js"), /export let frameRuntimePort|configureFrameRuntimePort|export function sendToContentFrame/);

assert.match(state, /createFeatureStatePorts/);
assert.match(state, /read:\s*Object\.freeze/);
assert.match(state, /write:\s*Object\.freeze/);
assert.match(state, /readonlyStateValue/);
for (const feature of ["workspace", "summary", "pocket", "optimize", "settings"]) {
  assert.match(main, new RegExp(`state: featureState\\.${feature}`));
}
assert.match(state, /cannot mutate app state/);

assert.match(storageFacade, /export \* from "\.\/storage-schema\.js"/);
assert.match(storageFacade, /export \* from "\.\/storage-adapter\.js"/);
assert.doesNotMatch(storageSchema, /\bchrome\.|storageLocal(?:Get|Set)/);
assert.match(storageAdapter, /from "\.\/extension-api\.js"/);
assert.match(storageAdapter, /from "\.\/storage-schema\.js"/);

for (const directory of ["app", "background", "shared"]) {
  const stack = [path.join(root, directory)];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile() && entry.name.endsWith(".js") && absolute !== path.join(root, "shared/storage.js")) {
        assert.doesNotMatch(fs.readFileSync(absolute, "utf8"), /from ["'](?:\.\.\/)*shared\/storage\.js["']|from ["']\.\/storage\.js["']/);
      }
    }
  }
}

console.log("architecture boundaries: ok");
