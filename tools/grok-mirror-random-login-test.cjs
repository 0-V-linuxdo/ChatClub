#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "background/grok-cookie-debugger.js"), "utf8");
const dataModule = (body) => import(`data:text/javascript;base64,${Buffer.from(body).toString("base64")}`);

const TAB_ID = 71;
const RANDOM_LOGIN_URL = "https://gk.dairoot.cn/api/random-login";
const MIRROR_ROOT_URL = "https://gk.dairoot.cn/";
const TOKEN_A = `random-${"A".repeat(32)}`;
const TOKEN_B = `random-${"B".repeat(32)}`;
const COOKIE_LINE_A = `user-gateway-token=${TOKEN_A}; Path=/; Max-Age=604800; HttpOnly`;
const COOKIE_LINE_B = `user-gateway-token=${TOKEN_B}; Path=/; Max-Age=604800; HttpOnly`;
const FRAME_BINDING_ID = "a".repeat(64);

function createEventHook() {
  const listeners = new Set();
  return {
    addListener(listener) {
      listeners.add(listener);
    },
    removeListener(listener) {
      listeners.delete(listener);
    },
    emit(...args) {
      for (const listener of [...listeners]) listener(...args);
    },
    get size() {
      return listeners.size;
    }
  };
}

function fakeDebuggerApi(options = {}) {
  const onEvent = createEventHook();
  const onDetach = createEventHook();
  const calls = [];
  let attached = false;

  const recordCommand = async (target, method, params = {}) => {
    calls.push({
      kind: "command",
      target: { ...target },
      method,
      params: { ...params }
    });
    if (typeof options.command === "function") {
      return options.command({ target: { ...target }, method, params: { ...params } });
    }
    return {};
  };

  const api = {
    calls,
    debugger: {
      onEvent,
      onDetach,
      async attach(target, version) {
        calls.push({ kind: "attach", target: { ...target }, version });
        if (options.attachError) throw options.attachError;
        assert.equal(attached, false, "the fake debugger must not be attached twice");
        attached = true;
      },
      async sendCommand(target, method, params = {}) {
        assert.equal(attached, true, "direct debugger commands require an owned attachment");
        return recordCommand(target, method, params);
      },
      async detach(target) {
        calls.push({ kind: "detach", target: { ...target } });
        if (options.detachError) throw options.detachError;
        attached = false;
      }
    },
    emitEvent(source, method, params = {}) {
      onEvent.emit({ tabId: TAB_ID, ...source }, method, params);
    },
    emitDetach(source = {}) {
      onDetach.emit({ tabId: TAB_ID, ...source }, "target_closed");
    },
    sharedLease: async (tabId, task) => {
      assert.equal(tabId, TAB_ID);
      calls.push({ kind: "lease-enter", tabId });
      try {
        return await task({
          target: { tabId },
          sendCommand: (method, params = {}, sessionId = "") => recordCommand(
            sessionId ? { tabId, sessionId: String(sessionId) } : { tabId },
            method,
            params
          )
        });
      } finally {
        calls.push({ kind: "lease-exit", tabId });
      }
    }
  };
  return api;
}

function emitInitialRequest(api, overrides = {}, source = {}) {
  const params = {
    requestId: "request-1",
    loaderId: "loader-1",
    frameId: "frame-1",
    type: "Document",
    request: {
      url: RANDOM_LOGIN_URL,
      method: "GET"
    },
    ...overrides
  };
  api.emitEvent(source, "Network.requestWillBeSent", params);
}

function emitRedirect(api, overrides = {}, source = {}) {
  const params = {
    requestId: "request-1",
    loaderId: "loader-1",
    frameId: "frame-1",
    type: "Document",
    request: {
      url: MIRROR_ROOT_URL,
      method: "GET"
    },
    redirectResponse: {
      url: RANDOM_LOGIN_URL,
      status: 302,
      headers: { location: "/" }
    },
    ...overrides
  };
  api.emitEvent(source, "Network.requestWillBeSent", params);
}

function emitExtraInfo(api, overrides = {}, source = {}) {
  api.emitEvent(source, "Network.responseReceivedExtraInfo", {
    requestId: "request-1",
    statusCode: 302,
    headers: {
      location: "/",
      "set-cookie": COOKIE_LINE_A
    },
    ...overrides
  });
}

