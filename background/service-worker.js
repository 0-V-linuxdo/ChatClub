import { APP_NAME } from "../shared/constants.js";
import { buildDynamicDnrRules, contentScriptMatches } from "../shared/dnr.js";
import { getAllChatApps, loadCustomConfig, loadOptions, saveOptions } from "../shared/storage.js";
import { TOPIC_DELETE_SITE_CONFIGS, topicDeleteUserscriptLooksLikeBuiltIn } from "../shared/topic-delete-sites.js";

const PRELOAD_SCRIPT_ID = "chatclub-preload";
const SUMMARY_PAGE_SCRIPT_ID = "chatclub-summary-userscripts-main";
const SUMMARY_SCRIPT_ID = "chatclub-summary-userscripts";
const MESSAGE_NAVIGATOR_SCRIPT_ID = "chatclub-message-navigator";
const CONTENT_SCRIPT_ID = "chatclub-content";
const TOPIC_DELETE_USERSCRIPT_FILE_PATTERN = /^topic-delete-userscripts\/[a-z0-9-]+\.user\.js$/i;
const CONTENT_BRIDGE_FILES = Object.freeze([
  Object.freeze({ file: "content/preload.js", world: "MAIN" }),
  Object.freeze({ file: "content/message-navigator.js", world: "ISOLATED" }),
  Object.freeze({ file: "content/content.js", world: "ISOLATED" })
]);

