import { APP_NAME } from "../shared/constants.js";
import { buildDynamicDnrRules } from "../shared/dnr.js";
import { getAllChatApps } from "../shared/storage-schema.js";
import { prepareContentScriptRegistration } from "./content-script-registration.js";

function normalizedPreferredTabIds(values) {
  return (Array.isArray(values) ? values : [values])
    .filter((value) => Number.isInteger(value) && value >= 0);
}

async function dnrSnapshot(api) {
  const dynamicRules = await api.getDynamicRules();
  const supportsSessionRules = typeof api.getSessionRules === "function"
    && typeof api.updateSessionRules === "function";
  return {
    dynamicRules,
    sessionRules: supportsSessionRules ? await api.getSessionRules() : [],
    supportsSessionRules
  };
}

async function restoreDnrSnapshot(api, snapshot) {
  const currentDynamic = await api.getDynamicRules();
  if (snapshot.supportsSessionRules) {
    const currentSession = await api.getSessionRules();
    await api.updateSessionRules({
      removeRuleIds: currentSession.map(({ id }) => id),
      addRules: snapshot.sessionRules
    });
  }
  await api.updateDynamicRules({
    removeRuleIds: currentDynamic.map(({ id }) => id),
    addRules: snapshot.dynamicRules
  });
}

async function replaceDnrRules(api, sessionRules, dynamicRules, warn, options = {}) {
  const oldDynamicRules = await api.getDynamicRules();
  const supportsSessionRules = typeof api.getSessionRules === "function"
    && typeof api.updateSessionRules === "function";
  if (!supportsSessionRules) {
    await api.updateDynamicRules({
      removeRuleIds: oldDynamicRules.map(({ id }) => id),
      addRules: dynamicRules
    });
    return "dynamic";
  }
  const oldSessionRules = await api.getSessionRules();
  try {
    await api.updateSessionRules({
      removeRuleIds: oldSessionRules.map(({ id }) => id),
      addRules: sessionRules
    });
  } catch (error) {
    if (options.requireSessionRules === true) throw error;
    warn("Failed to update session DNR rules; falling back to dynamic rules", error);
    if (oldSessionRules.length) {
      try {
        await api.updateSessionRules({
          removeRuleIds: oldSessionRules.map(({ id }) => id),
          addRules: []
        });
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Session DNR update failed and stale rules could not be removed");
      }
    }
    await api.updateDynamicRules({
      removeRuleIds: oldDynamicRules.map(({ id }) => id),
      addRules: dynamicRules
    });
    return "dynamic";
  }
  if (oldDynamicRules.length) {
    await api.updateDynamicRules({
      removeRuleIds: oldDynamicRules.map(({ id }) => id),
      addRules: []
    });
  }
  return "session";
}

export function createStrictRuntimeConfigApplier(api, options = {}) {
  const dnr = api?.declarativeNetRequest;
  const notionRuntime = options.notionFramePreflightRuntime;
  const extensionHost = new URL(api.runtime.getURL("")).hostname;
  const currentExtensionPageTabIds = options.currentExtensionPageTabIds;
  if (!dnr || typeof currentExtensionPageTabIds !== "function") {
    throw new TypeError("Strict runtime configuration applier requires DNR and extension-tab dependencies");
  }
  if (
    !notionRuntime?.initialize
    || !notionRuntime?.withDnrMutation
    || !notionRuntime?.hasActiveLeases
    || !notionRuntime?.sessionRulesWithActiveLeases
  ) {
    throw new TypeError("Strict runtime configuration applier requires the Notion frame preflight runtime");
  }
  const warn = typeof options.warn === "function"
    ? options.warn
    : (message, error) => console.warn(`[${APP_NAME}] ${message}`, error);
  let tail = Promise.resolve();

  async function applyInternal(configuration = {}, context = {}) {
    const optionsValue = configuration.options && typeof configuration.options === "object"
      ? configuration.options
      : {};
    const customConfig = Array.isArray(configuration.customConfig) ? configuration.customConfig : [];
    const chatApps = getAllChatApps(customConfig);
    await notionRuntime.initialize();
    const beforeDnr = await dnrSnapshot(dnr);
    const contentPreparation = await prepareContentScriptRegistration(api, {
      options: optionsValue,
      customConfig
    }, {
      forceRefresh: context.forceContentScriptRefresh === true
    });
    try {
      const preferredTabIds = normalizedPreferredTabIds(context.preferredTabIds ?? context.preferredTabId);
      const extensionTabIds = beforeDnr.supportsSessionRules
        ? await currentExtensionPageTabIds(preferredTabIds)
        : [];
      const sessionRules = buildDynamicDnrRules(chatApps, extensionHost, extensionTabIds);
      const dynamicRules = beforeDnr.supportsSessionRules
        ? buildDynamicDnrRules(chatApps, extensionHost, [])
        : sessionRules;
      const mode = await notionRuntime.withDnrMutation(() => replaceDnrRules(
        dnr,
        notionRuntime.sessionRulesWithActiveLeases(sessionRules),
        dynamicRules,
        warn,
        { requireSessionRules: notionRuntime.hasActiveLeases() }
      ));
      await contentPreparation.commit();
      return Object.freeze({ mode, contentScripts: contentPreparation.desired });
    } catch (error) {
      const restoreErrors = [];
      try {
        await notionRuntime.withDnrMutation(() => restoreDnrSnapshot(dnr, {
          ...beforeDnr,
          sessionRules: notionRuntime.sessionRulesWithActiveLeases(beforeDnr.sessionRules)
        }));
      } catch (restoreError) {
        restoreErrors.push(restoreError);
      }
      try {
        await contentPreparation.restore();
      } catch (restoreError) {
        restoreErrors.push(restoreError);
      }
      if (restoreErrors.length) {
        throw new AggregateError([error, ...restoreErrors], "Runtime configuration apply and strict restore both failed");
      }
      throw error;
    }
  }

  function apply(configuration, context = {}) {
    const queued = tail.catch(() => {}).then(() => applyInternal(configuration, context));
    tail = queued.then(() => undefined, () => undefined);
    return queued;
  }

  return Object.freeze({ apply });
}
