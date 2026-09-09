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
  const {
    clearFrameNewChatPending,
    frameLoadingKindForTarget,
    frameNewChatPending,
    markFrameNewChatPending
  } = await import("../app/workspace/frame-loading.js");
  const {
    navigableChatFrameHref,
    notionFrameLoadTarget,
    restorableChatFrameHref,
    stripNotionFrameLoadNonce
  } = await import("../shared/chat-frame-config.js");
  const { preferredWorkspaceTabHref } = await import("../shared/workspace-tab-memory.js");
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
  const syncFrameLoadingMask = functionSource(frameController, "syncFrameLoadingMask");
  const frameLoadPlan = functionSource(frameController, "frameLoadPlan");
  const notionFramePreflightId = functionSource(frameController, "notionFramePreflightId");
  const preparedFrameNavigationUrl = functionSource(frameController, "preparedFrameNavigationUrl");
  const rememberFrameLocation = functionSource(frameController, "rememberFrameLocation");
  const assignFrameSrc = functionSource(frameController, "assignFrameSrc");
  const reloadFrameDocument = functionSource(frameController, "reloadFrameDocument");
  const setFrameSrcAfterPrepare = functionSource(frameController, "setFrameSrcAfterPrepare");
  const scheduleFrameNavigationAfterLayout = functionSource(frameController, "scheduleFrameNavigationAfterLayout");
  const preparePlannedFrameLoad = functionSource(frameController, "preparePlannedFrameLoad");
  const armPromptFocusRestore = functionSource(frameController, "armPromptFocusRestore");
  const restorePromptInputFocus = functionSource(frameController, "restorePromptInputFocus");
  const prepareFrameNavigationFocusGuard = functionSource(frameController, "prepareFrameNavigationFocusGuard");
  const maintainFrameNavigationFocusGuard = functionSource(frameController, "maintainFrameNavigationFocusGuard");
  const activeHref = functionSource(frameController, "activeHref");
  assert.match(beginFrameLoading, /iframe\.inert = true/);
  assert.match(completeFrameLoading, /iframe\.inert = Boolean\(document\.querySelector\("\.modal"\)\)/);
  assert.match(beginFrameLoading, /const loadingKind = frameLoadingKindForTarget/);
  assert.match(beginFrameLoading, /iframe\.dataset\.frameLoadingKind = loadingKind/);
  assert.match(beginFrameLoading, /frameLoadingMaskPhase = "opaque"/);
  assert.match(beginFrameLoading, /syncFrameLoadingMask\(iframe\)/);
  assert.match(completeFrameLoading, /iframe\.dataset\.frameLoadingMaskPhase = "fade"/);
  assert.match(completeFrameLoading, /syncFrameLoadingMask\(iframe\)/);
  assert.match(completeFrameLoading, /if \(iframe\.dataset\.frameLoadingKind === "new-topic"\)/);
  assert.match(assignFrameSrc, /beginFrameLoading\(iframe, plan\.logicalUrl\)/);
  assert.match(assignFrameSrc, /samePendingNavigation/);
  assert.match(assignFrameSrc, /options\.force !== true/);
  assert.match(assignFrameSrc, /const frameReplaced = ensureFrameAttributeContract/);
  assert.match(
    assignFrameSrc,
    /if \(frameReplaced \|\| options\.force !== true\) return true/,
    "forced poisoned-frame recovery must bypass a matching attribute contract"
  );
  assert.doesNotMatch(assignFrameSrc, /releaseFrameLoadingMask\(iframe\)/);
  assert.match(reloadFrameDocument, /iframe\.dataset\.currentHref/);
  assert.match(reloadFrameDocument, /return assignFrameSrc\(iframe, targetHref, \{ force: true \}\)/);
  assert.match(reloadFrameDocument, /force: true/);
  assert.doesNotMatch(
    reloadFrameDocument,
    /activeHref\(/,
    "poisoned-frame recovery must not probe the poisoned document before reloading it"
  );
  assert.match(setFrameSrcAfterPrepare, /beginFrameLoading\(iframe, plan\.logicalUrl, true\)/);
  assert.match(scheduleFrameNavigationAfterLayout, /requestAnimationFrame/);
  assert.match(scheduleFrameNavigationAfterLayout, /frameNavigationIsCurrent\(iframe, generation\)/);
  assert.match(
    setFrameSrcAfterPrepare,
    /assignmentScheduled = false/,
    "initial frame navigation must be scheduled only once while preflight and fallback settle"
  );
  assert.ok(
    setFrameSrcAfterPrepare.indexOf("scheduleFrameNavigationAfterLayout")
      < setFrameSrcAfterPrepare.indexOf("prepareFrameNavigationFocusGuard"),
    "the first real URL must be assigned after the iframe has completed one layout frame"
  );
  assert.match(assignFrameSrc, /armPromptFocusRestore\(iframe, generation\)/, "direct frame navigation must remember an active prompt before assigning src");
  assert.match(setFrameSrcAfterPrepare, /armPromptFocusRestore\(iframe, generation\)/, "prepared frame navigation must remember an active prompt before assigning src");
  assert.match(armPromptFocusRestore, /document\.activeElement !== prompt/);
  assert.match(armPromptFocusRestore, /document\.querySelector\("\.modal"\)/, "armed prompt restore must not start while a typed modal is open");
  assert.match(
    prepareFrameNavigationFocusGuard,
    /document\.querySelector\("\.modal"\)/,
    "navigation focus guard must not arm while a typed modal is open"
  );
  assert.match(
    maintainFrameNavigationFocusGuard,
    /document\.querySelector\("\.modal"\)/,
    "in-flight navigation focus guard must stop sending while a typed modal is open"
  );
  assert.match(restorePromptInputFocus, /prompt\.focus\(\{ preventScroll: true \}\)/);
  assert.match(restorePromptInputFocus, /pinOverlaySearchCaret/, "armed prompt restore must yield to the live caret owner");
  assert.match(
    restorePromptInputFocus,
    /workspace-popover-menu/,
    "prompt restore must not steal focus while a workspace popover is open"
  );
  assert.match(
    restorePromptInputFocus,
    /\.modal, \.workspace-popover-menu/,
    "prompt restore must not steal focus while a typed modal is open"
  );
  assert.match(
    restorePromptInputFocus,
    /const restore = \(\) => \{\s*if \(document\.querySelector\("\.modal, \.workspace-popover-menu/,
    "in-flight prompt restore retries must re-check the typed modal"
  );
  assert.match(completeFrameLoading, /restorePromptInputFocus\(iframe\)/, "the real iframe load must restore focus to the prompt when it was active before navigation");
  assert.match(setFrameSrcAfterPrepare, /const frameReplaced = ensureFrameAttributeContract/);
  assert.match(
    setFrameSrcAfterPrepare,
    /if \(frameReplaced \|\| \(options\.force !== true && options\.replace !== true\)\) return/,
    "forced replacement navigation must not be swallowed by the matching contract"
  );
  assert.doesNotMatch(setFrameSrcAfterPrepare, /releaseFrameLoadingMask\(iframe\)/);
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
      frameNewChatPending,
      openableTabUrl: (value) => String(value || ""),
      restorableChatFrameHref,
      preferredWorkspaceTabHref
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
    iframe.dataset.currentHref = "https://app.notion.com/chat?t=frozen-thread";
    iframe.dataset.currentThreadHref = "https://app.notion.com/chat?t=frozen-thread";
    iframe.src = "https://app.notion.com/chat?t=frozen-thread";
    assert.equal(
      sessionContext.currentHref({ instanceId: "notion-frame", appId: "NotionAI" }),
      "https://app.notion.com/chat?t=frozen-thread"
    );
    markFrameNewChatPending(iframe);
    assert.equal(
      sessionContext.currentHref({ instanceId: "notion-frame", appId: "NotionAI" }),
      "https://app.notion.com/ai",
      "a frame that New Chat is resetting must be captured at its app home even while src and thread cache still name the frozen conversation"
    );
    clearFrameNewChatPending(iframe);
    assert.equal(
      sessionContext.currentHref({ instanceId: "notion-frame", appId: "NotionAI" }),
      "https://app.notion.com/chat?t=frozen-thread",
      "clearing the release marker must restore ordinary conversation capture"
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
  let rememberCalls = 0;
  const lifecycleContext = vm.createContext({
    HTMLIFrameElement: FakeIframe,
    appById: () => chatGpt,
    clearFrameNewChatPending,
    frameApp: () => chatGpt,
    frameIsLoading: () => loading,
    frameNavigationTargets: new WeakMap(),
    frameLoadingKindForTarget,
    rememberBrowserFrameId() {},
    rememberWorkspaceSession() { rememberCalls += 1; },
    document: { querySelector() { return null; } },
    setFrameLoading(_iframe, next) { loading = next; },
    syncHeaderForFrameInstance() { syncCalls += 1; }
  });
  vm.runInContext(`
    ${syncFrameLoadingMask}
    ${beginFrameLoading}
    ${restorePromptInputFocus}
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
  assert.equal(rememberCalls, 0, "ordinary loads must not recapture the workspace snapshot");

  // New Chat release marker lifecycle: the marker survives an unrelated load
  // that completes while the old conversation document is still loading, is
  // cleared by the home document load (with a recapture), and is cleared when
  // another ChatClub navigation to a conversation supersedes the reset.
  lifecycleContext.begin(iframe, "https://chatgpt.com/c/still-loading");
  markFrameNewChatPending(iframe);
  lifecycleContext.complete(iframe);
  assert.equal(frameNewChatPending(iframe), true, "a late load of the outgoing conversation document must not clear the New Chat release marker");
  assert.equal(rememberCalls, 0);
  lifecycleContext.begin(iframe, chatGpt.url);
  assert.equal(frameNewChatPending(iframe), true, "the home navigation itself must keep the release marker until its document loads");
  lifecycleContext.complete(iframe);
  assert.equal(frameNewChatPending(iframe), false, "the loaded home document must clear the release marker");
  assert.equal(rememberCalls, 1, "clearing the release marker must recapture the workspace snapshot once");
  lifecycleContext.complete(iframe);
  assert.equal(rememberCalls, 1, "a later load without a marker must not recapture again");
  markFrameNewChatPending(iframe);
  lifecycleContext.begin(iframe, "https://chatgpt.com/c/superseding-thread");
  assert.equal(frameNewChatPending(iframe), false, "a superseding conversation navigation must clear the release marker");
  lifecycleContext.complete(iframe);
  assert.equal(rememberCalls, 1);

  const viewController = read("app/workspace/view-controller.js");
  assert.match(
    viewController,
    /const frameWrap = el\("div", \{ class: "chat-frame-wrap" \}[\s\S]*?syncFrameLoadingMask\(activeFrame\)/,
    "the new-topic mask must be synchronized after the detached frame wrapper is created"
  );
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
  assert.match(css, /background: var\(--bg\)/);
  assert.match(css, /:root\[data-theme="dark"\] \.chat-card\.frame-loading \.chat-frame-wrap::after\s*\{\s*opacity: var\(--frame-loading-overlay-opacity\);/);
  assert.match(css, /:root:not\(\[data-theme="light"\]\) \.chat-card\.frame-loading \.chat-frame-wrap::after\s*\{\s*opacity: var\(--frame-loading-overlay-opacity\);/);
  assert.match(css, /\.chat-frame-wrap\[data-frame-loading-mask="black"\]::after/);
  assert.match(css, /opacity: var\(--frame-loading-overlay-opacity\);/);
  assert.match(
    css,
    /\.chat-frame-wrap\[data-frame-loading-mask="black"\]::after\s*\{[\s\S]*?background: #000000 !important;[\s\S]*?opacity: 1;/,
    "the new-topic mask must start as an opaque black cover independent of the plugin theme"
  );
  assert.doesNotMatch(
    css,
    /\.chat-frame-wrap\[data-frame-loading-mask="black"\]::after\s*\{[\s\S]*?opacity: 1 !important;/,
    "the opaque start state must not block the fade animation"
  );
  assert.match(css, /chat-frame-new-topic-mask-fade/);
  assert.match(css, /from \{ opacity: 1; \}/);
  assert.match(css, /to \{ opacity: 0; \}/);
  const statusCss = css.slice(css.indexOf(".chat-frame-loading-status"), css.indexOf(".chat-frame {"));
  assert.match(statusCss, /top: 50%/);
  assert.match(statusCss, /left: 50%/);
  assert.match(statusCss, /background: color-mix/);
  assert.doesNotMatch(
    statusCss,
    /frame-loading-overlay-opacity/,
    "status visibility must not depend on the optional dark loading mask"
  );
  assert.match(
    css,
    /\.chat-card\.frame-loading \.chat-frame,\s*\.chat-frame\[inert\]\s*\{\s*pointer-events: none;/,
    "loading iframes must not receive pointer events, matching the drag/resize shield"
  );
  assert.match(
    css,
    /\.chat-card\.frame-loading \.chat-frame-wrap::after\s*\{\s*pointer-events: auto;\s*cursor: wait;\s*touch-action: none;/,
    "the loading overlay must intercept hits over the iframe until loading completes"
  );
  assert.match(
    css,
    /body\.tab-dragging iframe,\s*body\.workspace-popover-open iframe\s*\{\s*pointer-events: none;/,
    "an open workspace popover must keep iframes from receiving pointer events"
  );
  const defaultOverlayCss = css.slice(
    css.indexOf(".chat-frame-wrap::after"),
    css.indexOf(".chat-frame-loading-status")
  );
  assert.match(defaultOverlayCss, /pointer-events: none;/);
  assert.doesNotMatch(
    defaultOverlayCss,
    /pointer-events: auto/,
    "the resting overlay must not intercept pointer events after loading ends"
  );

  {
    const runRestore = ({ modal = false, generation = "1" } = {}) => {
      const prompt = {
        isConnected: true,
        focusCalls: 0,
        focus() { this.focusCalls += 1; }
      };
      const iframeEl = {
        isConnected: true,
        dataset: generation ? { promptFocusRestoreGeneration: String(generation) } : {}
      };
      const document = {
        body: {},
        documentElement: { dataset: {} },
        activeElement: iframeEl,
        querySelector(selector) {
          if (selector === ".prompt-input") return prompt;
          if (String(selector).includes(".modal")) return modal ? { className: "modal" } : null;
          return null;
        }
      };
      const context = vm.createContext({
        document,
        iframe: iframeEl,
        requestAnimationFrame(callback) { callback(); return 1; }
      });
      vm.runInContext(`${restorePromptInputFocus}\nrestorePromptInputFocus(iframe);`, context);
      return { prompt, iframe: iframeEl };
    };
    const stolen = runRestore({ modal: true });
    assert.equal(stolen.prompt.focusCalls, 0, "iframe load must not restore the prompt while a typed modal is open");
    assert.equal(stolen.iframe.dataset.promptFocusRestoreGeneration, undefined);
    const restored = runRestore({ modal: false });
    assert.ok(restored.prompt.focusCalls > 0, "iframe load must still restore the prompt when no modal is open");

    const runArm = ({ modal = false, datasetP = false } = {}) => {
      const prompt = { isConnected: true };
      const iframeEl = { isConnected: true, dataset: {} };
      const document = {
        documentElement: { dataset: datasetP ? { p: "1" } : {} },
        activeElement: iframeEl,
        querySelector(selector) {
          if (selector === ".prompt-input") return prompt;
          if (selector === ".modal" || String(selector).includes(".modal")) return modal ? { className: "modal" } : null;
          return null;
        }
      };
      const context = vm.createContext({
        document,
        iframe: iframeEl,
        armed: false
      });
      vm.runInContext(`${armPromptFocusRestore}\narmed = armPromptFocusRestore(iframe, 7);`, context);
      return { armed: context.armed, iframe: iframeEl };
    };
    const blocked = runArm({ modal: true, datasetP: true });
    assert.equal(blocked.armed, false, "prompt restore must not arm while a typed modal is open");
    assert.equal(blocked.iframe.dataset.promptFocusRestoreGeneration, undefined);
    const armed = runArm({ modal: false, datasetP: true });
    assert.equal(armed.armed, true, "prompt restore may still arm when no modal is open");
    assert.equal(armed.iframe.dataset.promptFocusRestoreGeneration, "7");

    const runQueuedRestore = () => {
      const prompt = {
        isConnected: true,
        focusCalls: 0,
        focus() { this.focusCalls += 1; }
      };
      const iframeEl = {
        isConnected: true,
        dataset: { promptFocusRestoreGeneration: "1" }
      };
      let modal = false;
      const queued = [];
      const document = {
        body: {},
        documentElement: { dataset: {} },
        activeElement: iframeEl,
        querySelector(selector) {
          if (selector === ".prompt-input") return prompt;
          if (String(selector).includes(".modal")) return modal ? { className: "modal" } : null;
          return null;
        }
      };
      vm.runInContext(
        `${restorePromptInputFocus}\nrestorePromptInputFocus(iframe);`,
        vm.createContext({
          document,
          iframe: iframeEl,
          requestAnimationFrame(callback) { queued.push(callback); return 1; }
        })
      );
      const afterFirst = prompt.focusCalls;
      assert.ok(afterFirst > 0, "the first restore attempt still runs before a later modal opens");
      modal = true;
      while (queued.length) queued.shift()();
      assert.equal(prompt.focusCalls, afterFirst, "in-flight restore retries must stop after a typed modal opens");
      assert.equal(iframeEl.dataset.promptFocusRestoreGeneration, undefined);
    };
    runQueuedRestore();
  }

  {
    class ModalIframe {
      constructor() {
        this.dataset = { instanceId: "frame-modal" };
        this.inert = true;
      }
    }
    let modalOpen = true;
    const ctx = vm.createContext({
      HTMLIFrameElement: ModalIframe,
      document: {
        querySelector(selector) {
          return String(selector).includes(".modal") && modalOpen ? { className: "modal" } : null;
        }
      },
      rememberBrowserFrameId() {},
      restorePromptInputFocus() {},
      setFrameLoading() {},
      syncFrameLoadingMask() {},
      clearFrameNewChatPending() { return false; },
      rememberWorkspaceSession() {}
    });
    vm.runInContext(`${completeFrameLoading}\nglobalThis.complete = completeFrameLoading;`, ctx);
    const frame = new ModalIframe();
    ctx.complete(frame);
    assert.equal(frame.inert, true, "completing a load while a typed modal is open must keep the iframe inert");
    modalOpen = false;
    frame.inert = true;
    ctx.complete(frame);
    assert.equal(frame.inert, false, "completing a load with no modal must un-inert the iframe");
  }

  console.log("workspace frame loading status: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