function openableTabUrl(href) {
  try {
    const parsed = new URL(String(href || ""));
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

function normalizeOpenerTab(tab) {
  if (!tab || typeof tab.id !== "number") return null;
  return {
    id: tab.id,
    windowId: typeof tab.windowId === "number" ? tab.windowId : undefined,
    index: typeof tab.index === "number" ? tab.index : undefined
  };
}

async function resolveExplicitTab(openerTab) {
  const info = normalizeOpenerTab(openerTab);
  if (!info) return null;
  try {
    return await chrome.tabs.get(info.id);
  } catch {
    return info;
  }
}

async function resolveTargetTab(sender, openerTab) {
  const explicitTab = await resolveExplicitTab(openerTab);
  if (explicitTab?.id) return explicitTab;
  if (sender?.tab?.id) return sender.tab;
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tabs?.[0] || null;
  } catch {
    return null;
  }
}

function openTabCreateOptions(url, targetTab) {
  const createOptions = { url, active: true };
  if (targetTab?.windowId) {
    createOptions.windowId = targetTab.windowId;
    if (typeof targetTab.index === "number") createOptions.index = targetTab.index + 1;
    if (typeof targetTab.id === "number") createOptions.openerTabId = targetTab.id;
  }
  return createOptions;
}

async function focusCreatedTab(tab) {
  if (tab?.id) {
    try { await chrome.tabs.update(tab.id, { active: true }); } catch {}
  }
  if (tab?.windowId && chrome.windows?.update) {
    try { await chrome.windows.update(tab.windowId, { focused: true }); } catch {}
  }
}

async function openExternalTab(url, sender, openerTab) {
  const targetTab = await resolveTargetTab(sender, openerTab);
  try {
    const tab = await chrome.tabs.create(openTabCreateOptions(url, targetTab));
    await focusCreatedTab(tab);
    return tab;
  } catch {}
  if (targetTab?.id) {
    try {
      const duplicate = await chrome.tabs.duplicate(targetTab.id);
      if (duplicate?.id) {
        await chrome.tabs.update(duplicate.id, { url, active: true });
        await focusCreatedTab(duplicate);
        return duplicate;
      }
    } catch {}
  }
  const tab = await chrome.tabs.create({ url, active: true });
  await focusCreatedTab(tab);
  return tab;
}

function senderFrameTarget(sender) {
  const tabId = sender?.tab?.id;
  const frameId = sender?.frameId;
  if (typeof tabId !== "number") throw new Error("Cannot install Delete Site userscript: sender tab is unavailable");
  if (typeof frameId !== "number") throw new Error("Cannot install Delete Site userscript: sender frame is unavailable");
  return {
    tabId,
    frameIds: [frameId]
  };
}

function safeTopicDeleteUserscriptFile(file) {
  const value = String(file || "").trim();
  return TOPIC_DELETE_USERSCRIPT_FILE_PATTERN.test(value) ? value : "";
}

function canUsePackagedTopicDeleteUserscript(config = {}) {
  const builtIn = packagedTopicDeleteBuiltInConfig(config);
  if (!builtIn) return false;
  const source = String(config.customUserscript || config.userscript || "").trim();
  if (config?.sourceMode === "custom") return false;
  return config?.builtIn !== false
    && Boolean(safeTopicDeleteUserscriptFile(config.userscriptFile))
    && (config?.userscriptOverride !== true
      || !source
      || topicDeleteUserscriptLooksLikeBuiltIn(builtIn.id, source, builtIn.userscript, { allowSemantic: true }));
}

function packagedTopicDeleteBuiltInConfig(config = {}) {
  const id = String(config.id || "").trim();
  const file = safeTopicDeleteUserscriptFile(config.userscriptFile);
  if (!file) return null;
  return TOPIC_DELETE_SITE_CONFIGS.find((item) => item.id === id || item.userscriptFile === file) || null;
}

async function executePackagedTopicDeleteUserscript(target, file) {
  await chrome.scripting.executeScript({
    target,
    files: [file],
    world: "MAIN"
  });
}

function userScriptsUnavailableMessage(error) {
  const message = error?.message || String(error || "");
  const suffix = message ? ` (${message})` : "";
  return `Edited or custom standalone Delete Site userscripts require Chrome/Arc Allow User Scripts support. Enable Allow User Scripts for ChatClub, update the browser, or install this userscript in Tampermonkey/Violentmonkey.${suffix}`;
}

async function executeUserTopicDeleteUserscript(target, source) {
  if (!chrome.userScripts?.execute) throw new Error(userScriptsUnavailableMessage());
  try {
    await chrome.userScripts.execute({
      target,
      js: [{ code: source }],
      world: "MAIN",
      injectImmediately: true
    });
  } catch (error) {
    const message = error?.message || String(error);
    if (/\bworld\b|unexpected property/i.test(message)) {
      try {
        await chrome.userScripts.execute({
          target,
          js: [{ code: source }],
          injectImmediately: true
        });
        return;
      } catch (retryError) {
        throw new Error(userScriptsUnavailableMessage(retryError));
      }
    }
    throw new Error(userScriptsUnavailableMessage(error));
  }
}

const trustedInputSleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

function trustedClickTabId(message = {}, sender = {}) {
  if (Number.isInteger(message.tabId) && message.tabId >= 0) return message.tabId;
  if (Number.isInteger(sender?.tab?.id) && sender.tab.id >= 0) return sender.tab.id;
  return null;
}

async function dispatchTrustedClick(message = {}, sender = {}) {
  let tabId = trustedClickTabId(message, sender);
  if (typeof tabId !== "number") {
    try {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (Number.isInteger(tabs?.[0]?.id) && tabs[0].id >= 0) tabId = tabs[0].id;
    } catch {}
  }
  if (typeof tabId !== "number") throw new Error("Trusted browser click failed: target tab is unavailable");
  if (!chrome.debugger?.attach || !chrome.debugger?.sendCommand) {
    throw new Error("Trusted browser click requires the debugger permission");
  }
  const x = Number(message.x);
  const y = Number(message.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
    throw new Error("Trusted browser click failed: invalid viewport coordinates");
  }
  const target = { tabId };
  let attached = false;
  try {
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    const base = { x, y, button: "left", clickCount: 1, modifiers: 0 };
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { ...base, type: "mouseMoved", buttons: 0 });
    const reason = String(message.reason || "");
    const hoverSettleMs = Number.isFinite(Number(message.hoverSettleMs))
      ? Number(message.hoverSettleMs)
      : (/topic menu|menu trigger|hover/i.test(reason) || message.kind === "topic-menu-trigger" ? 260 : 80);
    await trustedInputSleep(Math.min(700, Math.max(0, hoverSettleMs)));
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { ...base, type: "mousePressed", buttons: 1 });
    await trustedInputSleep(45);
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { ...base, type: "mouseReleased", buttons: 0 });
    return { tabId, x, y };
  } catch (error) {
    const messageText = error?.message || String(error || "unknown debugger error");
    throw new Error(`Trusted browser click failed: ${messageText}`);
  } finally {
    if (attached) {
      try { await chrome.debugger.detach(target); } catch {}
    }
  }
}

