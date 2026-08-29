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
    inspectOfficialSummaryCollection,
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

  async function collectOfficialStage(config, data, { wait = true } = {}) {
    if (!officialRuleConfigMatchesHref(config, String(location.href || ""))) {
      return { messages: null, hits: null, waitMsApplied: 0 };
    }
    const inspectOnce = () => {
      if (typeof inspectOfficialSummaryCollection === "function") {
        const inspection = inspectOfficialSummaryCollection(config, {
          qsa,
          closest,
          visible,
          normalize
        });
        return {
          messages: merge(inspection?.messages || []),
          hits: inspection?.hits || null
        };
      }
      return {
        messages: merge(collectOfficialSummaryMessages?.(config, {
          qsa,
          closest,
          visible,
          normalize
        }) || []),
        hits: null
      };
    };
    let inspection = inspectOnce();
    const waitMs = wait ? Math.max(0, Math.min(60000, Number(config.officialRuleWaitMs) || 0)) : 0;
    let waitMsApplied = 0;
    if (!hasUserAndAssistant(inspection.messages) && waitMs > 0 && typeof sleep === "function") {
      await sleep(waitMs);
      waitMsApplied = waitMs;
      assertSummaryTargetCurrent(data);
      inspection = inspectOnce();
    }
    return {
      messages: hasUserAndAssistant(inspection.messages) ? inspection.messages : null,
      hits: inspection.hits,
      waitMsApplied
    };
  }

  function summaryRunnerApi(config, data) {
    return {
      config,
      collectOfficialCandidate: async () => (await collectOfficialStage(config, data, { wait: false })).messages,
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
  }

  async function collectSummary(data) {
    assertSummaryTargetCurrent(data);
    const config = data?.config || {};
    if (shouldUseCustomSummaryUserscript(config)) {
      const customResult = await executeCustomSummaryUserscript(config);
      const customMessages = merge(Array.isArray(customResult?.messages) ? customResult.messages : []);
      return finishSummaryCollection(data, {
        messages: hasUserAndAssistant(customMessages) ? customMessages : [],
        rawMessageCount: Number(customResult?.rawMessageCount) || customMessages.length,
        stage: "custom",
        officialHits: null,
        waitMsApplied: 0
      });
    }
    const official = await collectOfficialStage(config, data, { wait: true });
    if (official.messages) {
      return finishSummaryCollection(data, {
        messages: official.messages,
        rawMessageCount: official.messages.length,
        stage: "official",
        officialHits: official.hits,
        waitMsApplied: official.waitMsApplied || 0
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
          rawMessageCount: Number(pageResult.rawMessageCount) || pageMessages.length,
          stage: pageResult?.stage || "pageWorld",
          officialHits: official.hits,
          waitMsApplied: official.waitMsApplied || 0
        });
      }
    }
    const runner = packagedRunner;
    if (!runner) {
      return finishSummaryCollection(data, {
        messages: [],
        rawMessageCount: 0,
        stage: "none",
        officialHits: official.hits,
        waitMsApplied: official.waitMsApplied || 0
      });
    }
    const result = await runner(summaryRunnerApi(config, data));
    const messages = merge(Array.isArray(result) ? result : result?.messages || []);
    return finishSummaryCollection(data, {
      messages: hasUserAndAssistant(messages) ? messages : [],
      rawMessageCount: messages.length,
      stage: "isolatedJs",
      officialHits: official.hits,
      waitMsApplied: official.waitMsApplied || 0
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
