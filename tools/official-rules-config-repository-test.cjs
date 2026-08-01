#!/usr/bin/env node

const assert = require("node:assert/strict");

(async () => {
  const { officialRulesComponentKey } = await import("../shared/official-rules-baseline.js");
  const { configMatchesHref, officialRuleConfigMatchesHref } = await import("../shared/url-match.js");
  const {
    createOfficialRulesConfigRepository,
    createOfficialRulesStorageConfigAdapter,
    mergeOfficialRuleComponents,
    projectEffectiveOptionsToStoredV4
  } = await import("../background/official-rules-config-repository.js");
  const { createOfficialRulesTransitionCoordinator } = await import("../background/official-rules-updater.js");

  class MemoryStorage {
    constructor(values = {}) { this.values = structuredClone(values); }
    async get(keys) {
      if (keys === null) return structuredClone(this.values);
      const selected = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(selected.filter((key) => Object.hasOwn(this.values, key)).map((key) => [key, structuredClone(this.values[key])]));
    }
    async set(values) { Object.assign(this.values, structuredClone(values)); }
    async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete this.values[key]; }
  }

  const packagedOptions = {
    summarySiteConfigs: [{
      id: "chatgpt", name: "ChatGPT", builtIn: true, sourceMode: "builtIn",
      enabled: true, fallbackMode: "structuredOnly", hosts: ["chatgpt.com", "*.chatgpt.com"], pathPrefixes: ["/old"],
      userscriptFile: "chatgpt.js", userscriptLength: 123
    }],
    messageNavigatorSiteConfigs: [{
      id: "chatgpt", name: "ChatGPT", builtIn: true, enabled: true,
      adapter: "chatgpt", hosts: ["chatgpt.com"], messageSelector: "article",
      userSelector: "[data-role=user]", assistantSelector: "[data-role=assistant]",
      textCleanupSelectors: [], summaryMaxChars: 60
    }],
    topicDeleteSiteConfigs: [{
      id: "chatgpt", name: "ChatGPT", builtIn: true, sourceMode: "builtIn", enabled: true,
      scriptId: "chatgpt", scriptVersion: "packaged", userscriptFile: "topic-delete-userscripts/chatgpt.user.js",
      userscriptLength: 321, userscriptTimeoutMs: 15000, hosts: ["chatgpt.com", "*.chatgpt.com"]
    }]
  };
  const components = [
    {
      feature: "summary", siteId: "chatgpt", revision: 8, status: "active",
      hosts: ["chatgpt.com", "new.chatgpt.com"], pathPrefixes: ["/c/"],
      selectors: { conversationRoot: ["main"], messageRoot: ["article[data-message]"], userRoot: ["[data-role=user]"], assistantRoot: ["[data-role=assistant]"], cleanup: [], actionBar: [], messageCopy: [], userRoleSignal: [], assistantRoleSignal: [], nestedCodeAction: [], referenceAction: [] },
      parameters: { waitMs: 700 }
    },
    {
      feature: "messageNavigator", siteId: "chatgpt", revision: 4, status: "active",
      hosts: ["chatgpt.com"], pathPrefixes: [],
      selectors: { conversationRoot: ["main"], message: ["article[data-message]"], userRole: ["[data-role=user]"], assistantRole: ["[data-role=assistant]"], content: [".markdown"], effectTarget: [], exclude: ["button"], composer: ["textarea"] },
      parameters: { summaryMaxChars: 72 }
    },
    {
      feature: "delete", siteId: "chatgpt", revision: 3, status: "active",
      hosts: ["chatgpt.com", "new.chatgpt.com"], pathPrefixes: ["/c/"],
      selectors: { scope: ["main"], conversationLink: [], conversationRow: [], menuTrigger: ["button[data-menu]"], menuRoot: ["[role=menu]"], deleteCandidate: ["[role=menuitem][data-delete]"], dialog: ["[role=dialog]"], confirmCandidate: ["button[data-confirm-delete]"], completionLinks: [] },
      parameters: { timeoutMs: 18000 }
    }
  ];
  const materialized = {
    snapshot: { source: "remote", sequence: 9, catalogHash: "a".repeat(64) },
    components: Object.fromEntries(components.map((component) => [officialRulesComponentKey(component.feature, component.siteId), component]))
  };
  const summaryKey = officialRulesComponentKey("summary", "chatgpt");
  const navigatorKey = officialRulesComponentKey("messageNavigator", "chatgpt");
  const deleteKey = officialRulesComponentKey("delete", "chatgpt");
  const customSummary = {
    id: "custom-summary", name: "Custom Summary", builtIn: false, sourceMode: "custom",
    customUserscript: "return { messages: [] };", hosts: ["custom.example"]
  };
  const storedOptions = {
    optionsSchemaVersion: 4,
    scriptConfigSchemaVersion: 3,
    themeMode: "system",
    officialOrders: {
      summary: ["custom/summary/custom-summary", summaryKey],
      messageNavigator: [navigatorKey],
      delete: [deleteKey]
    },
    officialOverrides: {
      [summaryKey]: { enabled: false }
    },
    summarySiteConfigs: [customSummary],
    messageNavigatorSiteConfigs: [],
    topicDeleteSiteConfigs: []
  };

  const effective = mergeOfficialRuleComponents(storedOptions, materialized, { packagedOptions });
  assert.equal(effective.summarySiteConfigs[0].id, "custom-summary", "saved mixed order must retain custom entries before official entries");
  const officialSummary = effective.summarySiteConfigs[1];
  assert.equal(officialSummary.enabled, false);
  assert.deepEqual(officialSummary.hosts, ["chatgpt.com", "*.chatgpt.com"]);
  assert.deepEqual(officialSummary.officialRuleHttpsHosts, ["new.chatgpt.com"]);
  assert.deepEqual(officialSummary.officialRuleHosts, ["chatgpt.com", "new.chatgpt.com"]);
  assert.deepEqual(officialSummary.officialRulePathPrefixes, ["/c/"]);
  assert.deepEqual(officialSummary.pathPrefixes, ["/old", "/c/"]);
  assert.equal(configMatchesHref(officialSummary, "https://sibling.chatgpt.com/old/thread"), true, "packaged wildcard fallback must stay selectable");
  assert.equal(officialRuleConfigMatchesHref(officialSummary, "https://sibling.chatgpt.com/c/thread"), false, "a packaged wildcard sibling must not inherit exact signed selectors");
  assert.equal(configMatchesHref(officialSummary, "https://chatgpt.com/old/thread"), true, "packaged historical paths must stay selectable");
  assert.equal(officialRuleConfigMatchesHref(officialSummary, "https://chatgpt.com/old/thread"), false, "a packaged-only historical path must not inherit signed selectors");
  assert.equal(officialRuleConfigMatchesHref(officialSummary, "https://chatgpt.com/c/thread"), true);
  assert.equal(officialRuleConfigMatchesHref(officialSummary, "http://chatgpt.com/c/thread"), false);
  assert.equal(officialRuleConfigMatchesHref(officialSummary, "https://chatgpt.com:8443/c/thread"), false);
  assert.equal(officialSummary.userscriptFile, "chatgpt.js", "script identity must remain packaged");
  assert.deepEqual(officialSummary.officialRuleHints.messageRoot, ["article[data-message]"]);
  assert.equal(effective.messageNavigatorSiteConfigs[0].adapter, "chatgpt", "adapter must remain packaged");
  assert.equal(effective.messageNavigatorSiteConfigs[0].strictOfficialRoles, undefined, "packaged fallback must retain its adapter semantics");
  assert.equal(effective.messageNavigatorSiteConfigs[0].officialRuleMessageSelector, "article[data-message]");
  assert.equal(effective.topicDeleteSiteConfigs[0].scriptVersion, "packaged", "delete runtime identity must remain packaged");
  assert.equal(effective.topicDeleteSiteConfigs[0].userscriptTimeoutMs, 15000, "signed timeouts must not replace the packaged fallback timeout");
  assert.equal(effective.topicDeleteSiteConfigs[0].officialRuleTimeoutMs, 18000);
  assert.deepEqual(effective.topicDeleteSiteConfigs[0].officialRuleHosts, ["chatgpt.com"], "a packaged wildcard must not bypass the local Delete alias approval mask");
  assert.deepEqual(effective.topicDeleteSiteConfigs[0].officialRuleHttpsHosts, []);
  assert.deepEqual(effective.topicDeleteSiteConfigs[0].deleteAuthorizedHosts, ["chatgpt.com"]);
  const aliasApproved = mergeOfficialRuleComponents(storedOptions, materialized, {
    packagedOptions,
    isDeleteAliasApproved: (key, host) => key === deleteKey && host === "new.chatgpt.com"
  });
  assert.deepEqual(aliasApproved.topicDeleteSiteConfigs[0].officialRuleHosts, ["chatgpt.com", "new.chatgpt.com"]);
  assert.deepEqual(aliasApproved.topicDeleteSiteConfigs[0].officialRuleHttpsHosts, ["new.chatgpt.com"]);
  assert.deepEqual(aliasApproved.topicDeleteSiteConfigs[0].deleteAuthorizedHosts, ["chatgpt.com", "new.chatgpt.com"]);

  const disabledMaterialized = structuredClone(materialized);
  disabledMaterialized.components[summaryKey].status = "disabled";
  const noOverrideStored = { ...storedOptions, officialOverrides: {} };
  const disabledEffective = mergeOfficialRuleComponents(noOverrideStored, disabledMaterialized, { packagedOptions });
  assert.equal(disabledEffective.summarySiteConfigs[1].enabled, false, "a disabled signed component must fail closed");
  const disabledProjected = projectEffectiveOptionsToStoredV4(disabledEffective, disabledMaterialized, {
    packagedOptions,
    previousStoredOptions: noOverrideStored
  });
  assert.equal(
    Object.hasOwn(disabledProjected.officialOverrides[summaryKey] || {}, "enabled"),
    false,
    "official status must not materialize as a persistent user override"
  );
  const reactivated = mergeOfficialRuleComponents(disabledProjected, materialized, { packagedOptions });
  assert.equal(reactivated.summarySiteConfigs[1].enabled, true, "a later active status must follow official state when the user did not override enabled");

  const maliciousStoredOptions = structuredClone(storedOptions);
  maliciousStoredOptions.officialOverrides[deleteKey] = {
    enabled: false,
    officialRuleHints: { menuTrigger: [".attacker-controlled"] },
    officialRuleRevision: 999,
    scriptVersion: "attacker"
  };
  const attacked = mergeOfficialRuleComponents(maliciousStoredOptions, materialized, { packagedOptions });
  assert.equal(attacked.topicDeleteSiteConfigs[0].enabled, false, "an allowed user override must remain effective");
  assert.deepEqual(attacked.topicDeleteSiteConfigs[0].officialRuleHints.menuTrigger, ["button[data-menu]"]);
  assert.equal(attacked.topicDeleteSiteConfigs[0].officialRuleRevision, 3);
  assert.equal(attacked.topicDeleteSiteConfigs[0].scriptVersion, "packaged", "read-only Delete identity and hints must never be overridden");

  officialSummary.fallbackMode = "domFallback";
  const projected = projectEffectiveOptionsToStoredV4(effective, materialized, {
    packagedOptions,
    previousStoredOptions: storedOptions
  });
  assert.equal(projected.optionsSchemaVersion, 4);
  assert.equal(projected.scriptConfigSchemaVersion, 3, "userscript schema must remain v3");
  assert.deepEqual(projected.summarySiteConfigs, [customSummary], "only explicit custom records may remain in stored site arrays");
  assert.deepEqual(projected.officialOverrides[summaryKey], { enabled: false, fallbackMode: "domFallback" });
  assert.equal(JSON.stringify(projected).includes("officialRuleHints"), false, "downloaded selectors must never be persisted as user overrides");
  assert.equal(JSON.stringify(projected).includes("new.chatgpt.com"), false, "downloaded hosts must never be persisted as user overrides");

  const collision = mergeOfficialRuleComponents({
    ...storedOptions,
    officialOrders: { ...storedOptions.officialOrders, summary: ["custom/summary/chatgpt", summaryKey] },
    summarySiteConfigs: [{
      id: "chatgpt", name: "My ChatGPT", builtIn: true, sourceMode: "custom",
      customUserscript: "return custom();", hosts: ["chatgpt.com"],
      officialRuleRevision: 8,
      officialRuleHints: { messageRoot: [".must-not-survive"] },
      officialRuleHttpsHosts: ["new.chatgpt.com"]
    }]
  }, materialized, { packagedOptions });
  assert.equal(collision.summarySiteConfigs.length, 1);
  assert.equal(collision.summarySiteConfigs[0].sourceMode, "custom", "explicit custom intent must win an official id collision");
  assert.equal(
    Object.keys(collision.summarySiteConfigs[0]).some((key) => key.startsWith("officialRule")),
    false,
    "custom entries must never retain downloaded official-rule fields"
  );

  const storage = new MemoryStorage({ options: projected, customConfig: [] });
  const adapter = createOfficialRulesStorageConfigAdapter({ storage });
  const rulesState = {
    activationRevision: 3,
    active: { source: "remote", sequence: 9, catalogHash: "a".repeat(64) }
  };
  const rulesRepository = { async readState() { return structuredClone(rulesState); } };
  const coordinator = createOfficialRulesTransitionCoordinator();
  const configRepository = createOfficialRulesConfigRepository({
    officialRulesRepository: rulesRepository,
    materializeRules: async () => materialized,
    packagedOptions,
    transitionCoordinator: coordinator,
    ...adapter
  });
  const snapshot = await configRepository.getConfigSnapshot({
    loadOptions: adapter.loadOptions,
    loadCustomConfig: adapter.loadCustomConfig
  });
  assert.equal(snapshot.revision, 0);
  assert.equal(snapshot.activationRevision, 3);
  assert.equal(snapshot.options.summarySiteConfigs[1].fallbackMode, "domFallback");

  const saved = await configRepository.patchConfig({
    expectedRevision: 0,
    expectedActivationRevision: 3,
    patch: { options: { themeMode: "dark" } }
  });
  assert.equal(saved.revision, 1);
  assert.equal(saved.options.themeMode, "dark");
  assert.equal(storage.values.options.optionsSchemaVersion, 4);
  assert.equal(JSON.stringify(storage.values.options).includes("officialRuleHints"), false);

  const maliciousStorage = new MemoryStorage({ options: maliciousStoredOptions, customConfig: [] });
  const maliciousAdapter = createOfficialRulesStorageConfigAdapter({ storage: maliciousStorage });
  const canonicalStored = await maliciousAdapter.loadOptions();
  assert.deepEqual(canonicalStored.officialOverrides[deleteKey], { enabled: false });
  assert.equal(JSON.stringify(canonicalStored).includes("attacker-controlled"), false, "storage reads must strip imported read-only official fields");

  await assert.rejects(
    configRepository.patchConfig({ expectedRevision: 0, patch: { options: { themeMode: "light" } } }),
    (error) => error?.name === "ConfigRevisionConflictError" && error.code === "CONFIG_REVISION_CONFLICT"
  );
  await assert.rejects(
    configRepository.patchConfig({ expectedRevision: 1, patch: { options: { themeMode: "light" } } }),
    (error) => error?.code === "ACTIVATION_REVISION_CONFLICT"
  );
  const concurrent = await Promise.allSettled([
    configRepository.patchConfig({ expectedRevision: 1, expectedActivationRevision: 3, patch: { options: { themeMode: "light" } } }),
    configRepository.patchConfig({ expectedRevision: 1, expectedActivationRevision: 3, patch: { options: { themeMode: "system" } } })
  ]);
  assert.equal(concurrent.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(concurrent.filter(({ status }) => status === "rejected").length, 1);
  assert.equal(concurrent.find(({ status }) => status === "rejected").reason.code, "CONFIG_REVISION_CONFLICT");

  console.log("Official rules effective config merge, sparse v4 projection, and revisioned single-writer tests passed.");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
