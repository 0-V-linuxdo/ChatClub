#!/usr/bin/env node

const assert = require("node:assert/strict");
const espree = require("espree");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

function relative(absolute) {
  return path.relative(root, absolute).replaceAll(path.sep, "/");
}

function walkAst(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((item) => walkAst(item, visit));
    else if (value && typeof value === "object" && typeof value.type === "string") walkAst(value, visit);
  }
}

function factoryReturnNames(file, factoryName) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const ast = espree.parse(source, { ecmaVersion: "latest", sourceType: "module" });
  let factory = null;
  walkAst(ast, (node) => {
    if (node.type === "FunctionDeclaration" && node.id?.name === factoryName) factory = node;
  });
  assert.ok(factory, `${file} must declare ${factoryName}`);
  let returned = [...factory.body.body].reverse().find((node) => node.type === "ReturnStatement")?.argument;
  if (
    returned?.type === "CallExpression"
    && returned.callee?.type === "MemberExpression"
    && returned.callee.object?.name === "Object"
    && returned.callee.property?.name === "freeze"
  ) returned = returned.arguments[0];
  assert.equal(returned?.type, "ObjectExpression", `${file}#${factoryName} must return an explicit object API`);
  return returned.properties.map((property) => {
    assert.equal(property.type, "Property", `${file}#${factoryName} return API must use explicit properties`);
    assert.equal(property.computed, false, `${file}#${factoryName} return API must use static names`);
    return property.key.type === "Identifier" ? property.key.name : String(property.key.value || "");
  });
}

function appDomain(file) {
  if (file.startsWith("app/state/")) return "core";
  if (new Set([
    "app/main.js",
    "app/runtime.js",
    "app/state.js",
    "app/controller-contract.js",
    "app/controller-port.js",
    "app/frame-request.js"
  ]).has(file)) return "core";
  return file.split("/")[1] || "core";
}

