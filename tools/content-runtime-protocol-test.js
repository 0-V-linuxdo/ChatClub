#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const dataModule = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

(async () => {
  const protocol = (await dataModule(read("shared/protocol.js"))).CONTENT_PROTOCOL;
  const startMarker = "  // <chatclub-generated-protocol>\n";
  const endMarker = "  // </chatclub-generated-protocol>\n";
  const declaration = "  const PROTOCOL = Object.freeze(";

  for (const file of [
    "content/preload.js",
    "content/content.js",
    "content/summary-userscripts-main.js"
  ]) {
    const source = read(file);
    assert.ok(source.startsWith(`(() => {\n${startMarker}${declaration}`), `${file} must embed protocol at byte 0`);
    assert.equal(source.split(startMarker).length - 1, 1, `${file} must contain one protocol start marker`);
    assert.equal(source.split(endMarker).length - 1, 1, `${file} must contain one protocol end marker`);
    assert.doesNotMatch(source, /__CHATCLUB_PROTOCOL__|protocol bootstrap is unavailable/);
    const declarationStart = source.indexOf(declaration) + declaration.length;
    const declarationEnd = source.indexOf(`);\n${endMarker}`, declarationStart);
    assert.ok(declarationEnd > declarationStart, `${file} protocol literal boundary is missing`);
    assert.deepEqual(JSON.parse(source.slice(declarationStart, declarationEnd)), protocol, `${file} protocol literal drifted`);
  }

  const background = read("background/service-worker.js");
  assert.doesNotMatch(background, /content\/protocol\.js/);
  assert.match(background, /js: \["content\/preload\.js"\]/);
  assert.match(background, /js: \["content\/summary-userscripts-main\.js"\]/);
  assert.match(background, /js: \["content\/content\.js"\]/);
  assert.match(background, /registerContentScriptsVerified/);
  assert.match(background, /rollbackContentScript\(previous, registration\)/);

  const manifest = JSON.parse(read("manifest.json"));
  const resources = manifest.web_accessible_resources.flatMap((entry) => entry.resources || []);
  assert.ok(!resources.includes("content/protocol.js"));
  for (const file of ["content/preload.js", "content/content.js", "content/summary-userscripts-main.js"]) {
    assert.ok(resources.includes(file), `${file} must remain available to MAIN/dynamic injection`);
  }

  const content = read("content/content.js");
  assert.equal(protocol.CONTENT_BRIDGE_VERSION, "2026.07.15.2");
  assert.match(content, /const CONTENT_BRIDGE_VERSION = PROTOCOL\.CONTENT_BRIDGE_VERSION/);
  const summaryIsolated = read("content/summary-userscripts.js");
  const summaryMain = read("content/summary-userscripts-main.js");
  assert.match(summaryIsolated, new RegExp(`__CHATCLUB_SUMMARY_SCRIPTS_VERSION__ = ${JSON.stringify(protocol.CONTENT_BRIDGE_VERSION)}`));
  assert.match(summaryMain, new RegExp(`__CHATCLUB_SUMMARY_SCRIPTS_VERSION__ = ${JSON.stringify(protocol.CONTENT_BRIDGE_VERSION)}`));
  console.log("self-contained content runtime protocol: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
