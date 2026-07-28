const MIRROR_HOST = "gk.dairoot.cn";
const MIRROR_COOKIE_NAME = "user-gateway-token";
const MIRROR_RANDOM_LOGIN_URL = `https://${MIRROR_HOST}/api/random-login`;
const MIRROR_RANDOM_TOKEN_PATTERN = /^random-[A-Za-z0-9]{32}$/;
const MIRROR_FRAME_BINDING_ATTRIBUTE = "data-frame-binding-id";
const MIRROR_FRAME_BINDING_PATTERN = /^[a-f0-9]{64}$/;
const MANAGED_GROK_COOKIE_HOSTS = Object.freeze({
  sso: "grok.com",
  "sso-rw": "grok.com",
  grok_device_id: "grok.com",
  "user-gateway-token": MIRROR_HOST
});

function normalizedDomain(value) {
  return String(value || "").trim().replace(/^\./, "").toLowerCase();
}

function normalizedPartitionKey(value) {
  const topLevelSite = String(value?.topLevelSite || "").replace(/\/+$/, "");
  if (!/^chrome-extension:\/\/[a-p]{32}$/i.test(topLevelSite)) return null;
  if (typeof value?.hasCrossSiteAncestor !== "boolean") return null;
  return { topLevelSite, hasCrossSiteAncestor: value.hasCrossSiteAncestor };
}

function samePartitionKey(left, right) {
  const a = normalizedPartitionKey(left);
  const b = normalizedPartitionKey(right);
  return Boolean(
    a
    && b
    && a.topLevelSite === b.topLevelSite
    && a.hasCrossSiteAncestor === b.hasCrossSiteAncestor
  );
}

function mirrorUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    if (
      parsed.protocol !== "https:"
      || parsed.hostname.toLowerCase() !== MIRROR_HOST
      || parsed.username
      || parsed.password
      || parsed.port
    ) return "";
    return `https://${MIRROR_HOST}${parsed.pathname.startsWith("/") ? parsed.pathname : `/${parsed.pathname}`}`;
  } catch {
    return "";
  }
}

function exactMirrorDocumentUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    if (
      parsed.protocol !== "https:"
      || parsed.hostname.toLowerCase() !== MIRROR_HOST
      || parsed.username
      || parsed.password
      || parsed.port
    ) return "";
    return parsed.href;
  } catch {
    return "";
  }
}

function cdpMirrorFrameUrl(frame = {}) {
  try {
    const parsed = new URL(String(frame.url || ""));
    const fragment = String(frame.urlFragment || "");
    if (fragment) parsed.hash = fragment.startsWith("#") ? fragment : `#${fragment}`;
    return exactMirrorDocumentUrl(parsed.href);
  } catch {
    return "";
  }
}

function checkedDetails(details, expectedPartitionKey) {
  const url = mirrorUrl(details?.url);
  if (
    !url
    || String(details?.name || "") !== MIRROR_COOKIE_NAME
    || !samePartitionKey(details?.partitionKey, expectedPartitionKey)
  ) throw new Error("Grok Mirror debugger Cookie target is invalid");
  return { ...details, url, partitionKey: normalizedPartitionKey(expectedPartitionKey) };
}

function checkedManagedCleanupDetails(details, expectedPartitionKey) {
  const name = String(details?.name || "");
  const host = MANAGED_GROK_COOKIE_HOSTS[name] || "";
  let parsed;
  try { parsed = new URL(String(details?.url || "")); } catch { parsed = null; }
  if (
    !host
    || !parsed
    || parsed.protocol !== "https:"
    || parsed.hostname.toLowerCase() !== host
    || parsed.username
    || parsed.password
    || parsed.port
    || !samePartitionKey(details?.partitionKey, expectedPartitionKey)
  ) throw new Error("Grok debugger Cookie cleanup target is invalid");
  return {
    ...details,
    name,
    url: `https://${host}${parsed.pathname.startsWith("/") ? parsed.pathname : `/${parsed.pathname}`}`,
    partitionKey: normalizedPartitionKey(expectedPartitionKey)
  };
}

function cdpSameSite(value) {
  if (value === "Strict") return "strict";
  if (value === "Lax") return "lax";
  if (value === "None") return "no_restriction";
  return "unspecified";
}

