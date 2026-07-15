#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { materializePackagePlan, packagePlan, root } = require("./package-plan.cjs");
const target = process.argv[2];
const allowSkip = process.env.CHATCLUB_SMOKE_ALLOW_SKIP === "1";
const registrationIds = [
  "chatclub-preload",
  "chatclub-grok-cookie-bridge",
  "chatclub-summary-userscripts-main",
  "chatclub-summary-userscripts",
  "chatclub-message-navigator",
  "chatclub-content"
];

function diagnostic(message) {
  if (allowSkip) {
    console.warn(`Browser smoke skipped: ${message}`);
    process.exit(0);
  }
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertRuntimeResult(result, browserTarget) {
  assert(result?.shell === true, `${browserTarget}: app shell did not render`);
  assert(result?.fatalPre === false, `${browserTarget}: fatal <pre> rendered during bootstrap`);
  assert(result?.configInfo?.ok === true, `${browserTarget}: getConfigInfo round trip failed: ${result?.configInfo?.error || "unknown"}`);
  const registrations = result.configInfo.value?.contentScripts || [];
  const byId = new Map(registrations.map((entry) => [entry.id, entry]));
  for (const id of registrationIds) assert(byId.has(id), `${browserTarget}: dynamic content registration missing: ${id}`);
  for (const id of ["chatclub-preload", "chatclub-summary-userscripts-main"]) {
    assert(byId.get(id)?.world === "MAIN", `${browserTarget}: ${id} is not registered in MAIN world`);
  }
  assert(result.lazy?.every((entry) => entry.ok), `${browserTarget}: lazy module import failed: ${JSON.stringify(result.lazy)}`);
  const trustedError = String(result.trusted?.error || result.trusted?.value?.error || "");
  if (browserTarget === "chromium") {
    assert(/invalid viewport coordinates/i.test(trustedError), `chromium: trusted-input helper did not reject negative coordinates: ${trustedError}`);
  } else {
    assert(/unavailable|manually|manual|不支持|手动/i.test(trustedError), `firefox: trusted input did not return the manual-completion fallback: ${trustedError}`);
  }
}

const pageProbe = `async () => {
  const request = async (message) => {
    try {
      const value = await (globalThis.browser || globalThis.chrome).runtime.sendMessage(message);
      return { ok: true, value };
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : String(error) };
    }
  };
  const lazyFiles = ["app/settings/controller.js", "app/summary/controller.js", "app/pocket/controller.js"];
  const lazy = await Promise.all(lazyFiles.map(async (file) => {
    try {
      await import((globalThis.browser || globalThis.chrome).runtime.getURL(file));
      return { file, ok: true };
    } catch (error) {
      return { file, ok: false, error: error && error.message ? error.message : String(error) };
    }
  }));
  return {
    shell: Boolean(document.querySelector("#app .app-shell")),
    fatalPre: Boolean(document.querySelector("#app > pre")),
    configInfo: await request({ source: "chatclub", action: "getConfigInfo" }),
    lazy,
    trusted: await request({
      source: "chatclub",
      action: "dispatchTrustedClick",
      x: -1,
      y: -1,
      reason: "browser smoke must reject before debugger attachment"
    })
  };
}`;

async function chromiumSmoke(extensionDirectory, temporaryRoot) {
  let playwright;
  try {
    playwright = await import("playwright");
  } catch (error) {
    diagnostic(`playwright@1.61.1 is unavailable (${error.message}); run npm ci`);
  }
  const executablePath = process.env.CHROMIUM_BINARY || playwright.chromium.executablePath();
  if (!fs.statSync(executablePath, { throwIfNoEntry: false })?.isFile()) {
    diagnostic(`Playwright Chromium is not installed at ${executablePath}; run npx playwright install chromium`);
  }
  const profile = path.join(temporaryRoot, "chromium-profile");
  let context;
  try {
    context = await playwright.chromium.launchPersistentContext(profile, {
      executablePath,
      headless: process.env.CHATCLUB_SMOKE_HEADFUL !== "1",
      args: [
        `--disable-extensions-except=${extensionDirectory}`,
        `--load-extension=${extensionDirectory}`,
        "--no-first-run",
        "--no-default-browser-check"
      ]
    });
    let workers = context.serviceWorkers();
    if (!workers.length) {
      const worker = await context.waitForEvent("serviceworker", { timeout: 20000 });
      workers = [worker];
    }
    const serviceWorker = workers.find((worker) => worker.url().endsWith("/background/service-worker.js")) || workers[0];
    assert(serviceWorker?.url().startsWith("chrome-extension://"), "chromium: module Service Worker did not start");
    const extensionId = new URL(serviceWorker.url()).host;
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`chrome-extension://${extensionId}/chatClub.html`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.locator("#app .app-shell").waitFor({ state: "attached", timeout: 25000 });
    const result = await page.evaluate(`(${pageProbe})()`);
    if (pageErrors.length) result.pageErrors = pageErrors;
    assertRuntimeResult(result, "chromium");
    assert(!pageErrors.length, `chromium: uncaught page error(s): ${pageErrors.join(" | ")}`);
    console.log(`Chromium browser smoke passed (${await page.evaluate(() => navigator.userAgent)}).`);
  } finally {
    await context?.close().catch(() => {});
  }
}

function executableOnPath(name) {
  const result = spawnSync("which", [name], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

function firefoxBinary() {
  const candidates = [
    process.env.FIREFOX_BINARY,
    executableOnPath("firefox"),
    executableOnPath("firefox-nightly"),
    "/Applications/Firefox Nightly.app/Contents/MacOS/firefox",
    "/Applications/Firefox.app/Contents/MacOS/firefox"
  ].filter(Boolean);
  return candidates.find((candidate) => fs.statSync(candidate, { throwIfNoEntry: false })?.isFile()) || "";
}

async function firefoxSmoke(extensionDirectory) {
  let selenium;
  let firefox;
  try {
    selenium = await import("selenium-webdriver");
    firefox = await import("selenium-webdriver/firefox.js");
  } catch (error) {
    diagnostic(`selenium-webdriver@4.46.0 is unavailable (${error.message}); run npm ci`);
  }
  const binary = firefoxBinary();
  if (!binary) diagnostic("Firefox binary not found; set FIREFOX_BINARY to Firefox 136 or Firefox Nightly");
  const options = new firefox.Options().setBinary(binary);
  options.addArguments("-remote-allow-system-access");
  if (process.env.CHATCLUB_SMOKE_HEADFUL !== "1") options.addArguments("-headless");
  let driver;
  try {
    const builder = new selenium.Builder().forBrowser("firefox").setFirefoxOptions(options);
    if (process.env.GECKODRIVER_BINARY) {
      builder.setFirefoxService(new firefox.ServiceBuilder(process.env.GECKODRIVER_BINARY));
    }
    driver = await builder.build();
  } catch (error) {
    diagnostic(`Firefox WebDriver could not start (${error.message}); install geckodriver or set GECKODRIVER_BINARY`);
  }
  try {
    const capabilities = await driver.getCapabilities();
    const browserVersion = String(capabilities.get("browserVersion") || capabilities.get("version") || "");
    const expectedMajor = String(process.env.EXPECTED_FIREFOX_MAJOR || "");
    if (expectedMajor) {
      assert(browserVersion.split(".")[0] === expectedMajor, `firefox: expected major ${expectedMajor}, got ${browserVersion}`);
    }
    const addonId = await driver.installAddon(extensionDirectory, true);
    assert(addonId === "chatclub@chatclub.local", `firefox: unexpected temporary add-on id ${addonId}`);
    await driver.setContext(firefox.Context.CHROME);
    const extensionUrl = await driver.executeScript(
      "const policy = WebExtensionPolicy.getByID(arguments[0]); return policy && policy.getURL(arguments[1]);",
      addonId,
      "chatClub.html"
    );
    assert(/^moz-extension:\/\//.test(extensionUrl), "firefox: could not resolve the temporary extension URL");
    await driver.setContext(firefox.Context.CONTENT);
    await driver.get(extensionUrl);
    await driver.wait(async () => driver.findElements(selenium.By.css("#app .app-shell")).then((items) => items.length > 0), 25000);
    const result = await driver.executeAsyncScript(`
      const done = arguments[arguments.length - 1];
      (${pageProbe})().then(done, (error) => done({ probeError: error && error.message ? error.message : String(error) }));
    `);
    assert(!result?.probeError, `firefox: page probe failed: ${result?.probeError}`);
    assertRuntimeResult(result, "firefox");
    console.log(`Firefox browser smoke passed (${browserVersion}).`);
  } finally {
    await driver?.quit().catch(() => {});
  }
}

if (!new Set(["chromium", "firefox"]).has(target)) {
  console.error("Usage: node tools/browser-smoke.mjs <chromium|firefox>");
  process.exit(2);
}

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), `chatclub-${target}-smoke-`));
const extensionDirectory = path.join(temporaryRoot, "extension");
try {
  materializePackagePlan(packagePlan(target), extensionDirectory);
  if (target === "chromium") await chromiumSmoke(extensionDirectory, temporaryRoot);
  else await firefoxSmoke(extensionDirectory);
} catch (error) {
  console.error(error?.stack || error);
  process.exitCode = 1;
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
