#!/usr/bin/env node

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { CONTENT_BRIDGE_VERSION } from "../shared/protocol.js";

const require = createRequire(import.meta.url);
const { materializePackagePlan, packagePlan, root } = require("./package-plan.cjs");
const {
  normalizedExpectedMajor,
  chromiumVersionFromUserAgent,
  assertExpectedBrowserMajor,
  chromiumHeadlessLaunch
} = require("./browser-version.cjs");
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
  const loopback = result?.loopback;
  assert(loopback?.ready?.bridgeVersion === CONTENT_BRIDGE_VERSION, `${browserTarget}: loopback contentReady bridge version mismatch`);
  assert(loopback?.ready?.documentId, `${browserTarget}: loopback contentReady did not include a document id`);
  assert(loopback?.locationHref === loopback?.fixtureUrl, `${browserTarget}: loopback getLocationHref round trip failed`);
  assert(loopback?.summaryState?.ready === true, `${browserTarget}: loopback Summary runtime did not become ready`);
  assert(loopback?.summaryState?.isolatedReady === true, `${browserTarget}: loopback ISOLATED runtime was not injected`);
  assert(loopback?.summaryState?.mainReady === true, `${browserTarget}: loopback MAIN runtime was not injected`);
  assert(loopback?.summaryState?.bridgeVersion === CONTENT_BRIDGE_VERSION, `${browserTarget}: loopback runtime bridge version mismatch`);
  const injectedFiles = loopback?.injection?.injectedFiles || [];
  for (const file of [
    "content/preload.js",
    "content/summary-userscripts-main.js",
    "content/summary-userscripts.js",
    "content/content.js"
  ]) {
    assert(injectedFiles.some((entry) => String(entry).startsWith(`${file}@`)), `${browserTarget}: loopback injection missing ${file}`);
  }
  assert(!(loopback?.injection?.errors || []).length, `${browserTarget}: loopback injection error(s): ${(loopback?.injection?.errors || []).join(" | ")}`);
}

const pageProbe = `async (fixtureUrl) => {
  const request = async (message) => {
    try {
      const value = await (globalThis.browser || globalThis.chrome).runtime.sendMessage(message);
      return { ok: true, value };
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : String(error) };
    }
  };
  const withTimeout = (promise, timeoutMs, label) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label + " timed out")), timeoutMs);
    Promise.resolve(promise).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
  const loopbackContentHandshake = async () => {
    const api = globalThis.browser || globalThis.chrome;
    const currentTab = await api.tabs.getCurrent();
    if (!Number.isInteger(currentTab && currentTab.id)) throw new Error("loopback fixture could not resolve the extension tab");
    const iframe = document.createElement("iframe");
    iframe.id = "chatclub-browser-smoke-loopback";
    iframe.hidden = true;
    let readyResolve;
    let readyReject;
    let readyTimer;
    const readyPromise = new Promise((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
      readyTimer = setTimeout(() => reject(new Error("loopback contentReady timed out")), 12000);
    });
    readyPromise.catch(() => {});
    const onMessage = (event) => {
      const message = event.data;
      if (event.source !== iframe.contentWindow || message?.source !== "chatclub" || message.type !== "request" || message.action !== "contentReady") return;
      clearTimeout(readyTimer);
      readyResolve(message);
    };
    window.addEventListener("message", onMessage);
    try {
      const loaded = new Promise((resolve, reject) => {
        iframe.addEventListener("load", resolve, { once: true });
        iframe.addEventListener("error", () => reject(new Error("loopback iframe failed to load")), { once: true });
      });
      iframe.src = fixtureUrl;
      document.body.append(iframe);
      await withTimeout(loaded, 10000, "loopback iframe load");
      const injection = await withTimeout(api.runtime.sendMessage({
        source: "chatclub",
        action: "ensureContentBridge",
        tabId: currentTab.id,
        hrefs: [fixtureUrl],
        features: ["summary"]
      }), 15000, "loopback bridge injection");
      if (!injection?.success) throw new Error(injection?.error || "loopback bridge injection failed");
      const ready = await readyPromise;
      const command = async (name) => {
        const response = await withTimeout(api.runtime.sendMessage({
          source: "chatclub",
          action: "sendFrameCommand",
          appTabId: currentTab.id,
          bridgeDocumentId: ready.data?.documentId,
          command: name,
          data: {},
          timeoutMs: 5000
        }), 8000, "loopback " + name);
        if (!response?.success) throw new Error(response?.error || ("loopback " + name + " failed"));
        return response.data;
      };
      return {
        fixtureUrl,
        injection,
        ready: ready.data || {},
        locationHref: await command("getLocationHref"),
        summaryState: await command("getSummaryRuntimeState")
      };
    } catch (error) {
      clearTimeout(readyTimer);
      readyReject(error);
      readyPromise.catch(() => {});
      throw error;
    } finally {
      clearTimeout(readyTimer);
      window.removeEventListener("message", onMessage);
      iframe.remove();
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
    loopback: await loopbackContentHandshake(),
    trusted: await request({
      source: "chatclub",
      action: "dispatchTrustedClick",
      x: -1,
      y: -1,
      reason: "browser smoke must reject before debugger attachment"
    })
  };
}`;

