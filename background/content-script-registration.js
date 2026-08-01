import { APP_NAME } from "../shared/constants.js";
import { contentScriptMatches } from "../shared/dnr.js";
import { CONTENT_BUNDLES } from "../shared/frame-commands.js";
import { getAllChatApps } from "../shared/storage-schema.js";

const REGISTERED_CONTENT_SCRIPT_IDS = Object.freeze(Object.values(CONTENT_BUNDLES).map(({ id }) => id));
const REGISTERED_CONTENT_SCRIPT_ID_SET = new Set(REGISTERED_CONTENT_SCRIPT_IDS);
const CORE_CONTENT_SCRIPT_ID_SET = new Set([
  CONTENT_BUNDLES.preload.id,
  CONTENT_BUNDLES.grokCookie.id,
  CONTENT_BUNDLES.content.id
]);

function summaryCollectorContentTargets(options = {}) {
  return (options.summarySiteConfigs || [])
    .filter((config) => config?.enabled !== false && (
      (Array.isArray(config.hosts) && config.hosts.length)
      || (Array.isArray(config.officialRuleHttpsHosts) && config.officialRuleHttpsHosts.length)
    ))
    .map((config) => ({
      id: `summary-${config.id || config.name || "collector"}`,
      name: config.name || config.id || "Summary Collector",
      url: "",
      hosts: config.hosts,
      officialRuleHttpsHosts: config.officialRuleHttpsHosts
    }));
}

function topicDeleteContentTargets(options = {}) {
  return (options.topicDeleteSiteConfigs || [])
    .filter((config) => config?.enabled !== false && (
      (Array.isArray(config.hosts) && config.hosts.length)
      || (Array.isArray(config.officialRuleHttpsHosts) && config.officialRuleHttpsHosts.length)
    ))
    .map((config) => ({
      id: `topic-delete-${config.id || config.name || "site"}`,
      name: config.name || config.id || "Topic Delete Site",
      url: "",
      hosts: config.hosts,
      officialRuleHttpsHosts: config.officialRuleHttpsHosts
    }));
}

function messageNavigatorContentTargets(options = {}) {
  return (options.messageNavigatorSiteConfigs || [])
    .filter((config) => config?.enabled !== false && (
      (Array.isArray(config.hosts) && config.hosts.length)
      || (Array.isArray(config.officialRuleHttpsHosts) && config.officialRuleHttpsHosts.length)
    ))
    .map((config) => ({
      id: `message-navigator-${config.id || config.name || "site"}`,
      name: config.name || config.id || "Message Navigator Site",
      url: "",
      hosts: config.hosts,
      officialRuleHttpsHosts: config.officialRuleHttpsHosts
    }));
}

function currentContentScriptTargetGroups(configuration = {}) {
  const customConfig = Array.isArray(configuration.customConfig) ? configuration.customConfig : [];
  const options = configuration.options && typeof configuration.options === "object" ? configuration.options : {};
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

function managedRegistrations(registrations = []) {
  return registrations.filter((registration) => REGISTERED_CONTENT_SCRIPT_ID_SET.has(registration.id));
}

function restorableRegistration(registration = {}) {
  const restored = {};
  for (const key of [
    "id", "matches", "excludeMatches", "js", "css", "allFrames", "matchOriginAsFallback",
    "persistAcrossSessions", "runAt", "world"
  ]) {
    if (registration[key] !== undefined) restored[key] = registration[key];
  }
  return restored;
}

async function replaceManagedContentScripts(api, registrations = []) {
  const current = managedRegistrations(await api.scripting.getRegisteredContentScripts());
  if (current.length) await api.scripting.unregisterContentScripts({ ids: current.map(({ id }) => id) });
  if (registrations.length) await registerContentScriptsVerified(api, registrations.map(restorableRegistration));
  const after = managedRegistrations(await api.scripting.getRegisteredContentScripts());
  assertRegisteredContentScriptFiles(registrations, after);
  const expectedIds = new Set(registrations.map(({ id }) => id));
  const stale = after.filter(({ id }) => !expectedIds.has(id));
  if (stale.length || after.length !== registrations.length) {
    throw new Error("content script registration set does not exactly match the prepared configuration");
  }
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

function canonicalContentScriptRegistration(script = {}) {
  const sorted = (value) => [...(Array.isArray(value) ? value : [])].sort();
  return {
    js: Array.isArray(script.js) ? script.js : [],
    css: Array.isArray(script.css) ? script.css : [],
    matches: sorted(script.matches),
    excludeMatches: sorted(script.excludeMatches),
    allFrames: Boolean(script.allFrames),
    matchOriginAsFallback: Boolean(script.matchOriginAsFallback),
    persistAcrossSessions: script.persistAcrossSessions !== false,
    runAt: String(script.runAt || "document_idle"),
    world: String(script.world || "ISOLATED")
  };
}

function contentScriptRegistrationMatches(expected = {}, actual = {}) {
  return JSON.stringify(canonicalContentScriptRegistration(actual))
    === JSON.stringify(canonicalContentScriptRegistration(expected));
}

function assertRegisteredContentScriptFiles(expected = [], actual = []) {
  const actualById = new Map(actual.map((script) => [script.id, script]));
  for (const registration of expected) {
    const registered = actualById.get(registration.id);
    if (!registered) throw new Error(`content script registration is missing: ${registration.id}`);
    const expectedValue = canonicalContentScriptRegistration(registration);
    const actualValue = canonicalContentScriptRegistration(registered);
    if (!contentScriptRegistrationMatches(registration, registered)) {
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
    if (previous && contentScriptRegistrationMatches(registration, previous)) {
      assertRegisteredContentScriptFiles([registration], [previous]);
      continue;
    }
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

export async function prepareContentScriptRegistration(api, configuration = {}) {
  const before = managedRegistrations(await api.scripting.getRegisteredContentScripts()).map(restorableRegistration);
  const desired = buildContentScriptRegistrations(currentContentScriptTargetGroups(configuration));
  let settled = false;
  try {
    await reconcileContentScripts(api, desired);
    const after = managedRegistrations(await api.scripting.getRegisteredContentScripts());
    assertRegisteredContentScriptFiles(desired, after);
    const expectedIds = new Set(desired.map(({ id }) => id));
    if (after.length !== desired.length || after.some(({ id }) => !expectedIds.has(id))) {
      throw new Error("content script registration preparation left an unexpected managed registration");
    }
  } catch (error) {
    try {
      await replaceManagedContentScripts(api, before);
    } catch (restoreError) {
      throw new AggregateError([error, restoreError], "Content registration preparation and restore both failed");
    }
    throw error;
  }
  return Object.freeze({
    desired: Object.freeze(desired.map((registration) => Object.freeze({ ...registration }))),
    async commit() { settled = true; },
    async restore() {
      if (settled) throw new Error("Committed content registration preparation cannot be restored");
      await replaceManagedContentScripts(api, before);
      settled = true;
    }
  });
}
