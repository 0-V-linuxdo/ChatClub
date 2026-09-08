#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

(async () => {
  const { DEFAULT_OPTIONS } = await import(moduleUrl("shared/constants.js"));
  const { normalizeOptions, normalizeAppIcons, dehydrateOptions } = await import(moduleUrl("shared/storage-schema.js"));
  const { t, setLanguage } = await import(moduleUrl("shared/i18n.js"));
  const settingsState = await import(moduleUrl("app/settings/state-ports.js"));

  assert.deepEqual(DEFAULT_OPTIONS.appIcons, {});
  assert.deepEqual(normalizeOptions({}).appIcons, {});
  assert.deepEqual(
    normalizeAppIcons({
      ChatGPT: { srcType: "url", value: "https://cdn.example.com/chatgpt.png" },
      Gemini: { srcType: "data", value: "data:image/png;base64,AAAA" },
      BadHttp: { srcType: "url", value: "http://insecure.example/icon.png" },
      Creds: { srcType: "url", value: "https://user:secret@cdn.example.com/icon.png" },
      Empty: { srcType: "url", value: "" }
    }),
    {
      ChatGPT: { srcType: "url", value: "https://cdn.example.com/chatgpt.png" },
      Gemini: { srcType: "data", value: "data:image/png;base64,AAAA" }
    }
  );
  const persisted = dehydrateOptions({
    appIcons: { ChatGPT: { srcType: "url", value: "https://cdn.example.com/chatgpt.png" } }
  });
  assert.equal(persisted.appIcons.ChatGPT.value, "https://cdn.example.com/chatgpt.png");
  const relay = normalizeOptions({
    apiProfiles: [{
      id: "relay",
      name: "Relay",
      endpoint: "https://api.deepseek.com/v1/chat/completions",
      model: "x",
      logoUrl: "https://cdn.example.com/relay.png"
    }]
  }).apiProfiles.find((profile) => profile.id === "relay");
  assert.equal(relay.logoUrl, "https://cdn.example.com/relay.png");
  const rejectedLogo = normalizeOptions({
    apiProfiles: [{
      id: "relay",
      name: "Relay",
      endpoint: "https://api.deepseek.com/v1/chat/completions",
      model: "x",
      logoUrl: "http://insecure.example/icon.png"
    }]
  }).apiProfiles.find((profile) => profile.id === "relay");
  assert.equal(rejectedLogo.logoUrl, undefined);
  assert.equal(
    dehydrateOptions({
      apiProfiles: [{
        id: "relay",
        name: "Relay",
        endpoint: "https://api.deepseek.com/v1/chat/completions",
        model: "x",
        logoUrl: "https://cdn.example.com/relay.png"
      }]
    }).apiProfiles.find((profile) => profile.id === "relay").logoUrl,
    "https://cdn.example.com/relay.png"
  );
  assert.ok(settingsState.SETTINGS_OPTION_CAPABILITIES.apps.write.includes("appIcons"));
  assert.ok(settingsState.SETTINGS_OPTION_CAPABILITIES.apps.read.includes("appIcons"));

  setLanguage("en");
  assert.equal(t("apps.changeIcon"), "Change icon");
  setLanguage("zh_CN");
  assert.equal(t("apps.changeIcon"), "更换图标");

  const apps = read("app/settings/apps.js");
  const iconEditor = read("app/settings/app-icon.js");
  const history = read("app/history/controller.js");
  const summary = read("app/summary/controller.js");
  const modelsSettings = read("app/settings/models.js");
  const summarySettings = read("app/settings/summary.js");
  const messageSettings = read("app/settings/message-navigation.js");
  const topicSettings = read("app/settings/topic-deletion.js");
  const profilesSettings = read("app/settings/profiles.js");
  const css = read("styles/chatclub.css");
  const budgets = JSON.parse(read("tools/native-entry-budgets.json"));

  assert.match(apps, /createAppIconControls/);
  assert.match(apps, /appIcons\.nameCell/);
  assert.match(apps, /appIcons\.editorField/);
  assert.match(iconEditor, /editorModal/);
  assert.match(iconEditor, /faviconPort\.encodeFile/);
  assert.match(iconEditor, /faviconPort\.refresh/);
  assert.doesNotMatch(history, /googleFaviconUrl/);
  assert.doesNotMatch(summary, /googleFaviconUrl/);
  assert.doesNotMatch(history, /s2\/favicons/);
  assert.doesNotMatch(summary, /s2\/favicons/);
  assert.match(css, /\.settings-site-icon(?![-\w])[^}]*border-radius:\s*var\(--ui-radius-xs\)/s);
  assert.match(css, /\.settings-site-icon-button \{[^}]*width:\s*var\(--target-min\)/s);
  assert.equal(fs.existsSync(path.join(root, "icons/sites")), false, "v1 must not ship packaged site logos");
  assert.equal(budgets.lazyBoundaries["app/settings/controller.js"].maxFiles, 30);
  const controller = read("app/settings/controller.js");
  const runtime = read("app/runtime.js");
  assert.match(controller, /faviconPort:\s*"object\?"/);
  assert.match(apps, /faviconPort:\s*"object\?"/);
  assert.match(modelsSettings, /faviconPort:\s*"object\?"/);
  assert.match(summarySettings, /faviconPort:\s*"object\?"/);
  assert.match(messageSettings, /faviconPort:\s*"object\?"/);
  assert.match(topicSettings, /faviconPort:\s*"object\?"/);
  assert.match(profilesSettings, /faviconPort:\s*"object\?"/);
  assert.match(controller, /faviconPort:\s*ctx\.faviconPort/);
  assert.match(runtime, /faviconPort:\s*faviconService/);
  assert.match(iconEditor, /export function settingsSiteMark/);
  assert.match(iconEditor, /skipCatalog \? \[\]/);
  assert.match(read("app/favicon/service.js"), /replace\(\/\^\(api\|ai\|www\)\\\.\//);
  assert.match(read("app/favicon/service.js"), /siteFaviconUrls/);
  assert.match(modelsSettings, /settingsSiteMark\(\{\s*appId\s*\},\s*faviconPort\)/);
  assert.match(summarySettings, /settingsSiteMark\(config,\s*faviconPort\)/);
  assert.match(messageSettings, /settingsSiteMark\(config,\s*faviconPort\)/);
  assert.match(topicSettings, /settingsSiteMark\(config,\s*faviconPort\)/);
  assert.match(profilesSettings, /settingsSiteMark\(profileIconSource/);
  assert.match(profilesSettings, /skipCatalog:\s*true/);
  assert.match(profilesSettings, /logoUrl/);
  assert.match(profilesSettings, /api-profile-editor-identity-mark/);
  assert.match(profilesSettings, /el\("details", \{\s*class: "settings-icon-advanced"/);
  assert.match(profilesSettings, /el\("summary", \{\s*class: "settings-icon-field-label" \}, t\("apps\.icon"\)/);
  assert.match(profilesSettings, /settings-icon-field-actions/);
  assert.match(profilesSettings, /api-profile-icon-field/);
  assert.doesNotMatch(profilesSettings, /settings-icon-preview/);
  assert.doesNotMatch(profilesSettings, /open:\s*true/);
  assert.match(css, /data-favicon-ready/);
  assert.match(css, /\.settings-icon-advanced \{/);
  assert.match(css, /\.api-profile-models-field \{[^}]*align-content:\s*start/s);
  assert.match(css, /\.settings-icon-field-actions \{/);
  assert.match(iconEditor, /keepVisibleOnMiss:\s*true/);
  assert.match(iconEditor, /loading:\s*"eager"/);
  assert.match(read("ui/favicon.js"), /keepVisibleOnMiss/);
  assert.match(read("ui/favicon.js"), /faviconReady/);
  const i18nSource = read("shared/i18n.js");
  assert.match(i18nSource, /"profiles\.edit": "Edit Provider:"/);
  assert.match(i18nSource, /"profiles\.addTitle": "Add Provider:"/);
  assert.match(i18nSource, /"profiles\.edit": "编辑服务商："/);
  assert.match(i18nSource, /"profiles\.addTitle": "添加服务商："/);
  assert.match(i18nSource, /"profiles\.add": "Add Provider"/);
  setLanguage("en");
  assert.equal(t("profiles.edit"), "Edit Provider:");
  assert.equal(t("profiles.addTitle"), "Add Provider:");
  setLanguage("zh_CN");
  assert.equal(t("profiles.edit"), "编辑服务商：");
  assert.equal(t("profiles.addTitle"), "添加服务商：");
  assert.doesNotMatch(modelsSettings, /settings-site-icon-button|apps\.changeIcon|openEditor/);
  assert.doesNotMatch(summarySettings, /settings-site-icon-button|apps\.changeIcon/);
  assert.doesNotMatch(messageSettings, /settings-site-icon-button|apps\.changeIcon/);
  assert.doesNotMatch(topicSettings, /settings-site-icon-button|apps\.changeIcon/);
  assert.doesNotMatch(profilesSettings, /settings-site-icon-button/);

  const previousDocument = globalThis.document;
  globalThis.document = { addEventListener() {} };
  try {
    const { createAppState } = await import(moduleUrl("app/state.js"));
    const { createSettingsSectionStatePorts } = await import(moduleUrl("app/settings/state-ports.js"));
    const { createSettingsController } = await import(moduleUrl("app/settings/controller.js"));
    const rootState = createAppState();
    const settingsSections = createSettingsSectionStatePorts(rootState);
    const noop = () => {};
    const asyncNoop = async () => {};
    const settingsDeps = {
      settingsSections,
      officialRules: {},
      importConfigPatch: asyncNoop,
      resetConfig: asyncNoop,
      reloadAfterConfigReset: noop,
      saveCustomConfig: asyncNoop,
      saveOptionsPatch: async (patch) => patch,
      svgIcon: () => ({}),
      syncPromptInputNode: noop,
      notifyConfigReload: asyncNoop,
      render: noop,
      applyTheme: noop,
      syncI18nLanguage: noop,
      hydrateImportedLayoutIfNeeded: asyncNoop,
      reconcileAppCatalog: asyncNoop,
      enterTopbarEditMode: noop,
      setPromptImages: noop,
      syncTopbar: noop,
      syncTopbarPromptPlaceholder: noop,
      syncSummaryPanel: noop,
      syncPreferredModelSelectionOverlays: noop,
      syncWorkspaceDom: noop,
      applyPreferredModels: asyncNoop,
      openTabUrl: noop,
      functionalAnomalyLog: {
        record: asyncNoop,
        refresh: async () => [],
        remove: async () => [],
        clear: async () => [],
        snapshot: () => [],
        subscribe: () => () => {},
        exportText: () => ""
      },
      faviconPort: { encodeFile: async () => "", refresh: async () => "" }
    };
    assert.doesNotThrow(() => createSettingsController(settingsDeps));
    assert.doesNotThrow(() => createSettingsController({
      ...settingsDeps,
      faviconPort: undefined
    }));
    assert.throws(
      () => createSettingsController({ ...settingsDeps, combinedState: rootState }),
      /Settings controller received extra dependencies field combinedState/
    );
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }

  class FakeNode {
    constructor(tag = "div") {
      this.tagName = String(tag).toUpperCase();
      this.children = [];
      this.dataset = {};
      this.attributes = new Map();
      this.className = "";
      this.hidden = false;
      this.src = "";
      this.listeners = Object.create(null);
    }

    setAttribute(name, value) {
      this.attributes.set(name, String(value));
      if (name === "src") this.src = String(value);
      if (name === "class") this.className = String(value);
    }

    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    }

    append(...children) {
      this.children.push(...children.filter(Boolean));
    }

    addEventListener(name, listener) {
      const key = String(name || "");
      if (!this.listeners[key]) this.listeners[key] = [];
      this.listeners[key].push(listener);
    }
  }

  const previousNode = globalThis.Node;
  const previousMarkDocument = globalThis.document;
  globalThis.Node = FakeNode;
  globalThis.document = {
    createElement: (tag) => new FakeNode(tag),
    createTextNode: (value) => {
      const node = new FakeNode("#text");
      node.textContent = String(value);
      return node;
    }
  };
  try {
    const { settingsSiteMark } = await import(moduleUrl("app/settings/app-icon.js"));
    const port = {
      app: (app) => (app?.id === "DeepSeek" ? "CHAT-APP-OVERRIDE" : ""),
      effective: (_href, logoUrl) => String(logoUrl || ""),
      networkUrls: (href) => [`https://icons.duckduckgo.com/ip3/${new URL(href).hostname}.ico`]
    };
    const skipped = settingsSiteMark({
      href: "https://api.deepseek.com/v1/chat/completions",
      skipCatalog: true
    }, port);
    assert.notEqual(skipped.getAttribute("src") || skipped.src, "CHAT-APP-OVERRIDE");
    assert.match(skipped.getAttribute("src") || skipped.src || "", /deepseek\.com/);
    assert.equal(skipped.getAttribute("loading"), "eager");
    assert.equal(skipped.dataset.faviconReady, undefined);
    skipped.listeners.load[0]({ currentTarget: skipped });
    assert.equal(skipped.dataset.faviconReady, "1");
    const bound = settingsSiteMark({ href: "https://chat.deepseek.com/" }, port);
    assert.equal(bound.getAttribute("src") || bound.src, "CHAT-APP-OVERRIDE");
    const custom = settingsSiteMark({
      href: "https://api.deepseek.com/v1/chat/completions",
      logoUrl: "https://cdn.example.com/relay.png",
      skipCatalog: true
    }, port);
    assert.equal(custom.getAttribute("src") || custom.src, "https://cdn.example.com/relay.png");
    const missPort = {
      effective: () => "",
      networkUrls: () => ["https://fail.example/icon.png"]
    };
    const missed = settingsSiteMark({
      href: "https://api.example.test/v1/chat/completions",
      skipCatalog: true
    }, missPort);
    missed.listeners.error[0]({ currentTarget: missed });
    assert.equal(missed.hidden, false);
    assert.equal(missed.dataset.faviconMiss, "1");
    assert.match(String(missed.className), /settings-site-icon-empty/);
  } finally {
    if (previousNode === undefined) delete globalThis.Node;
    else globalThis.Node = previousNode;
    if (previousMarkDocument === undefined) delete globalThis.document;
    else globalThis.document = previousMarkDocument;
  }

  console.log("settings site icon: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
