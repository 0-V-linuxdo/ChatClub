#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const main = `${read("app/main.js")}\n${read("app/runtime.js")}`;
const topbar = read("app/topbar/controller.js");
const workspaceFrame = read("app/workspace/frame-controller.js");
const topicDelete = read("app/topic-delete/runtime.js");
const serviceWorker = `${read("background/service-worker.js")}\n${read("background/runtime.js")}`;
const serviceWorkerCode = serviceWorker.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
const trustedInput = read("background/trusted-input.js");
const contentScriptRegistration = read("background/content-script-registration.js");
const contentInjection = read("background/content-registration.js");
const state = read("app/state.js");
const statePort = read("app/state/port.js");
const featureStatePolicies = [
  "app/composer/state-port.js",
  "app/preferred-model/state-port.js",
  "app/topbar/state-port.js",
  "app/favicon/state-port.js",
  "app/workspace/state-port.js",
  "app/settings/state-ports.js"
].map(read).join("\n");
const storageSchema = read("shared/storage-schema.js");
const storageConfigBundle = read("shared/storage-config-bundle.js");
const storageAdapter = read("shared/storage-adapter.js");
const domPrimitives = read("ui/dom.js");
const frameToast = read("ui/frame-toast.js");
const fileIo = read("ui/file-io.js");

for (const source of [main, workspaceFrame]) {
  assert.doesNotMatch(source, /function topicDeleteTrusted(?:Click|Hover|MenuClick|KeySequence)/);
  assert.doesNotMatch(source, /function sendTopicDeleteToIframe/);
  assert.match(source, /executeTopicDelete\(/);
}
assert.match(topicDelete, /export function createTopicDeleteRuntime/);
assert.match(topicDelete, /import \{ createFrameRequest \} from "\.\.\/frame-request\.js"/);
assert.match(topicDelete, /createFrameRequest\(framePort, "Topic Delete runtime"\)/);
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
assert.match(contentScriptRegistration, /export async function registerContentScripts/);
assert.match(contentScriptRegistration, /rollbackContentScript/);
assert.doesNotMatch(contentInjection, /loadCustomConfig|loadOptions|contentScriptMatches|rollbackContentScript/);

assert.doesNotMatch(main, /from "\.\/settings\/controller\.js"/);
assert.doesNotMatch(main, /from "\.\/summary\/controller\.js"/);
assert.doesNotMatch(main, /from "\.\/pocket\/controller\.js"/);
assert.match(main, /import\("\.\/settings\/controller\.js"\)/);
assert.match(main, /import\("\.\/summary\/controller\.js"\)/);
assert.match(main, /import\("\.\/pocket\/controller\.js"\)/);
assert.match(main, /import \{ createAppState, createFeatureStatePorts \} from "\.\/state\.js"/);
assert.match(main, /const featureState = createFeatureStatePorts\(state\)/);
for (const statePort of [
  "./composer/state-port.js",
  "./preferred-model/state-port.js",
  "./topbar/state-port.js",
  "./favicon/state-port.js",
  "./workspace/state-port.js",
  "./summary/state-port.js",
  "./pocket/state-port.js",
  "./optimize/state-port.js",
  "./settings/state-ports.js"
]) {
  assert.doesNotMatch(main, new RegExp(`from "${statePort.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
}

assert.match(main, /createFrameBridgeController/);
assert.match(main, /createPreferredModelController/);
assert.match(main, /createTopbarController/);
assert.match(topbar, /createTopbarEditor/);
assert.doesNotMatch(main, /function prepareContentFrameRuntimeUncached/);
assert.doesNotMatch(main, /function applyPreferredModelToFrame/);
assert.doesNotMatch(main, /function preservePreferredModelForSubmissionNavigation/);
assert.doesNotMatch(main, /function handleTopbarEditPointerMove/);
assert.doesNotMatch(read("shared/frame-rpc.js"), /export let frameRuntimePort|configureFrameRuntimePort|export function sendToContentFrame/);

assert.match(state, /createFeatureStatePorts/);
assert.ok(state.split(/\r?\n/).length < 100, "app/state.js must remain the thin canonical feature-state assembly");
assert.match(statePort, /read:\s*Object\.freeze/);
assert.match(statePort, /write:\s*Object\.freeze/);
assert.match(statePort, /readonlyStateValue/);
assert.match(featureStatePolicies, /COMPOSER_STATE_ACCESS/);
assert.match(featureStatePolicies, /WORKSPACE_STATE_ACCESS/);
assert.match(featureStatePolicies, /SETTINGS_SECTION_STATE_ACCESS/);
assert.doesNotMatch(
  read("app/settings/state-ports.js"),
  /export const (?:COMPOSER|PREFERRED_MODEL|TOPBAR|FAVICON)_STATE_ACCESS/,
  "Settings state policy must not duplicate feature-owned capability declarations"
);
for (const feature of ["workspace", "summary", "pocket", "optimize"]) {
  assert.match(main, new RegExp(`state: featureState\\.${feature}`));
}
assert.match(main, /settingsSections:\s*featureState\.settingsSections/);
assert.match(main, /saveOptionsPatch/);
assert.match(statePort, /cannot mutate app state/);

assert.doesNotMatch(storageSchema, /\bchrome\.|storageLocal(?:Get|Set)/);
assert.doesNotMatch(storageSchema, /exportConfigBundle|inspectImportedConfig|CONFIG_BUNDLE_KEYS/);
assert.match(storageConfigBundle, /export function exportConfigBundle/);
assert.match(storageConfigBundle, /export function inspectImportedConfig/);
assert.match(storageAdapter, /from "\.\/extension-api\.js"/);
assert.match(storageAdapter, /from "\.\/storage-schema\.js"/);
assert.match(storageAdapter, /from "\.\/storage-config-bundle\.js"/);
assert.doesNotMatch(domPrimitives, /FRAME_TOAST_POSITION_EVENT|FileReader|createObjectURL/);
assert.match(frameToast, /document\.addEventListener\(FRAME_TOAST_POSITION_EVENT/);
assert.match(fileIo, /new FileReader\(\)/);

for (const directory of ["app", "background", "shared"]) {
  const stack = [path.join(root, directory)];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile() && entry.name.endsWith(".js")) {
        assert.doesNotMatch(fs.readFileSync(absolute, "utf8"), /from ["'](?:\.\.\/)*shared\/storage\.js["']|from ["']\.\/storage\.js["']/);
      }
    }
  }
}

console.log("architecture boundaries: ok");