async function startLoopbackFixture() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (url.pathname !== "/chatclub-frame-fixture") {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    response.end("<!doctype html><html><head><meta charset=\"utf-8\"><title>ChatClub frame fixture</title></head><body><main id=\"fixture\">loopback frame ready</main></body></html>");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Loopback fixture did not receive a TCP port");
  return {
    url: `http://127.0.0.1:${address.port}/chatclub-frame-fixture`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

async function chromiumSmoke(extensionDirectory, temporaryRoot, fixtureUrl) {
  const expectedMajor = normalizedExpectedMajor(process.env.EXPECTED_CHROMIUM_MAJOR, "EXPECTED_CHROMIUM_MAJOR");
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
  const launchMode = chromiumHeadlessLaunch(expectedMajor, process.env.CHATCLUB_SMOKE_HEADFUL === "1");
  const profile = path.join(temporaryRoot, "chromium-profile");
  let context;
  try {
    context = await playwright.chromium.launchPersistentContext(profile, {
      executablePath,
      headless: launchMode.headless,
      args: [
        `--disable-extensions-except=${extensionDirectory}`,
        `--load-extension=${extensionDirectory}`,
        "--no-first-run",
        "--no-default-browser-check",
        ...launchMode.args
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
    const result = await page.evaluate(`(${pageProbe})(${JSON.stringify(fixtureUrl)})`);
    if (pageErrors.length) result.pageErrors = pageErrors;
    assertRuntimeResult(result, "chromium");
    assert(!pageErrors.length, `chromium: uncaught page error(s): ${pageErrors.join(" | ")}`);
    const userAgent = await page.evaluate(() => navigator.userAgent);
    const browserVersion = chromiumVersionFromUserAgent(userAgent);
    assert(browserVersion, `chromium: could not parse browser version from ${userAgent}`);
    assertExpectedBrowserMajor(
      "chromium",
      browserVersion,
      expectedMajor,
      "EXPECTED_CHROMIUM_MAJOR"
    );
    console.log(`Chromium browser smoke passed (${browserVersion}; ${userAgent}).`);
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

async function firefoxSmoke(extensionDirectory, fixtureUrl) {
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
      assertExpectedBrowserMajor("firefox", browserVersion, expectedMajor, "EXPECTED_FIREFOX_MAJOR");
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
      (${pageProbe})(${JSON.stringify(fixtureUrl)}).then(done, (error) => done({ probeError: error && error.message ? error.message : String(error) }));
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
let loopbackFixture;
try {
  loopbackFixture = await startLoopbackFixture();
  materializePackagePlan(packagePlan(target), extensionDirectory);
  if (target === "chromium") await chromiumSmoke(extensionDirectory, temporaryRoot, loopbackFixture.url);
  else await firefoxSmoke(extensionDirectory, loopbackFixture.url);
} catch (error) {
  console.error(error?.stack || error);
  process.exitCode = 1;
} finally {
  await loopbackFixture?.close().catch(() => {});
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
