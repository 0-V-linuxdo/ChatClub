#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const extensionMessages = [];
let extensionMessageHandler = null;

globalThis.browser = {
  tabs: {
    async getCurrent() { return { id: 91 }; }
  },
  runtime: {
    async sendMessage(message) {
      extensionMessages.push(message);
      if (typeof extensionMessageHandler === "function") {
        return completeBackgroundResponse(message, await extensionMessageHandler(message));
      }
      return { success: false, error: "unexpected extension runtime request" };
    }
  }
};

const DEFAULT_HREF = "https://chat.deepseek.com/a/chat/s/topic-1";
const DEFAULT_IDENTITY = Object.freeze({ provider: "deepseek", id: "topic-1" });
const CLAUDE_HREF = "https://claude.ai/chat/thread-1";

function completeBackgroundResponse(message, response) {
  if (response?.success !== true) return response;
  if (message.action === "dispatchTrustedClick" || message.action === "dispatchTrustedMouseMove") {
    return {
      tabId: message.tabId,
      frameId: message.expectedFrameId,
      x: message.x,
      y: message.y,
      ...response
    };
  }
  if (message.action === "dispatchTrustedKeySequence") {
    return {
      tabId: message.tabId,
      frameId: message.expectedFrameId,
      keys: message.keys,
      ...response
    };
  }
  return response;
}

function frameError(code, delivered, message = `${code} while deleting`) {
  const error = new Error(message);
  error.code = code;
  error.delivered = delivered;
  return error;
}

function secureIframe(href = DEFAULT_HREF) {
  const ownerDocument = { activeElement: null };
  const iframe = {
    isConnected: true,
    ownerDocument,
    dataset: {
      browserFrameId: "7",
      frameBindingId: "a".repeat(64),
      injectedBrowserDocumentId: "browser-document-1",
      preferredModelDocumentId: "bridge-document-1",
      currentHref: href
    },
    clientLeft: 0,
    clientTop: 0,
    getBoundingClientRect() {
      return { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 };
    },
    getAttribute(name) {
      return name === "src" ? href : "";
    },
    focus() {
      ownerDocument.activeElement = iframe;
      iframe.focusCalls = Number(iframe.focusCalls || 0) + 1;
    }
  };
  return iframe;
}

function createFixture(createTopicDeleteRuntime, options = {}) {
  const calls = [];
  const requests = [];
  const ensureCalls = [];
  const invalidations = [];
  let locationCalls = 0;
  let deleteCalls = 0;
  let confirmCalls = 0;
  const framePort = {
    invalidate(iframe, reason, invalidateOptions) {
      invalidations.push({ iframe, reason, options: { ...invalidateOptions } });
    },
    async ensure(iframe, ensureOptions) {
      ensureCalls.push({ iframe, options: ensureOptions });
      if (options.ensureError) throw options.ensureError;
      if (typeof options.ensureResult === "function") {
        return options.ensureResult(iframe, ensureOptions, ensureCalls.length);
      }
      return options.ensureResult || { documentId: "bridge-document-1" };
    },
    async request(iframe, command, data) {
      calls.push(command);
      requests.push({ command, data });
      if (command === "getLocationHref") {
        locationCalls += 1;
        if (typeof options.onLocationRequest === "function") {
          options.onLocationRequest(iframe, locationCalls);
        }
        if (Array.isArray(options.failLocationCalls) && options.failLocationCalls.includes(locationCalls)) {
          throw frameError("NOT_REGISTERED", false, "content frame is not registered");
        }
        const hrefs = Array.isArray(options.hrefs) ? options.hrefs : [];
        return hrefs[Math.min(locationCalls - 1, Math.max(0, hrefs.length - 1))]
          || options.href
          || DEFAULT_HREF;
      }
      if (command === "getDeleteConfirmState") {
        if (options.confirmStateError) throw options.confirmStateError;
        const states = Array.isArray(options.confirmStates) ? options.confirmStates : [];
        const configured = states[Math.min(confirmCalls, Math.max(0, states.length - 1))];
        confirmCalls += 1;
        if (typeof configured === "function") return configured(data, confirmCalls);
        if (states.length) return configured;
        return {
          version: 1,
          present: false,
          target: data?.identity
            ? { identity: data.identity, current: false, present: false }
            : null
        };
      }
      if (command === "deleteThread") {
        deleteCalls += 1;
        if (deleteCalls === 1 && options.firstDeleteError) throw options.firstDeleteError;
        if (typeof options.deleteResult === "function") return options.deleteResult(data, deleteCalls);
        return options.deleteResult || { ok: true, site: "probe" };
      }
      throw new Error(`Unexpected frame command: ${command}`);
    }
  };
  const runtime = createTopicDeleteRuntime({
    framePort,
    completionTimeoutMs: options.completionTimeoutMs || 180,
    completionPollMs: options.completionPollMs || 10,
    completionStableMs: options.completionStableMs || 50
  });
  const messageStart = extensionMessages.length;
  const iframe = options.iframe || { isConnected: true };
  return {
    calls,
    requests,
    ensureCalls,
    invalidations,
    get deleteCalls() { return deleteCalls; },
    get confirmCalls() { return confirmCalls; },
    get trustedDispatchCalls() {
      return extensionMessages
        .slice(messageStart)
        .filter((message) => /^dispatchTrusted/.test(String(message?.action || "")))
        .length;
    },
    get rawEnsureContentBridgeCalls() {
      return extensionMessages
        .slice(messageStart)
        .filter((message) => message?.action === "ensureContentBridge")
        .length;
    },
    async execute() {
      extensionMessageHandler = options.extensionMessageHandler || null;
      try {
        return await runtime.executeTopicDelete(
          iframe,
          { appId: "probe" },
          { id: "probe" },
          5000
        );
      } finally {
        extensionMessageHandler = null;
      }
    }
  };
}

