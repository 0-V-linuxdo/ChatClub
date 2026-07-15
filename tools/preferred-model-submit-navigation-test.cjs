#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const mainSource = ["app/main.js", "app/runtime.js"]
  .map((file) => fs.readFileSync(path.join(root, file), "utf8"))
  .join("\n");
const preferredModelSource = fs.readFileSync(path.join(root, "app/preferred-model/controller.js"), "utf8");
const frameBridgeSource = fs.readFileSync(path.join(root, "app/frame-bridge/controller.js"), "utf8");
const parentSource = `${mainSource}\n${frameBridgeSource}`;
const contentSource = fs.readFileSync(path.join(root, "content/content.js"), "utf8");
const contentEntrySource = fs.readFileSync(path.join(root, "content-src/content.js"), "utf8");
const preloadSource = fs.readFileSync(path.join(root, "content/preload.js"), "utf8");
const preloadEntrySource = fs.readFileSync(path.join(root, "content-src/preload.js"), "utf8");
const workspaceSource = fs.readFileSync(path.join(root, "app/workspace/controller.js"), "utf8");
const frameCommandsSource = fs.readFileSync(path.join(root, "shared/frame-commands.js"), "utf8");
const protocolSource = fs.readFileSync(path.join(root, "shared/protocol.js"), "utf8");
const modelPreferenceConsoleSource = fs.readFileSync(path.join(root, "tools/model-preference-console-probe.js"), "utf8");

function protocolString(name) {
  const match = protocolSource.match(new RegExp(`export const ${name}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*")\\s*;`));
  assert.ok(match, `shared protocol must export ${name}`);
  return JSON.parse(match[1]);
}

function assertProtocolBinding(source, name, label) {
  assert.match(
    source,
    new RegExp(`(?:const|var)\\s+${name}\\d*\\s*=\\s*(?:PROTOCOL|protocol)\\.${name}\\s*;`),
    `${label} must consume ${name} from the bundled shared protocol`
  );
}

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const signatureEnd = source.indexOf(") {", start);
  const bodyStart = signatureEnd < 0 ? -1 : signatureEnd + 2;
  assert.notEqual(bodyStart, -1, `${name} must have a body`);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`${name} body did not close`);
}

const routeContext = vm.createContext({ URL });
vm.runInContext(
  `${functionSource(preferredModelSource, "preferredModelSubmissionRouteState")}; globalThis.routeState = preferredModelSubmissionRouteState;`,
  routeContext
);
const routeState = (appId, href) => JSON.parse(JSON.stringify(routeContext.routeState(appId, href)));

assert.deepEqual(routeState("Gemini", "https://gemini.google.com/app"), { host: "gemini.google.com", phase: "start" });
assert.deepEqual(routeState("Gemini", "https://gemini.google.com/app/conversation-1"), { host: "gemini.google.com", phase: "terminal", threadId: "conversation-1" });
assert.equal(routeState("Gemini", "https://gemini.google.com/gems"), null);
assert.deepEqual(routeState("NotionAI", "https://app.notion.com/ai"), { host: "app.notion.com", phase: "start" });
assert.deepEqual(routeState("NotionAI", "https://app.notion.com/chat"), { host: "app.notion.com", phase: "intermediate" });
assert.deepEqual(routeState("NotionAI", "https://app.notion.com/chat?t=thread-1"), { host: "app.notion.com", phase: "terminal", threadId: "thread-1" });
assert.equal(routeState("NotionAI", "https://app.notion.com/page/other"), null);

const leaseContext = vm.createContext({ URL, Date, clearTimeout() {} });
vm.runInContext(`
  const MODEL_PREFERENCE_APP_ID_ALIASES = Object.freeze({ Gemini: "Gemini", NotionAI: "NotionAI" });
  const preferredModelApplyRuns = new Map();
  var currentPreferredModelKey = "target:document-1";
  function preferredModelFrameKey() { return currentPreferredModelKey; }
  function schedulePreferredModelSubmissionNavigationExpiry(record) {
    record.expiryScheduleCount = (record.expiryScheduleCount || 0) + 1;
  }
  ${functionSource(preferredModelSource, "preferredModelSubmissionRouteState")}
  ${functionSource(preferredModelSource, "clearPreferredModelSubmissionNavigation")}
  ${functionSource(preferredModelSource, "preservePreferredModelForSubmissionNavigation")}
  globalThis.runs = preferredModelApplyRuns;
  globalThis.preserve = preservePreferredModelForSubmissionNavigation;
`, leaseContext);

