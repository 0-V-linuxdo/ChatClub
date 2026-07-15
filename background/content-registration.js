import { APP_NAME } from "../shared/constants.js";
import { contentScriptMatches } from "../shared/dnr.js";
import { getAllChatApps } from "../shared/storage-schema.js";
import { loadCustomConfig, loadOptions } from "../shared/storage-adapter.js";
import { normalizeHost } from "../shared/url-match.js";

const PRELOAD_SCRIPT_ID = "chatclub-preload";
const GROK_COOKIE_SCRIPT_ID = "chatclub-grok-cookie-bridge";
const SUMMARY_PAGE_SCRIPT_ID = "chatclub-summary-userscripts-main";
const SUMMARY_SCRIPT_ID = "chatclub-summary-userscripts";
const MESSAGE_NAVIGATOR_SCRIPT_ID = "chatclub-message-navigator";
const CONTENT_SCRIPT_ID = "chatclub-content";
const REGISTERED_CONTENT_SCRIPT_IDS = Object.freeze([
  PRELOAD_SCRIPT_ID,
  GROK_COOKIE_SCRIPT_ID,
  SUMMARY_PAGE_SCRIPT_ID,
  SUMMARY_SCRIPT_ID,
  MESSAGE_NAVIGATOR_SCRIPT_ID,
  CONTENT_SCRIPT_ID
]);
const REGISTERED_CONTENT_SCRIPT_ID_SET = new Set(REGISTERED_CONTENT_SCRIPT_IDS);
const CORE_CONTENT_SCRIPT_ID_SET = new Set([PRELOAD_SCRIPT_ID, GROK_COOKIE_SCRIPT_ID, CONTENT_SCRIPT_ID]);
const FIREFOX_CONTENT_FALLBACKS_KEY = "__CHATCLUB_FIREFOX_CONTENT_FALLBACKS__";

export const CONTENT_BRIDGE_FILES = Object.freeze([
  Object.freeze({ file: "content/preload.js", world: "MAIN" }),
  Object.freeze({ file: "content/grok-cookie-bridge.js", world: "ISOLATED" }),
  Object.freeze({ file: "content/message-navigator.js", world: "ISOLATED" }),
  Object.freeze({ file: "content/content.js", world: "ISOLATED" })
]);

export const SUMMARY_BRIDGE_FILES = Object.freeze([
  Object.freeze({ file: "content/summary-userscripts-main.js", world: "MAIN" }),
  Object.freeze({ file: "content/summary-userscripts.js", world: "ISOLATED" })
]);

function summaryCollectorContentTargets(options = {}) {
  return (options.summarySiteConfigs || [])
    .filter((config) => config?.enabled !== false && Array.isArray(config.hosts) && config.hosts.length)
    .map((config) => ({
      id: `summary-${config.id || config.name || "collector"}`,
      name: config.name || config.id || "Summary Collector",
      url: "",
      hosts: config.hosts
    }));
}

function topicDeleteContentTargets(options = {}) {
  return (options.topicDeleteSiteConfigs || [])
    .filter((config) => config?.enabled !== false && Array.isArray(config.hosts) && config.hosts.length)
    .map((config) => ({
      id: `topic-delete-${config.id || config.name || "site"}`,
      name: config.name || config.id || "Topic Delete Site",
      url: "",
      hosts: config.hosts
    }));
}

function messageNavigatorContentTargets(options = {}) {
  return (options.messageNavigatorSiteConfigs || [])
    .filter((config) => config?.enabled !== false && Array.isArray(config.hosts) && config.hosts.length)
    .map((config) => ({
      id: `message-navigator-${config.id || config.name || "site"}`,
      name: config.name || config.id || "Message Navigator Site",
      url: "",
      hosts: config.hosts
    }));
}

export async function currentContentScriptTargetGroups() {
  const [customConfig, options] = await Promise.all([loadCustomConfig(), loadOptions()]);
  const chatTargets = getAllChatApps(customConfig);
  const summaryTargets = summaryCollectorContentTargets(options);
  const topicDeleteTargets = topicDeleteContentTargets(options);
  const messageNavigatorTargets = messageNavigatorContentTargets(options);
  return {
    coreTargets: [
      ...chatTargets,
      ...summaryTargets,
      ...topicDeleteTargets,
      ...messageNavigatorTargets
    ],
    preloadTargets: [
      ...chatTargets,
      ...summaryTargets,
      ...topicDeleteTargets
    ],
    summaryTargets,
    messageNavigatorTargets
  };
}

