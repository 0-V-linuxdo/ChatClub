#!/usr/bin/env node

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { contentInjectionPlan } from "../shared/frame-commands.js";
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
  "chatclub-summary-bridge",
  "chatclub-send",
  "chatclub-preferred-model",
  "chatclub-delete",
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

function assertRuntimeResult(result, browserTarget, options = {}) {
  // Firefox extension pages can expose different cross-origin WindowProxy
  // wrappers for repeated contentWindow reads. For Firefox, exact iframe node,
  // frame binding, src, and observed load events are the authoritative
  // retention signals; Chromium additionally checks WindowProxy identity.
  const contentWindowIdentityIsStable = browserTarget !== "firefox";
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
  const retention = result?.customAppFrameRetention;
  assert(retention?.ok === true, `${browserTarget}: custom app iframe-retention probe did not finish`);
  assert(retention.gridSame === true, `${browserTarget}: adding a custom app replaced the workspace root`);
  assert(
    retention.frameCountAfter === retention.frameCountBefore,
    `${browserTarget}: adding a custom app changed the iframe count (${retention.frameCountBefore} -> ${retention.frameCountAfter})`
  );
  assert(retention.fullscreenPreserved === true, `${browserTarget}: adding a custom app changed fullscreen state`);
  for (const frame of retention.frames || []) {
    assert(frame.sameNode === true, `${browserTarget}: adding a custom app replaced iframe ${frame.instanceId}`);
    assert(frame.sameCard === true, `${browserTarget}: adding a custom app moved iframe ${frame.instanceId} to another card`);
    if (contentWindowIdentityIsStable) {
      assert(frame.sameContentWindow === true, `${browserTarget}: adding a custom app replaced the browsing context for ${frame.instanceId}`);
    }
    assert(frame.sameFrameBindingId === true, `${browserTarget}: adding a custom app changed the frame binding for ${frame.instanceId}`);
    assert(frame.sameSrc === true, `${browserTarget}: adding a custom app reassigned src for ${frame.instanceId}`);
    assert(frame.sameActiveState === true, `${browserTarget}: adding a custom app changed active state for ${frame.instanceId}`);
    assert(frame.loadEvents === 0, `${browserTarget}: adding a custom app reloaded iframe ${frame.instanceId}`);
  }
  const usedEdits = retention.usedAppEdits;
  assert(usedEdits?.metadataEdit?.sameNode === true, `${browserTarget}: metadata-only custom app edit replaced its iframe`);
  if (contentWindowIdentityIsStable) {
    assert(usedEdits.metadataEdit.sameContentWindow === true, `${browserTarget}: metadata-only custom app edit replaced its browsing context`);
  }
  assert(usedEdits.metadataEdit.sameSrc === true, `${browserTarget}: metadata-only custom app edit reassigned src`);
  assert(usedEdits.metadataEdit.sameBinding === true, `${browserTarget}: metadata-only custom app edit changed its frame binding`);
  assert(usedEdits.metadataEdit.loadEvents === 0, `${browserTarget}: metadata-only custom app edit reloaded its iframe`);
  assert(usedEdits.sandboxEdit.forward.startedSandboxed === true, `${browserTarget}: sandbox contract probe did not start sandboxed`);
  assert(usedEdits.sandboxEdit.forward.targetReplaced === true, `${browserTarget}: sandbox removal did not replace its target iframe`);
  assert(usedEdits.sandboxEdit.forward.bindingReplaced === true, `${browserTarget}: sandbox removal retained the stale frame binding`);
  assert(usedEdits.sandboxEdit.forward.sameSrc === true, `${browserTarget}: sandbox removal changed the target URL`);
  assert(usedEdits.sandboxEdit.forward.endedSandboxed === false, `${browserTarget}: sandbox removal did not apply the new frame contract`);
  assert(usedEdits.sandboxEdit.reverse.targetReplaced === true, `${browserTarget}: sandbox restoration did not replace its target iframe`);
  assert(usedEdits.sandboxEdit.reverse.bindingReplaced === true, `${browserTarget}: sandbox restoration retained the stale frame binding`);
  assert(usedEdits.sandboxEdit.reverse.sameSrc === true, `${browserTarget}: sandbox restoration changed the target URL`);
  assert(usedEdits.sandboxEdit.reverse.endedSandboxed === true, `${browserTarget}: sandbox restoration did not apply the new frame contract`);
  for (const frame of usedEdits.sandboxEdit.unaffectedFrames || []) {
    assert(frame.sameNode === true, `${browserTarget}: sandbox contract edit replaced unrelated iframe ${frame.instanceId}`);
    assert(frame.sameCard === true, `${browserTarget}: sandbox contract edit moved unrelated iframe ${frame.instanceId}`);
    if (contentWindowIdentityIsStable) {
      assert(frame.sameContentWindow === true, `${browserTarget}: sandbox contract edit replaced unrelated browsing context ${frame.instanceId}`);
    }
    assert(frame.sameFrameBindingId === true, `${browserTarget}: sandbox contract edit changed unrelated binding ${frame.instanceId}`);
    assert(frame.sameSrc === true, `${browserTarget}: sandbox contract edit reassigned unrelated src ${frame.instanceId}`);
    assert(frame.loadEvents === 0, `${browserTarget}: sandbox contract edit reloaded unrelated iframe ${frame.instanceId}`);
  }
  assert(usedEdits.urlEdit.targetReplaced === true, `${browserTarget}: custom app URL edit did not replace its target iframe`);
  if (contentWindowIdentityIsStable) {
    assert(usedEdits.urlEdit.contentWindowReplaced === true, `${browserTarget}: custom app URL edit retained the stale browsing context`);
  }
  assert(usedEdits.urlEdit.bindingReplaced === true, `${browserTarget}: custom app URL edit retained the stale frame binding`);
  assert(usedEdits.urlEdit.editedSrc === true, `${browserTarget}: custom app URL edit did not load its new URL`);
  for (const frame of usedEdits.urlEdit.unaffectedFrames || []) {
    assert(frame.sameNode === true, `${browserTarget}: custom app URL edit replaced unrelated iframe ${frame.instanceId}`);
    assert(frame.sameCard === true, `${browserTarget}: custom app URL edit moved unrelated iframe ${frame.instanceId}`);
    if (contentWindowIdentityIsStable) {
      assert(frame.sameContentWindow === true, `${browserTarget}: custom app URL edit replaced unrelated browsing context ${frame.instanceId}`);
    }
    assert(frame.sameFrameBindingId === true, `${browserTarget}: custom app URL edit changed unrelated binding ${frame.instanceId}`);
    assert(frame.sameSrc === true, `${browserTarget}: custom app URL edit reassigned unrelated src ${frame.instanceId}`);
    assert(frame.loadEvents === 0, `${browserTarget}: custom app URL edit reloaded unrelated iframe ${frame.instanceId}`);
  }
  const usedDeletion = retention.usedAppDeletion;
  assert(usedDeletion?.customFrameRemoved === true, `${browserTarget}: deleting a used custom app did not remove its iframe`);
  assert(
    usedDeletion.frameCountAfter === retention.frameCountBefore,
    `${browserTarget}: deleting a used custom app changed unrelated iframe membership`
  );
  assert(usedDeletion.fullscreenPreserved === true, `${browserTarget}: deleting a used custom app changed fullscreen state`);
  for (const frame of usedDeletion.unaffectedFrames || []) {
    assert(frame.sameNode === true, `${browserTarget}: deleting a used custom app replaced iframe ${frame.instanceId}`);
    assert(frame.sameCard === true, `${browserTarget}: deleting a used custom app moved iframe ${frame.instanceId}`);
    if (contentWindowIdentityIsStable) {
      assert(frame.sameContentWindow === true, `${browserTarget}: deleting a used custom app replaced the browsing context for ${frame.instanceId}`);
    }
    assert(frame.sameFrameBindingId === true, `${browserTarget}: deleting a used custom app changed the frame binding for ${frame.instanceId}`);
    assert(frame.sameSrc === true, `${browserTarget}: deleting a used custom app reassigned src for ${frame.instanceId}`);
    assert(frame.sameActiveState === true, `${browserTarget}: deleting a used custom app changed active state for ${frame.instanceId}`);
    assert(frame.loadEvents === 0, `${browserTarget}: deleting a used custom app reloaded iframe ${frame.instanceId}`);
  }
  const injectedFiles = loopback?.injection?.injectedFiles || [];
  const fallbackFiles = loopback?.injection?.fallbackFiles || [];
  const injectedFrameIds = loopback?.injection?.frameIds || [];
  assert(Boolean(loopback?.injection?.browserDocumentId), `${browserTarget}: bridge injection returned no browser document id`);
  assert(
    loopback.injection.browserDocumentId === loopback.boundBrowserDocumentId,
    `${browserTarget}: bridge injection and authenticated relay crossed browser documents`
  );
  assert(injectedFrameIds.length === 1, `${browserTarget}: duplicate-URL frame selection was ambiguous`);
  assert(loopback?.boundFrameId === injectedFrameIds[0], `${browserTarget}: authenticated binding did not come from the injected target frame`);
  if (loopback?.expectedFrameId != null) {
    assert(loopback.expectedFrameId === injectedFrameIds[0], `${browserTarget}: exact browser frame id was not preserved across navigation`);
  }
  const expectedInjectedFiles = contentInjectionPlan({
    features: ["summary"],
    frameUrls: [loopback.fixtureUrl]
  }).map(({ file }) => file);
  assert(loopback?.injection?.injected === expectedInjectedFiles.length, `${browserTarget}: loopback injection count mismatch`);
  for (const file of expectedInjectedFiles) {
    assert(injectedFiles.some((entry) => String(entry).startsWith(`${file}@`)), `${browserTarget}: loopback injection missing ${file}`);
  }
  if (browserTarget === "chromium") {
    assert(fallbackFiles.length === 0, `chromium: unexpected Firefox function fallback(s): ${fallbackFiles.join(" | ")}`);
  }
  if (options.expectFirefoxFileFallback) {
    for (const file of expectedInjectedFiles) {
      assert(
        fallbackFiles.some((entry) => String(entry).startsWith(`${file}@`)),
        `firefox: expected Firefox 136 function fallback for ${file}`
      );
    }
  }
  assert(!(loopback?.injection?.errors || []).length, `${browserTarget}: loopback injection error(s): ${(loopback?.injection?.errors || []).join(" | ")}`);
}