function extensionCookieFromCdp(cookie, expectedPartitionKey) {
  const session = Boolean(cookie?.session);
  return {
    name: String(cookie?.name || ""),
    value: String(cookie?.value || ""),
    domain: String(cookie?.domain || ""),
    hostOnly: !String(cookie?.domain || "").startsWith("."),
    path: String(cookie?.path || "/"),
    secure: cookie?.secure === true,
    httpOnly: cookie?.httpOnly === true,
    sameSite: cdpSameSite(cookie?.sameSite),
    session,
    partitionKey: normalizedPartitionKey(expectedPartitionKey),
    ...(!session && Number.isFinite(Number(cookie?.expires))
      ? { expirationDate: Number(cookie.expires) }
      : {})
  };
}

function cookieMatchesSetDetails(cookie, details, expectedHost = MIRROR_HOST) {
  if (!cookie || cookie.name !== details.name || cookie.value !== details.value) return false;
  if (normalizedDomain(cookie.domain) !== expectedHost) return false;
  if (cookie.hostOnly !== !details.domain) return false;
  if (String(cookie.path || "/") !== String(details.path || "/")) return false;
  if (cookie.secure !== true || cookie.httpOnly !== Boolean(details.httpOnly)) return false;
  if (cookie.sameSite !== "no_restriction") return false;
  const session = details.expirationDate === undefined;
  if (cookie.session !== session) return false;
  if (
    !session
    && (
      !Number.isFinite(Number(cookie.expirationDate))
      || !Number.isFinite(Number(details.expirationDate))
      || Math.abs(Number(cookie.expirationDate) - Number(details.expirationDate)) > 1
    )
  ) return false;
  return true;
}

async function requireCurrentTarget(revalidate) {
  if (typeof revalidate !== "function" || await revalidate() !== true) {
    throw new Error("Grok Mirror debugger Cookie target changed");
  }
}

function debuggerFailure() {
  return new Error("Grok Mirror partition Cookie debugger operation failed");
}

function headerValues(headers, name) {
  const expected = String(name || "").toLowerCase();
  const values = [];
  if (headers && typeof headers === "object" && !Array.isArray(headers)) {
    for (const [key, value] of Object.entries(headers)) {
      if (String(key).toLowerCase() !== expected) continue;
      for (const line of String(value || "").split(/\r?\n/)) {
        if (line.trim()) values.push(line.trim());
      }
    }
  }
  return values;
}

function headerTextValues(headersText, name) {
  const expected = String(name || "").toLowerCase();
  const values = [];
  for (const line of String(headersText || "").split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator <= 0 || line.slice(0, separator).trim().toLowerCase() !== expected) continue;
    const value = line.slice(separator + 1).trim();
    if (value) values.push(value);
  }
  return values;
}

function strictRandomLoginToken(cookieLine) {
  const line = String(cookieLine || "").trim();
  if (!line || /[\r\n]/.test(line)) return "";
  const parts = line.split(";").map((part) => part.trim());
  const first = parts.shift() || "";
  const separator = first.indexOf("=");
  if (separator <= 0 || first.slice(0, separator) !== MIRROR_COOKIE_NAME) return "";
  const token = first.slice(separator + 1);
  if (!MIRROR_RANDOM_TOKEN_PATTERN.test(token)) return "";
  const attributes = new Map();
  for (const part of parts) {
    if (!part) return "";
    const attributeSeparator = part.indexOf("=");
    const key = (attributeSeparator < 0 ? part : part.slice(0, attributeSeparator)).trim().toLowerCase();
    const value = attributeSeparator < 0 ? null : part.slice(attributeSeparator + 1).trim();
    if (!key || attributes.has(key)) return "";
    attributes.set(key, value);
  }
  if (
    attributes.size !== 3
    || attributes.get("path") !== "/"
    || attributes.get("max-age") !== "604800"
    || attributes.get("httponly") !== null
  ) return "";
  return token;
}

function randomLoginTokenEvidence(params = {}) {
  const cookieLines = [...new Set([
    ...headerValues(params.headers, "set-cookie"),
    ...headerTextValues(params.headersText, "set-cookie"),
    ...(Array.isArray(params.blockedCookies)
      ? params.blockedCookies.map((item) => String(item?.cookieLine || "").trim()).filter(Boolean)
      : [])
  ])];
  const matching = cookieLines.filter((line) => String(line).split(";", 1)[0]?.startsWith(`${MIRROR_COOKIE_NAME}=`));
  if (!matching.length) return { seen: false, token: "" };
  const parsedTokens = matching.map(strictRandomLoginToken);
  const tokens = [...new Set(parsedTokens.filter(Boolean))];
  return {
    seen: true,
    token: parsedTokens.every(Boolean) && tokens.length === 1 ? tokens[0] : ""
  };
}

