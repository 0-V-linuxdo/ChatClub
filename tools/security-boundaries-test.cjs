#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const dataModule = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

(async () => {
  const urlMatch = await dataModule(read("shared/url-match.js"));
  assert.equal(urlMatch.normalizeHost(" Example.COM. "), "example.com");
  assert.equal(urlMatch.normalizeHost("*.Sub.Example.com"), "*.sub.example.com");
  for (const invalid of ["https://example.com", "example.com/path", "example.com:443", "bad host", "*.*.example.com"]) {
    assert.equal(urlMatch.normalizeHost(invalid), "", `invalid host must be rejected: ${invalid}`);
    assert.deepEqual(urlMatch.uniqueMatchPatterns([{ hosts: [invalid] }]), []);
  }
  assert.deepEqual(
    urlMatch.normalizeHostList(["Example.com", "example.com", "https://invalid.example"]),
    ["example.com"]
  );

  const stateModule = await import(pathToFileURL(path.join(root, "app/state.js")).href);
  const rootState = stateModule.createAppState();
  rootState.groups = [{ id: "group-1" }];
  rootState.options = { nested: { enabled: true } };
  const ports = stateModule.createFeatureStatePorts(rootState);

  assert.equal(ports.pocket.groups[0].id, "group-1");
  assert.throws(() => { ports.pocket.groups = []; }, /cannot mutate/);
  assert.throws(() => { ports.pocket.groups.push({ id: "group-2" }); }, /read-only/);
  assert.throws(() => { ports.summary.options.nested.enabled = false; }, /read-only/);
  ports.pocket.pocketEntries = [{ id: "entry-1" }];
  assert.equal(rootState.pocketEntries[0].id, "entry-1");

  const content = `${read("content-src/content.js")}\n${read("content-src/capabilities/summary-runtime.js")}`;
  const background = [
    "background/service-worker.js",
    "background/runtime.js",
    "background/secure-frame-contexts.js",
    "background/custom-userscript-runtime.js",
    "background/grok-cookie-runtime.js",
    "background/frame-relay.js",
    "background/frame-command-errors.js",
    "background/main-world-runtime.js",
    "background/registered-frame-transport.js",
    "background/content-script-registration.js",
    "background/content-registration.js",
    "background/frame-injection.js",
    "background/tab-runtime.js"
  ].map(read).join("\n");
  const main = [
    "app/main.js",
    "app/runtime.js",
    "app/frame-bridge/controller.js"
  ].map(read).join("\n");
  const workspace = `${read("app/workspace/controller.js")}\n${read("app/workspace/frame-controller.js")}`;
  const summary = read("app/summary/controller.js");
  const topicDelete = read("app/topic-delete/runtime.js");
  const contentEntry = read("content-src/content.js");
  const contentDocumentIdentity = read("content-src/shared/content-document-identity.js");
  const commandRouter = read("content-src/shared/command-router.js");
  const secureFrameRpc = read("content-src/shared/secure-frame-rpc.js");
  const preloadEntry = read("content-src/preload.js");
  assert.match(content, /if \(!EXTENSION_ORIGIN \|\| event\.source !== window\.parent \|\| event\.origin !== EXTENSION_ORIGIN\) return/);
  assert.match(content, /configId: String\(config\.id \|\| ""\)/);
  assert.doesNotMatch(content, /userscript:\s*source/);
  assert.doesNotMatch(content, /chatclub-parent-clipboard|getShortcutConfig/);
  assert.doesNotMatch(contentEntry, /action:\s*["']contentReady["']/, "content registration must not retain an unauthenticated parent-window readiness channel");
  assert.match(content, /secureFrameToken/);
  assert.match(contentEntry, /installSecureFrameRpc\(\{/);
  assert.match(secureFrameRpc, /message\.bridgeDocumentId !== bridgeDocumentId/);
  assert.match(secureFrameRpc, /message\.secureFrameToken !== secureFrameToken/);
  assert.match(secureFrameRpc, /sender\?\.id !== extensionApi\?\.runtime\?\.id/);
  assert.match(content, /if \(!event\.isTrusted\) return/);
  assert.match(background, /configMatchesHref\(config, senderUrl\)/);
  assert.match(background, /documentIds: \[context\.documentId\]/);
  assert.match(background, /frame\.parentFrameId !== 0/);
  assert.match(background, /registeredSenderContext/);
  assert.match(background, /createAuthenticatedFrameRelay\(\{[\s\S]*?registeredSenderContext/);
  assert.match(background, /async function frameBinding[\s\S]*?authenticate\(message, sender\)/);
  assert.match(background, /action: "frameBinding"/);
  assert.match(contentEntry, /createContentDocumentIdentity\(window\)/);
  assert.match(contentDocumentIdentity, /const currentFrameBindingId = \(\) =>/);
  assert.match(contentEntry, /FRAME_BINDING_POST_MESSAGE_SOURCE/);
  assert.match(contentEntry, /async function relayFrameBindingChallenge/);
  assert.match(contentEntry, /expectedBindingId/);
  assert.match(background, /executeTopicDeleteUserscript/);
  assert.match(background, /verifiedCustomUserscriptTarget/);
  const frameCommands = await dataModule(read("shared/frame-commands.js"));
  assert.ok(frameCommands.FRAME_COMMAND_SPECS.getSummaryRuntimeState);
  assert.equal(frameCommands.FRAME_COMMAND_SPECS.prepareNavigationFocusGuard.transport, "main-world");
  assert.equal(frameCommands.FRAME_COMMAND_SPECS.adoptNavigationFocusGuard.transport, "main-world");
  assert.match(background, /new Set\(Object\.keys\(FRAME_COMMAND_SPECS\)\)/);
  assert.match(background, /executeMainWorldFrameCommand/);
  assert.match(background, /world: "MAIN"/);
  assert.match(background, /CONTENT_RUNTIME_REGISTRY_KEY/);
  assert.match(background, /broker\?\.activeGenerationVersion !== generation/);
  assert.match(background, /broker\.acquireGeneration\(generation\)/);
  assert.match(background, /registry\.require\(runtimeName, runtimeVersion\)/);
  assert.match(background, /documentTargetUnsupported\(error\)/);
  assert.match(background, /verifiedRegisteredFrameFallbackTarget/);
  assert.doesNotMatch(background, /documentIds\|unexpected property\|invalid value/);
  assert.match(background, /return frameRouteError\("REMOTE_ERROR", message, true, error\)/);
  assert.match(contentEntry, /contentCommandRouter\(runtimes, CONTENT_RUNTIME_IDENTITY\.implementationVersion\)/);
  assert.match(commandRouter, /if \(!FRAME_COMMAND_SPECS\[command\]\)/);
  assert.match(commandRouter, /commandCapability\(command\) !== feature/);
  assert.match(background, /rollbackContentScript\(previous, registration\)/);
  assert.match(background, /registerContentScriptsVerified\(api, \[rollback\]\)/);
  assert.doesNotMatch(main, /chatclub-parent-clipboard|getShortcutConfig|SHORTCUT_TRIGGER_POST_MESSAGE_SOURCE/);
  assert.match(main, /verifyContentFrameRegistration/);
  assert.match(main, /frameBindingChallenges\.claim\(message\.challenge, message\.generation\)/);
  assert.match(main, /frameBindingChallenges\.isCurrent\(entry\)/);
  assert.match(main, /context\.frameId !== expectedFrameId/);
  assert.match(main, /message\.action === "frameNavigationTarget"/);
  assert.match(main, /controller\.ensureFrameAttributeContract\(iframe, href/);
  assert.doesNotMatch(main, /iframeForWindow\(event\.source\)/);
  assert.doesNotMatch(main, /contentReady/);
  assert.match(main, /if \(!exactFrameTarget\.expectedFrameId\)[\s\S]*?contentWindow\?\.postMessage/);
  assert.doesNotMatch(workspace, /contentWindow\??\.postMessage/);
  assert.match(workspace, /sendToContentFrame\(\s*iframe,\s*"prepareNavigationFocusGuard"/);
  assert.match(workspace, /sendToContentFrame\(\s*iframe,\s*"adoptNavigationFocusGuard"/);
  assert.match(preloadEntry, /runtimes\.register\(NAVIGATION_FOCUS_GUARD_RUNTIME/);
  assert.doesNotMatch(preloadEntry, /window\[NAVIGATION_FOCUS_GUARD_RUNTIME\]/);
  assert.match(preloadEntry, /const prepare = \(message = \{\}\) =>/);
  assert.match(summary, /delete runtimeConfig\.userscript/);
  assert.match(summary, /sendToContentFrame\(iframe, "collectSummary"/);
  assert.match(summary, /expectedDocumentId: summaryReady\.registration\.documentId/);
  assert.match(summary, /expectedHref: base\.href/);
  assert.match(topicDelete, /delete runtimeConfig\.userscript/);
  assert.match(topicDelete, /sendToContentFrame\(iframe, "deleteThread"/);
  assert.match(topicDelete, /String\(instruction\?\.documentId \|\| ""\) === documentId/);
  assert.match(topicDelete, /trustedBridgeDocumentId\(iframe\) !== expectedDocumentId/);
  assert.match(topicDelete, /return await trustedInputTarget\(iframe, expectedDocumentId\)/);
  assert.match(topicDelete, /trusted input origin document changed/);
  assert.match(topicDelete, /sequence\.keys\.length > 12/);
  assert.match(topicDelete, /Math\.min\(1000, Math\.round\(number\)\)/);

  console.log("security and mutation boundaries: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
