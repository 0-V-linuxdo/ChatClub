#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");
const { functionSource } = require("./function-source.cjs");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app/summary/controller.js"), "utf8");

(async () => {
  const { conversationHrefFromLocation } = await import(
    pathToFileURL(path.join(root, "shared/workspace-tab-memory.js")).href
  );
  const context = vm.createContext({
    URL,
    t: (key, values = {}) => `${key}:${values.name || ""}`,
    inferAppName: (app) => app.name,
    summaryFrameLogoUrl: () => "",
    conversationHrefFromLocation,
    findSummarySiteConfig: (_configs, href) => {
      try {
        const host = new URL(href).hostname.toLowerCase();
        if (host === "chatgpt.com" || host.endsWith(".chatgpt.com") || host === "chat.openai.com") {
          return { id: "chatgpt", userscriptFile: "chatgpt.js" };
        }
        if (host === "grok.com" || host.endsWith(".grok.com")) return { id: "grok", userscriptFile: "grok.js" };
        if (host === "gemini.google.com" || host.endsWith(".gemini.google.com")) {
          return { id: "gemini", userscriptFile: "gemini.js" };
        }
        if (host === "assistant.kagi.com") return { id: "kagi", userscriptFile: "kagi.js" };
        if (host === "claude.ai" || host.endsWith(".claude.ai")) return { id: "claude", userscriptFile: "claude.js" };
        if (host === "app.notion.com" || host === "www.notion.so" || host.endsWith(".notion.so")) {
          return { id: "notion", userscriptFile: "notion.js" };
        }
        return null;
      } catch {
        return null;
      }
    },
    summaryConfigHasCollector: (config) => Boolean(config?.userscriptFile),
    state: { options: { summarySiteConfigs: [] }, summaryContexts: [] }
  });
  vm.runInContext(`
    ${functionSource(source, "summaryBlankPageReason")}
    ${functionSource(source, "summaryHrefIsCollectable")}
    ${functionSource(source, "summaryLiveHref")}
    ${functionSource(source, "summaryFrameBase")}
    globalThis.reason = summaryBlankPageReason;
    globalThis.collectable = summaryHrefIsCollectable;
    globalThis.liveHref = summaryLiveHref;
    globalThis.frameBase = summaryFrameBase;
  `, context);

  const reason = (siteId, href) => context.reason({ id: siteId }, href);
  assert.match(reason("chatgpt", "https://chatgpt.com/"), /^summaryPanel\.blankChat:/);
  assert.match(reason("grok", "https://grok.com/"), /^summaryPanel\.blankChat:/);
  assert.match(reason("gemini", "https://gemini.google.com/app"), /^summaryPanel\.blankChat:/);
  assert.match(reason("gemini", "https://gemini.google.com/app?hl=zh-CN"), /^summaryPanel\.blankChat:/);
  assert.equal(reason("chatgpt", "https://chatgpt.com/c/thread-1"), "");
  assert.equal(reason("grok", "https://grok.com/c/thread-1"), "");
  assert.equal(reason("gemini", "https://gemini.google.com/app/thread-1"), "");

  assert.equal(context.collectable("https://chatgpt.com/"), false, "ChatGPT home must not enable Summarize");
  assert.equal(context.collectable("https://grok.com/"), false, "Grok home must not enable Summarize");
  assert.equal(context.collectable("https://grok.com/chat"), false, "Grok /chat without an id must not enable Summarize");
  assert.equal(context.collectable("https://gemini.google.com/app"), false, "Gemini home must not enable Summarize");
  assert.equal(context.collectable("https://gemini.google.com/app?hl=zh-CN"), false, "Gemini localized home must not enable Summarize");
  assert.equal(context.collectable("https://assistant.kagi.com/"), false, "Kagi home must not enable Summarize");
  assert.equal(context.collectable("https://claude.ai/new"), false, "Claude start page must not enable Summarize");
  assert.equal(context.collectable("https://app.notion.com/ai"), false, "Notion AI home must not enable Summarize");
  assert.equal(context.collectable("https://chatgpt.com/c/thread-1"), true);
  assert.equal(context.collectable("https://grok.com/c/thread-1"), true);
  assert.equal(context.collectable("https://grok.com/chat/thread-1"), true);
  assert.equal(context.collectable("https://gemini.google.com/app/thread-1"), true);
  assert.equal(context.collectable("https://unknown.example/chat"), false, "unmatched hosts stay uncollectable");

  assert.equal(
    context.liveHref({
      dataset: {
        currentHref: "https://chatgpt.com/",
        currentThreadHref: "https://chatgpt.com/c/thread-1"
      },
      getAttribute: () => "https://chatgpt.com/",
      src: "https://chatgpt.com/"
    }, { url: "https://chatgpt.com/" }),
    "https://chatgpt.com/",
    "Summarize availability must follow the live home href, not a remembered thread"
  );

  const recoveredThread = context.frameBase({
    dataset: {
      instanceId: "chatgpt-1",
      currentHref: "https://chatgpt.com/",
      currentThreadHref: "https://chatgpt.com/c/thread-1"
    },
    getAttribute: () => "https://chatgpt.com/",
    src: "https://chatgpt.com/"
  }, { name: "ChatGPT", url: "https://chatgpt.com/" });
  assert.equal(
    recoveredThread.href,
    "https://chatgpt.com/c/thread-1",
    "a remembered conversation route must outrank a stale blank iframe attribute"
  );

  const collectSource = functionSource(source, "collectFrameSummary", true);
  const metadataProbe = collectSource.indexOf("let base = await summaryFrameMeta(iframe, app, index, { skipEnsure: true })");
  const skipResolution = collectSource.indexOf("let siteContext = resolveSiteContext()");
  const runtimePreparation = collectSource.indexOf("const coreReady = await prepareContentFrameRuntime(iframe)");
  assert.ok(metadataProbe >= 0, "Summary collection must probe live metadata before resolving an early skip");
  assert.ok(skipResolution >= 0, "Summary collection must resolve initial skip state");
  assert.ok(runtimePreparation >= 0, "Summary collection must retain runtime preparation for eligible pages");
  assert.ok(
    metadataProbe < skipResolution && skipResolution < runtimePreparation,
    "live metadata and favicon discovery must precede a skip, which must precede runtime repair"
  );

  assert.match(source, /async function collectLockedFrameSummary/);
  assert.match(source, /collectWorkspacePreviewItems[\s\S]*collectLockedFrameSummary\(iframe, index\)/);
  assert.match(source, /collectSummary[\s\S]*collectLockedFrameSummary\(iframe, index\)/);
  assert.match(source, /await persistRecordedFullText\(items\)/);
  assert.doesNotMatch(
    functionSource(source, "collectWorkspacePreviewItems", true),
    /withSummaryCollectionLock\(\(\) => collectFrameSummary/,
    "History live collection must isolate a throwing iframe instead of failing the whole batch"
  );

  console.log("Summary pre-runtime skip routing checks passed.");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
