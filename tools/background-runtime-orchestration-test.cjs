#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const runtime = read("background/runtime.js");
const secureContexts = read("background/secure-frame-contexts.js");
const grokRuntime = read("background/grok-cookie-runtime.js");
const notionPreflight = read("background/notion-frame-preflight.js");
const customUserscripts = read("background/custom-userscript-runtime.js");
const registeredFrameTransport = read("background/registered-frame-transport.js");
const runtimeConfigApplication = read("background/runtime-config-application.js");

const runtimeLines = runtime.trim().split(/\r?\n/).length;
assert.ok(runtimeLines <= 700, `background runtime assembly must remain at or below 700 lines; found ${runtimeLines}`);
for (const [factory, file] of [
  ["createSecureFrameContextRegistry", "./secure-frame-contexts.js"],
  ["createGrokCookieRuntime", "./grok-cookie-runtime.js"],
  ["createNotionFramePreflightRuntime", "./notion-frame-preflight.js"],
  ["createCustomUserscriptRuntime", "./custom-userscript-runtime.js"]
]) {
  assert.match(runtime, new RegExp(`import \\{ ${factory} \\} from "${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(runtime, new RegExp(`${factory}\\(chrome`));
}
assert.doesNotMatch(runtime, /secureFrameContexts\s*=\s*new Map|grokFramePreflights\s*=\s*new Map|customSummaryExecutionQueues\s*=\s*new Map/);
assert.match(runtime, /chrome\.cookies\?\.onChanged\?\.addListener\(grokCookieRuntime\.handleCookieChange\)/);
assert.match(runtime, /chrome\.webNavigation\?\.onBeforeNavigate\?\.addListener/);
assert.match(runtime, /chrome\.webNavigation\?\.onCommitted\?\.addListener/);
assert.match(runtime, /registeredFrameContext\(tabId, frameId\)/);
assert.match(runtime, /action: "frameNavigationTarget"/);
assert.match(runtime, /Number\(details\.parentFrameId\) !== 0/);
assert.match(runtime, /chrome\.tabs\?\.onRemoved\?\.addListener\(/);
assert.match(runtime, /forgetSecureFrameContext\(Number\(details\.tabId\), Number\(details\.frameId\)/);
assert.match(runtime, /forgetSecureTabContexts\(tabId\)/);
assert.match(runtime, /Number\(details\?\.frameId\) === 0[\s\S]*?forgetSecureTabContexts/);
assert.match(runtime, /touchContext: secureFrameContextRegistry\.touch/);
assert.match(runtime, /forgetContext: secureFrameContextRegistry\.forgetContext/);
assert.match(runtime, /chrome\.runtime\.onMessage\.addListener\(createBackgroundRequestListener\(dispatchBackgroundRequest\)\)/);
assert.match(runtime, /import \{ createStrictRuntimeConfigApplier \} from "\.\/runtime-config-application\.js"/);
assert.match(runtime, /createStrictRuntimeConfigApplier\(chrome,/);
assert.match(runtime, /applyConfiguration: runtimeConfigApplier\.apply/);
assert.match(runtime, /knownExtensionPageTabIds/);
assert.doesNotMatch(runtime, /\bimport\s*\(/);
assert.match(runtime, /runtimeIdentity: CONTENT_BRIDGE_RUNTIME_IDENTITY/);
assert.match(runtime, /contentRuntimeIdentityForBundle\("content\/content\.js"\)/);
assert.match(runtime, /invokeActiveRuntimeMethod/);
assert.match(runtime, /normalizeFrameTransportError\(error\)/);
assert.match(runtime, /verifiedRegisteredFrameFallbackTarget/);
assert.doesNotMatch(runtime, /documentIds\|unexpected property\|invalid value/);
assert.match(registeredFrameTransport, /documentTargetUnsupported\(error\)/);
assert.match(registeredFrameTransport, /await verifyFallbackTarget\(context\)/);

assert.match(runtimeConfigApplication, /export function createStrictRuntimeConfigApplier/);
assert.match(runtimeConfigApplication, /const beforeDnr = await dnrSnapshot\(dnr\)/);
assert.match(runtimeConfigApplication, /const contentPreparation = await prepareContentScriptRegistration\(api,/);
assert.match(runtimeConfigApplication, /currentExtensionPageTabIds\(preferredTabIds\)/);
assert.match(runtimeConfigApplication, /buildDynamicDnrRules\(chatApps, extensionHost, extensionTabIds\)/);
assert.match(runtimeConfigApplication, /buildDynamicDnrRules\(chatApps, extensionHost, \[\]\)/);
assert.match(runtimeConfigApplication, /notionRuntime\.activeSessionRules\(\)/);
assert.match(runtimeConfigApplication, /await contentPreparation\.commit\(\)/);
assert.match(runtimeConfigApplication, /await notionRuntime\.withDnrMutation\(\(\) => restoreDnrSnapshot\(dnr, beforeDnr\)\)/);
assert.match(runtimeConfigApplication, /await contentPreparation\.restore\(\)/);
assert.match(runtimeConfigApplication, /Runtime configuration apply and strict restore both failed/);
assert.match(runtimeConfigApplication, /const queued = tail\.catch\(\(\) => \{\}\)\.then\(\(\) => applyInternal\(configuration, context\)\)/);
assert.match(runtimeConfigApplication, /tail = queued\.then\(\(\) => undefined, \(\) => undefined\)/);

assert.match(secureContexts, /assertContentRuntimePackageBundleIdentity\([\s\S]*?"content\/content\.js"/);
assert.match(secureContexts, /contentRuntimePackageBundleIdentityMatches\(runtimeIdentity, "content\/content\.js"\)/);
assert.match(secureContexts, /contentRuntimePackageBundleIdentityMatches\(registered\.runtimeIdentity, "content\/content\.js"\)/);
assert.match(secureContexts, /api\.storage\.session\?\.get/);
assert.match(secureContexts, /api\.storage\.session\.set/);
assert.match(secureContexts, /frame\.parentFrameId !== 0/);
assert.match(secureContexts, /contextDocumentId && senderDocumentId && contextDocumentId !== senderDocumentId/);
assert.match(secureContexts, /frameBindingId !== registered\.frameBindingId/);
assert.match(secureContexts, /async function registeredFrameContext\(tabId, frameId\)/);
assert.match(secureContexts, /value\?\.tabId !== tabId \|\| value\?\.frameId !== frameId/);
assert.match(secureContexts, /async function forgetFrame\(tabId, frameId, options = \{\}\)/);
assert.match(secureContexts, /async function forgetContext\(token, value\)/);
assert.match(secureContexts, /async function forgetTab\(tabId, options = \{\}\)/);
assert.match(secureContexts, /function touch\(token, value\)/);
assert.doesNotMatch(secureContexts, /FRAME_CONTEXT_MAX_AGE_MS/, "live secure frame contexts must not expire only because they were idle");

assert.match(grokRuntime, /removeManagedGrokPartitionsExcept\(api, \{ storeId, partitionKey, revalidate \}\)/);
assert.match(grokRuntime, /syncGrokSessionCookies\(api, \{ storeId, partitionKey, \.\.\.profileOptions, \.\.\.backendOptions \}\)/);
assert.match(grokRuntime, /api\.cookies\.getPartitionKey\(\{/);
assert.match(grokRuntime, /frame\.parentFrameId !== 0/);
assert.match(grokRuntime, /!senderDocumentId[\s\S]{0,120}!frameDocumentId[\s\S]{0,180}senderDocumentId !== frameDocumentId/);
assert.match(grokRuntime, /grokCookieChangeOwnedByBridge\(changeInfo\)/);
assert.match(grokRuntime, /releaseChangedGrokPartition\(api, changeInfo\)/);
assert.match(grokRuntime, /request\.PREPARE_FRAME_LOAD/);
assert.match(grokRuntime, /dependencies\.updateDnrRules\(tabId, message\)/);
assert.ok(
  notionPreflight.indexOf("await updateDnrRules(tabId)")
    < notionPreflight.indexOf("await prepareFrameLoad({ ...message, tabId })"),
  "document-only DNR rules must be ready before arming the exact Notion nonce rule"
);
assert.match(grokRuntime, /request\.SYNC_GROK_SESSION_COOKIES/);
assert.doesNotMatch(grokRuntime, /console\.(?:log|info|debug).*cookie/i);
assert.match(runtime, /notionFramePreflightRuntime\.dnrRuleUpdater\(updateDnrRules\)/);
assert.match(
  runtime,
  /const applied = await officialRulesRuntime\.reloadConfiguration\(\{ preferredTabIds \}\);[\s\S]*?return String\(applied\?\.mode \|\| applied \|\| ""\);/,
  "Notion frame preflight must receive the applied DNR mode, not the whole configuration result"
);
assert.match(runtime, /REQUEST\.CANCEL_NOTION_FRAME_LOAD/);
assert.match(notionPreflight, /extensionUrl\.startsWith\("chrome-extension:\/\/"\)/);
assert.match(notionPreflight, /NOTION_FRAME_RULE_TIMEOUT_MS = 10_000/);
assert.match(notionPreflight, /resourceTypes: \["xmlhttprequest", "other"\]/);
assert.match(notionPreflight, /requestMethods: \["get"\]/);
assert.match(notionPreflight, /initiatorDomains: \["app\.notion\.com"\]/);
assert.doesNotMatch(notionPreflight, /\b(?:debugger|getTargets|Runtime\.evaluate|DEBUG_instance)\b/);
assert.doesNotMatch(notionPreflight, /requestHeaders|websocket|script|image/);
assert.match(runtime, /debuggerSessionCoordinator\.available \? debuggerSessionCoordinator : undefined/);

assert.match(customUserscripts, /executeSummaryUserscript[\s\S]*?verifiedCustomUserscriptTarget\(api, sender\)/);
assert.match(customUserscripts, /executeTopicDeleteUserscript[\s\S]*?verifiedCustomUserscriptTarget\(api, sender\)/);
assert.match(customUserscripts, /configMatchesHref\(config, senderUrl\)/);
assert.match(customUserscripts, /CUSTOM_SUMMARY_SOURCE_MAX_BYTES/);
assert.match(customUserscripts, /CUSTOM_SUMMARY_RESULT_MAX_BYTES/);
assert.match(customUserscripts, /request\.INSTALL_TOPIC_DELETE_USERSCRIPT/);
assert.match(customUserscripts, /request\.EXECUTE_SUMMARY_USERSCRIPT/);
assert.match(customUserscripts, /request\.EXECUTE_TOPIC_DELETE_USERSCRIPT/);
assert.match(customUserscripts, /activeCustomSummaryRuntimeReady/);
assert.match(customUserscripts, /MAIN-world runtime is unavailable or stale/);
assert.doesNotMatch(customUserscripts, /files:\s*\["content\/summary-userscripts-main\.js"\]/);
assert.match(customUserscripts, /normalizeDeleteConversationIdentity\(safePayload\.expectedDeleteIdentity\)/);
assert.match(customUserscripts, /Custom Delete Site target URL changed before menuCommand/);
assert.match(customUserscripts, /if \(!worldOptionUnsupported\(error\)\)/);
assert.doesNotMatch(customUserscripts, /\/\\bworld\\b\|unexpected property\/i/);

console.log(`background runtime orchestration boundaries: ok (${runtimeLines} lines)`);
