#!/usr/bin/env node

const assert = require("node:assert/strict");
const {
  browserMajor,
  chromiumVersionFromUserAgent,
  assertExpectedBrowserMajor,
  chromiumHeadlessLaunch
} = require("./browser-version.cjs");

assert.equal(browserMajor("120.0.6099.109"), "120");
assert.equal(chromiumVersionFromUserAgent(
  "Mozilla/5.0 X11; Linux x86_64 AppleWebKit/537.36 Chrome/120.0.6099.109 Safari/537.36"
), "120.0.6099.109");
assert.equal(chromiumVersionFromUserAgent(
  "Mozilla/5.0 AppleWebKit/537.36 HeadlessChrome/149.0.7827.55 Safari/537.36"
), "149.0.7827.55");
assert.equal(assertExpectedBrowserMajor("chromium", "120.0.6099.109", "120", "EXPECTED_CHROMIUM_MAJOR"), "120");
assert.throws(
  () => assertExpectedBrowserMajor("chromium", "149.0.7827.55", "120", "EXPECTED_CHROMIUM_MAJOR"),
  /chromium: expected major 120, got 149\.0\.7827\.55/
);
assert.throws(
  () => assertExpectedBrowserMajor("chromium", "120.0.6099.109", "", "EXPECTED_CHROMIUM_MAJOR"),
  /EXPECTED_CHROMIUM_MAJOR must be set/
);
assert.deepEqual(chromiumHeadlessLaunch("120"), { headless: false, args: ["--headless=new"] });
assert.deepEqual(chromiumHeadlessLaunch("149"), { headless: true, args: [] });
assert.deepEqual(chromiumHeadlessLaunch("120", true), { headless: false, args: [] });

console.log("browser smoke expected-major enforcement: ok");