async function dispatchTrustedMouseMove(message = {}, sender = {}) {
  let tabId = trustedClickTabId(message, sender);
  if (typeof tabId !== "number") {
    try {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (Number.isInteger(tabs?.[0]?.id) && tabs[0].id >= 0) tabId = tabs[0].id;
    } catch {}
  }
  if (typeof tabId !== "number") throw new Error("Trusted browser hover failed: target tab is unavailable");
  if (!chrome.debugger?.attach || !chrome.debugger?.sendCommand) {
    throw new Error("Trusted browser hover requires the debugger permission");
  }
  const x = Number(message.x);
  const y = Number(message.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
    throw new Error("Trusted browser hover failed: invalid viewport coordinates");
  }
  const target = { tabId };
  let attached = false;
  try {
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
      button: "none",
      buttons: 0,
      clickCount: 0,
      modifiers: 0
    });
    return { tabId, x, y };
  } catch (error) {
    const messageText = error?.message || String(error || "unknown debugger error");
    throw new Error(`Trusted browser hover failed: ${messageText}`);
  } finally {
    if (attached) {
      try { await chrome.debugger.detach(target); } catch {}
    }
  }
}

function trustedKeyModifiers(value = {}) {
  const explicit = Number(value?.modifiers);
  if (Number.isFinite(explicit)) return explicit;
  return (value?.altKey ? 1 : 0)
    | (value?.ctrlKey ? 2 : 0)
    | (value?.metaKey ? 4 : 0)
    | (value?.shiftKey ? 8 : 0);
}

function trustedKeyDescriptor(value = {}) {
  const source = typeof value === "string" ? { key: value } : (value || {});
  const key = String(source.key || "");
  const normalized = key.toLowerCase();
  const modifiers = trustedKeyModifiers(source);
  const withModifiers = (descriptor) => modifiers ? { ...descriptor, modifiers } : descriptor;
  if (normalized === "tab") return withModifiers({ key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 48 });
  if (normalized === "enter" || normalized === "return") return withModifiers({ key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 36 });
  if (normalized === "escape" || normalized === "esc") return withModifiers({ key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 53 });
  if (normalized === "backspace") return withModifiers({ key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 51 });
  if (normalized === "delete") return withModifiers({ key: "Delete", code: "Delete", windowsVirtualKeyCode: 46, nativeVirtualKeyCode: 117 });
  if (normalized === " " || normalized === "space" || normalized === "spacebar") return withModifiers({ key: " ", code: "Space", windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 49, text: " ", unmodifiedText: " " });
  return null;
}

async function dispatchTrustedKeySequence(message = {}, sender = {}) {
  let tabId = trustedClickTabId(message, sender);
  if (typeof tabId !== "number") {
    try {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (Number.isInteger(tabs?.[0]?.id) && tabs[0].id >= 0) tabId = tabs[0].id;
    } catch {}
  }
  if (typeof tabId !== "number") throw new Error("Trusted browser key sequence failed: target tab is unavailable");
  if (!chrome.debugger?.attach || !chrome.debugger?.sendCommand) {
    throw new Error("Trusted browser key sequence requires the debugger permission");
  }
  const rawKeys = Array.isArray(message.keys) ? message.keys : [];
  const keys = rawKeys
    .map((item) => ({ descriptor: trustedKeyDescriptor(item), settleMs: Number(item?.settleMs) }))
    .filter((item) => item.descriptor);
  if (!keys.length) throw new Error("Trusted browser key sequence failed: no supported keys were provided");
  const target = { tabId };
  let attached = false;
  try {
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    for (const item of keys) {
      const modifiers = Number.isFinite(Number(item.descriptor.modifiers)) ? Number(item.descriptor.modifiers) : 0;
      const event = { ...item.descriptor, modifiers, autoRepeat: false, isKeypad: false };
      await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", { ...event, type: "keyDown" });
      await trustedInputSleep(35);
      await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", { ...event, type: "keyUp" });
      const settleMs = Number.isFinite(item.settleMs) ? item.settleMs : Number(message.keySettleMs);
      await trustedInputSleep(Math.min(900, Math.max(45, Number.isFinite(settleMs) ? settleMs : 120)));
    }
    return { tabId, keys: keys.map((item) => item.descriptor.key) };
  } catch (error) {
    const messageText = error?.message || String(error || "unknown debugger error");
    throw new Error(`Trusted browser key sequence failed: ${messageText}`);
  } finally {
    if (attached) {
      try { await chrome.debugger.detach(target); } catch {}
    }
  }
}

