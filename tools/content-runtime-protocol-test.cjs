#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const dataModule = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

function bundledLiteral(source, name) {
  const match = source.match(new RegExp(`\\bvar\\s+${name}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*")\\s*;`));
  assert.ok(match, `${name} must be bundled from shared/protocol.js`);
  return JSON.parse(match[1]);
}

(async () => {
  const protocol = (await dataModule(read("shared/protocol.js"))).CONTENT_PROTOCOL;
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
  }

  const background = `${read("background/service-worker.js")}\n${read("background/runtime.js")}`;
  assert.doesNotMatch(background, /content\/protocol\.js/);
  assert.match(background, /js: \["content\/preload\.js"\]/);
  assert.match(background, /js: \["content\/summary-userscripts-main\.js"\]/);
  assert.match(background, /js: \["content\/content\.js"\]/);
  assert.match(background, /registerContentScriptsVerified/);
  assert.match(background, /rollbackContentScript\(previous, registration\)/);

  assert.equal(fs.existsSync(path.join(root, "content/protocol.js")), false, "obsolete protocol bootstrap must be removed");
  const manifest = JSON.parse(read("manifest.json"));
  const resources = manifest.web_accessible_resources.flatMap((entry) => entry.resources || []);
  assert.ok(!resources.includes("content/protocol.js"));
  for (const file of selfContainedRuntimes) {
    assert.ok(resources.includes(file), `${file} must remain available to MAIN/dynamic injection`);
  }

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
