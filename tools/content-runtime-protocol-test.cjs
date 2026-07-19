#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const dataModule = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

function bundledLiteral(source, name) {
  const protocolStart = source.indexOf("// shared/protocol.js");
  const protocolEnd = source.indexOf("var CONTENT_PROTOCOL", protocolStart);
  assert.ok(protocolStart >= 0 && protocolEnd > protocolStart, "bundled shared protocol section must exist");
  const context = vm.createContext({});
  const declarations = source.slice(protocolStart, protocolEnd)
    .matchAll(/^\s*var\s+([A-Z][A-Z0-9_]*)\s*=\s*(.+);\s*$/gm);
  let found = false;
  for (const declaration of declarations) {
    const [, declarationName, expression] = declaration;
    vm.runInContext(`globalThis[${JSON.stringify(declarationName)}] = (${expression});`, context);
    if (declarationName === name) found = true;
  }
  assert.ok(found, `${name} must be bundled from shared/protocol.js`);
  return context[name];
}

(async () => {
  const [protocolModule, runtimeVersionModule, frameCommands, registrationModule] = await Promise.all([
    dataModule(read("shared/protocol.js")),
    dataModule(read("shared/content-runtime-version.generated.js")),
    import(`${pathToFileURL(path.join(root, "shared/frame-commands.js")).href}?test=${Date.now()}`),
    import(`${pathToFileURL(path.join(root, "background/content-script-registration.js")).href}?test=${Date.now()}`)
  ]);
  const protocol = protocolModule.CONTENT_PROTOCOL;
  const expectedRegistryBaseKey = `__CHATCLUB_RUNTIME_REGISTRY_V${protocolModule.RUNTIME_REGISTRY_ABI_VERSION}__`;
  assert.equal(
    protocolModule.RUNTIME_REGISTRY_KEY,
    expectedRegistryBaseKey,
    "runtime registry key must be derived from its ABI version"
  );
  assert.equal(
    runtimeVersionModule.CONTENT_RUNTIME_REGISTRY_KEY,
    protocolModule.RUNTIME_REGISTRY_KEY,
    "generated runtime identity must alias the stable protocol broker key"
  );
  const selfContainedRuntimes = [
    "content/preload.js",
    "content/content.js",
    "content/summary-userscripts-main.js"
  ];

  for (const file of selfContainedRuntimes) {
    const source = read(file);
    assert.ok(source.startsWith("(() => {\n"), `${file} must be an IIFE`);
    assert.match(source, /\/\/ shared\/protocol\.js/);
    assert.doesNotMatch(source, /chatclub-generated-protocol|__CHATCLUB_PROTOCOL__|protocol bootstrap is unavailable/);
    assert.doesNotThrow(() => new vm.Script(source, { filename: file }), `${file} must parse with classic-script grammar`);
    for (const [name, value] of Object.entries(protocol)) {
      assert.equal(bundledLiteral(source, name), value, `${file} bundled ${name} drifted`);
    }
    assert.equal(
      bundledLiteral(source, "RUNTIME_REGISTRY_ABI_VERSION"),
      protocolModule.RUNTIME_REGISTRY_ABI_VERSION,
      `${file} bundled runtime registry ABI drifted`
    );
    assert.equal(
      bundledLiteral(source, "RUNTIME_REGISTRY_KEY"),
      runtimeVersionModule.CONTENT_RUNTIME_REGISTRY_KEY,
      `${file} bundled stable broker key must match the generated package identity`
    );
  }

  const background = [
    "background/service-worker.js",
    "background/runtime.js",
    "background/custom-userscript-runtime.js",
    "background/content-script-registration.js",
    "background/content-registration.js",
    "background/frame-injection.js"
  ].map(read).join("\n");
  assert.doesNotMatch(background, /content\/protocol\.js/);
  const registrationTarget = { id: "protocol-test", hosts: ["grok.com"] };
  const registrations = registrationModule.buildContentScriptRegistrations({
    coreTargets: [registrationTarget],
    preloadTargets: [registrationTarget],
    summaryTargets: [registrationTarget],
    sendTargets: [registrationTarget],
    preferredModelTargets: [registrationTarget],
    deleteTargets: [registrationTarget],
    messageNavigatorTargets: [registrationTarget]
  });
  const registrationsById = new Map(registrations.map((registration) => [registration.id, registration]));
  assert.equal(registrations.length, Object.keys(frameCommands.CONTENT_BUNDLES).length);
  assert.equal(registrationsById.size, registrations.length, "canonical content registration ids must be unique");
  for (const bundle of Object.values(frameCommands.CONTENT_BUNDLES)) {
    const registration = registrationsById.get(bundle.id);
    assert.ok(registration, `${bundle.id} must be registered from the canonical content bundle inventory`);
    assert.deepEqual(registration.js, [bundle.file]);
    assert.equal(registration.world || "ISOLATED", bundle.world);
  }
  assert.match(background, /registerContentScriptsVerified/);
  assert.match(background, /rollbackContentScript\(previous, registration\)/);

  assert.equal(fs.existsSync(path.join(root, "content/protocol.js")), false, "obsolete protocol bootstrap must be removed");
  const manifest = JSON.parse(read("manifest.json"));
  assert.equal(
    Object.hasOwn(manifest, "web_accessible_resources"),
    false,
    "scripting API files must not be exposed to arbitrary web origins"
  );
  assert.match(background, /executeVerifiedPackagedFrameFile/);

  const contentSource = read("content-src/content.js");
  const preloadSource = read("content-src/preload.js");
  const summaryMainSource = read("content-src/summary-userscripts-main.js");
  const summaryCapabilitySource = read("content-src/capabilities/summary-runtime.js");
  const summarySharedSource = read("content-src/shared/summary-runtime.js");
  assert.match(contentSource, /from "\.\.\/shared\/protocol\.js"/);
  assert.match(preloadSource, /from "\.\.\/shared\/protocol\.js"/);
  assert.match(summaryMainSource, /from "\.\.\/shared\/protocol\.js"/);
  assert.doesNotMatch(summaryCapabilitySource, /\b(?:hasUserAndAssistant|runner):/);
  assert.doesNotMatch(summaryCapabilitySource, /\.\.\.customResult/);
  assert.doesNotMatch(summaryMainSource, /\bhasUserAndAssistant:/);
  assert.doesNotMatch(summaryMainSource, /^\s+registryVersion,\s*$/m);
  assert.doesNotMatch(summaryMainSource, /\b(?:ok|error):/);
  assert.doesNotMatch(summaryMainSource, /messages:\s*data\?\.messages/);
  assert.doesNotMatch(summarySharedSource, /\b(?:ok|missing|timeout|error|hasUserAndAssistant):/);
  assert.doesNotMatch(summarySharedSource, /message\.messages/);
  const summaryControllerSource = read("app/summary/controller.js");
  assert.doesNotMatch(summaryControllerSource, /result\?\.(?:href|title|logoUrl)/);
  assert.doesNotMatch(summaryControllerSource, /result\?\.messages\s*\|\|\s*result/);

  const summaryIsolated = read("content/summary-userscripts.js");
  const summaryMain = read("content/summary-userscripts-main.js");
  assert.match(summaryIsolated, /register\("summary-runners"/);
  assert.match(summaryMain, /register\("summary-runners"/);
  assert.match(summaryMain, /register\("summary-page"/);
  assert.doesNotMatch(`${summaryIsolated}\n${summaryMain}`, /__CHATCLUB_SUMMARY_SCRIPTS__/);
  assert.match(read("content-src/shared/runtime-registry.js"), /register\(name, descriptor = \{\}\)/);
  assert.match(read("content-src/shared/runtime-registry.js"), /require\(name, version\)/);
  console.log("self-contained bundled content protocol: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
