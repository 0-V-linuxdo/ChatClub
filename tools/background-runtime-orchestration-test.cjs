#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const runtime = read("background/runtime.js");
const secureContexts = read("background/secure-frame-contexts.js");
const grokRuntime = read("background/grok-cookie-runtime.js");
const customUserscripts = read("background/custom-userscript-runtime.js");
const registeredFrameTransport = read("background/registered-frame-transport.js");

const runtimeLines = runtime.trim().split(/\r?\n/).length;
assert.ok(runtimeLines <= 700, `background runtime assembly must remain at or below 700 lines; found ${runtimeLines}`);
for (const [factory, file] of [
  ["createSecureFrameContextRegistry", "./secure-frame-contexts.js"],
  ["createGrokCookieRuntime", "./grok-cookie-runtime.js"],
  ["createCustomUserscriptRuntime", "./custom-userscript-runtime.js"]
]) {
  assert.match(runtime, new RegExp(`import \\{ ${factory} \\} from "${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(runtime, new RegExp(`${factory}\\(chrome`));
}
assert.doesNotMatch(runtime, /secureFrameContexts\s*=\s*new Map|grokFramePreflights\s*=\s*new Map|customSummaryExecutionQueues\s*=\s*new Map/);
assert.match(runtime, /chrome\.cookies\?\.onChanged\?\.addListener\(grokCookieRuntime\.handleCookieChange\)/);
assert.match(runtime, /chrome\.tabs\?\.onRemoved\?\.addListener\(/);
assert.match(runtime, /chrome\.runtime\.onMessage\.addListener\(createBackgroundRequestListener\(dispatchBackgroundRequest\)\)/);
assert.doesNotMatch(runtime, /\bimport\s*\(/);
assert.match(runtime, /runtimeIdentity: CONTENT_BRIDGE_RUNTIME_IDENTITY/);
assert.match(runtime, /contentRuntimeIdentityForBundle\("content\/content\.js"\)/);
assert.match(runtime, /invokeActiveRuntimeMethod/);
assert.match(runtime, /normalizeFrameTransportError\(error\)/);
assert.match(runtime, /verifiedRegisteredFrameFallbackTarget/);
assert.doesNotMatch(runtime, /documentIds\|unexpected property\|invalid value/);
assert.match(registeredFrameTransport, /documentTargetUnsupported\(error\)/);
assert.match(registeredFrameTransport, /await verifyFallbackTarget\(context\)/);

assert.match(secureContexts, /assertContentRuntimePackageBundleIdentity\([\s\S]*?"content\/content\.js"/);
assert.match(secureContexts, /contentRuntimePackageBundleIdentityMatches\(runtimeIdentity, "content\/content\.js"\)/);
assert.match(secureContexts, /contentRuntimePackageBundleIdentityMatches\(registered\.runtimeIdentity, "content\/content\.js"\)/);
assert.match(secureContexts, /api\.storage\.session\?\.get/);
assert.match(secureContexts, /api\.storage\.session\.set/);
assert.match(secureContexts, /frame\.parentFrameId !== 0/);
assert.match(secureContexts, /contextDocumentId && senderDocumentId && contextDocumentId !== senderDocumentId/);
assert.match(secureContexts, /frameBindingId !== registered\.frameBindingId/);

assert.match(grokRuntime, /removeManagedGrokPartitionsExcept\(api, \{ storeId, partitionKey \}\)/);
assert.match(grokRuntime, /syncGrokSessionCookies\(api, \{ storeId, partitionKey \}\)/);
assert.match(grokRuntime, /api\.cookies\.getPartitionKey\(\{/);
assert.match(grokRuntime, /frame\.parentFrameId !== 0/);
assert.match(grokRuntime, /senderDocumentId && frameDocumentId && senderDocumentId !== frameDocumentId/);
assert.match(grokRuntime, /grokCookieChangeOwnedByBridge\(changeInfo\)/);
assert.match(grokRuntime, /releaseChangedGrokPartition\(api, changeInfo\)/);
assert.match(grokRuntime, /request\.PREPARE_FRAME_LOAD/);
assert.match(grokRuntime, /request\.SYNC_GROK_SESSION_COOKIES/);
assert.doesNotMatch(grokRuntime, /console\.(?:log|info|debug).*cookie/i);

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
