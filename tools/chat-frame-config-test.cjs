#!/usr/bin/env node

const assert = require("node:assert/strict");

(async () => {
  const frameConfig = await import("../shared/chat-frame-config.js");
  const {
    CHAT_FRAME_ALLOW_FEATURES,
    CHAT_FRAME_SANDBOX_TOKENS,
    iframeConfigRiskKeys,
    inspectIframeConfig,
    normalizeIframeConfig,
    resolveChatFrameAttributeContract
  } = frameConfig;
  const {
    getAllChatApps,
    normalizeCustomConfig,
    normalizeOptions
  } = await import("../shared/storage-schema.js");
  const { exportConfigBundle, inspectImportedConfig } = await import("../shared/storage-config-bundle.js");

  assert.equal(CHAT_FRAME_ALLOW_FEATURES.length, 13);

  const claude = { id: "Claude", url: "https://claude.ai/new", hosts: ["claude.ai", "*.claude.ai"] };
  const grok = { id: "Grok", url: "https://grok.com/", hosts: ["grok.com", "*.grok.com"], noSandbox: true };
  const notion = { id: "NotionAI", url: "https://app.notion.com/ai", hosts: ["app.notion.com"], noSandbox: true };
  for (const app of [claude, grok, notion]) {
    const contract = resolveChatFrameAttributeContract({ app, url: app.url });
    assert.equal(contract.attributes.allow.split("; ").length, CHAT_FRAME_ALLOW_FEATURES.length);
    assert.equal(contract.attributes.referrerpolicy, "no-referrer");
    assert.equal("sandbox" in contract.attributes, app === claude);
    if (app === claude) assert.equal(contract.attributes.sandbox, CHAT_FRAME_SANDBOX_TOKENS.join(" "));
  }

  assert.equal(resolveChatFrameAttributeContract({ app: claude, url: "https://sub.claude.ai/chat/1" }).inScope, true);
  assert.equal(resolveChatFrameAttributeContract({ app: claude, url: "https://example.test/" }).inScope, false);
  const grokOutOfScope = resolveChatFrameAttributeContract({
    app: grok,
    url: "https://example.test/",
    iframeConfig: { sandbox: { mode: "omit" }, attributes: [{ name: "title", value: "ignored" }] }
  });
  assert.equal(grokOutOfScope.inScope, false);
  assert.deepEqual(
    Object.keys(grokOutOfScope).sort(),
    ["attributes", "entries", "inScope", "signature"].sort()
  );
  assert.equal(grokOutOfScope.attributes.sandbox, CHAT_FRAME_SANDBOX_TOKENS.join(" "));
  assert.equal("title" in grokOutOfScope.attributes, false);

  const visual = inspectIframeConfig({
    allow: { mode: "visual", features: ["camera", "microphone", "camera"] },
    sandbox: {
      mode: "visual",
      tokens: ["allow-presentation", "allow-scripts", "allow-presentation"]
    },
    referrerPolicy: { mode: "value", value: "STRICT-ORIGIN" },
    attributes: [
      { name: "TITLE", value: "Chat" },
      { name: "aria-label", value: "" },
      { name: "credentialless", value: "" }
    ]
  });
  assert.equal(visual.valid, true);
  assert.deepEqual(visual.value.allow.features, ["microphone", "camera"]);
  assert.deepEqual(visual.value.sandbox.tokens, ["allow-scripts", "allow-presentation"]);
  assert.equal(visual.value.referrerPolicy.value, "strict-origin");
  assert.deepEqual(visual.value.attributes.map(({ name }) => name), ["aria-label", "credentialless", "title"]);
  const visualContract = resolveChatFrameAttributeContract({ app: claude, iframeConfig: visual.value });
  assert.equal(visualContract.attributes.allow.split("; ")[0], "microphone *");
  assert.match(visualContract.attributes.allow, /clipboard-write 'none'/);
  assert.match(visualContract.attributes.allow, /camera \*/);
  assert.equal(visualContract.attributes.sandbox, "allow-scripts allow-presentation");
  assert.equal(visualContract.attributes["aria-label"], "");
  assert.equal(visualContract.attributes.credentialless, "");

  const emptyRaw = normalizeIframeConfig({
    allow: { mode: "raw", value: "" },
    sandbox: { mode: "raw", value: "" }
  }, { strict: true });
  const emptyRawContract = resolveChatFrameAttributeContract({ app: claude, iframeConfig: emptyRaw });
  assert.equal(emptyRawContract.attributes.allow, "");
  assert.equal(emptyRawContract.attributes.sandbox, "");

  const omitted = resolveChatFrameAttributeContract({
    app: claude,
    iframeConfig: {
      allow: { mode: "omit" },
      sandbox: { mode: "omit" },
      referrerPolicy: { mode: "omit" }
    }
  });
  assert.deepEqual(omitted.attributes, {});

  const futureRaw = inspectIframeConfig({
    allow: { mode: "raw", value: "future-capability *; camera 'none'; microphone *" },
    sandbox: { mode: "raw", value: "allow-future-mode allow-scripts allow-future-mode" }
  });
  assert.equal(futureRaw.valid, true);
  assert.equal(
    futureRaw.value.allow.value,
    "microphone *; camera 'none'; future-capability *"
  );
  assert.equal(futureRaw.value.sandbox.value, "allow-scripts allow-future-mode");
  assert.ok(futureRaw.warnings.some(({ code, token }) => code === "allow-feature-unknown" && token === "future-capability"));
  assert.ok(futureRaw.warnings.some(({ code, token }) => code === "raw-token-unknown" && token === "allow-future-mode"));
  assert.ok(futureRaw.risks.includes("allow:unknown:future-capability"));
  assert.ok(futureRaw.risks.includes("sandbox:unknown:allow-future-mode"));
  const futureAllowList = inspectIframeConfig({
    allow: { mode: "raw", value: "autoplay 'future-token'" }
  });
  assert.ok(futureAllowList.warnings.some(({ code }) => code === "allow-list-token-unknown"));
  assert.ok(futureAllowList.risks.includes("allow:unknown-token:'future-token'"));

  assert.ok(iframeConfigRiskKeys({ allow: { mode: "visual", features: ["camera"] } }).includes("allow:camera"));
  assert.ok(iframeConfigRiskKeys({ sandbox: { mode: "omit" } }).includes("sandbox:omit"));
  assert.ok(iframeConfigRiskKeys({
    sandbox: { mode: "visual", tokens: ["allow-scripts", "allow-same-origin"] }
  }).includes("sandbox:scripts-and-same-origin"));

  for (const name of [
    "src", "srcdoc", "name", "id", "class", "dataset", "style", "allow", "sandbox", "referrerPolicy",
    "data-instance-id", "onclick", "onload"
  ]) {
    const inspected = inspectIframeConfig({ attributes: [{ name, value: "x" }] });
    assert.equal(inspected.valid, false, `${name} must be protected`);
  }
  const duplicateAttributes = inspectIframeConfig({
    attributes: [{ name: "TITLE", value: "a" }, { name: "title", value: "b" }]
  });
  assert.equal(duplicateAttributes.valid, false);
  assert.ok(duplicateAttributes.errors.some(({ code }) => code === "attribute-name-duplicate"));
  assert.throws(
    () => normalizeIframeConfig({ attributes: [{ name: "src", value: "x" }] }, { strict: true }),
    (error) => error?.code === "INVALID_IFRAME_CONFIG"
  );

  const canonicalA = resolveChatFrameAttributeContract({
    app: claude,
    iframeConfig: { sandbox: { mode: "raw", value: "allow-forms allow-scripts allow-forms" } }
  });
  const canonicalB = resolveChatFrameAttributeContract({
    app: claude,
    iframeConfig: { sandbox: { mode: "raw", value: "allow-scripts allow-forms" } }
  });
  assert.equal(canonicalA.signature, canonicalB.signature);

  const options = normalizeOptions({
    builtinChatAppIframeConfigs: {
      Claude: { allow: { mode: "omit" } },
      Grok: { sandbox: { mode: "raw", value: "" } },
      Missing: { sandbox: { mode: "omit" } },
      Gemini: { attributes: [{ name: "src", value: "bad" }] }
    }
  });
  assert.deepEqual(Object.keys(options.builtinChatAppIframeConfigs), ["Claude", "Grok"]);
  assert.equal(options.builtinChatAppIframeConfigs.Grok.sandbox.value, "");

  const custom = normalizeCustomConfig([
    {
      id: "Claude",
      name: "Custom Claude",
      url: "https://custom.example/",
      iframeConfig: { sandbox: { mode: "omit" }, attributes: [{ name: "title", value: "custom" }] }
    },
    {
      id: "invalid-config",
      name: "Still retained",
      url: "https://retained.example/",
      iframeConfig: { attributes: [{ name: "src", value: "bad" }] }
    }
  ]);
  assert.equal(custom.length, 2);
  assert.equal(custom[0].iframeConfig.sandbox.mode, "omit");
  assert.equal("iframeConfig" in custom[1], false);

  const apps = getAllChatApps(custom, ["Claude", "Grok"], options.builtinChatAppIframeConfigs);
  assert.equal(apps.find(({ id }) => id === "Claude").source, "custom");
  assert.equal(apps.some(({ id, source }) => id === "Claude" && source === "builtin"), false);
  assert.equal(apps.find(({ id }) => id === "Grok").chatAppSource, "builtin");
  assert.equal(apps.find(({ id }) => id === "Grok").iframeConfig.sandbox.value, "");

  const customClaudeContract = resolveChatFrameAttributeContract({
    app: apps.find(({ id }) => id === "Claude"),
    url: "https://custom.example/",
    options
  });
  assert.equal("sandbox" in customClaudeContract.attributes, false);
  assert.equal(customClaudeContract.attributes.title, "custom");
  const builtinClaudeContract = resolveChatFrameAttributeContract({
    app: claude,
    source: "builtin",
    options
  });
  assert.equal("allow" in builtinClaudeContract.attributes, false);
  assert.equal("sandbox" in builtinClaudeContract.attributes, true);

  const exported = exportConfigBundle({ options, customConfig: custom }, ["options", "customConfig"]);
  assert.deepEqual(exported.options.builtinChatAppIframeConfigs, options.builtinChatAppIframeConfigs);
  assert.deepEqual(exported.customConfig[0].iframeConfig, custom[0].iframeConfig);

  const inspectedImport = inspectImportedConfig({
    schema: "chatclub.config.v1",
    options: {
      builtinChatAppIframeConfigs: {
        Claude: { allow: { mode: "omit" } },
        Grok: { attributes: [{ name: "onload", value: "bad" }] }
      }
    },
    customConfig: [
      {
        id: "retained",
        name: "Retained",
        url: "https://retained.example/",
        iframeConfig: { attributes: [{ name: "src", value: "bad" }] }
      },
      {
        id: "risky",
        name: "Risky",
        url: "https://risky.example/",
        iframeConfig: { sandbox: { mode: "omit" } }
      }
    ]
  });
  assert.equal(inspectedImport.diagnostics.iframeConfigs.droppedCount, 2);
  assert.ok(inspectedImport.diagnostics.iframeConfigs.risks.length > 0);
  assert.deepEqual(
    Object.keys(inspectedImport.diagnostics.iframeConfigs).sort(),
    ["droppedCount", "invalid", "risks", "warnings"]
  );
  assert.deepEqual(
    Object.keys(inspectedImport.diagnostics.customConfig).sort(),
    ["droppedCount", "value"]
  );
  assert.equal(inspectedImport.data.customConfig.length, 2);
  assert.equal("iframeConfig" in inspectedImport.data.customConfig[0], false);
  assert.equal(inspectedImport.data.customConfig[1].iframeConfig.sandbox.mode, "omit");
  assert.deepEqual(Object.keys(inspectedImport.data.options.builtinChatAppIframeConfigs), ["Claude"]);

  console.log("chat frame config: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
