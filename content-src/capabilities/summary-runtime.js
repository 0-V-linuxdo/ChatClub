import { officialRuleConfigMatchesHref } from "../../shared/url-match.js";

export function createSummaryCapability(deps = {}) {
  const {
    requestBackground,
    EXECUTE_SUMMARY_USERSCRIPT_REQUEST,
    contentDocumentId,
    runtimes,
    CONTENT_BRIDGE_VERSION,
    merge,
    hasUserAndAssistant,
    pageSummaryRequest,
    pageSummaryRuntimeState,
    sleep,
    normalize,
    qsa,
    qs,
    closest,
    visible,
    text,
    buttonText,
    reveal,
    copy,
    copyFirst,
    extractCopySequence,
    extractNativeCopyConversation,
    extractTurns,
    userscriptFindCopyButtons,
    collectOfficialSummaryMessages,
    contentRuntimeBundleIdentityMatches,
    SUMMARY_MAIN_RUNTIME_IDENTITY,
    SUMMARY_ISOLATED_RUNTIME_IDENTITY,
    CONTENT_RUNTIME_IDENTITY
  } = deps;
  function shouldUseCustomSummaryUserscript(config) {
    return config.builtIn === false || config.sourceMode === "custom" || config.userscriptOverride === true;
  }

  async function executeCustomSummaryUserscript(config = {}) {
    const response = await requestBackground(EXECUTE_SUMMARY_USERSCRIPT_REQUEST, {
      configId: String(config.id || "")
    });
    return response.data || { messages: [] };
  }

  function assertSummaryTargetCurrent(data = {}) {
    const expectedDocumentId = String(data?.expectedDocumentId || "");
    if (expectedDocumentId && expectedDocumentId !== contentDocumentId) {
      throw new Error("Summary target document changed before collection");
    }
    const expectedHref = String(data?.expectedHref || "");
    if (expectedHref && expectedHref !== String(location.href || "")) {
      throw new Error("Summary target URL changed during collection");
    }
  }

  function finishSummaryCollection(data, result) {
    assertSummaryTargetCurrent(data);
    return result;
  }

  async function collectSummary(data) {
    assertSummaryTargetCurrent(data);
    const config = data?.config || {};
    if (shouldUseCustomSummaryUserscript(config)) {
      const customResult = await executeCustomSummaryUserscript(config);
      const customMessages = merge(Array.isArray(customResult?.messages) ? customResult.messages : []);
      return finishSummaryCollection(data, {
        messages: hasUserAndAssistant(customMessages) ? customMessages : [],
        rawMessageCount: Number(customResult?.rawMessageCount) || customMessages.length
      });
    }
    let registry = {};
    try { registry = runtimes.require("summary-runners", CONTENT_BRIDGE_VERSION).scripts || {}; } catch {}
    const packagedRunner = registry[config.id] || registry[config.userscriptFile];
    if (config.userscriptRunMode !== "serial") {
      const pageResult = await pageSummaryRequest(config);
      const pageMessages = merge(Array.isArray(pageResult?.messages) ? pageResult.messages : []);
      if (hasUserAndAssistant(pageMessages)) {
        return finishSummaryCollection(data, {
          messages: pageMessages,
          rawMessageCount: Number(pageResult.rawMessageCount) || pageMessages.length
        });
      }
    }
    const runner = packagedRunner;
    if (!runner) return finishSummaryCollection(data, { messages: [] });
    const officialRuleActive = officialRuleConfigMatchesHref(config, String(location.href || ""));
    const api = {
      config,
      collectOfficialCandidate: async () => {
        if (!officialRuleActive) return null;
        const collect = () => merge(collectOfficialSummaryMessages?.(config, {
          qsa,
          closest,
          visible,
          normalize
        }) || []);
        let messages = collect();
        const waitMs = Math.max(0, Math.min(60000, Number(config.officialRuleWaitMs) || 0));
        if (!hasUserAndAssistant(messages) && waitMs > 0) {
          await sleep(waitMs);
          assertSummaryTargetCurrent(data);
          messages = collect();
        }
        return hasUserAndAssistant(messages) ? messages : null;
      },
      sleep,
      normalize,
      qsa,
      qs,
      closest,
      visible,
      text,
      buttonText,
      reveal,
      merge,
      copy,
      copyFirst,
      extractCopySequence,
      extractNativeCopyConversation,
      extractDeepSeekNativeCopyMessages: extractNativeCopyConversation,
      extractGrokNativeCopyMessages: extractNativeCopyConversation,
      extractTurns,
      findCopyButtons: userscriptFindCopyButtons
    };
    const result = await runner(api);
    const messages = merge(Array.isArray(result) ? result : result?.messages || []);
    return finishSummaryCollection(data, {
      messages: hasUserAndAssistant(messages) ? messages : [],
      rawMessageCount: messages.length
    });
  }

  async function getSummaryRuntimeState() {
    const registration = runtimes.registration("summary-runners");
    const registry = registration?.api?.scripts;
    const isolatedVersion = String(registration?.version || "");
    const isolatedReady = Boolean(
      registry
      && typeof registry === "object"
      && Object.keys(registry).length
      && isolatedVersion === CONTENT_BRIDGE_VERSION
      && contentRuntimeBundleIdentityMatches(registration?.api?.runtimeIdentity, SUMMARY_ISOLATED_RUNTIME_IDENTITY)
      && runtimes.isActive
    );
    const pageState = await pageSummaryRuntimeState();
    const mainReady = Boolean(
      pageState?.ready
      && pageState.bridgeVersion === CONTENT_BRIDGE_VERSION
      && contentRuntimeBundleIdentityMatches(pageState.runtimeIdentity, SUMMARY_MAIN_RUNTIME_IDENTITY)
    );
    return {
      ready: isolatedReady && mainReady,
      isolatedReady,
      mainReady,
      documentId: contentDocumentId,
      bridgeVersion: CONTENT_BRIDGE_VERSION,
      runtimeIdentity: CONTENT_RUNTIME_IDENTITY,
      isolatedRuntimeIdentity: registration?.api?.runtimeIdentity || null,
      mainRuntimeIdentity: pageState?.runtimeIdentity || null
    };
  }
  return Object.freeze({
    collectSummary,
    getSummaryRuntimeState
  });
}