function randomLoginResponseEvidence(response, type = "Document") {
  if (!response || String(response.url || "") !== MIRROR_RANDOM_LOGIN_URL) return null;
  const location = headerValues(response.headers, "location");
  return {
    valid: type === "Document"
      && Number(response.status) === 302
      && location.length === 1
      && location[0] === "/",
    evidence: randomLoginTokenEvidence(response)
  };
}

function randomLoginRequestEvidence(params = {}) {
  const request = params.request;
  if (!request || String(request.url || "") !== MIRROR_RANDOM_LOGIN_URL) return null;
  return {
    valid: params.type === "Document"
      && String(request.method || "").toUpperCase() === "GET"
      && !request.hasPostData
      && request.postData == null
      && Boolean(String(params.loaderId || ""))
      && Boolean(String(params.frameId || ""))
  };
}

function randomLoginRedirectEvidence(params = {}) {
  const response = randomLoginResponseEvidence(params.redirectResponse, params.type);
  if (!response) return null;
  const request = params.request;
  return {
    ...response,
    valid: response.valid
      && String(request?.url || "") === `https://${MIRROR_HOST}/`
      && String(request?.method || "").toUpperCase() === "GET"
      && !request?.hasPostData
      && request?.postData == null
      && Boolean(String(params.loaderId || ""))
      && Boolean(String(params.frameId || ""))
  };
}

export function createGrokMirrorPartitionCookieBackend(options = {}) {
  const partitionKey = normalizedPartitionKey(options.partitionKey);
  const revalidate = options.revalidate;
  const sendCommand = options.sendCommand;
  if (!partitionKey || typeof sendCommand !== "function") {
    throw new Error("Grok Mirror partition Cookie debugger target is unavailable");
  }
  const send = async (method, params = {}) => {
    await requireCurrentTarget(revalidate);
    try {
      return await sendCommand(method, params);
    } catch {
      throw debuggerFailure();
    }
  };

  const backend = Object.freeze({
    async get(rawDetails) {
      const details = checkedDetails(rawDetails, partitionKey);
      const response = await send("Network.getCookies", { urls: [details.url] });
      const matches = (Array.isArray(response?.cookies) ? response.cookies : []).filter((cookie) =>
        cookie?.name === MIRROR_COOKIE_NAME
        && cookie?.partitionKeyOpaque !== true
        && normalizedDomain(cookie?.domain) === MIRROR_HOST
        && String(cookie?.path || "/") === new URL(details.url).pathname
        && samePartitionKey(cookie?.partitionKey, partitionKey)
      );
      if (matches.length > 1) throw new Error("Grok Mirror partition Cookie target is ambiguous");
      return matches[0] ? extensionCookieFromCdp(matches[0], partitionKey) : null;
    },

    async set(rawDetails) {
      const details = checkedDetails(rawDetails, partitionKey);
      if (
        typeof details.value !== "string"
        || details.secure !== true
        || details.sameSite !== "no_restriction"
        || normalizedDomain(details.domain || MIRROR_HOST) !== MIRROR_HOST
      ) throw new Error("Grok Mirror debugger Cookie projection is invalid");
      const params = {
        name: MIRROR_COOKIE_NAME,
        value: details.value,
        url: details.url,
        path: String(details.path || "/"),
        secure: true,
        httpOnly: Boolean(details.httpOnly),
        sameSite: "None",
        partitionKey
      };
      if (details.domain) params.domain = String(details.domain);
      if (details.expirationDate !== undefined) params.expires = Number(details.expirationDate);
      const response = await send("Network.setCookie", params);
      if (response?.success !== true) throw debuggerFailure();
      const stored = await backend.get(details);
      if (!cookieMatchesSetDetails(stored, details)) throw debuggerFailure();
      return stored;
    },

    async remove(rawDetails) {
      const details = checkedDetails(rawDetails, partitionKey);
      const existing = await backend.get(details);
      if (!existing) return null;
      await send("Network.deleteCookies", {
        name: MIRROR_COOKIE_NAME,
        domain: existing.domain,
        path: existing.path,
        partitionKey
      });
      if (await backend.get(details)) throw debuggerFailure();
      return { url: details.url, name: MIRROR_COOKIE_NAME };
    }
  });
  return backend;
}

