#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

(async () => {
  const { createAuthenticatedFrameRelay } = await import(
    `${pathToFileURL(path.join(root, "background/frame-relay.js")).href}?test=${Date.now()}`
  );
  const sent = [];
  const remembered = [];
  let authentications = 0;
  const context = {
    tabId: 7,
    frameId: 9,
    documentId: "browser-document-1",
    browserDocumentId: "browser-document-1",
    frameBindingId: "f".repeat(64),
    bridgeVersion: "bridge-current",
    url: "https://example.com/thread",
    registeredAt: 100
  };
  const relay = createAuthenticatedFrameRelay({
    registeredSenderContext: async (message, sender) => {
      authentications += 1;
      assert.equal(message.bridgeDocumentId, "bridge-document-1");
      assert.equal(sender.frameId, 9);
      return { token: "bridge-document-1", context };
    },
    sendRuntimeMessage: async (message) => { sent.push(message); },
    relaySource: "authenticated-relay-source",
    shortcutActions: new Set(["newChat"]),
    rememberContext: (token, value) => remembered.push({ token, value: { ...value } })
  });
  const sender = { frameId: 9, documentId: "browser-document-1", tab: { id: 7 } };
  const base = {
    bridgeDocumentId: "bridge-document-1",
    browserDocumentId: "browser-document-1"
  };
  base.frameBindingId = "f".repeat(64);

  await relay.frameBinding({
    ...base,
    challenge: "a".repeat(64),
    generation: 3
  }, sender);
  assert.deepEqual(sent.shift(), {
    source: "authenticated-relay-source",
    action: "frameBinding",
    challenge: "a".repeat(64),
    generation: 3,
    senderContext: {
      tabId: 7,
      frameId: 9,
      documentId: "browser-document-1",
      bridgeDocumentId: "bridge-document-1",
      frameBindingId: "f".repeat(64),
      url: "https://example.com/thread"
    },
    data: {
      documentId: "bridge-document-1",
      browserDocumentId: "browser-document-1",
      frameBindingId: "f".repeat(64),
      bridgeVersion: "bridge-current"
    }
  });
  const authenticatedAfterBinding = authentications;
  await assert.rejects(
    relay.frameBinding({ ...base, challenge: "too-short", generation: 3 }, sender),
    /challenge is invalid/
  );
  assert.equal(authentications, authenticatedAfterBinding, "invalid challenges must be rejected before consulting frame state");
  await assert.rejects(
    relay.frameBinding({
      ...base,
      browserDocumentId: "browser-document-2",
      challenge: "b".repeat(64),
      generation: 4
    }, sender),
    /browser document changed/
  );

  await relay.shortcutTriggered({ ...base, shortcutAction: "newChat", matchObj: { digit: "4", ignored: true } }, sender);
  assert.deepEqual(sent.shift().matchObj, { digit: "4" });
  await assert.rejects(
    relay.shortcutTriggered({ ...base, shortcutAction: "unknown" }, sender),
    /Unknown shortcut action/
  );

  await relay.frameLifecycle({
    ...base,
    lifecycleAction: "locationChanged",
    data: { href: "https://example.com/thread/new", title: "New" }
  }, sender);
  assert.equal(remembered.length, 1);
  assert.equal(remembered[0].token, "bridge-document-1");
  assert.equal(remembered[0].value.url, "https://example.com/thread/new");
  const lifecycle = sent.shift();
  assert.equal(lifecycle.action, "frameLifecycle");
  assert.equal(lifecycle.data.documentId, "bridge-document-1");
  assert.equal(lifecycle.data.bridgeVersion, "bridge-current");

  await relay.frameLifecycle({ ...base, lifecycleAction: "contentUnloading", data: {} }, sender);
  assert.equal(remembered.length, 1, "unloading must not rewrite the registered location");
  await assert.rejects(
    relay.frameLifecycle({ ...base, lifecycleAction: "forged", data: {} }, sender),
    /Unknown frame lifecycle action/
  );

  const rejectingRelay = createAuthenticatedFrameRelay({
    registeredSenderContext: async () => { throw new Error("sender document changed"); },
    sendRuntimeMessage: async () => { throw new Error("must not send"); },
    relaySource: "authenticated-relay-source",
    shortcutActions: new Set(),
    rememberContext() {}
  });
  await assert.rejects(
    rejectingRelay.frameBinding({ ...base, challenge: "b".repeat(64), generation: 1 }, sender),
    /sender document changed/
  );

  console.log("authenticated background frame relay: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
