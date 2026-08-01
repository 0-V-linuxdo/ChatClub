#!/usr/bin/env node

const assert = require("node:assert/strict");

const FRAME_CONTEXT_SESSION_KEY = "chatclubSecureFrameContexts";
const EXTENSION_URL = "chrome-extension://chatclub-test/chatClub.html";

function memorySessionStorage() {
  const values = Object.create(null);
  const clone = (value) => value === undefined ? undefined : structuredClone(value);
  return {
    async get(keys) {
      const requested = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(requested
        .filter((key) => Object.hasOwn(values, key))
        .map((key) => [key, clone(values[key])]));
    },
    async set(update) {
      for (const [key, value] of Object.entries(update || {})) values[key] = clone(value);
    },
    snapshot(key) {
      return clone(values[key]);
    }
  };
}

function frameKey(tabId, frameId) {
  return `${tabId}:${frameId}`;
}

function createApi(session) {
  const frames = new Map();
  return {
    api: {
      runtime: {
        getURL(path = "") {
          return `chrome-extension://chatclub-test/${String(path || "").replace(/^\/+/, "")}`;
        }
      },
      storage: { session },
      webNavigation: {
        async getFrame({ tabId, frameId }) {
          const frame = frames.get(frameKey(tabId, frameId));
          return frame ? structuredClone(frame) : null;
        }
      },
      scripting: {
        async executeScript({ target }) {
          const frame = frames.get(frameKey(target.tabId, target.frameIds[0]));
          return [{
            documentId: String(frame?.documentId || ""),
            result: {
              legacyDocumentId: String(frame?.legacyDocumentId || ""),
              href: String(frame?.probeUrl || frame?.url || "")
            }
          }];
        }
      }
    },
    setFrame({
      tabId,
      frameId,
      documentId,
      legacyDocumentId = "",
      parentDocumentId = `extension-document-${tabId}`,
      url,
      probeUrl = url
    }) {
      frames.set(frameKey(tabId, frameId), {
        tabId,
        frameId,
        parentFrameId: 0,
        parentDocumentId,
        documentId,
        legacyDocumentId,
        url,
        probeUrl
      });
    }
  };
}

function bindingToken(seed) {
  const pair = Math.max(0, Number(seed) || 0).toString(16).padStart(2, "0").slice(-2);
  return pair.repeat(32);
}