(async () => {
  const moduleUrl = pathToFileURL(path.join(root, "app/topic-delete/runtime.js")).href;
  const { createTopicDeleteRuntime } = await import(moduleUrl);

  assert.throws(
    () => createTopicDeleteRuntime({ framePort: { async request() {} } }),
    /requires framePort\.ensure/,
    "Topic Delete must require authenticated bridge recovery through framePort.ensure"
  );
  assert.throws(
    () => createTopicDeleteRuntime({ framePort: { async ensure() {}, async request() {} } }),
    /requires framePort\.invalidate/,
    "Topic Delete must require identity-aware bridge invalidation before a safe retry"
  );

  for (const failure of [
    frameError("TIMEOUT", true, "[FrameRPC] Timeout waiting for response: deleteThread"),
    frameError("TIMEOUT", false, "[FrameRPC] Timeout waiting for response: deleteThread"),
    frameError("NOT_REGISTERED", true, "registered response was lost"),
    new Error("[PostMessage] Timeout waiting for response: deleteThread")
  ]) {
    const fixture = createFixture(createTopicDeleteRuntime, { firstDeleteError: failure });
    await assert.rejects(fixture.execute(), (error) => error === failure);
    assert.equal(fixture.deleteCalls, 1, "a possibly delivered mutating delete must never be retried");
    assert.equal(fixture.confirmCalls, 1, "an uncertain delivery error may perform one read-only completion audit");
    assert.equal(fixture.trustedDispatchCalls, 0, "an uncertain delivery error must never dispatch trusted input");
  }

  {
    const failure = frameError("TIMEOUT", true, "delete response was lost");
    const fixture = createFixture(createTopicDeleteRuntime, {
      firstDeleteError: failure,
      iframe: secureIframe(),
      confirmStates: [(data) => ({
        version: 1,
        present: true,
        target: { identity: data.identity, current: true, present: true },
        trustedClick: { attemptId: "unowned-probe-click", framePoint: { x: 20, y: 20 } }
      })]
    });
    await assert.rejects(fixture.execute(), (error) => error === failure);
    assert.equal(fixture.deleteCalls, 1);
    assert.equal(fixture.confirmCalls, 1);
    assert.equal(fixture.trustedDispatchCalls, 0, "probe-owned coordinates cannot authorize a trusted click");
  }

  for (const code of ["NOT_REGISTERED", "STALE_DOCUMENT", "INJECTION_FAILED"]) {
    const failure = frameError(code, false);
    const fixture = createFixture(createTopicDeleteRuntime, { firstDeleteError: failure });
    assert.deepEqual(await fixture.execute(), { ok: true, site: "probe" });
    assert.equal(fixture.deleteCalls, 2, `${code} before delivery should retry after a successful bridge probe`);
    assert.deepEqual(
      fixture.calls.slice(0, 4),
      ["getLocationHref", "deleteThread", "getLocationHref", "deleteThread"]
    );
    assert.deepEqual(fixture.invalidations, [{
      iframe: fixture.ensureCalls[0].iframe,
      reason: `deleteThread:${code}`,
      options: {
        preserveDocument: code !== "STALE_DOCUMENT",
        clearCapabilities: code === "INJECTION_FAILED"
      }
    }], `${code} recovery must invalidate only the state proven stale`);
    assert.equal(fixture.ensureCalls.length, 1, `${code} recovery must authenticate a fresh frame binding`);
    assert.deepEqual(
      fixture.ensureCalls[0].options,
      { features: ["delete"], force: true },
      `${code} recovery must request the Delete feature through framePort.ensure`
    );
    assert.equal(
      fixture.rawEnsureContentBridgeCalls,
      0,
      `${code} recovery must not bypass FrameRuntimePort with a raw ensureContentBridge message`
    );
    assert.ok(
      fixture.calls.slice(4).length >= 2
      && fixture.calls.slice(4).every((command) => command === "getDeleteConfirmState"),
      "successful completion must use only repeated read-only probes after the retry"
    );
    const deleteRequests = fixture.requests.filter((request) => request.command === "deleteThread");
    assert.equal(deleteRequests.length, 2);
    assert.match(
      deleteRequests[0].data.deleteAttemptId,
      /^(?:[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}|delete-[a-f0-9]{48})$/i,
      "delete attempts require a cryptographically random identifier"
    );
    assert.equal(
      deleteRequests[1].data.deleteAttemptId,
      deleteRequests[0].data.deleteAttemptId,
      "a pre-delivery retry must reuse the exact same attempt identity"
    );
    assert.deepEqual(deleteRequests[0].data.expectedDeleteIdentity, DEFAULT_IDENTITY);
    assert.deepEqual(deleteRequests[1].data.expectedDeleteIdentity, DEFAULT_IDENTITY);
    assert.equal(deleteRequests[0].data.payload.deleteAttemptId, deleteRequests[0].data.deleteAttemptId);
  }

  {
    const recoveryError = new Error("authenticated bridge repair unavailable");
    const fixture = createFixture(createTopicDeleteRuntime, {
      firstDeleteError: frameError("NOT_REGISTERED", false),
      ensureError: recoveryError
    });
    await assert.rejects(
      fixture.execute(),
      /iframe content bridge recovery failed: authenticated bridge repair unavailable/
    );
    assert.equal(fixture.ensureCalls.length, 1, "failed recovery must make one authenticated ensure attempt");
    assert.equal(fixture.invalidations.length, 1, "failed recovery must still invalidate the stale background registration");
    assert.deepEqual(
      fixture.ensureCalls[0].options,
      { features: ["delete"], force: true },
      "failed recovery must use the same force-authenticated Delete contract"
    );
    assert.equal(
      fixture.rawEnsureContentBridgeCalls,
      0,
      "failed recovery must not fall back to a raw ensureContentBridge runtime message"
    );
    assert.equal(fixture.deleteCalls, 1, "delete must not retry when pre-delivery bridge recovery fails");
    assert.equal(fixture.confirmCalls, 0, "an explicit pre-delivery recovery failure must not inspect an unrelated dialog");
    assert.equal(fixture.trustedDispatchCalls, 0);
  }

  {
    const fixture = createFixture(createTopicDeleteRuntime, {
      deleteResult: {
        ok: false,
        site: "probe",
        reason: "ordinary runner failure",
        needsTrustedClick: true,
        trustedClick: { framePoint: { x: 20, y: 20 } }
      },
      iframe: secureIframe(),
      confirmStates: [(data) => ({
        version: 1,
        present: true,
        target: { identity: data.identity, current: true, present: true },
        trustedClick: { framePoint: { x: 20, y: 20 } }
      })]
    });
    await assert.rejects(fixture.execute(), /ordinary runner failure/);
    assert.equal(fixture.deleteCalls, 1);
    assert.equal(fixture.confirmCalls, 0, "ordinary runner failure must not adopt an existing dialog");
    assert.equal(fixture.trustedDispatchCalls, 0, "an unbound runner instruction must not dispatch");
  }

  {
    const fixture = createFixture(createTopicDeleteRuntime, {
      deleteResult: (data) => ({
        ok: false,
        site: "probe",
        reason: "bound confirmation click",
        needsTrustedClick: true,
        trustedClick: {
          attemptId: data.deleteAttemptId,
          documentId: "bridge-document-1",
          framePoint: { x: 20, y: 20 }
        }
      }),
      iframe: secureIframe(),
      extensionMessageHandler(message) {
        if (message.action === "dispatchTrustedClick") throw new Error("trusted click transport failed");
        return { success: false, error: "unexpected runtime request" };
      }
    });
    await assert.rejects(fixture.execute(), /trusted click transport failed/);
    assert.equal(fixture.deleteCalls, 1, "a trusted dispatch failure must not trigger another delete");
    assert.equal(fixture.confirmCalls, 0, "a trusted dispatch failure must not trigger completion probing");
    assert.equal(fixture.trustedDispatchCalls, 1);
  }

  {
    const fixture = createFixture(createTopicDeleteRuntime, {
      deleteResult: (data) => ({
        ok: false,
        site: "probe",
        reason: "oversized trusted menu instruction",
        needsTrustedMenuClick: true,
        trustedMenuClick: {
          attemptId: data.deleteAttemptId,
          documentId: "bridge-document-1",
          framePoints: Array.from({ length: 13 }, (_, index) => ({ x: 20 + index, y: 20 }))
        }
      }),
      iframe: secureIframe()
    });
    await assert.rejects(fixture.execute(), /oversized trusted menu instruction/);
    assert.equal(fixture.deleteCalls, 1);
    assert.equal(fixture.confirmCalls, 0);
    assert.equal(fixture.trustedDispatchCalls, 0, "an oversized framePoints list must be rejected as a whole");
  }

  {
    const fixture = createFixture(createTopicDeleteRuntime, {
      deleteResult: (data) => ({
        ok: false,
        site: "probe",
        reason: "oversized trusted key instruction",
        needsTrustedKeySequence: true,
        trustedKeySequence: {
          attemptId: data.deleteAttemptId,
          documentId: "bridge-document-1",
          keys: Array.from({ length: 13 }, () => ({ key: "Tab" }))
        }
      }),
      iframe: secureIframe()
    });
    await assert.rejects(fixture.execute(), /oversized trusted key instruction/);
    assert.equal(fixture.deleteCalls, 1);
    assert.equal(fixture.confirmCalls, 0);
    assert.equal(fixture.trustedDispatchCalls, 0, "an oversized key list must be rejected as a whole");
  }

  for (const [label, resultSite, clickFields] of [
    ["legacy delete-confirm", "claude", { kind: "delete-confirm", site: "claude" }],
    ["missing kind and site", "claude", {}],
    ["malformed foreign labels", "probe", { kind: "unexpected", site: "other" }]
  ]) {
    const iframe = secureIframe(CLAUDE_HREF);
    const fixture = createFixture(createTopicDeleteRuntime, {
      iframe,
      href: CLAUDE_HREF,
      deleteResult: (data) => ({
        ok: false,
        site: resultSite,
        reason: `stale Claude trusted click: ${label}`,
        needsTrustedClick: true,
        trustedClick: {
          attemptId: data.deleteAttemptId,
          documentId: "bridge-document-1",
          framePoint: { x: 20, y: 20 },
          ...clickFields
        }
      })
    });
    await assert.rejects(fixture.execute(), /Claude delete confirmation remained visible/i, label);
    assert.equal(fixture.deleteCalls, 1);
    assert.equal(fixture.confirmCalls, 0);
    assert.equal(fixture.trustedDispatchCalls, 0, `${label} must never restart CDP confirmation input for a Claude identity`);
  }

  {
    const iframe = secureIframe(CLAUDE_HREF);
    const observedPayloads = [];
    const events = [];
    const focus = iframe.focus.bind(iframe);
    iframe.focus = (options) => {
      events.push("parent-iframe-focus");
      assert.deepEqual(options, { preventScroll: true });
      focus(options);
    };
    const fixture = createFixture(createTopicDeleteRuntime, {
      iframe,
      href: CLAUDE_HREF,
      deleteResult(data, call) {
        events.push(call === 1 ? "initial-delete" : call === 2 ? "content-preflight" : "post-d-continuation");
        observedPayloads.push({ ...data.payload });
        if (call <= 2) {
          if (call === 2) {
            assert.equal(data.payload?.trustedKeySequencePreflight, true);
            assert.equal(iframe.focusCalls, 1, "content preflight must run after exactly one parent iframe focus");
          }
          return {
            ok: false,
            site: "claude",
            reason: call === 1 ? "owned Claude menu requires its Delete D shortcut" : "owned Claude menu Delete D shortcut is ready",
            needsTrustedKeySequence: true,
            trustedKeySequence: {
              attemptId: data.deleteAttemptId,
              documentId: "bridge-document-1",
              kind: "claude-menu-delete-shortcut",
              site: "claude",
              keys: [{ key: "d", settleMs: 1 }],
              settleMs: 1
            }
          };
        }
        assert.equal(call, 3);
        assert.equal(data.payload?.trustedKeySequenceRetried, true);
        assert.equal(iframe.focusCalls, 1, "parent iframe must not be focused again after content preflight");
        return { ok: true, site: "claude" };
      },
      extensionMessageHandler(message) {
        if (message.action === "dispatchTrustedKeySequence") {
          events.push("dispatch-d");
          assert.equal(iframe.focusCalls, 1, "D dispatch must follow, not precede, the sole parent iframe focus");
          assert.equal(message.kind, "claude-menu-delete-shortcut");
          assert.equal(message.site, "claude");
          assert.equal(message.keys.length, 1);
          assert.equal(message.keys[0].key, "d");
          return { success: true };
        }
        return { success: false, error: "unexpected runtime request" };
      }
    });
    assert.deepEqual(await fixture.execute(), { ok: true, site: "claude" });
    assert.equal(iframe.focusCalls, 1, "the exact Claude iframe must receive keyboard focus before its Delete D preflight");
    assert.equal(fixture.deleteCalls, 3, "Delete D requires one preflight and one post-key continuation");
    assert.equal(fixture.trustedDispatchCalls, 1, "Delete D must be delivered exactly once");
    assert.deepEqual(
      observedPayloads.map((payload) => [
        payload.trustedKeySequencePreflight === true,
        payload.trustedKeySequenceRetried === true
      ]),
      [[false, false], [true, false], [false, true]]
    );
    assert.deepEqual(
      events,
      ["initial-delete", "parent-iframe-focus", "content-preflight", "dispatch-d", "post-d-continuation"],
      "Claude D ordering must be parent iframe focus -> content exact-item preflight -> one trusted dispatch"
    );
  }

  {
    const iframe = secureIframe(CLAUDE_HREF);
    const fixture = createFixture(createTopicDeleteRuntime, {
      iframe,
      href: CLAUDE_HREF,
      deleteResult(data, call) {
        if (call === 1) {
          return {
            ok: false,
            site: "claude",
            reason: "Claude title menu requires a trusted click",
            needsTrustedMenuClick: true,
            trustedMenuClick: {
              attemptId: data.deleteAttemptId,
              documentId: "bridge-document-1",
              kind: "conversation-menu-trigger",
              framePoint: { x: 20, y: 20 }
            }
          };
        }
        if (call <= 3) {
          if (call === 2) assert.equal(data.payload?.trustedMenuTriggerRetried, true);
          if (call === 3) assert.equal(data.payload?.trustedKeySequencePreflight, true);
          return {
            ok: false,
            site: "claude",
            reason: "owned Claude menu requires its Delete D shortcut",
            needsTrustedKeySequence: true,
            trustedKeySequence: {
              attemptId: data.deleteAttemptId,
              documentId: "bridge-document-1",
              kind: "claude-menu-delete-shortcut",
              site: "claude",
              keys: [{ key: "d", settleMs: 1 }],
              settleMs: 1
            }
          };
        }
        assert.equal(call, 4);
        assert.equal(data.payload?.trustedKeySequenceRetried, true);
        return { ok: true, site: "claude" };
      },
      extensionMessageHandler(message) {
        if (/^dispatchTrusted/.test(String(message.action || ""))) return { success: true };
        return { success: false, error: "unexpected runtime request" };
      }
    });
    assert.deepEqual(await fixture.execute(), { ok: true, site: "claude" });
    assert.equal(fixture.deleteCalls, 4, "a trusted menu trigger may advance once into the Delete D phase");
    assert.equal(fixture.trustedDispatchCalls, 3, "the trigger hover/click and one lowercase d are the only trusted inputs");
    assert.equal(iframe.focusCalls, 1);
  }

  {
    const iframe = secureIframe(CLAUDE_HREF);
    let focusAttempts = 0;
    iframe.focus = () => { focusAttempts += 1; };
    const fixture = createFixture(createTopicDeleteRuntime, {
      iframe,
      href: CLAUDE_HREF,
      deleteResult: (data) => ({
        ok: false,
        site: "claude",
        reason: "owned Claude menu requires its Delete D shortcut",
        needsTrustedKeySequence: true,
        trustedKeySequence: {
          attemptId: data.deleteAttemptId,
          documentId: "bridge-document-1",
          kind: "claude-menu-delete-shortcut",
          site: "claude",
          keys: [{ key: "d" }]
        }
      })
    });
    await assert.rejects(fixture.execute(), /lost iframe focus/i);
    assert.equal(focusAttempts, 1, "runtime may attempt parent iframe focus only once");
    assert.equal(fixture.deleteCalls, 1, "focus loss must stop before consuming the content preflight lease");
    assert.equal(fixture.trustedDispatchCalls, 0);
  }

  {
    const iframe = secureIframe(CLAUDE_HREF);
    const fixture = createFixture(createTopicDeleteRuntime, {
      iframe,
      href: CLAUDE_HREF,
      deleteResult(data, call) {
        const instruction = {
          ok: false,
          site: "claude",
          reason: call === 3
            ? "stale runner repeated Delete D after delivery"
            : "owned Claude menu requires its Delete D shortcut",
          needsTrustedKeySequence: true,
          trustedKeySequence: {
            attemptId: data.deleteAttemptId,
            documentId: "bridge-document-1",
            kind: "claude-menu-delete-shortcut",
            site: "claude",
            keys: [{ key: "d" }]
          }
        };
        if (call === 2) assert.equal(data.payload?.trustedKeySequencePreflight, true);
        if (call === 3) assert.equal(data.payload?.trustedKeySequenceRetried, true);
        return instruction;
      },
      extensionMessageHandler(message) {
        if (message.action === "dispatchTrustedKeySequence") return { success: true };
        return { success: false, error: "unexpected runtime request" };
      }
    });
    await assert.rejects(fixture.execute(), /Delete D shortcut was already consumed/i);
    assert.equal(fixture.deleteCalls, 3, "a stale post-D instruction may be observed but must not receive another preflight");
    assert.equal(iframe.focusCalls, 1, "a consumed D instruction must not refocus the parent iframe");
    assert.equal(fixture.trustedDispatchCalls, 1, "one delete attempt may dispatch lowercase d at most once");
    assert.equal(fixture.confirmCalls, 0);
  }

  {
    const iframe = secureIframe(CLAUDE_HREF);
    const fixture = createFixture(createTopicDeleteRuntime, {
      iframe,
      href: CLAUDE_HREF,
      deleteResult(data, call) {
        if (call <= 2) {
          return {
            ok: false,
            site: "claude",
            reason: "owned Claude menu requires its Delete D shortcut",
            needsTrustedKeySequence: true,
            trustedKeySequence: {
              attemptId: data.deleteAttemptId,
              documentId: "bridge-document-1",
              kind: "claude-menu-delete-shortcut",
              site: "claude",
              keys: [{ key: "d" }]
            }
          };
        }
        assert.equal(data.payload?.trustedKeySequenceRetried, true);
        return {
          ok: false,
          site: "claude",
          reason: "stale runner offered a menu click after Delete D",
          needsTrustedMenuClick: true,
          trustedMenuClick: {
            attemptId: data.deleteAttemptId,
            documentId: "bridge-document-1",
            kind: "delete-menu-item",
            site: "claude",
            framePoint: { x: 20, y: 20 }
          }
        };
      },
      extensionMessageHandler(message) {
        if (message.action === "dispatchTrustedKeySequence") return { success: true };
        throw new Error(`unexpected post-D trusted dispatch: ${message.action}`);
      }
    });
    await assert.rejects(fixture.execute(), /Delete D was already delivered; no later browser input is allowed/i);
    assert.equal(fixture.deleteCalls, 3);
    assert.equal(iframe.focusCalls, 1);
    assert.equal(fixture.trustedDispatchCalls, 1, "a consumed D attempt must reject every later menu hover/click");
    assert.equal(fixture.confirmCalls, 0);
  }

  {
    const iframe = secureIframe(CLAUDE_HREF);
    const fixture = createFixture(createTopicDeleteRuntime, {
      iframe,
      href: CLAUDE_HREF,
      deleteResult: (data, call) => ({
        ok: false,
        site: "claude",
        reason: call === 1 ? "owned Claude menu requires its Delete D shortcut" : "owned Claude menu Delete D shortcut is ready",
        needsTrustedKeySequence: true,
        trustedKeySequence: {
          attemptId: data.deleteAttemptId,
          documentId: "bridge-document-1",
          kind: "claude-menu-delete-shortcut",
          site: "claude",
          keys: [{ key: "d" }]
        }
      }),
      extensionMessageHandler(message) {
        if (message.action === "dispatchTrustedKeySequence") throw new Error("trusted D response was lost");
        return { success: false, error: "unexpected runtime request" };
      }
    });
    await assert.rejects(fixture.execute(), /trusted D response was lost/i);
    assert.equal(fixture.deleteCalls, 2, "an unknown D delivery stops after the one-time content preflight");
    assert.equal(fixture.confirmCalls, 0);
    assert.equal(fixture.trustedDispatchCalls, 1, "an unknown D delivery must never be replayed");
    assert.equal(iframe.focusCalls, 1, "unknown D delivery remains consumed after the sole parent focus");
  }

  {
    const iframe = secureIframe();
    const fixture = createFixture(createTopicDeleteRuntime, {
      iframe,
      deleteResult: (data) => ({
        ok: false,
        site: "claude",
        reason: "spoofed Claude Delete D shortcut",
        needsTrustedKeySequence: true,
        trustedKeySequence: {
          attemptId: data.deleteAttemptId,
          documentId: "bridge-document-1",
          kind: "claude-menu-delete-shortcut",
          site: "claude",
          keys: [{ key: "d" }]
        }
      })
    });
    await assert.rejects(fixture.execute(), /target is not a Claude conversation/i);
    assert.equal(fixture.deleteCalls, 1);
    assert.equal(fixture.trustedDispatchCalls, 0, "a non-Claude completion identity must never dispatch printable input");
  }

  {
    const fixture = createFixture(createTopicDeleteRuntime, {
      deleteResult: (data, call) => call === 1
        ? {
            ok: false,
            site: "probe",
            reason: "trusted menu points available",
            needsTrustedMenuClick: true,
            trustedMenuClick: {
              attemptId: data.deleteAttemptId,
              documentId: "bridge-document-1",
              hoverSettleMs: 1,
              framePoints: [{ x: 20, y: 20 }, { x: 30, y: 20 }]
            }
          }
        : {
            ok: false,
            site: "probe",
            reason: "delete menu state is not clean; trusted retry was not renewed"
          },
      iframe: secureIframe(),
      extensionMessageHandler(message) {
        if (/^dispatchTrusted/.test(String(message.action || ""))) return { success: true };
        return { success: false, error: "unexpected runtime request" };
      }
    });
    await assert.rejects(fixture.execute(), /delete menu state is not clean/);
    assert.equal(fixture.deleteCalls, 2);
    assert.equal(fixture.confirmCalls, 0);
    assert.equal(
      fixture.trustedDispatchCalls,
      2,
      "a dirty or unrenewed menu state must stop before trying another coordinate"
    );
  }

  {
    const fixture = createFixture(createTopicDeleteRuntime, {
      deleteResult: (data, call) => {
        if (call === 1) {
          return {
            ok: false,
            site: "probe",
            reason: "trusted menu points available",
            needsTrustedMenuClick: true,
            trustedMenuClick: {
              attemptId: data.deleteAttemptId,
              documentId: "bridge-document-1",
              hoverSettleMs: 1,
              framePoints: [{ x: 20, y: 20 }, { x: 30, y: 20 }]
            }
          };
        }
        if (call === 2) {
          return { ok: false, site: "probe", reason: "trusted topic menu click did not open" };
        }
        return { ok: true, site: "probe" };
      },
      iframe: secureIframe(),
      extensionMessageHandler(message) {
        if (/^dispatchTrusted/.test(String(message.action || ""))) return { success: true };
        return { success: false, error: "unexpected runtime request" };
      }
    });
    assert.deepEqual(await fixture.execute(), { ok: true, site: "probe" });
    assert.equal(fixture.deleteCalls, 3, "the exact clean first-point miss must permit one second-point retry");
    assert.equal(fixture.trustedDispatchCalls, 4, "two menu points require one hover and one click each");
  }

  {
    const observedPayloads = [];
    const fixture = createFixture(createTopicDeleteRuntime, {
      deleteResult: (data, call) => {
        observedPayloads.push({
          attemptId: data.deleteAttemptId,
          triggerRetried: data.payload?.trustedMenuTriggerRetried === true,
          itemRetried: data.payload?.trustedMenuClickRetried === true
        });
        if (call === 1) {
          return {
            ok: false,
            site: "claude",
            reason: "Claude title menu requires a trusted click",
            needsTrustedMenuClick: true,
            trustedMenuClick: {
              attemptId: data.deleteAttemptId,
              documentId: "bridge-document-1",
              kind: "conversation-menu-trigger",
              framePoint: { x: 20, y: 20 }
            }
          };
        }
        if (call === 2) {
          assert.equal(data.payload?.trustedMenuTriggerRetried, true);
          assert.equal(data.payload?.trustedMenuClickRetried, undefined);
          return {
            ok: false,
            site: "claude",
            reason: "Claude Delete item requires a trusted click",
            needsTrustedMenuClick: true,
            trustedMenuClick: {
              attemptId: data.deleteAttemptId,
              documentId: "bridge-document-1",
              kind: "delete-menu-item",
              framePoint: { x: 30, y: 20 }
            }
          };
        }
        assert.equal(call, 3, "Claude's trusted menu state machine must stop after the Delete-item phase");
        assert.equal(data.payload?.trustedMenuTriggerRetried, true);
        assert.equal(data.payload?.trustedMenuClickRetried, true);
        return { ok: true, site: "claude" };
      },
      iframe: secureIframe(),
      extensionMessageHandler(message) {
        if (/^dispatchTrusted/.test(String(message.action || ""))) return { success: true };
        return { success: false, error: "unexpected runtime request" };
      }
    });
    assert.deepEqual(await fixture.execute(), { ok: true, site: "claude" });
    assert.equal(fixture.deleteCalls, 3, "Claude may advance through exactly two trusted menu phases");
    assert.equal(fixture.trustedDispatchCalls, 4, "each Claude phase requires exactly one hover and one click");
    assert.deepEqual(
      observedPayloads.map(({ triggerRetried, itemRetried }) => [triggerRetried, itemRetried]),
      [[false, false], [true, false], [true, true]],
      "Claude retry flags must advance monotonically from title trigger to Delete item"
    );
    assert.equal(new Set(observedPayloads.map(({ attemptId }) => attemptId)).size, 1, "both trusted phases must retain one attempt id");
  }

  {
    const fixture = createFixture(createTopicDeleteRuntime, {
      deleteResult: (data, call) => call === 1
        ? {
            ok: false,
            site: "probe",
            reason: "legacy topic menu requires one trusted click",
            needsTrustedMenuClick: true,
            trustedMenuClick: {
              attemptId: data.deleteAttemptId,
              documentId: "bridge-document-1",
              kind: "topic-menu-trigger",
              framePoint: { x: 20, y: 20 }
            }
          }
        : {
            ok: false,
            site: "probe",
            reason: "legacy menu retry must remain single phase",
            needsTrustedMenuClick: true,
            trustedMenuClick: {
              attemptId: data.deleteAttemptId,
              documentId: "bridge-document-1",
              kind: "conversation-menu-trigger",
              framePoint: { x: 30, y: 20 }
            }
          },
      iframe: secureIframe(),
      extensionMessageHandler(message) {
        if (/^dispatchTrusted/.test(String(message.action || ""))) return { success: true };
        return { success: false, error: "unexpected runtime request" };
      }
    });
    await assert.rejects(fixture.execute(), /legacy menu retry must remain single phase/);
    assert.equal(fixture.deleteCalls, 2, "a legacy menu lease must never enter Claude's second phase");
    assert.equal(fixture.trustedDispatchCalls, 2, "a legacy menu lease remains one hover plus one click");
    const deleteRequests = fixture.requests.filter(({ command }) => command === "deleteThread");
    assert.equal(deleteRequests[1].data.payload.trustedMenuClickRetried, true);
    assert.equal(deleteRequests[1].data.payload.trustedMenuTriggerRetried, undefined);
  }

  {
    const fixture = createFixture(createTopicDeleteRuntime, {
      deleteResult: (data, call) => {
        const kind = call === 1 ? "conversation-menu-trigger" : "topic-menu-trigger";
        return {
          ok: false,
          site: "claude",
          reason: call === 1 ? "trusted title trigger required" : "wrong second trusted-menu phase",
          needsTrustedMenuClick: true,
          trustedMenuClick: {
            attemptId: data.deleteAttemptId,
            documentId: "bridge-document-1",
            kind,
            framePoint: { x: 20 + call * 10, y: 20 }
          }
        };
      },
      iframe: secureIframe(),
      extensionMessageHandler(message) {
        if (/^dispatchTrusted/.test(String(message.action || ""))) return { success: true };
        return { success: false, error: "unexpected runtime request" };
      }
    });
    await assert.rejects(fixture.execute(), /wrong second trusted-menu phase/);
    assert.equal(fixture.deleteCalls, 2, "Claude's second phase must be exactly delete-menu-item");
    assert.equal(fixture.trustedDispatchCalls, 2, "a wrong second phase must not dispatch another coordinate");
  }

  {
    const fixture = createFixture(createTopicDeleteRuntime, {
      deleteResult: (data, call) => ({
        ok: false,
        site: "claude",
        reason: call === 3 ? "third trusted-menu phase must be rejected" : `trusted Claude phase ${call}`,
        needsTrustedMenuClick: true,
        trustedMenuClick: {
          attemptId: data.deleteAttemptId,
          documentId: "bridge-document-1",
          kind: call === 1 ? "conversation-menu-trigger" : "delete-menu-item",
          framePoint: { x: 20 + call * 10, y: 20 }
        }
      }),
      iframe: secureIframe(),
      extensionMessageHandler(message) {
        if (/^dispatchTrusted/.test(String(message.action || ""))) return { success: true };
        return { success: false, error: "unexpected runtime request" };
      }
    });
    await assert.rejects(fixture.execute(), /third trusted-menu phase must be rejected/);
    assert.equal(fixture.deleteCalls, 3, "the two-phase state machine must never issue a fourth delete command");
    assert.equal(fixture.trustedDispatchCalls, 4, "the two-phase state machine must never dispatch a third trusted click");
  }

  {
    const fixture = createFixture(createTopicDeleteRuntime, {
      deleteResult: (data) => ({
        ok: false,
        site: "probe",
        reason: "single-point generic menu instruction",
        needsTrustedMenuClick: true,
        trustedMenuClick: {
          attemptId: data.deleteAttemptId,
          documentId: "bridge-document-1",
          framePoint: { x: 20, y: 20 }
        }
      }),
      iframe: secureIframe(),
      extensionMessageHandler(message) {
        if (message.action === "dispatchTrustedMouseMove") throw new Error("trusted menu hover transport failed");
        return { success: false, error: "unexpected runtime request" };
      }
    });
    await assert.rejects(fixture.execute(), /trusted menu hover transport failed/);
    assert.equal(fixture.deleteCalls, 1);
    assert.equal(fixture.confirmCalls, 0);
    assert.equal(fixture.trustedDispatchCalls, 1, "a bound generic single framePoint remains a valid menu instruction");
  }

  {
    const fixture = createFixture(createTopicDeleteRuntime, {
      hrefs: [DEFAULT_HREF, "https://chat.deepseek.com/a/chat/s/topic-2"],
      deleteResult: (data) => ({
        ok: false,
        site: "probe",
        reason: "route changed before trusted hover",
        needsTrustedHover: true,
        trustedHover: {
          attemptId: data.deleteAttemptId,
          documentId: "bridge-document-1",
          framePoint: { x: 20, y: 20 }
        }
      }),
      iframe: secureIframe()
    });
    await assert.rejects(fixture.execute(), /trusted input target conversation changed/);
    assert.equal(fixture.deleteCalls, 1, "route revalidation failure must not retry deletion");
    assert.equal(fixture.confirmCalls, 0, "route revalidation failure must not probe or adopt a dialog");
    assert.equal(fixture.trustedDispatchCalls, 0, "route change before trusted input must prevent dispatch");
  }

  {
    const iframe = secureIframe();
    const fixture = createFixture(createTopicDeleteRuntime, {
      href: DEFAULT_HREF,
      iframe,
      onLocationRequest(currentIframe, call) {
        if (call !== 2) return;
        currentIframe.dataset.preferredModelDocumentId = "bridge-document-2";
        currentIframe.dataset.injectedBrowserDocumentId = "browser-document-2";
      },
      deleteResult: (data) => ({
        ok: false,
        site: "probe",
        reason: "same route loaded a replacement document",
        needsTrustedHover: true,
        trustedHover: {
          attemptId: data.deleteAttemptId,
          documentId: "bridge-document-1",
          framePoint: { x: 20, y: 20 }
        }
      })
    });
    await assert.rejects(fixture.execute(), /trusted input origin document changed/);
    assert.equal(fixture.deleteCalls, 1, "a replacement document must not trigger another delete");
    assert.equal(fixture.confirmCalls, 0, "a replacement document must not trigger dialog probing");
    assert.equal(fixture.trustedDispatchCalls, 0, "same-URL document replacement must invalidate old coordinates");
  }

  {
    const fixture = createFixture(createTopicDeleteRuntime, {
      deleteResult: (data) => ({
        ok: false,
        site: "probe",
        reason: "bounded menu timing",
        needsTrustedMenuClick: true,
        trustedMenuClick: {
          attemptId: data.deleteAttemptId,
          documentId: "bridge-document-1",
          hoverSettleMs: 60_000,
          framePoint: { x: 20, y: 20 }
        }
      }),
      iframe: secureIframe(),
      extensionMessageHandler(message) {
        if (message.action === "dispatchTrustedMouseMove") return { success: true };
        if (message.action === "dispatchTrustedClick") throw new Error("bounded menu click stopped");
        return { success: false, error: "unexpected runtime request" };
      }
    });
    const startedAt = Date.now();
    await assert.rejects(fixture.execute(), /bounded menu click stopped/);
    const elapsed = Date.now() - startedAt;
    assert.ok(elapsed >= 900 && elapsed < 1800, `trusted timing must clamp to about one second, received ${elapsed}ms`);
    assert.equal(fixture.deleteCalls, 1);
    assert.equal(fixture.confirmCalls, 0);
    assert.equal(fixture.trustedDispatchCalls, 2);
  }

  {
    const fixture = createFixture(createTopicDeleteRuntime, {
      deleteResult: { ok: true, site: "probe" },
      iframe: secureIframe(),
      confirmStates: [(data) => ({
        version: 1,
        present: true,
        target: { identity: data.identity, current: true, present: true },
        trustedClick: { attemptId: "probe-owned", framePoint: { x: 20, y: 20 } }
      })]
    });
    await assert.rejects(fixture.execute(), /delete confirmation is still visible/);
    assert.equal(fixture.deleteCalls, 1);
    assert.equal(fixture.confirmCalls, 1);
    assert.equal(fixture.trustedDispatchCalls, 0, "a successful runner cannot adopt probe-owned dialog coordinates");
  }

  {
    const fixture = createFixture(createTopicDeleteRuntime, {
      firstDeleteError: frameError("NOT_REGISTERED", false),
      hrefs: [
        "https://chat.deepseek.com/a/chat/s/topic-1",
        "https://chat.deepseek.com/a/chat/s/topic-2"
      ]
    });
    await assert.rejects(fixture.execute(), /current conversation changed before delete retry/);
    assert.equal(fixture.deleteCalls, 1, "a pre-delivery retry must not mutate a different current conversation");
  }

  {
    const fixture = createFixture(createTopicDeleteRuntime, {
      href: "https://chat.deepseek.com/",
      deleteResult: (data) => ({
        ok: false,
        site: "probe",
        needsTrustedClick: true,
        trustedClick: { attemptId: data.deleteAttemptId, framePoint: { x: 10, y: 10 } }
      })
    });
    await assert.rejects(fixture.execute(), /no authenticated stable conversation identity/);
    assert.equal(
      fixture.deleteCalls,
      0,
      "a root URL without a stable identity must fail before any runner can request trusted input"
    );
    assert.equal(fixture.trustedDispatchCalls, 0, "null identity must never dispatch a runner-provided trusted click");
  }

  {
    const fixture = createFixture(createTopicDeleteRuntime, {
      confirmStateError: new Error("confirmation bridge disappeared")
    });
    await assert.rejects(
      fixture.execute(),
      /delete completion could not be verified: confirmation bridge disappeared/
    );
    assert.equal(fixture.deleteCalls, 1);
    assert.deepEqual(
      fixture.calls.slice(0, 3),
      ["getLocationHref", "deleteThread", "getDeleteConfirmState"],
      "a successful delete result must still require a successful completion-state probe"
    );
    assert.ok(
      fixture.calls.slice(2).every((command) => command === "getDeleteConfirmState"),
      "a failed completion probe may only be retried with another read-only completion probe"
    );
  }

  for (const malformed of [null, undefined, {}, { version: 1 }, { version: 1, present: "false", target: null }]) {
    const fixture = createFixture(createTopicDeleteRuntime, { confirmStates: [malformed] });
    await assert.rejects(
      fixture.execute(),
      /delete completion could not be verified: completion-state probe/
    );
    assert.ok(fixture.confirmCalls >= 1, "a malformed probe result must never count as success");
  }

  {
    const identityHref = "https://chat.deepseek.com/a/chat/s/topic-1";
    const targetState = (current, present) => ({
      version: 1,
      present: false,
      target: {
        identity: { provider: "deepseek", id: "topic-1" },
        current,
        present
      }
    });
    const fixture = createFixture(createTopicDeleteRuntime, {
      href: identityHref,
      confirmStates: [
        targetState(true, true),
        targetState(false, true),
        targetState(false, false)
      ]
    });
    assert.deepEqual(await fixture.execute(), { ok: true, site: "probe" });
    assert.ok(fixture.confirmCalls >= 4, "completion must poll until the stable target remains absent across the stable window");
    const deleteIndex = fixture.calls.indexOf("deleteThread");
    assert.ok(fixture.calls.indexOf("getLocationHref") < deleteIndex, "stable identity must be captured before mutation");
    const probe = fixture.requests.find((request) => request.command === "getDeleteConfirmState");
    assert.deepEqual(probe.data.identity, { provider: "deepseek", id: "topic-1" });
  }

  {
    const targetState = (current, present) => ({
      version: 1,
      present: false,
      target: {
        identity: { provider: "deepseek", id: "topic-1" },
        current,
        present
      }
    });
    const fixture = createFixture(createTopicDeleteRuntime, {
      href: "https://chat.deepseek.com/a/chat/s/topic-1",
      confirmStates: [
        targetState(false, false),
        targetState(true, true),
        targetState(false, false),
        targetState(false, false)
      ]
    });
    assert.deepEqual(await fixture.execute(), { ok: true, site: "probe" });
    assert.ok(
      fixture.confirmCalls > 4,
      "one transient complete sample must be discarded when the target becomes current or present again"
    );
  }

  {
    const completeState = {
      version: 1,
      present: false,
      target: {
        identity: { provider: "deepseek", id: "topic-1" },
        current: false,
        present: false
      }
    };
    const fixture = createFixture(createTopicDeleteRuntime, {
      href: "https://chat.deepseek.com/a/chat/s/topic-1",
      confirmStates: [completeState, completeState]
    });
    assert.deepEqual(await fixture.execute(), { ok: true, site: "probe" });
    assert.ok(
      fixture.confirmCalls > 2,
      "two fast complete samples alone must not bypass the minimum stable-removal window"
    );
  }

  {
    let firstProbeAt = 0;
    let sawRebound = false;
    const fixture = createFixture(createTopicDeleteRuntime, {
      href: DEFAULT_HREF,
      completionTimeoutMs: 1500,
      completionPollMs: 50,
      completionStableMs: 600,
      confirmStates: [(data) => {
        const now = Date.now();
        if (!firstProbeAt) firstProbeAt = now;
        const elapsed = now - firstProbeAt;
        const rebound = elapsed >= 280 && elapsed < 380;
        if (rebound) sawRebound = true;
        return {
          version: 1,
          present: false,
          target: {
            identity: data.identity,
            current: rebound,
            present: rebound
          }
        };
      }]
    });
    const startedAt = Date.now();
    assert.deepEqual(await fixture.execute(), { ok: true, site: "probe" });
    assert.equal(sawRebound, true, "the test must observe the target rebounding after fast complete samples");
    assert.ok(
      Date.now() - startedAt >= 900,
      "a rebound around 300ms must reset the 600ms stable window before completion can succeed"
    );
  }

  for (const resetKind of ["malformed", "error"]) {
    const completeState = {
      version: 1,
      present: false,
      target: { identity: DEFAULT_IDENTITY, current: false, present: false }
    };
    let resetAt = 0;
    const resetProbe = () => {
      resetAt = Date.now();
      if (resetKind === "error") throw new Error("transient probe failure");
      return {};
    };
    const fixture = createFixture(createTopicDeleteRuntime, {
      href: DEFAULT_HREF,
      completionTimeoutMs: 450,
      completionPollMs: 10,
      completionStableMs: 100,
      confirmStates: [completeState, completeState, resetProbe, completeState]
    });
    assert.deepEqual(await fixture.execute(), { ok: true, site: "probe" });
    assert.ok(resetAt > 0, `${resetKind} reset probe must be reached`);
    assert.ok(
      Date.now() - resetAt >= 100,
      `${resetKind} probe must reset both the complete streak and stable-window start`
    );
  }

  for (const [label, target, message] of [
    ["current", { current: true, present: false }, /deleted conversation is still current/],
    ["present", { current: false, present: true }, /deleted conversation is still present/]
  ]) {
    const fixture = createFixture(createTopicDeleteRuntime, {
      href: "https://chat.deepseek.com/a/chat/s/topic-1",
      confirmStates: [{
        version: 1,
        present: false,
        target: {
          identity: { provider: "deepseek", id: "topic-1" },
          ...target
        }
      }]
    });
    await assert.rejects(fixture.execute(), message, `${label} target state must fail closed`);
  }

  {
    const fixture = createFixture(createTopicDeleteRuntime, {
      href: "https://chat.deepseek.com/a/chat/s/topic-1",
      confirmStates: [{ version: 1, present: false, target: null }]
    });
    await assert.rejects(
      fixture.execute(),
      /completion-state probe omitted the target identity state/,
      "an unavailable post-delete identity probe must fail closed when a stable target was captured"
    );
  }

  {
    const fixture = createFixture(createTopicDeleteRuntime, {
      href: "https://example.test/chat/thread",
      confirmStates: [{ version: 1, present: false, target: null }]
    });
    await assert.rejects(fixture.execute(), /no authenticated stable conversation identity/);
    assert.equal(fixture.deleteCalls, 0, "an unsupported URL must fail before mutation");
    assert.equal(fixture.confirmCalls, 0, "an unsupported URL has no post-mutation completion to probe");
  }

  assert.equal(
    extensionMessages.some((message) => message?.action === "ensureContentBridge"),
    false,
    "Topic Delete must never send raw ensureContentBridge runtime messages"
  );

  console.log("topic delete delivery-safe retry and identity-aware fail-closed settlement: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