function navigationFixture(appId, initialHref, lastPhase) {
  const iframe = {};
  const record = {
    success: true,
    cancelled: false,
    key: "target:document-1",
    submissionNavigationLease: {
      sendId: "send-1",
      appId,
      initialHref,
      initialHost: new URL(initialHref).hostname,
      documentId: "document-1",
      bridgeVersion: "bridge-1",
      recordKey: "target:document-1",
      hardExpiresAt: Date.now() + 60000,
      expiresAt: Date.now() + 60000,
      terminalObserved: false,
      terminalThreadId: "",
      lastHref: initialHref,
      lastPhase,
      timer: 0
    }
  };
  leaseContext.runs.set(iframe, record);
  return { iframe, record };
}

function correlatedEvent(previousHref, href, overrides = {}) {
  return {
    previousHref,
    href,
    navigation: {
      kind: "pushState",
      documentId: "document-1",
      bridgeVersion: "bridge-1",
      submission: { sendId: "send-1", appId: overrides.appId || "" },
      ...overrides
    }
  };
}

{
  const initial = "https://gemini.google.com/app";
  const terminal = "https://gemini.google.com/app/thread-a";
  const fixture = navigationFixture("Gemini", initial, "start");
  assert.equal(leaseContext.preserve(fixture.iframe, correlatedEvent(initial, terminal, { appId: "Gemini" })), true);
  assert.equal(fixture.record.submissionNavigationLease.terminalThreadId, "thread-a");
  assert.equal(leaseContext.runs.get(fixture.iframe), fixture.record, "Gemini submission route must preserve the exact record");
  const sameThread = "https://gemini.google.com/app/thread-a?hl=en";
  assert.equal(leaseContext.preserve(fixture.iframe, correlatedEvent(terminal, sameThread, { kind: "replaceState", appId: "Gemini" })), true);
  const otherThread = "https://gemini.google.com/app/thread-b";
  assert.equal(leaseContext.preserve(fixture.iframe, correlatedEvent(sameThread, otherThread, { appId: "Gemini" })), false);
  assert.equal(fixture.record.submissionNavigationLease, null, "a different Gemini thread must end inheritance");
}

{
  const initial = "https://app.notion.com/ai";
  const intermediate = "https://app.notion.com/chat";
  const terminal = "https://app.notion.com/chat?t=thread-a";
  const fixture = navigationFixture("NotionAI", initial, "start");
  assert.equal(leaseContext.preserve(fixture.iframe, correlatedEvent(initial, intermediate, { appId: "NotionAI" })), true);
  assert.equal(fixture.record.submissionNavigationLease.terminalObserved, false, "Notion intermediate route must retain the lease");
  assert.equal(leaseContext.preserve(fixture.iframe, correlatedEvent(intermediate, terminal, { kind: "replaceState", appId: "NotionAI" })), true);
  assert.equal(fixture.record.submissionNavigationLease.terminalThreadId, "thread-a");
}

for (const invalid of [
  { label: "wrong send id", overrides: { submission: { sendId: "send-2", appId: "Gemini" } } },
  { label: "wrong document", overrides: { documentId: "document-2", appId: "Gemini" } },
  { label: "wrong bridge", overrides: { bridgeVersion: "bridge-2", appId: "Gemini" } },
  { label: "manual popstate", overrides: { kind: "popstate", submission: undefined, appId: "Gemini" } },
  { label: "non-contiguous route", previousHref: "https://gemini.google.com/app/other", overrides: { appId: "Gemini" } }
]) {
  const initial = "https://gemini.google.com/app";
  const fixture = navigationFixture("Gemini", initial, "start");
  const event = correlatedEvent(
    invalid.previousHref || initial,
    "https://gemini.google.com/app/thread-a",
    invalid.overrides
  );
  assert.equal(leaseContext.preserve(fixture.iframe, event), false, invalid.label);
  assert.equal(fixture.record.submissionNavigationLease, null, `${invalid.label} must clear inheritance`);
}

