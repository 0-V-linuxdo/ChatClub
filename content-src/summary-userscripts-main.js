import { CONTENT_PROTOCOL } from "../shared/protocol.js";
import { CONTENT_RUNTIME_SUMMARY_MAIN_BUNDLE_IDENTITY } from "../shared/content-runtime-version.generated.js";
import { createContentRuntimeBundleIdentity } from "../shared/content-runtime-identity.js";
import { createSummaryRunnerRegistry } from "chatclub:summary-registry";
import { officialRuleConfigMatchesHref } from "../shared/url-match.js";
import { inspectOfficialSummaryCollection } from "./capabilities/summary-official-rules.js";
import * as summaryRuntime from "./shared/summary-runtime.js";
import { runtimeRegistry } from "./shared/runtime-registry-client.js";

function installSummaryMainRuntime() {
  const PROTOCOL = CONTENT_PROTOCOL;
  const runtimes = runtimeRegistry(window);
  const CONTENT_RUNTIME_IDENTITY = createContentRuntimeBundleIdentity(CONTENT_RUNTIME_SUMMARY_MAIN_BUNDLE_IDENTITY);
  runtimes.registerBundle(CONTENT_RUNTIME_IDENTITY);
  const summaryRunners = runtimes.register("summary-runners", {
    version: PROTOCOL.CONTENT_BRIDGE_VERSION,
    api: Object.freeze({ scripts: createSummaryRunnerRegistry() })
  });
  const PAGE_SUMMARY_SOURCE = PROTOCOL.PAGE_SUMMARY_SOURCE;
  const {
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
    hasUserAndAssistant,
    copy,
    copyFirst,
    extractCopySequence,
    extractNativeCopyConversation,
    extractTurns,
    userscriptFindCopyButtons
  } = summaryRuntime;

  try {
    runtimes.require("summary-page", PROTOCOL.CONTENT_BRIDGE_VERSION);
    return;
  } catch {}

  const CUSTOM_SUMMARY_EXECUTOR = PROTOCOL.CUSTOM_SUMMARY_EXECUTOR;
  const SUMMARY_RESULT_MAX_TURNS = 200;
  const SUMMARY_RESULT_MAX_TURN_CHARS = 50 * 1024;
  const SUMMARY_RESULT_MAX_TOTAL_CHARS = 1024 * 1024;

  function boundedSummaryRunnerMessages(value) {
    const source = Array.isArray(value) ? value : [];
    const bounded = [];
    let totalChars = 0;
    for (const item of source.slice(0, SUMMARY_RESULT_MAX_TURNS)) {
      if (!item || typeof item !== "object") continue;
      const role = item.role === "assistant" ? "assistant" : item.role === "user" ? "user" : "";
      if (!role) continue;
      const remaining = SUMMARY_RESULT_MAX_TOTAL_CHARS - totalChars;
      if (remaining <= 0) break;
      const textValue = String(item.text ?? item.content ?? "").slice(0, Math.min(SUMMARY_RESULT_MAX_TURN_CHARS, remaining));
      totalChars += textValue.length;
      if (textValue) bounded.push({ role, text: textValue });
    }
    return bounded;
  }

  async function collectOfficialStage(config, { wait = true } = {}) {
    if (!officialRuleConfigMatchesHref(config, String(location.href || ""))) {
      return { messages: null, hits: null };
    }
    const inspectOnce = () => inspectOfficialSummaryCollection(config, {
      qsa,
      closest,
      visible,
      normalize
    });
    let inspection = inspectOnce();
    const waitMs = wait ? Math.max(0, Math.min(60000, Number(config.officialRuleWaitMs) || 0)) : 0;
    if (!hasUserAndAssistant(inspection.messages || []) && waitMs > 0) {
      await sleep(waitMs);
      inspection = inspectOnce();
    }
    return {
      messages: hasUserAndAssistant(inspection.messages || []) ? merge(inspection.messages) : null,
      hits: inspection.hits
    };
  }

  function summaryRuntimeApi(config = {}) {
    return {
      config,
      collectOfficialCandidate: async () => (await collectOfficialStage(config, { wait: true })).messages,
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

  async function runSummaryRunner(config, runner) {
    if (typeof runner !== "function") throw new Error("Summary userscript runner is unavailable");
    const result = await runner(summaryRuntimeApi(config));
    const messages = merge(boundedSummaryRunnerMessages(Array.isArray(result) ? result : result?.messages || []))
      .slice(0, SUMMARY_RESULT_MAX_TURNS);
    return {
      messages: hasUserAndAssistant(messages) ? messages : [],
      rawMessageCount: messages.length
    };
  }

  // Custom source is compiled by chrome.userScripts.execute(), not by eval or
  // Function constructors. The injected wrapper calls this stable packaged API.
  const customSummaryExecutor = (config, runner) => runSummaryRunner(config || {}, runner);

  async function collectSummary(data) {
    const config = data?.config || {};
    const official = await collectOfficialStage(config, { wait: false });
    if (official.messages) {
      const messages = boundedSummaryRunnerMessages(official.messages);
      return {
        messages: hasUserAndAssistant(messages) ? messages : [],
        rawMessageCount: official.messages.length,
        stage: "official",
        officialHits: official.hits
      };
    }
    const registry = summaryRunners.scripts;
    const runner = registry[config.id] || registry[config.userscriptFile];
    if (!runner) return { messages: [], stage: "none", officialHits: official.hits };
    const result = await runSummaryRunner(config, runner);
    return {
      ...result,
      stage: result?.messages?.length ? "pageWorld" : "none",
      officialHits: official.hits
    };
  }


  {
    const onSummaryPageMessage = async (event) => {
      const message = event.data;
      if (
        event.source !== window
        || message?.source !== PAGE_SUMMARY_SOURCE
        || message.type !== "request"
        || !message.id
      ) return;
      if (message.action === "runtimeState") {
        const registry = runtimes.registration("summary-runners");
        const registryVersion = String(registry?.version || "");
        const ready = Boolean(
          registry?.api?.scripts
          && Object.keys(registry.api.scripts).length
          && registryVersion === PROTOCOL.CONTENT_BRIDGE_VERSION
        );
        window.postMessage({
          source: PAGE_SUMMARY_SOURCE,
          type: "response",
          action: "runtimeState",
          id: message.id,
          data: {
            ready,
            bridgeVersion: PROTOCOL.CONTENT_BRIDGE_VERSION,
            runtimeIdentity: CONTENT_RUNTIME_IDENTITY
          }
        }, "*");
        return;
      }
      if (message.action !== "extract") return;
      window.postMessage({ source: PAGE_SUMMARY_SOURCE, type: "ack", action: "extract", id: message.id }, "*");
      try {
        const data = await collectSummary(message.data || {});
        window.postMessage({ source: PAGE_SUMMARY_SOURCE, type: "response", action: "extract", id: message.id, data }, "*");
      } catch {
        window.postMessage({ source: PAGE_SUMMARY_SOURCE, type: "response", action: "extract", id: message.id, data: { messages: [] } }, "*");
      }
    };
    runtimes.register("summary-page", {
      version: PROTOCOL.CONTENT_BRIDGE_VERSION,
      api: Object.freeze({ source: PAGE_SUMMARY_SOURCE }),
      activate() {
        window[CUSTOM_SUMMARY_EXECUTOR] = customSummaryExecutor;
        window.addEventListener("message", onSummaryPageMessage, true);
      },
      dispose() {
        window.removeEventListener("message", onSummaryPageMessage, true);
        if (window[CUSTOM_SUMMARY_EXECUTOR] === customSummaryExecutor) delete window[CUSTOM_SUMMARY_EXECUTOR];
      }
    });
  }
}

installSummaryMainRuntime();