function emitResponse(api, overrides = {}, source = {}) {
  const params = {
    requestId: "request-1",
    loaderId: "loader-1",
    frameId: "frame-1",
    type: "Document",
    hasExtraInfo: false,
    response: {
      url: RANDOM_LOGIN_URL,
      status: 302,
      headers: {
        location: "/",
        "set-cookie": COOKIE_LINE_A
      }
    },
    ...overrides
  };
  api.emitEvent(source, "Network.responseReceived", params);
}

function captureOptions(api, onArmed, overrides = {}) {
  return {
    tabId: TAB_ID,
    timeoutMs: 500,
    revalidateBefore: async () => true,
    revalidateAfter: async () => true,
    onArmed,
    ...(overrides.shared === false ? {} : { withTabDebugger: api.sharedLease }),
    ...overrides
  };
}

async function expectFailure(capture, setup = {}) {
  const api = setup.api || fakeDebuggerApi();
  let taskCalled = false;
  let publicResult;
  let publicError;
  try {
    publicResult = await capture(
      api,
      captureOptions(api, async () => setup.onArmed?.(api), setup.options || {}),
      async () => {
        taskCalled = true;
        return setup.taskResult ?? true;
      }
    );
  } catch (error) {
    publicError = error;
  }
  assert.equal(publicResult, undefined, setup.label || "a rejected capture must not report success");
  assert.ok(publicError instanceof Error, setup.label || "the capture must reject");
  assert.match(
    publicError.message,
    /Grok Mirror (?:partition Cookie debugger operation failed|account-switch capture is unavailable)/,
    setup.label
  );
  assert.equal(taskCalled, Boolean(setup.expectTask), setup.label || "the final task call must be fail-closed");
  assert.equal(api.debugger.onEvent.size, 0, "event listeners must always be removed");
  assert.equal(api.debugger.onDetach.size, 0, "detach listeners must always be removed");
  return { api, publicError, publicResult };
}

function assertNoTokenLeak(value, message) {
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes(TOKEN_A), false, `${message}: token A leaked`);
  assert.equal(serialized.includes(TOKEN_B), false, `${message}: token B leaked`);
}

