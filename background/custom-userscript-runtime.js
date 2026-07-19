import { getAllChatApps } from "../shared/storage-schema.js";
import { loadCustomConfig, loadOptions } from "../shared/storage-adapter.js";
import { TOPIC_DELETE_SITE_CONFIGS } from "../shared/topic-delete-sites.js";
import { customUserscriptSource, isCustomUserscriptConfig } from "../shared/userscript-config.js";
import {
  deleteConversationIdentityFromHref,
  normalizeDeleteConversationIdentity,
  sameDeleteConversationIdentity
} from "../shared/delete-completion.js";
import {
  CUSTOM_SUMMARY_EXECUTOR,
  RUNTIME_REGISTRY_ABI_VERSION
} from "../shared/protocol.js";
import {
  CONTENT_RUNTIME_IMPLEMENTATION_VERSION,
  CONTENT_RUNTIME_REGISTRY_KEY
} from "../shared/content-runtime-version.generated.js";
import { contentRuntimeIdentityForBundle } from "../shared/content-runtime-package-identity.js";
import { configMatchesHref } from "../shared/url-match.js";
import {
  executeVerifiedPackagedFrameFile,
  verifiedCustomUserscriptTarget,
  worldOptionUnsupported
} from "./frame-injection.js";
import { activeCustomSummaryRuntimeReady } from "./main-world-runtime.js";
import { withTimeout } from "./promise-timeout.js";

const TOPIC_DELETE_USERSCRIPT_FILE_PATTERN = /^topic-delete-userscripts\/[a-z0-9-]+\.user\.js$/i;
const CUSTOM_SUMMARY_SOURCE_MAX_BYTES = 1024 * 1024;
const CUSTOM_SUMMARY_RESULT_MAX_BYTES = 2 * 1024 * 1024;
const CUSTOM_SUMMARY_MAIN_RUNTIME_IDENTITY = contentRuntimeIdentityForBundle("content/summary-userscripts-main.js");

