import { GROK_COOKIE_BRIDGE_VERSION } from "../shared/protocol.js";
import {
  chromiumExtensionPartitionKey,
  clearGrokTombstonesForStore,
  cookieStoreIdForTab,
  grokCookieProfileIdForCookie,
  grokCookieProfileIdForUrl,
  grokCookieChangeOwnedByBridge,
  isGrokSessionUrl,
  isPartitionedGrokTargetChange,
  isUnpartitionedGrokSourceChange,
  managedGrokPartitionKeys,
  releaseChangedGrokPartition,
  removeAllManagedGrokPartitions,
  removeManagedGrokPartitionsExcept,
  setGrokMirrorLoginCookie,
  syncGrokSessionCookies
} from "./grok-cookie-bridge.js";
import {
  captureGrokMirrorRandomLoginCookie,
  createGrokManagedPartitionCookieBackend,
  createGrokMirrorPartitionCookieBackend,
  withGrokMirrorPartitionCookieBackend
} from "./grok-cookie-debugger.js";

const GROK_FRAME_PREFLIGHT_MAX_AGE_MS = 60 * 1000;
const PARTITION_COOKIE_PROBE_NAME = "__chatclub_partition_cookie_probe__";
const MIRROR_LOGIN_NAVIGATION_TTL_MS = 15 * 1000;
const MIRROR_RANDOM_LOGIN_CAPTURE_MS = 20 * 1000;
const MIRROR_RANDOM_LOGIN_COOKIE_CAPTURE_MS = 7 * 1000;
const MIRROR_RANDOM_LOGIN_WEBSOCKET_PROBE_MS = 1_500;
const MIRROR_RANDOM_LOGIN_PROBE_GUARD_MS = 250;
const MIRROR_RANDOM_LOGIN_URL = "https://gk.dairoot.cn/api/random-login";
const MIRROR_RANDOM_LOGIN_LANDING_URL = "https://gk.dairoot.cn/";
const MIRROR_RANDOM_LOGIN_UNAUTHORIZED_URL = "https://gk.dairoot.cn/admin?a=1";
const MIRROR_RANDOM_LOGIN_RECOVERY_URL = "https://gk.dairoot.cn/admin?a=2";
const MIRROR_RANDOM_LOGIN_REJECTED_URL = "https://gk.dairoot.cn/admin?a=3";
const MIRROR_RANDOM_LOGIN_WEBSOCKET_URL = "wss://gk.dairoot.cn/ws/mgw/";
const MIRROR_RANDOM_LOGIN_MAX_ACCOUNT_RECOVERIES = 3;
const MIRROR_FRAME_BINDING_PATTERN = /^[a-f0-9]{64}$/i;

function mirrorLoginNavigation(details = {}) {
  if (
    !Number.isInteger(details?.tabId)
    || !Number.isInteger(details?.frameId)
    || details.frameId <= 0
    || details.parentFrameId !== 0
  ) return null;
  try {
    const parsed = new URL(String(details.url || ""));
    if (
      parsed.protocol !== "https:"
      || parsed.hostname.toLowerCase() !== "gk.dairoot.cn"
      || parsed.username
      || parsed.password
      || parsed.port
      || parsed.pathname !== "/api/not-login"
    ) return null;
    const values = parsed.searchParams.getAll("user_gateway_token");
    const keys = [...parsed.searchParams.keys()];
    const token = values.length === 1
      && keys.length === 1
      && keys[0] === "user_gateway_token"
      && !parsed.hash
      && /^gt-[0-9a-f]{32}$/.test(values[0])
      ? values[0]
      : "";
    return { sensitive: true, token };
  } catch {
    return null;
  }
}

function mirrorRandomLoginNavigation(details = {}) {
  return Number.isInteger(details?.tabId)
    && Number.isInteger(details?.frameId)
    && details.frameId > 0
    && details.parentFrameId === 0
    && String(details.url || "") === MIRROR_RANDOM_LOGIN_URL;
}

function mirrorRandomLoginTransitionKind(attempt, value) {
  const url = String(value || "");
  if (url === MIRROR_RANDOM_LOGIN_URL) return "random-login";
  if (url === MIRROR_RANDOM_LOGIN_LANDING_URL) return "landing";
  if (url === MIRROR_RANDOM_LOGIN_UNAUTHORIZED_URL) return "unauthorized";
  if (url === MIRROR_RANDOM_LOGIN_RECOVERY_URL) return "recovery";
  if (url === MIRROR_RANDOM_LOGIN_REJECTED_URL) return "rejected";
  if (url && url === String(attempt?.originalFrameUrl || "")) return "original";
  return "";
}

function reloadCurrentGrokFrame() {
  location.reload();
}

function reloadMirrorRandomLoginLanding() {
  if (location.href !== "https://gk.dairoot.cn/") return false;
  location.reload();
  return true;
}

function recoverMirrorRandomLoginLanding() {
  if (
    location.href !== "https://gk.dairoot.cn/admin?a=1"
    && location.href !== "https://gk.dairoot.cn/admin?a=2"
    && location.href !== "https://gk.dairoot.cn/admin?a=3"
  ) return false;
  location.replace("https://gk.dairoot.cn/");
  return true;
}

function probeMirrorRandomLoginWebSocket(endpoint, timeoutMs) {
  if (
    location.href !== "https://gk.dairoot.cn/"
    || endpoint !== "wss://gk.dairoot.cn/ws/mgw/"
    || !Number.isFinite(timeoutMs)
    || timeoutMs < 100
    || typeof globalThis.WebSocket !== "function"
    || typeof globalThis.crypto?.randomUUID !== "function"
  ) return Promise.resolve("unavailable");
  return new Promise((resolve) => {
    let socket = null;
    let timer = 0;
    let settled = false;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      timer = 0;
      try { socket?.removeEventListener("open", onOpen); } catch {}
      try { socket?.removeEventListener("error", onError); } catch {}
      try { socket?.removeEventListener("close", onClose); } catch {}
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      try { socket?.close(1000); } catch {}
      resolve(result);
    };
    const onOpen = () => finish("open");
    const onError = () => finish("error");
    const onClose = () => finish("close");
    try {
      socket = new globalThis.WebSocket(`${endpoint}?uid=${globalThis.crypto.randomUUID()}`);
      socket.addEventListener("open", onOpen, { once: true });
      socket.addEventListener("error", onError, { once: true });
      socket.addEventListener("close", onClose, { once: true });
      timer = setTimeout(() => finish("timeout"), timeoutMs);
    } catch {
      finish("unavailable");
    }
  });
}

function currentDocumentHref() {
  return location.href;
}