async function chromiumWorkspaceSessionRecoveryProbe(context, page, fixtureUrl, pageErrors) {
  let activePage = page;
  const prepared = await page.evaluate(async ({ fixtureUrl }) => {
    const api = globalThis.chrome;
    const shared = await import(api.runtime.getURL("shared/workspace-session.js"));
    const stored = await api.storage.local.get(["options", shared.WORKSPACE_SESSION_GENERATION_KEY]);
    const generation = stored[shared.WORKSPACE_SESSION_GENERATION_KEY]
      || shared.DEFAULT_WORKSPACE_SESSION_GENERATION;
    const presetId = stored.options?.activeLayoutPresetId
      || stored.options?.layoutPresets?.[0]?.id
      || "default";
    const appIds = [...new Set(Array.from(document.querySelectorAll(".chat-frame"))
      .map((frame) => frame.dataset.appId)
      .filter(Boolean))];
    if (appIds.length < 2) throw new Error("workspace session smoke requires at least two valid apps");
    const href = (marker) => {
      const url = new URL(fixtureUrl);
      url.searchParams.set("workspace", marker);
      return url.href;
    };
    const expected = {
      groups: [
        {
          appIds: [appIds[0], appIds[0]],
          activeIndex: 1,
          hrefs: [href("duplicate-first"), href("duplicate-active")]
        },
        {
          appIds: [appIds[1]],
          activeIndex: 0,
          hrefs: [href("fullscreen")]
        }
      ],
      fullscreenGroupIndex: 1
    };
    const snapshot = {
      schemaVersion: shared.WORKSPACE_SESSION_SCHEMA_VERSION,
      generation,
      layout: { type: "preset", presetId },
      groups: expected.groups.map((group) => ({
        tabs: group.appIds.map((appId, index) => ({ appId, currentHref: group.hrefs[index] })),
        activeIndex: group.activeIndex
      })),
      fullscreenGroupIndex: expected.fullscreenGroupIndex
    };
    sessionStorage.setItem(shared.WORKSPACE_SESSION_PAGE_KEY, JSON.stringify({ generation, snapshot }));
    const tab = await api.tabs.getCurrent();
    return {
      expected,
      pageKey: shared.WORKSPACE_SESSION_PAGE_KEY,
      oldTabId: tab.id
    };
  }, { fixtureUrl });

  const readWorkspace = () => activePage.evaluate(() => {
    const cards = Array.from(document.querySelectorAll(".chat-card"));
    return {
      shell: Boolean(document.querySelector("#app .app-shell")),
      fullscreen: cards.findIndex((card) => card.classList.contains("fullscreen")),
      groups: cards.map((card) => {
        const frames = Array.from(card.querySelectorAll(".chat-frame"));
        return {
          appIds: frames.map((frame) => frame.dataset.appId),
          activeIndex: frames.findIndex((frame) => frame.classList.contains("active")),
          hrefs: frames.map((frame) => frame.getAttribute("src") || "")
        };
      })
    };
  });
  const matchesExpected = ({ groups, fullscreen }, expected) => (
    fullscreen === expected.fullscreenGroupIndex
    && groups.length === expected.groups.length
    && groups.every((group, groupIndex) => {
      const wanted = expected.groups[groupIndex];
      return group.activeIndex === wanted.activeIndex
        && JSON.stringify(group.appIds) === JSON.stringify(wanted.appIds)
        && JSON.stringify(group.hrefs) === JSON.stringify(wanted.hrefs);
    })
  );
  const waitForRestoredWorkspace = async () => {
    await activePage.locator("#app .app-shell").waitFor({ state: "attached", timeout: 25000 });
    await activePage.waitForFunction((expected) => {
      const cards = Array.from(document.querySelectorAll(".chat-card"));
      const groups = cards.map((card) => {
        const frames = Array.from(card.querySelectorAll(".chat-frame"));
        return {
          appIds: frames.map((frame) => frame.dataset.appId),
          activeIndex: frames.findIndex((frame) => frame.classList.contains("active")),
          hrefs: frames.map((frame) => frame.getAttribute("src") || "")
        };
      });
      const fullscreen = cards.findIndex((card) => card.classList.contains("fullscreen"));
      return fullscreen === expected.fullscreenGroupIndex
        && groups.length === expected.groups.length
        && groups.every((group, groupIndex) => {
          const wanted = expected.groups[groupIndex];
          return group.activeIndex === wanted.activeIndex
            && JSON.stringify(group.appIds) === JSON.stringify(wanted.appIds)
            && JSON.stringify(group.hrefs) === JSON.stringify(wanted.hrefs);
        });
    }, prepared.expected, { timeout: 25000 });
    const current = await readWorkspace();
    assert(matchesExpected(current, prepared.expected), `chromium: restored workspace mismatch: ${JSON.stringify(current)}`);
  };

  await activePage.reload({ waitUntil: "domcontentloaded", timeout: 20000 });
  await waitForRestoredWorkspace();
  await activePage.waitForFunction(async (expected) => {
    const shared = await import(chrome.runtime.getURL("shared/workspace-session.js"));
    const workspaceId = shared.workspaceSessionIdFromUrl(location.href);
    if (!workspaceId) return false;
    const tab = await chrome.tabs.getCurrent();
    const workspaceKey = shared.workspaceSessionWorkspaceKey(workspaceId);
    const bindingKey = shared.workspaceSessionBindingKey(tab.id);
    const stored = await chrome.storage.local.get([workspaceKey, bindingKey]);
    const workspace = stored[workspaceKey];
    const snapshot = workspace?.snapshot;
    return workspace?.workspaceId === workspaceId
      && workspace?.owner?.tabId === tab.id
      && stored[bindingKey]?.workspaceId === workspaceId
      && snapshot?.groups?.length === expected.groups.length
      && snapshot.groups[0]?.activeIndex === expected.groups[0].activeIndex
      && snapshot.fullscreenGroupIndex === expected.fullscreenGroupIndex;
  }, prepared.expected, { timeout: 10000 });

  const durable = await activePage.evaluate(async () => {
    const shared = await import(chrome.runtime.getURL("shared/workspace-session.js"));
    const workspaceId = shared.workspaceSessionIdFromUrl(location.href);
    const tab = await chrome.tabs.getCurrent();
    return {
      workspaceId,
      workspaceUrl: shared.workspaceSessionUrl(location.href, workspaceId),
      tabId: tab.id
    };
  });
  assert(durable.tabId === prepared.oldTabId, "chromium: ordinary document reload unexpectedly changed the browser tab id");
  assert(durable.workspaceId, "chromium: workspace reload did not install a stable URL token");

  // Removing only the page-local layer simulates an update path where the
  // top-level document is recreated while its stable URL token remains.
  await activePage.evaluate((pageKey) => sessionStorage.removeItem(pageKey), prepared.pageKey);
  await activePage.reload({ waitUntil: "domcontentloaded", timeout: 20000 });
  await waitForRestoredWorkspace();

  // Do not call chrome.runtime.reload() here: Chromium disables an unpacked
  // command-line-loaded extension after that call in Playwright, leaving no
  // replacement runtime to verify. Rebuilding the extension page exercises
  // the actual persistence boundary without mutating the installed extension.
  await activePage.close();
  activePage = await context.newPage();
  activePage.on("pageerror", (error) => pageErrors.push(error.message));
  await activePage.addInitScript((pageKey) => {
    globalThis.__chatclubSmokeInitialWorkspacePageValue = sessionStorage.getItem(pageKey);
  }, prepared.pageKey);
  await activePage.goto(durable.workspaceUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
  await waitForRestoredWorkspace();
  await activePage.waitForFunction(async ({ workspaceId, expected }) => {
    const shared = await import(chrome.runtime.getURL("shared/workspace-session.js"));
    if (shared.workspaceSessionIdFromUrl(location.href) !== workspaceId) return false;
    const tab = await chrome.tabs.getCurrent();
    const workspaceKey = shared.workspaceSessionWorkspaceKey(workspaceId);
    const bindingKey = shared.workspaceSessionBindingKey(tab.id);
    const stored = await chrome.storage.local.get([workspaceKey, bindingKey]);
    const workspace = stored[workspaceKey];
    const snapshot = workspace?.snapshot;
    return workspace?.owner?.tabId === tab.id
      && stored[bindingKey]?.workspaceId === workspaceId
      && snapshot?.groups?.length === expected.groups.length
      && snapshot.groups[0]?.activeIndex === expected.groups[0].activeIndex
      && snapshot.fullscreenGroupIndex === expected.fullscreenGroupIndex;
  }, { workspaceId: durable.workspaceId, expected: prepared.expected }, { timeout: 10000 });

  const rebuilt = await activePage.evaluate(async ({ pageKey, workspaceId }) => {
    const shared = await import(chrome.runtime.getURL("shared/workspace-session.js"));
    const tab = await chrome.tabs.getCurrent();
    const workspaceKey = shared.workspaceSessionWorkspaceKey(workspaceId);
    const bindingKey = shared.workspaceSessionBindingKey(tab.id);
    const stored = await chrome.storage.local.get([workspaceKey, bindingKey]);
    return {
      tabId: tab.id,
      workspaceId: shared.workspaceSessionIdFromUrl(location.href),
      initialPageValue: globalThis.__chatclubSmokeInitialWorkspacePageValue,
      pageValuePresent: Boolean(sessionStorage.getItem(pageKey)),
      workspaceOwnerTabId: stored[workspaceKey]?.owner?.tabId,
      bindingWorkspaceId: stored[bindingKey]?.workspaceId
    };
  }, { pageKey: prepared.pageKey, workspaceId: durable.workspaceId });
  assert(rebuilt.tabId !== durable.tabId, "chromium: workspace reconstruction did not allocate a new browser tab id");
  assert(rebuilt.workspaceId === durable.workspaceId, "chromium: workspace reconstruction changed the stable URL token");
  assert(rebuilt.initialPageValue === null, "chromium: reconstructed tab unexpectedly inherited page sessionStorage");
  assert(rebuilt.pageValuePresent, "chromium: stable mirror recovery did not warm the new page sessionStorage");
  assert(rebuilt.workspaceOwnerTabId === rebuilt.tabId, "chromium: stable mirror owner did not move to the reconstructed tab");
  assert(rebuilt.bindingWorkspaceId === durable.workspaceId, "chromium: reconstructed tab binding does not point to the stable workspace");
  return {
    page: activePage,
    result: {
      ok: true,
      mode: "stable-token-new-tab",
      expected: prepared.expected,
      workspaceId: durable.workspaceId,
      oldTabId: durable.tabId,
      newTabId: rebuilt.tabId
    }
  };
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
    const protocol = await import(api.runtime.getURL("shared/protocol.js"));
    const challengeBytes = new Uint8Array(32);
    crypto.getRandomValues(challengeBytes);
    const challenge = Array.from(challengeBytes, (value) => value.toString(16).padStart(2, "0")).join("");
    const frameBindingBytes = new Uint8Array(32);
    crypto.getRandomValues(frameBindingBytes);
    const expectedBindingId = Array.from(frameBindingBytes, (value) => value.toString(16).padStart(2, "0")).join("");
    const frameName = new URLSearchParams({ chatclub_frame_binding: expectedBindingId });
    iframe.name = frameName.toString();
    const generation = 1;
    let expectedFrameId = null;
    let bindingResolve;
    let bindingTimer;
    let bindingProbeTimer;
    const bindingPromise = new Promise((resolve, reject) => {
      bindingResolve = resolve;
      bindingTimer = setTimeout(() => reject(new Error("loopback authenticated frame binding timed out")), 12000);
    });
    bindingPromise.catch(() => {});
    const onRuntimeMessage = (message, sender) => {
      const context = message?.senderContext || {};
      if (
        message?.source !== protocol.EXTENSION_RUNTIME_RELAY_SOURCE
        || message.action !== "frameBinding"
        || sender?.tab
        || message.challenge !== challenge
        || message.generation !== generation
        || context.tabId !== currentTab.id
        || (expectedFrameId != null && context.frameId !== expectedFrameId)
        || context.frameBindingId !== expectedBindingId
        || message.data?.documentId !== context.bridgeDocumentId
        || message.data?.browserDocumentId !== context.documentId
        || message.data?.frameBindingId !== expectedBindingId
        || message.data?.bridgeVersion !== protocol.CONTENT_BRIDGE_VERSION
      ) return false;
      clearTimeout(bindingTimer);
      clearInterval(bindingProbeTimer);
      bindingResolve(message);
      return false;
    };
    api.runtime.onMessage.addListener(onRuntimeMessage);
    let decoy = null;
    let handshakeStage = "fixture setup";
    try {
      handshakeStage = "about:blank frame identity";
      const blankLoaded = new Promise((resolve, reject) => {
        iframe.addEventListener("load", resolve, { once: true });
        iframe.addEventListener("error", () => reject(new Error("loopback about:blank iframe failed to load")), { once: true });
      });
      iframe.src = "about:blank";
      document.body.append(iframe);
      await withTimeout(blankLoaded, 5000, "loopback about:blank iframe load");
      expectedFrameId = typeof api.runtime.getFrameId === "function"
        ? api.runtime.getFrameId(iframe.contentWindow)
        : null;
      if (expectedFrameId != null && (!Number.isSafeInteger(expectedFrameId) || expectedFrameId <= 0)) {
        throw new Error("loopback iframe browser frame id is unavailable");
      }
      handshakeStage = "fixture navigation";
      const loaded = new Promise((resolve, reject) => {
        iframe.addEventListener("load", resolve, { once: true });
        iframe.addEventListener("error", () => reject(new Error("loopback iframe failed to load")), { once: true });
      });
      iframe.src = fixtureUrl;
      await withTimeout(loaded, 10000, "loopback iframe load");
      handshakeStage = "duplicate URL decoy";
      decoy = document.createElement("iframe");
      decoy.id = "chatclub-browser-smoke-loopback-decoy";
      decoy.hidden = true;
      const decoyBindingBytes = new Uint8Array(32);
      crypto.getRandomValues(decoyBindingBytes);
      const decoyBindingId = Array.from(decoyBindingBytes, (value) => value.toString(16).padStart(2, "0")).join("");
      decoy.name = new URLSearchParams({ chatclub_frame_binding: decoyBindingId }).toString();
      const decoyLoaded = new Promise((resolve, reject) => {
        decoy.addEventListener("load", resolve, { once: true });
        decoy.addEventListener("error", () => reject(new Error("loopback decoy iframe failed to load")), { once: true });
      });
      decoy.src = fixtureUrl;
      document.body.append(decoy);
      await withTimeout(decoyLoaded, 10000, "loopback decoy iframe load");
      handshakeStage = "bridge injection";
      const exactBindingRequest = {
        expectedBindingId,
        ...(expectedFrameId == null ? {} : {
          expectedFrameId,
          bindingChallenge: challenge,
          bindingGeneration: generation
        })
      };
      const injection = await withTimeout(api.runtime.sendMessage({
        source: "chatclub",
        action: "ensureContentBridge",
        tabId: currentTab.id,
        hrefs: [fixtureUrl],
        features: ["summary"],
        ...exactBindingRequest
      }), 15000, "loopback bridge injection");
      if (!injection?.success) throw new Error(injection?.error || "loopback bridge injection failed");
      if ((injection.errors || []).length) {
        throw new Error("loopback bridge injection failed before frame binding: " + injection.errors.join(" | "));
      }
      if (expectedFrameId != null) {
        if (injection.bindingRelayed !== true) throw new Error("loopback bridge injection did not relay the authenticated frame binding");
      } else {
        const probeBinding = () => iframe.contentWindow?.postMessage({
          source: protocol.FRAME_BINDING_POST_MESSAGE_SOURCE,
          type: "request",
          action: "bindFrame",
          challenge,
          generation,
          expectedBindingId,
          browserDocumentId: injection.browserDocumentId
        }, "*");
        probeBinding();
        bindingProbeTimer = setInterval(probeBinding, 250);
      }
      handshakeStage = "authenticated frame binding";
      const binding = await bindingPromise;
      const ready = binding.data || {};
      const command = async (name) => {
        const response = await withTimeout(api.runtime.sendMessage({
          source: "chatclub",
          action: "sendFrameCommand",
          appTabId: currentTab.id,
          bridgeDocumentId: ready.documentId,
          command: name,
          data: {},
          timeoutMs: 5000
        }), 8000, "loopback " + name);
        if (!response?.success) throw new Error(response?.error || ("loopback " + name + " failed"));
        return response.data;
      };
      handshakeStage = "secure frame commands";
      return {
        fixtureUrl,
        tabId: currentTab.id,
        injection,
        ready,
        boundFrameId: binding.senderContext?.frameId,
        boundBrowserDocumentId: binding.senderContext?.documentId,
        expectedFrameId,
        locationHref: await command("getLocationHref"),
        summaryState: await command("getSummaryRuntimeState")
      };
    } catch (error) {
      clearTimeout(bindingTimer);
      clearInterval(bindingProbeTimer);
      throw new Error(handshakeStage + ": " + (error && error.message ? error.message : String(error)));
    } finally {
      clearTimeout(bindingTimer);
      clearInterval(bindingProbeTimer);
      api.runtime.onMessage.removeListener(onRuntimeMessage);
      decoy?.remove();
      iframe.remove();
    }
  };
  const customAppFrameRetentionProbe = async () => {
    const quietWindow = (timeoutMs = 300) => new Promise((resolve) => setTimeout(resolve, timeoutMs));
    const waitForCondition = (predicate, timeoutMs, label) => withTimeout(new Promise((resolve) => {
      const poll = () => {
        if (predicate()) return resolve();
        setTimeout(poll, 25);
      };
      poll();
    }), timeoutMs, label);
    const grid = document.querySelector(".main-grid");
    const frames = Array.from(document.querySelectorAll(".chat-frame"));
    if (!grid || !frames.length) throw new Error("custom app retention probe found no workspace frames");
    await waitForCondition(
      () => frames.every((iframe) => Boolean(iframe.getAttribute("src"))),
      15000,
      "initial workspace frame assignment"
    );
    // Real sites can still be completing their first redirect when Firefox
    // attaches to the extension page. Move every baseline frame to a local,
    // deterministic document and wait for that navigation before installing
    // the retention listeners, so later load events are causally attributable
    // to the catalog operation under test.
    await Promise.all(frames.map((iframe, index) => withTimeout(new Promise((resolve, reject) => {
      const controlledUrl = new URL(fixtureUrl);
      controlledUrl.searchParams.set("retention-baseline", String(index));
      const onLoad = () => {
        iframe.removeEventListener("error", onError);
        resolve();
      };
      const onError = () => {
        iframe.removeEventListener("load", onLoad);
        reject(new Error("controlled workspace frame " + index + " failed to load"));
      };
      iframe.addEventListener("load", onLoad, { once: true });
      iframe.addEventListener("error", onError, { once: true });
      iframe.src = controlledUrl.href;
    }), 10000, "controlled workspace frame " + index)));
    await quietWindow(1000);
    const before = frames.map((iframe) => ({
      iframe,
      card: iframe.closest(".chat-card"),
      contentWindow: iframe.contentWindow,
      instanceId: iframe.dataset.instanceId || "",
      frameBindingId: iframe.dataset.frameBindingId || "",
      currentHref: iframe.dataset.currentHref || "",
      src: iframe.getAttribute("src") || "",
      active: iframe.classList.contains("active"),
      loadEvents: 0,
      onload: null
    }));
    for (const item of before) {
      item.onload = () => { item.loadEvents += 1; };
      item.iframe.addEventListener("load", item.onload);
    }
    const fullscreenGroupId = document.querySelector(".chat-card.fullscreen")?.dataset.groupId || "";
    let trackedCustomFrame = null;
    let trackedCustomLoadHandler = null;
    try {
      const addTabButton = document.querySelector(".tab-add");
      if (!addTabButton) throw new Error("custom app retention probe found no app picker trigger");
      addTabButton.click();
      await waitForCondition(
        () => Boolean(document.querySelector('[data-tooltip-id="appPicker.addCustom"]')),
        3000,
        "custom app picker"
      );
      document.querySelector('[data-tooltip-id="appPicker.addCustom"]').click();
      await waitForCondition(
        () => Boolean(document.querySelector(".settings-editor-modal")),
        3000,
        "custom app editor"
      );
      const editor = document.querySelector(".settings-editor-modal");
      const inputs = Array.from(editor.querySelectorAll("input"));
      if (inputs.length < 5) throw new Error("custom app retention probe found an incomplete editor");
      inputs[0].value = "Browser Smoke Custom";
      inputs[1].value = "Browser Smoke";
      inputs[2].value = fixtureUrl;
      inputs[3].value = "textarea";
      inputs[4].value = "button[type=submit]";
      const saveButton = editor.querySelector(".settings-dialog-actions .button-primary");
      if (!saveButton) throw new Error("custom app retention probe found no save action");
      saveButton.click();
      await waitForCondition(
        () => !document.querySelector(".settings-editor-modal"),
        15000,
        "custom app save"
      );
      await quietWindow();
      const afterFrames = Array.from(document.querySelectorAll(".chat-frame"));
      const frameStatus = (candidates) => before.map((item) => {
        const current = candidates.find((iframe) => iframe.dataset.instanceId === item.instanceId);
        return {
          instanceId: item.instanceId,
          sameNode: current === item.iframe,
          sameCard: current?.closest(".chat-card") === item.card,
          sameContentWindow: current?.contentWindow === item.contentWindow,
          sameFrameBindingId: (current?.dataset.frameBindingId || "") === item.frameBindingId,
          sameCurrentHref: (current?.dataset.currentHref || "") === item.currentHref,
          sameSrc: (current?.getAttribute("src") || "") === item.src,
          sameActiveState: Boolean(current?.classList.contains("active")) === item.active,
          loadEvents: item.loadEvents
        };
      });
      const additionFrames = frameStatus(afterFrames);
      const api = globalThis.browser || globalThis.chrome;
      const stored = await api.storage.local.get("customConfig");
      const customApp = (stored.customConfig || []).find((app) => app?.name === "Browser Smoke Custom");
      if (!customApp?.id) throw new Error("custom app retention probe could not resolve the saved app");

      const pickerTrigger = document.querySelector(".tab-add");
      pickerTrigger.click();
      await waitForCondition(
        () => Array.from(document.querySelectorAll(".app-picker-custom .app-picker-item"))
          .some((item) => item.textContent.includes("Browser Smoke Custom")),
        3000,
        "saved custom app picker item"
      );
      const customPickerItem = Array.from(document.querySelectorAll(".app-picker-custom .app-picker-item"))
        .find((item) => item.textContent.includes("Browser Smoke Custom"));
      customPickerItem.click();
      await waitForCondition(
        () => Array.from(document.querySelectorAll(".chat-frame"))
          .some((iframe) => iframe.dataset.appId === customApp.id),
        10000,
        "custom app workspace frame"
      );
      let customFrame = Array.from(document.querySelectorAll(".chat-frame"))
        .find((iframe) => iframe.dataset.appId === customApp.id);
      await waitForCondition(
        () => Boolean(customFrame.getAttribute("src"))
          && !customFrame.closest(".chat-card")?.classList.contains("frame-loading"),
        10000,
        "settled custom app frame"
      );
      await quietWindow(500);
      trackedCustomFrame = customFrame;
      let customFrameLoadEvents = 0;
      trackedCustomLoadHandler = () => { customFrameLoadEvents += 1; };
      trackedCustomFrame.addEventListener("load", trackedCustomLoadHandler);
      let customFrameBeforeEdit = {
        iframe: customFrame,
        contentWindow: customFrame.contentWindow,
        src: customFrame.getAttribute("src") || "",
        binding: customFrame.dataset.frameBindingId || "",
        instanceId: customFrame.dataset.instanceId || ""
      };

      const brandButton = document.querySelector('[data-tooltip-id="topbar.brand"]');
      if (!brandButton) throw new Error("custom app retention probe found no settings entry");
      brandButton.click();
      await waitForCondition(
        () => Boolean(document.querySelector(".settings-modal")),
        3000,
        "settings modal"
      );
      const settingsTabs = Array.from(document.querySelectorAll(".settings-modal .settings-tab"));
      if (settingsTabs.length < 3) throw new Error("custom app retention probe found no Apps settings section");
      settingsTabs[2].click();
      await waitForCondition(
        () => Boolean(document.querySelector(".apps-settings-pane")),
        3000,
        "Apps settings"
      );
      const innerTabs = Array.from(document.querySelectorAll(".apps-settings-pane .settings-inner-tab"));
      if (innerTabs.length < 2) throw new Error("custom app retention probe found no Custom Apps tab");
      innerTabs[1].click();
      await waitForCondition(
        () => Array.from(document.querySelectorAll(".custom-config-row"))
          .some((row) => row.dataset.customAppId === customApp.id),
        3000,
        "custom app settings row"
      );
      const customSettingsRow = () => Array.from(document.querySelectorAll(".custom-config-row"))
        .find((row) => row.dataset.customAppId === customApp.id);
      let customRow = customSettingsRow();
      const editButton = customRow.querySelector('[data-tooltip-id="settings.action.edit"]');
      if (!editButton) throw new Error("custom app retention probe found no edit action");
      editButton.click();
      await waitForCondition(
        () => Boolean(document.querySelector(".settings-editor-modal")),
        3000,
        "custom app metadata editor"
      );
      let editInputs = Array.from(document.querySelectorAll(".settings-editor-modal input"));
      editInputs[0].value = "Browser Smoke Custom Edited";
      document.querySelector(".settings-editor-modal .settings-dialog-actions .button-primary").click();
      await waitForCondition(
        () => !document.querySelector(".settings-editor-modal"),
        15000,
        "custom app metadata save"
      );
      await quietWindow();
      const metadataFrame = Array.from(document.querySelectorAll(".chat-frame"))
        .find((iframe) => iframe.dataset.instanceId === customFrameBeforeEdit.instanceId);
      const metadataEdit = {
        sameNode: metadataFrame === customFrameBeforeEdit.iframe,
        sameContentWindow: metadataFrame?.contentWindow === customFrameBeforeEdit.contentWindow,
        sameSrc: (metadataFrame?.getAttribute("src") || "") === customFrameBeforeEdit.src,
        sameBinding: (metadataFrame?.dataset.frameBindingId || "") === customFrameBeforeEdit.binding,
        loadEvents: customFrameLoadEvents
      };

      const importCustomCatalog = async (catalog, label) => {
        if (!document.querySelector(".import-export-pane")) {
          settingsTabs[11]?.click();
          await waitForCondition(
            () => Boolean(document.querySelector(".import-export-pane")),
            3000,
            label + " import settings"
          );
        }
        const fileInput = document.querySelector(".import-export-pane .settings-file-input");
        if (!fileInput) throw new Error(label + " import found no file input");
        const transfer = new DataTransfer();
        transfer.items.add(new File([
          JSON.stringify({ schema: "chatclub.config.v1", customConfig: catalog })
        ], label + ".json", { type: "application/json" }));
        fileInput.files = transfer.files;
        fileInput.dispatchEvent(new Event("change", { bubbles: true }));
        await waitForCondition(
          () => Boolean(document.querySelector(".io-import-modal")),
          3000,
          label + " import confirmation"
        );
        const confirm = document.querySelector(".io-import-modal .settings-dialog-actions .button-primary");
        if (!confirm) throw new Error(label + " import found no confirmation action");
        confirm.click();
        await waitForCondition(
          () => !document.querySelector(".io-import-modal"),
          15000,
          label + " import apply"
        );
      };
      const storedAfterMetadata = await api.storage.local.get("customConfig");
      const metadataCatalog = storedAfterMetadata.customConfig || [];
      const sandboxForwardBefore = metadataFrame;
      const sandboxForwardBinding = sandboxForwardBefore?.dataset.frameBindingId || "";
      const sandboxForwardSrc = sandboxForwardBefore?.getAttribute("src") || "";
      await importCustomCatalog(metadataCatalog.map((app) => app.id === customApp.id
        ? { ...app, hosts: ["grok.com"] }
        : app), "sandbox-remove");
      await waitForCondition(
        () => !sandboxForwardBefore.isConnected
          && Array.from(document.querySelectorAll(".chat-frame"))
            .some((iframe) => iframe.dataset.instanceId === customFrameBeforeEdit.instanceId),
        10000,
        "sandbox removal frame replacement"
      );
      let sandboxFrame = Array.from(document.querySelectorAll(".chat-frame"))
        .find((iframe) => iframe.dataset.instanceId === customFrameBeforeEdit.instanceId);
      await waitForCondition(
        () => Boolean(sandboxFrame?.getAttribute("src"))
          && !sandboxFrame.closest(".chat-card")?.classList.contains("frame-loading"),
        10000,
        "sandbox removal frame load"
      );
      await quietWindow(500);
      const sandboxForward = {
        startedSandboxed: sandboxForwardBefore?.hasAttribute("sandbox") === true,
        targetReplaced: sandboxFrame !== sandboxForwardBefore,
        bindingReplaced: (sandboxFrame?.dataset.frameBindingId || "") !== sandboxForwardBinding,
        sameSrc: (sandboxFrame?.getAttribute("src") || "") === sandboxForwardSrc,
        endedSandboxed: sandboxFrame?.hasAttribute("sandbox") === true
      };

      const sandboxReverseBefore = sandboxFrame;
      const sandboxReverseBinding = sandboxReverseBefore?.dataset.frameBindingId || "";
      const sandboxReverseSrc = sandboxReverseBefore?.getAttribute("src") || "";
      await importCustomCatalog(metadataCatalog.map((app) => app.id === customApp.id
        ? { ...app, hosts: [] }
        : app), "sandbox-restore");
      await waitForCondition(
        () => !sandboxReverseBefore.isConnected
          && Array.from(document.querySelectorAll(".chat-frame"))
            .some((iframe) => iframe.dataset.instanceId === customFrameBeforeEdit.instanceId),
        10000,
        "sandbox restoration frame replacement"
      );
      sandboxFrame = Array.from(document.querySelectorAll(".chat-frame"))
        .find((iframe) => iframe.dataset.instanceId === customFrameBeforeEdit.instanceId);
      await waitForCondition(
        () => Boolean(sandboxFrame?.getAttribute("src"))
          && !sandboxFrame.closest(".chat-card")?.classList.contains("frame-loading"),
        10000,
        "sandbox restoration frame load"
      );
      await quietWindow(500);
      const sandboxReverse = {
        targetReplaced: sandboxFrame !== sandboxReverseBefore,
        bindingReplaced: (sandboxFrame?.dataset.frameBindingId || "") !== sandboxReverseBinding,
        sameSrc: (sandboxFrame?.getAttribute("src") || "") === sandboxReverseSrc,
        endedSandboxed: sandboxFrame?.hasAttribute("sandbox") === true
      };
      const sandboxEdit = {
        forward: sandboxForward,
        reverse: sandboxReverse,
        unaffectedFrames: frameStatus(Array.from(document.querySelectorAll(".chat-frame")))
      };
      customFrameBeforeEdit = {
        iframe: sandboxFrame,
        contentWindow: sandboxFrame.contentWindow,
        src: sandboxFrame.getAttribute("src") || "",
        binding: sandboxFrame.dataset.frameBindingId || "",
        instanceId: sandboxFrame.dataset.instanceId || ""
      };

      settingsTabs[2]?.click();
      await waitForCondition(
        () => Boolean(document.querySelector(".apps-settings-pane")),
        3000,
        "Apps settings after sandbox imports"
      );
      Array.from(document.querySelectorAll(".apps-settings-pane .settings-inner-tab"))[1]?.click();
      await waitForCondition(
        () => Boolean(customSettingsRow()),
        3000,
        "custom app row after sandbox imports"
      );

      customRow = customSettingsRow();
      customRow.querySelector('[data-tooltip-id="settings.action.edit"]').click();
      await waitForCondition(
        () => Boolean(document.querySelector(".settings-editor-modal")),
        3000,
        "custom app URL editor"
      );
      editInputs = Array.from(document.querySelectorAll(".settings-editor-modal input"));
      const editedUrl = new URL(fixtureUrl);
      editedUrl.searchParams.set("custom-edit", "1");
      editInputs[2].value = editedUrl.href;
      document.querySelector(".settings-editor-modal .settings-dialog-actions .button-primary").click();
      await waitForCondition(
        () => !document.querySelector(".settings-editor-modal"),
        15000,
        "custom app URL save"
      );
      await waitForCondition(
        () => !customFrameBeforeEdit.iframe.isConnected
          && Array.from(document.querySelectorAll(".chat-frame"))
            .some((iframe) => iframe.dataset.instanceId === customFrameBeforeEdit.instanceId),
        10000,
        "custom app URL frame replacement"
      );
      await quietWindow();
      customFrame = Array.from(document.querySelectorAll(".chat-frame"))
        .find((iframe) => iframe.dataset.instanceId === customFrameBeforeEdit.instanceId);
      await waitForCondition(
        () => customFrame?.getAttribute("src") === editedUrl.href,
        10000,
        "edited custom app frame src"
      );
      await quietWindow();
      const urlEdit = {
        targetReplaced: customFrame !== customFrameBeforeEdit.iframe,
        contentWindowReplaced: customFrame?.contentWindow !== customFrameBeforeEdit.contentWindow,
        bindingReplaced: (customFrame?.dataset.frameBindingId || "") !== customFrameBeforeEdit.binding,
        editedSrc: customFrame?.getAttribute("src") === editedUrl.href,
        unaffectedFrames: frameStatus(Array.from(document.querySelectorAll(".chat-frame")))
      };

      customRow = customSettingsRow();
      const deleteButton = customRow.querySelector('[data-tooltip-id="settings.action.delete"]');
      if (!deleteButton) throw new Error("custom app retention probe found no delete action");
      const originalConfirm = window.confirm;
      window.confirm = () => true;
      try {
        deleteButton.click();
        await waitForCondition(
          () => !Array.from(document.querySelectorAll(".custom-config-row"))
            .some((row) => row.dataset.customAppId === customApp.id),
          15000,
          "custom app deletion"
        );
      } finally {
        window.confirm = originalConfirm;
      }
      await quietWindow();
      const finalFrames = Array.from(document.querySelectorAll(".chat-frame"));
      const deletionFrames = frameStatus(finalFrames);
      document.querySelector(".settings-modal .modal-header .icon-button")?.click();
      return {
        ok: true,
        gridSame: document.querySelector(".main-grid") === grid,
        frameCountBefore: before.length,
        frameCountAfter: afterFrames.length,
        fullscreenPreserved: (document.querySelector(".chat-card.fullscreen")?.dataset.groupId || "") === fullscreenGroupId,
        frames: additionFrames,
        usedAppEdits: { metadataEdit, sandboxEdit, urlEdit },
        usedAppDeletion: {
          customFrameRemoved: !customFrame.isConnected
            && !finalFrames.some((iframe) => iframe.dataset.appId === customApp.id),
          frameCountAfter: finalFrames.length,
          fullscreenPreserved: (document.querySelector(".chat-card.fullscreen")?.dataset.groupId || "") === fullscreenGroupId,
          unaffectedFrames: deletionFrames
        }
      };
    } finally {
      trackedCustomFrame?.removeEventListener("load", trackedCustomLoadHandler);
      for (const item of before) item.iframe.removeEventListener("load", item.onload);
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
  const loopback = await loopbackContentHandshake();
  const customAppFrameRetention = await customAppFrameRetentionProbe();
  const trusted = await request({
    source: "chatclub",
    action: "dispatchTrustedClick",
    tabId: loopback.tabId,
    expectedFrameId: loopback.boundFrameId,
    expectedBindingId: loopback.ready?.frameBindingId,
    expectedBrowserDocumentId: loopback.boundBrowserDocumentId,
    expectedBridgeDocumentId: loopback.ready?.documentId,
    expectedFrameHref: loopback.fixtureUrl,
    x: -1,
    y: -1,
    reason: "browser smoke must reject before debugger attachment"
  });
  return {
    shell: Boolean(document.querySelector("#app .app-shell")),
    fatalPre: Boolean(document.querySelector("#app > pre")),
    configInfo: await request({ source: "chatclub", action: "getConfigInfo" }),
    lazy,
    loopback,
    customAppFrameRetention,
    trusted
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
    let page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`chrome-extension://${extensionId}/options.html`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.locator("#app .app-shell").waitFor({ state: "attached", timeout: 25000 });
    await page.locator(".settings-modal").waitFor({ state: "attached", timeout: 25000 });
    assert(
      await page.locator(".settings-modal .settings-tab.active").count() === 1,
      "chromium: options page did not open one active Settings section"
    );
    await page.goto(`chrome-extension://${extensionId}/chatClub.html`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.locator(".chat-frame").nth(1).waitFor({ state: "attached", timeout: 25000 }).catch(async (error) => {
      const bodyText = await page.locator("body").innerText().catch(() => "");
      throw new Error(`${error.message}\npage errors: ${pageErrors.join(" | ") || "none"}\nbody: ${bodyText.slice(-2000)}`);
    });
    const workspaceSessionProbe = await chromiumWorkspaceSessionRecoveryProbe(context, page, fixtureUrl, pageErrors);
    page = workspaceSessionProbe.page;
    const result = await page.evaluate(`(${pageProbe})(${JSON.stringify(fixtureUrl)})`);
    result.workspaceSession = workspaceSessionProbe.result;
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
    const optionsUrl = new URL("options.html", extensionUrl).href;
    await driver.setContext(firefox.Context.CONTENT);
    await driver.get(optionsUrl);
    await driver.wait(async () => driver.findElements(selenium.By.css("#app .app-shell")).then((items) => items.length > 0), 25000);
    await driver.wait(async () => driver.findElements(selenium.By.css(".settings-modal")).then((items) => items.length > 0), 25000);
    assert(
      await driver.findElements(selenium.By.css(".settings-modal .settings-tab.active")).then((items) => items.length) === 1,
      "firefox: options page did not open one active Settings section"
    );
    await driver.get(extensionUrl);
    await driver.wait(async () => driver.findElements(selenium.By.css("#app .app-shell")).then((items) => items.length > 0), 25000);
    const result = await driver.executeAsyncScript(`
      const done = arguments[arguments.length - 1];
      (${pageProbe})(${JSON.stringify(fixtureUrl)}).then(done, (error) => done({ probeError: error && error.message ? error.message : String(error) }));
    `);
    assert(!result?.probeError, `firefox: page probe failed: ${result?.probeError}`);
    assertRuntimeResult(result, "firefox", {
      expectFirefoxFileFallback: browserVersion.split(".", 1)[0] === "136"
    });
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
