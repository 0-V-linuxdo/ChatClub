#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { functionSource } = require("./function-source.cjs");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const dataModule = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const EXTENSION_SITE = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";

function frameBindingId(frameId) {
  return Math.max(0, Number(frameId) || 0).toString(16).padStart(64, "0").slice(-64);
}

function partitionId(details = {}) {
  const key = details.partitionKey || {};
  return JSON.stringify([
    String(details.storeId || ""),
    String(details.name || ""),
    String(key.topLevelSite || ""),
    Boolean(key.hasCrossSiteAncestor)
  ]);
}

function sourceCookie(name, value, overrides = {}) {
  return {
    name,
    value,
    domain: ".grok.com",
    hostOnly: false,
    path: "/",
    secure: true,
    httpOnly: name === "grok_device_id",
    sameSite: name === "sso-rw" ? "strict" : "lax",
    session: name !== "grok_device_id",
    storeId: "0",
    ...(name === "grok_device_id" ? { expirationDate: 2000000000 } : {}),
    ...overrides
  };
}

function mirrorSourceCookie(value, overrides = {}) {
  return sourceCookie("user-gateway-token", value, {
    domain: ".gk.dairoot.cn",
    hostOnly: false,
    secure: false,
    httpOnly: true,
    sameSite: "lax",
    session: true,
    ...overrides
  });
}

function fakeExtensionApi(sources = []) {
  const sourceByName = new Map(sources.map((cookie) => [cookie.name, { ...cookie }]));
  const targets = new Map();
  const setCalls = [];
  const removeCalls = [];
  const getCalls = [];
  const getPartitionKeyCalls = [];
  const executeScriptAttempts = [];
  const executeScriptCalls = [];
  const webSocketProbeCalls = [];
  const locationProbeCalls = [];
  const extensionPageScriptAttempts = [];
  const debuggerCalls = [];
  const debuggerSetCalls = [];
  const debuggerDeleteCalls = [];
  const debuggerEventListeners = new Set();
  const debuggerDetachListeners = new Set();
  const stored = {};
  const api = {
    sourceByName,
    targets,
    setCalls,
    removeCalls,
    getCalls,
    getPartitionKeyCalls,
    executeScriptAttempts,
    executeScriptCalls,
    webSocketProbeCalls,
    locationProbeCalls,
    extensionPageScriptAttempts,
    debuggerCalls,
    debuggerSetCalls,
    debuggerDeleteCalls,
    emitDebuggerEvent(source, method, params = {}) {
      for (const listener of [...debuggerEventListeners]) listener(source, method, params);
    },
    partitionCookieDetailsMode: "full",
    partitionKeyResultMode: "full",
    partitionKeyDefault: null,
    framesByTab: new Map(),
    tabUrls: new Map([
      [7, `${EXTENSION_SITE}/index.html`],
      [8, "https://example.com/"],
      [9, `${EXTENSION_SITE}/index.html`]
    ]),
    partitionKeyByDocumentId: new Map(),
    currentHrefByDocumentId: new Map(),
    extensionTopDocuments: new Map(),
    stalePartitionDocuments: new Set(),
    staleExecutionDocuments: new Set(),
    debuggerFrameTargetId: "",
    debuggerFrameSessionId: "",
    debuggerFrameOwnerFrameId: 0,
    debuggerPageFrameId: "",
    debuggerTargetFrameIds: new Map(),
    debuggerSessionFrameIds: new Map(),
    debuggerPageFrameIds: new Map(),
    frameBindingIds: new Map(),
    omitGetFrameResultFrameId: false,
    getFrameResultFrameIdOverride: null,
    stored,
    runtime: {
      id: "abcdefghijklmnopabcdefghijklmnop",
      getURL: () => `${EXTENSION_SITE}/`
    },
    webNavigation: {
      async getFrame({ tabId, frameId }) {
        let frame = null;
        if (api.frameDetails?.tabId === tabId && api.frameDetails?.frameId === frameId) {
          frame = api.frameDetails;
        } else {
          frame = (api.framesByTab.get(tabId) || []).find((entry) => entry.frameId === frameId) || null;
        }
        if (!frame) return null;
        const parentDocumentId = frame.frameId > 0 && frame.parentFrameId === 0
          ? String(frame.parentDocumentId || (
              (api.framesByTab.get(tabId) || []).find((entry) => entry.frameId === 0)?.documentId
              || api.extensionTopDocuments.get(tabId)?.documentId
              || ""
            ))
          : "";
        const result = { ...frame, ...(parentDocumentId ? { parentDocumentId } : {}) };
        if (api.omitGetFrameResultFrameId) delete result.frameId;
        if (Number.isInteger(api.getFrameResultFrameIdOverride)) {
          result.frameId = api.getFrameResultFrameIdOverride;
        }
        return result;
      },
      async getAllFrames({ tabId }) {
        const frames = api.framesByTab.get(tabId) || [];
        const topDocumentId = String(
          frames.find((entry) => entry.frameId === 0)?.documentId
          || api.extensionTopDocuments.get(tabId)?.documentId
          || ""
        );
        return frames.map((frame) => ({
          ...frame,
          ...(frame.frameId > 0 && frame.parentFrameId === 0 && topDocumentId
            ? { parentDocumentId: String(frame.parentDocumentId || topDocumentId) }
            : {})
        }));
      }
    },
    tabs: {
      async get(tabId) {
        const url = api.tabUrls.get(tabId);
        return url ? { id: tabId, url } : null;
      }
    },
    scripting: {
      async executeScript(details) {
        const target = {
          ...(Number.isInteger(details?.target?.tabId) ? { tabId: details.target.tabId } : {}),
          ...(Array.isArray(details?.target?.documentIds)
            ? { documentIds: [...details.target.documentIds] }
            : {}),
          ...(Array.isArray(details?.target?.frameIds) ? { frameIds: [...details.target.frameIds] } : {})
        };
        executeScriptAttempts.push({ target });
        const topDocumentId = String(api.extensionTopDocuments.get(target.tabId)?.documentId || (
          (api.framesByTab.get(target.tabId) || []).find((entry) => entry.frameId === 0)?.documentId || ""
        ));
        const targetsExtensionPage = (
          target.frameIds?.length === 1
          && target.frameIds[0] === 0
        ) || (
          topDocumentId
          && target.documentIds?.length === 1
          && String(target.documentIds[0]) === topDocumentId
        );
        if (api.forbidExtensionPageScripting && targetsExtensionPage) {
          extensionPageScriptAttempts.push({ target });
          throw new Error(
            `Cannot access contents of url "${EXTENSION_SITE}/index.html". Extension manifest must request permission.`
          );
        }
        if ((target.documentIds || []).some((id) => api.staleExecutionDocuments.has(id))) {
          throw new Error("No document with the requested id exists");
        }
        if (details?.func?.name === "currentDocumentHref") {
          locationProbeCalls.push({ target });
          if (api.locationProbeMode === "error") throw new Error("Location probe failed");
          const documentId = String(target.documentIds?.[0] || "");
          const extensionTopDocument = api.extensionTopDocuments.get(target.tabId) || null;
          const frame = [api.frameDetails, ...[...api.framesByTab.values()].flat()].find((entry) => (
            String(entry?.documentId || "") === documentId
          ));
          const href = api.currentHrefByDocumentId.has(documentId)
            ? api.currentHrefByDocumentId.get(documentId)
            : (String(extensionTopDocument?.documentId || "") === documentId
                ? extensionTopDocument?.url
                : frame?.url);
          const frameId = String(extensionTopDocument?.documentId || "") === documentId
            ? 0
            : frame?.frameId;
          if (api.locationProbeMode === "empty") return [];
          if (api.locationProbeMode === "multiple") {
            return [
              { frameId, documentId, result: String(href || "") },
              { frameId, documentId, result: String(href || "") }
            ];
          }
          return [{ frameId, documentId, result: String(href || "") }];
        }
        if (details?.func?.name === "probeMirrorRandomLoginWebSocket") {
          const documentId = String(target.documentIds?.[0] || "");
          const frame = [api.frameDetails, ...[...api.framesByTab.values()].flat()].find((entry) => (
            String(entry?.documentId || "") === documentId
          ));
          webSocketProbeCalls.push({
            target,
            world: details.world,
            args: [...(details.args || [])]
          });
          const hookResult = await api.onWebSocketProbe?.(details, { target, frame });
          if (hookResult !== undefined) return hookResult;
          return [{
            frameId: frame?.frameId,
            documentId,
            result: "open"
          }];
        }
        executeScriptCalls.push({ target });
        const hookResult = await api.onExecuteScript?.(details);
        if (hookResult !== undefined) return hookResult;
        return [{ result: true }];
      }
    },
    debugger: {
      onEvent: {
        addListener(listener) { debuggerEventListeners.add(listener); },
        removeListener(listener) { debuggerEventListeners.delete(listener); }
      },
      onDetach: {
        addListener(listener) { debuggerDetachListeners.add(listener); },
        removeListener(listener) { debuggerDetachListeners.delete(listener); }
      },
      async attach(target, version) {
        debuggerCalls.push({ method: "attach", target: { ...target }, version });
        if (api.debuggerAttachError) {
          await api.onDebuggerAttachFailure?.(target);
          throw new Error("Another debugger is already attached");
        }
        if (api.debuggerAttachedTabId != null) throw new Error("Another debugger is already attached");
        api.debuggerAttachedTabId = target.tabId;
        await api.onDebuggerAttach?.(target);
      },
      async sendCommand(target, method, params = {}) {
        debuggerCalls.push({ method, target: { ...target } });
        if (api.debuggerAttachedTabId !== target.tabId) throw new Error("Debugger is not attached");
        const tabFrames = api.framesByTab.get(target.tabId) || [];
        const mirrorFrame = tabFrames.find((frame) =>
          frame.parentFrameId === 0 && String(frame.url || "").startsWith("https://gk.dairoot.cn/")
        );
        if (method === "Network.enable") return {};
        if (method === "Target.setAutoAttach") {
          if (mirrorFrame && api.debuggerFrameTargetId && api.debuggerFrameSessionId) {
            api.debuggerTargetFrameIds.set(
              api.debuggerFrameTargetId,
              api.debuggerFrameOwnerFrameId || mirrorFrame.frameId
            );
            api.debuggerSessionFrameIds.set(
              api.debuggerFrameSessionId,
              api.debuggerFrameOwnerFrameId || mirrorFrame.frameId
            );
            queueMicrotask(() => {
              api.emitDebuggerEvent({ tabId: target.tabId }, "Target.attachedToTarget", {
                sessionId: api.debuggerFrameSessionId,
                targetInfo: {
                  type: "iframe",
                  targetId: api.debuggerFrameTargetId,
                  url: api.debuggerFrameUrl || mirrorFrame.url
                }
              });
            });
          }
          return {};
        }
        if (method === "Page.getFrameTree") {
          assert.ok(
            String(target.sessionId || ""),
            "the OOPIF frame tree must be queried through its child target session"
          );
          const frameId = api.debuggerSessionFrameIds.get(String(target.sessionId || ""));
          const frame = tabFrames.find((entry) => entry.frameId === frameId);
          const pageFrameId = api.debuggerPageFrameId || api.debuggerFrameTargetId;
          if (pageFrameId) api.debuggerPageFrameIds.set(pageFrameId, frameId);
          return {
            frameTree: {
              frame: {
                id: pageFrameId,
                url: api.debuggerFrameUrl || frame?.url || ""
              }
            }
          };
        }
        if (method === "DOM.getFrameOwner") {
          assert.equal(
            String(target.sessionId || ""),
            "",
            "the OOPIF owner must be resolved through the embedding root target"
          );
          const frameId = api.debuggerPageFrameIds.get(String(params.frameId || ""));
          return Number.isInteger(frameId) ? { backendNodeId: 10_000 + frameId } : {};
        }
        if (method === "DOM.describeNode") {
          assert.equal(
            String(target.sessionId || ""),
            "",
            "the OOPIF owner node must be described through the embedding root target"
          );
          const frameId = Number(params.backendNodeId) - 10_000;
          const bindingId = api.frameBindingIds.get(frameId) || frameBindingId(frameId);
          return { node: { attributes: bindingId
            ? ["data-frame-binding-id", bindingId]
            : [] } };
        }
        if (method === "Network.getCookies") {
          const url = new URL(params.urls?.[0] || "https://gk.dairoot.cn/");
          return {
            cookies: [...api.targets.values()].filter((cookie) => (
              String(cookie.path || "/") === url.pathname
              && String(cookie.domain || "").replace(/^\./, "") === url.hostname
            )).map((cookie) => ({
              name: cookie.name,
              value: cookie.value,
              domain: cookie.domain,
              path: cookie.path,
              secure: cookie.secure,
              httpOnly: cookie.httpOnly,
              sameSite: cookie.sameSite === "no_restriction" ? "None" : "Lax",
              session: cookie.session,
              expires: cookie.session ? -1 : cookie.expirationDate,
              partitionKey: { ...cookie.partitionKey }
            }))
          };
        }
        if (method === "Network.setCookie") {
          debuggerSetCalls.push({
            name: params.name,
            url: params.url,
            domain: params.domain,
            path: params.path,
            partitionKey: { ...params.partitionKey }
          });
          const cookie = {
            name: params.name,
            value: params.value,
            domain: api.debuggerSetDomainOverride ?? params.domain ?? new URL(params.url).hostname,
            hostOnly: !params.domain,
            path: params.path || "/",
            secure: params.secure === true,
            httpOnly: params.httpOnly === true,
            sameSite: params.sameSite === "None" ? "no_restriction" : "unspecified",
            session: params.expires === undefined,
            storeId: "0",
            partitionKey: { ...params.partitionKey },
            ...(params.expires === undefined ? {} : { expirationDate: params.expires })
          };
          api.targets.set(partitionId({
            name: params.name,
            storeId: "0",
            partitionKey: params.partitionKey
          }), cookie);
          return { success: true };
        }
        if (method === "Network.deleteCookies") {
          debuggerDeleteCalls.push({
            name: params.name,
            domain: params.domain,
            path: params.path,
            partitionKey: { ...params.partitionKey }
          });
          api.targets.delete(partitionId({
            name: params.name,
            storeId: "0",
            partitionKey: params.partitionKey
          }));
          return {};
        }
        throw new Error(`Unexpected debugger command ${method}`);
      },
      async detach(target) {
        debuggerCalls.push({ method: "detach", target: { ...target } });
        if (api.debuggerAttachedTabId === target.tabId) delete api.debuggerAttachedTabId;
      }
    },
    storage: {
      local: {
        async get(key) {
          return { [key]: stored[key] };
        },
        async set(values) {
          Object.assign(stored, JSON.parse(JSON.stringify(values)));
        },
        async remove(key) {
          delete stored[key];
        }
      }
    },
    cookies: {
      async getAllCookieStores() {
        return [{ id: "0", tabIds: [7, 8] }, { id: "1", tabIds: [9] }];
      },
      async get(details) {
        getCalls.push({ ...details, ...(details.partitionKey ? { partitionKey: { ...details.partitionKey } } : {}) });
        await api.onCookieGet?.(details);
        if (details.partitionKey) {
          if (api.partitionCookieDetailsMode === "unsupported") {
            throw new TypeError("Error at property 'partitionKey': Unexpected property: 'partitionKey'.");
          }
          if (
            api.partitionCookieDetailsMode === "top-level-only"
            && Object.hasOwn(details.partitionKey, "hasCrossSiteAncestor")
          ) throw new TypeError("Error at property 'hasCrossSiteAncestor': Unexpected property: 'hasCrossSiteAncestor' in partitionKey.");
          return targets.get(partitionId(details)) || null;
        }
        return sourceByName.get(details.name) || null;
      },
      async getPartitionKey(details = {}) {
        getPartitionKeyCalls.push({ ...details });
        if (api.stalePartitionDocuments.has(String(details.documentId || ""))) {
          throw new Error("The frame or document is no longer available");
        }
        if (api.partitionKeyResultMode === "empty") return {};
        const partitionKey = {
          ...(api.partitionKeyByDocumentId.get(String(details.documentId || "")) || api.partitionKeyDefault || {
            topLevelSite: EXTENSION_SITE,
            hasCrossSiteAncestor: true
          })
        };
        return api.partitionKeyResultMode === "wrapped"
          ? { partitionKey }
          : partitionKey;
      },
      async set(details) {
        if (details.partitionKey && api.partitionCookieDetailsMode === "unsupported") {
          throw new TypeError("Error at property 'partitionKey': Unexpected property: 'partitionKey'.");
        }
        if (
          details.partitionKey
          && api.partitionCookieDetailsMode === "top-level-only"
          && Object.hasOwn(details.partitionKey, "hasCrossSiteAncestor")
        ) throw new TypeError("Error at property 'hasCrossSiteAncestor': Unexpected property in partitionKey.");
        setCalls.push({ ...details, partitionKey: { ...details.partitionKey } });
        const cookie = {
          name: details.name,
          value: details.value,
          domain: details.domain || new URL(details.url).hostname,
          hostOnly: !details.domain,
          path: details.path || "/",
          secure: Boolean(details.secure),
          httpOnly: Boolean(details.httpOnly),
          sameSite: details.sameSite,
          session: details.expirationDate === undefined,
          storeId: String(details.storeId || ""),
          partitionKey: { ...details.partitionKey },
          ...(details.expirationDate === undefined ? {} : { expirationDate: details.expirationDate })
        };
        targets.set(partitionId(details), cookie);
        return cookie;
      },
      async remove(details) {
        if (details.partitionKey && api.partitionCookieDetailsMode === "unsupported") {
          throw new TypeError("Error at property 'partitionKey': Unexpected property: 'partitionKey'.");
        }
        if (
          details.partitionKey
          && api.partitionCookieDetailsMode === "top-level-only"
          && Object.hasOwn(details.partitionKey, "hasCrossSiteAncestor")
        ) throw new TypeError("Error at property 'hasCrossSiteAncestor': Unexpected property in partitionKey.");
        removeCalls.push({ ...details, partitionKey: { ...details.partitionKey } });
        const cookie = targets.get(partitionId(details)) || null;
        targets.delete(partitionId(details));
        return cookie ? { url: details.url, name: details.name, storeId: details.storeId } : null;
      }
    }
  };
  return api;
}

async function releaseManagedCookie(bridge, { name, cause, value }) {
  const mirror = name === "user-gateway-token";
  const api = fakeExtensionApi([
    mirror
      ? mirrorSourceCookie(value || `${name}-${cause}`)
      : sourceCookie(name, value || `${name}-${cause}`)
  ]);
  await bridge.syncGrokSessionCookies(api, {
    storeId: "0",
    partitionKey: { topLevelSite: EXTENSION_SITE, hasCrossSiteAncestor: true },
    names: [name],
    ...(mirror ? { frameUrl: "https://gk.dairoot.cn/" } : {})
  });
  const key = { topLevelSite: EXTENSION_SITE, hasCrossSiteAncestor: true };
  const cookie = api.targets.get(partitionId({ name, storeId: "0", partitionKey: key }));
  assert.ok(cookie, `${name}/${cause}: managed target was not created`);
  assert.equal(
    bridge.grokCookieChangeOwnedByBridge({ removed: false, cookie }),
    true,
    `${name}/${cause}: bridge-owned set event was not consumed`
  );
  api.targets.delete(partitionId({ name, storeId: "0", partitionKey: key }));
  const released = await bridge.releaseChangedGrokPartition(api, { removed: true, cause, cookie });
  return { api, cookie, partitionKey: key, released };
}