export function createGrokManagedPartitionCookieBackend(options = {}) {
  const partitionKey = normalizedPartitionKey(options.partitionKey);
  const revalidate = options.revalidate;
  const sendCommand = options.sendCommand;
  if (!partitionKey || typeof sendCommand !== "function") {
    throw new Error("Grok debugger Cookie cleanup target is unavailable");
  }
  const send = async (method, params = {}) => {
    await requireCurrentTarget(revalidate);
    try {
      return await sendCommand(method, params);
    } catch {
      throw debuggerFailure();
    }
  };
  const backend = Object.freeze({
    async get(rawDetails) {
      const details = checkedManagedCleanupDetails(rawDetails, partitionKey);
      const parsed = new URL(details.url);
      const response = await send("Network.getCookies", { urls: [details.url] });
      const matches = (Array.isArray(response?.cookies) ? response.cookies : []).filter((cookie) => (
        cookie?.name === details.name
        && cookie?.partitionKeyOpaque !== true
        && normalizedDomain(cookie?.domain) === parsed.hostname
        && String(cookie?.path || "/") === parsed.pathname
        && samePartitionKey(cookie?.partitionKey, partitionKey)
      ));
      if (matches.length > 1) throw new Error("Grok debugger Cookie cleanup target is ambiguous");
      return matches[0] ? extensionCookieFromCdp(matches[0], partitionKey) : null;
    },
    async set(rawDetails) {
      const details = checkedManagedCleanupDetails(rawDetails, partitionKey);
      const host = MANAGED_GROK_COOKIE_HOSTS[details.name];
      if (
        typeof details.value !== "string"
        || details.secure !== true
        || details.sameSite !== "no_restriction"
        || normalizedDomain(details.domain || host) !== host
      ) throw new Error("Grok debugger Cookie projection is invalid");
      const params = {
        name: details.name,
        value: details.value,
        url: details.url,
        path: String(details.path || "/"),
        secure: true,
        httpOnly: Boolean(details.httpOnly),
        sameSite: "None",
        partitionKey
      };
      if (details.domain) params.domain = String(details.domain);
      if (details.expirationDate !== undefined) params.expires = Number(details.expirationDate);
      const response = await send("Network.setCookie", params);
      if (response?.success !== true) throw debuggerFailure();
      const stored = await backend.get(details);
      if (!cookieMatchesSetDetails(stored, details, host)) throw debuggerFailure();
      return stored;
    },
    async remove(rawDetails) {
      const details = checkedManagedCleanupDetails(rawDetails, partitionKey);
      const existing = await backend.get(details);
      if (!existing) return null;
      await send("Network.deleteCookies", {
        name: details.name,
        domain: existing.domain,
        path: existing.path,
        partitionKey
      });
      if (await backend.get(details)) throw debuggerFailure();
      return { url: details.url, name: details.name };
    }
  });
  return backend;
}

async function directWithTabDebugger(api, tabId, task) {
  if (
    typeof api?.debugger?.attach !== "function"
    || typeof api?.debugger?.sendCommand !== "function"
    || typeof api?.debugger?.detach !== "function"
  ) throw new Error("Grok Mirror partition Cookie debugger is unavailable");
  const target = { tabId };
  let attached = false;
  let active = false;
  try {
    await api.debugger.attach(target, "1.3");
    attached = true;
    active = true;
    return await task({
      target,
      sendCommand(method, params = {}, sessionId = "") {
        if (!active) return Promise.reject(new Error("Browser debugger session lease expired"));
        return api.debugger.sendCommand(
          sessionId ? { ...target, sessionId: String(sessionId) } : target,
          method,
          params
        );
      }
    });
  } finally {
    active = false;
    if (attached) {
      try { await api.debugger.detach(target); } catch {}
    }
  }
}

export async function withGrokMirrorPartitionCookieBackend(api, options = {}, task) {
  const tabId = options.tabId;
  const partitionKey = normalizedPartitionKey(options.partitionKey);
  if (!Number.isInteger(tabId) || !partitionKey || typeof task !== "function") {
    throw new Error("Grok Mirror partition Cookie debugger target is unavailable");
  }
  const withTabDebugger = typeof options.withTabDebugger === "function"
    ? options.withTabDebugger
    : (targetTabId, sessionTask) => directWithTabDebugger(api, targetTabId, sessionTask);
  try {
    return await withTabDebugger(tabId, async ({ sendCommand }) => {
      await requireCurrentTarget(options.revalidate);
      await sendCommand("Network.enable", {});
      await requireCurrentTarget(options.revalidate);
      const backend = createGrokMirrorPartitionCookieBackend({
        partitionKey,
        revalidate: options.revalidate,
        sendCommand
      });
      return task(backend, sendCommand);
    });
  } catch (error) {
    if (/target changed|target is invalid|target is unavailable/i.test(String(error?.message || ""))) throw error;
    throw debuggerFailure();
  }
}

