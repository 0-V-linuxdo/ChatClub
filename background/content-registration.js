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
  const uniqueFrameIds = Array.from(new Set(frameIds));
  const errors = [];
  const injectedFiles = [];
  let injected = 0;
  if (!uniqueFrameIds.length) errors.push("no matching direct child iframe found for the requested target");
  const specs = features.has("summary")
    ? [CONTENT_BRIDGE_FILES[0], ...SUMMARY_BRIDGE_FILES, ...CONTENT_BRIDGE_FILES.slice(1)]
    : CONTENT_BRIDGE_FILES;
  for (const frameId of uniqueFrameIds) {
    for (const spec of specs) {
      try {
        await api.scripting.executeScript({
          target: { tabId, frameIds: [frameId] },
          files: [spec.file],
          world: spec.world
        });
        injected += 1;
        injectedFiles.push(`${spec.file}@${frameId}`);
      } catch (error) {
        errors.push(`${spec.file}@${frameId}: ${error?.message || String(error)}`);
      }
    }
  }
  return { tabId, frameIds: uniqueFrameIds, injected, injectedFiles, features: [...features], errors };
}