(async () => {
  const { init, parse } = await import("es-module-lexer");
  await init;
  const files = walk(path.join(root, "app"))
    .filter((file) => file.endsWith(".js"))
    .map(relative)
    .sort();
  const graph = new Map();
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    const [imports] = parse(source, file);
    const dependencies = imports
      .map((entry) => entry.n)
      .filter((specifier) => typeof specifier === "string" && specifier.startsWith("."))
      .map((specifier) => path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)));
    graph.set(file, dependencies);
  }

  const reachable = new Set();
  const pending = ["app/main.js"];
  while (pending.length) {
    const file = pending.pop();
    if (reachable.has(file)) continue;
    reachable.add(file);
    for (const dependency of graph.get(file) || []) {
      if (dependency.startsWith("app/")) pending.push(dependency);
    }
  }
  assert.deepEqual(
    files.filter((file) => !reachable.has(file)),
    [],
    "every packaged App module must be reachable from app/main.js, including literal lazy imports"
  );

  const additionalDomainEdges = Object.freeze({
    pocket: new Set(["summary"]),
    settings: new Set(["prompt-library"])
  });
  for (const [owner, dependencies] of graph) {
    const from = appDomain(owner);
    for (const dependency of dependencies.filter((file) => file.startsWith("app/"))) {
      const to = appDomain(dependency);
      if (from === "core" || to === "core" || from === to || additionalDomainEdges[from]?.has(to)) continue;
      assert.fail(`illegal App domain dependency: ${owner} -> ${dependency}`);
    }
  }

  const runtime = fs.readFileSync(path.join(root, "app/runtime.js"), "utf8");
  const summaryController = fs.readFileSync(path.join(root, "app/summary/controller.js"), "utf8");
  const topbarEditor = fs.readFileSync(path.join(root, "app/topbar/editor.js"), "utf8");
  assert.match(runtime, /import \{ createAppState, createFeatureStatePorts \} from "\.\/state\.js"/);
  assert.match(runtime, /const featureState = createFeatureStatePorts\(state\)/);
  for (const statePort of [
    "./composer/state-port.js",
    "./preferred-model/state-port.js",
    "./topbar/state-port.js",
    "./favicon/state-port.js",
    "./workspace/state-port.js",
    "./summary/state-port.js",
    "./pocket/state-port.js",
    "./optimize/state-port.js",
    "./functional-anomalies/state-port.js",
    "./settings/state-ports.js"
  ]) {
    assert.doesNotMatch(runtime, new RegExp(`from ["']${statePort.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`));
  }
  assert.ok(runtime.split(/\r?\n/).length < 2800, "App runtime must remain below the post-extraction consolidation ceiling");
  for (const field of ["sync", "open", "toggleMaximized", "loadPanelSize"]) {
    assert.match(summaryController, new RegExp(`^\\s{4}${field}:`, "m"), `Summary controller must expose ${field}`);
  }
  for (const field of [
    "render", "collect", "collectSource", "ask", "summarize", "summarySourceKey", "summarySourceOrder",
    "summaryPreviewStatus", "summaryPreviewPage", "summarySourceMeta", "summaryContextsFromPreviewItems",
    "pocketEntriesFromSummaryPreview"
  ]) {
    assert.doesNotMatch(summaryController, new RegExp(`^\\s{4}${field}:`, "m"), `Summary controller must not expose internal ${field}`);
  }
  assert.doesNotMatch(summaryController, /compareSummarySourceItems/);
  assert.doesNotMatch(topbarEditor, /function (?:addTopbarEditFlexSpace|removeTopbarEditItem|resetTopbarEditLayout)\(/);
  const internalFactoryReturns = [
    ["app/workspace/layout-controller.js", "createWorkspaceLayoutController", [
      "activeLayoutGroupsForOptions", "activePreset", "currentLayoutGroups", "layoutPresetGroups",
      "normalizeLayoutGroups", "persistentLayoutOptions", "preferredLayoutGroupsForLocale", "temporaryLayoutIsActive"
    ]],
    ["app/composer/controller.js", "createComposerController", ["sendPromptToFrames"]],
    ["app/composer/images.js", "createPromptImageModel", ["normalizeEntry"]],
    ["app/optimize/controller.js", "createOptimizeController", ["openOptimizeCompareDialog"]],
    ["app/pocket/controller.js", "createPocketController", [
      "dedupePocketEntries", "normalizePocketMessage", "pocketEntriesFromMessages"
    ]],
    ["app/prompt-library/controller.js", "createPromptLibraryController", [
      "insertPromptFromLibrary", "openPromptLibraryEditor", "promptLibraryPromptList"
    ]],
    ["app/settings/controller.js", "createSettingsController", ["settingsPane"]],
    ["app/workspace/view-controller.js", "createWorkspaceViewController", ["renderChatFrame", "renderChatTab"]]
  ];
  for (const [file, factory, internalNames] of internalFactoryReturns) {
    const returnedNames = new Set(factoryReturnNames(file, factory));
    for (const name of internalNames) {
      assert.equal(returnedNames.has(name), false, `${file}#${factory} must keep internal ${name} private`);
    }
  }
  const boundaryContracts = {
    "app/frame-bridge/controller.js": {
      owner: "app/runtime.js",
      factory: "createFrameBridgeController"
    },
    "app/preferred-model/controller.js": {
      owner: "app/runtime.js",
      factory: "createPreferredModelController"
    },
    "app/topbar/editor.js": {
      owner: "app/topbar/controller.js",
      factory: "createTopbarEditor"
    }
  };
  for (const [boundary, { owner, factory }] of Object.entries(boundaryContracts)) {
    const importers = [...graph]
      .filter(([, dependencies]) => dependencies.includes(boundary))
      .map(([file]) => file);
    assert.deepEqual(importers, [owner], `${boundary} must have one explicit composition owner`);
    assert.match(
      fs.readFileSync(path.join(root, boundary), "utf8"),
      new RegExp(`export function ${factory}\\(`),
      `${boundary} must expose its controller factory rather than implementation internals`
    );
  }

  console.log(`app architecture domains and reachability: ok (${files.length} reachable modules)`);
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