export async function captureGrokMirrorRandomLoginCookie(api, options = {}, task) {
  const tabId = options.tabId;
  const expectedFrameUrl = Object.hasOwn(options, "frameUrl")
    ? exactMirrorDocumentUrl(options.frameUrl)
    : "";
  const bindExactFrame = Object.hasOwn(options, "frameUrl");
  const frameBindingId = String(options.frameBindingId || "");
  const timeoutMs = Math.min(10_000, Math.max(500, Number(options.timeoutMs) || 5_000));
  if (
    !Number.isInteger(tabId)
    || (bindExactFrame && !expectedFrameUrl)
    || (bindExactFrame && !MIRROR_FRAME_BINDING_PATTERN.test(frameBindingId))
    || typeof task !== "function"
    || typeof api?.debugger?.onEvent?.addListener !== "function"
    || typeof api?.debugger?.onEvent?.removeListener !== "function"
  ) throw new Error("Grok Mirror account-switch capture is unavailable");
  const withTabDebugger = typeof options.withTabDebugger === "function"
    ? options.withTabDebugger
    : (targetTabId, sessionTask) => directWithTabDebugger(api, targetTabId, sessionTask);
  try {
    return await withTabDebugger(tabId, async ({ sendCommand }) => {
      const revalidateBefore = options.revalidateBefore || options.revalidate;
      const revalidateAfter = options.revalidateAfter || options.revalidate;
      await requireCurrentTarget(revalidateBefore);
      let eventListener = null;
      let detachListener = null;
      let timeoutId = null;
      let abortListener = null;
      let settled = false;
      let matchedRequestKey = "";
      let boundSessionId = "";
      let boundFrameId = "";
      let bindingCandidate = null;
      const attestingSessions = new Set();
      let settleBinding = null;
      const bindingReady = bindExactFrame
        ? new Promise((resolve) => { settleBinding = resolve; })
        : Promise.resolve(true);
      const requests = new Map();
      const enabledSessions = new Set();
      const enablingSessions = new Map();
      const capturedToken = await new Promise((resolve, reject) => {
        const finish = (value, error = null) => {
          if (settled) return;
          settled = true;
          if (timeoutId) clearTimeout(timeoutId);
          if (eventListener) api.debugger.onEvent.removeListener(eventListener);
          if (detachListener) api.debugger.onDetach?.removeListener?.(detachListener);
          if (abortListener) options.signal?.removeEventListener?.("abort", abortListener);
          if (settleBinding) {
            settleBinding(false);
            settleBinding = null;
          }
          requests.clear();
          if (error) reject(error);
          else resolve(value);
        };
        const stateFor = (key) => {
          if (requests.size > 128 && !requests.has(key)) {
            finish("", debuggerFailure());
            return null;
          }
          const state = requests.get(key) || {};
          requests.set(key, state);
          return state;
        };
        const recordEvidence = (state, evidence) => {
          if (!evidence?.seen) return;
          if (state.evidenceSeen && state.token !== evidence.token) state.token = "";
          else state.token = evidence.token;
          state.evidenceSeen = true;
        };
        const recordResponse = (state, response, expectExtraInfo = false) => {
          state.responseSeen = true;
          state.responseValid = response?.valid === true;
          state.expectExtraInfo = state.expectExtraInfo === true || expectExtraInfo === true;
          recordEvidence(state, response?.evidence);
        };
        const recordRequestIdentity = (state, params) => {
          const loaderId = String(params?.loaderId || "");
          const frameId = String(params?.frameId || "");
          if (!loaderId || !frameId) {
            state.identityConflict = true;
            return;
          }
          if (
            (state.loaderId && state.loaderId !== loaderId)
            || (state.frameId && state.frameId !== frameId)
            || (bindExactFrame && frameId !== boundFrameId)
          ) state.identityConflict = true;
          state.loaderId = loaderId;
          state.frameId = frameId;
        };
        const inspect = (key) => {
          const state = requests.get(key);
          if (state?.requestSeen && (state.responseConflict || state.identityConflict)) {
            finish("", debuggerFailure());
            return;
          }
          if (
            !state?.requestSeen
            || !state.requestValid
            || !state.responseSeen
            || !state.responseValid
            || !state.evidenceSeen
            || (state.expectExtraInfo && !state.extraSeen)
          ) return;
          if (!state.token) finish("", debuggerFailure());
          else finish(state.token);
        };
        const requestKey = (source, requestId) => `${String(source?.sessionId || "root")}:${requestId}`;
        const enableSession = (sessionId = "") => {
          const id = String(sessionId || "");
          if (settled) return Promise.reject(debuggerFailure());
          if (enabledSessions.has(id)) return Promise.resolve();
          if (enablingSessions.has(id)) return enablingSessions.get(id);
          const promise = Promise.resolve()
            .then(() => {
              if (settled) throw debuggerFailure();
              return sendCommand("Network.enable", {}, id);
            })
            .then(() => {
              if (settled) throw debuggerFailure();
              enabledSessions.add(id);
            })
            .finally(() => { enablingSessions.delete(id); });
          enablingSessions.set(id, promise);
          return promise;
        };
        const attestExactFrame = async (sessionId, targetId) => {
          if (settled) return;
          const candidateKey = `${sessionId}:${targetId}`;
          if (attestingSessions.has(candidateKey)) return;
          attestingSessions.add(candidateKey);
          let attested = false;
          try {
            const frameTree = await sendCommand("Page.getFrameTree", {}, sessionId);
            if (settled) return;
            const pageFrameId = String(frameTree?.frameTree?.frame?.id || "");
            if (
              !pageFrameId
              || cdpMirrorFrameUrl(frameTree?.frameTree?.frame) !== expectedFrameUrl
            ) return;
            const owner = await sendCommand("DOM.getFrameOwner", { frameId: pageFrameId });
            if (settled) return;
            const backendNodeId = Number(owner?.backendNodeId || 0);
            if (!Number.isInteger(backendNodeId) || backendNodeId <= 0) return;
            const response = await sendCommand("DOM.describeNode", {
              backendNodeId,
              depth: 0,
              pierce: false
            });
            if (settled) return;
            const attributes = Array.isArray(response?.node?.attributes) ? response.node.attributes : [];
            let matches = 0;
            for (let index = 0; index + 1 < attributes.length; index += 2) {
              if (
                attributes[index] === MIRROR_FRAME_BINDING_ATTRIBUTE
                && attributes[index + 1] === frameBindingId
              ) matches += 1;
            }
            if (matches !== 1) return;
            attested = true;
            if (bindingCandidate && (
              bindingCandidate.sessionId !== sessionId
              || bindingCandidate.targetId !== targetId
              || bindingCandidate.frameId !== pageFrameId
            )) {
              finish("", debuggerFailure());
              return;
            }
            bindingCandidate = { sessionId, targetId, frameId: pageFrameId };
            await enableSession(sessionId);
            if (settled) return;
            boundSessionId = sessionId;
            boundFrameId = pageFrameId;
            if (settleBinding) {
              settleBinding(true);
              settleBinding = null;
            }
          } catch (error) {
            // A same-URL sibling can disappear while its candidate document
            // is inspected. The exact registered owner binding must still
            // prove the target before its Network domain is enabled.
            if (attested) finish("", error);
          } finally {
            attestingSessions.delete(candidateKey);
          }
        };
        eventListener = (source, method, params = {}) => {
          if (settled) return;
          if (Number(source?.tabId) !== tabId) return;
          if (method === "Target.attachedToTarget") {
            const type = String(params?.targetInfo?.type || "");
            const sessionId = String(params?.sessionId || "");
            const targetId = String(params?.targetInfo?.targetId || "");
            const targetUrl = exactMirrorDocumentUrl(params?.targetInfo?.url);
            if (bindExactFrame && type === "iframe" && targetUrl === expectedFrameUrl) {
              if (!sessionId || !targetId) {
                finish("", debuggerFailure());
                return;
              }
              attestExactFrame(sessionId, targetId);
            } else if (!bindExactFrame && (type === "iframe" || type === "page") && sessionId) {
              enableSession(sessionId).catch((error) => finish("", error));
            }
            return;
          }
          if (
            method === "Target.detachedFromTarget"
            && bindExactFrame
            && String(params?.sessionId || "") === boundSessionId
          ) {
            finish("", debuggerFailure());
            return;
          }
          if (typeof params?.requestId !== "string") return;
          if (bindExactFrame && String(source?.sessionId || "") !== boundSessionId) return;
          const key = requestKey(source, params.requestId);
          if (method === "Network.requestWillBeSent") {
            const request = randomLoginRequestEvidence(params);
            const redirect = randomLoginRedirectEvidence(params);
            if (!request && !redirect) return;
            if (matchedRequestKey && matchedRequestKey !== key) {
              finish("", debuggerFailure());
              return;
            }
            matchedRequestKey = key;
            const state = stateFor(key);
            if (!state) return;
            recordRequestIdentity(state, params);
            if (request) {
              state.requestSeen = true;
              state.requestValid = request.valid;
              if (!request.valid) {
                finish("", debuggerFailure());
                return;
              }
            }
            if (redirect) {
              recordResponse(state, redirect, params.redirectHasExtraInfo === true);
              if (!redirect.valid) {
                finish("", debuggerFailure());
                return;
              }
            }
            inspect(key);
            return;
          }
          if (method === "Network.responseReceived") {
            const response = randomLoginResponseEvidence(params.response, params.type);
            if (!response) return;
            if (matchedRequestKey && matchedRequestKey !== key) {
              finish("", debuggerFailure());
              return;
            }
            matchedRequestKey = key;
            const state = stateFor(key);
            if (!state) return;
            recordRequestIdentity(state, params);
            recordResponse(state, response, params.hasExtraInfo === true);
            if (!response.valid) finish("", debuggerFailure());
            else inspect(key);
            return;
          }
          if (method === "Network.loadingFailed" && key === matchedRequestKey) {
            finish("", debuggerFailure());
            return;
          }
          if (method !== "Network.responseReceivedExtraInfo") return;
          const location = headerValues(params.headers, "location");
          const evidence = randomLoginTokenEvidence(params);
          let state = requests.get(key);
          const candidate = Number(params.statusCode) === 302
            && location.length === 1
            && location[0] === "/"
            && evidence.seen;
          if (!state && !candidate) return;
          if (matchedRequestKey && matchedRequestKey !== key && candidate) {
            finish("", debuggerFailure());
            return;
          }
          state ||= stateFor(key);
          if (!state) return;
          if (Number(params.statusCode) === 302) {
            state.extraSeen = true;
            if (location.length === 1 && location[0] === "/") {
              state.responseSeen = true;
              state.responseValid = true;
            } else if (location.length) {
              state.responseConflict = true;
            }
          } else if (evidence.seen) {
            state.extraSeen = true;
            state.responseConflict = true;
          }
          recordEvidence(state, evidence);
          inspect(key);
        };
        api.debugger.onEvent.addListener(eventListener);
        detachListener = (source) => {
          if (Number(source?.tabId) === tabId) finish("", debuggerFailure());
        };
        api.debugger.onDetach?.addListener?.(detachListener);
        abortListener = () => finish("", debuggerFailure());
        options.signal?.addEventListener?.("abort", abortListener, { once: true });
        timeoutId = setTimeout(() => finish("", debuggerFailure()), timeoutMs);
        (async () => {
          if (settled || options.signal?.aborted) throw debuggerFailure();
          await enableSession("");
          if (settled) throw debuggerFailure();
          await sendCommand("Target.setAutoAttach", {
            autoAttach: true,
            waitForDebuggerOnStart: false,
            flatten: true
          });
          if (settled) throw debuggerFailure();
          if (!await bindingReady) throw debuggerFailure();
          if (settled) throw debuggerFailure();
          await Promise.all([...enablingSessions.values()]);
          if (settled) throw debuggerFailure();
          await requireCurrentTarget(revalidateBefore);
          if (settled) throw debuggerFailure();
          if (typeof options.onArmed === "function") await options.onArmed();
          if (settled) throw debuggerFailure();
        })().catch((error) => finish("", error));
      });
      await requireCurrentTarget(revalidateAfter);
      if (await task(Object.freeze({ token: capturedToken, sendCommand })) === false) throw debuggerFailure();
      return true;
    });
  } catch (error) {
    if (/target changed|capture is unavailable/i.test(String(error?.message || ""))) throw error;
    throw debuggerFailure();
  }
}
