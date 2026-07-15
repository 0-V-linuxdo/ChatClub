#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { targetManifest } = require("./manifest-targets.cjs");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

(async () => {
  const manifest = JSON.parse(read("manifest.json"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.type, "module");
  assert.equal(manifest.background.service_worker, "background/service-worker.js");
  assert.deepEqual(manifest.background.scripts, ["background/firefox-background.js"]);
  assert.deepEqual(manifest.background.preferred_environment, ["document", "service_worker"]);
  assert.ok(!manifest.permissions.includes("userScripts"));
  assert.ok(manifest.optional_permissions.includes("userScripts"));
  assert.ok(manifest.permissions.includes("cookies"));

  const firefoxSource = read("background/firefox-background.js");
  assert.match(firefoxSource, /import "\.\/service-worker\.js"/);
  assert.doesNotMatch(firefoxSource, /\bimport\s*\(/);
  const firefoxManifest = targetManifest(manifest, "firefox");
  assert.deepEqual(firefoxManifest.background, {
    scripts: ["background/firefox-background.js"],
    type: "module"
  });
  assert.ok(!firefoxManifest.permissions.includes("debugger"));
  assert.ok(!firefoxManifest.permissions.includes("favicon"));
  assert.ok(!firefoxManifest.permissions.includes("cookies"));
  assert.ok(firefoxManifest.browser_specific_settings.gecko.id);
  const chromiumManifest = targetManifest(manifest, "chromium");
  assert.ok(chromiumManifest.permissions.includes("cookies"));
  assert.deepEqual(chromiumManifest.background, {
    service_worker: "background/service-worker.js",
    type: "module"
  });

  const serviceWorker = read("background/service-worker.js");
  assert.match(serviceWorker, /const chrome = globalThis\.browser \|\| globalThis\.chrome/);
  assert.match(serviceWorker, /currentContentScriptTargetGroups/);
  assert.match(serviceWorker, /matchesForContentTargets/);
  assert.match(serviceWorker, /if \(summaryMatches\.length\)/);
  assert.match(serviceWorker, /if \(messageNavigatorMatches\.length\)/);
  assert.match(serviceWorker, /js: \["content\/preload\.js"\]/);
  assert.match(serviceWorker, /js: \["content\/grok-cookie-bridge\.js"\]/);
  assert.match(serviceWorker, /js: \["content\/summary-userscripts-main\.js"\]/);
  assert.match(serviceWorker, /js: \["content\/content\.js"\]/);
  assert.doesNotMatch(serviceWorker, /content\/protocol\.js/);
  assert.match(serviceWorker, /registerContentScriptsVerified/);
  assert.match(serviceWorker, /rollbackContentScript/);
  assert.doesNotMatch(serviceWorker, /const matches = contentScriptMatches\(await currentContentScriptTargets/);

  const content = read("content/content.js");
  const summaryMain = read("content/summary-userscripts-main.js");
  assert.doesNotMatch(`${content}\n${summaryMain}`, /AsyncFunction|new Function/);
  assert.match(content, /action: "executeSummaryUserscript"/);
  assert.match(content, /event\.source !== window\.parent \|\| event\.origin !== EXTENSION_ORIGIN/);
  assert.doesNotMatch(content, /action: "executeSummaryUserscript",\s*config:/);
  assert.match(serviceWorker, /chrome\.userScripts\.execute/);
  assert.match(serviceWorker, /documentIds: \[documentId\]/);
  assert.match(serviceWorker, /storedCustomSummaryConfig/);
  assert.match(serviceWorker, /entry\?\.error/);
  assert.match(serviceWorker, /JSON\.parse\(serialized\)/);
  assert.match(serviceWorker, /ensureCustomSummaryRuntime/);
  assert.match(serviceWorker, /timeoutPromise\(\s*execution/);
  assert.match(summaryMain, /window\[CUSTOM_SUMMARY_EXECUTOR\]/);
  assert.match(summaryMain, /SUMMARY_RESULT_MAX_TURNS/);

  const extensionApiSource = read("shared/extension-api.js");
  const apiModule = await import(`data:text/javascript;base64,${Buffer.from(extensionApiSource).toString("base64")}`);
  const previousBrowser = globalThis.browser;
  const previousChrome = globalThis.chrome;
  try {
    globalThis.browser = {
      runtime: {
        getURL: (file) => `moz-extension://chatclub/${file}`,
        sendMessage: async (message) => ({ success: true, echo: message })
      },
      tabs: { getCurrent: async () => ({ id: 42 }) },
      permissions: { request: async () => true },
      storage: { local: { get: async (key) => ({ [key]: "ok" }), set: async () => {} } }
    };
    delete globalThis.chrome;
    assert.equal(await apiModule.currentExtensionTabId(), 42);
    assert.equal((await apiModule.runtimeRequest({ action: "ping" })).echo.action, "ping");
    assert.deepEqual(await apiModule.storageLocalGet("probe"), { probe: "ok" });
    assert.equal(await apiModule.permissionsRequest({ permissions: ["userScripts"] }), true);

    delete globalThis.browser;
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage: (message, callback) => callback({ success: true, echo: message })
      },
      tabs: { getCurrent: (callback) => callback({ id: 77 }) },
      permissions: { request: (_permissions, callback) => callback(true) },
      storage: { local: { get: (key, callback) => callback({ [key]: "chrome" }), set: (_value, callback) => callback() } }
    };
    assert.equal(await apiModule.currentExtensionTabId(), 77);
    assert.equal((await apiModule.runtimeRequest({ action: "callback" })).echo.action, "callback");
    assert.deepEqual(await apiModule.storageLocalGet("probe"), { probe: "chrome" });
    assert.equal(await apiModule.permissionsRequest({ permissions: ["userScripts"] }), true);
  } finally {
    if (previousBrowser === undefined) delete globalThis.browser;
    else globalThis.browser = previousBrowser;
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
  }

  console.log("browser runtime and manifest smoke: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
