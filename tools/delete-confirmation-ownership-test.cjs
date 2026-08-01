#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

(async () => {
  const previousLocation = globalThis.location;
  globalThis.location = { href: "https://example.com/chat/topic-1" };
  try {
  const { createDeleteSitesCapability } = await import(pathToFileURL(
    path.join(root, "content-src/capabilities/delete-sites.js")
  ).href);

  for (const mode of ["button", "dialog-only"]) {
    for (const [site, method] of [
      ["chatgpt", "deleteChatGptThread"],
      ["kagi", "deleteKagiThread"],
      ["gemini", "deleteGeminiThread"]
    ]) {
      let confirmationClicks = 0;
      let destructiveActivations = 0;
      const rootNode = { isConnected: true };
      const capability = createDeleteSitesCapability({
        findDeleteConfirmButton() {
          return mode === "button" ? { isConnected: true } : null;
        },
        findDeleteConfirmButtonInfo() {
          throw new Error("a pre-open confirmation must be rejected before ownership lookup");
        },
        deleteDialogRoots() {
          return mode === "dialog-only" ? [rootNode] : [];
        },
        async clickDeleteConfirmIfPresent() {
          confirmationClicks += 1;
          return true;
        },
        dispatchDeleteKeyboardShortcut() {
          destructiveActivations += 1;
          return true;
        },
        deleteClick() {
          destructiveActivations += 1;
          return true;
        },
        deleteClickLayout() {
          destructiveActivations += 1;
          return true;
        },
        deleteResult(ok, resultSite, reason = "", extra = {}) {
          return { ok, site: resultSite, reason, ...extra };
        }
      });
      const value = await capability[method]({
        deleteAttemptId: `attempt-${site}-${mode}`,
        expectedDeleteIdentity: { provider: site, id: "topic-1" }
      });
      assert.equal(value.ok, false, `${site}/${mode} must fail closed`);
      assert.match(value.reason, /unverified delete confirmation is already open/);
      assert.equal(confirmationClicks, 0, `${site}/${mode} must not adopt the existing confirmation`);
      assert.equal(destructiveActivations, 0, `${site}/${mode} must not begin another destructive action`);
    }
  }

  {
    let open = false;
    const rootNode = {
      isConnected: true,
      contains(node) { return node === button; }
    };
    const button = { isConnected: true };
    let guardedConfirmClicks = 0;
    const capability = createDeleteSitesCapability({
      findDeleteConfirmButton() { return open ? button : null; },
      findDeleteConfirmButtonInfo() { return open ? { element: button, root: rootNode } : null; },
      deleteDialogRoots() { return open ? [rootNode] : []; },
      visible() { return true; },
      dispatchDeleteKeyboardShortcut() { open = true; return true; },
      waitForModel(getter) { return Promise.resolve(getter()); },
      async clickDeleteConfirmIfPresent(_timeoutMs, guard) {
        assert.equal(guard(), true, "the exact action-owned dialog and button must still be current");
        guardedConfirmClicks += 1;
        open = false;
        return true;
      },
      deleteResult(ok, site, reason = "", extra = {}) { return { ok, site, reason, ...extra }; }
    });
    const value = await capability.deleteChatGptThread({
      deleteAttemptId: "attempt-owned-chatgpt",
      expectedDeleteIdentity: { provider: "chatgpt", id: "topic-1" }
    });
    assert.equal(value.ok, true, "an exact dialog created after this attempt's Delete action remains usable");
    assert.equal(guardedConfirmClicks, 1);
  }

  for (const [site, method] of [
    ["chatgpt", "deleteChatGptThread"],
    ["kagi", "deleteKagiThread"]
  ]) {
    globalThis.location.href = `https://example.com/chat/${site}-topic-1`;
    let open = false;
    let confirmationClicks = 0;
    const button = { isConnected: true };
    const rootNode = {
      isConnected: true,
      contains(node) { return node === button; }
    };
    const capability = createDeleteSitesCapability({
      findDeleteConfirmButton() { return open ? button : null; },
      findDeleteConfirmButtonInfo() { return open ? { element: button, root: rootNode } : null; },
      deleteDialogRoots() { return open ? [rootNode] : []; },
      visible() { return true; },
      dispatchDeleteKeyboardShortcut() {
        globalThis.location.href = `https://example.com/chat/${site}-topic-2`;
        open = true;
        return true;
      },
      waitForModel(getter) { return Promise.resolve(getter()); },
      async clickDeleteConfirmIfPresent() {
        confirmationClicks += 1;
        return true;
      },
      deleteResult(ok, resultSite, reason = "", extra = {}) { return { ok, site: resultSite, reason, ...extra }; }
    });
    const value = await capability[method]({
      deleteAttemptId: `attempt-route-${site}`,
      expectedDeleteIdentity: { provider: site, id: `${site}-topic-1` }
    });
    assert.equal(value.ok, false, `${site}: route change followed by a new dialog must fail closed`);
    assert.match(value.reason, /ownership is uncertain|conversation changed/);
    assert.equal(confirmationClicks, 0, `${site}: a dialog from the next route must never receive a confirm click`);
  }

  const standaloneSites = fs.readFileSync(path.join(root, "build-src/topic-delete-userscript-engine-sites.js"), "utf8");
  const standaloneCore = fs.readFileSync(path.join(root, "build-src/topic-delete-userscript-engine-core.js"), "utf8");
  const standaloneGemini = fs.readFileSync(path.join(root, "build-src/topic-delete-gemini-helpers.js"), "utf8");
  const nativeSites = fs.readFileSync(path.join(root, "content-src/capabilities/delete-sites.js"), "utf8");
  for (const [label, source] of [
    ["ChatGPT standalone", standaloneSites.slice(standaloneSites.indexOf("async function deleteChatGpt"), standaloneSites.indexOf("__CHATCLUB_DELETE_SITE_HELPERS__"))],
    ["Kagi standalone", standaloneSites.slice(standaloneSites.indexOf("async function deleteKagi"), standaloneSites.indexOf("async function deleteChatGpt"))],
    ["Gemini standalone", standaloneGemini.slice(standaloneGemini.indexOf("async function deleteGemini"))]
  ]) {
    assert.match(source, /deleteConfirmationAlreadyOpen\(\)/, `${label} must reject a pre-open dialog`);
    assert.doesNotMatch(source, /confirmedExisting|clickDeleteConfirmIfPresent\([^,)]*\)/, `${label} must not adopt an entry-time confirmation`);
  }
  for (const [label, source] of [
    ["native ChatGPT", nativeSites.slice(nativeSites.indexOf("async function deleteChatGptThread"), nativeSites.indexOf("const DELETE_MENU_ROOT_SELECTORS"))],
    ["native Kagi", nativeSites.slice(nativeSites.indexOf("async function deleteKagiThread"), nativeSites.indexOf("async function deleteChatGptThread"))],
    ["standalone ChatGPT", standaloneSites.slice(standaloneSites.indexOf("async function deleteChatGpt"), standaloneSites.indexOf("__CHATCLUB_DELETE_SITE_HELPERS__"))],
    ["standalone Kagi", standaloneSites.slice(standaloneSites.indexOf("async function deleteKagi"), standaloneSites.indexOf("async function deleteChatGpt"))]
  ]) {
    assert.match(source, /deleteAttemptRouteGuard/, `${label} must capture its starting route and attempt`);
    assert.match(source, /waitForOwnedDeleteConfirmation\([^\n]+attemptGuard\)/, `${label} must not adopt a confirmation after route ownership changes`);
    assert.match(source, /finishOwnedDeleteConfirmation\([^\n]+attemptGuard\)/, `${label} must retain route ownership through confirm activation and close observation`);
  }
  for (const source of [nativeSites, `${standaloneCore}\n${standaloneSites}`]) {
    assert.match(source, /href[^\n]+phase[^\n]+baseline|href,\s*phase,\s*baseline/, "trusted confirmation leases must retain their starting href");
    assert.match(source, /lease\.href === currentDeleteHref\(\)/, "trusted confirmation retries must reject a different route before adopting a dialog");
  }
  const nativeGeminiActivation = nativeSites.slice(
    nativeSites.indexOf("async function activateGeminiDeleteItem"),
    nativeSites.indexOf("async function deleteGeminiThread")
  );
  const standaloneGeminiActivation = standaloneGemini.slice(
    standaloneGemini.indexOf("async function activateGeminiDeleteItem"),
    standaloneGemini.indexOf("async function tryGeminiDeleteFromTrigger")
  );
  assert.match(nativeGeminiActivation, /waitForOwnedDeleteConfirmation\(confirmationBaseline, hints, 3000, attemptGuard\)/, "native Gemini must bind confirmation discovery to its starting route and attempt");
  assert.match(nativeGeminiActivation, /finishOwnedDeleteConfirmation\("gemini", confirmation, hints, 6500, attemptGuard\)/, "native Gemini must retain route ownership while clicking confirmation");
  assert.match(standaloneGeminiActivation, /waitForOwnedDeleteConfirmation\(confirmationBaseline, 3000, attemptGuard\)/, "standalone Gemini must bind confirmation discovery to its starting route and attempt");
  assert.match(standaloneGeminiActivation, /finishOwnedDeleteConfirmation\(confirmation, 6500, attemptGuard\)/, "standalone Gemini must retain route ownership while clicking confirmation");
  for (const mode of ["native", "standalone"]) {
    let routeOwned = true;
    let confirmationOpen = false;
    let confirmationClicks = 0;
    const sharedContext = {
      deleteConfirmationAlreadyOpen: () => confirmationOpen,
      deleteDialogRoots: () => confirmationOpen ? [{}] : [],
      finishOwnedDeleteConfirmation: async () => { confirmationClicks += 1; return { ok: true }; },
      findGeminiDeleteMenuItem: () => null,
      armDeleteConfirmationLease: () => false
    };
    const context = mode === "native" ? {
      ...sharedContext,
      deleteResult: (ok, site, reason = "") => ({ ok, site, reason }),
      deleteClick: () => { routeOwned = false; confirmationOpen = true; return true; },
      deleteClickLayout: () => false,
      waitForOwnedDeleteConfirmation: async (_baseline, _hints, _timeout, guard) => {
        assert.equal(guard(), false, "native Gemini must reject the new route before ownership lookup");
        return null;
      },
      deleteResultWithTrustedMenuClick: (_site, reason) => ({ ok: false, site: "gemini", reason })
    } : {
      ...sharedContext,
      result: (ok, reason = "") => ({ ok, site: "gemini", reason }),
      geminiSimulateMenuClick: () => { routeOwned = false; confirmationOpen = true; return true; },
      clickAt: () => false,
      waitForOwnedDeleteConfirmation: async (_baseline, _timeout, guard) => {
        assert.equal(guard(), false, "standalone Gemini must reject the new route before ownership lookup");
        return null;
      },
      resultWithGeminiTrustedMenuClick: (reason) => ({ ok: false, site: "gemini", reason })
    };
    vm.runInNewContext(
      `"use strict"; ${mode === "native" ? nativeGeminiActivation : standaloneGeminiActivation}; globalThis.activation = activateGeminiDeleteItem;`,
      context,
      { filename: `${mode}-gemini-confirmation-fixture.js` }
    );
    const result = mode === "native"
      ? await context.activation({}, {}, {}, () => routeOwned)
      : await context.activation({}, {}, () => routeOwned);
    assert.equal(result.ok, false, `${mode} Gemini: route change followed by a new dialog must fail closed`);
    assert.match(result.reason, /ownership is uncertain/);
    assert.equal(confirmationClicks, 0, `${mode} Gemini: the next route's dialog must never receive a confirm click`);
  }

  console.log("ChatGPT, Kagi, and Gemini reject pre-open and cross-route delete confirmations: ok");
  } finally {
    if (previousLocation === undefined) delete globalThis.location;
    else globalThis.location = previousLocation;
  }
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
