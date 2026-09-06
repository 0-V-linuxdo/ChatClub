#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const { functionSource } = require("./function-source.cjs");

const runtime = read("app/runtime.js");
const workspace = read("app/workspace/controller.js");
const topbar = read("app/topbar/controller.js");
const topbarView = read("app/topbar/view.js");
const viewController = read("app/workspace/view-controller.js");
const tabContextMenu = read("app/workspace/tab-context-menu.js");
const frameControllerSource = read("app/workspace/frame-controller.js");

const APPS = {
  Grok: { id: "Grok", name: "Grok", url: "https://grok.com/" },
  Kagi: { id: "Kagi", name: "Kagi Assistant", url: "https://assistant.kagi.com/" },
  NotionAI: { id: "NotionAI", name: "Notion AI", url: "https://www.notion.so/ai" },
  ChatGPT: { id: "ChatGPT", name: "ChatGPT", url: "https://chatgpt.com/" }
};

function noop() {}

(async () => {
  if (typeof globalThis.HTMLIFrameElement !== "function") {
    globalThis.HTMLIFrameElement = class HTMLIFrameElement {};
  }

  const { createWorkspaceFrameController } = await import(
    pathToFileURL(path.join(root, "app/workspace/frame-controller.js")).href
  );
  const { TOPIC_DELETE_SITE_CONFIGS } = await import(
    pathToFileURL(path.join(root, "shared/topic-delete-sites.js")).href
  );

  function createFrameController(topicDeleteSiteConfigs) {
    return createWorkspaceFrameController({
      state: { options: { topicDeleteSiteConfigs } },
      services: {
        appById: (id) => APPS[id] || null,
        discoverDeclaredFaviconUrl: noop,
        effectiveFaviconUrl: () => "",
        executeTopicDelete: async () => ({ ok: true }),
        inferAppName: (app) => String(app?.name || app?.id || ""),
        notify: noop,
        onFrameLifecycleChange: noop,
        openTabUrl: noop,
        openableTabUrl: (value) => {
          try {
            const parsed = new URL(String(value || ""));
            return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
          } catch {
            return "";
          }
        },
        prepareContentFrameRuntime: async () => ({ ok: true }),
        recordFunctionalAnomaly: async () => null,
        rememberFaviconUrl: noop,
        requestTopicDeletePermission: async () => true,
        sendToContentFrame: async () => ({}),
        svgIcon: noop
      },
      registry: { frameApp: (iframe) => APPS[iframe?.dataset?.appId] || null, frameForInstance: () => null },
      session: { preserveCurrentWorkspaceForNewChat: async () => null, rememberWorkspaceSession: noop },
      layout: { persistLayout: async () => {}, shortcutLabel: () => "" },
      view: {
        closePopovers: noop,
        ensureFrameAttributeContract: () => false,
        fullscreenButtonMeta: () => ({}),
        syncGridColumnClass: noop,
        syncGridColumns: noop,
        syncHeaderForFrameInstance: noop,
        syncTabGroupHeaderControls: noop
      }
    });
  }

  const frame = createFrameController(TOPIC_DELETE_SITE_CONFIGS);

  function capability(appId, currentHref) {
    return frame.topicDeleteCapabilityForFrame(null, { appId, currentHref });
  }

  function hasDeletable(frames) {
    return frames.some((item) => capability(item.appId, item.currentHref).available);
  }

  const emptyDesk = [
    { appId: "Grok", currentHref: "https://grok.com/" },
    { appId: "Kagi", currentHref: "https://assistant.kagi.com/" },
    { appId: "NotionAI", currentHref: "https://www.notion.so/ai" }
  ];
  assert.equal(hasDeletable(emptyDesk), false, "Grok / Kagi / Notion home pages must not be deletable");
  assert.equal(
    hasDeletable([
      { appId: "Grok", currentHref: "https://grok.com/chat" },
      { appId: "Kagi", currentHref: "https://assistant.kagi.com/" },
      { appId: "NotionAI", currentHref: "https://www.notion.so/ai" }
    ]),
    false,
    "Grok /chat empty shells must not light batch delete"
  );
  assert.equal(capability("Grok", "https://grok.com/").available, false);
  assert.equal(capability("Grok", "https://grok.com/chat").available, false, "Grok /chat without an id is an empty shell, not a conversation");
  assert.equal(capability("Kagi", "https://assistant.kagi.com/").available, false);
  assert.equal(capability("NotionAI", "https://www.notion.so/ai").available, false);
  assert.equal(capability("NotionAI", "https://www.notion.so/chat").available, false);
  assert.equal(capability("ChatGPT", "https://chatgpt.com/").available, false);

  assert.equal(capability("Grok", "https://grok.com/c/conversation-id").available, true);
  assert.equal(capability("Grok", "https://grok.com/chat/conversation-id").available, true);
  assert.equal(capability("Kagi", "https://assistant.kagi.com/chat/abc").available, true);
  assert.equal(capability("NotionAI", "https://www.notion.so/chat?t=thread").available, true);
  assert.equal(capability("ChatGPT", "https://chatgpt.com/c/conversation-id").available, true);
  assert.equal(
    hasDeletable([
      ...emptyDesk.slice(0, 2),
      { appId: "Grok", currentHref: "https://grok.com/c/conversation-id" }
    ]),
    true,
    "one conversation among empty homes must keep batch delete available"
  );

  const disabledSite = createFrameController(TOPIC_DELETE_SITE_CONFIGS.map((site) => (
    site.id === "grok" ? { ...site, enabled: false } : site
  )));
  assert.equal(
    disabledSite.topicDeleteCapabilityForFrame(null, {
      appId: "Grok",
      currentHref: "https://grok.com/c/conversation-id"
    }).available,
    false,
    "a disabled Delete Site must remain undeletable even on a conversation URL"
  );

  assert.match(
    workspace,
    /function hasDeletableActiveThreads\(\) \{\s*return currentFrames\(\)\.some\(\(iframe\) => frameController\.topicDeleteCapabilityForFrame\(iframe\)\.available\);/,
    "workspace Delete Topics availability must be the active-frame capability any()"
  );
  assert.match(
    runtime,
    /createBindOnceControllerPort\("Workspace", \[[\s\S]*?"hasDeletableActiveThreads"[\s\S]*?\]\)/,
    "the topbar workspace port must expose hasDeletableActiveThreads before workspaceController exists"
  );
  assert.doesNotMatch(
    runtime,
    /canDeleteThread:/,
    "runtime must not put delete availability on topbar actions; topbar is constructed first"
  );
  assert.match(topbar, /canDeleteThread:\s*\(\)\s*=>\s*workspace\.hasDeletableActiveThreads\(\)/);
  assert.match(functionSource(topbar, "runMenuItem"), /if \(!workspace\.hasDeletableActiveThreads\(\)\) return;/);
  assert.match(
    functionSource(topbarView, "renderItem"),
    /button\.disabled = !actions\.canDeleteThread\(\)/
  );
  assert.match(
    functionSource(viewController, "renderDeleteThreadButton"),
    /button\.disabled = !topicDeleteCapabilityForFrame\(iframe, \{ appId: chat\?\.appId \|\| "" \}\)\.available/,
    "topbar disable must stay aligned with the column-header trash"
  );
  assert.match(tabContextMenu, /const deleteThreadDisabled = !topicDeleteCapabilityForFrame\(activeFrame, activeFallback\)\.available/);
  assert.match(
    functionSource(frameControllerSource, "topicDeleteCapabilityForFrame"),
    /!threadHrefFromLocation\(payload\.currentHref\)/,
    "Delete availability must follow conversation identity, not only the narrow known-home path list"
  );

  const deleteThreadOnFrames = functionSource(runtime, "deleteThreadOnFrames");
  assert.match(deleteThreadOnFrames, /hasDeletableActiveThreads\(\)/);
  assert.ok(
    deleteThreadOnFrames.indexOf("hasDeletableActiveThreads()")
      < deleteThreadOnFrames.indexOf("requestFeatureUserScriptsPermission"),
    "empty desks must not request User Scripts permission"
  );
  assert.doesNotMatch(deleteThreadOnFrames, /toast\.deleteThreadSkipped/);
  assert.match(functionSource(runtime, "finishDeleteThreadOnFrames"), /toast\.deleteThreadSkipped/);
  assert.match(
    functionSource(runtime, "handleWorkspaceFrameLifecycleChange"),
    /topbarController\.syncDeleteThreadState\(\)/
  );

  console.log("topbar delete-thread empty-home state: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