export function createGrokCookieRuntime(api, dependencies = {}) {
  if (!api?.runtime || !api?.webNavigation) throw new TypeError("Grok Cookie runtime requires the extension API");
  if (typeof dependencies.verifiedExtensionPageSender !== "function") {
    throw new TypeError("Grok Cookie runtime requires verifiedExtensionPageSender");
  }
  const verifiedExtensionPageSender = dependencies.verifiedExtensionPageSender;
  const registeredFrameContext = dependencies.registeredFrameContext;
  const withTabDebugger = dependencies.withTabDebugger;
  const sourceChangeTimers = new Map();
  const sourceChangedAuthCookies = new Map();
  const framePreflights = new Map();
  const fallbackReloadCounts = new Map();
  const pendingMirrorLoginNavigations = new Map();
  const activeMirrorRandomLogins = new Map();
  let bridgeChain = Promise.resolve();
  let partitionCookieDetailsMode = "";
  let mirrorLoginAttemptSequence = 0;

  function framePreflightId(value) {
    const id = String(value || "");
    return /^[a-z0-9][a-z0-9._:-]{15,191}$/i.test(id) ? id : "";
  }

  function pruneFramePreflights(now = Date.now()) {
    for (const [id, preflight] of framePreflights) {
      if (now - Number(preflight?.startedAt || 0) > GROK_FRAME_PREFLIGHT_MAX_AGE_MS) framePreflights.delete(id);
    }
  }

  function fallbackReloadKey(tabId, profileId) {
    return Number.isInteger(tabId) && profileId ? `${tabId}:${profileId}` : "";
  }

  function registerFramePreflight(message = {}, sender = {}) {
    const profileId = grokCookieProfileIdForUrl(message.url);
    if (!profileId || !isGrokSessionUrl(message.url)) return "";
    const id = framePreflightId(message.preflightId);
    if (!id) return "";
    const tabId = verifiedExtensionPageSender(sender);
    pruneFramePreflights();
    framePreflights.set(id, {
      tabId,
      url: String(message.url || ""),
      profileId,
      startedAt: Date.now(),
      fallbackMarked: false
    });
    return id;
  }

  function finishFramePreflight(id) {
    if (id) framePreflights.delete(id);
  }

  function markFramePreflightFallback(message = {}, sender = {}) {
    const tabId = verifiedExtensionPageSender(sender);
    const id = framePreflightId(message.preflightId);
    const preflight = id ? framePreflights.get(id) : null;
    if (!preflight || preflight.tabId !== tabId || preflight.url !== String(message.url || "")) return false;
    if (!preflight.fallbackMarked) {
      preflight.fallbackMarked = true;
      framePreflights.set(id, preflight);
      const key = fallbackReloadKey(tabId, preflight.profileId);
      if (!key) return false;
      fallbackReloadCounts.set(key, Math.min(32, (fallbackReloadCounts.get(key) || 0) + 1));
    }
    return true;
  }

  function consumeFallbackReload(tabId, profileId) {
    const key = fallbackReloadKey(tabId, profileId);
    const count = key ? fallbackReloadCounts.get(key) || 0 : 0;
    if (!count) return false;
    if (count === 1) fallbackReloadCounts.delete(key);
    else fallbackReloadCounts.set(key, count - 1);
    return true;
  }

  function queue(task) {
    const run = bridgeChain.catch(() => {}).then(task);
    bridgeChain = run.catch(() => {});
    return run;
  }

  function publicResult(result = {}) {
    return {
      supported: result.supported === true,
      changed: result.changed === true,
      created: Math.max(0, Number(result.created) || 0),
      updated: Math.max(0, Number(result.updated) || 0),
      removed: Math.max(0, Number(result.removed) || 0),
      skipped: Math.max(0, Number(result.skipped) || 0)
    };
  }

  function partitionCandidateId(partitionKey = {}) {
    const topLevelSite = String(partitionKey?.topLevelSite || "").replace(/\/+$/, "");
    return topLevelSite
      ? JSON.stringify([topLevelSite, Boolean(partitionKey?.hasCrossSiteAncestor)])
      : "";
  }

  function discoveredPartitionKey(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    if (typeof value.topLevelSite === "string") return value;
    const keys = Object.keys(value);
    const nested = keys.length === 1 && keys[0] === "partitionKey" ? value.partitionKey : null;
    return nested && typeof nested === "object" && !Array.isArray(nested) ? nested : null;
  }

  function firstPartyPartitionSite(profileId) {
    if (profileId === "grok") return "https://grok.com";
    if (profileId === "grokMirror") return "https://dairoot.cn";
    return "";
  }

  async function embeddedFrameCookieContext(tabId, frameId, documentId, profileId) {
    if (typeof api.cookies?.getPartitionKey !== "function") return null;
    const response = await api.cookies.getPartitionKey({ tabId, frameId, documentId });
    const discovered = discoveredPartitionKey(response);
    const canonical = chromiumExtensionPartitionKey(api.runtime);
    const discoveredId = partitionCandidateId(discovered);
    if (discoveredId) {
      if (discoveredId === partitionCandidateId(canonical)) {
        return { mode: "partitioned", partitionKey: discovered };
      }
      if (
        String(discovered?.topLevelSite || "").replace(/\/+$/, "") === firstPartyPartitionSite(profileId)
        && discovered?.hasCrossSiteAncestor === false
      ) return { mode: "first-party", partitionKey: null };
      return null;
    }
    if (!response || typeof response !== "object" || Array.isArray(response)) return null;
    return Object.keys(response).length === 0
      ? { mode: "partitioned", partitionKey: canonical }
      : null;
  }

  async function embeddedFramePartitionKey(tabId, frameId, documentId, profileId) {
    const context = await embeddedFrameCookieContext(tabId, frameId, documentId, profileId);
    return context?.mode === "partitioned" ? context.partitionKey : null;
  }

  function partitionCookieProfileUrl(profileId) {
    if (profileId === "grok") return "https://grok.com/";
    if (profileId === "grokMirror") return "https://gk.dairoot.cn/";
    return "";
  }

  function partitionCookieSchemaRejected(error) {
    const message = String(error?.message || error || "");
    return /partitionKey/i.test(message)
      && /unexpected property|invalid (?:value|argument|invocation|parameters?)|unknown property/i.test(message);
  }

  async function exactDocumentHref(tabId, documentId) {
    if (
      !Number.isInteger(tabId)
      || !String(documentId || "")
      || typeof api.scripting?.executeScript !== "function"
    ) return "";
    try {
      const results = await api.scripting.executeScript({
        target: { tabId, documentIds: [String(documentId)] },
        func: currentDocumentHref
      });
      if (!Array.isArray(results) || results.length !== 1) return "";
      return String(results[0]?.result || "");
    } catch {
      return "";
    }
  }

  async function currentExtensionTopFrame(tabId, navigationTopFrame = undefined) {
    const extensionBase = String(api.runtime.getURL(""));
    let topFrame = navigationTopFrame;
    if (topFrame === undefined) {
      try {
        topFrame = await api.webNavigation.getFrame({ tabId, frameId: 0 });
      } catch {
        topFrame = null;
      }
    }
    if (topFrame) {
      if (!String(topFrame.url || "").startsWith(extensionBase)) return null;
      return topFrame;
    }
    if (typeof api.tabs?.get !== "function") return null;
    try {
      const tab = await api.tabs.get(tabId);
      return String(tab?.url || "").startsWith(extensionBase) ? { url: String(tab.url) } : null;
    } catch {
      return null;
    }
  }

  async function currentRegisteredMirrorFrame(target = {}, options = {}) {
    const tabId = target.tabId;
    const frameId = target.frameId;
    const documentId = String(options.documentId || target.documentId || target.originalDocumentId || "");
    const frameUrl = String(options.frameUrl || target.frameUrl || target.originalFrameUrl || "");
    const parentDocumentId = String(target.parentDocumentId || "");
    const expectedBindingId = String(target.frameBindingId || "");
    const expectedRegistrationToken = String(options.registrationToken || "");
    if (
      target.signal?.aborted
      || typeof registeredFrameContext !== "function"
      || !Number.isInteger(tabId)
      || !Number.isInteger(frameId)
      || frameId <= 0
      || !documentId
      || !frameUrl
      || !parentDocumentId
    ) return null;
    let registered;
    let frame;
    let topFrame;
    try {
      [registered, frame, topFrame] = await Promise.all([
        registeredFrameContext(tabId, frameId),
        api.webNavigation.getFrame({ tabId, frameId }),
        currentExtensionTopFrame(tabId)
      ]);
    } catch {
      return null;
    }
    const context = registered?.context;
    const registrationToken = String(registered?.token || "");
    const contextDocumentId = String(context?.browserDocumentId || context?.documentId || "");
    const contextUrl = String(context?.url || "");
    const contextParentDocumentId = String(context?.parentDocumentId || "");
    const frameBindingId = String(context?.frameBindingId || "");
    const currentDocumentId = String(frame?.documentId || "");
    const currentParentDocumentId = String(frame?.parentDocumentId || "");
    const visibleTopDocumentId = String(topFrame?.documentId || "");
    // Chromium's GetFrameResultDetails is already selected by the exact
    // requested frameId, but Arc does not repeat frameId in the returned
    // object. If an implementation does expose it, keep rejecting a mismatch.
    const returnedFrameId = Object.hasOwn(frame || {}, "frameId") ? frame.frameId : frameId;
    if (
      !context
      || context.tabId !== tabId
      || context.frameId !== frameId
      || returnedFrameId !== frameId
      || frame?.parentFrameId !== 0
      || currentDocumentId !== documentId
      || parentDocumentId === documentId
      || currentParentDocumentId !== parentDocumentId
      || contextParentDocumentId !== parentDocumentId
      || contextDocumentId !== documentId
      || contextUrl !== frameUrl
      || !MIRROR_FRAME_BINDING_PATTERN.test(frameBindingId)
      || (expectedBindingId && frameBindingId !== expectedBindingId)
      || (expectedRegistrationToken && registrationToken !== expectedRegistrationToken)
      || !topFrame
      || (visibleTopDocumentId && visibleTopDocumentId !== parentDocumentId)
      || await exactDocumentHref(tabId, documentId) !== frameUrl
    ) return null;
    return {
      registrationToken,
      frameBindingId,
      context,
      frame
    };
  }

  async function currentMirrorRandomLoginParent(attempt = {}, options = {}) {
    return Boolean(await currentRegisteredMirrorFrame(attempt, {
      documentId: options.documentId,
      frameUrl: options.frameUrl,
      registrationToken: options.requireOriginalRegistration === true
        ? attempt.registrationToken
        : ""
    }));
  }

  async function extensionTabForCookieStore(storeId) {
    let stores;
    try { stores = await api.cookies.getAllCookieStores(); } catch { return null; }
    const store = (stores || []).find((entry) => String(entry?.id || "") === String(storeId || ""));
    for (const tabId of Array.isArray(store?.tabIds) ? store.tabIds : []) {
      if (Number.isInteger(tabId) && await currentExtensionTopFrame(tabId)) return tabId;
    }
    return null;
  }

  async function syncManagedPartitionAtExtensionAnchor(storeId, partitionKey, profileId) {
    if (typeof withTabDebugger !== "function") return publicResult();
    const tabId = await extensionTabForCookieStore(storeId);
    if (!Number.isInteger(tabId)) return publicResult();
    const revalidate = async () => {
      if (!await currentExtensionTopFrame(tabId)) return false;
      try { return await cookieStoreIdForTab(api, tabId) === String(storeId || ""); } catch { return false; }
    };
    if (!await revalidate()) return publicResult();
    return withTabDebugger(tabId, async ({ sendCommand }) => {
      if (!await revalidate()) throw new Error("Grok Cookie cleanup tab changed");
      await sendCommand("Network.enable", {});
      const partitionCookieBackend = createGrokManagedPartitionCookieBackend({
        partitionKey,
        revalidate,
        sendCommand
      });
      const result = await syncGrokSessionCookies(api, {
        storeId,
        partitionKey,
        profileId,
        partitionCookieBackend
      });
      return publicResult({ supported: true, ...result });
    });
  }

  async function partitionCookieCapability(storeId, profileId, partitionKey) {
    const profileUrl = partitionCookieProfileUrl(profileId);
    const topLevelSite = String(partitionKey?.topLevelSite || "").replace(/\/+$/, "");
    if (!profileUrl || !topLevelSite || typeof api.cookies?.get !== "function") {
      return { mode: "unsupported", partitionKey: null };
    }
    if (partitionCookieDetailsMode === "full") {
      return { mode: "full", partitionKey: { ...partitionKey } };
    }
    if (partitionCookieDetailsMode === "top-level-only") {
      return { mode: "top-level-only", partitionKey: { topLevelSite } };
    }
    if (partitionCookieDetailsMode === "unsupported") {
      return { mode: "unsupported", partitionKey: null };
    }
    const baseDetails = {
      url: profileUrl,
      name: PARTITION_COOKIE_PROBE_NAME,
      ...(String(storeId || "") ? { storeId: String(storeId) } : {})
    };
    const fullKey = {
      topLevelSite,
      ...(typeof partitionKey?.hasCrossSiteAncestor === "boolean"
        ? { hasCrossSiteAncestor: partitionKey.hasCrossSiteAncestor }
        : {})
    };
    try {
      await api.cookies.get({ ...baseDetails, partitionKey: fullKey });
      partitionCookieDetailsMode = "full";
      return { mode: "full", partitionKey: fullKey };
    } catch (error) {
      if (!partitionCookieSchemaRejected(error)) throw error;
    }
    const simpleKey = { topLevelSite };
    try {
      await api.cookies.get({ ...baseDetails, partitionKey: simpleKey });
      partitionCookieDetailsMode = "top-level-only";
      return { mode: "top-level-only", partitionKey: simpleKey };
    } catch (error) {
      if (!partitionCookieSchemaRejected(error)) throw error;
    }
    partitionCookieDetailsMode = "unsupported";
    return { mode: "unsupported", partitionKey: null };
  }

  async function activeFramePartitionTargets(storeId, profileId) {
    if (
      !profileId
      || typeof api.cookies?.getAllCookieStores !== "function"
      || typeof api.cookies?.getPartitionKey !== "function"
      || typeof api.webNavigation?.getAllFrames !== "function"
    ) return [];
    const stores = await api.cookies.getAllCookieStores();
    const store = (stores || []).find((entry) => String(entry?.id || "") === String(storeId || ""));
    const tabIds = [...new Set((store?.tabIds || []).filter(Number.isInteger))];
    const targets = [];
    for (const tabId of tabIds) {
      let frames = [];
      try { frames = await api.webNavigation.getAllFrames({ tabId }) || []; } catch { continue; }
      const topFrame = await currentExtensionTopFrame(
        tabId,
        frames.find((frame) => frame?.frameId === 0) || null
      );
      if (!topFrame) continue;
      for (const frame of frames) {
        const frameId = frame?.frameId;
        const frameUrl = String(frame?.url || "");
        const documentId = String(frame?.documentId || "");
        if (
          !Number.isInteger(frameId)
          || frameId <= 0
          || frame?.parentFrameId !== 0
          || !documentId
          || grokCookieProfileIdForUrl(frameUrl) !== profileId
        ) continue;
        let partitionKey;
        try {
          partitionKey = await embeddedFramePartitionKey(tabId, frameId, documentId, profileId);
        } catch {
          continue;
        }
        if (!partitionCandidateId(partitionKey)) continue;
        targets.push({ tabId, frameId, documentId, frameUrl, profileId, partitionKey });
      }
    }
    return targets;
  }

  async function currentGrokFrame(target = {}, expectedPartitionKey = null) {
    const tabId = target.tabId;
    const frameId = target.frameId;
    const documentId = String(target.documentId || "");
    const frameUrl = String(target.frameUrl || "");
    if (!Number.isInteger(tabId) || !Number.isInteger(frameId) || frameId <= 0 || !documentId || !frameUrl) {
      return null;
    }
    let frame;
    let topFrame;
    try {
      [frame, topFrame] = await Promise.all([
        api.webNavigation.getFrame({ tabId, frameId }),
        currentExtensionTopFrame(tabId)
      ]);
    } catch {
      return null;
    }
    const navigationFrameUrl = String(frame?.url || "");
    if (
      !frame
      || frame.parentFrameId !== 0
      || String(frame.documentId || "") !== documentId
      || grokCookieProfileIdForUrl(navigationFrameUrl) !== target.profileId
      || grokCookieProfileIdForUrl(frameUrl) !== target.profileId
      || !topFrame
    ) return null;
    if (
      (target.routeBound === true || navigationFrameUrl !== frameUrl)
      && await exactDocumentHref(tabId, documentId) !== frameUrl
    ) return null;
    if (expectedPartitionKey) {
      if (typeof api.cookies?.getPartitionKey !== "function") return null;
      let currentPartitionKey;
      try {
        currentPartitionKey = await embeddedFramePartitionKey(
          tabId,
          frameId,
          documentId,
          target.profileId
        );
      } catch {
        return null;
      }
      if (partitionCandidateId(currentPartitionKey) !== partitionCandidateId(expectedPartitionKey)) return null;
    }
    return { frame, topFrame };
  }

  async function currentGrokPartitionTarget(target, partitionKey, storeId) {
    if (!await currentGrokFrame(target, partitionKey)) return false;
    try {
      return await cookieStoreIdForTab(api, target.tabId) === String(storeId || "");
    } catch {
      return false;
    }
  }

  async function currentGrokFirstPartyTarget(target, storeId) {
    if (!await currentGrokFrame(target)) return false;
    try {
      const [cookieContext, currentStoreId] = await Promise.all([
        embeddedFrameCookieContext(
          target.tabId,
          target.frameId,
          target.documentId,
          target.profileId
        ),
        cookieStoreIdForTab(api, target.tabId)
      ]);
      return cookieContext?.mode === "first-party"
        && String(currentStoreId || "") === String(storeId || "");
    } catch {
      return false;
    }
  }

  function mirrorLoginNavigationKey(tabId, frameId) {
    return Number.isInteger(tabId) && Number.isInteger(frameId) && frameId > 0
      ? `${tabId}:${frameId}`
      : "";
  }

  async function authorizeMirrorLoginNavigation(details = {}) {
    if (
      typeof registeredFrameContext !== "function"
      || details.parentFrameId !== 0
    ) return null;
    let registered;
    let frame;
    let topFrame;
    try {
      [registered, frame, topFrame] = await Promise.all([
        registeredFrameContext(details.tabId, details.frameId),
        api.webNavigation.getFrame({ tabId: details.tabId, frameId: details.frameId }),
        currentExtensionTopFrame(details.tabId)
      ]);
    } catch {
      return null;
    }
    const context = registered?.context;
    const contextDocumentId = String(context?.browserDocumentId || context?.documentId || "");
    const frameDocumentId = String(frame?.documentId || "");
    const contextUrl = String(context?.url || "");
    const contextParentDocumentId = String(context?.parentDocumentId || "");
    const frameBindingId = String(context?.frameBindingId || "");
    const frameUrl = String(frame?.url || "");
    const claimedParentDocumentId = String(details.parentDocumentId || "");
    const frameParentDocumentId = String(frame?.parentDocumentId || "");
    const topDocumentId = String(topFrame?.documentId || "");
    const parentDocumentIds = [...new Set([
      claimedParentDocumentId,
      frameParentDocumentId,
      contextParentDocumentId,
      topDocumentId
    ].filter(Boolean))];
    const parentDocumentId = parentDocumentIds.length === 1 ? parentDocumentIds[0] : "";
    if (
      !context
      || context.tabId !== details.tabId
      || context.frameId !== details.frameId
      || !contextDocumentId
      || contextDocumentId !== frameDocumentId
      || !contextUrl
      || contextUrl !== frameUrl
      || grokCookieProfileIdForUrl(contextUrl) !== "grokMirror"
      || frame?.parentFrameId !== 0
      || !MIRROR_FRAME_BINDING_PATTERN.test(frameBindingId)
      || !topFrame
      || !parentDocumentId
      || (topDocumentId && topDocumentId !== parentDocumentId)
    ) return null;
    return {
      sourceDocumentId: contextDocumentId,
      sourceRegistrationToken: String(registered.token || ""),
      frameBindingId,
      parentDocumentId
    };
  }

  function rememberMirrorLoginNavigation(details, token) {
    const key = mirrorLoginNavigationKey(details.tabId, details.frameId);
    if (!key || !token) return false;
    const previous = pendingMirrorLoginNavigations.get(key);
    if (previous) {
      previous.takeToken();
      pendingMirrorLoginNavigations.delete(key);
    }
    const attemptId = ++mirrorLoginAttemptSequence;
    let transientToken = token;
    let expiryTimer = null;
    const authorization = authorizeMirrorLoginNavigation(details).catch(() => null);
    const pending = {
      attemptId,
      expiresAt: Date.now() + MIRROR_LOGIN_NAVIGATION_TTL_MS,
      authorization,
      takeToken() {
        if (expiryTimer !== null) {
          clearTimeout(expiryTimer);
          expiryTimer = null;
        }
        const value = transientToken;
        transientToken = "";
        return value;
      }
    };
    pendingMirrorLoginNavigations.set(key, pending);
    expiryTimer = setTimeout(() => {
      expiryTimer = null;
      pending.takeToken();
      if (pendingMirrorLoginNavigations.get(key)?.attemptId === attemptId) {
        pendingMirrorLoginNavigations.delete(key);
      }
    }, MIRROR_LOGIN_NAVIGATION_TTL_MS);
    return true;
  }

  async function mirrorFrameTargetForNavigation(details = {}, authorization = {}) {
    const tabId = details.tabId;
    const frameId = details.frameId;
    if (!Number.isInteger(tabId) || !Number.isInteger(frameId) || frameId <= 0) return null;
    let frame;
    try { frame = await api.webNavigation.getFrame({ tabId, frameId }); } catch { return null; }
    const navigationFrameUrl = String(frame?.url || "");
    const frameDocumentId = String(frame?.documentId || "");
    const frameParentDocumentId = String(frame?.parentDocumentId || "");
    const documentId = String(details.documentId || "");
    const frameUrl = String(details.url || "");
    const committedParentDocumentId = String(details.parentDocumentId || "");
    if (
      !frame
      || frame.parentFrameId !== 0
      || !documentId
      || !frameDocumentId
      || frameDocumentId !== documentId
      || grokCookieProfileIdForUrl(navigationFrameUrl) !== "grokMirror"
      || grokCookieProfileIdForUrl(frameUrl) !== "grokMirror"
      || !String(authorization.sourceDocumentId || "")
      || !String(authorization.parentDocumentId || "")
      || !MIRROR_FRAME_BINDING_PATTERN.test(String(authorization.frameBindingId || ""))
      || frameParentDocumentId !== String(authorization.parentDocumentId)
      || (committedParentDocumentId
        && committedParentDocumentId !== String(authorization.parentDocumentId))
    ) return null;
    const registration = await currentRegisteredMirrorFrame({
      tabId,
      frameId,
      documentId,
      frameUrl,
      parentDocumentId: authorization.parentDocumentId,
      frameBindingId: authorization.frameBindingId
    });
    if (!registration) return null;
    return {
      tabId,
      frameId,
      documentId,
      frameUrl,
      profileId: "grokMirror",
      routeBound: true,
      frameBindingId: registration.frameBindingId,
      registrationToken: registration.registrationToken,
      parentDocumentId: authorization.parentDocumentId
    };
  }

  async function repairMirrorLoginNavigation(details, token, authorization, expiresAt) {
    if (
      !/^gt-[0-9a-f]{32}$/.test(token)
      || !Number.isFinite(Number(expiresAt))
      || Date.now() >= Number(expiresAt)
    ) return false;
    const frameTarget = await mirrorFrameTargetForNavigation(details, authorization);
    if (!frameTarget || typeof api.cookies?.getPartitionKey !== "function") return false;
    let discoveredPartitionKey;
    try {
      discoveredPartitionKey = await embeddedFramePartitionKey(
        frameTarget.tabId,
        frameTarget.frameId,
        frameTarget.documentId,
        "grokMirror"
      );
    } catch {
      return false;
    }
    if (!partitionCandidateId(discoveredPartitionKey)) return false;
    const storeId = await cookieStoreIdForTab(api, frameTarget.tabId);
    const capability = await partitionCookieCapability(
      storeId,
      "grokMirror",
      discoveredPartitionKey
    );
    let result;
    if (capability.mode === "unsupported") {
      const revalidate = () => Date.now() < Number(expiresAt)
        && currentGrokPartitionTarget(frameTarget, discoveredPartitionKey, storeId);
      result = await withGrokMirrorPartitionCookieBackend(api, {
        tabId: frameTarget.tabId,
        partitionKey: discoveredPartitionKey,
        revalidate,
        withTabDebugger
      }, (partitionCookieBackend) => setGrokMirrorLoginCookie(api, {
        token,
        storeId,
        partitionKey: discoveredPartitionKey,
        partitionCookieBackend
      }));
    } else {
      const revalidate = () => Date.now() < Number(expiresAt)
        && currentGrokPartitionTarget(frameTarget, discoveredPartitionKey, storeId);
      const partitionCookieBackend = revalidatingNativePartitionBackend(revalidate);
      result = await setGrokMirrorLoginCookie(api, {
        token,
        storeId,
        partitionKey: capability.partitionKey,
        partitionCookieBackend
      });
    }
    if (result?.changed) await refreshChangedGrokFrame(frameTarget);
    return result?.changed === true;
  }

  function handleBeforeNavigate(details = {}) {
    const randomAttempt = activeMirrorRandomLogins.get(details.tabId);
    if (randomAttempt && details.frameId === 0) {
      randomAttempt.abort();
      activeMirrorRandomLogins.delete(details.tabId);
      return false;
    }
    const randomNavigation = mirrorRandomLoginNavigation(details);
    if (randomAttempt) {
      if (randomNavigation && details.frameId !== randomAttempt.frameId) randomAttempt.abort();
      if (details.frameId === randomAttempt.frameId) {
        const transition = details.parentFrameId === 0
          ? mirrorRandomLoginTransitionKind(randomAttempt, details.url)
          : "";
        if (transition === "random-login") {
          randomAttempt.randomNavigationSeen = true;
          return true;
        }
        if (!randomAttempt.randomNavigationSeen || !["landing", "unauthorized", "recovery", "rejected"].includes(transition)) {
          randomAttempt.abort();
        } else if (["unauthorized", "recovery", "rejected"].includes(transition)) {
          return true;
        }
      }
    }
    if (randomNavigation) return true;
    const login = mirrorLoginNavigation(details);
    if (!login) return false;
    const key = mirrorLoginNavigationKey(details.tabId, details.frameId);
    if (login.token) rememberMirrorLoginNavigation(details, login.token);
    else {
      const pending = key ? pendingMirrorLoginNavigations.get(key) : null;
      if (pending) pending.takeToken();
      if (key) pendingMirrorLoginNavigations.delete(key);
    }
    return true;
  }

  function handleCommittedNavigation(details = {}) {
    const randomAttempt = activeMirrorRandomLogins.get(details.tabId);
    if (randomAttempt && details.frameId === 0) {
      randomAttempt.abort();
      activeMirrorRandomLogins.delete(details.tabId);
      return false;
    }
    const randomNavigation = mirrorRandomLoginNavigation(details);
    if (randomAttempt) {
      if (randomNavigation && details.frameId !== randomAttempt.frameId) randomAttempt.abort();
      if (details.frameId === randomAttempt.frameId) {
        const transition = details.parentFrameId === 0
          ? mirrorRandomLoginTransitionKind(randomAttempt, details.url)
          : "";
        if (transition === "random-login") {
          randomAttempt.randomNavigationSeen = true;
          return true;
        }
        if (!randomAttempt.randomNavigationSeen || !["landing", "unauthorized", "recovery", "rejected"].includes(transition)) {
          randomAttempt.abort();
        } else if (["unauthorized", "recovery", "rejected"].includes(transition)) {
          return true;
        }
      }
    }
    if (randomNavigation) return true;
    const login = mirrorLoginNavigation(details);
    if (login) return true;
    const key = mirrorLoginNavigationKey(details.tabId, details.frameId);
    const pending = key ? pendingMirrorLoginNavigations.get(key) : null;
    if (!pending) return false;
    pendingMirrorLoginNavigations.delete(key);
    const exactLanding = String(details.url || "") === MIRROR_RANDOM_LOGIN_LANDING_URL;
    const committedParentDocumentId = String(details.parentDocumentId || "");
    if (
      pending.expiresAt < Date.now()
      || details.parentFrameId !== 0
      || !exactLanding
    ) {
      pending.takeToken();
      return false;
    }
    pending.authorization.then((authorization) => {
      const token = pending.takeToken();
      if (
        !token
        || !authorization
        || Date.now() >= pending.expiresAt
        || (committedParentDocumentId
          && committedParentDocumentId !== String(authorization.parentDocumentId || ""))
      ) return false;
      return queue(() => repairMirrorLoginNavigation(
        details,
        token,
        authorization,
        pending.expiresAt
      ));
    }).catch(() => {});
    return false;
  }

  function handleNavigationError(details = {}) {
    const attempt = activeMirrorRandomLogins.get(details.tabId);
    if (attempt && details.frameId === attempt.frameId) {
      const transition = details.parentFrameId === 0
        ? mirrorRandomLoginTransitionKind(attempt, details.url)
        : "";
      const expectedRedirectAbort = String(details.error || "") === "net::ERR_ABORTED"
        && ["original", "random-login", "landing", "unauthorized", "recovery", "rejected"].includes(transition);
      if (!expectedRedirectAbort) attempt.abort();
    }
    const key = mirrorLoginNavigationKey(details.tabId, details.frameId);
    const pending = key ? pendingMirrorLoginNavigations.get(key) : null;
    const expectedLoginRedirectAbort = Boolean(
      pending
      && String(details.error || "") === "net::ERR_ABORTED"
      && mirrorLoginNavigation(details)
    );
    if (!expectedLoginRedirectAbort) {
      if (pending) pending.takeToken();
      if (key) pendingMirrorLoginNavigations.delete(key);
    }
  }

  async function refreshChangedGrokFrame(target = {}) {
    if (typeof api.scripting?.executeScript !== "function") return false;
    if (!await currentGrokFrame(target)) return false;
    try {
      await api.scripting.executeScript({
        target: { tabId: target.tabId, documentIds: [String(target.documentId)] },
        func: reloadCurrentGrokFrame
      });
      return true;
    } catch {
      return false;
    }
  }

  async function currentMirrorTransitionTarget(attempt, options = {}) {
    const tabId = attempt?.tabId;
    const frameId = attempt?.frameId;
    if (!Number.isInteger(tabId) || !Number.isInteger(frameId) || frameId <= 0) return null;
    let frame;
    try {
      frame = await api.webNavigation.getFrame({ tabId, frameId });
    } catch {
      return null;
    }
    const documentId = String(frame?.documentId || "");
    const frameParentDocumentId = String(frame?.parentDocumentId || "");
    const frameUrl = documentId ? await exactDocumentHref(tabId, documentId) : "";
    const transition = mirrorRandomLoginTransitionKind(attempt, frameUrl);
    if (
      !frame
      || frame.parentFrameId !== 0
      || !documentId
      || grokCookieProfileIdForUrl(String(frame?.url || "")) !== "grokMirror"
      || grokCookieProfileIdForUrl(frameUrl) !== "grokMirror"
      || !String(attempt.parentDocumentId || "")
      || frameParentDocumentId !== String(attempt.parentDocumentId)
      || (Array.isArray(options.transitions) && !options.transitions.includes(transition))
      || (transition === "original" && documentId !== String(attempt.originalDocumentId || ""))
      || (options.newDocument === true && documentId === String(attempt.originalDocumentId || ""))
    ) return null;
    let cookieContext;
    let storeId;
    try {
      [cookieContext, storeId] = await Promise.all([
        embeddedFrameCookieContext(tabId, frameId, documentId, "grokMirror"),
        cookieStoreIdForTab(api, tabId)
      ]);
    } catch {
      return null;
    }
    if (
      !cookieContext
      || cookieContext.mode !== attempt.cookieContextMode
      || (
        cookieContext.mode === "partitioned"
        && partitionCandidateId(cookieContext.partitionKey) !== partitionCandidateId(attempt.partitionKey)
      )
      || String(storeId || "") !== String(attempt.storeId || "")
      || !await currentMirrorRandomLoginParent(attempt, {
        documentId,
        frameUrl,
        requireOriginalRegistration: transition === "original"
      })
    ) return null;
    return {
      tabId,
      frameId,
      documentId,
      frameUrl,
      profileId: "grokMirror",
      cookieContextMode: cookieContext.mode,
      partitionKey: cookieContext.partitionKey,
      storeId,
      transition
    };
  }

  async function currentMirrorRandomLoginTarget(attempt, options = {}) {
    if (!attempt?.randomNavigationSeen || attempt.signal.aborted) return null;
    return currentMirrorTransitionTarget(attempt, {
      ...options,
      transitions: ["original", "random-login", "landing", "unauthorized", "recovery", "rejected"]
    });
  }

  function revalidatingNativePartitionBackend(revalidate) {
    return Object.freeze({
      async get(cookieDetails) {
        if (!await revalidate()) throw new Error("Grok Mirror login frame changed");
        return api.cookies.get(cookieDetails);
      },
      async set(cookieDetails) {
        if (!await revalidate()) throw new Error("Grok Mirror login frame changed");
        const installed = await api.cookies.set(cookieDetails);
        if (!await revalidate()) throw new Error("Grok Mirror login frame changed");
        return installed;
      },
      async remove(cookieDetails) {
        if (!await revalidate()) throw new Error("Grok Mirror login frame changed");
        const removed = await api.cookies.remove(cookieDetails);
        if (!await revalidate()) throw new Error("Grok Mirror login frame changed");
        return removed;
      }
    });
  }

  async function installCapturedMirrorRandomLogin(attempt, token, sendCommand) {
    if (!/^random-[A-Za-z0-9]{32}$/.test(String(token || ""))) return false;
    if (!await currentMirrorRandomLoginTarget(attempt)) return false;
    const revalidate = async () => Boolean(await currentMirrorRandomLoginTarget(attempt));
    const capability = await partitionCookieCapability(
      attempt.storeId,
      "grokMirror",
      attempt.partitionKey
    );
    const partitionCookieBackend = capability.mode === "unsupported"
      ? createGrokMirrorPartitionCookieBackend({
        partitionKey: attempt.partitionKey,
        revalidate,
        sendCommand
      })
      : revalidatingNativePartitionBackend(revalidate);
    const result = await setGrokMirrorLoginCookie(api, {
      token,
      storeId: attempt.storeId,
      partitionKey: capability.mode === "unsupported" ? attempt.partitionKey : capability.partitionKey,
      partitionCookieBackend
    });
    if (attempt.signal.aborted || !result || !await revalidate()) return false;
    attempt.installVerified = true;
    return true;
  }

  function sameMirrorRandomLoginTarget(left, right) {
    return Boolean(
      left
      && right
      && left.tabId === right.tabId
      && left.frameId === right.frameId
      && left.documentId === right.documentId
      && left.frameUrl === right.frameUrl
      && left.transition === right.transition
      && left.cookieContextMode === right.cookieContextMode
      && String(left.storeId || "") === String(right.storeId || "")
      && partitionCandidateId(left.partitionKey) === partitionCandidateId(right.partitionKey)
    );
  }

  async function probeMirrorRandomLoginReadiness(attempt, target) {
    if (
      !attempt.installVerified
      || target?.transition !== "landing"
      || typeof api.scripting?.executeScript !== "function"
      || !await currentMirrorRandomLoginParent(attempt, {
        documentId: target.documentId,
        frameUrl: target.frameUrl
      })
    ) return "unavailable";
    const remainingMs = Math.floor(Number(attempt.deadline || 0) - Date.now());
    const timeoutMs = Math.min(
      MIRROR_RANDOM_LOGIN_WEBSOCKET_PROBE_MS,
      remainingMs - MIRROR_RANDOM_LOGIN_PROBE_GUARD_MS
    );
    if (timeoutMs < 100) return "unavailable";
    const current = await currentMirrorRandomLoginTarget(attempt, { newDocument: true });
    if (!sameMirrorRandomLoginTarget(current, target)) return "unavailable";
    let results;
    try {
      results = await api.scripting.executeScript({
        target: { tabId: target.tabId, documentIds: [String(target.documentId)] },
        world: "ISOLATED",
        func: probeMirrorRandomLoginWebSocket,
        args: [MIRROR_RANDOM_LOGIN_WEBSOCKET_URL, timeoutMs]
      });
    } catch {
      return "unavailable";
    }
    if (!Array.isArray(results) || results.length !== 1) return "unavailable";
    const result = results[0] || {};
    if (
      result.frameId !== target.frameId
      || (result.documentId && String(result.documentId) !== String(target.documentId))
      || !["open", "error", "close", "timeout", "unavailable"].includes(result.result)
    ) return "unavailable";
    const after = await currentMirrorRandomLoginTarget(attempt, { newDocument: true });
    return sameMirrorRandomLoginTarget(after, target) ? result.result : "unavailable";
  }

  async function runMirrorRandomLoginLandingAction(attempt, target, options = {}) {
    const readinessFailed = options.readinessFailed === true;
    if (
      !attempt.installVerified
      || !["landing", "unauthorized", "recovery", "rejected"].includes(target?.transition)
      || (target.transition === "landing" && !readinessFailed)
      || target.documentId === String(attempt.navigationDocumentId || "")
      || typeof api.scripting?.executeScript !== "function"
      || !await currentMirrorRandomLoginParent(attempt, {
        documentId: target.documentId,
        frameUrl: target.frameUrl
      })
    ) return false;
    const current = await currentMirrorRandomLoginTarget(attempt, { newDocument: true });
    if (
      !current
      || current.documentId !== target.documentId
      || current.frameUrl !== target.frameUrl
      || current.transition !== target.transition
      || !await currentMirrorRandomLoginParent(attempt, {
        documentId: target.documentId,
        frameUrl: target.frameUrl
      })
    ) return false;
    if (Number(attempt.accountRecoveryCount || 0) >= MIRROR_RANDOM_LOGIN_MAX_ACCOUNT_RECOVERIES) {
      return false;
    }
    attempt.accountRecoveryCount = Number(attempt.accountRecoveryCount || 0) + 1;
    attempt.navigationDocumentId = target.documentId;
    try {
      const results = await api.scripting.executeScript({
        target: { tabId: target.tabId, documentIds: [String(target.documentId)] },
        func: target.transition === "landing"
          ? reloadMirrorRandomLoginLanding
          : recoverMirrorRandomLoginLanding
      });
      return Array.isArray(results)
        && results.length === 1
        && results[0]?.result === true;
    } catch {
      return false;
    }
  }

  async function settleMirrorRandomLogin(attempt) {
    while (!attempt.signal.aborted && Date.now() < attempt.deadline) {
      const target = await currentMirrorRandomLoginTarget(attempt, { newDocument: true });
      if (!target || !["landing", "unauthorized", "recovery", "rejected"].includes(target.transition)) {
        await new Promise((resolve) => { setTimeout(resolve, 40); });
        continue;
      }
      if (target.documentId !== String(attempt.navigationDocumentId || "")) {
        if (target.transition === "landing") {
          const readiness = await probeMirrorRandomLoginReadiness(attempt, target);
          if (readiness === "open") return true;
          if (!["error", "close", "timeout"].includes(readiness)) return false;
          if (!await runMirrorRandomLoginLandingAction(attempt, target, {
            readinessFailed: true
          })) return false;
        } else if (!await runMirrorRandomLoginLandingAction(attempt, target)) {
          return false;
        }
      }
      await new Promise((resolve) => { setTimeout(resolve, 40); });
    }
    return false;
  }

  async function armMirrorRandomLogin(message = {}, sender = {}) {
    if (message.bridgeVersion !== GROK_COOKIE_BRIDGE_VERSION) {
      throw new Error("Grok Cookie bridge version is stale");
    }
    let frame = await verifiedFrameSender(sender);
    if (
      frame.profileId !== "grokMirror"
      || typeof api.cookies?.getPartitionKey !== "function"
      || !chromiumExtensionPartitionKey(api.runtime)
    ) {
      return { armed: false, proceed: true };
    }
    try {
      frame = await verifiedRegisteredMirrorFrameSender(sender);
    } catch {
      return { armed: false, proceed: false };
    }
    const existingAttempt = activeMirrorRandomLogins.get(frame.tabId);
    if (existingAttempt) {
      existingAttempt.abort();
      activeMirrorRandomLogins.delete(frame.tabId);
      return { armed: false, proceed: false };
    }
    let cookieContext;
    let storeId;
    try {
      [cookieContext, storeId] = await Promise.all([
        embeddedFrameCookieContext(frame.tabId, frame.frameId, frame.documentId, frame.profileId),
        cookieStoreIdForTab(api, frame.tabId)
      ]);
    } catch {
      return { armed: false, proceed: false };
    }
    const parentDocumentId = String(frame.parentDocumentId || "");
    if (!parentDocumentId) return { armed: false, proceed: false };
    if (cookieContext?.mode === "first-party") {
      const controller = new AbortController();
      const attempt = {
        tabId: frame.tabId,
        frameId: frame.frameId,
        originalDocumentId: frame.documentId,
        originalFrameUrl: frame.frameUrl,
        parentDocumentId,
        registrationToken: frame.registrationToken,
        frameBindingId: frame.frameBindingId,
        cookieContextMode: "first-party",
        partitionKey: null,
        storeId,
        signal: controller.signal,
        deadline: Date.now() + MIRROR_RANDOM_LOGIN_CAPTURE_MS,
        randomNavigationSeen: false,
        installVerified: true,
        accountRecoveryCount: 0,
        navigationDocumentId: "",
        abort() { controller.abort(); }
      };
      if (
        !await currentGrokFirstPartyTarget(frame, storeId)
        || !await currentMirrorRandomLoginParent(attempt, {
          requireOriginalRegistration: true
        })
      ) {
        attempt.abort();
        return { armed: false, proceed: false };
      }
      activeMirrorRandomLogins.set(frame.tabId, attempt);
      const abortTimer = setTimeout(() => attempt.abort(), MIRROR_RANDOM_LOGIN_CAPTURE_MS);
      settleMirrorRandomLogin(attempt)
        .catch(() => false)
        .finally(() => {
          clearTimeout(abortTimer);
          attempt.abort();
          if (activeMirrorRandomLogins.get(frame.tabId) === attempt) {
            activeMirrorRandomLogins.delete(frame.tabId);
          }
        });
      return { armed: true, proceed: true };
    }
    const partitionKey = cookieContext?.mode === "partitioned" ? cookieContext.partitionKey : null;
    if (!partitionCandidateId(partitionKey)) return { armed: false, proceed: false };
    const controller = new AbortController();
    const deadline = Date.now() + MIRROR_RANDOM_LOGIN_CAPTURE_MS;
    let resolveArmed;
    let armedSettled = false;
    const armedPromise = new Promise((resolve) => { resolveArmed = resolve; });
    const settleArmed = (value) => {
      if (armedSettled) return;
      armedSettled = true;
      resolveArmed(Boolean(value));
    };
    const attempt = {
      tabId: frame.tabId,
      frameId: frame.frameId,
      originalDocumentId: frame.documentId,
      originalFrameUrl: frame.frameUrl,
      parentDocumentId,
      registrationToken: frame.registrationToken,
      frameBindingId: frame.frameBindingId,
      cookieContextMode: "partitioned",
      partitionKey,
      storeId,
      signal: controller.signal,
      deadline,
      randomNavigationSeen: false,
      installVerified: false,
      accountRecoveryCount: 0,
      navigationDocumentId: "",
      abort() {
        controller.abort();
        settleArmed(false);
      }
    };
    const currentOriginalTarget = async () => Boolean(
      await currentGrokPartitionTarget(frame, partitionKey, storeId)
      && await currentMirrorRandomLoginParent(attempt, {
        requireOriginalRegistration: true
      })
    );
    if (!await currentOriginalTarget()) {
      attempt.abort();
      return { armed: false, proceed: false };
    }
    activeMirrorRandomLogins.set(frame.tabId, attempt);
    const abortTimer = setTimeout(() => attempt.abort(), MIRROR_RANDOM_LOGIN_CAPTURE_MS);
    let nativeProceedAfterCaptureFailure = false;
    captureGrokMirrorRandomLoginCookie(api, {
      tabId: frame.tabId,
      timeoutMs: MIRROR_RANDOM_LOGIN_COOKIE_CAPTURE_MS,
      signal: controller.signal,
      withTabDebugger,
      frameUrl: frame.frameUrl,
      frameBindingId: frame.frameBindingId,
      revalidateBefore: currentOriginalTarget,
      revalidateAfter: async () => Boolean(await currentMirrorRandomLoginTarget(attempt)),
      onArmed: async () => {
        if (!await currentOriginalTarget()) throw new Error("Grok Mirror account-switch frame changed");
        settleArmed(true);
      }
    }, ({ token, sendCommand }) => installCapturedMirrorRandomLogin(attempt, token, sendCommand))
      .then((captured) => captured === true && settleMirrorRandomLogin(attempt))
      .catch(async () => {
        if (
          !armedSettled
          && !attempt.signal.aborted
          && activeMirrorRandomLogins.get(frame.tabId) === attempt
        ) {
          try {
            const originalTargetStillCurrent = await currentOriginalTarget();
            nativeProceedAfterCaptureFailure = Boolean(
              originalTargetStillCurrent
              && !armedSettled
              && !attempt.signal.aborted
              && activeMirrorRandomLogins.get(frame.tabId) === attempt
            );
          } catch {
            nativeProceedAfterCaptureFailure = false;
          }
        }
        return false;
      })
      .finally(() => {
        clearTimeout(abortTimer);
        attempt.abort();
        if (activeMirrorRandomLogins.get(frame.tabId) === attempt) {
          activeMirrorRandomLogins.delete(frame.tabId);
        }
      });
    const armed = await armedPromise;
    return {
      armed,
      proceed: armed || nativeProceedAfterCaptureFailure
    };
  }

  async function syncAtPartition(storeId, partitionKey, options = {}) {
    const revalidate = typeof options.revalidate === "function" ? options.revalidate : null;
    if (revalidate && await revalidate() !== true) {
      throw new Error("Grok Cookie bridge frame changed");
    }
    const cleanup = options.authoritative
      ? await removeManagedGrokPartitionsExcept(api, { storeId, partitionKey, revalidate })
      : { changed: false, removed: 0 };
    if (revalidate && await revalidate() !== true) {
      throw new Error("Grok Cookie bridge frame changed");
    }
    const profileOptions = options.frameUrl
      ? { frameUrl: options.frameUrl }
      : options.profileId
        ? { profileId: options.profileId }
        : null;
    const backendOptions = options.partitionCookieBackend
      ? { partitionCookieBackend: options.partitionCookieBackend }
      : {};
    const synced = profileOptions
      ? await syncGrokSessionCookies(api, { storeId, partitionKey, ...profileOptions, ...backendOptions })
      : await syncGrokSessionCookies(api, { storeId, partitionKey, ...backendOptions });
    return publicResult({
      supported: true,
      changed: cleanup.changed || synced.changed,
      created: synced.created,
      updated: synced.updated,
      removed: Number(cleanup.removed || 0) + Number(synced.removed || 0),
      skipped: synced.skipped
    });
  }

  async function syncAtAvailablePartition(storeId, discoveredPartitionKey, options = {}) {
    const profileId = options.profileId || grokCookieProfileIdForUrl(options.frameUrl);
    const capability = await partitionCookieCapability(
      storeId,
      profileId,
      discoveredPartitionKey
    );
    const frameTarget = options.frameTarget;
    if (capability.mode !== "unsupported") {
      if (!frameTarget) return syncAtPartition(storeId, capability.partitionKey, options);
      const revalidate = () => currentGrokPartitionTarget(
        frameTarget,
        discoveredPartitionKey,
        storeId
      );
      if (!await revalidate()) throw new Error("Grok Cookie bridge frame changed");
      return syncAtPartition(storeId, capability.partitionKey, {
        ...options,
        revalidate,
        partitionCookieBackend: revalidatingNativePartitionBackend(revalidate)
      });
    }
    if (profileId !== "grokMirror" || !frameTarget) return publicResult();
    const revalidate = () => currentGrokPartitionTarget(frameTarget, discoveredPartitionKey, storeId);
    if (!await revalidate()) throw new Error("Grok Cookie bridge frame changed");
    return withGrokMirrorPartitionCookieBackend(api, {
      tabId: frameTarget.tabId,
      partitionKey: discoveredPartitionKey,
      revalidate,
      withTabDebugger
    }, async (partitionCookieBackend, sendCommand) => {
      const cleanup = options.authoritative
        ? await removeManagedGrokPartitionsExcept(api, {
            storeId,
            partitionKey: discoveredPartitionKey,
            revalidate,
            partitionCookieBackendForEntry: (entry) => createGrokManagedPartitionCookieBackend({
              partitionKey: entry.partitionKey,
              revalidate,
              sendCommand
            })
          })
        : { changed: false, removed: 0 };
      const synced = await syncGrokSessionCookies(api, {
        storeId,
        partitionKey: discoveredPartitionKey,
        profileId,
        partitionCookieBackend
      });
      return publicResult({
        supported: true,
        changed: cleanup.changed || synced.changed,
        created: synced.created,
        updated: synced.updated,
        removed: Number(cleanup.removed || 0) + Number(synced.removed || 0),
        skipped: synced.skipped
      });
    });
  }

  async function prepareSessionCookies(url, sender = {}) {
    const tabId = verifiedExtensionPageSender(sender);
    const profileId = grokCookieProfileIdForUrl(url);
    if (!profileId || !isGrokSessionUrl(url)) return publicResult();
    const partitionKey = chromiumExtensionPartitionKey(api.runtime);
    if (!partitionKey || !api.cookies?.get || !api.cookies?.set) return publicResult();
    const storeId = await cookieStoreIdForTab(api, tabId);
    return queue(async () => {
      try {
        return await syncAtAvailablePartition(storeId, partitionKey, { frameUrl: url, profileId });
      } catch {
        return publicResult();
      }
    });
  }

  async function verifiedFrameSender(sender = {}) {
    const tabId = sender?.tab?.id;
    const frameId = sender?.frameId;
    const senderUrl = String(sender?.url || "");
    const extensionBase = api.runtime.getURL("");
    if (
      (sender?.id && sender.id !== api.runtime.id)
      || !Number.isInteger(tabId)
      || !Number.isInteger(frameId)
      || frameId <= 0
      || !isGrokSessionUrl(senderUrl)
      || !String(sender?.tab?.url || "").startsWith(extensionBase)
    ) throw new Error("Grok Cookie bridge sender is invalid");
    const frame = await api.webNavigation.getFrame({ tabId, frameId });
    const senderDocumentId = String(sender?.documentId || "");
    const frameDocumentId = String(frame?.documentId || "");
    const parentDocumentId = String(frame?.parentDocumentId || "");
    const documentId = senderDocumentId;
    const navigationFrameUrl = String(frame?.url || "");
    const profileId = grokCookieProfileIdForUrl(senderUrl);
    if (
      !frame
      || frame.parentFrameId !== 0
      || !senderDocumentId
      || !frameDocumentId
      || !documentId
      || grokCookieProfileIdForUrl(navigationFrameUrl) !== profileId
      || senderDocumentId !== frameDocumentId
    ) {
      throw new Error("Grok Cookie bridge document changed");
    }
    if (await exactDocumentHref(tabId, documentId) !== senderUrl) {
      throw new Error("Grok Cookie bridge frame changed");
    }
    return {
      tabId,
      frameId,
      documentId,
      parentDocumentId,
      frameUrl: senderUrl,
      profileId,
      routeBound: true
    };
  }

  async function verifiedRegisteredMirrorFrameSender(sender = {}) {
    const frame = await verifiedFrameSender(sender);
    if (frame.profileId !== "grokMirror") return frame;
    const registration = await currentRegisteredMirrorFrame(frame);
    if (!registration) {
      throw new Error("Grok Mirror account-switch frame is not securely registered");
    }
    return {
      ...frame,
      registrationToken: registration.registrationToken,
      frameBindingId: registration.frameBindingId
    };
  }

  async function syncForFrame(sender = {}) {
    const frame = await verifiedFrameSender(sender);
    if (typeof api.cookies?.getPartitionKey !== "function") {
      const unsupported = await queue(() => publicResult());
      return { ...unsupported, profileId: frame.profileId };
    }
    const partitionKey = await embeddedFramePartitionKey(
      frame.tabId,
      frame.frameId,
      frame.documentId,
      frame.profileId
    );
    if (!partitionCandidateId(partitionKey)) {
      return { ...publicResult(), profileId: frame.profileId };
    }
    const storeId = await cookieStoreIdForTab(api, frame.tabId);
    const result = await queue(() => syncAtAvailablePartition(storeId, partitionKey, {
      authoritative: true,
      frameUrl: frame.frameUrl,
      profileId: frame.profileId,
      frameTarget: { ...frame, partitionKey }
    }));
    return { ...result, profileId: frame.profileId };
  }

  function scheduleSourceCookieSync(changeInfo = {}) {
    const storeId = String(changeInfo.cookie?.storeId || "");
    const profileId = grokCookieProfileIdForCookie(changeInfo.cookie);
    if (!profileId) return;
    const timerKey = `${storeId || "default"}:${profileId}`;
    const changedAuthCookies = sourceChangedAuthCookies.get(timerKey) || new Map();
    if (!changeInfo.removed) {
      changedAuthCookies.set(changeInfo.cookie.name, changeInfo.cookie);
    }
    sourceChangedAuthCookies.set(timerKey, changedAuthCookies);
    const previous = sourceChangeTimers.get(timerKey);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      sourceChangeTimers.delete(timerKey);
      sourceChangedAuthCookies.delete(timerKey);
      queue(async () => {
        const managedCandidates = await managedGrokPartitionKeys(api, storeId, { profileId });
        let activeTargets = [];
        try { activeTargets = await activeFramePartitionTargets(storeId, profileId); } catch {}
        const candidates = new Map();
        for (const partitionKey of managedCandidates) {
          const id = partitionCandidateId(partitionKey);
          if (id) candidates.set(id, { partitionKey, frames: [] });
        }
        for (const target of activeTargets) {
          const id = partitionCandidateId(target.partitionKey);
          if (!id) continue;
          const candidate = candidates.get(id) || { partitionKey: target.partitionKey, frames: [] };
          candidate.frames.push(target);
          candidates.set(id, candidate);
        }
        await clearGrokTombstonesForStore(api, storeId, [...changedAuthCookies.values()]);
        for (const candidate of candidates.values()) {
          try {
            let result = await syncAtAvailablePartition(storeId, candidate.partitionKey, {
              profileId,
              frameTarget: candidate.frames[0] || null
            });
            if (!candidate.frames[0] && result.supported !== true) {
              result = await syncManagedPartitionAtExtensionAnchor(
                storeId,
                candidate.partitionKey,
                profileId
              );
            }
            if (!result.changed) continue;
            await Promise.all(candidate.frames.map((frame) => refreshChangedGrokFrame(frame)));
          } catch {}
        }
      }).catch(() => {});
    }, 220);
    sourceChangeTimers.set(timerKey, timer);
  }

  function handleCookieChange(changeInfo) {
    if (isUnpartitionedGrokSourceChange(changeInfo)) {
      scheduleSourceCookieSync(changeInfo);
      return;
    }
    if (!isPartitionedGrokTargetChange(changeInfo) || grokCookieChangeOwnedByBridge(changeInfo)) return;
    queue(() => releaseChangedGrokPartition(api, changeInfo)).catch(() => {});
  }

  function handleTabRemoved(tabId) {
    for (const key of fallbackReloadCounts.keys()) {
      if (key.startsWith(`${tabId}:`)) fallbackReloadCounts.delete(key);
    }
    for (const [id, preflight] of framePreflights) {
      if (preflight.tabId === tabId) framePreflights.delete(id);
    }
    for (const [key, pending] of pendingMirrorLoginNavigations) {
      if (!key.startsWith(`${tabId}:`)) continue;
      pending.takeToken();
      pendingMirrorLoginNavigations.delete(key);
    }
    const randomLogin = activeMirrorRandomLogins.get(tabId);
    if (randomLogin) {
      randomLogin.abort();
      activeMirrorRandomLogins.delete(tabId);
    }
  }

  async function removeAllManagedPartitions(tabId) {
    return queue(async () => {
      try {
        return await removeAllManagedGrokPartitions(api);
      } catch (nativeError) {
        if (!Number.isInteger(tabId) || typeof withTabDebugger !== "function") throw nativeError;
        const storeId = await cookieStoreIdForTab(api, tabId);
        const revalidate = async () => {
          if (!await currentExtensionTopFrame(tabId)) return false;
          try { return await cookieStoreIdForTab(api, tabId) === storeId; } catch { return false; }
        };
        if (!await revalidate()) throw nativeError;
        return withTabDebugger(tabId, async ({ sendCommand }) => {
          if (!await revalidate()) throw new Error("Grok Cookie cleanup tab changed");
          await sendCommand("Network.enable", {});
          return removeAllManagedGrokPartitions(api, {
            partitionCookieBackendForEntry: (entry) => {
              if (entry.storeId !== storeId) {
                throw new Error("Grok Cookie cleanup store is unavailable");
              }
              return createGrokManagedPartitionCookieBackend({
                partitionKey: entry.partitionKey,
                revalidate,
                sendCommand
              });
            }
          });
        });
      }
    });
  }

  function requestHandlers(request, deps = {}) {
    if (typeof deps.updateDnrRules !== "function") {
      throw new TypeError("Grok Cookie request handlers require updateDnrRules");
    }
    return [
      [request.PREPARE_FRAME_LOAD, async (message, sender) => {
        const tabId = verifiedExtensionPageSender(sender);
        const id = registerFramePreflight(message, sender);
        try {
          const cookieBridge = prepareSessionCookies(message.url, sender).catch(() => publicResult());
          await deps.updateDnrRules(tabId, message, sender);
          return { grokCookieBridge: await cookieBridge };
        } finally {
          finishFramePreflight(id);
        }
      }],
      [request.MARK_GROK_FRAME_PREFLIGHT_FALLBACK, (message, sender) => ({
        marked: markFramePreflightFallback(message, sender)
      })],
      [request.SYNC_GROK_SESSION_COOKIES, async (message, sender) => {
        if (message.bridgeVersion !== GROK_COOKIE_BRIDGE_VERSION) throw new Error("Grok Cookie bridge version is stale");
        const result = await syncForFrame(sender);
        const fallbackReload = consumeFallbackReload(sender?.tab?.id, result.profileId);
        return { ...publicResult(result), reloadRequired: result.changed === true || fallbackReload };
      }],
      [request.ARM_GROK_MIRROR_ACCOUNT_SWITCH, (message, sender) => armMirrorRandomLogin(message, sender)]
    ];
  }

  return Object.freeze({
    handleCookieChange,
    handleBeforeNavigate,
    handleCommittedNavigation,
    handleNavigationError,
    handleTabRemoved,
    removeAllManagedPartitions,
    requestHandlers,
    verifiedFrameSender
  });
}
