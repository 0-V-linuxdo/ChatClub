#!/usr/bin/env node

const assert = require("node:assert/strict");
const {
  FIREFOX_CONTENT_FALLBACK_OUTPUT,
  GENERATED_ARTIFACT_FILES
} = require("./generated-artifacts.cjs");
const { exactFiles, trees, packagePlan, runtimeModuleEntries } = require("./package-plan.cjs");

assert.equal(Object.hasOwn(trees, "content"), false);
assert.equal(Object.hasOwn(trees, "topic-delete-userscripts"), false);
for (const file of GENERATED_ARTIFACT_FILES) assert.ok(exactFiles.includes(file), `exact package inventory is missing ${file}`);

const chromium = packagePlan("chromium");
const firefox = packagePlan("firefox");
for (const plan of [chromium, firefox]) {
  const files = new Set(plan.files);
  for (const runtimeFile of [
    "content/content.js",
    "content/preload.js",
    "content/summary-userscripts.js",
    "content/summary-userscripts-main.js",
    "content/message-navigator.js",
    "content/grok-cookie-bridge.js",
    "userscripts/index.json",
    "userscripts/chatgpt.js",
    "topic-delete-userscripts/chatgpt.user.js",
    "background/content-registration.js",
    "background/frame-injection.js",
    "background/tab-runtime.js",
    "background/trusted-input.js"
  ]) assert.ok(files.has(runtimeFile), `${plan.target} package is missing ${runtimeFile}`);
  for (const buildOnly of [
    "content-src/content.js",
    "tools/generate-artifacts.cjs",
    "shared/topic-delete-userscript-sources.js"
  ]) assert.ok(!files.has(buildOnly), `${plan.target} package contains build-only ${buildOnly}`);
  assert.ok(!plan.files.some((file) => /^(?:dist|output)\//.test(file)));
  assert.equal(
    Object.hasOwn(plan.manifest, "web_accessible_resources"),
    false,
    `${plan.target} package must not expose scripting-only runtime files as web resources`
  );
}

assert.ok(!chromium.files.includes("background/firefox-background.js"));
assert.ok(!chromium.files.includes("background/firefox-content-fallback-loader.js"));
assert.ok(!chromium.files.includes(FIREFOX_CONTENT_FALLBACK_OUTPUT));
assert.deepEqual(runtimeModuleEntries(chromium), ["app/main.js", "background/service-worker.js"]);
assert.equal(chromium.manifest.minimum_chrome_version, "120");
assert.ok(firefox.files.includes("background/firefox-background.js"));
assert.ok(firefox.files.includes("background/firefox-content-fallback-loader.js"));
assert.ok(firefox.files.includes(FIREFOX_CONTENT_FALLBACK_OUTPUT));
assert.deepEqual(runtimeModuleEntries(firefox), ["app/main.js", "background/firefox-background.js"]);
assert.ok(!Object.hasOwn(firefox.manifest, "minimum_chrome_version"));
assert.equal(firefox.manifest.browser_specific_settings.gecko.strict_min_version, "136.0");

console.log("shared package plan: ok");
