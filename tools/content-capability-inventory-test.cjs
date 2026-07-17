#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { CONTENT_ENTRIES } = require("./generated-artifacts.cjs");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

(async () => {
  const commands = await import(`${pathToFileURL(path.join(root, "shared/frame-commands.js")).href}?test=${Date.now()}`);
  assert.deepEqual(Object.keys(commands.CONTENT_CAPABILITY_BUNDLES), commands.CONTENT_CAPABILITIES);
  const capabilityOutputs = new Set();
  for (const [capability, bundles] of Object.entries(commands.CONTENT_CAPABILITY_BUNDLES)) {
    assert.ok(bundles.length, `${capability} must own at least one bundle`);
    for (const bundle of bundles) {
      assert.ok(CONTENT_ENTRIES[bundle.file], `${capability} references undeclared bundle ${bundle.file}`);
      assert.ok(["MAIN", "ISOLATED"].includes(bundle.world));
      capabilityOutputs.add(bundle.file);
    }
  }
  assert.equal(capabilityOutputs.has("content/grok-cookie-bridge.js"), false, "Grok Cookie preflight must never join repair injection");
  assert.deepEqual(commands.CONTENT_ANCILLARY_BUNDLES["grok-cookie"], {
    file: "content/grok-cookie-bridge.js",
    world: "ISOLATED",
    hosts: ["grok.com"],
    runAt: "document_start"
  });
  const filesFor = (options) => commands.contentInjectionPlan(options).map(({ file }) => file);
  assert.deepEqual(filesFor({ frameUrls: ["https://example.com/chat"] }), [
    "content/preload.js",
    "content/content.js"
  ]);
  assert.deepEqual(filesFor({ frameUrls: ["https://grok.com/chat/1"] }), [
    "content/preload.js",
    "content/grok-cookie-bridge.js",
    "content/content.js"
  ]);
  assert.deepEqual(filesFor({ frameUrls: ["https://subdomain.grok.com/chat/1"] }), [
    "content/preload.js",
    "content/content.js"
  ], "Grok ancillary repair must require the exact verified host");
  assert.deepEqual(filesFor({
    frameUrls: ["https://grok.com/chat/1"],
    features: ["delete", "summary", "delete"]
  }), [
    "content/preload.js",
    "content/grok-cookie-bridge.js",
    "content/content.js",
    "content/summary-userscripts-main.js",
    "content/summary-userscripts.js",
    "content/summary-bridge.js",
    "content/delete.js"
  ], "feature injection order must be canonical and duplicate-free");
  assert.throws(() => filesFor({ features: ["unknown"] }), /Unsupported content capabilities/);

  for (const [command, spec] of Object.entries(commands.FRAME_COMMAND_SPECS)) {
    const capability = String(spec.capability || spec.features?.[0] || "base");
    assert.ok(commands.CONTENT_CAPABILITIES.includes(capability), `${command} has unknown capability ${capability}`);
    if (capability !== "base") assert.deepEqual(spec.features, [capability]);
  }

  const featureEntries = {
    send: "content-src/content-send.js",
    summary: "content-src/content-summary-bridge.js",
    "preferred-model": "content-src/content-preferred-model.js",
    delete: "content-src/content-delete.js",
    "message-navigator": "content-src/message-navigator.js"
  };
  for (const [capability, file] of Object.entries(featureEntries)) {
    const source = read(file);
    assert.match(source, /registerBundle\(/);
    assert.match(source, new RegExp(`capability:\\s*["']${capability.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`));
    assert.doesNotMatch(source, /import \* as summaryRuntime|\.\.\.summaryRuntime/);
    assert.match(source, /\.\/shared\/runtime-registry-client\.js/);
  }
  assert.match(read("content-src/content.js"), /\.\/shared\/runtime-registry\.js/);

  const contentModules = [
    "content-src/content.js",
    ...Object.keys(featureEntries).map((capability) => featureEntries[capability]),
    ...fs.readdirSync(path.join(root, "content-src/capabilities")).map((name) => `content-src/capabilities/${name}`)
  ];
  for (const file of contentModules) {
    const lines = read(file).split("\n").length - 1;
    assert.ok(lines < 1200, `${file} must stay below 1200 lines; received ${lines}`);
  }
  const notionSendSource = read("content-src/preload/notion-send.js");
  assert.ok(notionSendSource.split("\n").length - 1 < 1000, "Notion send orchestration must stay below 1000 lines");
  assert.match(notionSendSource, /\.\/notion-attachments\.js/);
  const notionAttachmentsSource = read("content-src/preload/notion-attachments.js");
  for (const exportName of [
    "attachmentSnapshot",
    "findNotionAttachmentCardElement",
    "getNotionAttachmentScope",
    "hasNotionAttachmentSnapshotChange",
    "hasNotionUploadInProgress"
  ]) assert.match(notionAttachmentsSource, new RegExp(`\\b${exportName}\\b`));

  const registrationSource = read("background/content-registration.js");
  assert.doesNotMatch(
    registrationSource.match(/export const CONTENT_BRIDGE_FILES[\s\S]*?;/)?.[0] || "",
    /grok-cookie-bridge|message-navigator/,
    "base repair graph must not inject optional capabilities"
  );
  assert.match(registrationSource, /grokCookieMatches = coreMatches\.filter/);
  assert.match(registrationSource, /const specs = contentInjectionPlan\(\{/);
  assert.match(registrationSource, /frameUrls: lockedFrameUrl \? \[lockedFrameUrl\] : \[\]/);
  assert.match(registrationSource, /content-runtime-target-lock/);

  const deleteRuntime = read("app/topic-delete/runtime.js");
  assert.match(deleteRuntime, /if \(!recoverableBeforeDeleteDelivery\(error\)\) throw error/);
  assert.match(deleteRuntime, /features:\s*\["delete"\]/);
  console.log("content capability inventory and fail-closed repair graph: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
