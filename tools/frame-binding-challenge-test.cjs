#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function functionSource(source, name, asyncFunction = false) {
  const prefix = `${asyncFunction ? "async " : ""}function ${name}(`;
  const start = source.indexOf(prefix);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = source.indexOf(") {", start) + 2;
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
    if (character === "\"" || character === "'" || character === "`") quote = character;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} body did not close`);
}

(async () => {
  const { createFrameBindingChallengeRegistry, validFrameBindingChallenge } = await import(
    `${pathToFileURL(path.join(root, "app/frame-bridge/frame-binding.js")).href}?test=${Date.now()}`
  );
  const {
    contentRuntimeIdentityForBundle,
    contentRuntimePackageBundleIdentityMatches
  } = await import(
    `${pathToFileURL(path.join(root, "shared/content-runtime-package-identity.js")).href}?test=${Date.now()}`
  );
  const runtimeIdentity = contentRuntimeIdentityForBundle("content/content.js");
  let now = 1000;
  let randomSeed = 0;
  const registry = createFrameBindingChallengeRegistry({
    now: () => now,
    ttlMs: 1200,
    randomValues(bytes) {
      randomSeed += 1;
      bytes.fill(randomSeed);
      return bytes;
    }
  });
  const iframe = { isConnected: true };

  const first = registry.issue(iframe);
  assert.equal(validFrameBindingChallenge(first.challenge), true);
  assert.equal(first.generation, 1);
  assert.equal(registry.issue(iframe), first, "an unexpired challenge must be reused instead of rotated by message spam");
  assert.equal(registry.claim(first.challenge, first.generation + 1), null, "the exact challenge generation is required");

  const claimed = registry.claim(first.challenge, first.generation);
  assert.equal(claimed, first);
  assert.equal(registry.claim(first.challenge, first.generation), null, "a challenge must be single-use");
  assert.equal(registry.issue(iframe), claimed, "a claimed challenge must hold its generation during asynchronous verification");
  assert.equal(registry.isCurrent(claimed), true);
  assert.equal(registry.finish(claimed), true);
  assert.equal(registry.isCurrent(claimed), false);

  const second = registry.issue(iframe);
  assert.equal(second.generation, 2);
  const rotated = registry.issue(iframe, { rotate: true });
  assert.equal(rotated.generation, 3);
  assert.equal(registry.claim(second.challenge, second.generation), null, "rotation must invalidate the previous document generation");

  now = rotated.expiresAt + 1;
  assert.equal(registry.claim(rotated.challenge, rotated.generation), null, "expired challenges must be rejected");
  const afterExpiry = registry.issue(iframe);
  assert.ok(afterExpiry.generation > rotated.generation);

  iframe.isConnected = false;
  assert.equal(registry.claim(afterExpiry.challenge, afterExpiry.generation), null, "detached iframe challenges must be rejected");
  assert.equal(registry.issue(iframe), null);

  iframe.isConnected = true;
  const invalidated = registry.issue(iframe);
  assert.equal(registry.invalidate(iframe), true);
  assert.equal(registry.claim(invalidated.challenge, invalidated.generation), null, "explicit invalidation must reject a late authenticated relay");

  const detachedWithoutReply = { isConnected: true };
  const detachedEntry = registry.issue(detachedWithoutReply);
  detachedWithoutReply.isConnected = false;
  registry.issue({ isConnected: true });
  assert.equal(registry.claim(detachedEntry.challenge, detachedEntry.generation), null, "issuing a later challenge must prune unresolved detached entries");

  let expireWithoutActivity;
  const timedRegistry = createFrameBindingChallengeRegistry({
    randomValues(bytes) { bytes.fill(99); return bytes; },
    setTimer(callback) { expireWithoutActivity = callback; return 1; },
    clearTimer() {}
  });
  const timedEntry = timedRegistry.issue({ isConnected: true });
  expireWithoutActivity();
  assert.equal(
    timedRegistry.claim(timedEntry.challenge, timedEntry.generation),
    null,
    "an unresolved challenge must expire without requiring a later registry operation"
  );

  for (const invalid of ["", "abc", "g".repeat(64), "a".repeat(63), "a".repeat(65)]) {
    assert.equal(validFrameBindingChallenge(invalid), false);
  }

  const controllerSource = fs.readFileSync(path.join(root, "app/frame-bridge/controller.js"), "utf8");
  const acceptSource = functionSource(controllerSource, "acceptAuthenticatedFrameBinding", true);
  const frameBindingId = "f".repeat(64);
  const boundFrame = () => ({
    isConnected: true,
    dataset: {
      browserFrameId: "11",
      frameBindingId,
      injectedBrowserDocumentId: "browser-document-1"
    }
  });
  function bindingFixture() {
    let seed = 20;
    const challenges = createFrameBindingChallengeRegistry({
      randomValues(bytes) {
        bytes.fill(++seed);
        return bytes;
      }
    });
    const remembered = [];
    const retries = [];
    const context = vm.createContext({
      CONTENT_BRIDGE_VERSION: "bridge-current",
      contentRuntimePackageBundleIdentityMatches,
      Number,
      String,
      frameBindingChallenges: challenges,
      rememberVerifiedContentFrameRegistration: (...args) => remembered.push(args),
      verifyContentFrameRegistration: async () => ({
        bridgeVersion: "bridge-current",
        frameId: 11,
        frameBindingId,
        browserDocumentId: "browser-document-1",
        runtimeIdentity
      }),
      window: { setTimeout: (callback, delay) => retries.push({ callback, delay }) }
    });
    vm.runInContext(`${acceptSource}\nglobalThis.accept = acceptAuthenticatedFrameBinding;`, context);
    return { challenges, context, remembered, retries };
  }
  const relay = (entry, overrides = {}) => {
    const { data = {}, ...rest } = overrides;
    return {
      challenge: entry.challenge,
      generation: entry.generation,
      data: {
        documentId: "bridge-document-1",
        browserDocumentId: "browser-document-1",
        frameBindingId,
        bridgeVersion: "bridge-current",
        runtimeIdentity,
        ...data
      },
      ...rest
    };
  };
  const senderContext = (overrides = {}) => ({
    tabId: 7,
    frameId: 11,
    documentId: "browser-document-1",
    bridgeDocumentId: "bridge-document-1",
    frameBindingId,
    ...overrides
  });

  {
    const fixture = bindingFixture();
    const frame = boundFrame();
    const entry = fixture.challenges.issue(frame);
    assert.equal(await fixture.context.accept(relay(entry), senderContext(), 7), true);
    assert.equal(fixture.remembered.length, 1);
    assert.equal(fixture.remembered[0][0], frame);
    assert.equal(await fixture.context.accept(relay(entry), senderContext(), 7), false, "an authenticated relay must still be single-use");
  }

  for (const invalid of [
    { label: "wrong extension tab", context: senderContext({ tabId: 8 }), data: {} },
    { label: "invalid child frame", context: senderContext({ frameId: 0 }), data: {} },
    { label: "mismatched relayed document", context: senderContext(), data: { documentId: "bridge-document-2" } },
    { label: "mismatched browser document", context: senderContext(), data: { browserDocumentId: "browser-document-2" } },
    { label: "stale bridge version", context: senderContext(), data: { bridgeVersion: "bridge-old" } },
    { label: "stale runtime identity", context: senderContext(), data: { runtimeIdentity: {} } }
  ]) {
    const fixture = bindingFixture();
    const entry = fixture.challenges.issue(boundFrame());
    assert.equal(await fixture.context.accept(relay(entry, { data: invalid.data }), invalid.context, 7), false, invalid.label);
    const stillPending = fixture.challenges.claim(entry.challenge, entry.generation);
    assert.equal(stillPending, entry, `${invalid.label} must be rejected before consuming the challenge`);
    fixture.challenges.finish(entry);
  }

  for (const mismatch of [
    {
      label: "authenticated relay for another browser frame",
      context: senderContext({ frameId: 12 }),
      data: {}
    },
    {
      label: "authenticated relay for another iframe binding id",
      context: senderContext({ frameBindingId: "e".repeat(64) }),
      data: { frameBindingId: "e".repeat(64) }
    }
  ]) {
    const fixture = bindingFixture();
    const entry = fixture.challenges.issue(boundFrame());
    assert.equal(await fixture.context.accept(relay(entry, { data: mismatch.data }), mismatch.context, 7), false, mismatch.label);
    assert.equal(
      fixture.challenges.claim(entry.challenge, entry.generation),
      null,
      `${mismatch.label} must consume the one-time authenticated challenge without binding the wrong iframe`
    );
    assert.equal(fixture.remembered.length, 0);
  }

  {
    const fixture = bindingFixture();
    const frame = boundFrame();
    const entry = fixture.challenges.issue(frame);
    fixture.context.verifyContentFrameRegistration = async () => {
      fixture.challenges.issue(frame, { rotate: true });
      return {
        bridgeVersion: "bridge-current",
        frameId: 11,
        frameBindingId,
        browserDocumentId: "browser-document-1",
        runtimeIdentity
      };
    };
    assert.equal(await fixture.context.accept(relay(entry), senderContext(), 7), false, "navigation during verification must invalidate the accepted relay");
    assert.equal(fixture.remembered.length, 0);
  }

  {
    const fixture = bindingFixture();
    const entry = fixture.challenges.issue(boundFrame());
    fixture.context.verifyContentFrameRegistration = async () => false;
    assert.equal(await fixture.context.accept(relay(entry), senderContext(), 7), false);
    assert.equal(fixture.retries.length, 1, "a failed liveness verification should request a fresh binding challenge");
    assert.equal(fixture.retries[0].delay, 100);
  }

  console.log("secure frame binding challenges: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
