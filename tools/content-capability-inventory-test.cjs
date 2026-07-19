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
  assert.deepEqual(
    Object.values(commands.CONTENT_BUNDLES).map(({ file }) => file).sort(),
    Object.keys(CONTENT_ENTRIES).sort(),
    "the canonical runtime bundle inventory must cover every generated content output exactly once"
  );
  assert.equal(
    new Set(Object.values(commands.CONTENT_BUNDLES).map(({ id }) => id)).size,
    Object.keys(commands.CONTENT_BUNDLES).length,
    "content registration ids must be unique"
  );
  for (const [name, bundle] of Object.entries(commands.CONTENT_BUNDLES)) {
    assert.ok(CONTENT_ENTRIES[bundle.file], `${name} references undeclared bundle ${bundle.file}`);
    assert.ok(["MAIN", "ISOLATED"].includes(bundle.world));
  }
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

  const featureBundles = {
    send: [commands.CONTENT_BUNDLES.send],
    summary: [
      commands.CONTENT_BUNDLES.summaryMain,
      commands.CONTENT_BUNDLES.summaryIsolated,
      commands.CONTENT_BUNDLES.summaryBridge
    ],
    "preferred-model": [commands.CONTENT_BUNDLES.preferredModel],
    delete: [commands.CONTENT_BUNDLES.delete],
    "message-navigator": [commands.CONTENT_BUNDLES.messageNavigator]
  };
  const baseFiles = [commands.CONTENT_BUNDLES.preload.file, commands.CONTENT_BUNDLES.content.file];
  for (const [capability, bundles] of Object.entries(featureBundles)) {
    assert.deepEqual(
      filesFor({ features: [capability] }),
      [...baseFiles, ...bundles.map(({ file }) => file)],
      `${capability} must resolve through the public injection-plan contract`
    );
  }

  const commandCapabilities = new Set(["base"]);
  for (const [command, spec] of Object.entries(commands.FRAME_COMMAND_SPECS)) {
    const capability = String(spec.capability || spec.features?.[0] || "base");
    assert.ok(capability === "base" || Object.hasOwn(featureBundles, capability), `${command} has unknown capability ${capability}`);
    commandCapabilities.add(capability);
    if (capability !== "base") assert.deepEqual(spec.features, [capability]);
  }
  assert.deepEqual([...commandCapabilities].sort(), ["base", ...Object.keys(featureBundles)].sort());

  const featureEntries = Object.fromEntries(Object.entries({
    send: commands.CONTENT_BUNDLES.send,
    summary: commands.CONTENT_BUNDLES.summaryBridge,
    "preferred-model": commands.CONTENT_BUNDLES.preferredModel,
    delete: commands.CONTENT_BUNDLES.delete,
    "message-navigator": commands.CONTENT_BUNDLES.messageNavigator
  }).map(([capability, bundle]) => [capability, CONTENT_ENTRIES[bundle.file]]));
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

  const registrationPlanSource = read("background/content-script-registration.js");
  const registrationSource = read("background/content-registration.js");
  assert.doesNotMatch(registrationSource, /CONTENT_BRIDGE_FILES|CONTENT_CAPABILITY_FILES|SUMMARY_BRIDGE_FILES/);
  assert.match(registrationPlanSource, /grokCookieMatches = coreMatches\.filter/);
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
