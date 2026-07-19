#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

const { functionSource } = require("./function-source.cjs");

function identityTarget() {
  const listeners = new Map();
  let randomSeed = 1;
  const target = {
    name: `chatclub_frame_binding=${"a".repeat(64)}`,
    URLSearchParams,
    __CHATCLUB_CONTENT_DOCUMENT_ID__: "document-fixed",
    __CHATCLUB_SECURE_FRAME_TOKEN__: "b".repeat(32),
    crypto: {
      getRandomValues(bytes) {
        bytes.fill(randomSeed);
        randomSeed += 1;
        return bytes;
      }
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    }
  };
  return {
    target,
    emit(type) {
      for (const listener of listeners.get(type) || []) listener({ type });
    },
    listenerCount(type) {
      return listeners.get(type)?.length || 0;
    }
  };
}

(async () => {
  const [identityModule, submissionModule, adapterModule, styleModule] = await Promise.all([
    import(moduleUrl("content-src/shared/content-document-identity.js")),
    import(moduleUrl("content-src/shared/submission-navigation.js")),
    import(moduleUrl("content-src/message-navigator/adapters.js")),
    import(moduleUrl("content-src/message-navigator/styles.js"))
  ]);

  const fixture = identityTarget();
  const identity = identityModule.createContentDocumentIdentity(fixture.target);
  assert.equal(identity.contentDocumentId, "document-fixed");
  assert.equal(identity.secureFrameToken, "b".repeat(32));
  assert.equal(identity.currentFrameBindingId(), "a".repeat(64));
  assert.equal(fixture.listenerCount("pagehide"), 1);
  assert.equal(fixture.listenerCount("pageshow"), 1);
  const stateDescriptor = Object.getOwnPropertyDescriptor(
    fixture.target,
    "__CHATCLUB_BROWSER_DOCUMENT_ATTESTATION_STATE__"
  );
  assert.equal(stateDescriptor.configurable, false);
  assert.equal(stateDescriptor.writable, false);
  assert.match(identity.currentBrowserDocumentAttestationId(), /^legacy:[a-f0-9]{64}$/);
  const firstAttestation = identity.currentBrowserDocumentAttestationId();
  fixture.emit("pagehide");
  assert.equal(
    identity.currentBrowserDocumentAttestationId({ allowDirty: true }),
    firstAttestation,
    "unload reporting must retain the dirty document attestation"
  );
  const rotatedAttestation = identity.currentBrowserDocumentAttestationId();
  assert.notEqual(rotatedAttestation, firstAttestation);
  assert.equal(fixture.target.__CHATCLUB_BROWSER_DOCUMENT_ATTESTATION_STATE__.epoch, 2);
  fixture.emit("pagehide");
  fixture.emit("pageshow");
  assert.equal(fixture.target.__CHATCLUB_BROWSER_DOCUMENT_ATTESTATION_STATE__.epoch, 3);
  identityModule.createContentDocumentIdentity(fixture.target);
  assert.equal(fixture.listenerCount("pagehide"), 1, "identity reinjection must not duplicate lifecycle listeners");
  fixture.target.__CHATCLUB_FRAME_BINDING_ID__ = "invalid";
  assert.equal(identity.currentFrameBindingId(), "", "an invalid privileged binding must fail closed");
  fixture.target.__CHATCLUB_FRAME_BINDING_ID__ = "c".repeat(64);
  assert.equal(identity.currentFrameBindingId(), "c".repeat(64));

  let now = 1_000;
  const navigationTarget = { location: { href: "https://example.test/chat/1" } };
  const tracker = submissionModule.createSubmissionNavigationTracker(navigationTarget, () => now);
  assert.equal(tracker.mark({}, "button"), null);
  const marked = tracker.mark({ sendId: "send-1", appName: "Example", deadlineAt: 5_000 }, "button");
  assert.deepEqual(marked, {
    sendId: "send-1",
    appId: "Example",
    initialHref: "https://example.test/chat/1",
    activatedAt: 1_000,
    expiresAt: 20_000,
    method: "button"
  });
  assert.equal(tracker.current().sendId, "send-1");
  assert.equal(tracker.current("popstate"), null, "history traversal must not be attributed to prompt submission");
  tracker.clearForTrustedIntent({ isTrusted: false, type: "pointerdown", target: {} });
  assert.equal(tracker.current().sendId, "send-1");
  const newChatControl = {
    getAttribute(name) { return name === "aria-label" ? "New chat" : ""; },
    innerText: "",
    textContent: ""
  };
  tracker.clearForTrustedIntent({
    isTrusted: true,
    type: "pointerdown",
    target: {
      nodeType: 1,
      closest(selector) {
        return selector.startsWith("a[") ? null : newChatControl;
      }
    }
  });
  assert.equal(tracker.current(), null);
  tracker.mark({ sendId: "send-2" }, "enter");
  now = 20_001;
  assert.equal(tracker.current(), null, "expired submission ownership must be removed");
  assert.equal(navigationTarget.__CHATCLUB_ACTIVE_SUBMISSION_NAVIGATION__, undefined);

  assert.throws(
    () => adapterModule.createMessageNavigatorAdapters({ safeQsa: () => [] }),
    /do not accept injected callbacks/,
    "site adapters must own their implementation instead of receiving a callback bag"
  );
  const adapters = adapterModule.createMessageNavigatorAdapters();
  assert.deepEqual(Object.keys(adapters).sort(), [
    "aiStudio",
    "chatgpt",
    "claude",
    "deepseek",
    "gemini",
    "generic",
    "grok",
    "kagi",
    "lechat",
    "notion",
    "poe"
  ]);
  assert.equal(Object.isFrozen(adapters), true);
  for (const adapter of Object.values(adapters)) assert.equal(typeof adapter.collect, "function");
  const navigatorCss = styleModule.messageNavigatorCss("navigator-root", "#123456");
  assert.match(navigatorCss, /#navigator-root/);
  assert.match(navigatorCss, /--cc-message-nav-accent: #123456/);

  const contentSource = fs.readFileSync(path.join(root, "content-src/content.js"), "utf8");
  const navigatorSource = fs.readFileSync(path.join(root, "content-src/message-navigator.js"), "utf8");
  const navigatorEngineSource = fs.readFileSync(path.join(root, "content-src/message-navigator/engine.js"), "utf8");
  assert.match(contentSource, /createContentDocumentIdentity\(window\)/);
  assert.match(contentSource, /createSubmissionNavigationTracker\(window\)/);
  assert.doesNotMatch(contentSource, /function browserDocumentAttestationState/);
  assert.doesNotMatch(contentSource, /function normalizedSubmissionNavigation/);
  const activateContentGenerationSource = functionSource(contentSource, "activateContentGeneration");
  const locationResourceSource = functionSource(contentSource, "installLocationReportResources");
  const shortcutResourceSource = functionSource(contentSource, "installShortcutBridgeResources");
  assert.match(activateContentGenerationSource, /installLocationReportResources\(\)/);
  assert.match(activateContentGenerationSource, /installShortcutBridgeResources\(\)/);
  assert.ok(
    locationResourceSource.indexOf("locationReportCleanup =") < locationResourceSource.indexOf("window.addEventListener"),
    "location cleanup ownership must exist before activation allocates its first listener"
  );
  assert.ok(
    locationResourceSource.indexOf("locationReportCleanup =") < locationResourceSource.indexOf("setInterval"),
    "location cleanup ownership must exist before activation allocates its timer"
  );
  assert.ok(
    shortcutResourceSource.indexOf("shortcutBridgeCleanup =") < shortcutResourceSource.indexOf("window.addEventListener"),
    "shortcut cleanup ownership must exist before activation allocates its listener"
  );
  assert.ok(
    shortcutResourceSource.indexOf("shortcutBridgeCleanup =") < shortcutResourceSource.indexOf("storage?.onChanged?.addListener"),
    "shortcut cleanup ownership must exist before activation allocates its storage listener"
  );
  const contentOutsideOwnedResources = contentSource
    .replace(locationResourceSource, "")
    .replace(shortcutResourceSource, "");
  assert.doesNotMatch(contentOutsideOwnedResources, /new AbortController\(\)|setInterval\(/);
  assert.doesNotMatch(contentOutsideOwnedResources, /storage\?\.onChanged\?\.addListener/);
  assert.match(navigatorSource, /createMessageNavigatorAdapters\(\)/);
  assert.match(navigatorSource, /new MessageNavigator\(\{/);
  assert.doesNotMatch(navigatorSource, /function (?:grok|notion|kagi|genericRole|resolveEffectTarget)/);
  assert.doesNotMatch(navigatorSource, /class MessageNavigator/);
  assert.match(navigatorEngineSource, /messageNavigatorCss\(ROOT_ID, this\.options\.primaryColor\)/);
  assert.doesNotMatch(navigatorSource, /@keyframes chatclub-message-nav-pulse/);

  console.log("content author module boundaries and lifecycle behavior: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