function urlHost(value) {
  try {
    return new URL(String(value || "")).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function frameMatchesBridgeHints(frame = {}, hints = {}) {
  const url = String(frame.url || "");
  if (!/^https?:\/\//i.test(url)) return false;
  const frameHost = urlHost(url);
  if (!frameHost) return false;
  const hosts = new Set((hints.hosts || []).map(urlHost).filter(Boolean));
  for (const href of hints.hrefs || []) {
    const host = urlHost(href);
    if (host) hosts.add(host);
  }
  if (!hosts.size) return true;
  for (const host of hosts) {
    if (frameHost === host || frameHost.endsWith(`.${host}`) || host.endsWith(`.${frameHost}`)) return true;
  }
  return false;
}

async function executeContentBridgeFile(tabId, frameId, spec) {
  return chrome.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    files: [spec.file],
    world: spec.world
  });
}

async function ensureContentBridge(message = {}, sender = {}) {
  const tabId = trustedClickTabId(message, sender);
  if (typeof tabId !== "number") throw new Error("Content bridge injection failed: target tab is unavailable");
  const hints = {
    hrefs: Array.isArray(message.hrefs) ? message.hrefs : [],
    hosts: Array.isArray(message.hosts) ? message.hosts : []
  };
  let frames = [];
  try {
    frames = await chrome.webNavigation.getAllFrames({ tabId });
  } catch {}
  const frameIds = (frames || [])
    .filter((frame) => Number.isInteger(frame?.frameId) && frame.frameId > 0)
    .filter((frame) => frameMatchesBridgeHints(frame, hints))
    .map((frame) => frame.frameId);
  const uniqueFrameIds = Array.from(new Set(frameIds));
  const errors = [];
  let injected = 0;
  if (!uniqueFrameIds.length && frames?.length) {
    errors.push("no matching web iframe found for the requested Delete Site target");
  }
  for (const frameId of uniqueFrameIds) {
    for (const spec of CONTENT_BRIDGE_FILES) {
      try {
        await executeContentBridgeFile(tabId, frameId, spec);
        injected += 1;
      } catch (error) {
        errors.push(`${spec.file}@${frameId}: ${error?.message || String(error)}`);
      }
    }
  }
  if (!uniqueFrameIds.length && !frames?.length) {
    try {
      for (const spec of CONTENT_BRIDGE_FILES) {
        await chrome.scripting.executeScript({
          target: { tabId, allFrames: true },
          files: [spec.file],
          world: spec.world
        });
        injected += 1;
      }
    } catch (error) {
      errors.push(error?.message || String(error));
    }
  }
  return { tabId, frameIds: uniqueFrameIds, injected, errors };
}

async function installTopicDeleteUserscript(config = {}, sender = {}) {
  const target = senderFrameTarget(sender);
  if (canUsePackagedTopicDeleteUserscript(config)) {
    const file = safeTopicDeleteUserscriptFile(config.userscriptFile);
    await executePackagedTopicDeleteUserscript(target, file);
    return { mode: "packaged", file };
  }
  const source = String(config.customUserscript || config.userscript || "").trim();
  if (!/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/.test(source)) {
    throw new Error("Legacy bridge snippets are unsupported under MV3 CSP; convert this Delete Site to a standalone userscript.");
  }
  await executeUserTopicDeleteUserscript(target, source);
  return { mode: "userScripts" };
}

async function currentChatApps() {
  const customConfig = await loadCustomConfig();
  return getAllChatApps(customConfig);
}

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

async function currentContentScriptTargets() {
  const customConfig = await loadCustomConfig();
  const options = await loadOptions();
  return [
    ...getAllChatApps(customConfig),
    ...summaryCollectorContentTargets(options),
    ...topicDeleteContentTargets(options),
    ...messageNavigatorContentTargets(options)
  ];
}

async function updateDnrRules() {
  const chatApps = await currentChatApps();
  const extensionHost = new URL(chrome.runtime.getURL("")).hostname;
  const rules = buildDynamicDnrRules(chatApps, extensionHost);
  const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: oldRules.map((rule) => rule.id),
    addRules: rules
  });
}