function matchesForContentTargets(targets) {
  return Array.isArray(targets) && targets.length ? contentScriptMatches(targets) : [];
}

export function buildContentScriptRegistrations(groups = {}) {
  const coreMatches = matchesForContentTargets(groups.coreTargets);
  const preloadMatches = matchesForContentTargets(groups.preloadTargets);
  const summaryMatches = matchesForContentTargets(groups.summaryTargets);
  const messageNavigatorMatches = matchesForContentTargets(groups.messageNavigatorTargets);
  const registrations = [];
  if (preloadMatches.length) {
    registrations.push({
      id: PRELOAD_SCRIPT_ID,
      matches: preloadMatches,
      js: ["content/preload.js"],
      allFrames: true,
      runAt: "document_start",
      world: "MAIN"
    });
  }
  if (coreMatches.length) {
    registrations.push({
      id: GROK_COOKIE_SCRIPT_ID,
      matches: coreMatches,
      js: ["content/grok-cookie-bridge.js"],
      allFrames: true,
      runAt: "document_start"
    });
  }
  if (summaryMatches.length) {
    registrations.push({
      id: SUMMARY_PAGE_SCRIPT_ID,
      matches: summaryMatches,
      js: ["content/summary-userscripts-main.js"],
      allFrames: true,
      runAt: "document_idle",
      world: "MAIN"
    }, {
      id: SUMMARY_SCRIPT_ID,
      matches: summaryMatches,
      js: ["content/summary-userscripts.js"],
      allFrames: true,
      runAt: "document_idle"
    });
  }
  if (messageNavigatorMatches.length) {
    registrations.push({
      id: MESSAGE_NAVIGATOR_SCRIPT_ID,
      matches: messageNavigatorMatches,
      js: ["content/message-navigator.js"],
      allFrames: true,
      runAt: "document_idle"
    });
  }
  if (coreMatches.length) {
    registrations.push({
      id: CONTENT_SCRIPT_ID,
      matches: coreMatches,
      js: ["content/content.js"],
      allFrames: true,
      runAt: "document_idle"
    });
  }
  return registrations;
}

function rollbackContentScript(previous = {}, canonical = {}) {
  const rollback = { ...canonical };
  for (const key of ["matches", "excludeMatches", "allFrames", "matchOriginAsFallback", "persistAcrossSessions"]) {
    if (previous[key] !== undefined) rollback[key] = previous[key];
  }
  return rollback;
}

export function assertRegisteredContentScriptFiles(expected = [], actual = []) {
  const actualById = new Map(actual.map((script) => [script.id, script]));
  const sorted = (value) => [...(Array.isArray(value) ? value : [])].sort();
  const normalized = (script = {}) => ({
    js: Array.isArray(script.js) ? script.js : [],
    matches: sorted(script.matches),
    excludeMatches: sorted(script.excludeMatches),
    allFrames: Boolean(script.allFrames),
    matchOriginAsFallback: Boolean(script.matchOriginAsFallback),
    runAt: String(script.runAt || "document_idle"),
    world: String(script.world || "ISOLATED")
  });
  for (const registration of expected) {
    const registered = actualById.get(registration.id);
    if (!registered) throw new Error(`content script registration is missing: ${registration.id}`);
    const expectedValue = normalized(registration);
    const actualValue = normalized(registered);
    if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
      throw new Error(
        `content script registration changed: ${registration.id} expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`
      );
    }
  }
}

async function registerContentScriptsVerified(api, registrations = []) {
  if (!registrations.length) return;
  await api.scripting.registerContentScripts(registrations);
  const registered = await api.scripting.getRegisteredContentScripts();
  assertRegisteredContentScriptFiles(registrations, registered);
}