export function createCustomUserscriptRuntime(api, dependencies = {}) {
  if (!api?.scripting) throw new TypeError("Custom userscript runtime requires the extension API");
  const loadRuntimeOptions = dependencies.loadOptions || loadOptions;
  const loadRuntimeCustomConfig = dependencies.loadCustomConfig || loadCustomConfig;
  if (typeof loadRuntimeOptions !== "function" || typeof loadRuntimeCustomConfig !== "function") {
    throw new TypeError("Custom userscript runtime storage dependencies are incomplete");
  }
  const executionQueues = new Map();

  function safeTopicDeleteUserscriptFile(file) {
    const value = String(file || "").trim();
    return TOPIC_DELETE_USERSCRIPT_FILE_PATTERN.test(value) ? value : "";
  }

  function packagedTopicDeleteBuiltInConfig(config = {}) {
    const id = String(config.id || "").trim();
    const file = safeTopicDeleteUserscriptFile(config.userscriptFile);
    if (!file) return null;
    const builtIn = TOPIC_DELETE_SITE_CONFIGS.find((item) => item.id === id) || null;
    return builtIn?.userscriptFile === file ? builtIn : null;
  }

  function canUsePackagedTopicDeleteUserscript(config = {}) {
    const builtIn = packagedTopicDeleteBuiltInConfig(config);
    if (!builtIn) return false;
    return config?.builtIn !== false
      && !isCustomUserscriptConfig(config)
      && safeTopicDeleteUserscriptFile(config.userscriptFile) === builtIn.userscriptFile;
  }

  async function executePackagedTopicDeleteUserscript(sender, file) {
    await executeVerifiedPackagedFrameFile(api, sender, file, { world: "MAIN" });
  }

  function userScriptsUnavailableMessage(error) {
    const message = error?.message || String(error || "");
    const suffix = message ? ` (${message})` : "";
    return `Edited or custom standalone Delete Site userscripts require granted User Scripts access and userScripts.execute (Chrome/Arc 135+ or Firefox Nightly 153+). Chrome 135–137 also requires Developer Mode; Chrome 138+ requires Allow User Scripts. Older Zen builds can use Tampermonkey/Violentmonkey instead.${suffix}`;
  }

  async function executeUserTopicDeleteUserscript(target, source) {
    if (!api.userScripts?.execute) throw new Error(userScriptsUnavailableMessage());
    try {
      await api.userScripts.execute({
        target,
        js: [{ code: source }],
        world: "MAIN",
        injectImmediately: true
      });
    } catch (error) {
      if (worldOptionUnsupported(error)) {
        try {
          await api.userScripts.execute({ target, js: [{ code: source }], injectImmediately: true });
          return;
        } catch (retryError) {
          throw new Error(userScriptsUnavailableMessage(retryError));
        }
      }
      throw new Error(userScriptsUnavailableMessage(error));
    }
  }

  async function storedCustomSummaryConfig(configId, sender = {}) {
    const id = String(configId || "").trim();
    const senderUrl = String(sender?.url || "").trim();
    if (!id) throw new Error("Custom Summary config id is unavailable");
    if (!senderUrl) throw new Error("Custom Summary sender URL is unavailable");
    const options = await loadRuntimeOptions();
    const config = (options.summarySiteConfigs || []).find((item) => item?.id === id && item.enabled !== false);
    if (!config) throw new Error(`Custom Summary config is unavailable: ${id}`);
    if (!configMatchesHref(config, senderUrl)) throw new Error("Custom Summary config does not match the sender document");
    const userscript = customUserscriptSource(config);
    if (!userscript) throw new Error("Custom Summary userscript source is empty");
    const runtimeConfig = { ...config };
    delete runtimeConfig.userscript;
    delete runtimeConfig.customUserscript;
    return { runtimeConfig, userscript };
  }

  async function currentChatApps() {
    return getAllChatApps(await loadRuntimeCustomConfig());
  }

  async function storedTopicDeleteConfig(configId, sender = {}) {
    const id = String(configId || "").trim();
    const senderUrl = String(sender?.url || "").trim();
    if (!id) throw new Error("Delete Site config id is unavailable");
    if (!senderUrl) throw new Error("Delete Site sender URL is unavailable");
    const options = await loadRuntimeOptions();
    const config = (options.topicDeleteSiteConfigs || []).find((item) => item?.id === id && item.enabled !== false);
    if (!config) throw new Error(`Delete Site config is unavailable: ${id}`);
    let matchesSender = configMatchesHref(config, senderUrl);
    if (!matchesSender && Array.isArray(config.appIds) && config.appIds.length) {
      const wantedApps = new Set(config.appIds.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean));
      const appHosts = [];
      for (const app of await currentChatApps()) {
        const keys = [app?.id, app?.name].map((value) => String(value || "").trim().toLowerCase());
        if (!keys.some((key) => wantedApps.has(key))) continue;
        try { appHosts.push(new URL(String(app.url || "")).hostname); } catch {}
        appHosts.push(...(Array.isArray(app.hosts) ? app.hosts : []));
      }
      matchesSender = configMatchesHref({ ...config, hosts: [...(config.hosts || []), ...appHosts] }, senderUrl);
    }
    if (!matchesSender) throw new Error("Delete Site config does not match the sender document");
    return config;
  }

  function topicDeleteUserscriptMetadata(config = {}, source = "") {
    const version = String(source).match(/^\s*\/\/\s*@version\s+(.+?)\s*$/m)?.[1]?.trim() || "";
    if (!source && config.builtIn !== false) {
      return {
        scriptId: String(config.scriptId || config.id || ""),
        userscriptVersion: String(config.scriptVersion || ""),
        supportsVersionedRequest: true,
        supportsVersionedMenuCommand: true,
        supportsMenuCommand: true
      };
    }
    return {
      scriptId: String(config.scriptId || config.id || ""),
      userscriptVersion: version,
      supportsVersionedRequest: source.includes("VERSIONED_REQUEST_EVENT") && /request:\s*["']|request:\s*"\s*\+\s*VERSION/.test(source),
      supportsVersionedMenuCommand: source.includes("VERSIONED_MENU_COMMAND_EVENT") && /menu-command:\s*["']|menu-command:\s*"\s*\+\s*VERSION/.test(source),
      supportsMenuCommand: source.includes("MENU_COMMAND_EVENT")
        || source.includes("chatclub:delete-site:menu-command")
        || /\bmenuCommand\b/.test(source)
    };
  }

  function injectionResultForTarget(results, target) {
    if (!Array.isArray(results)) return null;
    const documentId = target.documentIds?.[0];
    const frameId = target.frameIds?.[0];
    if (documentId) return results.find((item) => item?.documentId === documentId) || null;
    if (Number.isInteger(frameId)) return results.find((item) => item?.frameId === frameId) || null;
    return null;
  }

  async function ensureCustomSummaryRuntime(target) {
    const probeResults = await api.scripting.executeScript({
      target,
      world: "MAIN",
      func: activeCustomSummaryRuntimeReady,
      args: [
        CUSTOM_SUMMARY_EXECUTOR,
        CONTENT_RUNTIME_REGISTRY_KEY,
        RUNTIME_REGISTRY_ABI_VERSION,
        CONTENT_RUNTIME_IMPLEMENTATION_VERSION,
        CUSTOM_SUMMARY_MAIN_RUNTIME_IDENTITY.bundle
      ]
    });
    const probe = injectionResultForTarget(probeResults, target);
    if (probe?.result === true) return;
    throw new Error("Custom Summary MAIN-world runtime is unavailable or stale; prepare the Summary capability and retry.");
  }

  function queueExecution(target, task) {
    const key = `${target.tabId}:${target.documentIds?.[0] || `frame-${target.frameIds?.[0] ?? "unknown"}`}`;
    if (executionQueues.has(key)) {
      throw new Error("A custom userscript is already running in this document; reload the page if it no longer responds.");
    }
    const run = Promise.resolve().then(task);
    const tail = run.catch(() => {});
    executionQueues.set(key, tail);
    tail.finally(() => {
      if (executionQueues.get(key) === tail) executionQueues.delete(key);
    });
    return run;
  }

  function utf8ByteLength(value) {
    return new TextEncoder().encode(String(value || "")).byteLength;
  }

  async function executeSummaryUserscript(configId = "", sender = {}) {
    const { runtimeConfig, userscript } = await storedCustomSummaryConfig(configId, sender);
    if (utf8ByteLength(userscript) > CUSTOM_SUMMARY_SOURCE_MAX_BYTES) throw new Error("Custom Summary userscript exceeds the 1 MiB limit");
    if (!api.userScripts?.execute) {
      throw new Error("Custom Summary userscripts require userScripts.execute (Chrome/Arc 135+ or Firefox Nightly 153+) and granted User Scripts access. Chrome 135–137 also requires Developer Mode; Chrome 138+ requires Allow User Scripts.");
    }
    const expectedHref = String(sender?.url || "").trim();
    const code = `(() => {
    if (String(location.href || "") !== ${JSON.stringify(expectedHref)}) {
      throw new Error("Custom Summary target URL changed before execution");
    }
    const execute = globalThis[${JSON.stringify(CUSTOM_SUMMARY_EXECUTOR)}];
    if (typeof execute !== "function") throw new Error("ChatClub Summary MAIN-world runtime is unavailable");
    return execute(${JSON.stringify(runtimeConfig)}, async function chatClubCustomSummaryUserscript(api) {
${userscript}
    }).then((result) => JSON.stringify(result));
  })()\n//# sourceURL=chatclub-custom-summary-${String(runtimeConfig.id || "userscript").replace(/[^a-z0-9_-]+/gi, "-")}.js`;
    const target = await verifiedCustomUserscriptTarget(api, sender);
    const execution = queueExecution(target, async () => {
      await ensureCustomSummaryRuntime(target);
      let results;
      try {
        results = await api.userScripts.execute({ target, js: [{ code }], world: "MAIN", injectImmediately: true });
      } catch (error) {
        throw new Error(`Custom Summary userscript injection failed: ${error?.message || String(error)}`);
      }
      const entry = injectionResultForTarget(results, target);
      if (entry?.error) throw new Error(`Custom Summary userscript failed: ${entry.error?.message || String(entry.error)}`);
      const serialized = entry?.result;
      if (typeof serialized !== "string") throw new Error("Custom Summary userscript returned no serialized result");
      if (utf8ByteLength(serialized) > CUSTOM_SUMMARY_RESULT_MAX_BYTES) throw new Error("Custom Summary userscript result exceeds the 2 MiB limit");
      let result;
      try { result = JSON.parse(serialized); }
      catch { throw new Error("Custom Summary userscript returned invalid JSON"); }
      if (!result || typeof result !== "object" || !Array.isArray(result.messages)) {
        throw new Error("Custom Summary userscript returned no valid result");
      }
      return result;
    });
    const timeoutMs = Math.max(5000, Math.min(45000, Number(runtimeConfig.userscriptTimeoutMs) || 30000));
    return withTimeout(
      execution,
      Math.max(4000, timeoutMs - 1500),
      "Custom Summary userscript timed out; reload the affected page to stop an unresponsive script."
    );
  }

  function sanitizedTopicDeleteResult(value, config = {}) {
    const source = value && typeof value === "object" ? value : { ok: Boolean(value) };
    const result = { ...source };
    const requestedTrustedInput = Boolean(
      result.needsTrustedClick
      || result.needsTrustedHover
      || result.needsTrustedMenuClick
      || result.needsTrustedKeySequence
    );
    for (const key of [
      "needsTrustedClick", "trustedClick", "needsTrustedHover", "trustedHover",
      "needsTrustedMenuClick", "trustedMenuClick", "needsTrustedKeySequence", "trustedKeySequence"
    ]) delete result[key];
    if (requestedTrustedInput && !result.ok) {
      result.reason = result.reason || "Custom Delete Site userscript requires manual trusted input";
      result.requiresManualInteraction = true;
    }
    result.site = String(result.site || config.id || "topic-delete");
    result.ok = Boolean(result.ok);
    return result;
  }

  async function executeTopicDeleteUserscript(configId = "", payload = {}, sender = {}) {
    const config = await storedTopicDeleteConfig(configId, sender);
    const source = customUserscriptSource(config);
    if (!source) throw new Error("Custom Delete Site userscript source is empty");
    if (utf8ByteLength(source) > CUSTOM_SUMMARY_SOURCE_MAX_BYTES) throw new Error("Custom Delete Site userscript exceeds the 1 MiB limit");
    if (!api.userScripts?.execute) throw new Error(userScriptsUnavailableMessage());
    const safePayload = payload && typeof payload === "object" ? payload : {};
    const expectedHref = String(sender?.url || "").trim();
    const expectedIdentity = normalizeDeleteConversationIdentity(safePayload.expectedDeleteIdentity);
    const currentIdentity = deleteConversationIdentityFromHref(expectedHref);
    if (!expectedIdentity || !sameDeleteConversationIdentity(expectedIdentity, currentIdentity)) {
      throw new Error("Custom Delete Site target identity does not match the sender document");
    }
    const serializedPayload = JSON.stringify(safePayload);
    if (utf8ByteLength(serializedPayload) > 256 * 1024) throw new Error("Custom Delete Site payload exceeds the 256 KiB limit");
    const targetGuard = `;(() => {
    if (String(location.href || "") !== ${JSON.stringify(expectedHref)}) {
      throw new Error("Custom Delete Site target URL changed before execution");
    }
  })();`;
    const code = `${targetGuard}\n${source}\n;(() => {
    if (String(location.href || "") !== ${JSON.stringify(expectedHref)}) {
      throw new Error("Custom Delete Site target URL changed before menuCommand");
    }
    const compact = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    const wanted = [${JSON.stringify(config.id || "")}, ${JSON.stringify(config.name || "")}, ${JSON.stringify(config.scriptId || "")}].map(compact).filter(Boolean);
    const registry = globalThis.ChatClubDeleteSites;
    if (!registry || typeof registry !== "object") throw new Error("Custom Delete Site registry is unavailable");
    const entry = Object.entries(registry).map(([key, value]) => ({ key, value })).find(({ key, value }) => {
      if (!value || typeof value.menuCommand !== "function") return false;
      return [key, value.id, value.site, value.siteId, value.scriptId, value.name].map(compact).some((token) => token && wanted.includes(token));
    })?.value;
    if (!entry) throw new Error("Custom Delete Site menuCommand is unavailable");
    return Promise.resolve(entry.menuCommand(${serializedPayload})).then((value) => {
      const raw = value && typeof value === "object" ? value : { ok: Boolean(value), reason: value ? "" : "userscript returned false" };
      const requiresManualInteraction = Boolean(raw.needsTrustedClick || raw.needsTrustedHover || raw.needsTrustedMenuClick || raw.needsTrustedKeySequence);
      return JSON.stringify({
        ok: Boolean(raw.ok),
        site: String(raw.site || ${JSON.stringify(config.id || "topic-delete")}).slice(0, 256),
        reason: String(raw.reason || (requiresManualInteraction ? "Custom Delete Site userscript requires manual trusted input" : "")).slice(0, 8192),
        requiresManualInteraction
      });
    });
  })()`;
    const target = await verifiedCustomUserscriptTarget(api, sender);
    const execution = queueExecution(target, async () => {
      let results;
      try {
        results = await api.userScripts.execute({ target, js: [{ code }], world: "MAIN", injectImmediately: true });
      } catch (error) {
        if (!worldOptionUnsupported(error)) throw new Error(userScriptsUnavailableMessage(error));
        try {
          results = await api.userScripts.execute({ target, js: [{ code }], injectImmediately: true });
        } catch (fallbackError) {
          throw new Error(userScriptsUnavailableMessage(fallbackError));
        }
      }
      const entry = injectionResultForTarget(results, target);
      if (entry?.error) throw new Error(entry.error?.message || String(entry.error));
      if (typeof entry?.result !== "string") throw new Error("Custom Delete Site userscript returned no serialized result");
      if (utf8ByteLength(entry.result) > CUSTOM_SUMMARY_RESULT_MAX_BYTES) throw new Error("Custom Delete Site result exceeds the 2 MiB limit");
      let value;
      try { value = JSON.parse(entry.result); }
      catch { throw new Error("Custom Delete Site userscript returned invalid JSON"); }
      return sanitizedTopicDeleteResult(value, config);
    });
    const timeoutMs = Math.max(5000, Math.min(45000, Number(config.userscriptTimeoutMs) || 15000));
    return withTimeout(
      execution,
      Math.max(4000, timeoutMs - 1500),
      "Custom Delete Site userscript timed out; reload the affected page to stop an unresponsive script."
    );
  }

  async function installTopicDeleteUserscript(config = {}, sender = {}) {
    const storedConfig = await storedTopicDeleteConfig(config.id, sender);
    if (canUsePackagedTopicDeleteUserscript(storedConfig)) {
      const file = safeTopicDeleteUserscriptFile(storedConfig.userscriptFile);
      await executePackagedTopicDeleteUserscript(sender, file);
      return { mode: "packaged", file, runtimeConfig: topicDeleteUserscriptMetadata(storedConfig) };
    }
    const source = customUserscriptSource(storedConfig);
    if (!/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/.test(source)) {
      throw new Error("Legacy bridge snippets are unsupported under MV3 CSP; convert this Delete Site to a standalone userscript.");
    }
    const target = await verifiedCustomUserscriptTarget(api, sender);
    await executeUserTopicDeleteUserscript(target, source);
    return { mode: "userScripts", runtimeConfig: topicDeleteUserscriptMetadata(storedConfig, source) };
  }

  function requestHandlers(request) {
    return [
      [request.INSTALL_TOPIC_DELETE_USERSCRIPT, (message, sender) => installTopicDeleteUserscript(message.config, sender)],
      [request.EXECUTE_SUMMARY_USERSCRIPT, async (message, sender) => ({
        data: await executeSummaryUserscript(message.configId, sender)
      })],
      [request.EXECUTE_TOPIC_DELETE_USERSCRIPT, async (message, sender) => ({
        data: await executeTopicDeleteUserscript(message.configId, message.payload, sender)
      })]
    ];
  }

  return Object.freeze({ requestHandlers });
}