(async () => {
  const { captureGrokMirrorRandomLoginCookie } = await dataModule(source);
  const publicSurfaces = [];

  // The root session must be fully armed before navigation begins. This also
  // exercises the responseReceived path without relying on extra-info events.
  {
    const api = fakeDebuggerApi();
    let armed = false;
    let taskTokenMatched = false;
    assert.equal(api.debugger.onEvent.size, 0);
    const result = await captureGrokMirrorRandomLoginCookie(
      api,
      captureOptions(api, async () => {
        armed = true;
        assert.equal(api.debugger.onEvent.size, 1);
        assert.deepEqual(
          api.calls.filter((call) => call.kind === "command").map((call) => [call.target, call.method]),
          [
            [{ tabId: TAB_ID }, "Network.enable"],
            [{ tabId: TAB_ID }, "Target.setAutoAttach"]
          ],
          "the root Network domain and OOPIF auto-attach must be armed before navigation"
        );
        emitInitialRequest(api);
        emitResponse(api);
      }, { shared: false }),
      async ({ token }) => {
        taskTokenMatched = token === TOKEN_A;
        return true;
      }
    );
    assert.equal(armed, true);
    assert.equal(taskTokenMatched, true);
    assert.equal(result, true);
    assert.deepEqual(
      api.calls.filter((call) => call.kind === "attach" || call.kind === "detach").map((call) => call.kind),
      ["attach", "detach"]
    );
    assert.equal(api.debugger.onEvent.size, 0);
    assert.equal(api.debugger.onDetach.size, 0);
    publicSurfaces.push({ result, calls: api.calls });
  }

  // If two child targets both claim the exact-document marker, the
  // binding is ambiguous and must fail before privileged installation.
  {
    const frameUrl = "https://gk.dairoot.cn/";
    let api;
    api = fakeDebuggerApi({
      command({ target, method, params }) {
        if (method === "Target.setAutoAttach") {
          queueMicrotask(() => {
            for (const suffix of ["one", "two"]) {
              api.emitEvent({}, "Target.attachedToTarget", {
                sessionId: `ambiguous-${suffix}-session`,
                targetInfo: {
                  type: "iframe",
                  targetId: `ambiguous-${suffix}-target`,
                  url: frameUrl
                }
              });
            }
          });
        }
        if (method === "Page.getFrameTree") return {
          frameTree: {
            frame: { id: `${target.sessionId}-page-frame`, url: frameUrl }
          }
        };
        if (method === "DOM.getFrameOwner") {
          return { backendNodeId: params.frameId.endsWith("one-session-page-frame") ? 301 : 302 };
        }
        if (method === "DOM.describeNode") return {
          node: { attributes: ["data-frame-binding-id", FRAME_BINDING_ID] }
        };
        return {};
      }
    });
    const outcome = await expectFailure(captureGrokMirrorRandomLoginCookie, {
      api,
      label: "two matching exact-document frame markers are ambiguous",
      options: { frameUrl, frameBindingId: FRAME_BINDING_ID }
    });
    publicSurfaces.push({ error: outcome.publicError.message, calls: api.calls });
  }

  // Extra-info may precede the redirect event. The exact same Set-Cookie line
  // can be reported in headers and blockedCookies and must count only once.
  {
    const api = fakeDebuggerApi();
    let taskTokenMatched = false;
    const result = await captureGrokMirrorRandomLoginCookie(
      api,
      captureOptions(api, async () => {
        emitInitialRequest(api);
        emitExtraInfo(api, {
          headers: { "set-cookie": COOKIE_LINE_A },
          blockedCookies: [{ cookieLine: COOKIE_LINE_A }]
        });
        emitRedirect(api);
      }),
      async ({ token }) => {
        taskTokenMatched = token === TOKEN_A;
        return true;
      }
    );
    assert.equal(result, true);
    assert.equal(taskTokenMatched, true);
    publicSurfaces.push({ result, calls: api.calls });
  }

  // The normal redirect-before-extra ordering must wait for the declared
  // extra-info record and accept a duplicate identical raw header line.
  {
    const api = fakeDebuggerApi();
    let taskTokenMatched = false;
    const result = await captureGrokMirrorRandomLoginCookie(
      api,
      captureOptions(api, async () => {
        emitInitialRequest(api);
        emitRedirect(api, { redirectHasExtraInfo: true });
        emitExtraInfo(api, {
          headers: {
            location: "/",
            "set-cookie": `${COOKIE_LINE_A}\n${COOKIE_LINE_A}`
          }
        });
      }),
      async ({ token }) => {
        taskTokenMatched = token === TOKEN_A;
        return true;
      }
    );
    assert.equal(result, true);
    assert.equal(taskTokenMatched, true);
    publicSurfaces.push({ result, calls: api.calls });
  }

  // A Mirror frame may be an OOPIF. Its child session must have Network
  // enabled and all evidence must remain bound to that child session.
  {
    const api = fakeDebuggerApi();
    let taskTokenMatched = false;
    const childSource = { sessionId: "oopif-session" };
    const result = await captureGrokMirrorRandomLoginCookie(
      api,
      captureOptions(api, async () => {
        api.emitEvent({}, "Target.attachedToTarget", {
          sessionId: "oopif-session",
          targetInfo: { type: "iframe" }
        });
        await Promise.resolve();
        await Promise.resolve();
        assert.equal(
          api.calls.some((call) =>
            call.kind === "command"
            && call.target.sessionId === "oopif-session"
            && call.method === "Network.enable"
          ),
          true,
          "the OOPIF Network domain must be enabled through its child session"
        );
        emitInitialRequest(api, {}, childSource);
        emitResponse(api, {}, childSource);
      }),
      async ({ token }) => {
        taskTokenMatched = token === TOKEN_A;
        return true;
      }
    );
    assert.equal(result, true);
    assert.equal(taskTokenMatched, true);
    publicSurfaces.push({ result, calls: api.calls });
  }

  // Runtime arming binds the exact sender URL to one OOPIF target and waits
  // for that child Network domain before allowing the site navigation.
  {
    const frameUrl = "https://gk.dairoot.cn/c/exact-account";
    const childSessionId = "exact-oopif-session";
    const childTargetId = "exact-oopif-target";
    let api;
    api = fakeDebuggerApi({
      command({ method, params }) {
        if (method === "Target.setAutoAttach") {
          queueMicrotask(() => {
            api.emitEvent({}, "Target.attachedToTarget", {
              sessionId: childSessionId,
              targetInfo: { type: "iframe", targetId: childTargetId, url: frameUrl }
            });
          });
        }
        if (method === "Page.getFrameTree") return {
          frameTree: { frame: { id: "exact-page-frame", url: frameUrl } }
        };
        if (method === "DOM.getFrameOwner") {
          return params.frameId === "exact-page-frame" ? { backendNodeId: 401 } : {};
        }
        if (method === "DOM.describeNode") return {
          node: { attributes: ["data-frame-binding-id", FRAME_BINDING_ID] }
        };
        return {};
      }
    });
    let taskTokenMatched = false;
    const result = await captureGrokMirrorRandomLoginCookie(
      api,
      captureOptions(api, async () => {
        assert.equal(
          api.calls.some((call) =>
            call.kind === "command"
            && call.target.sessionId === childSessionId
            && call.method === "Network.enable"
          ),
          true,
          "armed must wait for the exact OOPIF Network session"
        );
        const source = { sessionId: childSessionId };
        emitInitialRequest(api, { frameId: "exact-page-frame" }, source);
        emitResponse(api, { frameId: "exact-page-frame" }, source);
      }, { frameUrl, frameBindingId: FRAME_BINDING_ID }),
      async ({ token }) => {
        taskTokenMatched = token === TOKEN_A;
        return true;
      }
    );
    assert.equal(result, true);
    assert.equal(taskTokenMatched, true);
    publicSurfaces.push({ result, calls: api.calls });
  }

  // Multiple resident Mirror frames may share the same URL. The exact
  // document attestation, rather than URL order, owns the debugger session.
  {
    const frameUrl = "https://gk.dairoot.cn/";
    const selectedSessionId = "selected-oopif-session";
    const selectedTargetId = "selected-oopif-target";
    const siblingSessionId = "sibling-oopif-session";
    const siblingTargetId = "sibling-oopif-target";
    let api;
    api = fakeDebuggerApi({
      command({ target, method, params }) {
        if (method === "Target.setAutoAttach") {
          queueMicrotask(() => {
            api.emitEvent({}, "Target.attachedToTarget", {
              sessionId: siblingSessionId,
              targetInfo: { type: "iframe", targetId: siblingTargetId, url: frameUrl }
            });
            api.emitEvent({}, "Target.attachedToTarget", {
              sessionId: selectedSessionId,
              targetInfo: { type: "iframe", targetId: selectedTargetId, url: frameUrl }
            });
          });
        }
        if (method === "Page.getFrameTree") return {
          frameTree: {
            frame: {
              id: target.sessionId === selectedSessionId
                ? "selected-page-frame"
                : "sibling-page-frame",
              url: frameUrl
            }
          }
        };
        if (method === "DOM.getFrameOwner") {
          return {
            backendNodeId: params.frameId === "selected-page-frame" ? 501 : 502
          };
        }
        if (method === "DOM.describeNode") return {
          node: {
            attributes: params.backendNodeId === 501
              ? ["data-frame-binding-id", FRAME_BINDING_ID]
              : []
          }
        };
        return {};
      }
    });
    let taskTokenMatched = false;
    const result = await captureGrokMirrorRandomLoginCookie(
      api,
      captureOptions(api, async () => {
        emitInitialRequest(api, { frameId: "sibling-page-frame" }, { sessionId: siblingSessionId });
        emitResponse(api, { frameId: "sibling-page-frame" }, { sessionId: siblingSessionId });
        emitInitialRequest(api, { frameId: "selected-page-frame" }, { sessionId: selectedSessionId });
        emitResponse(api, { frameId: "selected-page-frame" }, { sessionId: selectedSessionId });
      }, { frameUrl, frameBindingId: FRAME_BINDING_ID }),
      async ({ token }) => {
        taskTokenMatched = token === TOKEN_A;
        return true;
      }
    );
    assert.equal(result, true);
    assert.equal(taskTokenMatched, true);
    assert.equal(
      api.calls.some((call) => call.method === "DOM.getFrameOwner" && call.params.frameId === "sibling-page-frame"),
      true
    );
    assert.equal(
      api.calls.some((call) => call.method === "DOM.getFrameOwner" && call.params.frameId === "selected-page-frame"),
      true
    );
    assert.equal(
      api.calls.some((call) =>
        call.method === "Network.enable" && call.target.sessionId === siblingSessionId
      ),
      false,
      "an unattested same-URL sibling must never have its Network domain enabled"
    );
    publicSurfaces.push({ result, calls: api.calls });
  }

  // A busy page may emit hundreds of unrelated extra-info events. They must
  // not consume the bounded exact-request state inventory.
  {
    const api = fakeDebuggerApi();
    let taskTokenMatched = false;
    const result = await captureGrokMirrorRandomLoginCookie(
      api,
      captureOptions(api, async () => {
        for (let index = 0; index < 180; index += 1) {
          api.emitEvent({}, "Network.responseReceivedExtraInfo", {
            requestId: `unrelated-${index}`,
            statusCode: 200,
            headers: { "content-type": "application/json" }
          });
        }
        emitInitialRequest(api);
        emitResponse(api);
      }),
      async ({ token }) => {
        taskTokenMatched = token === TOKEN_A;
        return true;
      }
    );
    assert.equal(result, true);
    assert.equal(taskTokenMatched, true);
    publicSurfaces.push({ result, calls: api.calls });
  }

  // Equivalent strict Cookie evidence may be serialized with a different
  // attribute order/casing across CDP headers and blockedCookies.
  {
    const api = fakeDebuggerApi();
    let taskTokenMatched = false;
    const equivalentLine = `user-gateway-token=${TOKEN_A}; HttpOnly; max-age=604800; path=/`;
    const result = await captureGrokMirrorRandomLoginCookie(
      api,
      captureOptions(api, async () => {
        emitInitialRequest(api);
        emitExtraInfo(api, {
          headers: { location: "/", "set-cookie": COOKIE_LINE_A },
          blockedCookies: [{ cookieLine: equivalentLine }]
        });
      }),
      async ({ token }) => {
        taskTokenMatched = token === TOKEN_A;
        return true;
      }
    );
    assert.equal(result, true);
    assert.equal(taskTokenMatched, true);
    publicSurfaces.push({ result, calls: api.calls });
  }

  const immediateFailureCases = [
    {
      label: "POST is not a login navigation",
      onArmed(api) {
        emitInitialRequest(api, {
          request: { url: RANDOM_LOGIN_URL, method: "POST", hasPostData: true },
          hasPostData: true
        });
      }
    },
    {
      label: "a non-Document request is rejected",
      onArmed(api) {
        emitInitialRequest(api, { type: "XHR" });
      }
    },
    {
      label: "a non-302 response is rejected",
      onArmed(api) {
        emitInitialRequest(api);
        emitResponse(api, {
          response: {
            url: RANDOM_LOGIN_URL,
            status: 200,
            headers: { location: "/", "set-cookie": COOKIE_LINE_A }
          }
        });
      }
    },
    {
      label: "an unexpected redirect location is rejected",
      onArmed(api) {
        emitInitialRequest(api);
        emitResponse(api, {
          response: {
            url: RANDOM_LOGIN_URL,
            status: 302,
            headers: { location: "/admin", "set-cookie": COOKIE_LINE_A }
          }
        });
      }
    },
    {
      label: "two distinct random tokens are ambiguous",
      onArmed(api) {
        emitInitialRequest(api);
        emitResponse(api, {
          response: {
            url: RANDOM_LOGIN_URL,
            status: 302,
            headers: { location: "/", "set-cookie": `${COOKIE_LINE_A}\n${COOKIE_LINE_B}` }
          }
        });
      }
    },
    {
      label: "a cookie missing HttpOnly is rejected",
      onArmed(api) {
        emitInitialRequest(api);
        emitResponse(api, {
          response: {
            url: RANDOM_LOGIN_URL,
            status: 302,
            headers: {
              location: "/",
              "set-cookie": `user-gateway-token=${TOKEN_A}; Path=/; Max-Age=604800`
            }
          }
        });
      }
    },
    {
      label: "a cookie with an extra attribute is rejected",
      onArmed(api) {
        emitInitialRequest(api);
        emitResponse(api, {
          response: {
            url: RANDOM_LOGIN_URL,
            status: 302,
            headers: { location: "/", "set-cookie": `${COOKIE_LINE_A}; Secure` }
          }
        });
      }
    },
    {
      label: "response evidence from another debugger session is rejected",
      onArmed(api) {
        emitInitialRequest(api);
        emitResponse(api, {}, { sessionId: "wrong-session" });
      }
    },
    {
      label: "response evidence from another request is rejected",
      onArmed(api) {
        emitInitialRequest(api);
        emitResponse(api, { requestId: "request-2" });
      }
    },
    {
      label: "loader identity drift is rejected",
      onArmed(api) {
        emitInitialRequest(api);
        emitResponse(api, { loaderId: "loader-2" });
      }
    }
  ];

  for (const testCase of immediateFailureCases) {
    const outcome = await expectFailure(captureGrokMirrorRandomLoginCookie, testCase);
    publicSurfaces.push({ error: outcome.publicError.message, calls: outcome.api.calls });
  }

  // A different URL must never be treated as random-login evidence. It is
  // deliberately allowed to time out instead of broadening the matcher.
  {
    const outcome = await expectFailure(captureGrokMirrorRandomLoginCookie, {
      label: "the account-switch URL must match exactly",
      onArmed(api) {
        emitInitialRequest(api, {
          request: { url: `${RANDOM_LOGIN_URL}?unexpected=1`, method: "GET" }
        });
      }
    });
    publicSurfaces.push({ error: outcome.publicError.message, calls: outcome.api.calls });
  }

  // Declaring extra-info without ever delivering it must remain pending until
  // the bounded timeout and must not run the privileged task.
  {
    const outcome = await expectFailure(captureGrokMirrorRandomLoginCookie, {
      label: "hasExtraInfo requires the matching extra-info event",
      onArmed(api) {
        emitInitialRequest(api);
        emitResponse(api, { hasExtraInfo: true });
      }
    });
    publicSurfaces.push({ error: outcome.publicError.message, calls: outcome.api.calls });
  }

  // Losing the debugger target invalidates all evidence immediately.
  {
    const outcome = await expectFailure(captureGrokMirrorRandomLoginCookie, {
      label: "onDetach must invalidate the capture",
      onArmed(api) {
        api.emitDetach();
      }
    });
    publicSurfaces.push({ error: outcome.publicError.message, calls: outcome.api.calls });
  }

  // A failed direct attach must never detach a debugger session it did not own.
  {
    const api = fakeDebuggerApi({ attachError: new Error("already attached") });
    const outcome = await expectFailure(captureGrokMirrorRandomLoginCookie, {
      api,
      label: "attach failure must be ownership-safe",
      options: { shared: false }
    });
    assert.equal(api.calls.some((call) => call.kind === "detach"), false);
    assert.equal(api.calls.filter((call) => call.kind === "attach").length, 1);
    publicSurfaces.push({ error: outcome.publicError.message, calls: api.calls });
  }

  // Even valid capture evidence is not success unless the privileged consumer
  // confirms it completed its work.
  {
    const outcome = await expectFailure(captureGrokMirrorRandomLoginCookie, {
      label: "a false task result must not report success",
      expectTask: true,
      taskResult: false,
      onArmed(api) {
        emitInitialRequest(api);
        emitResponse(api);
      }
    });
    publicSurfaces.push({ error: outcome.publicError.message, calls: outcome.api.calls });
  }

  // AbortSignal is part of the capture lifetime and must clean up all listeners
  // without waiting for the timeout.
  {
    const controller = new AbortController();
    const outcome = await expectFailure(captureGrokMirrorRandomLoginCookie, {
      label: "AbortSignal must cancel an armed capture",
      options: { signal: controller.signal },
      onArmed() {
        controller.abort();
      }
    });
    publicSurfaces.push({ error: outcome.publicError.message, calls: outcome.api.calls });
  }

  assertNoTokenLeak(publicSurfaces, "public results, errors, and debugger-call records");
  console.log("Grok Mirror random-login capture: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
