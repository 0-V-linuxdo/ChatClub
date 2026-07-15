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

function workflowJob(id) {
  const lines = workflow.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `  ${id}:`);
  assert.notEqual(start, -1, `CI workflow is missing the ${id} job`);
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^  [a-zA-Z0-9_-]+:\s*$/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

function inlineNeeds(job) {
  const match = job.match(/^\s+needs:\s*\[([^\]]+)\]\s*$/m);
  assert.ok(match, "package job must declare its complete dependency gate as an inline needs list");
  return match[1].split(",").map((dependency) => dependency.trim()).sort();
}

const chromiumJob = workflowJob("browser-smoke-chromium");
const firefox136Job = workflowJob("browser-smoke-firefox-136");
const firefoxNightlyJob = workflowJob("browser-smoke-firefox-nightly");
const packageJob = workflowJob("package");

assert.match(currentMajor, /^\d+$/);
assert.match(
  chromiumJob,
  new RegExp(`Current Playwright Chromium[\\s\\S]*?EXPECTED_CHROMIUM_MAJOR: ["']${currentMajor}["']`),
  "CI current-browser assertion must track the exact Playwright Chromium pin"
);
assert.match(chromiumJob, /name: Browser smoke \/ Chromium/);
assert.match(chromiumJob, /needs: static/);
assert.match(chromiumJob, /CHROME_VERSION: ["']120\.0\.6099\.109["']/);
assert.match(chromiumJob, /CHROME_SHA256: ["']bcb22c5242aabf184c6fadd86ee58b3ae35739177edac9de3938ed33791d4ddf["']/);
assert.match(chromiumJob, /Chrome 120 minimum-version extension smoke[\s\S]*?EXPECTED_CHROMIUM_MAJOR: ["']120["']/);
assert.match(chromiumJob, /sha256sum --check --strict/);
assert.doesNotMatch(chromiumJob, /smoke:firefox|Firefox 136|Firefox Nightly/);

assert.match(firefox136Job, /name: Browser smoke \/ Firefox 136/);
assert.match(firefox136Job, /needs: static/);
assert.match(firefox136Job, /archive\.mozilla\.org\/pub\/firefox\/releases\/136\.0\/linux-x86_64\/en-US\/firefox-136\.0\.tar\.xz/);
assert.match(firefox136Job, /Firefox 136 temporary-install smoke[\s\S]*?EXPECTED_FIREFOX_MAJOR: ["']136["'][\s\S]*?npm run smoke:firefox/);
assert.doesNotMatch(firefox136Job, /firefox-nightly|latest Firefox Nightly/);

assert.match(firefoxNightlyJob, /name: Browser smoke \/ Firefox Nightly/);
assert.match(firefoxNightlyJob, /needs: static/);
assert.match(firefoxNightlyJob, /download\.mozilla\.org\/\?product=firefox-nightly-latest-ssl&os=linux64&lang=en-US/);
assert.match(firefoxNightlyJob, /Latest Firefox Nightly temporary-install smoke[\s\S]*?npm run smoke:firefox/);
assert.doesNotMatch(firefoxNightlyJob, /EXPECTED_FIREFOX_MAJOR|firefox-136/);

assert.doesNotMatch(workflow, /^  browser-smoke:\s*$/m);
assert.deepEqual(
  inlineNeeds(packageJob),
  ["static", "browser-smoke-chromium", "browser-smoke-firefox-136", "browser-smoke-firefox-nightly"].sort(),
  "packaging must wait for every independently reported browser baseline"
);
assert.match(smoke, /normalizedExpectedMajor\(process\.env\.EXPECTED_CHROMIUM_MAJOR/);
assert.match(smoke, /assertExpectedBrowserMajor\([\s\S]*?"chromium"/);
assert.match(smoke, /startLoopbackFixture/);
assert.match(smoke, /action: "ensureContentBridge"[\s\S]*?features: \["summary"\]/);
assert.match(smoke, /message\?\.source !== protocol\.EXTENSION_RUNTIME_RELAY_SOURCE/);
assert.match(smoke, /message\.action !== "frameBinding"/);
assert.match(smoke, /runtime\.getFrameId\(iframe\.contentWindow\)/);
assert.match(smoke, /expectedFrameId/);
assert.match(smoke, /expectedBindingId/);
assert.match(smoke, /bindingRelayed !== true/);
assert.match(smoke, /expectedFrameId == null[\s\S]*?contentWindow\?\.postMessage/);
assert.match(smoke, /command\("getLocationHref"\)/);
assert.match(smoke, /command\("getSummaryRuntimeState"\)/);
assert.match(smoke, /summaryState\?\.isolatedReady === true/);
assert.match(smoke, /summaryState\?\.mainReady === true/);
assert.match(smoke, /expectFirefoxFileFallback: browserVersion\.split/);
assert.match(smoke, /loopback bridge injection failed before frame binding/);
assert.match(smoke, /fallbackFiles/);

console.log("verified independent browser baseline jobs, package gates, and real loopback content handshake: ok");
