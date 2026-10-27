// UserScriptsRuntime (background): runs custom Summary / topic-delete scripts in the frame's MAIN world
// with userScripts.execute (v2 04 §1.6, 05 §4.3, 07 §5.3). Content scripts pass only a config id;
// the script body always comes from stored settings.

import { userscriptRunner } from "../../lib/userscript-runner.js";
import { userscriptsStatus } from "../../lib/userscripts-status.js";

const MAX_BODY = 1024 * 1024;
const MAX_RESULT = 2 * 1024 * 1024;
const MARGIN_MS = 1500;
const SUMMARY_BRIDGED = ["collectOfficialCandidate", "copy", "copyFirst", "findCopyButtons", "extractTurns", "extractCopySequence", "extractNativeCopyConversation"];
const running = new Set();

const clampTimeout = (ms, min = 5000) => Math.min(45000, Math.max(min, Number(ms) || 30000));

const optionsList = (ctx, plugin, key) => {
  try {
    const v = ctx.host.plugins[plugin]?.settings?.store?.[key];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

async function execute(sender, { kind, body, config, href, channel, timeoutMs, generating, payload, bridged }) {
  if (typeof body !== "string" || !body.trim()) throw new Error("no custom script");
  if (new Blob([body]).size > MAX_BODY) throw new Error("script is larger than 1 MiB");
  const { state } = await userscriptsStatus();
  if (state !== "granted") throw new Error(`userScripts ${state}`);
  const tabId = sender.tab?.id;
  if (typeof tabId !== "number") throw new Error("no tab");
  const key = sender.documentId || `${tabId}:${sender.frameId}`;
  if (running.has(key)) throw new Error("a custom script is already running in this page");
  running.add(key);
  try {
    const opts = { kind, href, channel, timeoutMs: timeoutMs - MARGIN_MS, config, generating, payload, bridged };
    const code = `(${userscriptRunner.toString()})(${JSON.stringify(opts)}, async function (api) {\n${body}\n});`;
    const target = sender.documentId ? { tabId, documentIds: [sender.documentId] } : { tabId, frameIds: [sender.frameId ?? 0] };
    const [res] = await chrome.userScripts.execute({ target, world: "MAIN", injectImmediately: true, js: [{ code }] });
    if (res?.error) throw new Error(String(res.error));
    const out = res?.result;
    if (!out?.ok) throw new Error(out?.error || "custom script failed");
    if (new Blob([JSON.stringify(out.data ?? null)]).size > MAX_RESULT) throw new Error("script result is larger than 2 MiB");
    return out.data;
  } finally {
    running.delete(key);
  }
}

const strip = ({ customUserscript, script, ...rest }) => (void customUserscript, void script, rest);
const isRequest = (p) => !!p && typeof p === "object" && typeof p.configId === "string" && typeof p.channel === "string";

export default {
  handlers: {
    status: {
      sender: ["extensionPage", "chatFrame"],
      handle: () => userscriptsStatus(),
    },
    executeSummaryUserscript: {
      sender: "chatFrame",
      validate: isRequest,
      async handle(p, sender, ctx) {
        const config = optionsList(ctx, "Summary", "summarySiteConfigs").find((c) => c?.id === p.configId);
        if (!config?.customUserscript) throw new Error("no custom script saved for this site");
        const data = await execute(sender, {
          kind: "summary",
          body: config.customUserscript,
          config: strip(config),
          href: String(p.href ?? ""),
          channel: p.channel,
          timeoutMs: clampTimeout(config.userscriptTimeoutMs),
          generating: Array.isArray(p.generating) ? p.generating.filter((s) => typeof s === "string").slice(0, 32) : [],
          bridged: SUMMARY_BRIDGED,
        });
        return { data };
      },
    },
    executeTopicDeleteUserscript: {
      sender: "chatFrame",
      validate: isRequest,
      async handle(p, sender, ctx) {
        const config = optionsList(ctx, "TopicDelete", "topicDeleteSiteConfigs").find((c) => c?.id === p.configId);
        if (!config?.script) throw new Error("no custom script saved for this site");
        const data = await execute(sender, {
          kind: "delete",
          body: config.script,
          config: strip(config),
          href: String(p.href ?? ""),
          channel: p.channel,
          timeoutMs: clampTimeout(config.timeoutMs, config.id === "deepseek" ? 36000 : 5000),
          payload: p.payload && typeof p.payload === "object" ? p.payload : {},
          bridged: [],
        });
        return { data };
      },
    },
  },
};
