import { APP_NAME } from "../shared/constants.js";
import { contentScriptMatches } from "../shared/dnr.js";
import { CONTENT_BUNDLES } from "../shared/frame-commands.js";
import { getAllChatApps } from "../shared/storage-schema.js";
import { loadCustomConfig, loadOptions } from "../shared/storage-adapter.js";

const REGISTERED_CONTENT_SCRIPT_IDS = Object.freeze(Object.values(CONTENT_BUNDLES).map(({ id }) => id));
const REGISTERED_CONTENT_SCRIPT_ID_SET = new Set(REGISTERED_CONTENT_SCRIPT_IDS);
const CORE_CONTENT_SCRIPT_ID_SET = new Set([
  CONTENT_BUNDLES.preload.id,
  CONTENT_BUNDLES.grokCookie.id,
  CONTENT_BUNDLES.content.id
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

async function currentContentScriptTargetGroups() {
  const [customConfig, options] = await Promise.all([loadCustomConfig(), loadOptions()]);
  const chatTargets = getAllChatApps(customConfig);
  const summaryTargets = summaryCollectorContentTargets(options);
  const topicDeleteTargets = topicDeleteContentTargets(options);
  const messageNavigatorTargets = messageNavigatorContentTargets(options);
  const coreTargets = [
    ...chatTargets,
    ...summaryTargets,
    ...topicDeleteTargets,
    ...messageNavigatorTargets
  ];
  return {
    coreTargets,
    preloadTargets: coreTargets,
    sendTargets: chatTargets,
    preferredModelTargets: chatTargets,
    deleteTargets: topicDeleteTargets,
    summaryTargets,
    messageNavigatorTargets
  };
}

function matchesForContentTargets(targets) {
  return Array.isArray(targets) && targets.length ? contentScriptMatches(targets) : [];
}

function contentScriptRegistration(spec, matches) {
  return {
    id: spec.id,
    matches,
    js: [spec.file],
    allFrames: true,
    runAt: spec.runAt,
    ...(spec.world === "MAIN" ? { world: "MAIN" } : {})
  };
}

export function buildContentScriptRegistrations(groups = {}) {
  const coreMatches = matchesForContentTargets(groups.coreTargets);
  const preloadMatches = matchesForContentTargets(groups.preloadTargets);
  const summaryMatches = matchesForContentTargets(groups.summaryTargets);
  const messageNavigatorMatches = matchesForContentTargets(groups.messageNavigatorTargets);
  const sendMatches = matchesForContentTargets(groups.sendTargets);
  const preferredModelMatches = matchesForContentTargets(groups.preferredModelTargets);
  const deleteMatches = matchesForContentTargets(groups.deleteTargets);
  const grokCookieMatchSet = new Set(contentScriptMatches([{ hosts: CONTENT_BUNDLES.grokCookie.hosts }]));
  const grokCookieMatches = coreMatches.filter((match) => grokCookieMatchSet.has(match));
  const registrations = [];
  if (preloadMatches.length) {
    registrations.push(contentScriptRegistration(CONTENT_BUNDLES.preload, preloadMatches));
  }
  if (grokCookieMatches.length) {
    registrations.push(contentScriptRegistration(CONTENT_BUNDLES.grokCookie, grokCookieMatches));
  }
  if (coreMatches.length) {
    registrations.push(contentScriptRegistration(CONTENT_BUNDLES.content, coreMatches));
  }
  if (summaryMatches.length) {
    registrations.push(
      contentScriptRegistration(CONTENT_BUNDLES.summaryMain, summaryMatches),
      contentScriptRegistration(CONTENT_BUNDLES.summaryIsolated, summaryMatches),
      contentScriptRegistration(CONTENT_BUNDLES.summaryBridge, summaryMatches)
    );
  }
  if (sendMatches.length) registrations.push(contentScriptRegistration(CONTENT_BUNDLES.send, sendMatches));
  if (preferredModelMatches.length) {
    registrations.push(contentScriptRegistration(CONTENT_BUNDLES.preferredModel, preferredModelMatches));
  }
  if (deleteMatches.length) registrations.push(contentScriptRegistration(CONTENT_BUNDLES.delete, deleteMatches));
  if (messageNavigatorMatches.length) {
    registrations.push(contentScriptRegistration(CONTENT_BUNDLES.messageNavigator, messageNavigatorMatches));
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

function assertRegisteredContentScriptFiles(expected = [], actual = []) {
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