(async () => {
  const [registryModule, identityModule] = await Promise.all([
    import("../background/secure-frame-contexts.js"),
    import("../shared/content-runtime-package-identity.js")
  ]);
  const { createSecureFrameContextRegistry } = registryModule;
  const runtimeIdentity = identityModule.contentRuntimeIdentityForBundle("content/content.js");
  const nativeNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;

  function fixture(session = memorySessionStorage()) {
    const frameApi = createApi(session);
    const registry = createSecureFrameContextRegistry(frameApi.api);
    async function register({
      token,
      tabId,
      frameId,
      documentId = "",
      browserDocumentId = "",
      legacyDocumentId = "",
      parentDocumentId = `extension-document-${tabId}`,
      url,
      frameUrl = url,
      probeUrl = frameUrl,
      seed = frameId,
      secureFrameToken = bindingToken(seed + 97),
      frameBindingId = bindingToken(seed)
    }) {
      const attestation = legacyDocumentId || `legacy:${bindingToken(seed + 151)}`;
      frameApi.setFrame({
        tabId,
        frameId,
        documentId,
        legacyDocumentId: attestation,
        parentDocumentId,
        url: frameUrl,
        probeUrl
      });
      await registry.register({
        bridgeDocumentId: token,
        browserDocumentId: browserDocumentId || attestation,
        secureFrameToken,
        frameBindingId,
        bridgeVersion: runtimeIdentity.protocolVersion,
        runtimeIdentity
      }, {
        frameId,
        ...(documentId ? { documentId } : {}),
        url,
        tab: { id: tabId, url: EXTENSION_URL }
      });
      return token;
    }
    return { frameApi, register, registry, session };
  }

  try {
    {
      const lifetime = fixture();
      const token = await lifetime.register({
        token: "bridge-document-long-lived",
        tabId: 7,
        frameId: 9,
        documentId: "browser-document-long-lived",
        url: "https://example.com/chat/long-lived"
      });
      const storedAtRegistration = lifetime.session.snapshot(FRAME_CONTEXT_SESSION_KEY)?.[token];
      assert.ok(storedAtRegistration, "registration must be persisted for service-worker recovery");

      now += 14 * 24 * 60 * 60 * 1000;
      const rehydrated = createSecureFrameContextRegistry(lifetime.frameApi.api);
      const restored = await rehydrated.context(token);
      assert.ok(restored, "a live registration must survive far beyond the former 30-minute idle cutoff");
      assert.equal(restored.documentId, "browser-document-long-lived");
      assert.equal(restored.parentDocumentId, "extension-document-7");
      const byFrame = await rehydrated.registeredFrameContext(7, 9);
      assert.equal(byFrame?.token, token, "service-worker rehydration must restore frame lookup state");
    }

    {
      const parentBound = fixture();
      const registration = {
        token: "bridge-document-parent-bound",
        tabId: 18,
        frameId: 12,
        documentId: "browser-document-parent-bound",
        url: "https://example.com/chat/parent-bound",
        seed: 72
      };
      const token = await parentBound.register({
        ...registration,
        parentDocumentId: "extension-parent-before"
      });
      const before = await parentBound.registry.context(token);
      now += 1;
      await parentBound.register({
        ...registration,
        parentDocumentId: "extension-parent-after"
      });
      const after = await parentBound.registry.context(token);
      assert.notStrictEqual(after, before, "a browser-reported parent document change must replace the context");
      assert.equal(after.parentDocumentId, "extension-parent-after");
      assert.equal(parentBound.registry.touch(token, before), false);
    }

    {
      const notion = fixture();
      const token = await notion.register({
        token: "bridge-document-notion-nonce",
        tabId: 71,
        frameId: 19,
        documentId: "browser-document-notion-nonce",
        url: `https://app.notion.com/ai?mode=new&__chatclub_frame_load_nonce=ccn-${"a".repeat(32)}#composer`
      });
      const expected = "https://app.notion.com/ai?mode=new#composer";
      assert.equal((await notion.registry.context(token))?.url, expected);
      assert.equal(
        notion.session.snapshot(FRAME_CONTEXT_SESSION_KEY)?.[token]?.url,
        expected,
        "secure-context storage.session must never persist the internal Notion nonce"
      );
    }

    {
      const notion = fixture();
      const nonce = `ccn-${"b".repeat(32)}`;
      const navigationUrl = `https://app.notion.com/ai?mode=new&__chatclub_frame_load_nonce=${nonce}#composer`;
      const logicalUrl = "https://app.notion.com/ai?mode=new#composer";
      const token = await notion.register({
        token: "bridge-document-notion-cleanup-race",
        tabId: 72,
        frameId: 20,
        documentId: "browser-document-notion-cleanup-race",
        url: navigationUrl,
        frameUrl: logicalUrl,
        probeUrl: logicalUrl
      });
      assert.equal((await notion.registry.context(token))?.url, logicalUrl);
    }

    {
      const notion = fixture();
      await assert.rejects(
        notion.register({
          token: "bridge-document-notion-different-nonce",
          tabId: 73,
          frameId: 21,
          documentId: "browser-document-notion-different-nonce",
          url: `https://app.notion.com/ai?__chatclub_frame_load_nonce=ccn-${"c".repeat(32)}`,
          frameUrl: `https://app.notion.com/ai?__chatclub_frame_load_nonce=ccn-${"d".repeat(32)}`
        }),
        /does not match a direct child document/
      );
    }

    {
      const duplicate = fixture();
      const registration = {
        token: "bridge-document-idempotent-registration",
        tabId: 8,
        frameId: 10,
        documentId: "browser-document-idempotent-registration",
        legacyDocumentId: `legacy:${bindingToken(241)}`,
        url: "https://example.com/chat/idempotent",
        seed: 42
      };
      const token = await duplicate.register(registration);
      const firstContext = await duplicate.registry.context(token);
      const firstRegisteredAt = firstContext.registeredAt;

      now += 10;
      await duplicate.register(registration);
      const repeatedContext = await duplicate.registry.context(token);
      assert.strictEqual(
        repeatedContext,
        firstContext,
        "an exactly identical same-document registration must preserve the in-flight context object"
      );
      assert.equal(repeatedContext.registeredAt, now, "an idempotent registration must refresh its registration time");
      assert.ok(repeatedContext.registeredAt > firstRegisteredAt);
      assert.equal(
        duplicate.registry.touch(token, firstContext),
        true,
        "an in-flight command must survive an authenticated duplicate registration for the same document"
      );

      now += 10;
      await duplicate.register({
        ...registration,
        secureFrameToken: bindingToken(250)
      });
      const replacedContext = await duplicate.registry.context(token);
      assert.notStrictEqual(
        replacedContext,
        firstContext,
        "a changed secure token must replace the registered context even when the browser document is unchanged"
      );
      assert.equal(
        duplicate.registry.touch(token, firstContext),
        false,
        "a changed secure identity must still invalidate an older in-flight command"
      );
    }

    {
      const capped = fixture();
      const total = 512;
      for (let index = 0; index < total; index += 1) {
        now += 1;
        await capped.register({
          token: `bridge-document-cap-${index}`,
          tabId: 20,
          frameId: index + 1,
          documentId: `browser-document-cap-${index}`,
          url: `https://example.com/chat/cap-${index}`,
          seed: index + 1
        });
      }
      const oldestToken = "bridge-document-cap-0";
      const oldestContext = await capped.registry.context(oldestToken);
      now += 1;
      assert.equal(capped.registry.touch(oldestToken, oldestContext), true);
      for (let index = total; index < total + 8; index += 1) {
        now += 1;
        await capped.register({
          token: `bridge-document-cap-${index}`,
          tabId: 20,
          frameId: index + 1,
          documentId: `browser-document-cap-${index}`,
          url: `https://example.com/chat/cap-${index}`,
          seed: index + 1
        });
      }
      const persisted = capped.session.snapshot(FRAME_CONTEXT_SESSION_KEY) || {};
      assert.equal(Object.keys(persisted).length, 512, "registry persistence must remain capped at 512 contexts");
      assert.ok(await capped.registry.context(oldestToken), "entry cap must preserve a recently active long-lived context");
      assert.equal(await capped.registry.context("bridge-document-cap-1"), null, "entry cap must prune the least-recently-active context");
      assert.ok(await capped.registry.context(`bridge-document-cap-${total + 7}`), "entry cap must preserve the newest context");
    }

    {
      const frames = fixture();
      const tabId = 31;
      const frameId = 4;
      const staleToken = await frames.register({
        token: "bridge-document-before-navigation",
        tabId,
        frameId,
        documentId: "browser-document-before-navigation",
        url: "https://example.com/chat/before"
      });
      const staleContext = await frames.registry.context(staleToken);
      now += 20;
      assert.equal(frames.registry.touch(staleToken, staleContext), true);
      frames.frameApi.setFrame({
        tabId,
        frameId,
        documentId: "browser-document-current",
        url: "https://example.com/chat/current"
      });
      await frames.registry.forgetFrame(tabId, frameId, {
        documentId: "browser-document-current",
        registeredBefore: now - 10
      });
      assert.equal(await frames.registry.context(staleToken), null, "navigation cleanup must remove the stale frame document");
      assert.equal(
        frames.registry.touch(staleToken, staleContext),
        false,
        "an in-flight command must not resurrect a context removed by navigation cleanup"
      );

      const currentToken = await frames.register({
        token: "bridge-document-current",
        tabId,
        frameId,
        documentId: "browser-document-current",
        url: "https://example.com/chat/current"
      });
      await frames.registry.forgetFrame(tabId, frameId, { documentId: "browser-document-current" });
      assert.ok(await frames.registry.context(currentToken), "navigation cleanup must preserve a matching current document");

      const registeredBefore = now;
      now += 10;
      const racedToken = await frames.register({
        token: "bridge-document-after-navigation-event",
        tabId: 32,
        frameId: 5,
        documentId: "browser-document-after-navigation-event",
        url: "https://example.com/chat/registered-after-event"
      });
      await frames.registry.forgetFrame(32, 5, { documentId: "", registeredBefore });
      assert.ok(
        await frames.registry.context(racedToken),
        "navigation cleanup must preserve a context registered after its event cutoff"
      );

      const equalCutoff = now;
      const equalToken = await frames.register({
        token: "bridge-document-at-navigation-cutoff",
        tabId: 33,
        frameId: 6,
        documentId: "browser-document-at-navigation-cutoff",
        url: "https://example.com/chat/registered-at-event"
      });
      await frames.registry.forgetFrame(33, 6, { documentId: "", registeredBefore: equalCutoff });
      assert.ok(
        await frames.registry.context(equalToken),
        "document-id compatibility cleanup must preserve a registration from the event's clock tick"
      );

      const earlierCommitAt = now;
      now += 1;
      const laterNavigationToken = await frames.register({
        token: "bridge-document-later-navigation",
        tabId: 37,
        frameId: 10,
        documentId: "browser-document-later-navigation",
        url: "https://example.com/chat/later-navigation"
      });
      await frames.registry.forgetFrame(37, 10, {
        documentId: "browser-document-earlier-navigation",
        registeredBefore: earlierCommitAt
      });
      assert.ok(
        await frames.registry.context(laterNavigationToken),
        "a delayed earlier onCommitted cleanup must not delete a later official browser document"
      );

      const rehydrated = createSecureFrameContextRegistry(frames.frameApi.api);
      assert.ok(await rehydrated.context(currentToken), "preserved frame cleanup state must survive registry rehydration");
      assert.equal(await rehydrated.context(staleToken), null, "removed stale frame state must stay removed after rehydration");
      assert.ok(await rehydrated.context(racedToken), "event-cutoff preservation must survive registry rehydration");
      await rehydrated.forgetFrame(tabId, frameId, { documentId: "" });
      assert.equal(await rehydrated.context(currentToken), null, "empty document identity must forget every context for the frame");

      const legacyUrl = "https://example.com/chat/legacy";
      const currentLegacyId = `legacy:${bindingToken(201)}`;
      frames.frameApi.setFrame({
        tabId: 34,
        frameId: 7,
        documentId: "",
        legacyDocumentId: currentLegacyId,
        url: legacyUrl
      });
      await assert.rejects(
        frames.registry.register({
          bridgeDocumentId: "bridge-document-stale-legacy",
          browserDocumentId: `legacy:${bindingToken(202)}`,
          secureFrameToken: bindingToken(203),
          frameBindingId: bindingToken(204),
          bridgeVersion: runtimeIdentity.protocolVersion,
          runtimeIdentity
        }, {
          frameId: 7,
          url: legacyUrl,
          tab: { id: 34, url: EXTENSION_URL }
        }),
        /legacy document changed/,
        "a delayed legacy registration must not overwrite the current browser document"
      );

      frames.frameApi.setFrame({
        tabId: 35,
        frameId: 8,
        documentId: "browser-document-current-official",
        legacyDocumentId: `legacy:${bindingToken(211)}`,
        url: legacyUrl
      });
      await assert.rejects(
        frames.registry.register({
          bridgeDocumentId: "bridge-document-missing-sender-id",
          browserDocumentId: `legacy:${bindingToken(212)}`,
          secureFrameToken: bindingToken(213),
          frameBindingId: bindingToken(214),
          bridgeVersion: runtimeIdentity.protocolVersion,
          runtimeIdentity
        }, {
          frameId: 8,
          url: legacyUrl,
          tab: { id: 35, url: EXTENSION_URL }
        }),
        /legacy document changed/,
        "a missing sender document ID must not bind an old attestation to the current official browser document"
      );

      frames.frameApi.setFrame({
        tabId: 36,
        frameId: 9,
        documentId: "",
        legacyDocumentId: `legacy:${bindingToken(221)}`,
        url: legacyUrl
      });
      await assert.rejects(
        frames.registry.register({
          bridgeDocumentId: "bridge-document-missing-navigation-id",
          browserDocumentId: `legacy:${bindingToken(222)}`,
          secureFrameToken: bindingToken(223),
          frameBindingId: bindingToken(224),
          bridgeVersion: runtimeIdentity.protocolVersion,
          runtimeIdentity
        }, {
          frameId: 9,
          documentId: "browser-document-stale-sender",
          url: legacyUrl,
          tab: { id: 36, url: EXTENSION_URL }
        }),
        /legacy document changed/,
        "a missing navigation document ID must still reject an old sender attestation"
      );
    }

    {
      const tabs = fixture();
      const first = await tabs.register({
        token: "bridge-document-tab-one-a",
        tabId: 41,
        frameId: 1,
        documentId: "browser-document-tab-one-a",
        url: "https://example.com/chat/tab-one-a"
      });
      const second = await tabs.register({
        token: "bridge-document-tab-one-b",
        tabId: 41,
        frameId: 2,
        documentId: "browser-document-tab-one-b",
        url: "https://example.com/chat/tab-one-b"
      });
      const unrelated = await tabs.register({
        token: "bridge-document-tab-two",
        tabId: 42,
        frameId: 1,
        documentId: "browser-document-tab-two",
        url: "https://example.com/chat/tab-two"
      });

      const topLevelCommitAt = now + 1;
      now = topLevelCommitAt;
      const replacement = await tabs.register({
        token: "bridge-document-tab-one-replacement",
        tabId: 41,
        frameId: 3,
        documentId: "browser-document-tab-one-replacement",
        url: "https://example.com/chat/tab-one-replacement"
      });
      await tabs.registry.forgetTab(41, { registeredBefore: topLevelCommitAt });
      assert.equal(await tabs.registry.context(first), null, "top-level navigation must remove prior child-frame state");
      assert.equal(await tabs.registry.context(second), null, "top-level navigation must remove every prior child-frame context");
      assert.ok(await tabs.registry.context(replacement), "top-level navigation cleanup must preserve a replacement registered on its event tick");

      await tabs.registry.forgetTab(41);
      assert.equal(await tabs.registry.context(replacement), null, "tab cleanup must remove every replacement context owned by the tab");
      assert.ok(await tabs.registry.context(unrelated), "tab cleanup must preserve contexts owned by other tabs");

      const rehydrated = createSecureFrameContextRegistry(tabs.frameApi.api);
      assert.equal(await rehydrated.context(first), null, "forgotten tab state must stay removed after rehydration");
      assert.ok(await rehydrated.context(unrelated), "unrelated persisted tab state must survive rehydration");
    }

    console.log("secure frame context lifetime and cleanup: ok");
  } finally {
    Date.now = nativeNow;
  }
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