export async function reconcileContentScripts(api, registrations = []) {
  const registered = await api.scripting.getRegisteredContentScripts();
  const previousById = new Map(
    registered
      .filter((script) => REGISTERED_CONTENT_SCRIPT_ID_SET.has(script.id))
      .map((script) => [script.id, script])
  );
  const desiredIds = new Set(registrations.map((registration) => registration.id));
  const staleIds = [...previousById.keys()].filter((id) => !desiredIds.has(id));
  if (staleIds.length) await api.scripting.unregisterContentScripts({ ids: staleIds });

  const failures = [];
  for (const registration of registrations) {
    const previous = previousById.get(registration.id) || null;
    if (previous) await api.scripting.unregisterContentScripts({ ids: [registration.id] });
    try {
      await registerContentScriptsVerified(api, [registration]);
    } catch (error) {
      let recovered = false;
      try {
        const partial = await api.scripting.getRegisteredContentScripts();
        if (partial.some((script) => script.id === registration.id)) {
          await api.scripting.unregisterContentScripts({ ids: [registration.id] });
        }
        if (previous) {
          const rollback = rollbackContentScript(previous, registration);
          await registerContentScriptsVerified(api, [rollback]);
          recovered = true;
        }
      } catch (rollbackError) {
        failures.push({ registration, error, rollbackError, recovered: false });
        continue;
      }
      failures.push({ registration, error, rollbackError: null, recovered });
    }
  }

  const fatal = failures.filter(({ registration, recovered }) =>
    CORE_CONTENT_SCRIPT_ID_SET.has(registration.id) && !recovered
  );
  if (failures.length) {
    console.warn(`[${APP_NAME}] ${failures.length} content script registration(s) failed`, failures);
  }
  if (fatal.length) {
    throw new Error(fatal.map(({ registration, error, rollbackError }) =>
      `${registration.id}: ${error?.message || String(error)}${rollbackError ? `; rollback: ${rollbackError?.message || String(rollbackError)}` : ""}`
    ).join(" | "));
  }
}

export async function registerContentScripts(api) {
  const groups = await currentContentScriptTargetGroups();
  return reconcileContentScripts(api, buildContentScriptRegistrations(groups));
}

function urlHost(value) {
  try {
    return new URL(String(value || "")).hostname.toLowerCase();
  } catch {
    return normalizeHost(value).replace(/^\*\./, "");
  }
}

function frameMatchesBridgeHints(frame = {}, hints = {}) {
  const url = String(frame.url || "");
  if (!/^https?:\/\//i.test(url)) return false;
  const frameHost = urlHost(url);
  if (!frameHost) return false;
  const hosts = new Set((hints.hosts || []).map(urlHost).filter(Boolean));
  for (const href of hints.hrefs || []) {
    const host = urlHost(href);
    if (host) hosts.add(host);
  }
  if (!hosts.size) return true;
  for (const host of hosts) {
    if (frameHost === host || frameHost.endsWith(`.${host}`) || host.endsWith(`.${frameHost}`)) return true;
  }
  return false;
}

function injectionErrorMessage(error) {
  if (typeof error === "string") return error;
  return String(error?.message || error || "unknown injection error");
}

function frameDocumentInvariantError(file, frameId, message) {
  const error = new Error(`${file}@${frameId}: ${message}`);
  error.code = "FRAME_DOCUMENT_CHANGED";
  return error;
}

function frameDocumentInvariantFailed(error) {
  return error?.code === "FRAME_DOCUMENT_CHANGED";
}

export function assertSuccessfulFrameInjection(
  results,
  frameId,
  file,
  expectedDocumentId = "",
  fallbackDocumentId = ""
) {
  const entries = Array.isArray(results) ? results : [];
  const matching = entries.filter((entry) => entry?.frameId === frameId);
  if (!matching.length) {
    throw new Error(`${file}@${frameId}: scripting.executeScript returned no result for the target frame`);
  }
  const expected = String(expectedDocumentId || "").trim();
  const observed = matching.map((entry) => String(entry?.documentId || "").trim()).filter(Boolean);
  if (expected && observed.some((documentId) => documentId !== expected)) {
    throw frameDocumentInvariantError(file, frameId, `browser document changed from ${expected} to ${observed.find((documentId) => documentId !== expected)}`);
  }
  const failed = matching.find((entry) => entry && Object.hasOwn(entry, "error"));
  if (failed) {
    throw new Error(`${file}@${frameId}: ${injectionErrorMessage(failed.error)}`);
  }
  const fallback = String(fallbackDocumentId || "").trim();
  if (observed.length !== matching.length && !fallback) {
    throw frameDocumentInvariantError(file, frameId, "successful injection returned no browser document id");
  }
  const documentIds = new Set([...observed, ...(fallback ? [fallback] : [])]);
  if (documentIds.size !== 1) {
    throw frameDocumentInvariantError(file, frameId, `successful injection spanned browser documents: ${[...documentIds].join(", ")}`);
  }
  const browserDocumentId = observed[0] || fallback;
  if (expected && browserDocumentId !== expected) {
    throw frameDocumentInvariantError(file, frameId, `browser document changed from ${expected} to ${browserDocumentId}`);
  }
  Object.defineProperty(matching, "browserDocumentId", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: browserDocumentId
  });
  return matching;
}

