#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { fileURLToPath, pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;
const stylesSource = fs.readFileSync(path.join(root, "styles/chatclub.css"), "utf8");

class FakeNode {
  constructor(tagName = "div") {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.style = { setProperty() {} };
    this.attributes = new Map();
    this.listeners = new Map();
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.readOnly = false;
    this._text = "";
    this._classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this._classes.add(name)),
      contains: (name) => this._classes.has(name),
      remove: (...names) => names.forEach((name) => this._classes.delete(name)),
      toggle: (name, force) => {
        const enabled = force === undefined ? !this._classes.has(name) : Boolean(force);
        if (enabled) this._classes.add(name);
        else this._classes.delete(name);
        return enabled;
      }
    };
  }

  get className() {
    return [...this._classes].join(" ");
  }

  set className(value) {
    this._classes = new Set(String(value || "").split(/\s+/).filter(Boolean));
  }

  get textContent() {
    if (this.tagName === "#TEXT" || this._text) return this._text;
    return this.children.map((child) => child.textContent || "").join("");
  }

  set textContent(value) {
    this.replaceChildren();
    this._text = String(value ?? "");
  }

  append(...children) {
    for (const child of children) {
      if (!child) continue;
      child.parentElement = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this._text = "";
    this.append(...children);
  }

  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }

  focus() {
    globalThis.document.activeElement = this;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, values = {}) {
    const event = {
      currentTarget: this,
      target: this,
      clientY: 0,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; },
      stopImmediatePropagation() { this.immediatePropagationStopped = true; },
      ...values
    };
    event.results = (this.listeners.get(type) || []).map((listener) => listener(event));
    return event;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "value") this.value = String(value);
    if (name === "checked") this.checked = true;
    if (name === "disabled") this.disabled = true;
    if (name === "hidden") this.hidden = true;
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  getBoundingClientRect() {
    return { top: 0, right: 100, bottom: 100, left: 0, width: 100, height: 100 };
  }

  matches(selector) {
    const value = String(selector || "").trim();
    if (value.startsWith(".")) {
      return value.split(".").slice(1).filter(Boolean).every((name) => this.classList.contains(name));
    }
    return value.toUpperCase() === this.tagName;
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (current.matches(selector)) return current;
      current = current.parentElement;
    }
    return null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      for (const child of node.children || []) {
        if (child.matches?.(selector)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

function findNode(rootNode, predicate) {
  if (!rootNode) return null;
  if (predicate(rootNode)) return rootNode;
  for (const child of rootNode.children || []) {
    const match = findNode(child, predicate);
    if (match) return match;
  }
  return null;
}

function buttonWithText(rootNode, label) {
  return findNode(rootNode, (node) => node.tagName === "BUTTON" && node.textContent === label);
}

async function settleEvent(event) {
  await Promise.all(event.results.map((result) => Promise.resolve(result)));
}

async function waitUntil(predicate, message) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => { setImmediate(resolve); });
  }
  assert.fail(message);
}

function modalRoot() {
  return findNode(globalThis.document.body, (node) => node.classList?.contains("modal-backdrop"));
}

function closeModalFixture() {
  modalRoot()?.remove();
  globalThis.document.activeElement = null;
}

const previousGlobals = {
  Element: globalThis.Element,
  Node: globalThis.Node,
  document: globalThis.document,
  fetch: globalThis.fetch
};

globalThis.Element = FakeNode;
globalThis.Node = FakeNode;
globalThis.document = {
  activeElement: null,
  body: new FakeNode("body"),
  addEventListener() {},
  createElement: (tagName) => new FakeNode(tagName),
  createTextNode: (value) => {
    const node = new FakeNode("#text");
    node._text = String(value);
    return node;
  },
  querySelector(selector) { return this.body.querySelector(selector); },
  querySelectorAll(selector) { return this.body.querySelectorAll(selector); }
};
globalThis.fetch = async (sourceUrl) => ({
  ok: true,
  status: 200,
  text: async () => fs.readFileSync(fileURLToPath(sourceUrl), "utf8")
});

