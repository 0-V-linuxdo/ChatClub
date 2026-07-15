#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const workflow = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
const smoke = fs.readFileSync(path.join(root, "tools/browser-smoke.mjs"), "utf8");
const browsers = JSON.parse(fs.readFileSync(path.join(root, "node_modules/playwright-core/browsers.json"), "utf8"));
const playwrightChromium = browsers.browsers.find((browser) => browser.name === "chromium");
const currentMajor = String(playwrightChromium?.browserVersion || "").split(".", 1)[0];

assert.match(currentMajor, /^\d+$/);
assert.match(
  workflow,
  new RegExp(`Current Playwright Chromium[\\s\\S]*?EXPECTED_CHROMIUM_MAJOR: ["']${currentMajor}["']`),
  "CI current-browser assertion must track the exact Playwright Chromium pin"
);
assert.match(workflow, /CHROME_VERSION: ["']120\.0\.6099\.109["']/);
assert.match(workflow, /CHROME_SHA256: ["']bcb22c5242aabf184c6fadd86ee58b3ae35739177edac9de3938ed33791d4ddf["']/);
assert.match(workflow, /Chrome 120 minimum-version extension smoke[\s\S]*?EXPECTED_CHROMIUM_MAJOR: ["']120["']/);
assert.match(workflow, /sha256sum --check --strict/);
assert.match(smoke, /normalizedExpectedMajor\(process\.env\.EXPECTED_CHROMIUM_MAJOR/);
assert.match(smoke, /assertExpectedBrowserMajor\([\s\S]*?"chromium"/);
assert.match(smoke, /startLoopbackFixture/);
assert.match(smoke, /action: "ensureContentBridge"[\s\S]*?features: \["summary"\]/);
assert.match(smoke, /message\.action !== "contentReady"/);
assert.match(smoke, /command\("getLocationHref"\)/);
assert.match(smoke, /command\("getSummaryRuntimeState"\)/);
assert.match(smoke, /summaryState\?\.isolatedReady === true/);
assert.match(smoke, /summaryState\?\.mainReady === true/);

console.log("verified Chrome baselines and real loopback content handshake: ok");