function validLegacyBrowserDocumentId(value) {
  return /^legacy:[a-f0-9]{64}$/i.test(String(value || ""));
}

export function attestInjectedFrameDocument() {
  const key = "__CHATCLUB_BROWSER_DOCUMENT_ATTESTATION_STATE__";
  const pattern = /^legacy:[a-f0-9]{64}$/i;
  const nextId = () => {
    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    return `legacy:${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
  };
  const rotate = (state) => {
    state.id = nextId();
    state.epoch = Number.isSafeInteger(state.epoch) && state.epoch > 0 && state.epoch < Number.MAX_SAFE_INTEGER
      ? state.epoch + 1
      : 1;
    state.dirty = false;
  };
  let state = globalThis[key];
  if (state) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    if (
      !descriptor
      || descriptor.configurable
      || descriptor.writable
      || descriptor.value !== state
      || typeof state !== "object"
      || !pattern.test(String(state.id || ""))
      || !Number.isSafeInteger(state.epoch)
      || state.epoch <= 0
      || typeof state.dirty !== "boolean"
      || typeof state.lifecycleInstalled !== "boolean"
    ) throw new Error("Injected browser document attestation state is invalid");
  } else {
    state = { id: "", epoch: 0, dirty: false, lifecycleInstalled: false };
    rotate(state);
    Object.defineProperty(globalThis, key, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: state
    });
  }
  if (!state.lifecycleInstalled) {
    state.lifecycleInstalled = true;
    globalThis.addEventListener?.("pagehide", () => { state.dirty = true; }, { capture: true });
    globalThis.addEventListener?.("pageshow", () => { if (state.dirty) rotate(state); }, { capture: true });
  }
  if (state.dirty) rotate(state);
  return { attestation: state.id, epoch: state.epoch };
}

async function probeInjectedFrameDocument(api, tabId, frameId, file) {
  const results = await api.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    world: "ISOLATED",
    func: attestInjectedFrameDocument
  });
  const entries = Array.isArray(results) ? results : [];
  const matching = entries.filter((entry) => entry?.frameId === frameId);
  if (!matching.length) {
    throw new Error(`${file}@${frameId}: browser document probe returned no result for the target frame`);
  }
  const failed = matching.find((entry) => entry && Object.hasOwn(entry, "error"));
  if (failed) {
    throw new Error(`${file}@${frameId}: browser document probe failed: ${injectionErrorMessage(failed.error)}`);
  }
  const attestations = new Set(
    matching.map((entry) => String(entry?.result?.attestation || "").trim()).filter(validLegacyBrowserDocumentId)
  );
  const attestationEpochs = new Set(matching.map((entry) => Number(entry?.result?.epoch)));
  if (
    attestations.size !== 1
    || attestationEpochs.size !== 1
    || matching.some((entry) =>
      !validLegacyBrowserDocumentId(entry?.result?.attestation)
      || !Number.isSafeInteger(entry?.result?.epoch)
      || entry.result.epoch <= 0
    )
  ) {
    throw frameDocumentInvariantError(file, frameId, "browser document attestation is unavailable");
  }
  const observed = matching.map((entry) => String(entry?.documentId || "").trim()).filter(Boolean);
  if (observed.length && observed.length !== matching.length) {
    throw frameDocumentInvariantError(file, frameId, "browser document probe returned incomplete official identity");
  }
  const officialDocumentIds = new Set(observed);
  if (officialDocumentIds.size > 1) {
    throw frameDocumentInvariantError(file, frameId, `browser document probe spanned documents: ${[...officialDocumentIds].join(", ")}`);
  }
  return {
    browserDocumentId: observed[0] || [...attestations][0],
    attestation: [...attestations][0],
    epoch: [...attestationEpochs][0]
  };
}

function assertStableBrowserFrameDocument(file, frameId, beforeIdentity, afterIdentity, expectedDocumentId = "") {
  const before = String(beforeIdentity?.browserDocumentId || "").trim();
  const after = String(afterIdentity?.browserDocumentId || "").trim();
  if (!before || !after) {
    throw frameDocumentInvariantError(file, frameId, "browser document identity is unavailable");
  }
  if (before !== after) {
    throw frameDocumentInvariantError(file, frameId, `browser document changed from ${before} to ${after}`);
  }
  if (
    beforeIdentity.attestation !== afterIdentity?.attestation
    || beforeIdentity.epoch !== afterIdentity?.epoch
  ) {
    throw frameDocumentInvariantError(
      file,
      frameId,
      `browser document generation changed from ${beforeIdentity.attestation}:${beforeIdentity.epoch} `
        + `to ${afterIdentity?.attestation || "unavailable"}:${afterIdentity?.epoch || 0}`
    );
  }
  const expected = String(expectedDocumentId || "").trim();
  if (expected && before !== expected) {
    throw frameDocumentInvariantError(file, frameId, `browser document changed from ${expected} to ${before}`);
  }
  return before;
}

async function executeFrameInjection(api, tabId, frameId, file, expectedDocumentId, details) {
  const beforeIdentity = await probeInjectedFrameDocument(api, tabId, frameId, file);
  assertStableBrowserFrameDocument(file, frameId, beforeIdentity, beforeIdentity, expectedDocumentId);
  let results;
  try {
    results = await api.scripting.executeScript(details);
  } catch (error) {
    const afterIdentity = await probeInjectedFrameDocument(api, tabId, frameId, file);
    assertStableBrowserFrameDocument(
      file,
      frameId,
      beforeIdentity,
      afterIdentity,
      expectedDocumentId
    );
    throw error;
  }
  const entries = Array.isArray(results) ? results : [];
  const matching = entries.filter((entry) => entry?.frameId === frameId);
  const afterIdentity = await probeInjectedFrameDocument(api, tabId, frameId, file);
  const stableDocumentId = assertStableBrowserFrameDocument(
    file,
    frameId,
    beforeIdentity,
    afterIdentity,
    expectedDocumentId
  );
  if (!matching.length) return assertSuccessfulFrameInjection(results, frameId, file, expectedDocumentId);
  const missingResultDocumentId = matching.some((entry) => !String(entry?.documentId || "").trim());
  return assertSuccessfulFrameInjection(
    results,
    frameId,
    file,
    expectedDocumentId || stableDocumentId,
    missingResultDocumentId ? stableDocumentId : ""
  );
}

function firefoxContentFallback(file) {
  const fallback = globalThis[FIREFOX_CONTENT_FALLBACKS_KEY]?.[file];
  return typeof fallback === "function" ? fallback : null;
}

function frameInjectionError(file, frameId, error) {
  const prefix = `${file}@${frameId}:`;
  const detail = injectionErrorMessage(error);
  return detail.startsWith(prefix) ? detail : `${prefix} ${detail}`;
}

function validBindingRequest(challenge, generation) {
  return /^[a-f0-9]{64}$/i.test(String(challenge || ""))
    && Number.isSafeInteger(Number(generation))
    && Number(generation) > 0;
}

function validFrameBindingId(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || ""));
}

async function seedInjectedFrameBinding(api, tabId, frameId, frameBindingId, expectedDocumentId = "") {
  const matching = await executeFrameInjection(
    api,
    tabId,
    frameId,
    "secure-frame-binding-id-seed",
    expectedDocumentId,
    {
    target: { tabId, frameIds: [frameId] },
    world: "ISOLATED",
    func: (bindingId) => {
      const key = "__CHATCLUB_FRAME_BINDING_ID__";
      const current = String(globalThis[key] || "");
      if (current && current !== bindingId) {
        throw new Error("Injected frame binding id changed in the current document");
      }
      if (!current) {
        Object.defineProperty(globalThis, key, {
          configurable: false,
          enumerable: false,
          writable: false,
          value: bindingId
        });
      }
      return { success: globalThis[key] === bindingId };
    },
    args: [frameBindingId]
    }
  );
  if (!matching.some((entry) => entry?.result?.success === true)) {
    throw new Error("Secure frame binding id seed returned no successful result");
  }
  return matching.browserDocumentId;
}

async function frameIdsMatchingBinding(api, tabId, frameIds, bindingId) {
  const matches = [];
  for (const frameId of frameIds) {
    const entries = await executeFrameInjection(
      api,
      tabId,
      frameId,
      "secure-frame-binding-id-probe",
      "",
      {
      target: { tabId, frameIds: [frameId] },
      world: "ISOLATED",
      func: () => {
        const bootstrap = String(globalThis.__CHATCLUB_FRAME_BINDING_ID__ || "");
        if (bootstrap) return { count: 1, bindingId: bootstrap };
        const values = new URLSearchParams(String(globalThis.name || ""))
          .getAll("chatclub_frame_binding")
          .map((value) => String(value || ""));
        return { count: values.length, bindingId: values.length === 1 ? values[0] : "" };
      }
      }
    );
    const result = entries[0]?.result;
    if (result?.count === 1 && result.bindingId === bindingId) matches.push(frameId);
  }
  return matches;
}

async function relayInjectedFrameBinding(api, tabId, frameId, challenge, generation, frameBindingId, expectedDocumentId = "") {
  const matching = await executeFrameInjection(
    api,
    tabId,
    frameId,
    "secure-frame-binding-relay",
    expectedDocumentId,
    {
    target: { tabId, frameIds: [frameId] },
    world: "ISOLATED",
    func: async (bindingChallenge, bindingGeneration, bindingId, browserDocumentId) => {
      const extensionApi = globalThis.browser || globalThis.chrome;
      const bridgeDocumentId = String(globalThis.__CHATCLUB_CONTENT_DOCUMENT_ID__ || "");
      const secureFrameToken = String(globalThis.__CHATCLUB_SECURE_FRAME_TOKEN__ || "");
      const bridgeVersion = String(globalThis.__CHATCLUB_CONTENT_BRIDGE_VERSION__ || "");
      const attestationState = globalThis.__CHATCLUB_BROWSER_DOCUMENT_ATTESTATION_STATE__;
      const attestation = String(attestationState?.id || "");
      if (!bridgeDocumentId || !browserDocumentId || !extensionApi?.runtime?.sendMessage) {
        throw new Error("Injected content frame registration is unavailable");
      }
      if (/^legacy:/i.test(browserDocumentId) && (attestationState?.dirty || attestation !== browserDocumentId)) {
        throw new Error("Injected browser document attestation changed");
      }
      const registration = await extensionApi.runtime.sendMessage({
        source: "chatclub",
        action: "registerFrameContext",
        bridgeDocumentId,
        browserDocumentId: /^legacy:/i.test(browserDocumentId) ? browserDocumentId : attestation,
        secureFrameToken,
        frameBindingId: bindingId,
        bridgeVersion
      });
      if (!registration?.success) throw new Error(registration?.error || "Secure frame registration failed");
      let lastError = "Secure frame binding relay was not accepted";
      for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
          const response = await extensionApi.runtime.sendMessage({
            source: "chatclub",
            action: "relayFrameBinding",
            bridgeDocumentId,
            browserDocumentId,
            challenge: bindingChallenge,
            generation: bindingGeneration,
            frameBindingId: bindingId
          });
          if (response?.success) return { success: true, bridgeDocumentId };
          lastError = String(response?.error || lastError);
        } catch (error) {
          lastError = String(error?.message || error || lastError);
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(lastError);
    },
    args: [challenge, Number(generation), String(frameBindingId || ""), String(expectedDocumentId || "")]
    }
  );
  if (!matching.some((entry) => entry?.result?.success === true)) {
    throw new Error("Secure frame binding relay returned no successful result");
  }
  return matching.browserDocumentId;
}

function exactFrameIdentity(frames, hints, options = {}) {
  const expectedFrameId = Number(options.expectedFrameId);
  const expectedBindingId = String(options.expectedBindingId || "");
  if (!Number.isSafeInteger(expectedFrameId) || expectedFrameId <= 0 || !validFrameBindingId(expectedBindingId)) {
    throw new Error("Exact content frame binding identity is invalid");
  }
  const exactFrame = (frames || []).find((frame) => frame?.frameId === expectedFrameId);
  if (!exactFrame || exactFrame.parentFrameId !== 0 || !frameMatchesBridgeHints(exactFrame, hints)) {
    throw new Error("Exact content frame is not a matching direct child iframe");
  }
  return { frameId: expectedFrameId, bindingId: expectedBindingId };
}

export async function relayContentFrameBinding(api, tabId, options = {}) {
  const hints = {
    hrefs: Array.isArray(options.hrefs) ? options.hrefs : [],
    hosts: Array.isArray(options.hosts) ? options.hosts : []
  };
  const validHintHosts = new Set([
    ...hints.hrefs.map(urlHost),
    ...hints.hosts.map(urlHost)
  ].filter(Boolean));
  if (!validHintHosts.size) throw new Error("Secure frame binding relay target URL hints are unavailable");
  if (!validBindingRequest(options.bindingChallenge, options.bindingGeneration)) {
    throw new Error("Secure frame binding relay request is invalid");
  }
  let frames;
  try {
    frames = await api.webNavigation.getAllFrames({ tabId });
  } catch (error) {
    throw new Error(`Secure frame binding relay failed: ${injectionErrorMessage(error)}`);
  }
  const identity = exactFrameIdentity(frames, hints, options);
  let browserDocumentId = String(options.browserDocumentId || "").trim();
  browserDocumentId = await seedInjectedFrameBinding(
    api,
    tabId,
    identity.frameId,
    identity.bindingId,
    browserDocumentId
  );
  browserDocumentId = await relayInjectedFrameBinding(
    api,
    tabId,
    identity.frameId,
    String(options.bindingChallenge),
    Number(options.bindingGeneration),
    identity.bindingId,
    browserDocumentId
  );
  return { tabId, frameId: identity.frameId, browserDocumentId, bindingRelayed: true };
}

export async function injectContentBridge(api, tabId, options = {}) {
  const hints = {
    hrefs: Array.isArray(options.hrefs) ? options.hrefs : [],
    hosts: Array.isArray(options.hosts) ? options.hosts : []
  };
  const validHintHosts = new Set([
    ...hints.hrefs.map(urlHost),
    ...hints.hosts.map(urlHost)
  ].filter(Boolean));
  if (!validHintHosts.size) throw new Error("Content bridge injection failed: target URL hints are unavailable");
  const features = new Set(
    (Array.isArray(options.features) ? options.features : [])
      .map((value) => String(value || "").trim().toLowerCase())
      .filter((value) => value === "summary")
  );
  let frames = [];
  try {
    frames = await api.webNavigation.getAllFrames({ tabId });
  } catch (error) {
    throw new Error(`Content bridge injection failed: ${error?.message || String(error)}`);
  }
  const frameIds = (frames || [])
    .filter((frame) => Number.isInteger(frame?.frameId) && frame.frameId > 0 && frame.parentFrameId === 0)
    .filter((frame) => frameMatchesBridgeHints(frame, hints))
    .map((frame) => frame.frameId);
  const candidateFrameIds = Array.from(new Set(frameIds));
  let uniqueFrameIds = candidateFrameIds;
  const errors = [];
  const exactFrameRequested = options.expectedFrameId !== undefined;
  const expectedBindingId = String(options.expectedBindingId || "");
  if (exactFrameRequested) {
    try {
      uniqueFrameIds = [exactFrameIdentity(frames, hints, options).frameId];
    } catch (error) {
      uniqueFrameIds = [];
      errors.push(injectionErrorMessage(error));
    }
  }
  const bindingSelectorRequested = !exactFrameRequested && options.expectedBindingId !== undefined;
  if (bindingSelectorRequested) {
    if (!validFrameBindingId(expectedBindingId)) {
      uniqueFrameIds = [];
      errors.push("Content frame binding selector is invalid");
    } else {
      try {
        const matchingFrameIds = await frameIdsMatchingBinding(
          api,
          tabId,
          candidateFrameIds,
          expectedBindingId
        );
        if (matchingFrameIds.length === 1) {
          uniqueFrameIds = matchingFrameIds;
        } else {
          uniqueFrameIds = [];
          errors.push(
            matchingFrameIds.length
              ? "Content frame binding selector matched multiple direct child iframes"
              : "No direct child iframe matched the content frame binding selector"
          );
        }
      } catch (error) {
        uniqueFrameIds = [];
        errors.push(`Content frame binding selector probe failed: ${injectionErrorMessage(error)}`);
      }
    }
  }
  if (!exactFrameRequested && !bindingSelectorRequested && uniqueFrameIds.length > 1) {
    uniqueFrameIds = [];
    errors.push("Content bridge target matched multiple direct child iframes without a secure frame selector");
  }
  const injectedFiles = [];
  const fallbackFiles = [];
  let bindingRelayed = false;
  let browserDocumentId = "";
  let injected = 0;
  if (!candidateFrameIds.length) errors.push("no matching direct child iframe found for the requested target");
  const specs = features.has("summary")
    ? [CONTENT_BRIDGE_FILES[0], ...SUMMARY_BRIDGE_FILES, ...CONTENT_BRIDGE_FILES.slice(1)]
    : CONTENT_BRIDGE_FILES;
  if ((exactFrameRequested || bindingSelectorRequested) && uniqueFrameIds.length === 1 && errors.length === 0) {
    try {
      browserDocumentId = await seedInjectedFrameBinding(api, tabId, uniqueFrameIds[0], expectedBindingId);
    } catch (error) {
      errors.push(`secure-frame-binding-id-seed@${uniqueFrameIds[0]}: ${injectionErrorMessage(error)}`);
      uniqueFrameIds = [];
    }
  }
  injectionLoop:
  for (const frameId of uniqueFrameIds) {
    for (const spec of specs) {
      try {
        const matching = await executeFrameInjection(api, tabId, frameId, spec.file, browserDocumentId, {
          target: { tabId, frameIds: [frameId] },
          files: [spec.file],
          world: spec.world
        });
        browserDocumentId = matching.browserDocumentId;
        injected += 1;
        injectedFiles.push(`${spec.file}@${frameId}`);
      } catch (fileError) {
        if (frameDocumentInvariantFailed(fileError)) {
          errors.push(frameInjectionError(spec.file, frameId, fileError));
          break injectionLoop;
        }
        const fallback = firefoxContentFallback(spec.file);
        if (!fallback) {
          errors.push(frameInjectionError(spec.file, frameId, fileError));
          continue;
        }
        try {
          const matching = await executeFrameInjection(api, tabId, frameId, spec.file, browserDocumentId, {
            target: { tabId, frameIds: [frameId] },
            func: fallback,
            world: spec.world
          });
          browserDocumentId = matching.browserDocumentId;
          injected += 1;
          const injectedFile = `${spec.file}@${frameId}`;
          injectedFiles.push(injectedFile);
          fallbackFiles.push(injectedFile);
        } catch (fallbackError) {
          if (frameDocumentInvariantFailed(fallbackError)) {
            errors.push(frameInjectionError(spec.file, frameId, fallbackError));
            break injectionLoop;
          }
          errors.push(
            `${spec.file}@${frameId}: packaged file injection failed (${injectionErrorMessage(fileError)}); `
            + `Firefox function fallback failed (${injectionErrorMessage(fallbackError)})`
          );
        }
      }
    }
  }
  const bindingRequested = options.bindingChallenge !== undefined || options.bindingGeneration !== undefined;
  if (bindingRequested && !validBindingRequest(options.bindingChallenge, options.bindingGeneration)) {
    errors.push("Secure frame binding relay request is invalid");
  } else if (
    bindingRequested
    && exactFrameRequested
    && uniqueFrameIds.length === 1
    && errors.length === 0
    && injected === specs.length
  ) {
    try {
      const binding = await relayContentFrameBinding(
        api,
        tabId,
        {
          ...options,
          browserDocumentId,
          hrefs: hints.hrefs,
          hosts: hints.hosts
        }
      );
      browserDocumentId = binding.browserDocumentId;
      bindingRelayed = binding.bindingRelayed === true;
    } catch (error) {
      errors.push(`secure-frame-binding-relay@${uniqueFrameIds[0]}: ${injectionErrorMessage(error)}`);
    }
  }
  return {
    tabId,
    frameIds: uniqueFrameIds,
    injected,
    injectedFiles,
    fallbackFiles,
    browserDocumentId,
    bindingRelayed,
    features: [...features],
    errors
  };
}
