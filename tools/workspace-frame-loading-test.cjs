#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const { functionSource } = require("./function-source.cjs");
const PARAM = "__chatclub_frame_load_nonce";

(async () => {
  const { frameLoadingKindForTarget } = await import("../app/workspace/frame-loading.js");
  const {
    navigableChatFrameHref,
    notionFrameLoadTarget,
    restorableChatFrameHref,
    stripNotionFrameLoadNonce
  } = await import("../shared/chat-frame-config.js");
  const FRAME_LOADING_KIND_NEW_TOPIC = "new-topic";
  const FRAME_LOADING_KIND_RESTORING = "restoring";
  const { setLanguage, t } = await import("../shared/i18n.js");

  const chatGpt = {
    id: "ChatGPT",
    name: "ChatGPT",
    source: "builtin",
    url: "https://chatgpt.com/"
  };
  assert.equal(
    frameLoadingKindForTarget(chatGpt, "https://chatgpt.com/#temporary"),
    FRAME_LOADING_KIND_NEW_TOPIC,
    "the configured home must ignore fragments"
  );
  assert.equal(
    frameLoadingKindForTarget(chatGpt, "https://chatgpt.com/c/restored-thread"),
    FRAME_LOADING_KIND_RESTORING,
    "a restored conversation route must be classified as restoring"
  );
  assert.equal(
    frameLoadingKindForTarget(chatGpt, "https://chatgpt.com///#snapshot-home"),
    FRAME_LOADING_KIND_NEW_TOPIC,
    "a home URL recovered from a workspace snapshot must normalize trailing slashes"
  );
  assert.equal(
    frameLoadingKindForTarget(
      { id: "Claude", name: "Claude", source: "builtin", url: "https://claude.ai/" },
      "https://claude.ai/new/"
    ),
    FRAME_LOADING_KIND_NEW_TOPIC,
    "a known empty-conversation route must be recognized independently of the configured home"
  );
  assert.equal(
    frameLoadingKindForTarget(
      { id: "NotionAI", name: "Notion AI", source: "builtin", url: "https://app.notion.com/ai" },
      "https://app.notion.com/chat?t=thread-id"
    ),
    FRAME_LOADING_KIND_RESTORING,
    "a Notion route with a conversation identity must not be treated as empty"
  );

  const custom = {
    id: "custom-query-home",
    name: "Custom Query Home",
    source: "custom",
    url: "https://example.test/start/?mode=new#configured"
  };
  assert.equal(
    frameLoadingKindForTarget(custom, "https://example.test/start?mode=new#runtime"),
    FRAME_LOADING_KIND_NEW_TOPIC,
    "custom homes must ignore fragments and normalize their trailing slash"
  );
  assert.equal(
    frameLoadingKindForTarget(custom, "https://example.test/start?mode=history"),
    FRAME_LOADING_KIND_RESTORING,
    "custom-home query values must remain semantically significant"
  );
  assert.equal(
    frameLoadingKindForTarget(custom, "https://example.test/start"),
    FRAME_LOADING_KIND_RESTORING,
    "dropping a custom-home query must not be mistaken for the configured home"
  );
  assert.equal(frameLoadingKindForTarget(custom, "not a URL"), FRAME_LOADING_KIND_RESTORING);

  setLanguage("en");
  assert.equal(t("chat.frameLoadingRestoring"), "Restoring...");
  assert.equal(t("chat.frameLoadingNewTopic"), "New topic");
  setLanguage("zh_CN");
  assert.equal(t("chat.frameLoadingRestoring"), "恢复中...");
  assert.equal(t("chat.frameLoadingNewTopic"), "新话题");

  const frameController = read("app/workspace/frame-controller.js");
  const beginFrameLoading = functionSource(frameController, "beginFrameLoading");
  const completeFrameLoading = functionSource(frameController, "completeFrameLoading");
  const frameLoadPlan = functionSource(frameController, "frameLoadPlan");
  const notionFramePreflightId = functionSource(frameController, "notionFramePreflightId");
  const preparedFrameNavigationUrl = functionSource(frameController, "preparedFrameNavigationUrl");
  const rememberFrameLocation = functionSource(frameController, "rememberFrameLocation");
  const assignFrameSrc = functionSource(frameController, "assignFrameSrc");
  const setFrameSrcAfterPrepare = functionSource(frameController, "setFrameSrcAfterPrepare");
  const preparePlannedFrameLoad = functionSource(frameController, "preparePlannedFrameLoad");
  const activeHref = functionSource(frameController, "activeHref");
  assert.match(beginFrameLoading, /iframe\.dataset\.frameLoadingKind = frameLoadingKindForTarget/);
  assert.match(assignFrameSrc, /beginFrameLoading\(iframe, plan\.logicalUrl\)/);
  assert.match(setFrameSrcAfterPrepare, /beginFrameLoading\(iframe, plan\.logicalUrl, true\)/);
  assert.match(rememberFrameLocation, /openableFrameUrl\(meta\.href \|\| meta\.url\)/);
  assert.match(activeHref, /return currentHref/);
  assert.match(preparePlannedFrameLoad, /Promise\.race\(\[request, deadline\]\)/);
  assert.match(preparePlannedFrameLoad, /cancelNotionFrameLoad\(plan\.requestUrl, plan\.preflightId\)/);
  assert.ok(
    completeFrameLoading.indexOf('frameLoadPending === "1"')
      < completeFrameLoading.indexOf("delete iframe.dataset.frameLoadingKind"),
    "the initial about:blank load must retain its pending kind until the real page loads"
  );
  assert.ok(
    setFrameSrcAfterPrepare.indexOf("delete iframe.dataset.frameLoadPending")
      < setFrameSrcAfterPrepare.indexOf('iframe.setAttribute("src", navigationUrl)'),
    "the real navigation must still release the about:blank marker immediately before assignment"
  );
  assert.ok(
    setFrameSrcAfterPrepare.indexOf("iframe.dataset.currentHref = plan.logicalUrl")
      < setFrameSrcAfterPrepare.indexOf("preparePlannedFrameLoad(plan)"),
    "workspace snapshots must see the logical Notion URL before the nonce-bearing preflight can complete"
  );

  const planContext = vm.createContext({
    URL,
    Uint8Array,
    grokCookieBridgeUrl: () => false,
    grokFramePreflightId: () => "",
    notionFrameLoadTarget,
    navigableFrameUrl: (app, value) => navigableChatFrameHref(app, value),
    crypto: {
      getRandomValues(bytes) {
        bytes.fill(0xab);
        return bytes;
      }
    }
  });
  vm.runInContext(`
    ${notionFramePreflightId}
    ${frameLoadPlan}
    ${preparedFrameNavigationUrl}
    const notionApp = { id: "NotionAI", source: "builtin", url: "https://app.notion.com/ai" };
    globalThis.planFrame = (value) => frameLoadPlan(value, notionApp);
    globalThis.preparedUrl = preparedFrameNavigationUrl;
  `, planContext);
  const notionPlan = planContext.planFrame("https://app.notion.com/ai#composer");
  assert.equal(notionPlan.logicalUrl, "https://app.notion.com/ai#composer");
  assert.match(notionPlan.preflightId, /^ccn-[a-f0-9]{32}$/);
  assert.equal(notionPlan.notionPreflight, true);
  assert.match(notionPlan.requestUrl, /__chatclub_frame_load_nonce=ccn-[a-f0-9]{32}/);
  assert.equal(
    frameLoadingKindForTarget(
      { id: "NotionAI", name: "Notion AI", source: "builtin", url: "https://app.notion.com/ai" },
      notionPlan.logicalUrl
    ),
    FRAME_LOADING_KIND_NEW_TOPIC,
    "the transient nonce must not misclassify the configured Notion home as a restored conversation"
  );
  assert.equal(
    planContext.preparedUrl(notionPlan, true),
    notionPlan.requestUrl
  );
  assert.equal(
    planContext.preparedUrl(notionPlan, false),
    notionPlan.logicalUrl,
    "an unavailable bypass must navigate only once to the logical URL"
  );
  const unsafeNotionPlan = planContext.planFrame("https://app.notion.com/logout");
  assert.equal(unsafeNotionPlan.logicalUrl, "https://app.notion.com/ai");
  assert.equal(unsafeNotionPlan.notionPreflight, true);
  assert.ok(!unsafeNotionPlan.requestUrl.includes("/logout"));
  const customNotionPlan = vm.runInContext(`frameLoadPlan(
    "https://app.notion.com/custom?mode=custom#keep",
    { id: "NotionAI", source: "custom", chatAppSource: "custom", url: "https://app.notion.com/custom" }
  )`, planContext);
  assert.equal(customNotionPlan.logicalUrl, "https://app.notion.com/custom?mode=custom#keep");
  assert.equal(customNotionPlan.notionPreflight, true, "custom Notion UI routes must retain the exact-host preflight");

  {
    let resolvePreparation;
    const cancellationCalls = [];
    const timers = new Map();
    let nextTimer = 0;
    const deadlineContext = vm.createContext({
      clearTimeout(id) { timers.delete(id); },
      cancelNotionFrameLoad(url, preflightId) { cancellationCalls.push({ url, preflightId }); },
      prepareFrameLoad() { return new Promise((resolve) => { resolvePreparation = resolve; }); },
      setTimeout(callback, timeoutMs) {
        const id = ++nextTimer;
        timers.set(id, { callback, timeoutMs });
        return id;
      }
    });
    vm.runInContext(`
      const NOTION_FRAME_PREFLIGHT_DEADLINE_MS = 8000;
      ${preparePlannedFrameLoad}
      globalThis.prepare = preparePlannedFrameLoad;
    `, deadlineContext);
    const pending = deadlineContext.prepare(notionPlan);
    const deadline = [...timers.values()][0];
    assert.equal(deadline.timeoutMs, 8_000, "Notion PREPARE must have a hard caller-side deadline");
    deadline.callback();
    await assert.rejects(pending, /Notion frame preflight timed out/);
    assert.deepEqual(cancellationCalls, [{ url: notionPlan.requestUrl, preflightId: notionPlan.preflightId }]);
    resolvePreparation({ late: true });
    await new Promise((resolve) => { setImmediate(resolve); });
    assert.equal(cancellationCalls.length, 1, "a late PREPARE response must not cause a second fallback or navigation");
  }

  const sessionController = read("app/workspace/session-controller.js");
  const currentHrefForWorkspaceTab = functionSource(sessionController, "currentHrefForWorkspaceTab");
  assert.match(currentHrefForWorkspaceTab, /restorableChatFrameHref/);
  {
    const rawHref = notionPlan.requestUrl;
    const iframe = { dataset: { currentHref: rawHref }, getAttribute: () => rawHref };
    const sessionContext = vm.createContext({
      appById: () => ({ id: "NotionAI", source: "builtin", url: "https://app.notion.com/ai" }),
      frameForInstance: () => iframe,
      openableTabUrl: (value) => String(value || ""),
      restorableChatFrameHref
    });
    vm.runInContext(`${currentHrefForWorkspaceTab}\nglobalThis.currentHref = currentHrefForWorkspaceTab;`, sessionContext);
    assert.equal(
      sessionContext.currentHref({ instanceId: "notion-frame", appId: "NotionAI", initialHref: rawHref }),
      "https://app.notion.com/ai",
      "workspace storage.session capture must strip the transient nonce and transient home state"
    );
    iframe.dataset.currentHref = "https://app.notion.com/logout";
    assert.equal(
      sessionContext.currentHref({ instanceId: "notion-frame", appId: "NotionAI" }),
      "https://app.notion.com/ai",
      "an unsafe live Notion route must be healed before workspace capture"
    );
  }

  const frameBridgeController = read("app/frame-bridge/controller.js");
  const contentFrameHrefHints = functionSource(frameBridgeController, "contentFrameHrefHints");
  assert.match(frameBridgeController, /import \{ stripNotionFrameLoadNonce \}/);
  {
    const hintsContext = vm.createContext({ stripNotionFrameLoadNonce });
    vm.runInContext(`${contentFrameHrefHints}\nglobalThis.hints = contentFrameHrefHints;`, hintsContext);
    const iframe = {
      dataset: { currentHref: notionPlan.logicalUrl, currentThreadHref: "" },
      src: notionPlan.requestUrl,
      getAttribute: () => notionPlan.requestUrl
    };
    const hints = hintsContext.hints(iframe, { url: "https://app.notion.com/ai" });
    assert.ok(hints.includes(notionPlan.logicalUrl));
    assert.ok(hints.every((href) => !href.includes(PARAM)), "frame registration href hints must not expose the nonce");
  }

  class FakeIframe {
    constructor() {
      this.dataset = { instanceId: "frame-1", appId: "ChatGPT" };
    }
  }
  let loading = false;
  let syncCalls = 0;
  const lifecycleContext = vm.createContext({
    HTMLIFrameElement: FakeIframe,
    appById: () => chatGpt,
    frameApp: () => chatGpt,
    frameIsLoading: () => loading,
    frameLoadingKindForTarget,
    rememberBrowserFrameId() {},
    setFrameLoading(_iframe, next) { loading = next; },
    syncHeaderForFrameInstance() { syncCalls += 1; }
  });
  vm.runInContext(`
    ${beginFrameLoading}
    ${completeFrameLoading}
    globalThis.begin = beginFrameLoading;
    globalThis.complete = completeFrameLoading;
  `, lifecycleContext);
  const iframe = new FakeIframe();
  lifecycleContext.begin(iframe, chatGpt.url, true);
  assert.equal(iframe.dataset.frameLoadingKind, FRAME_LOADING_KIND_NEW_TOPIC);
  assert.equal(iframe.dataset.frameLoadPending, "1");
  assert.equal(loading, true);
  lifecycleContext.complete(iframe);
  assert.equal(loading, true, "about:blank must not publish a completed loading edge");
  assert.equal(iframe.dataset.frameLoadingKind, FRAME_LOADING_KIND_NEW_TOPIC);
  delete iframe.dataset.frameLoadPending;
  lifecycleContext.begin(iframe, "https://chatgpt.com/c/next-thread");
  assert.equal(iframe.dataset.frameLoadingKind, FRAME_LOADING_KIND_RESTORING);
  assert.equal(syncCalls, 1, "a new target kind must refresh the active card even if it was already loading");
  lifecycleContext.complete(iframe);
  assert.equal(loading, false);
  assert.equal(iframe.dataset.frameLoadingKind, undefined, "the target kind must remain transient");

  const viewController = read("app/workspace/view-controller.js");
  const frameLoadingStatusText = functionSource(viewController, "frameLoadingStatusText");
  const syncFrameLoadingStatus = functionSource(viewController, "syncFrameLoadingStatus");
  const replaceChatFrame = functionSource(viewController, "replaceChatFrame");
  const refreshChatTabPresentations = functionSource(viewController, "refreshChatTabPresentations");
  const reconcileAppCatalogDom = functionSource(viewController, "reconcileAppCatalogDom");
  const activateChatTab = functionSource(frameController, "activateChatTab");
  assert.ok(
    activateChatTab.indexOf('frame.classList.toggle("active"')
      < activateChatTab.indexOf("syncTabGroupHeaderControls(card, group)"),
    "tab activation must select the new iframe before synchronizing its loading message"
  );
  assert.match(syncFrameLoadingStatus, /\.chat-frame\.active/);
  assert.match(syncFrameLoadingStatus, /frame === activeFrame && loading/);
  assert.ok(
    replaceChatFrame.indexOf("iframe.replaceWith(replacement)")
      < replaceChatFrame.indexOf("syncHeaderForFrameInstance(chat.instanceId)"),
    "a replacement frame must be mounted before its loading kind refreshes the card status"
  );
  assert.doesNotMatch(
    refreshChatTabPresentations,
    /iframe\.replaceWith\(renderChatFrame/,
    "source changes must use the replacement lifecycle so their loading kind is published"
  );
  assert.match(refreshChatTabPresentations, /replaceChatFrame\(group, chat, iframe\)/);
  assert.doesNotMatch(
    reconcileAppCatalogDom,
    /currentFrame\.replaceWith\(renderChatFrame/,
    "catalog source changes must use the replacement lifecycle so their loading kind is published"
  );
  assert.match(reconcileAppCatalogDom, /replaceChatFrame\(group, chat, currentFrame\)/);

  let activeFrame = {
    dataset: { frameLoadingKind: FRAME_LOADING_KIND_NEW_TOPIC },
    attributes: new Map(),
    setAttribute(name, value) { this.attributes.set(name, value); }
  };
  let activeLoading = true;
  const status = { hidden: true, textContent: "", dataset: {} };
  const frameWrap = {
    querySelector(selector) {
      if (selector === ".chat-frame.active") return activeFrame;
      if (selector === ".chat-frame-loading-status") return status;
      return null;
    },
    querySelectorAll(selector) {
      return selector === ".chat-frame" ? [activeFrame] : [];
    }
  };
  const pendingAnnouncements = [];
  const card = { querySelector: (selector) => selector === ".chat-frame-wrap" ? frameWrap : null };
  const presentationContext = vm.createContext({
    frameLoadingAnnouncementSequence: 0,
    activeFrameIsLoading: () => activeLoading,
    queueMicrotask(callback) { pendingAnnouncements.push(callback); },
    t: (key) => ({
      "chat.frameLoadingNewTopic": "New topic",
      "chat.frameLoadingRestoring": "Restoring..."
    })[key]
  });
  vm.runInContext(`
    ${frameLoadingStatusText}
    ${syncFrameLoadingStatus}
    globalThis.sync = syncFrameLoadingStatus;
  `, presentationContext);
  presentationContext.sync(card, {});
  assert.equal(status.hidden, false);
  assert.equal(status.textContent, "", "the live region must be exposed before its announcement text changes");
  assert.equal(pendingAnnouncements.length, 1);
  pendingAnnouncements.shift()();
  assert.equal(status.textContent, "New topic");
  assert.equal(activeFrame.attributes.get("aria-busy"), "true");
  activeFrame = { dataset: { frameLoadingKind: FRAME_LOADING_KIND_RESTORING } };
  activeFrame.attributes = new Map();
  activeFrame.setAttribute = (name, value) => activeFrame.attributes.set(name, value);
  presentationContext.sync(card, {});
  assert.equal(status.textContent, "New topic", "the exposed live region must retain its prior text until the queued mutation");
  pendingAnnouncements.shift()();
  assert.equal(status.textContent, "Restoring...", "switching to another loading tab must refresh the message");
  activeLoading = false;
  presentationContext.sync(card, {});
  assert.equal(status.hidden, true);
  assert.equal(status.textContent, "", "hiding the status must clear prior text for the next loading edge");
  assert.equal(activeFrame.attributes.get("aria-busy"), "false");

  activeLoading = true;
  activeFrame = {
    dataset: { frameLoadingKind: FRAME_LOADING_KIND_NEW_TOPIC },
    attributes: new Map(),
    setAttribute(name, value) { this.attributes.set(name, value); }
  };
  presentationContext.sync(card, {});
  activeFrame = {
    dataset: { frameLoadingKind: FRAME_LOADING_KIND_RESTORING },
    attributes: new Map(),
    setAttribute(name, value) { this.attributes.set(name, value); }
  };
  presentationContext.sync(card, {});
  while (pendingAnnouncements.length) pendingAnnouncements.shift()();
  assert.equal(status.textContent, "Restoring...", "a stale queued callback must not announce the previously active tab");

  activeFrame = {
    dataset: { frameLoadingKind: FRAME_LOADING_KIND_NEW_TOPIC },
    attributes: new Map(),
    setAttribute(name, value) { this.attributes.set(name, value); }
  };
  presentationContext.sync(card, {});
  activeLoading = false;
  presentationContext.sync(card, {});
  while (pendingAnnouncements.length) pendingAnnouncements.shift()();
  assert.equal(status.hidden, true);
  assert.equal(status.textContent, "", "a callback queued before completion must not restore stale announcement text");

  const renderFrameLoadingStatus = functionSource(viewController, "renderFrameLoadingStatus");
  assert.match(renderFrameLoadingStatus, /role: "status"/);
  assert.match(renderFrameLoadingStatus, /"aria-live": "polite"/);
  assert.match(renderFrameLoadingStatus, /hidden: true/);
  assert.ok(
    syncFrameLoadingStatus.indexOf("status.hidden = false")
      < syncFrameLoadingStatus.indexOf("queueMicrotask"),
    "the live region must be exposed synchronously before announcement text is queued"
  );
  assert.doesNotMatch(
    viewController,
    /class: "chat-frame-wrap", "aria-busy"/,
    "the live status must not sit inside an aria-busy subtree"
  );
  const css = read("styles/chatclub.css");
  const statusCss = css.slice(css.indexOf(".chat-frame-loading-status"), css.indexOf(".chat-frame {"));
  assert.match(statusCss, /top: 50%/);
  assert.match(statusCss, /left: 50%/);
  assert.match(statusCss, /background: color-mix/);
  assert.doesNotMatch(
    statusCss,
    /frame-loading-overlay-opacity/,
    "status visibility must not depend on the optional dark loading mask"
  );

  console.log("workspace frame loading status: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
