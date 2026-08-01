#!/usr/bin/env node

const assert = require("node:assert/strict");

(async () => {
  const baseline = await import("../shared/official-rules-baseline.js");
  const contract = await import("../shared/official-rules-contract.js");
  const {
    OFFICIAL_RULES_BASELINE_COMPONENTS,
    OFFICIAL_RULES_COMPONENT_KEYS,
    findOfficialRulesBaselineComponent,
    officialRulesCanonicalExactHost,
    officialRulesComponentKey,
    officialRulesHostAuthorization
  } = baseline;
  const officialRulesBaselineComponents = (feature) => (
    OFFICIAL_RULES_BASELINE_COMPONENTS.filter((entry) => entry.feature === feature)
  );
  const officialRulesComponentProfile = (feature, siteId) => (
    findOfficialRulesBaselineComponent(feature, siteId)?.profile || ""
  );
  const officialRulesTrustRoots = (feature, siteId) => (
    findOfficialRulesBaselineComponent(feature, siteId)?.trustRoots || []
  );
  const officialRulesPackagedExactHosts = (feature, siteId) => (
    findOfficialRulesBaselineComponent(feature, siteId)?.packagedExactHosts || []
  );
  const officialRulesHostWithinTrustRoots = (feature, siteId, host) => (
    officialRulesHostAuthorization(feature, siteId, host).reason !== "outside-trust-root"
  );
  const {
    OFFICIAL_RULES_CHANNEL_SIGNATURE_URL,
    OFFICIAL_RULES_CHANNEL_URL,
    OFFICIAL_RULES_LIMITS,
    OFFICIAL_RULES_SELECTOR_SLOTS,
    inspectOfficialRulesCatalog,
    inspectOfficialRulesChannel,
    inspectOfficialRulesComponent,
    inspectOfficialRulesReleaseUrl,
    inspectOfficialRulesSignature,
    normalizeOfficialRulesCatalog,
    normalizeOfficialRulesChannel,
    normalizeOfficialRulesComponent
  } = contract;

  const sha256 = "a".repeat(64);
  const tag = "rules-v1";
  const OFFICIAL_RULES_RELEASE_PREFIX = "https://github.com/0-V-linuxdo/ChatClub-rules/releases/download/";
  const releaseUrl = (asset) => `${OFFICIAL_RULES_RELEASE_PREFIX}${tag}/${asset}`;
  const signedReference = (asset, size = 1024) => ({
    url: releaseUrl(asset),
    signatureUrl: releaseUrl(`${asset}.sig.json`),
    size,
    sha256,
    keyId: "offline-p256-2026"
  });
  const metadata = () => ({
    schemaVersion: 1,
    channel: "stable",
    sequence: 1,
    rulesVersion: "2026.08.01.1",
    rulesApiVersion: 1,
    minExtensionVersion: "2026.7.31.1",
    publishedAt: "2026-08-01T00:00:00Z"
  });
  const selectorsFor = (feature) => Object.fromEntries(
    OFFICIAL_RULES_SELECTOR_SLOTS[feature].map((slot) => [slot, []])
  );
  const component = (feature, siteId) => {
    const selectors = selectorsFor(feature);
    if (feature === "summary") {
      selectors.messageRoot = ["article[data-message]"];
      selectors.userRoot = ["[data-role='user']"];
      selectors.assistantRoot = ["[data-role='assistant']"];
    }
    if (feature === "messageNavigator") {
      selectors.message = ["article[data-message]"];
      selectors.userRole = ["[data-role='user']"];
      selectors.assistantRole = ["[data-role='assistant']"];
      selectors.composer = ["textarea"];
    }
    if (feature === "delete") selectors.scope = ["main"];
    const parameters = feature === "summary"
      ? { waitMs: 1000 }
      : feature === "messageNavigator" ? { summaryMaxChars: 60 } : { timeoutMs: 15000 };
    const packagedHost = officialRulesPackagedExactHosts(feature, siteId)[0];
    return {
      schemaVersion: 1,
      rulesApiVersion: 1,
      feature,
      siteId,
      revision: 1,
      status: "active",
      hosts: packagedHost ? [packagedHost] : [],
      pathPrefixes: [],
      selectors,
      parameters
    };
  };
  const pointer = ({ feature, siteId }, revision = 1) => {
    const asset = `${feature}-${siteId}.json`;
    return {
      feature,
      siteId,
      revision,
      ...signedReference(asset)
    };
  };
  const catalog = () => ({
    ...metadata(),
    releaseNotes: "Signed declarative compatibility update.",
    components: OFFICIAL_RULES_BASELINE_COMPONENTS.map((entry) => pointer(entry))
  });
  const signature = (bytes = 64) => ({
    schemaVersion: 1,
    keyId: "offline-p256-2026",
    algorithm: "ECDSA-P256-SHA256",
    signature: Buffer.alloc(bytes).toString("base64url")
  });

  assert.equal(OFFICIAL_RULES_BASELINE_COMPONENTS.length, 29);
  assert.equal(officialRulesBaselineComponents("summary").length, 10);
  assert.equal(officialRulesBaselineComponents("messageNavigator").length, 11);
  assert.equal(officialRulesBaselineComponents("delete").length, 8);
  assert.equal(new Set(OFFICIAL_RULES_COMPONENT_KEYS).size, OFFICIAL_RULES_COMPONENT_KEYS.length);
  assert.equal(officialRulesComponentKey("summary", "chatgpt"), "summary/chatgpt");
  assert.equal(findOfficialRulesBaselineComponent("summary", "chatgpt")?.siteId, "chatgpt");
  assert.equal(officialRulesComponentProfile("messageNavigator", "grokMirror"), "grok");
  assert.equal(officialRulesComponentProfile("delete", "grokMirror"), "grok-mirror");
  assert.equal(officialRulesComponentProfile("summary", "missing"), "");
  assert.ok(officialRulesTrustRoots("summary", "chatgpt").includes("chatgpt.com"));
  assert.ok(officialRulesPackagedExactHosts("delete", "chatgpt").includes("chatgpt.com"));
  assert.ok(officialRulesPackagedExactHosts("delete", "deepseek").includes("chat.deepseek.com"));
  assert.equal(officialRulesCanonicalExactHost("CHATGPT.COM"), "chatgpt.com");
  assert.equal(officialRulesCanonicalExactHost("xn--caf-dma.chatgpt.com"), "");
  assert.equal(officialRulesHostWithinTrustRoots("summary", "chatgpt", "new.chatgpt.com"), true);
  assert.equal(officialRulesHostWithinTrustRoots("summary", "chatgpt", "chatgpt.com.evil.test"), false);
  assert.equal(officialRulesHostWithinTrustRoots("summary", "chatgpt", "evil-chatgpt.com"), false);
  assert.equal(officialRulesHostWithinTrustRoots("summary", "chatgpt", "*.chatgpt.com"), false);
  assert.equal(officialRulesHostWithinTrustRoots("summary", "chatgpt", "127.0.0.1"), false);
  assert.equal(officialRulesHostAuthorization("summary", "chatgpt", "new.chatgpt.com").allowed, true);
  assert.equal(officialRulesHostAuthorization("delete", "chatgpt", "chatgpt.com").allowed, true);
  assert.deepEqual(
    { ...officialRulesHostAuthorization("delete", "chatgpt", "new.chatgpt.com") },
    { allowed: false, host: "new.chatgpt.com", reason: "delete-alias-not-safe", alias: true }
  );
  assert.equal(findOfficialRulesBaselineComponent("delete", "chatgpt").deleteAliasPolicy.aliasSafe, false);

  const partialSummary = component("summary", "chatgpt");
  partialSummary.selectors = selectorsFor("summary");
  partialSummary.selectors.cleanup = [".citation"];
  assert.ok(
    inspectOfficialRulesComponent(partialSummary).errors.some(({ code }) => code === "summary-selector-profile-incomplete"),
    "Summary remote selector hints must establish both roles and a message root"
  );

  const partialNavigator = component("messageNavigator", "chatgpt");
  partialNavigator.selectors = selectorsFor("messageNavigator");
  partialNavigator.selectors.message = ["article"];
  assert.ok(
    inspectOfficialRulesComponent(partialNavigator).errors.some(({ code }) => code === "message-navigator-selector-profile-incomplete"),
    "Message Navigator remote selector hints must establish both roles"
  );

  assert.equal(OFFICIAL_RULES_CHANNEL_URL, "https://0-v-linuxdo.github.io/ChatClub-rules/stable/channel.json");
  assert.equal(OFFICIAL_RULES_CHANNEL_SIGNATURE_URL, "https://0-v-linuxdo.github.io/ChatClub-rules/stable/channel.sig.json");
  const inspectedSignature = inspectOfficialRulesSignature(JSON.stringify(signature()));
  assert.equal(inspectedSignature.valid, true);
  const normalizedSignature = inspectedSignature.value;
  assert.deepEqual(Object.keys(normalizedSignature), ["schemaVersion", "keyId", "algorithm", "signature"]);
  assert.equal(normalizedSignature.signature.length, 86);
  assert.ok(inspectOfficialRulesSignature({ ...signature(), envelope: {} }).errors.some(({ code }) => code === "unknown-field"));
  assert.ok(inspectOfficialRulesSignature({ ...signature(), algorithm: "ES256" }).errors.some(({ code }) => code === "signature-algorithm-invalid"));
  assert.ok(inspectOfficialRulesSignature(signature(63)).errors.some(({ code }) => code === "string-format-invalid"));
  assert.ok(inspectOfficialRulesSignature({ ...signature(), signature: `${signature().signature}=` }).errors.some(({ code }) => code === "string-too-long"));
  assert.ok(inspectOfficialRulesSignature(`${JSON.stringify(signature())}${" ".repeat(OFFICIAL_RULES_LIMITS.signatureBytes)}`).errors.some(({ code }) => code === "document-too-large"));
  assert.equal(inspectOfficialRulesSignature("null").valid, false);

  const validRelease = inspectOfficialRulesReleaseUrl(releaseUrl("catalog.json"));
  assert.equal(validRelease.valid, true);
  assert.equal(validRelease.value.tag, tag);
  assert.equal(validRelease.value.asset, "catalog.json");
  for (const invalidUrl of [
    "https://github.com/0-V-linuxdo/ChatClub/releases/download/rules-v1/catalog.json",
    "http://github.com/0-V-linuxdo/ChatClub-rules/releases/download/rules-v1/catalog.json",
    "https://0-v-linuxdo.github.io/ChatClub-rules/releases/download/rules-v1/catalog.json",
    "https://github.com/0-V-linuxdo/ChatClub-rules/releases/download/rules-v1/nested/catalog.json",
    "https://github.com/0-V-linuxdo/ChatClub-rules/releases/download/rules-v1%2Fescape/catalog.json",
    "https://github.com/0-V-linuxdo/ChatClub-rules/releases/download/rules-v1/catalog.json?raw=1",
    "https://user@github.com/0-V-linuxdo/ChatClub-rules/releases/download/rules-v1/catalog.json"
  ]) {
    assert.equal(inspectOfficialRulesReleaseUrl(invalidUrl).valid, false, invalidUrl);
  }

  const channel = {
    ...metadata(),
    catalog: signedReference("catalog.json", OFFICIAL_RULES_LIMITS.catalogBytes)
  };
  const normalizedChannel = normalizeOfficialRulesChannel(JSON.stringify(channel));
  assert.equal(normalizedChannel.catalog.url, releaseUrl("catalog.json"));
  assert.equal(Object.isFrozen(normalizedChannel.catalog), true);
  const futureApiChannel = normalizeOfficialRulesChannel({ ...channel, rulesApiVersion: 2 });
  assert.equal(futureApiChannel.rulesApiVersion, 2, "schema-v1 channels must expose a future Rules API for compatibility suppression");
  for (const invalidRulesApiVersion of [0, 1.5, 65_536]) {
    assert.equal(
      inspectOfficialRulesChannel({ ...channel, rulesApiVersion: invalidRulesApiVersion }).valid,
      false,
      `channel rulesApiVersion ${invalidRulesApiVersion} must remain bounded`
    );
  }
  assert.equal(inspectOfficialRulesChannel({ ...channel, channel: "beta" }).valid, false);
  assert.equal(inspectOfficialRulesChannel({ ...channel, catalog: { ...channel.catalog, size: OFFICIAL_RULES_LIMITS.catalogBytes + 1 } }).valid, false);
  assert.ok(inspectOfficialRulesChannel({ ...channel, userscript: "alert(1)" }).errors.some(({ code }) => code === "forbidden-field"));
  assert.ok(inspectOfficialRulesChannel({ ...channel, catalog: { ...channel.catalog, url: releaseUrl("catalog-v1.json") } }).errors.some(({ code }) => code === "catalog-asset-invalid"));
  assert.ok(inspectOfficialRulesChannel({ ...channel, catalog: { ...channel.catalog, signatureUrl: releaseUrl("catalog.json.sig") } }).errors.some(({ code }) => code === "signature-url-mismatch"));
  assert.ok(inspectOfficialRulesChannel(`${JSON.stringify(channel)}${" ".repeat(OFFICIAL_RULES_LIMITS.channelBytes)}`).errors.some(({ code }) => code === "document-too-large"));
  assert.equal(inspectOfficialRulesChannel("null").valid, false);
  assert.throws(
    () => normalizeOfficialRulesChannel({ ...channel, schemaVersion: 2 }),
    (error) => error?.code === "INVALID_OFFICIAL_RULES_CHANNEL"
  );

  const reversedCatalog = catalog();
  reversedCatalog.components.reverse();
  const normalizedCatalog = normalizeOfficialRulesCatalog(reversedCatalog);
  assert.equal(normalizedCatalog.components.length, OFFICIAL_RULES_COMPONENT_KEYS.length);
  assert.equal(
    officialRulesComponentKey(normalizedCatalog.components[0].feature, normalizedCatalog.components[0].siteId),
    OFFICIAL_RULES_COMPONENT_KEYS[0]
  );
  const missingCatalog = catalog();
  missingCatalog.components.pop();
  assert.ok(inspectOfficialRulesCatalog(missingCatalog).errors.some(({ code }) => code === "component-missing"));
  const duplicateCatalog = catalog();
  duplicateCatalog.components[1] = { ...duplicateCatalog.components[0] };
  assert.ok(inspectOfficialRulesCatalog(duplicateCatalog).errors.some(({ code }) => code === "component-duplicate"));
  const unknownCatalog = catalog();
  unknownCatalog.components[0] = { ...unknownCatalog.components[0], siteId: "unknown-site" };
  assert.ok(inspectOfficialRulesCatalog(unknownCatalog).errors.some(({ code }) => code === "component-unknown"));
  const oldSignatureSuffixCatalog = catalog();
  oldSignatureSuffixCatalog.components[0].signatureUrl = `${oldSignatureSuffixCatalog.components[0].url}.sig`;
  assert.ok(inspectOfficialRulesCatalog(oldSignatureSuffixCatalog).errors.some(({ code }) => code === "signature-url-mismatch"));
  assert.throws(
    () => normalizeOfficialRulesCatalog({ ...catalog(), rulesApiVersion: 2 }),
    (error) => error?.code === "INVALID_OFFICIAL_RULES_CATALOG"
  );

  for (const [feature, siteId] of [
    ["summary", "chatgpt"],
    ["messageNavigator", "grokMirror"],
    ["delete", "deepseek"]
  ]) {
    const normalized = normalizeOfficialRulesComponent(component(feature, siteId));
    assert.equal(normalized.feature, feature);
    assert.equal(normalized.siteId, siteId);
    assert.equal(Object.isFrozen(normalized.selectors), true);
  }

  const baselineRevision = { ...component("summary", "chatgpt"), revision: 0 };
  assert.equal(inspectOfficialRulesComponent(baselineRevision).valid, false);
  assert.equal(inspectOfficialRulesComponent(baselineRevision, { allowBaselineRevisionZero: true }).valid, true);
  assert.throws(
    () => normalizeOfficialRulesComponent({ ...component("summary", "chatgpt"), rulesApiVersion: 2 }),
    (error) => error?.code === "INVALID_OFFICIAL_RULES_COMPONENT"
  );

  for (const host of [
    "chatgpt.com.evil.test",
    "evil-chatgpt.com",
    "*.chatgpt.com",
    "127.0.0.1",
    "[::1]",
    "chatgpt.com:443",
    "http://chatgpt.com",
    "https://chatgpt.com",
    "xn--caf-dma.chatgpt.com",
    "caf\u00e9.chatgpt.com"
  ]) {
    const invalidHost = component("summary", "chatgpt");
    invalidHost.hosts = [host];
    assert.equal(inspectOfficialRulesComponent(invalidHost).valid, false, host);
  }
  const trustedSummaryAlias = component("summary", "chatgpt");
  trustedSummaryAlias.hosts = ["new.chatgpt.com"];
  assert.equal(inspectOfficialRulesComponent(trustedSummaryAlias).valid, true);
  const unsafeDeleteAlias = component("delete", "chatgpt");
  unsafeDeleteAlias.hosts = ["new.chatgpt.com"];
  assert.ok(inspectOfficialRulesComponent(unsafeDeleteAlias).errors.some(({ code }) => code === "delete-alias-not-safe"));

  for (const prefix of ["//evil.test/path", "/../admin", "/%2e%2e/admin", "/safe?query=1", "/safe#fragment", "/safe\\other"] ) {
    const invalidPath = component("summary", "chatgpt");
    invalidPath.pathPrefixes = [prefix];
    assert.ok(inspectOfficialRulesComponent(invalidPath).errors.some(({ code }) => code === "path-prefix-invalid"), prefix);
  }

  const crossSelector = component("summary", "chatgpt");
  crossSelector.selectors.deleteCandidate = ["button"];
  assert.ok(inspectOfficialRulesComponent(crossSelector).errors.some(({ code }) => code === "cross-component-field"));
  const crossParameter = component("summary", "chatgpt");
  crossParameter.parameters.timeoutMs = 15000;
  assert.ok(inspectOfficialRulesComponent(crossParameter).errors.some(({ code }) => code === "cross-component-field"));
  const remoteProfile = { ...component("summary", "chatgpt"), profile: "remote-profile" };
  assert.ok(inspectOfficialRulesComponent(remoteProfile).errors.some(({ code }) => code === "forbidden-field"));
  const remoteSteps = { ...component("delete", "chatgpt"), steps: [{ click: "button" }] };
  assert.ok(inspectOfficialRulesComponent(remoteSteps).errors.some(({ code }) => code === "forbidden-field"));

  const codeSelector = component("summary", "chatgpt");
  codeSelector.selectors.messageRoot = ["javascript:alert(1)"];
  assert.ok(inspectOfficialRulesComponent(codeSelector).errors.some(({ code }) => code === "selector-code-like"));
  const unbalancedSelector = component("summary", "chatgpt");
  unbalancedSelector.selectors.messageRoot = ["article[data-message"];
  assert.ok(inspectOfficialRulesComponent(unbalancedSelector).errors.some(({ code }) => code === "selector-structure-invalid"));
  const selectorAtLimit = component("summary", "chatgpt");
  selectorAtLimit.selectors.messageRoot = [`.${"a".repeat(OFFICIAL_RULES_LIMITS.selectorChars - 1)}`];
  assert.equal(inspectOfficialRulesComponent(selectorAtLimit).valid, true);
  const selectorOverLimit = component("summary", "chatgpt");
  selectorOverLimit.selectors.messageRoot = [`.${"a".repeat(OFFICIAL_RULES_LIMITS.selectorChars)}`];
  assert.ok(inspectOfficialRulesComponent(selectorOverLimit).errors.some(({ code }) => code === "string-too-long"));

  const slotOverLimit = component("summary", "chatgpt");
  slotOverLimit.selectors.messageRoot = Array.from(
    { length: OFFICIAL_RULES_LIMITS.selectorsPerSlot + 1 },
    (_, index) => `.message-${index}`
  );
  assert.ok(inspectOfficialRulesComponent(slotOverLimit).errors.some(({ code }) => code === "selector-slot-limit"));
  const componentOverLimit = component("summary", "chatgpt");
  for (const [slotIndex, slot] of OFFICIAL_RULES_SELECTOR_SLOTS.summary.entries()) {
    componentOverLimit.selectors[slot] = Array.from(
      { length: slotIndex < 8 ? 8 : slotIndex === 8 ? 1 : 0 },
      (_, index) => `.${slot}-${index}`
    );
  }
  assert.ok(inspectOfficialRulesComponent(componentOverLimit).errors.some(({ code }) => code === "selector-component-limit"));

  const oversizedComponent = component("summary", "chatgpt");
  oversizedComponent.pathPrefixes = [`/${"x".repeat(OFFICIAL_RULES_LIMITS.componentBytes)}`];
  assert.ok(inspectOfficialRulesComponent(JSON.stringify(oversizedComponent)).errors.some(({ code }) => code === "document-too-large"));
  assert.equal(OFFICIAL_RULES_LIMITS.signatureBytes, 1024);
  assert.equal(OFFICIAL_RULES_LIMITS.releaseComponentBytes, 512 * 1024);

  assert.throws(
    () => normalizeOfficialRulesComponent({ ...component("delete", "chatgpt"), status: "experimental" }),
    (error) => error?.code === "INVALID_OFFICIAL_RULES_COMPONENT"
  );

  console.log("Official rules incremental contract and packaged baseline tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