(async () => {
  const bridge = await import(
    `${pathToFileURL(path.join(root, "background/grok-cookie-bridge.js")).href}?test=${Date.now()}`
  );
  const runtimeModule = await import(
    `${pathToFileURL(path.join(root, "background/grok-cookie-runtime.js")).href}?test=${Date.now()}`
  );
  const debuggerModule = await import(
    `${pathToFileURL(path.join(root, "background/grok-cookie-debugger.js")).href}?test=${Date.now()}`
  );
  const manifest = JSON.parse(read("manifest.json"));
  const grokRuntime = read("background/grok-cookie-runtime.js");
  const grokDebugger = read("background/grok-cookie-debugger.js");
  const backgroundRuntime = read("background/runtime.js");
  const serviceWorker = `${read("background/service-worker.js")}\n${backgroundRuntime}\n${grokRuntime}`;
  const relay = read("content/grok-cookie-bridge.js");
  const workspace = `${read("app/workspace/controller.js")}\n${read("app/workspace/frame-controller.js")}`;
  const protocol = await dataModule(read("shared/protocol.js"));

  assert.deepEqual(bridge.GROK_SESSION_COOKIE_NAMES, ["sso", "sso-rw", "grok_device_id"]);
  assert.equal(bridge.isGrokSessionUrl("https://grok.com/c/123"), true);
  assert.equal(bridge.isGrokSessionUrl("https://gk.dairoot.cn/c/123"), true);
  assert.equal(bridge.grokCookieProfileIdForUrl("https://grok.com/c/123"), "grok");
  assert.equal(bridge.grokCookieProfileIdForUrl("https://gk.dairoot.cn/chat/123"), "grokMirror");
  assert.equal(bridge.grokCookieProfileIdForCookie(sourceCookie("sso", "x")), "grok");
  assert.equal(bridge.grokCookieProfileIdForCookie(mirrorSourceCookie("x")), "grokMirror");
  assert.equal(bridge.isGrokSessionUrl("https://grok.x.ai/"), false);
  assert.equal(bridge.isGrokSessionUrl("https://sub.gk.dairoot.cn/"), false);
  assert.equal(bridge.isGrokSessionUrl("https://gk.dairoot.cn.evil.example/"), false);
  assert.equal(bridge.isGrokSessionUrl("https://gk.dairoot.cn:8443/"), false);
  assert.equal(bridge.isGrokSessionUrl("http://grok.com/"), false);
  assert.equal(bridge.isGrokSessionUrl("https://grok.com.evil.example/"), false);
  assert.deepEqual(
    bridge.chromiumExtensionPartitionKey({ getURL: () => `${EXTENSION_SITE}/` }),
    { topLevelSite: EXTENSION_SITE, hasCrossSiteAncestor: true }
  );
  assert.equal(bridge.chromiumExtensionPartitionKey({ getURL: () => "moz-extension://example/" }), null);

  const secrets = {
    sso: "SENTINEL_SSO_VALUE",
    "sso-rw": "SENTINEL_SSO_RW_VALUE",
    grok_device_id: "SENTINEL_DEVICE_VALUE"
  };
  const api = fakeExtensionApi([
    sourceCookie("sso", secrets.sso),
    sourceCookie("sso-rw", secrets["sso-rw"], { hostOnly: true, domain: "grok.com" }),
    sourceCookie("grok_device_id", secrets.grok_device_id)
  ]);
  const partitionKey = { topLevelSite: EXTENSION_SITE, hasCrossSiteAncestor: true };

  assert.equal(await bridge.cookieStoreIdForTab(api, 7), "0");
  assert.equal(await bridge.cookieStoreIdForTab(api, 9), "1");
  await assert.rejects(() => bridge.cookieStoreIdForTab(api, 99), /Cookie store/);

  const first = await bridge.syncGrokSessionCookies(api, { storeId: "0", partitionKey });
  assert.deepEqual(first, { changed: true, created: 3, updated: 0, removed: 0, skipped: 0 });
  assert.equal(api.setCalls.length, 3);
  for (const call of api.setCalls) {
    assert.deepEqual(call.partitionKey, partitionKey);
    assert.equal(call.sameSite, "no_restriction");
    assert.equal(call.secure, true);
    assert.equal(call.storeId, "0");
  }
  assert.equal(api.setCalls.find((call) => call.name === "grok_device_id").httpOnly, true);
  assert.equal(api.setCalls.find((call) => call.name === "grok_device_id").expirationDate, 2000000000);
  assert.equal("expirationDate" in api.setCalls.find((call) => call.name === "sso"), false);
  assert.equal("domain" in api.setCalls.find((call) => call.name === "sso-rw"), false);
  assert.equal(api.sourceByName.get("sso").sameSite, "lax", "source Cookie must remain untouched");
  assert.equal(api.sourceByName.get("sso-rw").sameSite, "strict", "source Cookie must remain untouched");
  assert.equal(Object.values(secrets).some((secret) => JSON.stringify(first).includes(secret)), false);
  assert.equal(Object.values(secrets).some((secret) => JSON.stringify(api.stored).includes(secret)), false);

  const second = await bridge.syncGrokSessionCookies(api, { storeId: "0", partitionKey });
  assert.deepEqual(second, { changed: false, created: 0, updated: 0, removed: 0, skipped: 0 });
  assert.equal(api.setCalls.length, 3, "idempotent sync must not write again");

  const mirrorSecret = "SENTINEL_MIRROR_GATEWAY_TOKEN";
  const mirrorApi = fakeExtensionApi([
    mirrorSourceCookie(mirrorSecret, {
      path: "/gateway",
      session: false,
      expirationDate: 2100000000
    })
  ]);
  const mirrorFirst = await bridge.syncGrokSessionCookies(mirrorApi, {
    storeId: "0",
    partitionKey,
    frameUrl: "https://gk.dairoot.cn/"
  });
  assert.deepEqual(mirrorFirst, { changed: true, created: 1, updated: 0, removed: 0, skipped: 0 });
  assert.equal(mirrorApi.setCalls.length, 1);
  assert.deepEqual(mirrorApi.setCalls[0], {
    url: "https://gk.dairoot.cn/gateway",
    name: "user-gateway-token",
    value: mirrorSecret,
    path: "/gateway",
    secure: true,
    httpOnly: true,
    sameSite: "no_restriction",
    partitionKey,
    storeId: "0",
    domain: ".gk.dairoot.cn",
    expirationDate: 2100000000
  });
  assert.equal(mirrorApi.sourceByName.get("user-gateway-token").secure, false);
  assert.equal(mirrorApi.sourceByName.get("user-gateway-token").sameSite, "lax");
  assert.equal(JSON.stringify(mirrorFirst).includes(mirrorSecret), false);
  assert.equal(JSON.stringify(mirrorApi.stored).includes(mirrorSecret), false);
  assert.equal(
    mirrorApi.getCalls.filter((call) => !call.partitionKey).every((call) => call.url === "https://gk.dairoot.cn/"),
    true,
    "Mirror sync must read only the Mirror origin"
  );
  assert.equal(
    (await bridge.syncGrokSessionCookies(mirrorApi, {
      storeId: "0",
      partitionKey,
      frameUrl: "https://gk.dairoot.cn/chat/example"
    })).changed,
    false,
    "Mirror sync must be idempotent"
  );

  const explicitLoginApi = fakeExtensionApi();
  const explicitLoginToken = `gt-${"a".repeat(32)}`;
  const randomLoginToken = `random-${"B".repeat(32)}`;
  const explicitStartedAt = Date.now() / 1000;
  const explicitInstalled = await bridge.setGrokMirrorLoginCookie(explicitLoginApi, {
    token: explicitLoginToken,
    storeId: "0",
    partitionKey
  });
  assert.deepEqual(explicitInstalled, { changed: true, created: 1, updated: 0 });
  const explicitCookie = explicitLoginApi.targets.get(partitionId({
    name: "user-gateway-token",
    storeId: "0",
    partitionKey
  }));
  assert.ok(explicitCookie.expirationDate >= explicitStartedAt + 12 * 60 * 60 - 2);
  assert.ok(explicitCookie.expirationDate <= Date.now() / 1000 + 12 * 60 * 60 + 2);
  const randomStartedAt = Date.now() / 1000;
  const randomInstalled = await bridge.setGrokMirrorLoginCookie(explicitLoginApi, {
    token: randomLoginToken,
    storeId: "0",
    partitionKey
  });
  assert.deepEqual(randomInstalled, { changed: true, created: 0, updated: 1 });
  const randomCookie = explicitLoginApi.targets.get(partitionId({
    name: "user-gateway-token",
    storeId: "0",
    partitionKey
  }));
  assert.ok(randomCookie.expirationDate >= randomStartedAt + 7 * 24 * 60 * 60 - 2);
  assert.ok(randomCookie.expirationDate <= Date.now() / 1000 + 7 * 24 * 60 * 60 + 2);
  randomCookie.expirationDate = Date.now() / 1000 + 60;
  const repairedLifetime = await bridge.setGrokMirrorLoginCookie(explicitLoginApi, {
    token: randomLoginToken,
    storeId: "0",
    partitionKey
  });
  assert.deepEqual(repairedLifetime, { changed: true, created: 0, updated: 1 });
  assert.equal(JSON.stringify(explicitInstalled).includes(explicitLoginToken), false);
  assert.equal(JSON.stringify(randomInstalled).includes(randomLoginToken), false);
  assert.equal(JSON.stringify(explicitLoginApi.stored).includes(explicitLoginToken), false);
  assert.equal(JSON.stringify(explicitLoginApi.stored).includes(randomLoginToken), false);

  const matchingLoginToken = `random-${"F".repeat(32)}`;
  const matchingLoginApi = fakeExtensionApi([
    mirrorSourceCookie(matchingLoginToken, {
      domain: "gk.dairoot.cn",
      hostOnly: true,
      session: false,
      expirationDate: Date.now() / 1000 + 7 * 24 * 60 * 60
    })
  ]);
  await bridge.syncGrokSessionCookies(matchingLoginApi, {
    storeId: "0",
    partitionKey,
    frameUrl: "https://gk.dairoot.cn/"
  });
  assert.deepEqual(await bridge.setGrokMirrorLoginCookie(matchingLoginApi, {
    token: matchingLoginToken,
    storeId: "0",
    partitionKey
  }), { changed: false, created: 0, updated: 0 });
  assert.equal(
    matchingLoginApi.setCalls.length,
    1,
    "an already matching site-login projection must only release its old bridge ownership"
  );
  assert.equal(
    Object.keys(matchingLoginApi.stored[bridge.GROK_COOKIE_LEDGER_KEY]?.entries || {}).length,
    0
  );

  const concurrentOwnershipApi = fakeExtensionApi([mirrorSourceCookie("MANAGED_BEFORE_SITE_LOGIN")]);
  const secondPartitionKey = { ...partitionKey, hasCrossSiteAncestor: false };
  await bridge.syncGrokSessionCookies(concurrentOwnershipApi, {
    storeId: "0",
    partitionKey,
    frameUrl: "https://gk.dairoot.cn/"
  });
  await bridge.syncGrokSessionCookies(concurrentOwnershipApi, {
    storeId: "0",
    partitionKey: secondPartitionKey,
    frameUrl: "https://gk.dairoot.cn/"
  });
  assert.equal(Object.keys(
    concurrentOwnershipApi.stored[bridge.GROK_COOKIE_LEDGER_KEY]?.entries || {}
  ).length, 2);
  await Promise.all([
    bridge.setGrokMirrorLoginCookie(concurrentOwnershipApi, {
      token: `random-${"C".repeat(32)}`,
      storeId: "0",
      partitionKey
    }),
    bridge.setGrokMirrorLoginCookie(concurrentOwnershipApi, {
      token: `random-${"D".repeat(32)}`,
      storeId: "0",
      partitionKey: secondPartitionKey
    })
  ]);
  assert.equal(
    Object.keys(concurrentOwnershipApi.stored[bridge.GROK_COOKIE_LEDGER_KEY]?.entries || {}).length,
    0,
    "concurrent site-owned login installs must not lose ledger ownership removals"
  );

  const failedLoginOwnershipApi = fakeExtensionApi([
    mirrorSourceCookie("MANAGED_BEFORE_FAILED_SITE_LOGIN")
  ]);
  await bridge.syncGrokSessionCookies(failedLoginOwnershipApi, {
    storeId: "0",
    partitionKey,
    frameUrl: "https://gk.dairoot.cn/"
  });
  const failedLoginTargetId = partitionId({
    name: "user-gateway-token",
    storeId: "0",
    partitionKey
  });
  const failedLoginBackend = {
    get: (details) => failedLoginOwnershipApi.cookies.get(details),
    remove: (details) => failedLoginOwnershipApi.cookies.remove(details),
    async set() {
      throw new Error("simulated pre-delivery revalidation failure");
    }
  };
  await assert.rejects(
    () => bridge.setGrokMirrorLoginCookie(failedLoginOwnershipApi, {
      token: `random-${"E".repeat(32)}`,
      storeId: "0",
      partitionKey,
      partitionCookieBackend: failedLoginBackend
    }),
    /could not be installed/
  );
  assert.ok(
    failedLoginOwnershipApi.stored[bridge.GROK_COOKIE_LEDGER_KEY]?.entries?.[failedLoginTargetId],
    "a pre-delivery site-login failure must retain ownership of the old managed target"
  );
  assert.equal(
    failedLoginOwnershipApi.targets.get(failedLoginTargetId)?.value,
    "MANAGED_BEFORE_FAILED_SITE_LOGIN"
  );
  assert.deepEqual(await bridge.removeAllManagedGrokPartitions(failedLoginOwnershipApi), {
    changed: true,
    removed: 1
  });
  assert.equal(failedLoginOwnershipApi.targets.has(failedLoginTargetId), false);
  assert.equal(failedLoginOwnershipApi.stored[bridge.GROK_COOKIE_LEDGER_KEY], undefined);

  const releaseFailureApi = fakeExtensionApi([
    mirrorSourceCookie("MANAGED_BEFORE_RELEASE_FAILURE")
  ]);
  await bridge.syncGrokSessionCookies(releaseFailureApi, {
    storeId: "0",
    partitionKey,
    frameUrl: "https://gk.dairoot.cn/"
  });
  const releaseFailureOldTarget = {
    ...releaseFailureApi.targets.get(failedLoginTargetId),
    partitionKey: { ...partitionKey }
  };
  const releaseFailureLedger = JSON.parse(JSON.stringify(
    releaseFailureApi.stored[bridge.GROK_COOKIE_LEDGER_KEY]
  ));
  const releaseFailureStorageSet = releaseFailureApi.storage.local.set.bind(
    releaseFailureApi.storage.local
  );
  releaseFailureApi.storage.local.set = async () => {
    throw new Error("simulated ownership release ledger failure");
  };
  const releaseFailureToken = `random-${"G".repeat(32)}`;
  await assert.rejects(
    () => bridge.setGrokMirrorLoginCookie(releaseFailureApi, {
      token: releaseFailureToken,
      storeId: "0",
      partitionKey
    }),
    /simulated ownership release ledger failure/
  );
  assert.deepEqual(
    releaseFailureApi.stored[bridge.GROK_COOKIE_LEDGER_KEY],
    releaseFailureLedger,
    "a failed ownership release must retain the old managed ledger entry"
  );
  assert.equal(
    releaseFailureApi.targets.get(failedLoginTargetId)?.value,
    "MANAGED_BEFORE_RELEASE_FAILURE",
    "a failed ownership release must restore the previous managed target"
  );
  const releaseFailureSet = releaseFailureApi.setCalls.at(-2);
  const releaseFailureNewTarget = {
    ...mirrorSourceCookie(releaseFailureToken, {
      domain: "gk.dairoot.cn",
      hostOnly: true,
      secure: true,
      sameSite: "no_restriction",
      session: false,
      expirationDate: releaseFailureSet.expirationDate,
      storeId: "0"
    }),
    partitionKey: { ...partitionKey }
  };
  assert.equal(bridge.grokCookieChangeOwnedByBridge({
    removed: true,
    cookie: releaseFailureOldTarget
  }), true);
  assert.equal(bridge.grokCookieChangeOwnedByBridge({
    removed: false,
    cookie: releaseFailureNewTarget
  }), true);
  assert.equal(bridge.grokCookieChangeOwnedByBridge({
    removed: true,
    cookie: releaseFailureNewTarget
  }), true);
  assert.equal(bridge.grokCookieChangeOwnedByBridge({
    removed: false,
    cookie: releaseFailureOldTarget
  }), true, "site-login rollback events must remain bridge-owned until consumed");
  releaseFailureApi.storage.local.set = releaseFailureStorageSet;
  assert.deepEqual(await bridge.removeAllManagedGrokPartitions(releaseFailureApi), {
    changed: true,
    removed: 1
  });
  assert.equal(releaseFailureApi.targets.has(failedLoginTargetId), false);
  assert.equal(releaseFailureApi.stored[bridge.GROK_COOKIE_LEDGER_KEY], undefined);

  const releaseCreationFailureApi = fakeExtensionApi([
    mirrorSourceCookie("MANAGED_LEDGER_WITH_MISSING_TARGET")
  ]);
  await bridge.syncGrokSessionCookies(releaseCreationFailureApi, {
    storeId: "0",
    partitionKey,
    frameUrl: "https://gk.dairoot.cn/"
  });
  releaseCreationFailureApi.targets.delete(failedLoginTargetId);
  const releaseCreationLedger = JSON.parse(JSON.stringify(
    releaseCreationFailureApi.stored[bridge.GROK_COOKIE_LEDGER_KEY]
  ));
  const releaseCreationStorageSet = releaseCreationFailureApi.storage.local.set.bind(
    releaseCreationFailureApi.storage.local
  );
  releaseCreationFailureApi.storage.local.set = async () => {
    throw new Error("simulated creation ownership release failure");
  };
  const releaseCreationToken = `random-${"H".repeat(32)}`;
  await assert.rejects(
    () => bridge.setGrokMirrorLoginCookie(releaseCreationFailureApi, {
      token: releaseCreationToken,
      storeId: "0",
      partitionKey
    }),
    /simulated creation ownership release failure/
  );
  assert.deepEqual(
    releaseCreationFailureApi.stored[bridge.GROK_COOKIE_LEDGER_KEY],
    releaseCreationLedger
  );
  assert.equal(
    releaseCreationFailureApi.targets.has(failedLoginTargetId),
    false,
    "a failed ownership release for a newly-created target must restore the missing-target state"
  );
  const releaseCreationSet = releaseCreationFailureApi.setCalls.at(-1);
  const releaseCreationTarget = {
    ...mirrorSourceCookie(releaseCreationToken, {
      domain: "gk.dairoot.cn",
      hostOnly: true,
      secure: true,
      sameSite: "no_restriction",
      session: false,
      expirationDate: releaseCreationSet.expirationDate,
      storeId: "0"
    }),
    partitionKey: { ...partitionKey }
  };
  assert.equal(bridge.grokCookieChangeOwnedByBridge({
    removed: false,
    cookie: releaseCreationTarget
  }), true);
  assert.equal(bridge.grokCookieChangeOwnedByBridge({
    removed: true,
    cookie: releaseCreationTarget
  }), true);
  releaseCreationFailureApi.storage.local.set = releaseCreationStorageSet;
  releaseCreationFailureApi.sourceByName.delete("user-gateway-token");
  await bridge.syncGrokSessionCookies(releaseCreationFailureApi, {
    storeId: "0",
    partitionKey,
    frameUrl: "https://gk.dairoot.cn/"
  });
  assert.equal(
    releaseCreationFailureApi.stored[bridge.GROK_COOKIE_LEDGER_KEY]?.entries?.[failedLoginTargetId],
    undefined,
    "source removal must clear the retained missing-target ownership record"
  );

  const verificationFailureBackend = (runtimeApi, token) => {
    let corruptNextGet = false;
    return {
      async get(details) {
        const cookie = await runtimeApi.cookies.get(details);
        if (!corruptNextGet || !cookie) return cookie;
        corruptNextGet = false;
        return { ...cookie, secure: false };
      },
      async set(details) {
        const result = await runtimeApi.cookies.set(details);
        if (details.value === token) corruptNextGet = true;
        return result;
      },
      remove: (details) => runtimeApi.cookies.remove(details)
    };
  };

  const verificationUpdateApi = fakeExtensionApi([
    mirrorSourceCookie("MANAGED_BEFORE_VERIFICATION_FAILURE")
  ]);
  await bridge.syncGrokSessionCookies(verificationUpdateApi, {
    storeId: "0",
    partitionKey,
    frameUrl: "https://gk.dairoot.cn/"
  });
  const verificationUpdateLedger = JSON.parse(JSON.stringify(
    verificationUpdateApi.stored[bridge.GROK_COOKIE_LEDGER_KEY]
  ));
  const verificationUpdateToken = `random-${"I".repeat(32)}`;
  await assert.rejects(
    () => bridge.setGrokMirrorLoginCookie(verificationUpdateApi, {
      token: verificationUpdateToken,
      storeId: "0",
      partitionKey,
      partitionCookieBackend: verificationFailureBackend(
        verificationUpdateApi,
        verificationUpdateToken
      )
    }),
    /verification failed/
  );
  assert.deepEqual(
    verificationUpdateApi.stored[bridge.GROK_COOKIE_LEDGER_KEY],
    verificationUpdateLedger,
    "a post-set verification mismatch must retain the previous ownership ledger"
  );
  assert.equal(
    verificationUpdateApi.targets.get(failedLoginTargetId)?.value,
    "MANAGED_BEFORE_VERIFICATION_FAILURE",
    "a post-set verification mismatch must restore the old managed projection"
  );
  assert.deepEqual(await bridge.removeAllManagedGrokPartitions(verificationUpdateApi), {
    changed: true,
    removed: 1
  });
  assert.equal(verificationUpdateApi.targets.has(failedLoginTargetId), false);

  const verificationCreationApi = fakeExtensionApi();
  const verificationCreationToken = `random-${"J".repeat(32)}`;
  await assert.rejects(
    () => bridge.setGrokMirrorLoginCookie(verificationCreationApi, {
      token: verificationCreationToken,
      storeId: "0",
      partitionKey,
      partitionCookieBackend: verificationFailureBackend(
        verificationCreationApi,
        verificationCreationToken
      )
    }),
    /verification failed/
  );
  assert.equal(
    verificationCreationApi.targets.has(failedLoginTargetId),
    false,
    "a post-set verification mismatch must remove a newly-created target"
  );
  assert.equal(verificationCreationApi.stored[bridge.GROK_COOKIE_LEDGER_KEY], undefined);

  const verificationThrowApi = fakeExtensionApi([
    mirrorSourceCookie("MANAGED_BEFORE_VERIFICATION_THROW")
  ]);
  await bridge.syncGrokSessionCookies(verificationThrowApi, {
    storeId: "0",
    partitionKey,
    frameUrl: "https://gk.dairoot.cn/"
  });
  const verificationThrowLedger = JSON.parse(JSON.stringify(
    verificationThrowApi.stored[bridge.GROK_COOKIE_LEDGER_KEY]
  ));
  const verificationThrowToken = `random-${"L".repeat(32)}`;
  let throwNextVerificationGet = false;
  const verificationThrowBackend = {
    async get(details) {
      if (throwNextVerificationGet) {
        throwNextVerificationGet = false;
        throw new Error("simulated post-set verification probe failure");
      }
      return verificationThrowApi.cookies.get(details);
    },
    async set(details) {
      const result = await verificationThrowApi.cookies.set(details);
      if (details.value === verificationThrowToken) throwNextVerificationGet = true;
      return result;
    },
    remove: (details) => verificationThrowApi.cookies.remove(details)
  };
  await assert.rejects(
    () => bridge.setGrokMirrorLoginCookie(verificationThrowApi, {
      token: verificationThrowToken,
      storeId: "0",
      partitionKey,
      partitionCookieBackend: verificationThrowBackend
    }),
    /simulated post-set verification probe failure/
  );
  assert.deepEqual(
    verificationThrowApi.stored[bridge.GROK_COOKIE_LEDGER_KEY],
    verificationThrowLedger
  );
  assert.equal(
    verificationThrowApi.targets.get(failedLoginTargetId)?.value,
    "MANAGED_BEFORE_VERIFICATION_THROW",
    "a post-set verification throw must restore the old managed projection"
  );
  await bridge.removeAllManagedGrokPartitions(verificationThrowApi);

  const writeThenRejectBackend = (runtimeApi, message) => {
    let rejected = false;
    return {
      get: (details) => runtimeApi.cookies.get(details),
      async set(details) {
        const result = await runtimeApi.cookies.set(details);
        if (!rejected) {
          rejected = true;
          throw new Error(message);
        }
        return result;
      },
      remove: (details) => runtimeApi.cookies.remove(details)
    };
  };

  const rejectedAfterLoginWriteApi = fakeExtensionApi([
    mirrorSourceCookie("MANAGED_BEFORE_POST_DELIVERY_REJECTION")
  ]);
  await bridge.syncGrokSessionCookies(rejectedAfterLoginWriteApi, {
    storeId: "0",
    partitionKey,
    frameUrl: "https://gk.dairoot.cn/"
  });
  const rejectedAfterLoginLedger = JSON.parse(JSON.stringify(
    rejectedAfterLoginWriteApi.stored[bridge.GROK_COOKIE_LEDGER_KEY]
  ));
  await assert.rejects(
    () => bridge.setGrokMirrorLoginCookie(rejectedAfterLoginWriteApi, {
      token: `random-${"K".repeat(32)}`,
      storeId: "0",
      partitionKey,
      partitionCookieBackend: writeThenRejectBackend(
        rejectedAfterLoginWriteApi,
        "simulated rejection after login Cookie delivery"
      )
    }),
    /could not be installed/
  );
  assert.deepEqual(
    rejectedAfterLoginWriteApi.stored[bridge.GROK_COOKIE_LEDGER_KEY],
    rejectedAfterLoginLedger
  );
  assert.equal(
    rejectedAfterLoginWriteApi.targets.get(failedLoginTargetId)?.value,
    "MANAGED_BEFORE_POST_DELIVERY_REJECTION",
    "a set rejection after proven delivery must compensate back to the managed target"
  );
  await bridge.removeAllManagedGrokPartitions(rejectedAfterLoginWriteApi);

  const rejectedAfterSyncWriteApi = fakeExtensionApi([
    mirrorSourceCookie("SYNC_POST_DELIVERY_REJECTION")
  ]);
  await assert.rejects(
    () => bridge.syncGrokSessionCookies(rejectedAfterSyncWriteApi, {
      storeId: "0",
      partitionKey,
      frameUrl: "https://gk.dairoot.cn/",
      partitionCookieBackend: writeThenRejectBackend(
        rejectedAfterSyncWriteApi,
        "simulated rejection after normal sync delivery"
      )
    }),
    /reported failure after a verified write/
  );
  assert.equal(
    rejectedAfterSyncWriteApi.targets.get(failedLoginTargetId)?.value,
    "SYNC_POST_DELIVERY_REJECTION"
  );
  assert.ok(
    rejectedAfterSyncWriteApi.stored[bridge.GROK_COOKIE_LEDGER_KEY]?.entries?.[failedLoginTargetId],
    "a normal-sync delivery followed by rejection must still acquire cleanup ownership"
  );
  assert.deepEqual(await bridge.removeAllManagedGrokPartitions(rejectedAfterSyncWriteApi), {
    changed: true,
    removed: 1
  });

  const profileIsolation = fakeExtensionApi([
    sourceCookie("sso", "OFFICIAL_ONLY"),
    sourceCookie("sso-rw", "OFFICIAL_RW_ONLY"),
    sourceCookie("grok_device_id", "OFFICIAL_DEVICE_ONLY"),
    mirrorSourceCookie("MIRROR_ONLY")
  ]);
  await bridge.syncGrokSessionCookies(profileIsolation, {
    storeId: "0",
    partitionKey,
    frameUrl: "https://grok.com/c/official"
  });
  assert.deepEqual(
    profileIsolation.setCalls.map((call) => call.name).sort(),
    ["grok_device_id", "sso", "sso-rw"],
    "official Grok must copy only its three-cookie profile"
  );
  await bridge.syncGrokSessionCookies(profileIsolation, {
    storeId: "0",
    partitionKey,
    frameUrl: "https://gk.dairoot.cn/c/mirror"
  });
  assert.deepEqual(
    profileIsolation.setCalls.map((call) => call.name).sort(),
    ["grok_device_id", "sso", "sso-rw", "user-gateway-token"],
    "Mirror must copy only user-gateway-token"
  );
  assert.equal(
    profileIsolation.setCalls.find((call) => call.name === "user-gateway-token").url,
    "https://gk.dairoot.cn/"
  );
  const blockedCrossProfile = await bridge.syncGrokSessionCookies(profileIsolation, {
    storeId: "0",
    partitionKey: { topLevelSite: EXTENSION_SITE },
    frameUrl: "https://gk.dairoot.cn/",
    names: ["sso", "sso-rw", "grok_device_id"]
  });
  assert.deepEqual(blockedCrossProfile, { changed: false, created: 0, updated: 0, removed: 0, skipped: 0 });

  const wrongMirrorDomain = fakeExtensionApi([
    mirrorSourceCookie("WRONG_DOMAIN", { domain: ".grok.com" })
  ]);
  assert.deepEqual(
    await bridge.syncGrokSessionCookies(wrongMirrorDomain, {
      storeId: "0",
      partitionKey,
      frameUrl: "https://gk.dairoot.cn/"
    }),
    { changed: false, created: 0, updated: 0, removed: 0, skipped: 0 }
  );
  assert.equal(wrongMirrorDomain.setCalls.length, 0, "a same-name Cookie on another domain must never be copied");

  const insecureOfficial = fakeExtensionApi([
    sourceCookie("sso", "INSECURE_OFFICIAL", { secure: false })
  ]);
  assert.equal(
    (await bridge.syncGrokSessionCookies(insecureOfficial, { storeId: "0", partitionKey })).changed,
    false,
    "the official Grok profile must still reject an insecure source Cookie"
  );
  assert.equal(insecureOfficial.setCalls.length, 0);

  api.sourceByName.delete("sso-rw");
  const removed = await bridge.syncGrokSessionCookies(api, { storeId: "0", partitionKey });
  assert.equal(removed.removed, 1);
  assert.equal(api.removeCalls.length, 1);
  assert.equal(api.sourceByName.has("sso"), true, "source Cookie must never be deleted");

  const unmanaged = fakeExtensionApi([sourceCookie("sso", "SOURCE")]);
  unmanaged.targets.set(partitionId({ name: "sso", storeId: "0", partitionKey }), {
    ...sourceCookie("sso", "SITE_OWNED", { storeId: "0" }),
    sameSite: "no_restriction",
    partitionKey
  });
  const skipped = await bridge.syncGrokSessionCookies(unmanaged, { storeId: "0", partitionKey });
  assert.equal(skipped.skipped, 1);
  assert.equal(unmanaged.setCalls.length, 0, "an existing site-owned partition must not be overwritten");

  const adoptable = fakeExtensionApi([sourceCookie("sso", "MATCHING")]);
  adoptable.targets.set(partitionId({ name: "sso", storeId: "0", partitionKey }), {
    ...sourceCookie("sso", "MATCHING", { storeId: "0" }),
    sameSite: "no_restriction",
    partitionKey
  });
  const adopted = await bridge.syncGrokSessionCookies(adoptable, { storeId: "0", partitionKey, names: ["sso"] });
  assert.deepEqual(adopted, { changed: false, created: 0, updated: 0, removed: 0, skipped: 0 });
  adoptable.sourceByName.set("sso", sourceCookie("sso", "ROTATED"));
  assert.equal(
    (await bridge.syncGrokSessionCookies(adoptable, { storeId: "0", partitionKey, names: ["sso"] })).updated,
    1,
    "an exact existing mirror must be adopted and follow later source rotation"
  );

  const adoptableMirror = fakeExtensionApi([mirrorSourceCookie("MATCHING_MIRROR")]);
  adoptableMirror.targets.set(partitionId({ name: "user-gateway-token", storeId: "0", partitionKey }), {
    ...mirrorSourceCookie("MATCHING_MIRROR", { secure: true, storeId: "0" }),
    sameSite: "no_restriction",
    partitionKey
  });
  assert.deepEqual(
    await bridge.syncGrokSessionCookies(adoptableMirror, {
      storeId: "0",
      partitionKey,
      frameUrl: "https://gk.dairoot.cn/"
    }),
    { changed: false, created: 0, updated: 0, removed: 0, skipped: 0 }
  );
  adoptableMirror.sourceByName.set("user-gateway-token", mirrorSourceCookie("ROTATED_MIRROR"));
  assert.equal(
    (await bridge.syncGrokSessionCookies(adoptableMirror, {
      storeId: "0",
      partitionKey,
      frameUrl: "https://gk.dairoot.cn/"
    })).updated,
    1,
    "an exact existing Mirror target must be adopted and follow source rotation"
  );
  adoptableMirror.sourceByName.delete("user-gateway-token");
  assert.equal(
    (await bridge.syncGrokSessionCookies(adoptableMirror, {
      storeId: "0",
      partitionKey,
      frameUrl: "https://gk.dairoot.cn/"
    })).removed,
    1,
    "a managed Mirror target must be removed when its source disappears"
  );

  const wrongKey = { topLevelSite: EXTENSION_SITE };
  const cleanup = fakeExtensionApi([sourceCookie("sso", "CLEANUP")]);
  await bridge.syncGrokSessionCookies(cleanup, { storeId: "0", partitionKey: wrongKey, names: ["sso"] });
  const cleaned = await bridge.removeManagedGrokPartitionsExcept(cleanup, { storeId: "0", partitionKey });
  assert.deepEqual(cleaned, { changed: true, removed: 1 });
  assert.equal(cleanup.targets.size, 0);

  const pathBound = fakeExtensionApi([mirrorSourceCookie("PATH_BOUND")]);
  await bridge.syncGrokSessionCookies(pathBound, {
    storeId: "0",
    partitionKey,
    frameUrl: "https://gk.dairoot.cn/"
  });
  const pathBoundCookie = pathBound.targets.get(partitionId({
    name: "user-gateway-token",
    storeId: "0",
    partitionKey
  }));
  const wrongPathTarget = { ...pathBoundCookie, path: "/other" };
  assert.equal(
    bridge.grokCookieChangeOwnedByBridge({ removed: false, cookie: wrongPathTarget }),
    false,
    "a same-name event at another path must not consume a managed root-path operation"
  );
  assert.deepEqual(
    await bridge.releaseChangedGrokPartition(pathBound, {
      removed: true,
      cause: "explicit",
      cookie: wrongPathTarget
    }),
    { changed: false, tombstoned: false },
    "a same-name target at another path must not release or tombstone the managed root Cookie"
  );
  assert.equal(bridge.grokCookieChangeOwnedByBridge({ removed: false, cookie: pathBoundCookie }), true);
  assert.equal(
    (await bridge.managedGrokPartitionKeys(pathBound, "0", { profileId: "grokMirror" })).length,
    1
  );

  const partial = fakeExtensionApi([
    sourceCookie("sso", "PARTIAL_ONE"),
    sourceCookie("sso-rw", "PARTIAL_TWO"),
    sourceCookie("grok_device_id", "PARTIAL_THREE")
  ]);
  const normalSet = partial.cookies.set.bind(partial.cookies);
  partial.cookies.set = async (details) => {
    if (details.name === "sso-rw") throw new Error("simulated Cookie write failure");
    return normalSet(details);
  };
  await assert.rejects(
    () => bridge.syncGrokSessionCookies(partial, { storeId: "0", partitionKey }),
    /simulated Cookie write failure/
  );
  const partialLedgerEntries = Object.values(
    partial.stored[bridge.GROK_COOKIE_LEDGER_KEY]?.entries || {}
  );
  assert.deepEqual(
    partialLedgerEntries.map((entry) => entry.name),
    ["sso"],
    "a failed partition Cookie write must not create false ledger ownership"
  );
  partial.cookies.set = normalSet;
  const recovered = await bridge.syncGrokSessionCookies(partial, { storeId: "0", partitionKey });
  assert.equal(recovered.created, 2, "a partial write must remain managed and recover on retry");
  assert.equal(partial.targets.size, 3);
  const cleared = await bridge.removeAllManagedGrokPartitions(partial);
  assert.deepEqual(cleared, { changed: true, removed: 3 });
  assert.equal(partial.targets.size, 0);
  assert.equal(partial.stored[bridge.GROK_COOKIE_LEDGER_KEY], undefined);

  const creationLedgerFailureApi = fakeExtensionApi([
    mirrorSourceCookie("CREATION_LEDGER_FAILURE")
  ]);
  const creationStorageSet = creationLedgerFailureApi.storage.local.set.bind(
    creationLedgerFailureApi.storage.local
  );
  creationLedgerFailureApi.storage.local.set = async () => {
    throw new Error("simulated creation ledger write failure");
  };
  await assert.rejects(
    () => bridge.syncGrokSessionCookies(creationLedgerFailureApi, {
      storeId: "0",
      partitionKey,
      frameUrl: "https://gk.dairoot.cn/"
    }),
    /simulated creation ledger write failure/
  );
  assert.equal(
    creationLedgerFailureApi.targets.has(failedLoginTargetId),
    false,
    "a newly-created target must be removed when its ownership ledger cannot be committed"
  );
  assert.equal(
    creationLedgerFailureApi.stored[bridge.GROK_COOKIE_LEDGER_KEY],
    undefined
  );
  assert.equal(creationLedgerFailureApi.removeCalls.length, 1);
  creationLedgerFailureApi.storage.local.set = creationStorageSet;

  const updateLedgerFailureApi = fakeExtensionApi([
    mirrorSourceCookie("UPDATE_LEDGER_OLD")
  ]);
  await bridge.syncGrokSessionCookies(updateLedgerFailureApi, {
    storeId: "0",
    partitionKey,
    frameUrl: "https://gk.dairoot.cn/"
  });
  const oldUpdateLedger = JSON.parse(JSON.stringify(
    updateLedgerFailureApi.stored[bridge.GROK_COOKIE_LEDGER_KEY]
  ));
  const updateStorageSet = updateLedgerFailureApi.storage.local.set.bind(
    updateLedgerFailureApi.storage.local
  );
  updateLedgerFailureApi.sourceByName.set(
    "user-gateway-token",
    mirrorSourceCookie("UPDATE_LEDGER_NEW")
  );
  updateLedgerFailureApi.storage.local.set = async () => {
    throw new Error("simulated update ledger write failure");
  };
  await assert.rejects(
    () => bridge.syncGrokSessionCookies(updateLedgerFailureApi, {
      storeId: "0",
      partitionKey,
      frameUrl: "https://gk.dairoot.cn/"
    }),
    /simulated update ledger write failure/
  );
  assert.deepEqual(
    updateLedgerFailureApi.stored[bridge.GROK_COOKIE_LEDGER_KEY],
    oldUpdateLedger,
    "a failed update ledger commit must retain the previous ownership record"
  );
  assert.equal(
    updateLedgerFailureApi.targets.get(failedLoginTargetId)?.value,
    "UPDATE_LEDGER_OLD",
    "a failed update ledger commit must restore the previous managed projection"
  );
  updateLedgerFailureApi.storage.local.set = updateStorageSet;
  updateLedgerFailureApi.sourceByName.delete("user-gateway-token");
  assert.equal(
    (await bridge.syncGrokSessionCookies(updateLedgerFailureApi, {
      storeId: "0",
      partitionKey,
      frameUrl: "https://gk.dairoot.cn/"
    })).removed,
    1,
    "source removal must still clean the restored managed target"
  );
  assert.equal(updateLedgerFailureApi.targets.has(failedLoginTargetId), false);
  assert.equal(
    updateLedgerFailureApi.stored[bridge.GROK_COOKIE_LEDGER_KEY]?.entries?.[failedLoginTargetId],
    undefined
  );

  const explicitSso = await releaseManagedCookie(bridge, { name: "sso", cause: "explicit", value: "ROTATE" });
  assert.equal(bridge.isPartitionedGrokTargetChange({ removed: true, cause: "explicit", cookie: explicitSso.cookie }), true);
  assert.deepEqual(explicitSso.released, { changed: true, tombstoned: true });
  const afterLogout = await bridge.syncGrokSessionCookies(explicitSso.api, { storeId: "0", partitionKey, names: ["sso"] });
  assert.equal(afterLogout.skipped, 1, "managed explicit sso removal must prevent immediate mirror recreation");
  assert.equal(
    await bridge.clearGrokTombstonesForStore(explicitSso.api, "0", [sourceCookie("grok_device_id", "other")]),
    false
  );
  assert.equal((await bridge.syncGrokSessionCookies(explicitSso.api, { storeId: "0", partitionKey, names: ["sso"] })).skipped, 1);
  assert.equal(
    await bridge.clearGrokTombstonesForStore(explicitSso.api, "0", [explicitSso.api.sourceByName.get("sso")]),
    true
  );
  assert.equal((await bridge.syncGrokSessionCookies(explicitSso.api, { storeId: "0", partitionKey, names: ["sso"] })).created, 1);

  const positiveTombstones = [
    await releaseManagedCookie(bridge, { name: "sso", cause: "expired_overwrite" }),
    await releaseManagedCookie(bridge, { name: "sso-rw", cause: "explicit" }),
    await releaseManagedCookie(bridge, { name: "sso-rw", cause: "expired_overwrite", value: "EXPIRED_LOGOUT" })
  ];
  for (const result of positiveTombstones) {
    assert.deepEqual(result.released, { changed: true, tombstoned: true });
  }

  const mirrorLogout = await releaseManagedCookie(bridge, {
    name: "user-gateway-token",
    cause: "explicit",
    value: "MIRROR_LOGOUT"
  });
  assert.equal(
    bridge.isPartitionedGrokTargetChange({ removed: true, cause: "explicit", cookie: mirrorLogout.cookie }),
    true
  );
  assert.deepEqual(mirrorLogout.released, { changed: true, tombstoned: true });
  assert.equal(
    (await bridge.syncGrokSessionCookies(mirrorLogout.api, {
      storeId: "0",
      partitionKey,
      frameUrl: "https://gk.dairoot.cn/"
    })).skipped,
    1,
    "explicit Mirror token removal must prevent immediate recreation"
  );
  assert.equal(
    await bridge.clearGrokTombstonesForStore(mirrorLogout.api, "0", [sourceCookie("sso", "other")]),
    false
  );
  assert.equal(
    await bridge.clearGrokTombstonesForStore(mirrorLogout.api, "0", [
      mirrorSourceCookie("MIRROR_LOGOUT", { path: "/other" })
    ]),
    false,
    "a current same-name source at another path must not clear the managed path tombstone"
  );
  assert.equal(
    await bridge.clearGrokTombstonesForStore(mirrorLogout.api, "0", [
      mirrorLogout.api.sourceByName.get("user-gateway-token")
    ]),
    true
  );
  assert.equal(
    (await bridge.syncGrokSessionCookies(mirrorLogout.api, {
      storeId: "0",
      partitionKey,
      frameUrl: "https://gk.dairoot.cn/"
    })).created,
    1
  );

  const deviceRemoval = await releaseManagedCookie(bridge, { name: "grok_device_id", cause: "explicit" });
  assert.deepEqual(deviceRemoval.released, { changed: true, tombstoned: false });
  assert.equal(
    (await bridge.syncGrokSessionCookies(deviceRemoval.api, { storeId: "0", partitionKey, names: ["grok_device_id"] })).created,
    1,
    "grok_device_id removal must not create an authentication tombstone"
  );

  const unrelatedCause = await releaseManagedCookie(bridge, { name: "sso", cause: "expired" });
  assert.deepEqual(unrelatedCause.released, { changed: true, tombstoned: false });
  assert.equal(
    (await bridge.syncGrokSessionCookies(unrelatedCause.api, { storeId: "0", partitionKey, names: ["sso"] })).created,
    1,
    "non-logout removal causes must not tombstone sso"
  );

  const unmanagedRemovalApi = fakeExtensionApi([sourceCookie("sso", "UNMANAGED_SOURCE")]);
  const unmanagedCookie = {
    ...sourceCookie("sso", "UNMANAGED_TARGET", { storeId: "0" }),
    sameSite: "no_restriction",
    partitionKey
  };
  unmanagedRemovalApi.targets.set(partitionId({ name: "sso", storeId: "0", partitionKey }), unmanagedCookie);
  unmanagedRemovalApi.targets.delete(partitionId({ name: "sso", storeId: "0", partitionKey }));
  assert.deepEqual(
    await bridge.releaseChangedGrokPartition(unmanagedRemovalApi, {
      removed: true,
      cause: "explicit",
      cookie: unmanagedCookie
    }),
    { changed: false, tombstoned: false },
    "an unmanaged partition must never acquire a logout tombstone"
  );

  assert.equal(bridge.isUnpartitionedGrokSourceChange({ cookie: sourceCookie("sso", "x") }), true);
  assert.equal(bridge.isUnpartitionedGrokSourceChange({ cookie: mirrorSourceCookie("x") }), true);
  assert.equal(
    bridge.isUnpartitionedGrokSourceChange({ cookie: mirrorSourceCookie("x", { path: "/other" }) }),
    true,
    "source classification may stay broad because tombstone release is bound to the current source URL and value"
  );
  assert.equal(
    bridge.isUnpartitionedGrokSourceChange({ cookie: mirrorSourceCookie("x", { domain: ".grok.com" }) }),
    false
  );
  assert.equal(bridge.isUnpartitionedGrokSourceChange({ cookie: sourceCookie("cf_clearance", "x") }), false);

  const REQUEST = {
    PREPARE_FRAME_LOAD: "prepareFrameLoad",
    MARK_GROK_FRAME_PREFLIGHT_FALLBACK: "markGrokFramePreflightFallback",
    SYNC_GROK_SESSION_COOKIES: "syncGrokSessionCookies",
    ARM_GROK_MIRROR_ACCOUNT_SWITCH: "armGrokMirrorAccountSwitch"
  };
  const extensionSender = { tab: { id: 7, url: `${EXTENSION_SITE}/index.html` } };
  const createRuntimeHandlers = (runtimeApi, updateDnrRules = async () => {}, runtimeDependencies = {}) => {
    const registeredFrameContext = async (tabId, frameId) => {
      const frame = await runtimeApi.webNavigation.getFrame({ tabId, frameId });
      if (!frame) return null;
      const documentId = String(frame.documentId || "");
      const bindingId = runtimeApi.frameBindingIds.get(frameId) || frameBindingId(frameId);
      runtimeApi.frameBindingIds.set(frameId, bindingId);
      return {
        token: `registered:${documentId}`,
        context: {
          tabId,
          frameId,
          documentId,
          browserDocumentId: documentId,
          parentDocumentId: String(frame.parentDocumentId || ""),
          url: String(runtimeApi.currentHrefByDocumentId.get(documentId) || frame.url || ""),
          frameBindingId: bindingId
        }
      };
    };
    const runtime = runtimeModule.createGrokCookieRuntime(runtimeApi, {
      verifiedExtensionPageSender: () => 7,
      registeredFrameContext,
      ...runtimeDependencies
    });
    return {
      runtime,
      handlers: new Map(runtime.requestHandlers(REQUEST, { updateDnrRules }))
    };
  };
  const fakeWithTabDebugger = (runtimeApi) => async (tabId, task) => {
    const target = { tabId };
    await runtimeApi.debugger.attach(target, "1.3");
    try {
      return await task({
        target,
        sendCommand(method, params = {}, sessionId = "") {
          return runtimeApi.debugger.sendCommand(
            sessionId ? { ...target, sessionId: String(sessionId) } : target,
            method,
            params
          );
        }
      });
    } finally {
      await runtimeApi.debugger.detach(target);
    }
  };

  const wrongDomainShapeApi = fakeExtensionApi();
  wrongDomainShapeApi.debuggerSetDomainOverride = "grok.com";
  await fakeWithTabDebugger(wrongDomainShapeApi)(7, async ({ sendCommand }) => {
    const backend = debuggerModule.createGrokManagedPartitionCookieBackend({
      partitionKey,
      revalidate: async () => true,
      sendCommand
    });
    await assert.rejects(backend.set({
      name: "sso",
      value: "WRONG_DOMAIN_SHAPE",
      url: "https://grok.com/",
      domain: ".grok.com",
      path: "/",
      secure: true,
      httpOnly: false,
      sameSite: "no_restriction",
      storeId: "0",
      partitionKey
    }), /operation failed/);
  });

  const explicitLoginRepairScenario = async ({
    tokenCharacter,
    sourceUrl = "https://gk.dairoot.cn/c/source",
    registered = true,
    staleRegisteredDocument = false,
    replaceTopDocument = false,
    finalUrl = "https://gk.dairoot.cn/",
    followWithRoot = false,
    expectInstall = false,
    delayAuthorizationPastTtl = false,
    delayQueuedRepairPastTtl = false,
    omitTopFrame = false,
    sourceParentDocumentId = "",
    finalParentDocumentId = "",
    committedParentDocumentId = ""
  }) => {
    assert.equal(
      delayAuthorizationPastTtl && delayQueuedRepairPastTtl,
      false,
      "explicit-login TTL scenarios must delay only one phase at a time"
    );
    const runtimeApi = fakeExtensionApi();
    runtimeApi.forbidExtensionPageScripting = omitTopFrame;
    const sourceDocumentId = `explicit-login-source-${tokenCharacter}`;
    const topBefore = {
      tabId: 7,
      frameId: 0,
      parentFrameId: -1,
      url: `${EXTENSION_SITE}/index.html`,
      documentId: `explicit-login-top-${tokenCharacter}`
    };
    const sourceFrame = {
      tabId: 7,
      frameId: 39,
      parentFrameId: 0,
      parentDocumentId: sourceParentDocumentId || topBefore.documentId,
      url: sourceUrl,
      documentId: sourceDocumentId
    };
    runtimeApi.extensionTopDocuments.set(7, topBefore);
    runtimeApi.framesByTab.set(7, omitTopFrame ? [sourceFrame] : [topBefore, sourceFrame]);
    runtimeApi.frameDetails = sourceFrame;
    runtimeApi.currentHrefByDocumentId.set(sourceDocumentId, sourceUrl);
    const registeredSnapshot = async () => {
      if (!registered) return null;
      const currentFrame = await runtimeApi.webNavigation.getFrame({ tabId: 7, frameId: 39 });
      if (!currentFrame) return null;
      const currentDocumentId = String(currentFrame.documentId || "");
      const registeredDocumentId = staleRegisteredDocument && currentDocumentId === sourceDocumentId
        ? `${sourceDocumentId}-stale`
        : currentDocumentId;
      const bindingId = frameBindingId(39);
      runtimeApi.frameBindingIds.set(39, bindingId);
      return {
        token: `registered-${tokenCharacter}:${registeredDocumentId}`,
        context: {
          tabId: 7,
          frameId: 39,
          documentId: registeredDocumentId,
          browserDocumentId: registeredDocumentId,
          parentDocumentId: String(currentFrame.parentDocumentId || ""),
          url: String(runtimeApi.currentHrefByDocumentId.get(currentDocumentId) || currentFrame.url || ""),
          frameBindingId: bindingId
        }
      };
    };
    let releaseAuthorization;
    const authorizationGate = delayAuthorizationPastTtl
      ? new Promise((resolve) => { releaseAuthorization = resolve; })
      : null;
    const runtimeBundle = createRuntimeHandlers(runtimeApi, undefined, {
      registeredFrameContext: async () => {
        if (authorizationGate) await authorizationGate;
        return registeredSnapshot();
      }
    });
    const { runtime, handlers } = runtimeBundle;
    let releaseQueuedBridge;
    let notifyQueuedBridgeStarted;
    const queuedBridgeGate = delayQueuedRepairPastTtl
      ? new Promise((resolve) => { releaseQueuedBridge = resolve; })
      : null;
    const queuedBridgeStarted = delayQueuedRepairPastTtl
      ? new Promise((resolve) => { notifyQueuedBridgeStarted = resolve; })
      : null;
    let queuedBridgeBlocked = false;
    if (delayQueuedRepairPastTtl) {
      runtimeApi.onCookieGet = async (details) => {
        if (queuedBridgeBlocked || details.name !== "__chatclub_partition_cookie_probe__") return;
        queuedBridgeBlocked = true;
        notifyQueuedBridgeStarted();
        await queuedBridgeGate;
      };
    }
    const sourceSender = {
      id: runtimeApi.runtime.id,
      tab: { id: 7, url: `${EXTENSION_SITE}/index.html` },
      frameId: sourceFrame.frameId,
      documentId: sourceFrame.documentId,
      url: sourceFrame.url
    };
    const queuedBridgeTask = delayQueuedRepairPastTtl
      ? handlers.get(REQUEST.SYNC_GROK_SESSION_COOKIES)(
          { bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION },
          sourceSender
        )
      : null;
    if (queuedBridgeStarted) await queuedBridgeStarted;
    const token = `gt-${tokenCharacter.repeat(32)}`;
    const loginUrl = `https://gk.dairoot.cn/api/not-login?user_gateway_token=${token}`;
    assert.equal(runtime.handleBeforeNavigate({
      tabId: 7,
      frameId: 39,
      parentFrameId: 0,
      parentDocumentId: topBefore.documentId,
      url: loginUrl
    }), true);
    runtime.handleNavigationError({
      tabId: 7,
      frameId: 39,
      parentFrameId: 0,
      parentDocumentId: topBefore.documentId,
      url: loginUrl,
      error: "net::ERR_ABORTED"
    });
    const topAfter = replaceTopDocument
      ? { ...topBefore, documentId: `${topBefore.documentId}-replaced` }
      : topBefore;
    let settledFrame = {
      ...sourceFrame,
      parentDocumentId: finalParentDocumentId || topAfter.documentId,
      url: finalUrl,
      documentId: `explicit-login-final-${tokenCharacter}`
    };
    runtimeApi.extensionTopDocuments.set(7, topAfter);
    runtimeApi.framesByTab.set(7, omitTopFrame ? [settledFrame] : [topAfter, settledFrame]);
    runtimeApi.frameDetails = settledFrame;
    runtimeApi.currentHrefByDocumentId.set(settledFrame.documentId, settledFrame.url);
    runtime.handleCommittedNavigation({
      ...settledFrame,
      parentDocumentId: committedParentDocumentId || topAfter.documentId
    });
    if (followWithRoot) {
      const rootFrame = {
        ...settledFrame,
        url: "https://gk.dairoot.cn/",
        documentId: `${settledFrame.documentId}-root`
      };
      runtimeApi.framesByTab.set(7, omitTopFrame ? [rootFrame] : [topAfter, rootFrame]);
      runtimeApi.frameDetails = rootFrame;
      runtimeApi.currentHrefByDocumentId.set(rootFrame.documentId, rootFrame.url);
      runtime.handleCommittedNavigation({ ...rootFrame, parentDocumentId: topAfter.documentId });
      settledFrame = rootFrame;
    }
    if (delayAuthorizationPastTtl || delayQueuedRepairPastTtl) {
      const originalDateNow = Date.now;
      let drainBridgeTask = null;
      try {
        if (delayQueuedRepairPastTtl) {
          await new Promise((resolve) => { setImmediate(resolve); });
        }
        Date.now = () => originalDateNow() + 16_000;
        if (releaseAuthorization) releaseAuthorization();
        await new Promise((resolve) => { setImmediate(resolve); });
        const settledSender = {
          id: runtimeApi.runtime.id,
          tab: { id: 7, url: `${EXTENSION_SITE}/index.html` },
          frameId: settledFrame.frameId,
          documentId: settledFrame.documentId,
          url: settledFrame.url
        };
        drainBridgeTask = handlers.get(REQUEST.SYNC_GROK_SESSION_COOKIES)(
          { bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION },
          settledSender
        );
        await new Promise((resolve) => { setImmediate(resolve); });
        if (releaseQueuedBridge) releaseQueuedBridge();
        if (queuedBridgeTask) await queuedBridgeTask.catch(() => {});
        await drainBridgeTask;
      } finally {
        if (releaseAuthorization) releaseAuthorization();
        if (releaseQueuedBridge) releaseQueuedBridge();
        Date.now = originalDateNow;
        if (queuedBridgeTask) await queuedBridgeTask.catch(() => {});
        if (drainBridgeTask) await drainBridgeTask.catch(() => {});
      }
    }
    const deadline = Date.now() + (expectInstall ? 1_000 : 120);
    while (!runtimeApi.setCalls.length && Date.now() < deadline) {
      await new Promise((resolve) => { setTimeout(resolve, 20); });
    }
    return { runtimeApi, token };
  };

  const authorizedLogin = await explicitLoginRepairScenario({
    tokenCharacter: "a",
    expectInstall: true
  });
  assert.equal(
    authorizedLogin.runtimeApi.targets.get(partitionId({
      name: "user-gateway-token",
      storeId: "0",
      partitionKey
    }))?.value,
    authorizedLogin.token,
    "only a registered exact Mirror source document may install the explicit gateway login"
  );
  assert.equal(authorizedLogin.runtimeApi.setCalls.length, 1);

  const arcMissingTopLogin = await explicitLoginRepairScenario({
    tokenCharacter: "9",
    omitTopFrame: true,
    expectInstall: true
  });
  assert.equal(
    arcMissingTopLogin.runtimeApi.targets.get(partitionId({
      name: "user-gateway-token",
      storeId: "0",
      partitionKey
    }))?.value,
    arcMissingTopLogin.token,
    "explicit login repair must bind through Arc's direct-child parentDocumentId when frameId 0 is omitted"
  );
  assert.equal(
    arcMissingTopLogin.runtimeApi.extensionPageScriptAttempts.length,
    0,
    "Arc explicit-login authorization must not script the extension parent document"
  );

  const arcConflictingSourceParentLogin = await explicitLoginRepairScenario({
    tokenCharacter: "8",
    omitTopFrame: true,
    sourceParentDocumentId: "explicit-login-hostile-parent"
  });
  assert.equal(
    arcConflictingSourceParentLogin.runtimeApi.setCalls.length,
    0,
    "a source frame whose parentDocumentId conflicts with navigation authorization must fail closed"
  );

  const arcConflictingCurrentParentLogin = await explicitLoginRepairScenario({
    tokenCharacter: "7",
    omitTopFrame: true,
    finalParentDocumentId: "explicit-login-replaced-current-parent"
  });
  assert.equal(
    arcConflictingCurrentParentLogin.runtimeApi.setCalls.length,
    0,
    "repair must reject a current frame whose parentDocumentId differs from the authorized extension document"
  );

  const arcConflictingCommitParentLogin = await explicitLoginRepairScenario({
    tokenCharacter: "6",
    omitTopFrame: true,
    committedParentDocumentId: "explicit-login-replaced-commit-parent"
  });
  assert.equal(
    arcConflictingCommitParentLogin.runtimeApi.setCalls.length,
    0,
    "repair must reject committed navigation metadata bound to a different parentDocumentId"
  );

  const hostileSiblingLogin = await explicitLoginRepairScenario({
    tokenCharacter: "b",
    sourceUrl: "https://example.com/hostile-frame"
  });
  assert.equal(hostileSiblingLogin.runtimeApi.setCalls.length, 0);

  const unregisteredLogin = await explicitLoginRepairScenario({
    tokenCharacter: "c",
    registered: false
  });
  assert.equal(unregisteredLogin.runtimeApi.setCalls.length, 0);

  const staleRegisteredLogin = await explicitLoginRepairScenario({
    tokenCharacter: "d",
    staleRegisteredDocument: true
  });
  assert.equal(staleRegisteredLogin.runtimeApi.setCalls.length, 0);

  const replacedParentLogin = await explicitLoginRepairScenario({
    tokenCharacter: "e",
    replaceTopDocument: true
  });
  assert.equal(replacedParentLogin.runtimeApi.setCalls.length, 0);

  const nonRootCommitLogin = await explicitLoginRepairScenario({
    tokenCharacter: "f",
    finalUrl: "https://gk.dairoot.cn/c/not-the-gateway-landing",
    followWithRoot: true
  });
  assert.equal(
    nonRootCommitLogin.runtimeApi.setCalls.length,
    0,
    "a non-root terminal commit must consume the token before any later root navigation"
  );

  const expiredAuthorizationLogin = await explicitLoginRepairScenario({
    tokenCharacter: "1",
    delayAuthorizationPastTtl: true
  });
  assert.equal(
    expiredAuthorizationLogin.runtimeApi.setCalls.length,
    0,
    "an explicit login authorization that resolves after its TTL must not write a Cookie"
  );

  const expiredQueuedRepairLogin = await explicitLoginRepairScenario({
    tokenCharacter: "2",
    delayQueuedRepairPastTtl: true
  });
  assert.equal(
    expiredQueuedRepairLogin.runtimeApi.setCalls.length,
    0,
    "an explicit login repair queued behind bridge work until after its TTL must not write a Cookie"
  );

  const mirrorPreflightApi = fakeExtensionApi([
    sourceCookie("sso", "OFFICIAL_MUST_NOT_LEAK"),
    mirrorSourceCookie("MIRROR_PREFLIGHT")
  ]);
  const mirrorPreflightRuntime = createRuntimeHandlers(mirrorPreflightApi);
  const mirrorPreflight = await mirrorPreflightRuntime.handlers.get(REQUEST.PREPARE_FRAME_LOAD)({
    url: "https://gk.dairoot.cn/chat/new",
    preflightId: "mirror-preflight-123456"
  }, extensionSender);
  assert.equal(mirrorPreflight.grokCookieBridge.supported, true);
  assert.equal(mirrorPreflight.grokCookieBridge.created, 1);
  assert.deepEqual(
    mirrorPreflightApi.setCalls.map((call) => [call.name, new URL(call.url).hostname]),
    [["user-gateway-token", "gk.dairoot.cn"]],
    "Mirror preflight must select its profile from the exact frame URL"
  );

  const officialPreflightApi = fakeExtensionApi([
    sourceCookie("sso", "OFFICIAL_PREFLIGHT"),
    mirrorSourceCookie("MIRROR_MUST_NOT_LEAK")
  ]);
  const officialPreflightRuntime = createRuntimeHandlers(officialPreflightApi);
  const officialPreflight = await officialPreflightRuntime.handlers.get(REQUEST.PREPARE_FRAME_LOAD)({
    url: "https://grok.com/",
    preflightId: "official-preflight-12345"
  }, extensionSender);
  assert.equal(officialPreflight.grokCookieBridge.created, 1);
  assert.deepEqual(
    officialPreflightApi.setCalls.map((call) => [call.name, new URL(call.url).hostname]),
    [["sso", "grok.com"]],
    "official preflight must never copy the Mirror token"
  );

  const rejectedPreflightApi = fakeExtensionApi([mirrorSourceCookie("NO_SUBDOMAIN_COPY")]);
  const rejectedPreflightRuntime = createRuntimeHandlers(rejectedPreflightApi);
  const rejectedPreflight = await rejectedPreflightRuntime.handlers.get(REQUEST.PREPARE_FRAME_LOAD)({
    url: "https://sub.gk.dairoot.cn/",
    preflightId: "rejected-preflight-12345"
  }, extensionSender);
  assert.equal(rejectedPreflight.grokCookieBridge.supported, false);
  assert.equal(rejectedPreflightApi.setCalls.length, 0);

  const mirrorFrameApi = fakeExtensionApi([
    sourceCookie("sso", "FRAME_OFFICIAL_MUST_NOT_LEAK"),
    mirrorSourceCookie("MIRROR_FRAME_SYNC")
  ]);
  const mirrorFrameUrl = "https://gk.dairoot.cn/c/frame-topic";
  mirrorFrameApi.frameDetails = {
    tabId: 7,
    frameId: 4,
    parentFrameId: 0,
    url: mirrorFrameUrl,
    documentId: "mirror-document"
  };
  mirrorFrameApi.framesByTab.set(7, [{
    tabId: 7,
    frameId: 0,
    parentFrameId: -1,
    url: `${EXTENSION_SITE}/index.html`,
    documentId: "mirror-extension-document"
  }, mirrorFrameApi.frameDetails]);
  const mirrorFrameRuntime = createRuntimeHandlers(mirrorFrameApi);
  const mirrorFrameResult = await mirrorFrameRuntime.handlers.get(REQUEST.SYNC_GROK_SESSION_COOKIES)({
    bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION
  }, {
    id: mirrorFrameApi.runtime.id,
    tab: { id: 7, url: `${EXTENSION_SITE}/index.html` },
    frameId: 4,
    documentId: "mirror-document",
    url: mirrorFrameUrl
  });
  assert.equal(mirrorFrameResult.supported, true);
  assert.equal(mirrorFrameResult.created, 1);
  assert.equal(mirrorFrameResult.reloadRequired, true);
  assert.deepEqual(mirrorFrameApi.setCalls.map((call) => call.name), ["user-gateway-token"]);

  const staleTombstoneKey = { topLevelSite: EXTENSION_SITE };
  const staleTombstoneApi = fakeExtensionApi([mirrorSourceCookie("STALE_BEFORE_ROTATION")]);
  await bridge.syncGrokSessionCookies(staleTombstoneApi, {
    storeId: "0",
    partitionKey: staleTombstoneKey,
    frameUrl: "https://gk.dairoot.cn/"
  });
  const staleManagedCookie = staleTombstoneApi.targets.get(partitionId({
    name: "user-gateway-token",
    storeId: "0",
    partitionKey: staleTombstoneKey
  }));
  assert.equal(bridge.grokCookieChangeOwnedByBridge({ removed: false, cookie: staleManagedCookie }), true);
  staleTombstoneApi.targets.delete(partitionId({
    name: "user-gateway-token",
    storeId: "0",
    partitionKey: staleTombstoneKey
  }));
  assert.deepEqual(
    await bridge.releaseChangedGrokPartition(staleTombstoneApi, {
      removed: true,
      cause: "explicit",
      cookie: staleManagedCookie
    }),
    { changed: true, tombstoned: true }
  );
  assert.deepEqual(
    await bridge.managedGrokPartitionKeys(staleTombstoneApi, "0", { profileId: "grokMirror" }),
    [staleTombstoneKey]
  );
  const authoritativeMirrorUrl = "https://gk.dairoot.cn/c/authoritative-topic";
  staleTombstoneApi.frameDetails = {
    tabId: 7,
    frameId: 10,
    parentFrameId: 0,
    url: authoritativeMirrorUrl,
    documentId: "authoritative-mirror-document"
  };
  staleTombstoneApi.framesByTab.set(7, [{
    tabId: 7,
    frameId: 0,
    parentFrameId: -1,
    url: `${EXTENSION_SITE}/index.html`,
    documentId: "authoritative-extension-document"
  }, staleTombstoneApi.frameDetails]);
  const staleTombstoneRuntime = createRuntimeHandlers(staleTombstoneApi);
  const authoritativeMirrorResult = await staleTombstoneRuntime.handlers.get(
    REQUEST.SYNC_GROK_SESSION_COOKIES
  )({
    bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION
  }, {
    id: staleTombstoneApi.runtime.id,
    tab: { id: 7, url: `${EXTENSION_SITE}/index.html` },
    frameId: 10,
    documentId: "authoritative-mirror-document",
    url: authoritativeMirrorUrl
  });
  assert.equal(authoritativeMirrorResult.changed, true);
  assert.equal(authoritativeMirrorResult.created, 1);
  assert.equal(authoritativeMirrorResult.removed, 0, "tombstone cleanup must not claim a Cookie removal");
  assert.deepEqual(
    await bridge.managedGrokPartitionKeys(staleTombstoneApi, "0", { profileId: "grokMirror" }),
    [partitionKey],
    "an authoritative frame sync must discard stale tombstones outside the verified partition"
  );
  const rotatedAfterCleanup = mirrorSourceCookie("STALE_AFTER_ROTATION");
  staleTombstoneApi.sourceByName.set("user-gateway-token", rotatedAfterCleanup);
  staleTombstoneRuntime.runtime.handleCookieChange({
    removed: false,
    cause: "overwrite",
    cookie: rotatedAfterCleanup
  });
  await new Promise((resolve) => { setTimeout(resolve, 280); });
  assert.equal(
    staleTombstoneApi.targets.has(partitionId({
      name: "user-gateway-token",
      storeId: "0",
      partitionKey: staleTombstoneKey
    })),
    false,
    "source rotation must not recreate an obsolete tombstoned partition"
  );
  assert.equal(
    staleTombstoneApi.targets.get(partitionId({
      name: "user-gateway-token",
      storeId: "0",
      partitionKey
    }))?.value,
    "STALE_AFTER_ROTATION"
  );

  const fallbackIsolationApi = fakeExtensionApi([
    sourceCookie("sso", "FALLBACK_OFFICIAL"),
    mirrorSourceCookie("FALLBACK_MIRROR")
  ]);
  fallbackIsolationApi.targets.set(partitionId({ name: "sso", storeId: "0", partitionKey }), {
    ...sourceCookie("sso", "FALLBACK_OFFICIAL", { storeId: "0" }),
    sameSite: "no_restriction",
    partitionKey
  });
  fallbackIsolationApi.targets.set(
    partitionId({ name: "user-gateway-token", storeId: "0", partitionKey }),
    {
      ...mirrorSourceCookie("FALLBACK_MIRROR", { secure: true, storeId: "0" }),
      sameSite: "no_restriction",
      partitionKey
    }
  );
  let releaseDnrUpdate;
  const dnrGate = new Promise((resolve) => { releaseDnrUpdate = resolve; });
  const fallbackIsolationRuntime = createRuntimeHandlers(fallbackIsolationApi, () => dnrGate);
  const fallbackPreflightId = "official-fallback-123456";
  const pendingOfficialPreflight = fallbackIsolationRuntime.handlers.get(REQUEST.PREPARE_FRAME_LOAD)({
    url: "https://grok.com/",
    preflightId: fallbackPreflightId
  }, extensionSender);
  assert.deepEqual(
    fallbackIsolationRuntime.handlers.get(REQUEST.MARK_GROK_FRAME_PREFLIGHT_FALLBACK)({
      url: "https://grok.com/",
      preflightId: fallbackPreflightId
    }, extensionSender),
    { marked: true }
  );
  releaseDnrUpdate();
  await pendingOfficialPreflight;

  const syncUnchangedFrame = async (url, frameId, documentId) => {
    fallbackIsolationApi.frameDetails = {
      tabId: 7,
      frameId,
      parentFrameId: 0,
      url,
      documentId
    };
    fallbackIsolationApi.framesByTab.set(7, [{
      tabId: 7,
      frameId: 0,
      parentFrameId: -1,
      url: `${EXTENSION_SITE}/index.html`,
      documentId: "fallback-extension-document"
    }, fallbackIsolationApi.frameDetails]);
    return fallbackIsolationRuntime.handlers.get(REQUEST.SYNC_GROK_SESSION_COOKIES)({
      bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION
    }, {
      id: fallbackIsolationApi.runtime.id,
      tab: { id: 7, url: `${EXTENSION_SITE}/index.html` },
      frameId,
      documentId,
      url
    });
  };
  const mirrorMustNotConsumeOfficialFallback = await syncUnchangedFrame(
    "https://gk.dairoot.cn/",
    5,
    "fallback-mirror-document"
  );
  assert.equal(mirrorMustNotConsumeOfficialFallback.changed, false);
  assert.equal(
    mirrorMustNotConsumeOfficialFallback.reloadRequired,
    false,
    "a Grok fallback must not be consumed by a Mirror frame in the same ChatClub tab"
  );
  const officialConsumesItsFallback = await syncUnchangedFrame(
    "https://grok.com/",
    6,
    "fallback-official-document"
  );
  assert.equal(officialConsumesItsFallback.changed, false);
  assert.equal(officialConsumesItsFallback.reloadRequired, true);

  const mirrorRotationApi = fakeExtensionApi([mirrorSourceCookie("MIRROR_BEFORE_ROTATION")]);
  const mirrorRotationRuntime = createRuntimeHandlers(mirrorRotationApi);
  await mirrorRotationRuntime.handlers.get(REQUEST.PREPARE_FRAME_LOAD)({
    url: "https://gk.dairoot.cn/",
    preflightId: "mirror-rotation-123456"
  }, extensionSender);
  const managedMirrorBeforeRotation = mirrorRotationApi.targets.get(partitionId({
    name: "user-gateway-token",
    storeId: "0",
    partitionKey
  }));
  mirrorRotationApi.targets.delete(partitionId({
    name: "user-gateway-token",
    storeId: "0",
    partitionKey
  }));
  mirrorRotationRuntime.runtime.handleCookieChange({
    removed: true,
    cause: "explicit",
    cookie: managedMirrorBeforeRotation
  });
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  const rotatedMirrorSource = mirrorSourceCookie("MIRROR_AFTER_ROTATION");
  mirrorRotationApi.sourceByName.set("user-gateway-token", rotatedMirrorSource);
  mirrorRotationRuntime.runtime.handleCookieChange({
    removed: false,
    cause: "overwrite",
    cookie: rotatedMirrorSource
  });
  await new Promise((resolve) => { setTimeout(resolve, 280); });
  assert.equal(
    mirrorRotationApi.targets.get(partitionId({
      name: "user-gateway-token",
      storeId: "0",
      partitionKey
    }))?.value,
    "MIRROR_AFTER_ROTATION",
    "a real Mirror source rotation must clear its tombstone and recreate only its managed partition"
  );

  const accountSwitchUrl = "https://gk.dairoot.cn/c/account-switch-topic";
  const accountSwitchDocumentId = "mirror-account-switch-document";
  const staleMirrorDocumentId = "mirror-stale-account-document";
  const wrongProfileDocumentId = "official-account-document";
  const wrongTopLevelDocumentId = "mirror-wrong-top-level-document";
  const accountSwitchApi = fakeExtensionApi([mirrorSourceCookie("ACCOUNT_BEFORE_SWITCH")]);
  accountSwitchApi.framesByTab.set(7, [
    {
      tabId: 7,
      frameId: 0,
      parentFrameId: -1,
      url: `${EXTENSION_SITE}/index.html`,
      documentId: "extension-account-document"
    },
    {
      tabId: 7,
      frameId: 21,
      parentFrameId: 0,
      url: accountSwitchUrl,
      documentId: accountSwitchDocumentId
    },
    {
      tabId: 7,
      frameId: 22,
      parentFrameId: 0,
      url: "https://grok.com/c/wrong-profile",
      documentId: wrongProfileDocumentId
    },
    {
      tabId: 7,
      frameId: 23,
      parentFrameId: 0,
      url: "https://gk.dairoot.cn/c/stale-account-switch-topic",
      documentId: staleMirrorDocumentId
    }
  ]);
  accountSwitchApi.framesByTab.set(8, [
    {
      tabId: 8,
      frameId: 0,
      parentFrameId: -1,
      url: "https://example.com/",
      documentId: "wrong-top-level-document"
    },
    {
      tabId: 8,
      frameId: 24,
      parentFrameId: 0,
      url: "https://gk.dairoot.cn/c/wrong-top-level-topic",
      documentId: wrongTopLevelDocumentId
    }
  ]);
  accountSwitchApi.staleExecutionDocuments.add(staleMirrorDocumentId);
  accountSwitchApi.frameDetails = accountSwitchApi.framesByTab.get(7)[1];
  const accountSwitchRuntime = createRuntimeHandlers(accountSwitchApi);
  const accountSwitchSender = {
    id: accountSwitchApi.runtime.id,
    tab: { id: 7, url: `${EXTENSION_SITE}/index.html` },
    frameId: 21,
    documentId: accountSwitchDocumentId,
    url: accountSwitchUrl
  };
  const accountSwitchInitialSync = await accountSwitchRuntime.handlers.get(
    REQUEST.SYNC_GROK_SESSION_COOKIES
  )({
    bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION
  }, accountSwitchSender);
  assert.equal(accountSwitchInitialSync.created, 1);
  const accountSourceBeforeSwitch = accountSwitchApi.sourceByName.get("user-gateway-token");
  accountSwitchApi.sourceByName.delete("user-gateway-token");
  accountSwitchRuntime.runtime.handleCookieChange({
    removed: true,
    cause: "explicit",
    cookie: accountSourceBeforeSwitch
  });
  await new Promise((resolve) => { setTimeout(resolve, 300); });
  assert.equal(
    accountSwitchApi.targets.has(partitionId({
      name: "user-gateway-token",
      storeId: "0",
      partitionKey
    })),
    false,
    "a disappeared Mirror source must remove its managed partition before the next account signs in"
  );
  assert.deepEqual(
    await bridge.managedGrokPartitionKeys(accountSwitchApi, "0", { profileId: "grokMirror" }),
    [],
    "the delayed account-switch fixture must pass through a real target and ledger gap"
  );

  accountSwitchApi.getPartitionKeyCalls.length = 0;
  accountSwitchApi.executeScriptAttempts.length = 0;
  accountSwitchApi.executeScriptCalls.length = 0;
  const accountSourceAfterSwitch = mirrorSourceCookie("ACCOUNT_AFTER_SWITCH");
  accountSwitchApi.sourceByName.set("user-gateway-token", accountSourceAfterSwitch);
  accountSwitchRuntime.runtime.handleCookieChange({
    removed: false,
    cause: "explicit",
    cookie: accountSourceAfterSwitch
  });
  await new Promise((resolve) => { setTimeout(resolve, 300); });
  assert.equal(
    accountSwitchApi.targets.get(partitionId({
      name: "user-gateway-token",
      storeId: "0",
      partitionKey
    }))?.value,
    "ACCOUNT_AFTER_SWITCH",
    "a delayed account sign-in must rediscover the exact active Mirror frame partition and rebuild it"
  );
  assert.equal(
    accountSwitchApi.getPartitionKeyCalls.some((call) =>
      call.tabId === 7
      && call.frameId === 21
      && call.documentId === accountSwitchDocumentId
    ),
    true,
    "source recovery must obtain the partition from the exact current Mirror frame and document"
  );
  assert.equal(
    accountSwitchApi.getPartitionKeyCalls.some((call) => call.documentId === wrongProfileDocumentId),
    false,
    "a Mirror source change must not inspect the official Grok frame partition"
  );
  assert.equal(
    accountSwitchApi.getPartitionKeyCalls.some((call) => call.documentId === wrongTopLevelDocumentId),
    false,
    "a Grok child under a non-extension top-level document must not become a repair candidate"
  );
  assert.deepEqual(
    accountSwitchApi.executeScriptCalls,
    [{ target: { tabId: 7, documentIds: [accountSwitchDocumentId] } }],
    "only the exact current Mirror document may be refreshed after its partition changes"
  );
  assert.equal(
    accountSwitchApi.executeScriptAttempts.some((call) =>
      call.target.documentIds?.includes(wrongProfileDocumentId)
      || call.target.documentIds?.includes(wrongTopLevelDocumentId)
    ),
    false,
    "wrong-profile and wrong-top-level documents must never receive a refresh attempt"
  );
  assert.equal(
    accountSwitchApi.executeScriptCalls.some((call) =>
      call.target.documentIds?.includes(staleMirrorDocumentId)
    ),
    false,
    "a stale Mirror document must fail closed instead of being refreshed by frame id"
  );
  assert.equal(
    accountSwitchApi.executeScriptAttempts.every((call) =>
      Array.isArray(call.target.documentIds)
      && call.target.documentIds.length === 1
      && !Array.isArray(call.target.frameIds)
    ),
    true,
    "account refreshes must remain bound to exact Chromium document ids"
  );

  const accountSwitchSetCount = accountSwitchApi.setCalls.length;
  accountSwitchApi.executeScriptAttempts.length = 0;
  accountSwitchApi.executeScriptCalls.length = 0;
  accountSwitchRuntime.runtime.handleCookieChange({
    removed: false,
    cause: "explicit",
    cookie: accountSourceAfterSwitch
  });
  await new Promise((resolve) => { setTimeout(resolve, 300); });
  assert.equal(accountSwitchApi.setCalls.length, accountSwitchSetCount);
  assert.deepEqual(
    accountSwitchApi.executeScriptAttempts,
    [],
    "an unchanged source must not refresh an already current iframe"
  );

  const unmanagedAccountApi = fakeExtensionApi([mirrorSourceCookie("UNMANAGED_SOURCE_ACCOUNT")]);
  unmanagedAccountApi.framesByTab.set(7, [
    {
      tabId: 7,
      frameId: 0,
      parentFrameId: -1,
      url: `${EXTENSION_SITE}/index.html`,
      documentId: "unmanaged-extension-document"
    },
    {
      tabId: 7,
      frameId: 31,
      parentFrameId: 0,
      url: "https://gk.dairoot.cn/c/unmanaged-account",
      documentId: "unmanaged-mirror-document"
    }
  ]);
  const unmanagedAccountTarget = {
    ...mirrorSourceCookie("UNMANAGED_PARTITION_ACCOUNT", { secure: true, storeId: "0" }),
    sameSite: "no_restriction",
    partitionKey
  };
  unmanagedAccountApi.targets.set(partitionId({
    name: "user-gateway-token",
    storeId: "0",
    partitionKey
  }), unmanagedAccountTarget);
  const unmanagedAccountRuntime = createRuntimeHandlers(unmanagedAccountApi);
  const unmanagedAccountSource = unmanagedAccountApi.sourceByName.get("user-gateway-token");
  unmanagedAccountRuntime.runtime.handleCookieChange({
    removed: false,
    cause: "explicit",
    cookie: unmanagedAccountSource
  });
  await new Promise((resolve) => { setTimeout(resolve, 300); });
  assert.equal(
    unmanagedAccountApi.targets.get(partitionId({
      name: "user-gateway-token",
      storeId: "0",
      partitionKey
    }))?.value,
    "UNMANAGED_PARTITION_ACCOUNT",
    "source recovery must not overwrite an unowned partition that belongs to another account"
  );
  assert.equal(unmanagedAccountApi.setCalls.length, 0);
  assert.deepEqual(
    unmanagedAccountApi.executeScriptAttempts,
    [],
    "a skipped unowned target is not a changed session and must not refresh its iframe"
  );

  const tabbitMirrorUrl = "https://gk.dairoot.cn/c/tabbit-account";
  const tabbitDocumentId = "tabbit-mirror-document";
  const tabbitApi = fakeExtensionApi([mirrorSourceCookie("TABBIT_ACCOUNT_ONE")]);
  tabbitApi.partitionCookieDetailsMode = "unsupported";
  tabbitApi.partitionKeyResultMode = "empty";
  tabbitApi.framesByTab.set(7, [
    {
      tabId: 7,
      frameId: 41,
      parentFrameId: 0,
      url: tabbitMirrorUrl,
      documentId: tabbitDocumentId
    }
  ]);
  tabbitApi.frameDetails = tabbitApi.framesByTab.get(7)[0];
  const tabbitRuntime = createRuntimeHandlers(tabbitApi);
  const tabbitPreflight = await tabbitRuntime.handlers.get(REQUEST.PREPARE_FRAME_LOAD)({
    url: tabbitMirrorUrl,
    preflightId: "tabbit-preflight-123456"
  }, extensionSender);
  assert.equal(tabbitPreflight.grokCookieBridge.supported, false);
  assert.equal(tabbitApi.debuggerCalls.length, 0, "preflight must not attach without an exact live iframe document");
  assert.equal(tabbitApi.setCalls.length, 0, "schema-unsupported native Cookie APIs must never mutate the partition");

  const tabbitSender = {
    id: tabbitApi.runtime.id,
    tab: { id: 7, url: `${EXTENSION_SITE}/index.html` },
    frameId: 41,
    documentId: tabbitDocumentId,
    url: tabbitMirrorUrl
  };
  const tabbitInitialSync = await tabbitRuntime.handlers.get(REQUEST.SYNC_GROK_SESSION_COOKIES)({
    bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION
  }, tabbitSender);
  assert.deepEqual(
    tabbitInitialSync,
    {
      supported: true,
      changed: true,
      created: 1,
      updated: 0,
      removed: 0,
      skipped: 0,
      reloadRequired: true
    },
    "Tabbit must repair the exact Mirror iframe partition through the debugger backend"
  );
  assert.ok(
    tabbitApi.getPartitionKeyCalls.length >= 2,
    "Tabbit's empty getPartitionKey shell must be replaced only after repeated exact-frame validation"
  );
  assert.equal(tabbitApi.setCalls.length, 0);
  assert.equal(tabbitApi.debuggerSetCalls.length, 1);
  assert.deepEqual(tabbitApi.debuggerSetCalls[0], {
    name: "user-gateway-token",
    url: "https://gk.dairoot.cn/",
    domain: ".gk.dairoot.cn",
    path: "/",
    partitionKey
  });
  assert.equal(
    tabbitApi.targets.get(partitionId({
      name: "user-gateway-token",
      storeId: "0",
      partitionKey
    }))?.value,
    "TABBIT_ACCOUNT_ONE"
  );
  assert.equal(tabbitApi.debuggerCalls.at(0)?.method, "attach");
  assert.equal(tabbitApi.debuggerCalls.at(-1)?.method, "detach");

  const staleTabbitPartitionKey = { ...partitionKey, hasCrossSiteAncestor: false };
  const staleTabbitId = partitionId({
    name: "user-gateway-token",
    storeId: "0",
    partitionKey: staleTabbitPartitionKey
  });
  tabbitApi.targets.set(staleTabbitId, {
    ...mirrorSourceCookie("TABBIT_STALE_ACCOUNT", { secure: true, storeId: "0" }),
    sameSite: "no_restriction",
    partitionKey: staleTabbitPartitionKey
  });
  tabbitApi.stored[bridge.GROK_COOKIE_LEDGER_KEY].entries[staleTabbitId] = {
    name: "user-gateway-token",
    storeId: "0",
    url: "https://gk.dairoot.cn/",
    partitionKey: staleTabbitPartitionKey
  };
  tabbitApi.debuggerDeleteCalls.length = 0;
  tabbitApi.removeCalls.length = 0;
  const tabbitAuthoritativeCleanup = await tabbitRuntime.handlers.get(
    REQUEST.SYNC_GROK_SESSION_COOKIES
  )({ bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION }, tabbitSender);
  assert.deepEqual(tabbitAuthoritativeCleanup, {
    supported: true,
    changed: true,
    created: 0,
    updated: 0,
    removed: 1,
    skipped: 0,
    reloadRequired: true
  });
  assert.equal(tabbitApi.targets.has(staleTabbitId), false);
  assert.equal(tabbitApi.stored[bridge.GROK_COOKIE_LEDGER_KEY].entries[staleTabbitId], undefined);
  assert.equal(tabbitApi.removeCalls.length, 0, "unsupported native partition mutations must not perform cleanup");
  assert.deepEqual(tabbitApi.debuggerDeleteCalls, [{
    name: "user-gateway-token",
    domain: ".gk.dairoot.cn",
    path: "/",
    partitionKey: staleTabbitPartitionKey
  }], "CDP cleanup must delete only the ledger-owned stale partition");

  const resetTabbitApi = fakeExtensionApi([mirrorSourceCookie("TABBIT_RESET_ACCOUNT")]);
  await bridge.syncGrokSessionCookies(resetTabbitApi, {
    storeId: "0",
    partitionKey,
    profileId: "grokMirror"
  });
  const resetTargetId = partitionId({
    name: "user-gateway-token",
    storeId: "0",
    partitionKey
  });
  resetTabbitApi.partitionCookieDetailsMode = "unsupported";
  resetTabbitApi.framesByTab.set(7, [{
    tabId: 7,
    frameId: 0,
    parentFrameId: -1,
    url: `${EXTENSION_SITE}/index.html`,
    documentId: "tabbit-reset-extension-document"
  }]);
  const resetTabbitRuntime = createRuntimeHandlers(resetTabbitApi, undefined, {
    withTabDebugger: fakeWithTabDebugger(resetTabbitApi)
  });
  assert.deepEqual(await resetTabbitRuntime.runtime.removeAllManagedPartitions(7), {
    changed: true,
    removed: 1
  });
  assert.equal(resetTabbitApi.targets.has(resetTargetId), false);
  assert.equal(resetTabbitApi.stored[bridge.GROK_COOKIE_LEDGER_KEY], undefined);
  assert.equal(resetTabbitApi.removeCalls.length, 0);
  assert.equal(resetTabbitApi.debuggerDeleteCalls.length, 1);

  const resetWithoutAnchorApi = fakeExtensionApi([mirrorSourceCookie("TABBIT_RESET_DEFERRED")]);
  await bridge.syncGrokSessionCookies(resetWithoutAnchorApi, {
    storeId: "0",
    partitionKey,
    profileId: "grokMirror"
  });
  resetWithoutAnchorApi.partitionCookieDetailsMode = "unsupported";
  resetWithoutAnchorApi.tabUrls.set(7, "https://example.com/");
  const resetWithoutAnchorRuntime = createRuntimeHandlers(resetWithoutAnchorApi, undefined, {
    withTabDebugger: fakeWithTabDebugger(resetWithoutAnchorApi)
  });
  await assert.rejects(
    () => resetWithoutAnchorRuntime.runtime.removeAllManagedPartitions(7),
    /partitionKey/,
    "reset cleanup must defer when no same-store extension top tab can anchor CDP"
  );
  assert.equal(resetWithoutAnchorApi.targets.has(resetTargetId), true);
  assert.ok(resetWithoutAnchorApi.stored[bridge.GROK_COOKIE_LEDGER_KEY]?.entries?.[resetTargetId]);

  const sourceGoneTabbitApi = fakeExtensionApi([mirrorSourceCookie("TABBIT_SOURCE_GONE")]);
  await bridge.syncGrokSessionCookies(sourceGoneTabbitApi, {
    storeId: "0",
    partitionKey,
    profileId: "grokMirror"
  });
  sourceGoneTabbitApi.partitionCookieDetailsMode = "unsupported";
  sourceGoneTabbitApi.framesByTab.set(7, [{
    tabId: 7,
    frameId: 0,
    parentFrameId: -1,
    url: `${EXTENSION_SITE}/index.html`,
    documentId: "tabbit-source-gone-extension-document"
  }]);
  const sourceGoneCookie = sourceGoneTabbitApi.sourceByName.get("user-gateway-token");
  sourceGoneTabbitApi.sourceByName.delete("user-gateway-token");
  const sourceGoneTabbitRuntime = createRuntimeHandlers(sourceGoneTabbitApi, undefined, {
    withTabDebugger: fakeWithTabDebugger(sourceGoneTabbitApi)
  });
  sourceGoneTabbitRuntime.runtime.handleCookieChange({
    removed: true,
    cause: "explicit",
    cookie: sourceGoneCookie
  });
  await new Promise((resolve) => { setTimeout(resolve, 320); });
  assert.equal(sourceGoneTabbitApi.targets.has(resetTargetId), false);
  assert.equal(
    sourceGoneTabbitApi.stored[bridge.GROK_COOKIE_LEDGER_KEY]?.entries?.[resetTargetId],
    undefined,
    "a disappeared source must clear its managed CDP mirror without a live Mirror iframe"
  );
  assert.equal(sourceGoneTabbitApi.debuggerDeleteCalls.length, 1);

  const rotatedWithoutFrameApi = fakeExtensionApi([mirrorSourceCookie("TABBIT_ROTATION_OLD")]);
  await bridge.syncGrokSessionCookies(rotatedWithoutFrameApi, {
    storeId: "0",
    partitionKey,
    profileId: "grokMirror"
  });
  rotatedWithoutFrameApi.partitionCookieDetailsMode = "unsupported";
  rotatedWithoutFrameApi.framesByTab.set(7, [{
    tabId: 7,
    frameId: 0,
    parentFrameId: -1,
    url: `${EXTENSION_SITE}/index.html`,
    documentId: "tabbit-rotation-extension-document"
  }]);
  const rotatedWithoutFrameRuntime = createRuntimeHandlers(rotatedWithoutFrameApi, undefined, {
    withTabDebugger: fakeWithTabDebugger(rotatedWithoutFrameApi)
  });
  const rotatedWithoutFrameCookie = mirrorSourceCookie("TABBIT_ROTATION_NEW");
  rotatedWithoutFrameApi.sourceByName.set("user-gateway-token", rotatedWithoutFrameCookie);
  rotatedWithoutFrameRuntime.runtime.handleCookieChange({
    removed: false,
    cause: "overwrite",
    cookie: rotatedWithoutFrameCookie
  });
  await new Promise((resolve) => { setTimeout(resolve, 320); });
  assert.equal(rotatedWithoutFrameApi.targets.get(resetTargetId)?.value, "TABBIT_ROTATION_NEW");
  assert.equal(rotatedWithoutFrameApi.debuggerSetCalls.length, 1);

  const sourceGoneDeferredApi = fakeExtensionApi([mirrorSourceCookie("TABBIT_SOURCE_GONE_DEFERRED")]);
  await bridge.syncGrokSessionCookies(sourceGoneDeferredApi, {
    storeId: "0",
    partitionKey,
    profileId: "grokMirror"
  });
  sourceGoneDeferredApi.partitionCookieDetailsMode = "unsupported";
  sourceGoneDeferredApi.tabUrls.set(7, "https://example.com/");
  const deferredSourceCookie = sourceGoneDeferredApi.sourceByName.get("user-gateway-token");
  sourceGoneDeferredApi.sourceByName.delete("user-gateway-token");
  const sourceGoneDeferredRuntime = createRuntimeHandlers(sourceGoneDeferredApi, undefined, {
    withTabDebugger: fakeWithTabDebugger(sourceGoneDeferredApi)
  });
  sourceGoneDeferredRuntime.runtime.handleCookieChange({
    removed: true,
    cause: "explicit",
    cookie: deferredSourceCookie
  });
  await new Promise((resolve) => { setTimeout(resolve, 320); });
  assert.equal(sourceGoneDeferredApi.targets.has(resetTargetId), true);
  assert.ok(sourceGoneDeferredApi.stored[bridge.GROK_COOKIE_LEDGER_KEY]?.entries?.[resetTargetId]);
  assert.equal(sourceGoneDeferredApi.debuggerDeleteCalls.length, 0);

  const tabbitWrongTopApi = fakeExtensionApi([mirrorSourceCookie("TABBIT_WRONG_TOP")]);
  tabbitWrongTopApi.partitionCookieDetailsMode = "unsupported";
  tabbitWrongTopApi.partitionKeyResultMode = "empty";
  tabbitWrongTopApi.framesByTab.set(7, [{ ...tabbitApi.frameDetails }]);
  tabbitWrongTopApi.frameDetails = tabbitWrongTopApi.framesByTab.get(7)[0];
  tabbitWrongTopApi.tabUrls.set(7, "https://example.com/");
  const tabbitWrongTopRuntime = createRuntimeHandlers(tabbitWrongTopApi);
  await assert.rejects(
    () => tabbitWrongTopRuntime.handlers.get(REQUEST.SYNC_GROK_SESSION_COOKIES)({
      bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION
    }, tabbitSender),
    /frame changed/,
    "missing top-frame metadata may fall back only to the exact current extension tab"
  );
  assert.equal(tabbitWrongTopApi.debuggerCalls.length, 0);
  assert.equal(tabbitWrongTopApi.setCalls.length, 0);

  tabbitApi.debuggerCalls.length = 0;
  tabbitApi.debuggerSetCalls.length = 0;
  tabbitApi.executeScriptAttempts.length = 0;
  tabbitApi.executeScriptCalls.length = 0;
  const tabbitSecondAccount = mirrorSourceCookie("TABBIT_ACCOUNT_TWO");
  tabbitApi.sourceByName.set("user-gateway-token", tabbitSecondAccount);
  tabbitRuntime.runtime.handleCookieChange({
    removed: false,
    cause: "explicit",
    cookie: tabbitSecondAccount
  });
  await new Promise((resolve) => { setTimeout(resolve, 300); });
  assert.equal(
    tabbitApi.targets.get(partitionId({
      name: "user-gateway-token",
      storeId: "0",
      partitionKey
    }))?.value,
    "TABBIT_ACCOUNT_TWO",
    "a Tabbit account switch must update the existing exact Mirror partition"
  );
  assert.equal(tabbitApi.debuggerSetCalls.length, 1);
  assert.deepEqual(
    tabbitApi.executeScriptCalls,
    [{ target: { tabId: 7, documentIds: [tabbitDocumentId] } }],
    "only the exact Tabbit Mirror document may reload after its account Cookie changes"
  );
  assert.equal(tabbitApi.debuggerCalls.at(0)?.method, "attach");
  assert.equal(tabbitApi.debuggerCalls.at(-1)?.method, "detach");
  for (const publicValue of [
    tabbitPreflight,
    tabbitInitialSync,
    tabbitApi.debuggerCalls,
    tabbitApi.debuggerSetCalls,
    tabbitApi.executeScriptCalls,
    tabbitApi.stored
  ]) {
    const serialized = JSON.stringify(publicValue);
    assert.equal(serialized.includes("TABBIT_ACCOUNT_ONE"), false);
    assert.equal(serialized.includes("TABBIT_ACCOUNT_TWO"), false);
  }

  const tabbitUnownedApi = fakeExtensionApi([mirrorSourceCookie("TABBIT_SOURCE_UNOWNED")]);
  tabbitUnownedApi.partitionCookieDetailsMode = "unsupported";
  tabbitUnownedApi.framesByTab.set(7, [
    {
      tabId: 7,
      frameId: 0,
      parentFrameId: -1,
      url: `${EXTENSION_SITE}/index.html`,
      documentId: "tabbit-unowned-extension-document"
    },
    {
      tabId: 7,
      frameId: 42,
      parentFrameId: 0,
      url: "https://gk.dairoot.cn/c/tabbit-unowned",
      documentId: "tabbit-unowned-document"
    }
  ]);
  tabbitUnownedApi.frameDetails = tabbitUnownedApi.framesByTab.get(7)[1];
  tabbitUnownedApi.targets.set(partitionId({
    name: "user-gateway-token",
    storeId: "0",
    partitionKey
  }), {
    ...mirrorSourceCookie("TABBIT_SITE_OWNED", { secure: true, storeId: "0" }),
    sameSite: "no_restriction",
    partitionKey
  });
  const tabbitUnownedRuntime = createRuntimeHandlers(tabbitUnownedApi);
  const tabbitUnownedResult = await tabbitUnownedRuntime.handlers.get(
    REQUEST.SYNC_GROK_SESSION_COOKIES
  )({
    bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION
  }, {
    id: tabbitUnownedApi.runtime.id,
    tab: { id: 7, url: `${EXTENSION_SITE}/index.html` },
    frameId: 42,
    documentId: "tabbit-unowned-document",
    url: "https://gk.dairoot.cn/c/tabbit-unowned"
  });
  assert.equal(tabbitUnownedResult.skipped, 1);
  assert.equal(tabbitUnownedResult.reloadRequired, false);
  assert.equal(tabbitUnownedApi.debuggerSetCalls.length, 0, "an unowned Tabbit partition must not be overwritten");
  assert.equal(
    tabbitUnownedApi.targets.get(partitionId({
      name: "user-gateway-token",
      storeId: "0",
      partitionKey
    }))?.value,
    "TABBIT_SITE_OWNED"
  );

  const tabbitStaleApi = fakeExtensionApi([mirrorSourceCookie("TABBIT_STALE_SOURCE")]);
  tabbitStaleApi.partitionCookieDetailsMode = "unsupported";
  tabbitStaleApi.framesByTab.set(7, [
    {
      tabId: 7,
      frameId: 0,
      parentFrameId: -1,
      url: `${EXTENSION_SITE}/index.html`,
      documentId: "tabbit-stale-extension-document"
    },
    {
      tabId: 7,
      frameId: 43,
      parentFrameId: 0,
      url: "https://gk.dairoot.cn/c/tabbit-stale",
      documentId: "tabbit-stale-document"
    }
  ]);
  tabbitStaleApi.frameDetails = tabbitStaleApi.framesByTab.get(7)[1];
  tabbitStaleApi.onDebuggerAttach = () => {
    tabbitStaleApi.partitionKeyByDocumentId.set("tabbit-stale-document", {
      topLevelSite: EXTENSION_SITE,
      hasCrossSiteAncestor: false
    });
  };
  const tabbitStaleRuntime = createRuntimeHandlers(tabbitStaleApi);
  await assert.rejects(
    () => tabbitStaleRuntime.handlers.get(REQUEST.SYNC_GROK_SESSION_COOKIES)({
      bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION
    }, {
      id: tabbitStaleApi.runtime.id,
      tab: { id: 7, url: `${EXTENSION_SITE}/index.html` },
      frameId: 43,
      documentId: "tabbit-stale-document",
      url: "https://gk.dairoot.cn/c/tabbit-stale"
    }),
    /target changed/
  );
  assert.equal(tabbitStaleApi.debuggerSetCalls.length, 0);
  assert.equal(tabbitStaleApi.debuggerCalls.at(-1)?.method, "detach");

  const spaSenderUrl = "https://gk.dairoot.cn/c/spa-account-switch";
  const spaDocumentId = "mirror-spa-account-document";
  const spaApi = fakeExtensionApi();
  spaApi.partitionCookieDetailsMode = "unsupported";
  spaApi.debuggerFrameTargetId = "mirror-spa-cdp-frame";
  spaApi.debuggerFrameSessionId = "mirror-spa-oopif-session";
  spaApi.debuggerFrameUrl = spaSenderUrl;
  const spaNavigationFrame = {
    tabId: 7,
    frameId: 45,
    parentFrameId: 0,
    url: "https://gk.dairoot.cn/",
    documentId: spaDocumentId
  };
  spaApi.framesByTab.set(7, [
    {
      tabId: 7,
      frameId: 0,
      parentFrameId: -1,
      url: `${EXTENSION_SITE}/index.html`,
      documentId: "mirror-spa-extension-document"
    },
    spaNavigationFrame
  ]);
  spaApi.frameDetails = spaNavigationFrame;
  spaApi.currentHrefByDocumentId.set(spaDocumentId, spaSenderUrl);
  const spaRuntime = createRuntimeHandlers(spaApi);
  const spaSender = {
    id: spaApi.runtime.id,
    tab: { id: 7, url: `${EXTENSION_SITE}/index.html` },
    frameId: spaNavigationFrame.frameId,
    documentId: spaDocumentId,
    url: spaSenderUrl
  };

  const mozExtensionBase = "moz-extension://01234567-89ab-cdef-0123-456789abcdef";
  const mozSwitchApi = fakeExtensionApi();
  mozSwitchApi.runtime.getURL = () => `${mozExtensionBase}/`;
  mozSwitchApi.framesByTab.set(7, [
    {
      tabId: 7,
      frameId: 0,
      parentFrameId: -1,
      url: `${mozExtensionBase}/index.html`,
      documentId: "moz-extension-account-document"
    },
    spaNavigationFrame
  ]);
  mozSwitchApi.frameDetails = spaNavigationFrame;
  mozSwitchApi.currentHrefByDocumentId.set(spaDocumentId, spaSenderUrl);
  const mozSwitchRuntime = createRuntimeHandlers(mozSwitchApi);
  assert.deepEqual(await mozSwitchRuntime.handlers.get(
    REQUEST.ARM_GROK_MIRROR_ACCOUNT_SWITCH
  )({ bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION }, {
    ...spaSender,
    tab: { id: 7, url: `${mozExtensionBase}/index.html` }
  }), {
    armed: false,
    proceed: true
  }, "moz-extension frames must preserve the site and Storage Access account-switch fallback");
  assert.equal(mozSwitchApi.getPartitionKeyCalls.length, 0);
  assert.equal(mozSwitchApi.debuggerCalls.length, 0);
  assert.equal(mozSwitchApi.setCalls.length, 0);

  assert.deepEqual(await spaRuntime.handlers.get(
    REQUEST.ARM_GROK_MIRROR_ACCOUNT_SWITCH
  )({ bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION }, spaSender), {
    armed: true,
    proceed: true
  }, "a same-document SPA route must bind through its exact document URL");
  assert.ok(
    spaApi.locationProbeCalls.length >= 2
    && spaApi.locationProbeCalls.every((call) => (
      call.target.tabId === 7
      && call.target.documentIds?.length === 1
      && call.target.documentIds[0] === spaDocumentId
    )),
    "SPA route verification must execute only in the sender's exact document"
  );
  spaRuntime.runtime.handleNavigationError({ tabId: 7, frameId: spaNavigationFrame.frameId });
  const spaCleanupDeadline = Date.now() + 2_000;
  while (spaApi.debuggerAttachedTabId != null && Date.now() < spaCleanupDeadline) {
    await new Promise((resolve) => { setTimeout(resolve, 20); });
  }

  const staleSpaApi = fakeExtensionApi();
  staleSpaApi.framesByTab.set(7, spaApi.framesByTab.get(7));
  staleSpaApi.frameDetails = spaNavigationFrame;
  staleSpaApi.currentHrefByDocumentId.set(spaDocumentId, "https://gk.dairoot.cn/c/different-spa-topic");
  const staleSpaRuntime = createRuntimeHandlers(staleSpaApi);
  await assert.rejects(
    () => staleSpaRuntime.handlers.get(REQUEST.ARM_GROK_MIRROR_ACCOUNT_SWITCH)(
      { bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION },
      spaSender
    ),
    /frame changed/,
    "a different current SPA URL in the same document must fail closed"
  );
  assert.equal(staleSpaApi.debuggerCalls.length, 0);

  for (const locationProbeMode of ["empty", "multiple", "error"]) {
    const invalidProbeApi = fakeExtensionApi();
    invalidProbeApi.framesByTab.set(7, spaApi.framesByTab.get(7));
    invalidProbeApi.frameDetails = spaNavigationFrame;
    invalidProbeApi.currentHrefByDocumentId.set(spaDocumentId, spaSenderUrl);
    invalidProbeApi.locationProbeMode = locationProbeMode;
    const invalidProbeRuntime = createRuntimeHandlers(invalidProbeApi);
    await assert.rejects(
      () => invalidProbeRuntime.handlers.get(REQUEST.ARM_GROK_MIRROR_ACCOUNT_SWITCH)(
        { bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION },
        spaSender
      ),
      /frame changed/,
      `an exact-document probe in ${locationProbeMode} mode must fail closed`
    );
    assert.equal(invalidProbeApi.debuggerCalls.length, 0);
  }

  for (const [label, invalidPartitionKey] of [
    ["wrong top-level site", {
      topLevelSite: "chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba",
      hasCrossSiteAncestor: true
    }],
    ["missing ancestor bit", { topLevelSite: EXTENSION_SITE }],
    ["wrong ancestor bit", { topLevelSite: EXTENSION_SITE, hasCrossSiteAncestor: false }]
  ]) {
    const invalidPartitionApi = fakeExtensionApi();
    invalidPartitionApi.framesByTab.set(7, spaApi.framesByTab.get(7));
    invalidPartitionApi.frameDetails = spaNavigationFrame;
    invalidPartitionApi.currentHrefByDocumentId.set(spaDocumentId, spaSenderUrl);
    invalidPartitionApi.partitionKeyByDocumentId.set(spaDocumentId, invalidPartitionKey);
    const invalidPartitionRuntime = createRuntimeHandlers(invalidPartitionApi);
    assert.deepEqual(await invalidPartitionRuntime.handlers.get(
      REQUEST.ARM_GROK_MIRROR_ACCOUNT_SWITCH
    )({ bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION }, spaSender), {
      armed: false,
      proceed: false
    }, `${label} must not arm a mutating debugger capture`);
    assert.deepEqual(await invalidPartitionRuntime.handlers.get(
      REQUEST.SYNC_GROK_SESSION_COOKIES
    )({ bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION }, spaSender), {
      supported: false,
      changed: false,
      created: 0,
      updated: 0,
      removed: 0,
      skipped: 0,
      reloadRequired: false
    }, `${label} must fail closed before Cookie synchronization`);
    assert.equal(invalidPartitionApi.debuggerCalls.length, 0);
    assert.equal(invalidPartitionApi.setCalls.length, 0);
    assert.equal(invalidPartitionApi.removeCalls.length, 0);
  }

  const conflictingTopApi = fakeExtensionApi();
  conflictingTopApi.framesByTab.set(7, [
    {
      tabId: 7,
      frameId: 0,
      parentFrameId: -1,
      url: "https://example.com/",
      documentId: "conflicting-top-document"
    },
    spaNavigationFrame
  ]);
  conflictingTopApi.frameDetails = spaNavigationFrame;
  conflictingTopApi.currentHrefByDocumentId.set(spaDocumentId, spaSenderUrl);
  const conflictingTopRuntime = createRuntimeHandlers(conflictingTopApi);
  assert.deepEqual(await conflictingTopRuntime.handlers.get(
    REQUEST.ARM_GROK_MIRROR_ACCOUNT_SWITCH
  )({ bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION }, spaSender), {
    armed: false,
    proceed: false
  }, "an explicitly conflicting top frame must never fall back to tabs.get");
  assert.equal(conflictingTopApi.debuggerCalls.length, 0);

  const queuedNativeApi = fakeExtensionApi([mirrorSourceCookie("QUEUED_NATIVE_ACCOUNT")]);
  queuedNativeApi.framesByTab.set(7, spaApi.framesByTab.get(7));
  queuedNativeApi.frameDetails = spaNavigationFrame;
  queuedNativeApi.currentHrefByDocumentId.set(spaDocumentId, spaSenderUrl);
  let releaseQueuedNativeProbe;
  let notifyQueuedNativeProbe;
  const queuedNativeGate = new Promise((resolve) => { releaseQueuedNativeProbe = resolve; });
  const queuedNativeStarted = new Promise((resolve) => { notifyQueuedNativeProbe = resolve; });
  let queuedNativeBlocked = false;
  queuedNativeApi.onCookieGet = async (details) => {
    if (queuedNativeBlocked || details.name !== "__chatclub_partition_cookie_probe__") return;
    queuedNativeBlocked = true;
    notifyQueuedNativeProbe();
    await queuedNativeGate;
  };
  const queuedNativeRuntime = createRuntimeHandlers(queuedNativeApi);
  const queuedNativeSync = queuedNativeRuntime.handlers.get(REQUEST.SYNC_GROK_SESSION_COOKIES)(
    { bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION },
    spaSender
  );
  await queuedNativeStarted;
  queuedNativeApi.currentHrefByDocumentId.set(spaDocumentId, "https://gk.dairoot.cn/c/changed-in-queue");
  releaseQueuedNativeProbe();
  await assert.rejects(queuedNativeSync, /frame changed/);
  assert.equal(queuedNativeApi.setCalls.length, 0, "a queued stale frame must not set a native Cookie");
  assert.equal(queuedNativeApi.removeCalls.length, 0, "a queued stale frame must not remove a native Cookie");

  const firstPartySwitchApi = fakeExtensionApi();
  firstPartySwitchApi.partitionKeyResultMode = "wrapped";
  firstPartySwitchApi.partitionKeyDefault = {
    topLevelSite: "https://dairoot.cn",
    hasCrossSiteAncestor: false
  };
  const firstPartySwitchFrame = {
    tabId: 7,
    frameId: 42,
    parentFrameId: 0,
    url: "https://gk.dairoot.cn/",
    documentId: "tabbit-first-party-before-document"
  };
  const firstPartyTopFrame = {
    tabId: 7,
    frameId: 0,
    parentFrameId: -1,
    url: `${EXTENSION_SITE}/index.html`,
    documentId: "tabbit-first-party-extension-document"
  };
  firstPartySwitchApi.framesByTab.set(7, [firstPartyTopFrame, firstPartySwitchFrame]);
  firstPartySwitchApi.frameDetails = firstPartySwitchFrame;
  firstPartySwitchApi.currentHrefByDocumentId.set(
    firstPartySwitchFrame.documentId,
    firstPartySwitchFrame.url
  );
  const firstPartySwitchRuntime = createRuntimeHandlers(firstPartySwitchApi);
  const firstPartySwitchSender = {
    id: firstPartySwitchApi.runtime.id,
    tab: { id: 7, url: `${EXTENSION_SITE}/index.html` },
    frameId: firstPartySwitchFrame.frameId,
    documentId: firstPartySwitchFrame.documentId,
    url: firstPartySwitchFrame.url
  };
  assert.deepEqual(await firstPartySwitchRuntime.handlers.get(
    REQUEST.ARM_GROK_MIRROR_ACCOUNT_SWITCH
  )({ bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION }, firstPartySwitchSender), {
    armed: true,
    proceed: true
  });
  assert.equal(
    firstPartySwitchRuntime.runtime.handleBeforeNavigate({
      tabId: 7,
      frameId: 42,
      parentFrameId: 0,
      url: "https://gk.dairoot.cn/api/random-login"
    }),
    true
  );
  firstPartySwitchRuntime.runtime.handleNavigationError({
    tabId: 7,
    frameId: 42,
    parentFrameId: 0,
    url: firstPartySwitchFrame.url,
    error: "net::ERR_ABORTED"
  });
  const firstPartyRecovery = {
    ...firstPartySwitchFrame,
    url: "https://gk.dairoot.cn/admin?a=2",
    documentId: "tabbit-first-party-recovery-document"
  };
  const firstPartySettled = {
    ...firstPartySwitchFrame,
    documentId: "tabbit-first-party-settled-document"
  };
  firstPartySwitchApi.currentHrefByDocumentId.set(
    firstPartyRecovery.documentId,
    firstPartyRecovery.url
  );
  firstPartySwitchApi.framesByTab.set(7, [firstPartyTopFrame, firstPartyRecovery]);
  firstPartySwitchApi.frameDetails = firstPartyRecovery;
  firstPartySwitchApi.onExecuteScript = async (details) => {
    assert.equal(details.func.name, "recoverMirrorRandomLoginLanding");
    firstPartySwitchApi.currentHrefByDocumentId.set(
      firstPartySettled.documentId,
      firstPartySettled.url
    );
    firstPartySwitchApi.framesByTab.set(7, [firstPartyTopFrame, firstPartySettled]);
    firstPartySwitchApi.frameDetails = firstPartySettled;
    return [{ result: true }];
  };
  assert.equal(firstPartySwitchRuntime.runtime.handleCommittedNavigation({
    ...firstPartyRecovery
  }), true);
  const firstPartyRecoveryDeadline = Date.now() + 2_000;
  while (!firstPartySwitchApi.executeScriptCalls.length && Date.now() < firstPartyRecoveryDeadline) {
    await new Promise((resolve) => { setTimeout(resolve, 20); });
  }
  while (!firstPartySwitchApi.webSocketProbeCalls.length && Date.now() < firstPartyRecoveryDeadline) {
    await new Promise((resolve) => { setTimeout(resolve, 20); });
  }
  assert.deepEqual(firstPartySwitchApi.executeScriptCalls, [{
    target: { tabId: 7, documentIds: [firstPartyRecovery.documentId] }
  }]);
  assert.equal(firstPartySwitchApi.debuggerCalls.length, 0);
  assert.equal(firstPartySwitchApi.setCalls.length, 0);
  assert.equal(firstPartySwitchApi.debuggerSetCalls.length, 0);
  assert.deepEqual(firstPartySwitchApi.webSocketProbeCalls.map(({ target, world }) => ({
    target,
    world
  })), [{
    target: { tabId: 7, documentIds: [firstPartySettled.documentId] },
    world: "ISOLATED"
  }]);

  const readinessSwitchApi = fakeExtensionApi();
  readinessSwitchApi.partitionKeyResultMode = "wrapped";
  readinessSwitchApi.partitionKeyDefault = {
    topLevelSite: "https://dairoot.cn",
    hasCrossSiteAncestor: false
  };
  const readinessOriginal = {
    ...firstPartySwitchFrame,
    frameId: 420,
    documentId: "readiness-before-document"
  };
  const readinessTop = {
    ...firstPartyTopFrame,
    documentId: "readiness-extension-document"
  };
  const readinessLandingOne = {
    ...readinessOriginal,
    documentId: "readiness-first-landing-document"
  };
  const readinessLandingTwo = {
    ...readinessOriginal,
    documentId: "readiness-second-landing-document"
  };
  readinessSwitchApi.framesByTab.set(7, [readinessTop, readinessOriginal]);
  readinessSwitchApi.frameDetails = readinessOriginal;
  readinessSwitchApi.currentHrefByDocumentId.set(readinessOriginal.documentId, readinessOriginal.url);
  const readinessSwitchRuntime = createRuntimeHandlers(readinessSwitchApi);
  assert.deepEqual(await readinessSwitchRuntime.handlers.get(
    REQUEST.ARM_GROK_MIRROR_ACCOUNT_SWITCH
  )({ bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION }, {
    id: readinessSwitchApi.runtime.id,
    tab: { id: 7, url: readinessTop.url },
    frameId: readinessOriginal.frameId,
    documentId: readinessOriginal.documentId,
    url: readinessOriginal.url
  }), {
    armed: true,
    proceed: true
  });
  assert.equal(readinessSwitchRuntime.runtime.handleBeforeNavigate({
    tabId: 7,
    frameId: readinessOriginal.frameId,
    parentFrameId: 0,
    url: "https://gk.dairoot.cn/api/random-login"
  }), true);
  readinessSwitchApi.currentHrefByDocumentId.set(readinessLandingOne.documentId, readinessLandingOne.url);
  readinessSwitchApi.framesByTab.set(7, [readinessTop, readinessLandingOne]);
  readinessSwitchApi.frameDetails = readinessLandingOne;
  let readinessProbeCount = 0;
  readinessSwitchApi.onWebSocketProbe = async (_details, { frame }) => [{
    frameId: frame.frameId,
    documentId: frame.documentId,
    result: ++readinessProbeCount === 1 ? "error" : "open"
  }];
  readinessSwitchApi.onExecuteScript = async (details) => {
    assert.equal(details.func.name, "reloadMirrorRandomLoginLanding");
    readinessSwitchApi.currentHrefByDocumentId.set(readinessLandingTwo.documentId, readinessLandingTwo.url);
    readinessSwitchApi.framesByTab.set(7, [readinessTop, readinessLandingTwo]);
    readinessSwitchApi.frameDetails = readinessLandingTwo;
    return [{ result: true }];
  };
  assert.equal(readinessSwitchRuntime.runtime.handleCommittedNavigation({
    ...readinessLandingOne
  }), false);
  const readinessDeadline = Date.now() + 2_000;
  while (readinessSwitchApi.webSocketProbeCalls.length < 2 && Date.now() < readinessDeadline) {
    await new Promise((resolve) => { setTimeout(resolve, 20); });
  }
  assert.deepEqual(
    readinessSwitchApi.webSocketProbeCalls.map(({ target }) => target.documentIds?.[0]),
    [readinessLandingOne.documentId, readinessLandingTwo.documentId],
    "a failed handshake must rotate once and probe only the new exact landing document"
  );
  assert.deepEqual(readinessSwitchApi.executeScriptCalls, [{
    target: { tabId: 7, documentIds: [readinessLandingOne.documentId] }
  }]);

  const readinessRaceApi = fakeExtensionApi();
  readinessRaceApi.partitionKeyResultMode = "wrapped";
  readinessRaceApi.partitionKeyDefault = readinessSwitchApi.partitionKeyDefault;
  const readinessRaceOriginal = {
    ...readinessOriginal,
    documentId: "readiness-race-before-document"
  };
  const readinessRaceLanding = {
    ...readinessOriginal,
    documentId: "readiness-race-landing-document"
  };
  const readinessRaceReplacement = {
    ...readinessOriginal,
    documentId: "readiness-race-replacement-document"
  };
  readinessRaceApi.framesByTab.set(7, [readinessTop, readinessRaceOriginal]);
  readinessRaceApi.frameDetails = readinessRaceOriginal;
  readinessRaceApi.currentHrefByDocumentId.set(readinessRaceOriginal.documentId, readinessRaceOriginal.url);
  const readinessRaceRuntime = createRuntimeHandlers(readinessRaceApi);
  assert.deepEqual(await readinessRaceRuntime.handlers.get(
    REQUEST.ARM_GROK_MIRROR_ACCOUNT_SWITCH
  )({ bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION }, {
    id: readinessRaceApi.runtime.id,
    tab: { id: 7, url: readinessTop.url },
    frameId: readinessRaceOriginal.frameId,
    documentId: readinessRaceOriginal.documentId,
    url: readinessRaceOriginal.url
  }), {
    armed: true,
    proceed: true
  });
  assert.equal(readinessRaceRuntime.runtime.handleBeforeNavigate({
    tabId: 7,
    frameId: readinessRaceOriginal.frameId,
    parentFrameId: 0,
    url: "https://gk.dairoot.cn/api/random-login"
  }), true);
  readinessRaceApi.currentHrefByDocumentId.set(readinessRaceLanding.documentId, readinessRaceLanding.url);
  readinessRaceApi.framesByTab.set(7, [readinessTop, readinessRaceLanding]);
  readinessRaceApi.frameDetails = readinessRaceLanding;
  readinessRaceApi.onWebSocketProbe = async (_details, { frame }) => {
    readinessRaceApi.currentHrefByDocumentId.set(
      readinessRaceReplacement.documentId,
      readinessRaceReplacement.url
    );
    readinessRaceApi.framesByTab.set(7, [readinessTop, readinessRaceReplacement]);
    readinessRaceApi.frameDetails = readinessRaceReplacement;
    return [{
      frameId: frame.frameId,
      documentId: frame.documentId,
      result: "open"
    }];
  };
  readinessRaceRuntime.runtime.handleCommittedNavigation({ ...readinessRaceLanding });
  const readinessRaceDeadline = Date.now() + 2_000;
  while (!readinessRaceApi.webSocketProbeCalls.length && Date.now() < readinessRaceDeadline) {
    await new Promise((resolve) => { setTimeout(resolve, 20); });
  }
  await new Promise((resolve) => { setTimeout(resolve, 80); });
  assert.equal(readinessRaceApi.webSocketProbeCalls.length, 1);
  assert.equal(
    readinessRaceApi.executeScriptCalls.length,
    0,
    "a document replacement during an apparent open result must fail without rotating the replacement"
  );

  // Arc can expose the direct child and its parentDocumentId while omitting
  // frameId 0 and rejecting scripting into the extension's own top document.
  // The secure child registration must remain the exact parent authority.
  const arcMissingTopApi = fakeExtensionApi();
  arcMissingTopApi.forbidExtensionPageScripting = true;
  arcMissingTopApi.omitGetFrameResultFrameId = true;
  arcMissingTopApi.partitionKeyResultMode = "wrapped";
  arcMissingTopApi.partitionKeyDefault = {
    topLevelSite: "https://dairoot.cn",
    hasCrossSiteAncestor: false
  };
  const arcMissingTopDocument = {
    tabId: 7,
    frameId: 0,
    parentFrameId: -1,
    url: `${EXTENSION_SITE}/index.html`,
    documentId: "arc-missing-frame-zero-extension-document"
  };
  const arcMissingTopFrame = {
    tabId: 7,
    frameId: 606,
    parentFrameId: 0,
    parentDocumentId: arcMissingTopDocument.documentId,
    url: "https://gk.dairoot.cn/",
    documentId: "arc-missing-frame-zero-mirror-document"
  };
  arcMissingTopApi.extensionTopDocuments.set(7, arcMissingTopDocument);
  arcMissingTopApi.framesByTab.set(7, [arcMissingTopFrame]);
  arcMissingTopApi.frameDetails = arcMissingTopFrame;
  arcMissingTopApi.currentHrefByDocumentId.set(
    arcMissingTopFrame.documentId,
    arcMissingTopFrame.url
  );
  const arcMissingTopRuntime = createRuntimeHandlers(arcMissingTopApi);
  const arcMissingTopSender = {
    id: arcMissingTopApi.runtime.id,
    tab: { id: 7, url: arcMissingTopDocument.url },
    frameId: arcMissingTopFrame.frameId,
    documentId: arcMissingTopFrame.documentId,
    url: arcMissingTopFrame.url
  };
  assert.equal(
    await arcMissingTopApi.webNavigation.getFrame({ tabId: 7, frameId: 0 }),
    null,
    "the Arc fixture must reproduce the missing frameId 0 metadata"
  );
  assert.deepEqual(await arcMissingTopRuntime.handlers.get(
    REQUEST.ARM_GROK_MIRROR_ACCOUNT_SWITCH
  )({ bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION }, arcMissingTopSender), {
    armed: true,
    proceed: true
  }, "a verified direct-child parentDocumentId must arm the first-party Arc switch");
  assert.equal(
    arcMissingTopApi.extensionPageScriptAttempts.length,
    0,
    "the Arc first-party path must never try to script the extension top document"
  );
  assert.equal(arcMissingTopApi.debuggerCalls.length, 0, "the first-party Arc path must not use debugger capture");
  assert.equal(arcMissingTopRuntime.runtime.handleBeforeNavigate({
    tabId: 7,
    frameId: arcMissingTopFrame.frameId,
    parentFrameId: 0,
    parentDocumentId: arcMissingTopDocument.documentId,
    url: "https://gk.dairoot.cn/api/random-login"
  }), true);
  const arcMissingTopRecovery = {
    ...arcMissingTopFrame,
    url: "https://gk.dairoot.cn/admin?a=2",
    documentId: "arc-missing-frame-zero-recovery-document"
  };
  const arcMissingTopSettled = {
    ...arcMissingTopFrame,
    documentId: "arc-missing-frame-zero-settled-document"
  };
  arcMissingTopApi.currentHrefByDocumentId.set(
    arcMissingTopRecovery.documentId,
    arcMissingTopRecovery.url
  );
  arcMissingTopApi.framesByTab.set(7, [arcMissingTopRecovery]);
  arcMissingTopApi.frameDetails = arcMissingTopRecovery;
  arcMissingTopApi.onExecuteScript = async (details) => {
    assert.equal(details.func.name, "recoverMirrorRandomLoginLanding");
    arcMissingTopApi.currentHrefByDocumentId.set(
      arcMissingTopSettled.documentId,
      arcMissingTopSettled.url
    );
    arcMissingTopApi.framesByTab.set(7, [arcMissingTopSettled]);
    arcMissingTopApi.frameDetails = arcMissingTopSettled;
    return [{ result: true }];
  };
  assert.equal(arcMissingTopRuntime.runtime.handleCommittedNavigation({
    ...arcMissingTopRecovery,
    parentDocumentId: arcMissingTopDocument.documentId
  }), true);
  const arcRecoveryDeadline = Date.now() + 2_000;
  while (!arcMissingTopApi.executeScriptCalls.length && Date.now() < arcRecoveryDeadline) {
    await new Promise((resolve) => { setTimeout(resolve, 20); });
  }
  assert.deepEqual(arcMissingTopApi.executeScriptCalls, [{
    target: { tabId: 7, documentIds: [arcMissingTopRecovery.documentId] }
  }], "the missing-top Arc transition must recover only its exact child document");
  assert.equal(arcMissingTopApi.extensionPageScriptAttempts.length, 0);
  assert.equal(arcMissingTopApi.debuggerCalls.length, 0);

  await new Promise((resolve) => { setTimeout(resolve, 100); });
  arcMissingTopApi.executeScriptCalls.length = 0;
  assert.deepEqual(await arcMissingTopRuntime.handlers.get(
    REQUEST.ARM_GROK_MIRROR_ACCOUNT_SWITCH
  )({ bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION }, {
    ...arcMissingTopSender,
    documentId: arcMissingTopSettled.documentId,
    url: arcMissingTopSettled.url
  }), {
    armed: true,
    proceed: true
  });
  assert.equal(arcMissingTopRuntime.runtime.handleBeforeNavigate({
    tabId: 7,
    frameId: arcMissingTopFrame.frameId,
    parentFrameId: 0,
    parentDocumentId: arcMissingTopDocument.documentId,
    url: "https://gk.dairoot.cn/api/random-login"
  }), true);
  const arcConflictingTransition = {
    ...arcMissingTopRecovery,
    parentDocumentId: "arc-replacement-extension-document",
    documentId: "arc-conflicting-transition-document"
  };
  arcMissingTopApi.currentHrefByDocumentId.set(
    arcConflictingTransition.documentId,
    arcConflictingTransition.url
  );
  arcMissingTopApi.framesByTab.set(7, [arcConflictingTransition]);
  arcMissingTopApi.frameDetails = arcConflictingTransition;
  assert.equal(arcMissingTopRuntime.runtime.handleCommittedNavigation({
    ...arcConflictingTransition,
    parentDocumentId: arcMissingTopDocument.documentId
  }), true);
  await new Promise((resolve) => { setTimeout(resolve, 100); });
  assert.equal(
    arcMissingTopApi.executeScriptCalls.length,
    0,
    "transition settlement must reject a current child bound to a different parentDocumentId"
  );
  arcMissingTopRuntime.runtime.handleNavigationError({
    tabId: 7,
    frameId: arcMissingTopFrame.frameId,
    parentFrameId: 0,
    url: "https://gk.dairoot.cn/unexpected",
    error: "net::ERR_FAILED"
  });

  const forgedArcParentApi = fakeExtensionApi();
  forgedArcParentApi.partitionKeyResultMode = "wrapped";
  forgedArcParentApi.partitionKeyDefault = arcMissingTopApi.partitionKeyDefault;
  const forgedArcFrame = {
    ...arcMissingTopFrame,
    parentDocumentId: arcMissingTopFrame.documentId
  };
  forgedArcParentApi.extensionTopDocuments.set(7, arcMissingTopDocument);
  forgedArcParentApi.framesByTab.set(7, [forgedArcFrame]);
  forgedArcParentApi.frameDetails = forgedArcFrame;
  forgedArcParentApi.currentHrefByDocumentId.set(forgedArcFrame.documentId, forgedArcFrame.url);
  const forgedArcRuntime = createRuntimeHandlers(forgedArcParentApi);
  assert.deepEqual(await forgedArcRuntime.handlers.get(
    REQUEST.ARM_GROK_MIRROR_ACCOUNT_SWITCH
  )({ bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION }, {
    ...arcMissingTopSender,
    id: forgedArcParentApi.runtime.id,
    documentId: forgedArcFrame.documentId
  }), {
    armed: false,
    proceed: false
  }, "a direct-child parentDocumentId that is not the extension frame 0 must fail closed");
  assert.equal(forgedArcParentApi.debuggerCalls.length, 0);

  const forgedArcFrameIdApi = fakeExtensionApi();
  forgedArcFrameIdApi.partitionKeyResultMode = "wrapped";
  forgedArcFrameIdApi.partitionKeyDefault = arcMissingTopApi.partitionKeyDefault;
  forgedArcFrameIdApi.getFrameResultFrameIdOverride = arcMissingTopFrame.frameId + 1;
  forgedArcFrameIdApi.extensionTopDocuments.set(7, arcMissingTopDocument);
  forgedArcFrameIdApi.framesByTab.set(7, [arcMissingTopFrame]);
  forgedArcFrameIdApi.frameDetails = arcMissingTopFrame;
  forgedArcFrameIdApi.currentHrefByDocumentId.set(
    arcMissingTopFrame.documentId,
    arcMissingTopFrame.url
  );
  const forgedArcFrameIdRuntime = createRuntimeHandlers(forgedArcFrameIdApi);
  assert.deepEqual(await forgedArcFrameIdRuntime.handlers.get(
    REQUEST.ARM_GROK_MIRROR_ACCOUNT_SWITCH
  )({ bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION }, {
    ...arcMissingTopSender,
    id: forgedArcFrameIdApi.runtime.id
  }), {
    armed: false,
    proceed: false
  }, "an exposed getFrame frameId mismatch must still fail closed");
  assert.equal(forgedArcFrameIdApi.debuggerCalls.length, 0);

  await new Promise((resolve) => { setTimeout(resolve, 80); });
  firstPartySwitchApi.executeScriptCalls.length = 0;
  const unrelatedErrorSender = {
    ...firstPartySwitchSender,
    documentId: firstPartySettled.documentId,
    url: firstPartySettled.url
  };
  assert.deepEqual(await firstPartySwitchRuntime.handlers.get(
    REQUEST.ARM_GROK_MIRROR_ACCOUNT_SWITCH
  )({ bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION }, unrelatedErrorSender), {
    armed: true,
    proceed: true
  });
  assert.equal(firstPartySwitchRuntime.runtime.handleBeforeNavigate({
    tabId: 7,
    frameId: 42,
    parentFrameId: 0,
    url: "https://gk.dairoot.cn/api/random-login"
  }), true);
  firstPartySwitchRuntime.runtime.handleNavigationError({
    tabId: 7,
    frameId: 42,
    parentFrameId: 0,
    url: "https://gk.dairoot.cn/unexpected",
    error: "net::ERR_ABORTED"
  });
  const unrelatedRecovery = {
    ...firstPartyRecovery,
    documentId: "tabbit-first-party-unrelated-error-document"
  };
  firstPartySwitchApi.currentHrefByDocumentId.set(unrelatedRecovery.documentId, unrelatedRecovery.url);
  firstPartySwitchApi.framesByTab.set(7, [firstPartyTopFrame, unrelatedRecovery]);
  firstPartySwitchApi.frameDetails = unrelatedRecovery;
  firstPartySwitchRuntime.runtime.handleCommittedNavigation({ ...unrelatedRecovery });
  await new Promise((resolve) => { setTimeout(resolve, 80); });
  assert.equal(firstPartySwitchApi.executeScriptCalls.length, 0);

  const firstPartyParentRaceApi = fakeExtensionApi();
  firstPartyParentRaceApi.partitionKeyResultMode = "wrapped";
  firstPartyParentRaceApi.partitionKeyDefault = {
    topLevelSite: "https://dairoot.cn",
    hasCrossSiteAncestor: false
  };
  const firstPartyParentRaceTop = {
    ...firstPartyTopFrame,
    documentId: "tabbit-parent-race-extension-before"
  };
  const firstPartyParentRaceFrame = {
    ...firstPartySwitchFrame,
    documentId: "tabbit-parent-race-frame-before"
  };
  firstPartyParentRaceApi.framesByTab.set(7, [
    firstPartyParentRaceTop,
    firstPartyParentRaceFrame
  ]);
  firstPartyParentRaceApi.frameDetails = firstPartyParentRaceFrame;
  firstPartyParentRaceApi.currentHrefByDocumentId.set(
    firstPartyParentRaceFrame.documentId,
    firstPartyParentRaceFrame.url
  );
  const firstPartyParentRaceRuntime = createRuntimeHandlers(firstPartyParentRaceApi);
  assert.deepEqual(await firstPartyParentRaceRuntime.handlers.get(
    REQUEST.ARM_GROK_MIRROR_ACCOUNT_SWITCH
  )({ bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION }, {
    id: firstPartyParentRaceApi.runtime.id,
    tab: { id: 7, url: `${EXTENSION_SITE}/index.html` },
    frameId: firstPartyParentRaceFrame.frameId,
    documentId: firstPartyParentRaceFrame.documentId,
    url: firstPartyParentRaceFrame.url
  }), {
    armed: true,
    proceed: true
  });
  assert.equal(firstPartyParentRaceRuntime.runtime.handleBeforeNavigate({
    tabId: 7,
    frameId: firstPartyParentRaceFrame.frameId,
    parentFrameId: 0,
    url: "https://gk.dairoot.cn/api/random-login"
  }), true);
  const firstPartyParentRaceTopAfter = {
    ...firstPartyParentRaceTop,
    documentId: "tabbit-parent-race-extension-after"
  };
  const firstPartyParentRaceRecovery = {
    ...firstPartyParentRaceFrame,
    url: "https://gk.dairoot.cn/admin?a=2",
    documentId: "tabbit-parent-race-recovery"
  };
  firstPartyParentRaceApi.currentHrefByDocumentId.set(
    firstPartyParentRaceRecovery.documentId,
    firstPartyParentRaceRecovery.url
  );
  firstPartyParentRaceApi.framesByTab.set(7, [
    firstPartyParentRaceTopAfter,
    firstPartyParentRaceRecovery
  ]);
  firstPartyParentRaceApi.frameDetails = firstPartyParentRaceRecovery;
  assert.equal(firstPartyParentRaceRuntime.runtime.handleCommittedNavigation({
    ...firstPartyParentRaceTopAfter
  }), false, "a replacement ChatClub document must abort the first-party switch attempt");
  firstPartyParentRaceRuntime.runtime.handleCommittedNavigation({
    ...firstPartyParentRaceRecovery
  });
  await new Promise((resolve) => { setTimeout(resolve, 80); });
  assert.equal(
    firstPartyParentRaceApi.executeScriptCalls.length,
    0,
    "a first-party landing must not recover under a replacement ChatClub document"
  );
  assert.equal(firstPartyParentRaceApi.setCalls.length, 0);
  assert.equal(firstPartyParentRaceApi.debuggerCalls.length, 0);

  const partitionParentRaceToken = `random-${"P".repeat(32)}`;
  const partitionParentRaceCookieLine = `user-gateway-token=${partitionParentRaceToken}; Path=/; Max-Age=604800; HttpOnly`;
  const partitionParentRaceApi = fakeExtensionApi();
  partitionParentRaceApi.partitionCookieDetailsMode = "unsupported";
  partitionParentRaceApi.partitionKeyResultMode = "empty";
  partitionParentRaceApi.debuggerFrameTargetId = "partition-parent-race-cdp-frame";
  partitionParentRaceApi.debuggerFrameSessionId = "partition-parent-race-oopif-session";
  partitionParentRaceApi.debuggerFrameOwnerFrameId = 46;
  partitionParentRaceApi.debuggerPageFrameId = "partition-parent-race-page-frame";
  const partitionParentRaceTop = {
    tabId: 7,
    frameId: 0,
    parentFrameId: -1,
    url: `${EXTENSION_SITE}/index.html`,
    documentId: "partition-parent-race-extension-before"
  };
  const partitionParentRaceFrame = {
    tabId: 7,
    frameId: 46,
    parentFrameId: 0,
    url: "https://gk.dairoot.cn/c/partition-parent-race",
    documentId: "partition-parent-race-frame-before"
  };
  partitionParentRaceApi.framesByTab.set(7, [
    partitionParentRaceTop,
    partitionParentRaceFrame
  ]);
  partitionParentRaceApi.frameDetails = partitionParentRaceFrame;
  const partitionParentRaceRuntime = createRuntimeHandlers(partitionParentRaceApi);
  assert.deepEqual(await partitionParentRaceRuntime.handlers.get(
    REQUEST.ARM_GROK_MIRROR_ACCOUNT_SWITCH
  )({ bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION }, {
    id: partitionParentRaceApi.runtime.id,
    tab: { id: 7, url: `${EXTENSION_SITE}/index.html` },
    frameId: partitionParentRaceFrame.frameId,
    documentId: partitionParentRaceFrame.documentId,
    url: partitionParentRaceFrame.url
  }), {
    armed: true,
    proceed: true
  });
  assert.equal(partitionParentRaceApi.debuggerAttachedTabId, 7);
  assert.equal(partitionParentRaceRuntime.runtime.handleBeforeNavigate({
    tabId: 7,
    frameId: partitionParentRaceFrame.frameId,
    parentFrameId: 0,
    url: "https://gk.dairoot.cn/api/random-login"
  }), true);
  const partitionParentRaceTopAfter = {
    ...partitionParentRaceTop,
    documentId: "partition-parent-race-extension-after"
  };
  partitionParentRaceApi.framesByTab.set(7, [
    partitionParentRaceTopAfter,
    partitionParentRaceFrame
  ]);
  assert.equal(partitionParentRaceRuntime.runtime.handleCommittedNavigation({
    ...partitionParentRaceTopAfter
  }), false, "a replacement ChatClub document must abort the partition capture");
  const partitionParentRaceDebuggerSource = {
    tabId: 7,
    sessionId: partitionParentRaceApi.debuggerFrameSessionId
  };
  partitionParentRaceApi.emitDebuggerEvent(
    partitionParentRaceDebuggerSource,
    "Network.requestWillBeSent",
    {
      requestId: "partition-parent-race-request",
      loaderId: "partition-parent-race-loader",
      frameId: partitionParentRaceApi.debuggerPageFrameId,
      type: "Document",
      request: { url: "https://gk.dairoot.cn/api/random-login", method: "GET" }
    }
  );
  partitionParentRaceApi.emitDebuggerEvent(
    partitionParentRaceDebuggerSource,
    "Network.responseReceivedExtraInfo",
    {
      requestId: "partition-parent-race-request",
      statusCode: 302,
      headers: { location: "/", "set-cookie": partitionParentRaceCookieLine }
    }
  );
  const partitionParentRaceDetachDeadline = Date.now() + 2_000;
  while (
    partitionParentRaceApi.debuggerAttachedTabId != null
    && Date.now() < partitionParentRaceDetachDeadline
  ) {
    await new Promise((resolve) => { setTimeout(resolve, 20); });
  }
  const partitionParentRaceLanding = {
    ...partitionParentRaceFrame,
    url: "https://gk.dairoot.cn/",
    documentId: "partition-parent-race-landing"
  };
  partitionParentRaceApi.currentHrefByDocumentId.set(
    partitionParentRaceLanding.documentId,
    partitionParentRaceLanding.url
  );
  partitionParentRaceApi.framesByTab.set(7, [
    partitionParentRaceTopAfter,
    partitionParentRaceLanding
  ]);
  partitionParentRaceApi.frameDetails = partitionParentRaceLanding;
  partitionParentRaceRuntime.runtime.handleCommittedNavigation({
    ...partitionParentRaceLanding
  });
  await new Promise((resolve) => { setTimeout(resolve, 80); });
  assert.equal(
    partitionParentRaceApi.debuggerSetCalls.length,
    0,
    "a captured account token must not be installed under a replacement ChatClub document"
  );
  assert.equal(
    partitionParentRaceApi.executeScriptCalls.length,
    0,
    "a partitioned landing must not recover under a replacement ChatClub document"
  );
  assert.equal(
    partitionParentRaceApi.debuggerAttachedTabId,
    undefined,
    "aborting for a replacement ChatClub document must release the debugger"
  );
  assert.equal(partitionParentRaceApi.debuggerCalls.at(0)?.method, "attach");
  assert.equal(partitionParentRaceApi.debuggerCalls.at(-1)?.method, "detach");

  const randomSwitchToken = `random-${"R".repeat(32)}`;
  const randomSwitchCookieLine = `user-gateway-token=${randomSwitchToken}; Path=/; Max-Age=604800; HttpOnly`;
  const randomSwitchApi = fakeExtensionApi();
  randomSwitchApi.partitionCookieDetailsMode = "unsupported";
  randomSwitchApi.partitionKeyResultMode = "empty";
  randomSwitchApi.debuggerFrameTargetId = "random-switch-cdp-frame";
  randomSwitchApi.debuggerFrameSessionId = "random-switch-oopif-session";
  randomSwitchApi.debuggerFrameOwnerFrameId = 44;
  randomSwitchApi.debuggerPageFrameId = "random-switch-page-frame";
  const randomSwitchFrame = {
    tabId: 7,
    frameId: 44,
    parentFrameId: 0,
    url: "https://gk.dairoot.cn/c/before-switch",
    documentId: "random-switch-before-document"
  };
  randomSwitchApi.framesByTab.set(7, [
    {
      tabId: 7,
      frameId: 0,
      parentFrameId: -1,
      url: `${EXTENSION_SITE}/index.html`,
      documentId: "random-switch-extension-document"
    },
    {
      tabId: 7,
      frameId: 43,
      parentFrameId: 0,
      url: randomSwitchFrame.url,
      documentId: "random-switch-same-url-sibling-document"
    },
    randomSwitchFrame
  ]);
  randomSwitchApi.frameDetails = randomSwitchFrame;
  const randomSwitchRuntime = createRuntimeHandlers(randomSwitchApi);
  const randomSwitchSender = {
    id: randomSwitchApi.runtime.id,
    tab: { id: 7, url: `${EXTENSION_SITE}/index.html` },
    frameId: 44,
    documentId: randomSwitchFrame.documentId,
    url: randomSwitchFrame.url
  };

  const arcMissingTopPartitionApi = fakeExtensionApi();
  arcMissingTopPartitionApi.forbidExtensionPageScripting = true;
  arcMissingTopPartitionApi.partitionCookieDetailsMode = "unsupported";
  arcMissingTopPartitionApi.partitionKeyResultMode = "empty";
  arcMissingTopPartitionApi.debuggerFrameTargetId = "arc-missing-top-cdp-frame";
  arcMissingTopPartitionApi.debuggerFrameSessionId = "arc-missing-top-oopif-session";
  arcMissingTopPartitionApi.debuggerFrameOwnerFrameId = randomSwitchFrame.frameId;
  arcMissingTopPartitionApi.debuggerPageFrameId = "arc-missing-top-page-frame";
  const arcMissingTopPartitionFrame = {
    ...randomSwitchFrame,
    parentDocumentId: arcMissingTopDocument.documentId
  };
  arcMissingTopPartitionApi.extensionTopDocuments.set(7, arcMissingTopDocument);
  arcMissingTopPartitionApi.framesByTab.set(7, [arcMissingTopPartitionFrame]);
  arcMissingTopPartitionApi.frameDetails = arcMissingTopPartitionFrame;
  arcMissingTopPartitionApi.currentHrefByDocumentId.set(
    arcMissingTopPartitionFrame.documentId,
    arcMissingTopPartitionFrame.url
  );
  const arcMissingTopPartitionRuntime = createRuntimeHandlers(arcMissingTopPartitionApi);
  assert.deepEqual(await arcMissingTopPartitionRuntime.handlers.get(
    REQUEST.ARM_GROK_MIRROR_ACCOUNT_SWITCH
  )({ bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION }, {
    ...randomSwitchSender,
    id: arcMissingTopPartitionApi.runtime.id
  }), {
    armed: true,
    proceed: true
  }, "the partitioned Arc path must attest and bind through the direct child's exact parentDocumentId");
  assert.equal(
    arcMissingTopPartitionApi.extensionPageScriptAttempts.length,
    0,
    "the Arc partitioned path must never try to script the extension top document"
  );
  assert.ok(
    arcMissingTopPartitionApi.debuggerCalls.some(({ method, target }) => (
      method === "DOM.getFrameOwner" && !target.sessionId
    )),
    "the missing-top Arc partition must bind its attested OOPIF owner through the root debugger target"
  );
  arcMissingTopPartitionRuntime.runtime.handleNavigationError({
    tabId: 7,
    frameId: randomSwitchFrame.frameId,
    parentFrameId: 0,
    url: randomSwitchFrame.url,
    error: "net::ERR_FAILED"
  });
  const arcPartitionCleanupDeadline = Date.now() + 500;
  while (arcMissingTopPartitionApi.debuggerAttachedTabId != null && Date.now() < arcPartitionCleanupDeadline) {
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
  assert.equal(arcMissingTopPartitionApi.debuggerAttachedTabId, undefined);

  const missingRegistrationApi = fakeExtensionApi();
  missingRegistrationApi.partitionCookieDetailsMode = "unsupported";
  missingRegistrationApi.partitionKeyResultMode = "empty";
  missingRegistrationApi.framesByTab.set(7, randomSwitchApi.framesByTab.get(7));
  missingRegistrationApi.frameDetails = randomSwitchFrame;
  const missingRegistrationRuntime = createRuntimeHandlers(missingRegistrationApi, undefined, {
    registeredFrameContext: async () => null
  });
  assert.deepEqual(await missingRegistrationRuntime.handlers.get(
    REQUEST.ARM_GROK_MIRROR_ACCOUNT_SWITCH
  )({ bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION }, {
    ...randomSwitchSender,
    id: missingRegistrationApi.runtime.id
  }), {
    armed: false,
    proceed: false
  }, "an unregistered Mirror document must fail closed before debugger capture");
  assert.equal(missingRegistrationApi.debuggerCalls.length, 0);

  for (const [label, mutate] of [
    ["binding", (api) => {
      api.frameBindingIds.set(randomSwitchFrame.frameId, "f".repeat(64));
    }],
    ["parent", (api) => {
      api.frameDetails = {
        ...randomSwitchFrame,
        parentDocumentId: "replacement-extension-parent"
      };
    }],
    ["document", (api) => {
      const replacement = {
        ...randomSwitchFrame,
        documentId: "replacement-mirror-document"
      };
      api.currentHrefByDocumentId.set(replacement.documentId, replacement.url);
      api.frameDetails = replacement;
    }]
  ]) {
    const staleIdentityApi = fakeExtensionApi();
    staleIdentityApi.partitionCookieDetailsMode = "unsupported";
    staleIdentityApi.partitionKeyResultMode = "empty";
    staleIdentityApi.debuggerFrameTargetId = `stale-${label}-cdp-frame`;
    staleIdentityApi.debuggerFrameSessionId = `stale-${label}-oopif-session`;
    staleIdentityApi.debuggerFrameOwnerFrameId = randomSwitchFrame.frameId;
    staleIdentityApi.debuggerPageFrameId = `stale-${label}-page-frame`;
    staleIdentityApi.framesByTab.set(7, randomSwitchApi.framesByTab.get(7));
    staleIdentityApi.frameDetails = randomSwitchFrame;
    staleIdentityApi.onDebuggerAttach = () => mutate(staleIdentityApi);
    const staleIdentityRuntime = createRuntimeHandlers(staleIdentityApi);
    assert.deepEqual(await staleIdentityRuntime.handlers.get(
      REQUEST.ARM_GROK_MIRROR_ACCOUNT_SWITCH
    )({ bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION }, {
      ...randomSwitchSender,
      id: staleIdentityApi.runtime.id
    }), {
      armed: false,
      proceed: false
    }, `a ${label} change during ARM must fail closed`);
    assert.equal(staleIdentityApi.setCalls.length, 0);
    assert.equal(staleIdentityApi.debuggerCalls.at(0)?.method, "attach");
    assert.equal(staleIdentityApi.debuggerCalls.at(-1)?.method, "detach");
  }

  // Opening DevTools for the ChatClub tab owns the same debugger target that
  // account-switch capture needs. A still-current exact target may preserve
  // native switching without detaching that client, and remains retryable.
  const devtoolsConflictApi = fakeExtensionApi();
  devtoolsConflictApi.partitionCookieDetailsMode = "unsupported";
  devtoolsConflictApi.partitionKeyResultMode = "empty";
  devtoolsConflictApi.framesByTab.set(7, randomSwitchApi.framesByTab.get(7));
  devtoolsConflictApi.frameDetails = randomSwitchFrame;
  devtoolsConflictApi.debuggerAttachError = true;
  const devtoolsConflictRuntime = createRuntimeHandlers(devtoolsConflictApi);
  const devtoolsConflictSender = {
    ...randomSwitchSender,
    id: devtoolsConflictApi.runtime.id
  };
  assert.deepEqual(await devtoolsConflictRuntime.handlers.get(
    REQUEST.ARM_GROK_MIRROR_ACCOUNT_SWITCH
  )({ bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION }, devtoolsConflictSender), {
    armed: false,
    proceed: true
  }, "an externally attached DevTools client must preserve the revalidated native account switch");
  assert.deepEqual(
    devtoolsConflictApi.debuggerCalls.map(({ method }) => method),
    ["attach"],
    "a failed attach must not detach the debugger client owned by DevTools"
  );

  const staleDevtoolsConflictApi = fakeExtensionApi();
  staleDevtoolsConflictApi.partitionCookieDetailsMode = "unsupported";
  staleDevtoolsConflictApi.partitionKeyResultMode = "empty";
  staleDevtoolsConflictApi.framesByTab.set(7, randomSwitchApi.framesByTab.get(7));
  staleDevtoolsConflictApi.frameDetails = randomSwitchFrame;
  staleDevtoolsConflictApi.debuggerAttachError = true;
  staleDevtoolsConflictApi.onDebuggerAttachFailure = () => {
    staleDevtoolsConflictApi.currentHrefByDocumentId.set(
      randomSwitchFrame.documentId,
      "https://gk.dairoot.cn/c/changed-during-attach-conflict"
    );
  };
  const staleDevtoolsConflictRuntime = createRuntimeHandlers(staleDevtoolsConflictApi);
  assert.deepEqual(await staleDevtoolsConflictRuntime.handlers.get(
    REQUEST.ARM_GROK_MIRROR_ACCOUNT_SWITCH
  )({ bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION }, {
    ...randomSwitchSender,
    id: staleDevtoolsConflictApi.runtime.id
  }), {
    armed: false,
    proceed: false
  }, "an attach conflict must fail closed when the exact original document changes before revalidation");
  assert.deepEqual(
    staleDevtoolsConflictApi.debuggerCalls.map(({ method }) => method),
    ["attach"],
    "a stale attach conflict must not detach the debugger client owned by DevTools"
  );
  assert.equal(
    staleDevtoolsConflictApi.setCalls.length,
    0,
    "a stale attach conflict must not mutate partitioned cookies"
  );

  const concurrentConflictApi = fakeExtensionApi();
  concurrentConflictApi.partitionCookieDetailsMode = "unsupported";
  concurrentConflictApi.partitionKeyResultMode = "empty";
  concurrentConflictApi.framesByTab.set(7, randomSwitchApi.framesByTab.get(7));
  concurrentConflictApi.frameDetails = randomSwitchFrame;
  concurrentConflictApi.debuggerAttachError = true;
  let releaseConcurrentAttachFailure;
  let notifyConcurrentAttachFailure;
  const concurrentAttachGate = new Promise((resolve) => { releaseConcurrentAttachFailure = resolve; });
  const concurrentAttachStarted = new Promise((resolve) => { notifyConcurrentAttachFailure = resolve; });
  concurrentConflictApi.onDebuggerAttachFailure = async () => {
    notifyConcurrentAttachFailure();
    await concurrentAttachGate;
  };
  const concurrentConflictRuntime = createRuntimeHandlers(concurrentConflictApi);
  const concurrentConflictSender = {
    ...randomSwitchSender,
    id: concurrentConflictApi.runtime.id
  };
  const firstConcurrentArm = concurrentConflictRuntime.handlers.get(
    REQUEST.ARM_GROK_MIRROR_ACCOUNT_SWITCH
  )({ bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION }, concurrentConflictSender);
  await concurrentAttachStarted;
  const secondConcurrentArm = await concurrentConflictRuntime.handlers.get(
    REQUEST.ARM_GROK_MIRROR_ACCOUNT_SWITCH
  )({ bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION }, concurrentConflictSender);
  releaseConcurrentAttachFailure();
  assert.deepEqual(secondConcurrentArm, {
    armed: false,
    proceed: false
  }, "a concurrent ARM request must abort the active attempt without native navigation");
  assert.deepEqual(await firstConcurrentArm, {
    armed: false,
    proceed: false
  }, "an attempt invalidated by a concurrent ARM request must remain fail closed");

  devtoolsConflictApi.debuggerAttachError = false;
  devtoolsConflictApi.debuggerFrameTargetId = "devtools-retry-cdp-frame";
  devtoolsConflictApi.debuggerFrameSessionId = "devtools-retry-oopif-session";
  devtoolsConflictApi.debuggerFrameOwnerFrameId = randomSwitchFrame.frameId;
  devtoolsConflictApi.debuggerPageFrameId = "devtools-retry-page-frame";
  assert.deepEqual(await devtoolsConflictRuntime.handlers.get(
    REQUEST.ARM_GROK_MIRROR_ACCOUNT_SWITCH
  )({ bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION }, devtoolsConflictSender), {
    armed: true,
    proceed: true
  }, "closing DevTools must leave the exact same account switch safely retryable");
  devtoolsConflictRuntime.runtime.handleNavigationError({
    tabId: 7,
    frameId: randomSwitchFrame.frameId,
    parentFrameId: 0,
    url: randomSwitchFrame.url,
    error: "net::ERR_FAILED"
  });
  const devtoolsRetryCleanupDeadline = Date.now() + 500;
  while (devtoolsConflictApi.debuggerAttachedTabId != null && Date.now() < devtoolsRetryCleanupDeadline) {
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
  assert.equal(devtoolsConflictApi.debuggerAttachedTabId, undefined);

  const armedRandomSwitch = await randomSwitchRuntime.handlers.get(
    REQUEST.ARM_GROK_MIRROR_ACCOUNT_SWITCH
  )({ bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION }, randomSwitchSender);
  assert.deepEqual(armedRandomSwitch, { armed: true, proceed: true });
  assert.notEqual(
    randomSwitchApi.frameBindingIds.get(43) || frameBindingId(43),
    randomSwitchApi.frameBindingIds.get(44),
    "same-URL Mirror siblings must retain distinct stable frame bindings"
  );
  assert.ok(
    randomSwitchApi.debuggerCalls.some(({ method }) => method === "DOM.describeNode"),
    "partitioned capture must authenticate the clicked iframe's stable DOM owner binding"
  );
  assert.equal(randomSwitchRuntime.runtime.handleBeforeNavigate({
    tabId: 7,
    frameId: 44,
    parentFrameId: 0,
    url: "https://gk.dairoot.cn/api/random-login"
  }), true, "the transient random-login route must not be relayed or persisted");
  const randomSwitchDebuggerSource = {
    tabId: 7,
    sessionId: randomSwitchApi.debuggerFrameSessionId
  };
  randomSwitchApi.emitDebuggerEvent(randomSwitchDebuggerSource, "Network.requestWillBeSent", {
    requestId: "random-switch-request",
    loaderId: "random-switch-loader",
    frameId: "random-switch-page-frame",
    type: "Document",
    request: { url: "https://gk.dairoot.cn/api/random-login", method: "GET" }
  });
  randomSwitchApi.emitDebuggerEvent(randomSwitchDebuggerSource, "Network.responseReceivedExtraInfo", {
    requestId: "random-switch-request",
    statusCode: 302,
    headers: { location: "/", "set-cookie": randomSwitchCookieLine },
    blockedCookies: [{ cookieLine: randomSwitchCookieLine }]
  });
  const immediateInstallDeadline = Date.now() + 2_000;
  while (!randomSwitchApi.debuggerSetCalls.length && Date.now() < immediateInstallDeadline) {
    await new Promise((resolve) => { setTimeout(resolve, 20); });
  }
  assert.equal(
    randomSwitchApi.frameDetails.documentId,
    randomSwitchFrame.documentId,
    "the random Cookie must be installed while the original iframe document is still current"
  );
  assert.equal(
    randomSwitchApi.executeScriptCalls.length,
    0,
    "landing recovery must not run before a new landing document exists"
  );
  const randomSwitchLanding = {
    ...randomSwitchFrame,
    url: "https://gk.dairoot.cn/",
    documentId: "random-switch-after-document"
  };
  const randomSwitchSettled = randomSwitchLanding;
  const randomSwitchLandingMetadata = {
    ...randomSwitchLanding,
    url: randomSwitchFrame.url
  };
  randomSwitchApi.currentHrefByDocumentId.set(randomSwitchLanding.documentId, randomSwitchLanding.url);
  randomSwitchApi.framesByTab.set(7, [randomSwitchApi.framesByTab.get(7)[0], randomSwitchLandingMetadata]);
  randomSwitchApi.frameDetails = randomSwitchLandingMetadata;
  const randomSwitchDeadline = Date.now() + 2_000;
  while (!randomSwitchApi.webSocketProbeCalls.length && Date.now() < randomSwitchDeadline) {
    await new Promise((resolve) => { setTimeout(resolve, 20); });
  }
  const randomTarget = randomSwitchApi.targets.get(partitionId({
    name: "user-gateway-token",
    storeId: "0",
    partitionKey
  }));
  assert.ok(randomTarget, "the captured random account must be installed in the exact iframe partition");
  assert.equal(randomTarget.value, randomSwitchToken);
  assert.equal(randomTarget.secure, true);
  assert.equal(randomTarget.sameSite, "no_restriction");
  assert.ok(randomTarget.expirationDate > Date.now() / 1000 + 6.9 * 24 * 60 * 60);
  assert.deepEqual(randomSwitchApi.executeScriptCalls, []);
  assert.equal(randomSwitchApi.webSocketProbeCalls.length, 1);
  assert.deepEqual(randomSwitchApi.webSocketProbeCalls[0].target, {
    tabId: 7,
    documentIds: ["random-switch-after-document"]
  });
  assert.equal(randomSwitchApi.webSocketProbeCalls[0].world, "ISOLATED");
  assert.equal(randomSwitchApi.webSocketProbeCalls[0].args[0], "wss://gk.dairoot.cn/ws/mgw/");
  assert.ok(
    randomSwitchApi.webSocketProbeCalls[0].args[1] >= 100
    && randomSwitchApi.webSocketProbeCalls[0].args[1] <= 1_500
  );
  assert.equal(JSON.stringify(armedRandomSwitch).includes(randomSwitchToken), false);
  assert.equal(JSON.stringify(randomSwitchApi.debuggerCalls).includes(randomSwitchToken), false);
  assert.equal(JSON.stringify(randomSwitchApi.debuggerSetCalls).includes(randomSwitchToken), false);
  assert.equal(JSON.stringify(randomSwitchApi.stored).includes(randomSwitchToken), false);

  const firstSwitchCleanupDeadline = Date.now() + 2_000;
  while (randomSwitchApi.debuggerAttachedTabId != null && Date.now() < firstSwitchCleanupDeadline) {
    await new Promise((resolve) => { setTimeout(resolve, 20); });
  }
  await new Promise((resolve) => { setTimeout(resolve, 80); });
  const recoverySwitchToken = `random-${"S".repeat(32)}`;
  const recoverySwitchCookieLine = `user-gateway-token=${recoverySwitchToken}; Path=/; Max-Age=604800; HttpOnly`;
  randomSwitchApi.debuggerSetCalls.length = 0;
  randomSwitchApi.executeScriptCalls.length = 0;
  randomSwitchApi.webSocketProbeCalls.length = 0;
  randomSwitchApi.frameDetails = randomSwitchSettled;
  randomSwitchApi.framesByTab.set(7, [randomSwitchApi.framesByTab.get(7)[0], randomSwitchSettled]);
  const recoverySwitchSender = {
    ...randomSwitchSender,
    documentId: randomSwitchSettled.documentId,
    url: randomSwitchSettled.url
  };
  assert.deepEqual(await randomSwitchRuntime.handlers.get(
    REQUEST.ARM_GROK_MIRROR_ACCOUNT_SWITCH
  )({ bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION }, recoverySwitchSender), {
    armed: true,
    proceed: true
  });
  assert.equal(randomSwitchRuntime.runtime.handleBeforeNavigate({
    tabId: 7,
    frameId: 44,
    parentFrameId: 0,
    url: "https://gk.dairoot.cn/api/random-login"
  }), true);
  randomSwitchApi.emitDebuggerEvent(randomSwitchDebuggerSource, "Network.requestWillBeSent", {
    requestId: "recovery-switch-request",
    loaderId: "recovery-switch-loader",
    frameId: "random-switch-page-frame",
    type: "Document",
    request: { url: "https://gk.dairoot.cn/api/random-login", method: "GET" }
  });
  const recoveryAdmin = {
    ...randomSwitchSettled,
    url: "https://gk.dairoot.cn/admin?a=2",
    documentId: "random-switch-admin-document"
  };
  const recoveryAdminMetadata = {
    ...recoveryAdmin,
    url: randomSwitchSettled.url
  };
  randomSwitchApi.currentHrefByDocumentId.set(recoveryAdmin.documentId, recoveryAdmin.url);
  randomSwitchApi.framesByTab.set(7, [randomSwitchApi.framesByTab.get(7)[0], recoveryAdminMetadata]);
  randomSwitchApi.frameDetails = recoveryAdminMetadata;
  assert.equal(randomSwitchRuntime.runtime.handleBeforeNavigate({
    tabId: 7,
    frameId: 44,
    parentFrameId: 0,
    url: recoveryAdmin.url
  }), true, "the exact authentication-race recovery URL must remain transient");
  assert.equal(randomSwitchRuntime.runtime.handleCommittedNavigation({
    tabId: 7,
    frameId: 44,
    parentFrameId: 0,
    documentId: recoveryAdmin.documentId,
    url: recoveryAdmin.url
  }), true, "the exact recovery document must not enter the workspace snapshot");
  const recoverySettled = {
    ...randomSwitchSettled,
    documentId: "random-switch-recovery-settled-document"
  };
  const rejectedAdmin = {
    ...randomSwitchSettled,
    url: "https://gk.dairoot.cn/admin?a=3",
    documentId: "random-switch-rejected-document"
  };
  const rejectedAdminMetadata = { ...rejectedAdmin, url: randomSwitchSettled.url };
  randomSwitchApi.currentHrefByDocumentId.set(rejectedAdmin.documentId, rejectedAdmin.url);
  let recoveryActionCount = 0;
  randomSwitchApi.onExecuteScript = async () => {
    recoveryActionCount += 1;
    const nextFrame = recoveryActionCount === 1 ? rejectedAdminMetadata : recoverySettled;
    randomSwitchApi.framesByTab.set(7, [randomSwitchApi.framesByTab.get(7)[0], nextFrame]);
    randomSwitchApi.frameDetails = nextFrame;
    if (recoveryActionCount === 1) {
      assert.equal(randomSwitchRuntime.runtime.handleBeforeNavigate({
        tabId: 7,
        frameId: 44,
        parentFrameId: 0,
        url: rejectedAdmin.url
      }), true, "the exact rejected random account route must remain transient");
      assert.equal(randomSwitchRuntime.runtime.handleCommittedNavigation({
        tabId: 7,
        frameId: 44,
        parentFrameId: 0,
        documentId: rejectedAdmin.documentId,
        url: rejectedAdmin.url
      }), true, "the exact rejected random account document must not enter the workspace snapshot");
    }
    return [{ result: true }];
  };
  randomSwitchApi.emitDebuggerEvent(randomSwitchDebuggerSource, "Network.responseReceivedExtraInfo", {
    requestId: "recovery-switch-request",
    statusCode: 302,
    headers: { location: "/", "set-cookie": recoverySwitchCookieLine }
  });
  const recoverySwitchDeadline = Date.now() + 2_000;
  while (randomSwitchApi.executeScriptCalls.length < 2 && Date.now() < recoverySwitchDeadline) {
    await new Promise((resolve) => { setTimeout(resolve, 20); });
  }
  assert.equal(randomSwitchApi.targets.get(partitionId({
    name: "user-gateway-token",
    storeId: "0",
    partitionKey
  }))?.value, recoverySwitchToken);
  assert.deepEqual(randomSwitchApi.executeScriptCalls, [
    { target: { tabId: 7, documentIds: [recoveryAdmin.documentId] } },
    { target: { tabId: 7, documentIds: [rejectedAdmin.documentId] } }
  ], "a=2 and a=3 must retry only their exact documents under the same captured token");
  assert.equal(JSON.stringify(randomSwitchApi.debuggerCalls).includes(recoverySwitchToken), false);
  assert.equal(JSON.stringify(randomSwitchApi.debuggerSetCalls).includes(recoverySwitchToken), false);
  assert.equal(JSON.stringify(randomSwitchApi.executeScriptCalls).includes(recoverySwitchToken), false);
  assert.equal(JSON.stringify(randomSwitchApi.stored).includes(recoverySwitchToken), false);

  const recoveryCleanupDeadline = Date.now() + 2_000;
  while (randomSwitchApi.debuggerAttachedTabId != null && Date.now() < recoveryCleanupDeadline) {
    await new Promise((resolve) => { setTimeout(resolve, 20); });
  }
  assert.equal(randomSwitchApi.debuggerAttachedTabId, undefined, "bounded account recovery must release the debugger");
  await new Promise((resolve) => { setTimeout(resolve, 80); });

  const limitedRecoveryToken = `random-${"U".repeat(32)}`;
  const limitedRecoveryCookieLine = `user-gateway-token=${limitedRecoveryToken}; Path=/; Max-Age=604800; HttpOnly`;
  randomSwitchApi.debuggerSetCalls.length = 0;
  randomSwitchApi.executeScriptCalls.length = 0;
  randomSwitchApi.frameDetails = recoverySettled;
  randomSwitchApi.framesByTab.set(7, [randomSwitchApi.framesByTab.get(7)[0], recoverySettled]);
  const limitedRecoverySender = {
    ...randomSwitchSender,
    documentId: recoverySettled.documentId,
    url: recoverySettled.url
  };
  assert.deepEqual(await randomSwitchRuntime.handlers.get(
    REQUEST.ARM_GROK_MIRROR_ACCOUNT_SWITCH
  )({ bridgeVersion: protocol.GROK_COOKIE_BRIDGE_VERSION }, limitedRecoverySender), {
    armed: true,
    proceed: true
  });
  assert.equal(randomSwitchRuntime.runtime.handleBeforeNavigate({
    tabId: 7,
    frameId: 44,
    parentFrameId: 0,
    url: "https://gk.dairoot.cn/api/random-login"
  }), true);
  randomSwitchApi.emitDebuggerEvent(randomSwitchDebuggerSource, "Network.requestWillBeSent", {
    requestId: "limited-recovery-request",
    loaderId: "limited-recovery-loader",
    frameId: "random-switch-page-frame",
    type: "Document",
    request: { url: "https://gk.dairoot.cn/api/random-login", method: "GET" }
  });
  const limitedRecoveryAdmin = (index) => ({
    ...recoverySettled,
    url: `https://gk.dairoot.cn/admin?a=${[1, 2, 3][index % 3]}`,
    documentId: `random-switch-limited-recovery-${index}`
  });
  const showLimitedRecoveryAdmin = (index) => {
    const exact = limitedRecoveryAdmin(index);
    const metadata = { ...exact, url: recoverySettled.url };
    randomSwitchApi.currentHrefByDocumentId.set(exact.documentId, exact.url);
    randomSwitchApi.framesByTab.set(7, [randomSwitchApi.framesByTab.get(7)[0], metadata]);
    randomSwitchApi.frameDetails = metadata;
    assert.equal(randomSwitchRuntime.runtime.handleBeforeNavigate({
      tabId: 7,
      frameId: 44,
      parentFrameId: 0,
      url: exact.url
    }), true);
    assert.equal(randomSwitchRuntime.runtime.handleCommittedNavigation({
      tabId: 7,
      frameId: 44,
      parentFrameId: 0,
      documentId: exact.documentId,
      url: exact.url
    }), true);
  };
  let limitedRecoveryActionCount = 0;
  randomSwitchApi.onExecuteScript = async () => {
    limitedRecoveryActionCount += 1;
    showLimitedRecoveryAdmin(limitedRecoveryActionCount);
    return [{ result: true }];
  };
  showLimitedRecoveryAdmin(0);
  randomSwitchApi.emitDebuggerEvent(randomSwitchDebuggerSource, "Network.responseReceivedExtraInfo", {
    requestId: "limited-recovery-request",
    statusCode: 302,
    headers: { location: "/", "set-cookie": limitedRecoveryCookieLine }
  });
  const limitedRecoveryDeadline = Date.now() + 2_000;
  while (randomSwitchApi.executeScriptCalls.length < 3 && Date.now() < limitedRecoveryDeadline) {
    await new Promise((resolve) => { setTimeout(resolve, 20); });
  }
  await new Promise((resolve) => { setTimeout(resolve, 80); });
  assert.equal(randomSwitchApi.debuggerAttachedTabId, undefined);
  assert.deepEqual(
    randomSwitchApi.executeScriptCalls.map((call) => call.target.documentIds?.[0]),
    [
      limitedRecoveryAdmin(0).documentId,
      limitedRecoveryAdmin(1).documentId,
      limitedRecoveryAdmin(2).documentId
    ],
    "a=1, a=2, and a=3 must share a three-document recovery limit"
  );
  assert.equal(limitedRecoveryActionCount, 3, "the fourth failed account must stop without another replace");
  assert.equal(randomSwitchApi.targets.get(partitionId({
    name: "user-gateway-token",
    storeId: "0",
    partitionKey
  }))?.value, limitedRecoveryToken);

  assert.equal(manifest.permissions.includes("cookies"), true);
  assert.equal(manifest.permissions.includes("debugger"), true);
  assert.match(serviceWorker, /extensionPageSender\(sender\)/);
  assert.match(serviceWorker, /api\.cookies\.getPartitionKey\(\{/);
  assert.match(serviceWorker, /frame\.parentFrameId !== 0/);
  assert.match(serviceWorker, /isGrokSessionUrl\(senderUrl\)/);
  assert.match(serviceWorker, /removeAllManagedGrokPartitions\(api\)/);
  assert.match(serviceWorker, /markFramePreflightFallback/);
  assert.match(serviceWorker, /consumeFallbackReload/);
  const committedNavigationListener = backgroundRuntime.slice(
    backgroundRuntime.indexOf("chrome.webNavigation?.onCommitted?.addListener"),
    backgroundRuntime.indexOf("chrome.webNavigation?.onErrorOccurred?.addListener")
  );
  assert.ok(
    committedNavigationListener.indexOf("grokCookieRuntime.handleCommittedNavigation(details)")
      < committedNavigationListener.indexOf("Number(details?.frameId) === 0"),
    "a top-frame commit must abort any active Mirror switch before secure contexts are forgotten"
  );
  const sourceSync = grokRuntime.slice(
    grokRuntime.indexOf("function scheduleSourceCookieSync"),
    grokRuntime.indexOf("function handleCookieChange")
  );
  assert.match(sourceSync, /managedGrokPartitionKeys/);
  assert.doesNotMatch(sourceSync, /chromiumExtensionPartitionKey/);
  assert.doesNotMatch(
    grokRuntime,
    /exactExtensionTopDocument|installMirrorRandomLoginAttestation|clearMirrorRandomLoginAttestation/,
    "Mirror account switching must never inject into the extension top document"
  );
  assert.match(grokDebugger, /data-frame-binding-id/);
  assert.doesNotMatch(grokDebugger, /data-chatclub-grok-mirror-account-switch/);
  assert.doesNotMatch(serviceWorker, /message\.(?:partitionKey|topLevelSite|storeId|names)/);
  assert.match(relay, /window\.top === window/);
  assert.match(relay, /globalThis\[INSTALLATION_KEY\] === `\$\{INSTALLATION_VERSION\}:pending`/);
  assert.match(relay, /delete globalThis\[INSTALLATION_KEY\]/);
  assert.match(relay, /sessionStorage\.setItem\(RELOAD_MARKER/);
  assert.equal(relay.match(/var GROK_COOKIE_BRIDGE_VERSION = "([^"]+)"/)?.[1], protocol.GROK_COOKIE_BRIDGE_VERSION);
  assert.match(read("content-src/grok-cookie-bridge.js"), /const BRIDGE_VERSION = GROK_COOKIE_BRIDGE_VERSION/);
  assert.match(read("content-src/grok-cookie-bridge.js"), /const INSTALLATION_VERSION = runtimeIdentity\.bundle\.implementationVersion/);
  const frameLoad = functionSource(workspace, "setFrameSrcAfterPrepare");
  assert.match(frameLoad, /const fallback = plan\.grokPreflight \? setTimeout/);
  assert.match(frameLoad, /}, 10000\) : null/);
  assert.doesNotMatch(frameLoad, /1800/, "ordinary frame loads must not share the Grok Cookie fallback timer");
  assert.match(workspace, /markGrokFramePreflightFallback\(url, preflightId\)/);

  console.log("Grok partitioned Cookie bridge: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