async function registerContentScripts() {
  const matches = contentScriptMatches(await currentContentScriptTargets());
  try {
    const registered = await chrome.scripting.getRegisteredContentScripts();
    const ownIds = registered
      .map((script) => script.id)
      .filter((id) => id === PRELOAD_SCRIPT_ID || id === SUMMARY_PAGE_SCRIPT_ID || id === SUMMARY_SCRIPT_ID || id === MESSAGE_NAVIGATOR_SCRIPT_ID || id === CONTENT_SCRIPT_ID);
    if (ownIds.length) await chrome.scripting.unregisterContentScripts({ ids: ownIds });
  } catch (error) {
    console.warn(`[${APP_NAME}] Failed to unregister content scripts`, error);
  }

  await chrome.scripting.registerContentScripts([
    {
      id: PRELOAD_SCRIPT_ID,
      matches,
      js: ["content/preload.js"],
      allFrames: true,
      runAt: "document_start",
      world: "MAIN"
    },
    {
      id: SUMMARY_PAGE_SCRIPT_ID,
      matches,
      js: ["content/summary-userscripts-main.js"],
      allFrames: true,
      runAt: "document_idle",
      world: "MAIN"
    },
    {
      id: SUMMARY_SCRIPT_ID,
      matches,
      js: ["content/summary-userscripts.js"],
      allFrames: true,
      runAt: "document_idle"
    },
    {
      id: MESSAGE_NAVIGATOR_SCRIPT_ID,
      matches,
      js: ["content/message-navigator.js"],
      allFrames: true,
      runAt: "document_idle"
    },
    {
      id: CONTENT_SCRIPT_ID,
      matches,
      js: ["content/content.js"],
      allFrames: true,
      runAt: "document_idle"
    }
  ]);
}

let runtimeConfigReloadChain = Promise.resolve();

function reloadRuntimeConfig() {
  runtimeConfigReloadChain = runtimeConfigReloadChain
    .catch(() => {})
    .then(() => Promise.all([updateDnrRules(), registerContentScripts()]));
  return runtimeConfigReloadChain;
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.remove(["clientId", "sessionData"]);
  await loadOptions();
  await reloadRuntimeConfig();
});

chrome.runtime.onStartup?.addListener(() => {
  reloadRuntimeConfig().catch((error) => console.error(`[${APP_NAME}] startup reload failed`, error));
});

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("chatClub.html") });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.source !== "chatclub") return false;
  (async () => {
    if (message.action === "reloadConfigs") {
      await reloadRuntimeConfig();
      sendResponse({ success: true });
      return;
    }
    if (message.action === "getConfigInfo") {
      sendResponse({
        options: await loadOptions(),
        customConfig: await loadCustomConfig(),
        contentScripts: await chrome.scripting.getRegisteredContentScripts()
      });
      return;
    }
    if (message.action === "resetConfig") {
      await chrome.storage.local.clear();
      const options = await saveOptions({});
      await reloadRuntimeConfig();
      sendResponse({ success: true, options });
      return;
    }
    if (message.action === "installTopicDeleteUserscript") {
      const result = await installTopicDeleteUserscript(message.config || {}, sender);
      sendResponse({ success: true, ...result });
      return;
    }
    if (message.action === "ensureContentBridge") {
      const result = await ensureContentBridge(message, sender);
      sendResponse({ success: true, ...result });
      return;
    }
    if (message.action === "dispatchTrustedClick") {
      const result = await dispatchTrustedClick(message, sender);
      sendResponse({ success: true, ...result });
      return;
    }
    if (message.action === "dispatchTrustedMouseMove") {
      const result = await dispatchTrustedMouseMove(message, sender);
      sendResponse({ success: true, ...result });
      return;
    }
    if (message.action === "dispatchTrustedKeySequence") {
      const result = await dispatchTrustedKeySequence(message, sender);
      sendResponse({ success: true, ...result });
      return;
    }
    if (message.action === "openTab") {
      const url = openableTabUrl(message.url);
      if (!url) {
        sendResponse({ success: false, error: "Invalid tab URL" });
        return;
      }
      await openExternalTab(url, sender, message.openerTab);
      sendResponse({ success: true });
      return;
    }
    sendResponse({ success: false, error: `Unknown action: ${message.action}` });
  })().catch((error) => sendResponse({ success: false, error: error.message || String(error) }));
  return true;
});

reloadRuntimeConfig().catch((error) => console.error(`[${APP_NAME}] initial reload failed`, error));