(async () => {
  assert.match(
    stylesSource,
    /\.settings-userscript-permission-notice\[hidden\]\s*\{\s*display:\s*none;\s*\}/,
    "the callout grid style must not override hidden permission notices"
  );
  const summarySource = fs.readFileSync(path.join(root, "app/settings/summary.js"), "utf8");
  const topicSource = fs.readFileSync(path.join(root, "app/settings/topic-deletion.js"), "utf8");
  assert.match(summarySource, /chatclub\.summaryCollectorLastRun\.v1/);
  assert.doesNotMatch(summarySource, /chrome:\/\//);
  assert.doesNotMatch(topicSource, /chrome:\/\//);
  const i18n = await import(moduleUrl("shared/i18n.js"));
  const stateModule = await import(moduleUrl("app/state.js"));
  const summaryModule = await import(moduleUrl("app/settings/summary.js"));
  const topicModule = await import(moduleUrl("app/settings/topic-deletion.js"));
  const { SUMMARY_SITE_CONFIGS } = await import(moduleUrl("shared/summary-sites.js"));
  const { TOPIC_DELETE_SITE_CONFIGS } = await import(moduleUrl("shared/topic-delete-sites.js"));

  i18n.setLanguage("en");
  assert.equal(
    i18n.t("userscripts.permissionNoticeBody"),
    "Chrome/Arc 138+: open the ChatClub extension details and turn on “Allow User Scripts”. Chrome/Arc 135–137: turn on Developer mode. Firefox/Zen supports custom User Scripts only in version 153+; ChatClub requests permission when you save."
  );
  assert.doesNotMatch(i18n.t("topicDeletion.site.infoBody"), /Tampermonkey|Violentmonkey/);
  i18n.setLanguage("zh_CN");
  assert.equal(
    i18n.t("userscripts.permissionNoticeBody"),
    "Chrome/Arc 138+：请在 ChatClub 扩展详情页开启“允许用户脚本（Allow User Scripts）”；135–137：请开启开发者模式。Firefox/Zen 仅 153+ 支持自定义用户脚本，ChatClub 会在保存时请求授权。"
  );
  assert.doesNotMatch(i18n.t("topicDeletion.site.infoBody"), /Tampermonkey|Violentmonkey/);
  i18n.setLanguage("en");

  const rootState = stateModule.createAppState();
  rootState.summarySettingsTab = "scripts";
  rootState.options = {
    ...rootState.options,
    summarySiteConfigs: [
      { ...SUMMARY_SITE_CONFIGS[0], builtIn: true, enabled: true, sourceMode: "builtIn" },
      {
        id: "custom-summary",
        name: "Custom Summary",
        builtIn: false,
        enabled: false,
        fallbackMode: "structuredOnly",
        hosts: ["example.test"],
        pathPrefixes: [],
        sourceMode: "custom",
        customUserscript: "return { messages: [] };",
        userscriptLength: 24,
        userscriptRunMode: "serial",
        userscriptTimeoutMs: 24000
      }
    ],
    topicDeleteSiteConfigs: [
      { ...TOPIC_DELETE_SITE_CONFIGS[0], enabled: true, sourceMode: "builtIn" },
      {
        id: "custom-delete",
        name: "Custom Delete",
        builtIn: false,
        enabled: false,
        appIds: ["CustomDelete"],
        hosts: [],
        pathPrefixes: [],
        sourceMode: "custom",
        customUserscript: "// ==UserScript==\n// ==/UserScript==\nglobalThis.ChatClubDeleteSites = {};",
        userscriptLength: 72,
        userscriptTimeoutMs: 15000
      }
    ]
  };
  const ports = stateModule.createFeatureStatePorts(rootState).settingsSections;
  const svgIcon = () => new FakeNode("svg");

  let summaryPermissionChecks = 0;
  let summarySaves = 0;
  const summarySection = summaryModule.createSummarySettingsSection({
    state: ports.summary,
    svgIcon,
    notifyConfigReload: async () => {},
    saveOptionsPatch: async () => {
      summarySaves += 1;
      return rootState.options;
    },
    ensureUserScriptsPermission: async () => {
      summaryPermissionChecks += 1;
      return false;
    }
  });
  const summaryPane = summarySection.pane(() => {});
  globalThis.document.body.replaceChildren(summaryPane);

  const builtInSummaryRow = findNode(summaryPane, (node) => node.dataset?.collectorId === "chatgpt");
  await settleEvent(findNode(builtInSummaryRow, (node) => node.getAttribute?.("aria-label") === "Edit").dispatch("click"));
  await waitUntil(modalRoot, "built-in Summary editor must open");
  let notice = findNode(modalRoot(), (node) => node.dataset?.userscriptPermissionNotice === "summary");
  let sourceLabel = findNode(modalRoot(), (node) => node.dataset?.userscriptSourceLabel === "summary");
  let scriptEditor = findNode(modalRoot(), (node) => node.classList?.contains("settings-code-textarea"));
  assert.equal(notice.hidden, true, "built-in Summary scripts must hide the permission notice");
  assert.equal(scriptEditor.readOnly, true, "built-in Summary scripts must stay read-only");
  assert.equal(sourceLabel.textContent, "Built-in script, auto-updates with ChatClub.");
  await settleEvent(buttonWithText(modalRoot(), "Edit copy").dispatch("click"));
  assert.equal(notice.hidden, false, "editing a Summary copy must immediately reveal the permission notice");
  assert.equal(scriptEditor.readOnly, false, "editing a Summary copy must make the source editable");
  assert.equal(sourceLabel.textContent, "Custom override, not auto-updated.");
  closeModalFixture();

  const customSummaryRow = findNode(summaryPane, (node) => node.dataset?.collectorId === "custom-summary");
  const summaryEnable = findNode(customSummaryRow, (node) => node.getAttribute?.("type") === "checkbox");
  summaryEnable.checked = true;
  await settleEvent(summaryEnable.dispatch("change"));
  assert.equal(summaryEnable.checked, false, "denied permission must roll back custom Summary re-enable");
  await settleEvent(findNode(customSummaryRow, (node) => node.getAttribute?.("aria-label") === "Edit").dispatch("click"));
  notice = findNode(modalRoot(), (node) => node.dataset?.userscriptPermissionNotice === "summary");
  assert.equal(notice.hidden, false, "an existing custom Summary script must show the permission notice");
  await waitUntil(
    () => findNode(notice, (node) => node.dataset?.userscriptPermissionStatus === "summary")?.textContent
      === "User Scripts permission is not granted.",
    "custom Summary editor must show live permission status"
  );
  const summaryRequest = findNode(notice, (node) => node.dataset?.userscriptPermissionRequest === "summary");
  assert.ok(summaryRequest, "custom Summary editor must offer a permission request button");
  assert.equal(summaryRequest.hidden, false);
  assert.doesNotMatch(notice.textContent, /chrome:\/\//);
  await settleEvent(buttonWithText(modalRoot(), "Save").dispatch("click"));
  assert.equal(summaryPermissionChecks, 2, "Summary save and re-enable must both keep permission checks");
  assert.equal(summarySaves, 0, "denied Summary permission must prevent persistence");
  assert.ok(modalRoot(), "denied Summary permission must keep the editor open");
  closeModalFixture();

  await settleEvent(buttonWithText(summaryPane, "Add collector").dispatch("click"));
  notice = findNode(modalRoot(), (node) => node.dataset?.userscriptPermissionNotice === "summary");
  scriptEditor = findNode(modalRoot(), (node) => node.classList?.contains("settings-code-textarea"));
  assert.equal(notice.hidden, false, "a new custom Summary script must show the permission notice");
  assert.equal(scriptEditor.readOnly, false);
  closeModalFixture();

  let topicPermissionChecks = 0;
  let topicSaves = 0;
  const topicSection = topicModule.createTopicDeletionSettingsSection({
    state: ports.topicDeletion,
    svgIcon,
    notifyConfigReload: async () => {},
    saveOptionsPatch: async () => {
      topicSaves += 1;
      return rootState.options;
    },
    ensureUserScriptsPermission: async () => {
      topicPermissionChecks += 1;
      return false;
    }
  });
  const topicPane = topicSection.pane(() => {});
  globalThis.document.body.replaceChildren(topicPane);

  const builtInTopicRow = findNode(topicPane, (node) => node.dataset?.topicDeleteSiteId === "chatgpt");
  await settleEvent(findNode(builtInTopicRow, (node) => node.getAttribute?.("aria-label") === "Edit").dispatch("click"));
  await waitUntil(modalRoot, "built-in Delete Site editor must open");
  notice = findNode(modalRoot(), (node) => node.dataset?.userscriptPermissionNotice === "topic-deletion");
  sourceLabel = findNode(modalRoot(), (node) => node.dataset?.userscriptSourceLabel === "topic-deletion");
  scriptEditor = findNode(modalRoot(), (node) => node.classList?.contains("settings-code-textarea"));
  assert.equal(notice.hidden, true, "built-in Delete Site scripts must hide the permission notice");
  assert.equal(scriptEditor.readOnly, true, "built-in Delete Site scripts must stay read-only");
  assert.equal(sourceLabel.textContent, "Built-in script, auto-updates with ChatClub.");
  await settleEvent(buttonWithText(modalRoot(), "Edit copy").dispatch("click"));
  assert.equal(notice.hidden, false, "editing a Delete Site copy must immediately reveal the permission notice");
  assert.equal(scriptEditor.readOnly, false, "editing a Delete Site copy must make the source editable");
  assert.equal(sourceLabel.textContent, "Custom override, not auto-updated.");
  closeModalFixture();

  const customTopicRow = findNode(topicPane, (node) => node.dataset?.topicDeleteSiteId === "custom-delete");
  const topicEnable = findNode(customTopicRow, (node) => node.getAttribute?.("type") === "checkbox");
  topicEnable.checked = true;
  await settleEvent(topicEnable.dispatch("change"));
  assert.equal(topicEnable.checked, false, "denied permission must roll back custom Delete Site re-enable");
  await settleEvent(findNode(customTopicRow, (node) => node.getAttribute?.("aria-label") === "Edit").dispatch("click"));
  notice = findNode(modalRoot(), (node) => node.dataset?.userscriptPermissionNotice === "topic-deletion");
  assert.equal(notice.hidden, false, "an existing custom Delete Site script must show the permission notice");
  await waitUntil(
    () => findNode(notice, (node) => node.dataset?.userscriptPermissionStatus === "topic-deletion")?.textContent
      === "User Scripts permission is not granted.",
    "custom Delete Site editor must show live permission status"
  );
  assert.ok(findNode(notice, (node) => node.dataset?.userscriptPermissionRequest === "topic-deletion"));
  assert.doesNotMatch(notice.textContent, /chrome:\/\//);
  await settleEvent(buttonWithText(modalRoot(), "Save").dispatch("click"));
  assert.equal(topicPermissionChecks, 2, "Delete Site save and re-enable must both keep permission checks");
  assert.equal(topicSaves, 0, "denied Delete Site permission must prevent persistence");
  assert.ok(modalRoot(), "denied Delete Site permission must keep the editor open");
  closeModalFixture();

  await settleEvent(buttonWithText(topicPane, "Add site").dispatch("click"));
  notice = findNode(modalRoot(), (node) => node.dataset?.userscriptPermissionNotice === "topic-deletion");
  scriptEditor = findNode(modalRoot(), (node) => node.classList?.contains("settings-code-textarea"));
  assert.equal(notice.hidden, false, "a new custom Delete Site script must show the permission notice");
  assert.equal(scriptEditor.readOnly, false);
  closeModalFixture();

  const poe = SUMMARY_SITE_CONFIGS.find((item) => item.id === "poe");
  assert.ok(poe);
  const { summaryConfigIsOfficialSlotStub } = await import(moduleUrl("shared/summary-sites.js"));
  assert.equal(summaryConfigIsOfficialSlotStub(poe), true);
  assert.equal(summaryConfigIsOfficialSlotStub(SUMMARY_SITE_CONFIGS[0]), false);
  assert.equal(summaryConfigIsOfficialSlotStub({ ...poe, sourceMode: "custom", builtIn: false, customUserscript: "return [];" }), false);
  assert.equal(i18n.t("summary.collector.officialSlot"), "Official-slot placeholder (not a ChatGPT-class collector).");
  assert.match(summarySource, /summaryConfigIsOfficialSlotStub/);
  assert.match(i18n.t("summary.collectors.desc"), /Official-slot placeholders/);
  assert.match(i18n.t("userscripts.permissionStatusToggleOff"), /chrome:\/\/extensions/);
  assert.doesNotMatch(summarySource, /chrome:\/\//);
  assert.doesNotMatch(topicSource, /chrome:\/\//);

  const lastRunStore = {};
  const previousChrome = globalThis.chrome;
  globalThis.chrome = {
    runtime: {},
    storage: {
      local: {
        get(key, cb) {
          const name = typeof key === "string" ? key : Object.keys(key || {})[0];
          cb(name && name in lastRunStore ? { [name]: lastRunStore[name] } : {});
        },
        set(value, cb) {
          Object.assign(lastRunStore, value);
          cb?.();
        }
      }
    },
    permissions: {
      contains(_query, cb) { cb(true); }
    },
    userScripts: {
      getScripts(filter, cb) {
        const done = typeof filter === "function" ? filter : cb;
        done?.([]);
      }
    }
  };
  const { userScriptsAvailability } = await import(moduleUrl("shared/extension-api.js"));
  assert.deepEqual(await userScriptsAvailability(), { permission: true, available: true });
  globalThis.chrome.userScripts.getScripts = (filter, cb) => {
    globalThis.chrome.runtime.lastError = { message: "User Scripts API is unavailable" };
    const done = typeof filter === "function" ? filter : cb;
    done?.();
  };
  assert.deepEqual(await userScriptsAvailability(), { permission: true, available: false });
  delete globalThis.chrome.runtime.lastError;
  globalThis.chrome.userScripts = { execute() {} };
  assert.deepEqual(await userScriptsAvailability(), { permission: true, available: true });
  globalThis.chrome.permissions.contains = (_query, cb) => cb(false);
  assert.deepEqual(await userScriptsAvailability(), { permission: false, available: false });

  const probeById = {
    chatgpt: {
      ok: true,
      turnCount: 4,
      stage: "official",
      officialHits: {
        conversationRoots: 1, messageRoots: 4, classified: 4, user: 2, assistant: 2,
        droppedNoRole: 1, droppedNoText: 2
      },
      waitMsApplied: 900,
      href: "https://chatgpt.com/",
      error: ""
    },
    "custom-summary": {
      ok: false,
      turnCount: 0,
      stage: "custom",
      officialHits: null,
      waitMsApplied: 0,
      href: "https://example.test/",
      error: "empty"
    }
  };
  const mapState = stateModule.createAppState();
  mapState.summarySettingsTab = "scripts";
  mapState.options = rootState.options;
  const mapPorts = stateModule.createFeatureStatePorts(mapState).settingsSections;
  const mapSection = summaryModule.createSummarySettingsSection({
    state: mapPorts.summary,
    svgIcon,
    notifyConfigReload: async () => {},
    saveOptionsPatch: async () => mapState.options,
    ensureUserScriptsPermission: async () => true,
    probeSummaryCollector: async (config) => probeById[config.id] || probeById["custom-summary"],
    userScriptsPermissionContains: async () => ({ permission: true, available: false })
  });
  const mapPane = mapSection.pane(() => {});
  globalThis.document.body.replaceChildren(mapPane);

  const customRow = findNode(mapPane, (node) => node.dataset?.collectorId === "custom-summary");
  await settleEvent(findNode(customRow, (node) => node.getAttribute?.("aria-label") === "Edit").dispatch("click"));
  notice = findNode(modalRoot(), (node) => node.dataset?.userscriptPermissionNotice === "summary");
  await waitUntil(
    () => findNode(notice, (node) => node.dataset?.userscriptPermissionStatus === "summary")?.textContent
      === i18n.t("userscripts.permissionStatusToggleOff"),
    "custom Summary editor must distinguish Allow User Scripts toggle-off from missing permission"
  );
  const toggleStatus = findNode(notice, (node) => node.dataset?.userscriptPermissionStatus === "summary");
  assert.match(toggleStatus.textContent, /chrome:\/\/extensions/);
  assert.equal(findNode(notice, (node) => node.dataset?.userscriptPermissionRequest === "summary").hidden, true);
  assert.equal(findNode(notice, (node) => node.getAttribute?.("href")?.startsWith("chrome://")), null);
  closeModalFixture();

  const chatgptRow = findNode(mapPane, (node) => node.dataset?.collectorId === "chatgpt");
  await settleEvent(findNode(chatgptRow, (node) => node.getAttribute?.("aria-label") === "Edit").dispatch("click"));
  await waitUntil(modalRoot, "ChatGPT editor must open for probe");
  await settleEvent(buttonWithText(modalRoot(), "Probe current tab").dispatch("click"));
  await waitUntil(
    () => findNode(modalRoot(), (node) => node.classList?.contains("summary-collector-last-run"))?.textContent.includes("wait 900ms"),
    "ChatGPT last-run must include applied waitMs and dropped hits"
  );
  let lastRunNode = findNode(modalRoot(), (node) => node.classList?.contains("summary-collector-last-run"));
  assert.match(lastRunNode.textContent, /Collected 4 turns/);
  assert.match(lastRunNode.textContent, /dropped role 1\/text 2/);
  closeModalFixture();

  await settleEvent(findNode(customRow, (node) => node.getAttribute?.("aria-label") === "Edit").dispatch("click"));
  await waitUntil(modalRoot, "custom collector editor must open for probe");
  await settleEvent(buttonWithText(modalRoot(), "Probe current tab").dispatch("click"));
  await waitUntil(
    () => findNode(modalRoot(), (node) => node.classList?.contains("summary-collector-last-run"))?.textContent.includes("Probe failed: empty"),
    "custom collector last-run must persist its own probe"
  );
  closeModalFixture();

  await settleEvent(findNode(chatgptRow, (node) => node.getAttribute?.("aria-label") === "Edit").dispatch("click"));
  await waitUntil(modalRoot, "ChatGPT editor must reopen with its own last-run");
  await waitUntil(
    () => findNode(modalRoot(), (node) => node.classList?.contains("summary-collector-last-run"))?.textContent.includes("Collected 4 turns"),
    "probing another collector must not overwrite ChatGPT last-run"
  );
  lastRunNode = findNode(modalRoot(), (node) => node.classList?.contains("summary-collector-last-run"));
  assert.match(lastRunNode.textContent, /wait 900ms/);
  closeModalFixture();

  const storedMap = lastRunStore["chatclub.summaryCollectorLastRun.v1"];
  assert.equal(storedMap.chatgpt.turnCount, 4);
  assert.equal(storedMap["custom-summary"].error, "empty");
  assert.equal(storedMap.chatgpt.waitMsApplied, 900);

  mapState.summaryCollectorLastRun = {};
  const hydrateSection = summaryModule.createSummarySettingsSection({
    state: mapPorts.summary,
    svgIcon,
    notifyConfigReload: async () => {},
    saveOptionsPatch: async () => mapState.options,
    ensureUserScriptsPermission: async () => true,
    probeSummaryCollector: async () => probeById.chatgpt
  });
  hydrateSection.pane(() => {});
  await waitUntil(
    () => mapState.summaryCollectorLastRun?.chatgpt?.turnCount === 4,
    "last-run hydrate must restore the per-collector map"
  );
  lastRunStore["chatclub.summaryCollectorLastRun.v1"] = {
    collectorId: "chatgpt",
    ok: true,
    turnCount: 7,
    stage: "isolatedJs",
    officialHits: null,
    waitMsApplied: 0,
    error: "",
    href: "https://chatgpt.com/",
    at: 1
  };
  mapState.summaryCollectorLastRun = {};
  const migrateSection = summaryModule.createSummarySettingsSection({
    state: mapPorts.summary,
    svgIcon,
    notifyConfigReload: async () => {},
    saveOptionsPatch: async () => mapState.options,
    ensureUserScriptsPermission: async () => true
  });
  migrateSection.pane(() => {});
  await waitUntil(
    () => mapState.summaryCollectorLastRun?.chatgpt?.turnCount === 7,
    "legacy single last-run records must migrate into the per-collector map"
  );

  if (previousChrome === undefined) delete globalThis.chrome;
  else globalThis.chrome = previousChrome;

  console.log("userscript settings notice tests passed");
})().finally(() => {
  if (previousGlobals.Element === undefined) delete globalThis.Element;
  else globalThis.Element = previousGlobals.Element;
  if (previousGlobals.Node === undefined) delete globalThis.Node;
  else globalThis.Node = previousGlobals.Node;
  if (previousGlobals.document === undefined) delete globalThis.document;
  else globalThis.document = previousGlobals.document;
  if (previousGlobals.fetch === undefined) delete globalThis.fetch;
  else globalThis.fetch = previousGlobals.fetch;
});
