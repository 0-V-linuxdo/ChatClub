#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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
  const protocolModule = await dataModule(read("shared/protocol.js"));
  const protocol = protocolModule.CONTENT_PROTOCOL;
  const expectedRegistryKey = `__CHATCLUB_RUNTIME_REGISTRY_V${protocolModule.RUNTIME_REGISTRY_ABI_VERSION}__`;
  assert.equal(
    protocolModule.RUNTIME_REGISTRY_KEY,
    expectedRegistryKey,
    "runtime registry key must be derived from its ABI version"
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
      expectedRegistryKey,
      `${file} bundled runtime registry key must match its ABI`
    );
  }

  const background = [
    "background/service-worker.js",
    "background/runtime.js",
    "background/content-registration.js",
    "background/frame-injection.js"
  ].map(read).join("\n");
  assert.doesNotMatch(background, /content\/protocol\.js/);
  assert.match(background, /js: \["content\/preload\.js"\]/);
  assert.match(background, /js: \["content\/summary-userscripts-main\.js"\]/);
  assert.match(background, /js: \["content\/content\.js"\]/);
  assert.match(background, /registerContentScriptsVerified/);
  assert.match(background, /rollbackContentScript\(previous, registration\)/);

  assert.equal(fs.existsSync(path.join(root, "content/protocol.js")), false, "obsolete protocol bootstrap must be removed");
  const manifest = JSON.parse(read("manifest.json"));
  assert.equal(
    Object.hasOwn(manifest, "web_accessible_resources"),
    false,
    "scripting API files must not be exposed to arbitrary web origins"
  );
  for (const file of [
    "content/preload.js",
    "content/grok-cookie-bridge.js",
    "content/message-navigator.js",
    "content/content.js",
    "content/summary-userscripts-main.js",
    "content/summary-userscripts.js"
  ]) {
    assert.ok(background.includes(`\"${file}\"`), `${file} must be injected through chrome.scripting`);
  }
  assert.match(background, /executeVerifiedPackagedFrameFile/);

  const contentSource = read("content-src/content.js");
  const preloadSource = read("content-src/preload.js");
  const summaryMainSource = read("content-src/summary-userscripts-main.js");
  assert.match(contentSource, /from "\.\.\/shared\/protocol\.js"/);
  assert.match(preloadSource, /from "\.\.\/shared\/protocol\.js"/);
  assert.match(summaryMainSource, /from "\.\.\/shared\/protocol\.js"/);

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