{
  const initial = "https://gemini.google.com/app";
  const fixture = navigationFixture("Gemini", initial, "start");
  fixture.record.submissionNavigationLease.expiresAt = Date.now() - 1;
  assert.equal(
    leaseContext.preserve(fixture.iframe, correlatedEvent(initial, "https://gemini.google.com/app/thread-a", { appId: "Gemini" })),
    false,
    "expired submission leases must not preserve model state"
  );
}

const locationReportSource = functionSource(contentEntrySource, "reportLocationChange");
assert.doesNotMatch(locationReportSource, /contentDocumentId\s*=/, "SPA navigation must not replace the real document id");
assert.match(locationReportSource, /postLocationChanged\(/, "SPA navigation must use the dedicated location message");
assert.match(locationReportSource, /previousHref/, "location messages must preserve the previous href");
assert.match(locationReportSource, /requireCurrentHref/, "stale queued history notifications must be ignored");

const frameKeySource = functionSource(preferredModelSource, "preferredModelFrameKey");
assert.doesNotMatch(frameKeySource, /currentHref|iframe\.src/, "preferred-model identity must not change for an SPA href");
assert.match(contentSource, /action: "relayFrameLifecycle"/, "content must relay lifecycle events over extension runtime messaging");
assert.match(parentSource, /message\.action !== "frameLifecycle"/, "parent must handle authenticated lifecycle relays");
assert.match(parentSource, /EXTENSION_RUNTIME_RELAY_SOURCE/, "parent lifecycle handling must use the extension runtime relay source");
assert.match(workspaceSource, /emitFrameLifecycleChange\(\{ type: "location"[^\n]+navigation \}\)/, "workspace must forward navigation correlation metadata");
assert.match(workspaceSource, /hrefChanged \|\| navigation\?\.forced === true/, "forced same-href popstate must still emit a lifecycle event");
assert.match(workspaceSource, /iframe\.dataset\.currentHref === href/, "stale favicon discovery must not roll frame location backward");

for (const [name, consumers] of [
  ["SEND_TEXT_POST_MESSAGE_SOURCE", [[contentSource, "isolated content"]]],
  ["MAIN_WORLD_LOCATION_SOURCE", [[contentSource, "isolated content"], [preloadSource, "MAIN preload"]]],
  ["NOTION_SEND_ACTIVATED_EVENT", [[contentSource, "isolated content"], [preloadSource, "MAIN preload"]]]
]) {
  const canonicalValue = protocolString(name);
  for (const [source, label] of consumers) {
    assert.ok(source.includes(JSON.stringify(canonicalValue)), `${label} must bundle canonical ${name}`);
    assertProtocolBinding(source, name, label);
  }
}
for (const [source, label] of [[contentEntrySource, "isolated content source"], [preloadEntrySource, "MAIN preload source"]]) {
  assert.match(
    source,
    /import\s*\{\s*CONTENT_PROTOCOL\s*\}\s*from "\.\.\/shared\/protocol\.js";/,
    `${label} must import the shared protocol`
  );
}
assert.match(frameCommandsSource, /sendText:\s*command\(\{[^}]*mutating:\s*true/, "sendText must use exactly-once Frame RPC semantics");
assert.match(frameCommandsSource, /applyPreferredModel:\s*command\(\{[^}]*mutating:\s*true/, "preferred model apply must use exactly-once Frame RPC semantics");
assert.match(preloadSource, /detail: JSON\.stringify\(/, "Notion cross-world activation detail must be Firefox-safe JSON");

const sendTextSource = functionSource(contentEntrySource, "sendTextUncached");
assert.ok(
  sendTextSource.indexOf('markSubmissionNavigation(data, "button")') < sendTextSource.indexOf("clickPromptSubmit(submit)"),
  "generic submit correlation must be armed before the button activation"
);
assert.ok(
  sendTextSource.indexOf('markSubmissionNavigation(data, "enter")') < sendTextSource.indexOf('input.dispatchEvent(new KeyboardEvent("keydown"'),
  "generic submit correlation must be armed before Enter"
);

const preserveSource = functionSource(preferredModelSource, "preservePreferredModelForSubmissionNavigation");
assert.match(preserveSource, /submission\.sendId[^\n]+lease\.sendId/, "parent must match the exact send id");
assert.match(preserveSource, /navigation\.documentId[^\n]+lease\.documentId/, "parent must match the exact document id");
assert.match(preserveSource, /navigation\.bridgeVersion[^\n]+lease\.bridgeVersion/, "parent must match the exact bridge version");
assert.match(preserveSource, /\["pushstate", "replacestate", "poll"\]/, "manual popstate/hashchange navigation must not inherit submission state");
assert.match(preserveSource, /event\.previousHref[^\n]+lease\.lastHref/, "submission navigation chains must be contiguous");
assert.match(preserveSource, /nextRoute\.threadId[^\n]+lease\.terminalThreadId/, "a settled submission lease must not follow a different thread");

assert.match(contentSource, /findNotionModelIndicator\(\)/, "Notion must expose a read-only model indicator lookup");
assert.match(contentSource, /findNotionModelControl\(\{ allowDisabled: true \}\)/, "disabled Notion model controls must remain readable");
assert.match(contentSource, /function findNotionModelTrigger\(\)[\s\S]*?findNotionModelControl\(\);/, "interactive Notion lookup must still reject disabled controls");
assert.match(contentEntrySource, /deadlineAt > activatedAt \? deadlineAt \+ 15000/, "content correlation must cover delayed final routing through the send deadline");
assert.match(contentSource, /event\?\.isTrusted[^\n]+currentSubmissionNavigation/, "trusted user navigation intent must cancel stale submission correlation");
assert.match(contentSource, /window\.addEventListener\("pointerdown", clearSubmissionNavigationForTrustedIntent/, "trusted pointer navigation must be observed before SPA routing");
assert.match(preferredModelSource, /if \(sent \|\| lease\.terminalObserved\) return;/, "successful or terminal submission routing must retain its lease through the hard deadline");
assert.match(
  modelPreferenceConsoleSource,
  /dataState === "disabled"/,
  "the Notion DevTools adapter must reject data-state=disabled controls for interaction"
);

const grokOpenSource = functionSource(contentEntrySource, "openGrokModelMenu");
assert.match(
  grokOpenSource,
  /preferredModelPointerActivate\(context, trigger\)/,
  "Grok must use pointer-first activation for the model menu trigger"
);
const pointerDispatchSource = functionSource(contentEntrySource, "dispatchPointerActivation");
for (const eventName of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
  assert.match(pointerDispatchSource, new RegExp(`type: "${eventName}"`), `Grok pointer activation must include ${eventName}`);
}

const preferredPointerContext = vm.createContext({});
vm.runInContext(`
  const calls = [];
  let pointerWorks = true;
  let shieldCount = 0;
  function assertPreferredModelRun() { calls.push("assert"); }
  function visible() { return true; }
  function isDisabledElement() { return false; }
  function armPreferredModelFocusShield() { shieldCount += 1; calls.push("shield"); }
  function modelCenterPoint() { return { x: 12, y: 18 }; }
  function dispatchPointerActivation() { calls.push("pointer"); return pointerWorks; }
  function nativeModelClick() { calls.push("native"); return true; }
  ${functionSource(contentEntrySource, "modelDirectClick")}
  ${functionSource(contentEntrySource, "preferredModelPointerActivate")}
  globalThis.runPreferredPointer = (nextPointerWorks) => {
    pointerWorks = nextPointerWorks;
    calls.length = 0;
    shieldCount = 0;
    const context = { interactionCount: 0 };
    const target = {
      scrollIntoView() { calls.push("scroll"); },
      focus() { calls.push("focus"); }
    };
    const clicked = preferredModelPointerActivate(context, target);
    return { clicked, calls: calls.slice(), interactionCount: context.interactionCount, shieldCount };
  };
`, preferredPointerContext);
const pointerSuccess = JSON.parse(JSON.stringify(preferredPointerContext.runPreferredPointer(true)));
assert.equal(pointerSuccess.clicked, true, "pointer-first activation must report a dispatched pointer sequence");
assert.equal(pointerSuccess.interactionCount, 1, "pointer-first activation must count one logical interaction");
assert.equal(pointerSuccess.shieldCount, 1, "pointer-first activation must arm the focus shield once");
assert.deepEqual(
  pointerSuccess.calls.filter((call) => call === "pointer" || call === "native"),
  ["pointer"],
  "a successful pointer sequence must not be followed by a native click"
);
const pointerFallback = JSON.parse(JSON.stringify(preferredPointerContext.runPreferredPointer(false)));
assert.equal(pointerFallback.interactionCount, 1, "native fallback must remain part of the same logical interaction");
assert.deepEqual(
  pointerFallback.calls.filter((call) => call === "pointer" || call === "native"),
  ["pointer", "native"],
  "native click must run only when pointer dispatch is unavailable"
);

const devtoolsGrokOpenSource = functionSource(modelPreferenceConsoleSource, "openGrokMenu");
assert.match(
  devtoolsGrokOpenSource,
  /pointerFirstClickElement\(trigger\)/,
  "the Grok DevTools adapter must mirror pointer-first trigger activation"
);
const devtoolsPointerContext = vm.createContext({});
vm.runInContext(`
  const calls = [];
  let pointerWorks = true;
  function visible() { return true; }
  function isDisabledElement() { return false; }
  function centerPoint() { return { x: 8, y: 10 }; }
  function dispatchPointerActivation() { calls.push("pointer"); return pointerWorks; }
  function nativeClick() { calls.push("native"); return true; }
  ${functionSource(modelPreferenceConsoleSource, "pointerFirstClickElement")}
  globalThis.runDevtoolsPointer = (nextPointerWorks) => {
    pointerWorks = nextPointerWorks;
    calls.length = 0;
    const target = { scrollIntoView() {}, focus() {} };
    return { clicked: pointerFirstClickElement(target), calls: calls.slice() };
  };
`, devtoolsPointerContext);
assert.deepEqual(
  JSON.parse(JSON.stringify(devtoolsPointerContext.runDevtoolsPointer(true))).calls,
  ["pointer"],
  "the DevTools adapter must not native-click after successful pointer dispatch"
);
assert.deepEqual(
  JSON.parse(JSON.stringify(devtoolsPointerContext.runDevtoolsPointer(false))).calls,
  ["pointer", "native"],
  "the DevTools adapter must native-click only as a fallback"
);

const notionIndicatorContext = vm.createContext({});
vm.runInContext(`
  const NOTION_MODEL_MENU_ROOT_SELECTORS = [];
  const NOTION_MODEL_TARGETS = { auto: {} };
  function visible() { return true; }
  function modelElementText(element) { return element.textValue || ""; }
  function isNotionModelTriggerNearMainComposer() { return true; }
  function notionModelIdFromText() { return "gemini31pro"; }
  function notionText(value) { return String(value || "").toLowerCase(); }
  function notionTextLooksLikeTarget() { return false; }
  ${functionSource(contentEntrySource, "isDisabledElement")}
  ${functionSource(contentEntrySource, "scoreNotionModelTrigger")}
  globalThis.scoreNotion = scoreNotionModelTrigger;
`, notionIndicatorContext);
const disabledNotionIndicator = {
  disabled: false,
  textValue: "Response in progress Gemini 3.1 Pro",
  className: "",
  hasAttribute() { return false; },
  matches() { return false; },
  closest() { return null; },
  getAttribute(name) {
    if (name === "data-state") return "disabled";
    if (name === "data-testid") return "unified-chat-model-button";
    return "";
  }
};
assert.equal(notionIndicatorContext.scoreNotion(disabledNotionIndicator), -1, "disabled Notion controls must not be interactive triggers");
assert.ok(
  notionIndicatorContext.scoreNotion(disabledNotionIndicator, { allowDisabled: true }) > 0,
  "disabled Notion controls must remain readable as current-model indicators"
);

console.log("preferred-model submit-navigation regression: ok");
