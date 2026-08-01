#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

function section(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `${label} must remain directly testable`);
  return source.slice(start, end).trim();
}

function createBehavior(options = {}) {
  const state = {
    triggerLookups: 0,
    deleteActivations: 0,
    confirmationObservations: 0,
    ownedConfirmationFinishes: 0,
    confirmationOpen: ["dialog", "both"].includes(options.baselineConfirmation),
    confirmationButtonOpen: ["button", "both"].includes(options.baselineConfirmation)
  };
  const trigger = { id: "grok-conversation-menu" };
  const confirmationRoot = { id: "grok-delete-confirmation" };
  const confirmationButton = { id: "grok-delete-confirm" };
  const ownership = { root: confirmationRoot, button: confirmationButton };
  return {
    state,
    deleteAttemptRouteGuard(payload) {
      assert.equal(payload.deleteAttemptId, "attempt-grok");
      return () => options.routeChanged !== true;
    },
    deleteConfirmationAlreadyOpen() {
      return state.confirmationOpen || state.confirmationButtonOpen;
    },
    topRightMenuTrigger(...args) {
      state.triggerLookups += 1;
      const flattened = args.flatMap((value) => Array.isArray(value) ? value : (value?.labels || []));
      assert.ok(flattened.some((label) => /more|menu|更多|菜单/i.test(label)), "Grok must resolve a conversation menu trigger");
      return options.trigger === false ? null : trigger;
    },
    async openTriggerAndClickDelete(actualTrigger, labels, runOptions = {}) {
      assert.equal(actualTrigger, trigger);
      assert.ok(labels.includes("Delete"), "Grok must require an explicit Delete action");
      assert.ok(labels.includes("删除"), "Grok must retain the explicit localized Delete action");
      if (options.preActivationConcurrent) {
        state.confirmationOpen = true;
        state.confirmationButtonOpen = true;
        assert.equal(runOptions.guard(), false, "a dialog appearing before explicit Delete must invalidate the activation guard");
        return false;
      }
      assert.equal(runOptions.guard(), true, "the attempt, route, and clean confirmation baseline must guard explicit Delete");
      if (options.explicitDelete === false) return false;
      state.deleteActivations += 1;
      state.confirmationOpen = ["owned-close", "owned-stuck", "concurrent"].includes(options.confirmation);
      state.confirmationButtonOpen = state.confirmationOpen || options.confirmation === "button-only";
      return true;
    },
    async observeOptionalDeleteConfirmation(baseline, hintsOrGuard, guardOrTimeout, maybeTimeout) {
      state.confirmationObservations += 1;
      const attemptGuard = typeof hintsOrGuard === "function" ? hintsOrGuard : guardOrTimeout;
      const timeoutMs = maybeTimeout === undefined ? guardOrTimeout : maybeTimeout;
      assert.equal(timeoutMs, 900, "Grok confirmation must use the short optional observation window");
      assert.equal(baseline.has(confirmationRoot), false, "the action-owned dialog must be created after the baseline snapshot");
      if (options.confirmation === "concurrent" || options.confirmation === "button-only") {
        return { state: "unowned", ownership: null };
      }
      if (options.confirmation === "owned-close" || options.confirmation === "owned-stuck") {
        assert.equal(attemptGuard(), true);
        return { state: "owned", ownership };
      }
      return { state: "none", ownership: null };
    },
    async finishOwnedDeleteConfirmation(...args) {
      state.ownedConfirmationFinishes += 1;
      const native = typeof args[0] === "string";
      const site = native ? args[0] : "grok";
      const actualOwnership = native ? args[1] : args[0];
      const closeTimeoutMs = native ? args[3] : args[1];
      const attemptGuard = native ? args[4] : args[2];
      const allowTrustedFallback = native ? args[5] : args[3];
      assert.equal(site, "grok");
      assert.equal(actualOwnership, ownership);
      assert.equal(closeTimeoutMs, 5200);
      assert.equal(attemptGuard(), true);
      assert.equal(allowTrustedFallback, false, "Grok ownership failures must stay fail-closed");
      if (options.confirmation === "owned-close") {
        state.confirmationOpen = false;
        state.confirmationButtonOpen = false;
        return { ok: true, site };
      }
      return { ok: false, site, reason: "delete confirmation did not close" };
    },
    deleteDialogRoots() {
      return state.confirmationOpen ? [confirmationRoot] : [];
    }
  };
}

function nativeGrokDelete(source, behavior) {
  const body = section(
    source,
    "  async function deleteGrokThread(data = {})",
    "\n  const GEMINI_DELETE_CONVERSATION_ACTION_SELECTOR",
    "native Grok delete runner"
  );
  const factory = new Function(
    "topRightMenuTrigger",
    "openTriggerAndClickDelete",
    "observeOptionalDeleteConfirmation",
    "finishOwnedDeleteConfirmation",
    "grokDeleteAttemptRouteGuard",
    "deleteConfirmationAlreadyOpen",
    "deleteDialogRoots",
    "deleteResult",
    "officialHints",
    "officialSelectors",
    `"use strict"; ${body}; return deleteGrokThread;`
  );
  return factory(
    behavior.topRightMenuTrigger,
    behavior.openTriggerAndClickDelete,
    behavior.observeOptionalDeleteConfirmation,
    behavior.finishOwnedDeleteConfirmation,
    behavior.deleteAttemptRouteGuard,
    behavior.deleteConfirmationAlreadyOpen,
    behavior.deleteDialogRoots,
    (ok, site, reason = "") => ({ ok, site, ...(reason ? { reason } : {}) }),
    () => ({}),
    () => []
  );
}

function nativeGrokRouter(source, deleteGrokThread, siteId) {
  const body = section(
    source,
    "  function topicDeleteNativeSiteId",
    "\n  function normalizeTopicDeleteUserscriptResult",
    "native Delete Site router"
  );
  const factory = new Function(
    "location",
    "deleteChatGptThread",
    "deleteClaudeThread",
    "deleteGeminiThread",
    "deleteKagiThread",
    "deleteGrokThread",
    "deleteNotionThread",
    "deleteDeepSeekThread",
    "deleteResult",
    `"use strict"; ${body}; return topicDeleteNativeRunner;`
  );
  const unexpected = async () => {
    throw new Error("unexpected native Delete Site runner");
  };
  const router = factory(
    { hostname: siteId === "grokMirror" ? "gk.dairoot.cn" : "grok.com" },
    unexpected,
    unexpected,
    unexpected,
    unexpected,
    deleteGrokThread,
    unexpected,
    unexpected,
    (ok, site, reason = "") => ({ ok, site, ...(reason ? { reason } : {}) })
  );
  return router({ id: siteId, name: siteId, builtIn: true }, {
    appId: siteId,
    deleteAttemptId: "attempt-grok",
    expectedDeleteIdentity: { provider: "grok", id: "topic-1" }
  });
}

function standaloneGrokDelete(source, behavior, siteId) {
  const body = section(
    source,
    "  async function deleteTopRight(",
    "\n  const NOTION_DELETE_MENU_ROOT_SELECTOR",
    "standalone Grok delete runner"
  );
  const factory = new Function(
    "topRightMenuTrigger",
    "openTriggerAndClickDelete",
    "observeOptionalDeleteConfirmation",
    "finishOwnedDeleteConfirmation",
    "grokDeleteAttemptRouteGuard",
    "deleteConfirmationAlreadyOpen",
    "deleteDialogRoots",
    "result",
    `"use strict"; ${body}; return deleteTopRight;`
  );
  const run = factory(
    behavior.topRightMenuTrigger,
    behavior.openTriggerAndClickDelete,
    behavior.observeOptionalDeleteConfirmation,
    behavior.finishOwnedDeleteConfirmation,
    behavior.deleteAttemptRouteGuard,
    behavior.deleteConfirmationAlreadyOpen,
    behavior.deleteDialogRoots,
    (ok, reason = "") => ({ ok, site: siteId, ...(reason ? { reason } : {}) })
  );
  return (payload) => run(
    siteId,
    ["Delete Chat", "Delete chat", "Delete", "删除聊天", "删除"],
    ["More", "More actions", "Menu", "Options", "更多", "菜单"],
    [],
    payload
  );
}

(async () => {
  const nativeSource = read("content-src/capabilities/delete-sites.js");
  const nativeRouterSource = read("content-src/capabilities/delete-runtime.js");
  const standaloneCore = read("build-src/topic-delete-userscript-engine-core.js");
  const standaloneSource = read("build-src/topic-delete-userscript-engine-sites.js");

  const nativeSection = section(
    nativeSource,
    "  async function deleteGrokThread(data = {})",
    "\n  const GEMINI_DELETE_CONVERSATION_ACTION_SELECTOR",
    "native Grok delete runner"
  );
  const standaloneSection = section(
    standaloneSource,
    "  async function deleteTopRight(",
    "\n  const NOTION_DELETE_MENU_ROOT_SELECTOR",
    "standalone Grok delete runner"
  );
  for (const [name, source] of [["native", nativeSection], ["standalone", standaloneSection]]) {
    assert.match(source, /observeOptionalDeleteConfirmation\([^\n]+900\)/, `${name}: Grok confirmation must be optional and briefly observed`);
    assert.match(source, /confirmationBaseline = new Set\(deleteDialogRoots\(/, `${name}: dialog roots must be snapshotted before explicit Delete activation`);
    assert.match(source, /observation\.state === "unowned"/, `${name}: any unowned confirmation must fail closed`);
    assert.match(source, /finishOwnedDeleteConfirmation\([^\n]+5200[^\n]+false\)/, `${name}: only an owned confirmation may be clicked and Grok must not create an unbound trusted fallback`);
    assert.match(source, /grokDeleteAttemptRouteGuard/, `${name}: confirmation ownership must be bound to the exact Grok target, attempt, and route`);
    assert.ok(
      source.indexOf("deleteConfirmationAlreadyOpen(")
        < source.indexOf("topRightMenuTrigger"),
      `${name}: a confirmation present before this attempt must fail before menu discovery`
    );
  }
  assert.match(nativeRouterSource, /siteId === "grokMirror"[\s\S]*deleteGrokThread\(nativePayload\)[\s\S]*site: "grokMirror"/, "native Grok Mirror must share the audited Grok runner and preserve its site identity");
  assert.match(standaloneSource, /grok: \(payload\) => deleteTopRight\("grok"/, "standalone Grok must pass the attempt payload into the optional-confirm runner");
  assert.match(standaloneSource, /grokMirror: \(payload\) => deleteTopRight\("grokMirror"/, "standalone Grok Mirror must pass the attempt payload into the optional-confirm runner");

  for (const mode of ["native", "standalone"]) {
    const routeGuardSource = mode === "native"
      ? section(nativeSource, "  const deleteAttemptIdentity", "\n  const armDeleteConfirmationLease", "native Grok attempt-route guard")
      : section(standaloneCore, "  function deleteAttemptIdentity", "\n  function armDeleteConfirmationLease", "standalone Grok attempt-route guard");
    const routeLocation = { href: "https://grok.com/c/topic-1" };
    const routeGuardHelpers = new Function(
      "location",
      "URL",
      `"use strict"; ${routeGuardSource}; return { grokDeleteAttemptRouteGuard };`
    )(routeLocation, URL);
    const payload = {
      deleteAttemptId: "attempt-grok-route",
      expectedDeleteIdentity: { provider: "grok", id: "topic-1" }
    };
    const routeGuard = routeGuardHelpers.grokDeleteAttemptRouteGuard(payload);
    assert.equal(routeGuard?.(), true, `${mode}: exact Grok target and route must own the attempt guard`);
    routeLocation.href = "https://grok.com/c/topic-2";
    assert.equal(routeGuard(), false, `${mode}: route changes must invalidate the attempt guard`);
    routeLocation.href = "https://grok.com/c/topic-1";
    assert.equal(routeGuardHelpers.grokDeleteAttemptRouteGuard({
      ...payload,
      expectedDeleteIdentity: { provider: "grok", id: "topic-2" }
    }), null, `${mode}: a mismatched target id must not create an attempt guard`);
    assert.equal(routeGuardHelpers.grokDeleteAttemptRouteGuard({
      ...payload,
      expectedDeleteIdentity: { provider: "deepseek", id: "topic-1" }
    }), null, `${mode}: a mismatched provider must not create an attempt guard`);

    const helperSource = mode === "native"
      ? section(nativeSource, "  const sameDeleteConfirmationRoot", "\n  const waitForOwnedDeleteConfirmation", "native confirmation ownership helpers")
      : section(standaloneCore, "  function sameDeleteConfirmationRoot", "\n  function waitForOwnedDeleteConfirmation", "standalone confirmation ownership helpers");
    const realButton = { isConnected: true };
    const fakeButton = { isConnected: true };
    const realRoot = {
      isConnected: true,
      contains(node) { return node === realButton; }
    };
    const fakeRoot = {
      isConnected: true,
      contains(node) { return node === fakeButton; }
    };
    const state = { roots: [realRoot], button: realButton, root: realRoot };
    const helpers = new Function(
      "deleteDialogRoots",
      "findDeleteConfirmButtonInfo",
      "visible",
      `"use strict"; ${helperSource}; return { deleteConfirmationOwnership, deleteConfirmationOwnershipIsCurrent };`
    )(
      () => state.roots,
      () => mode === "native"
        ? { element: state.button, root: state.root }
        : { node: state.button, root: state.root },
      () => true
    );
    const attemptGuard = () => true;
    const owned = helpers.deleteConfirmationOwnership(new Set(), mode === "native" ? {} : attemptGuard, mode === "native" ? attemptGuard : undefined);
    assert.equal(owned?.root, realRoot, `${mode}: a unique post-baseline root may be owned`);
    state.roots = [realRoot, fakeRoot];
    const ambiguous = helpers.deleteConfirmationOwnership(new Set(), mode === "native" ? {} : attemptGuard, mode === "native" ? attemptGuard : undefined);
    assert.equal(ambiguous, null, `${mode}: a concurrent disjoint fake dialog must prevent ownership`);
    assert.equal(
      helpers.deleteConfirmationOwnershipIsCurrent(owned, mode === "native" ? {} : attemptGuard, mode === "native" ? attemptGuard : undefined),
      false,
      `${mode}: a concurrent fake dialog appearing before click must invalidate the exact ownership guard`
    );
    state.roots = [realRoot];
    assert.equal(
      helpers.deleteConfirmationOwnership(new Set([realRoot]), mode === "native" ? {} : attemptGuard, mode === "native" ? attemptGuard : undefined),
      null,
      `${mode}: a root present in the pre-Delete snapshot must never be adopted`
    );
  }

  const cases = [
    {
      name: "confirmation predates the attempt",
      options: { baselineConfirmation: "both" },
      expected: {
        ok: false,
        reason: "unverified delete confirmation is already open",
        deleteActivations: 0,
        confirmationObservations: 0,
        triggerLookups: 0
      }
    },
    {
      name: "no confirmation",
      options: { confirmation: "none" },
      expected: { ok: true, deleteActivations: 1, confirmationObservations: 1, ownedConfirmationFinishes: 0 }
    },
    {
      name: "optional confirmation closes",
      options: { confirmation: "owned-close" },
      expected: { ok: true, deleteActivations: 1, confirmationObservations: 1, ownedConfirmationFinishes: 1 }
    },
    {
      name: "optional confirmation remains open",
      options: { confirmation: "owned-stuck" },
      expected: { ok: false, reason: "delete confirmation did not close", deleteActivations: 1, confirmationObservations: 1, ownedConfirmationFinishes: 1 }
    },
    {
      name: "confirmation button has no owned dialog root",
      options: { confirmation: "button-only" },
      expected: { ok: false, reason: "delete confirmation ownership is uncertain", deleteActivations: 1, confirmationObservations: 1, ownedConfirmationFinishes: 0 }
    },
    {
      name: "concurrent fake confirmation makes ownership ambiguous",
      options: { confirmation: "concurrent" },
      expected: { ok: false, reason: "delete confirmation ownership is uncertain", deleteActivations: 1, confirmationObservations: 1, ownedConfirmationFinishes: 0 }
    },
    {
      name: "concurrent fake confirmation appears before explicit Delete",
      options: { preActivationConcurrent: true },
      expected: { ok: false, reason: "unverified delete confirmation appeared before delete activation", deleteActivations: 0, confirmationObservations: 0, ownedConfirmationFinishes: 0 }
    },
    {
      name: "no explicit Delete action",
      options: { explicitDelete: false },
      expected: { ok: false, reason: "delete menu item not found", deleteActivations: 0, confirmationObservations: 0, ownedConfirmationFinishes: 0 }
    }
  ];

  for (const siteId of ["grok", "grokMirror"]) {
    for (const mode of ["native", "standalone"]) {
      for (const testCase of cases) {
        const behavior = createBehavior(testCase.options);
        let run;
        if (mode === "native") {
          const nativeDelete = nativeGrokDelete(nativeSource, behavior);
          run = nativeGrokRouter(nativeRouterSource, nativeDelete, siteId);
        } else {
          run = standaloneGrokDelete(standaloneSource, behavior, siteId);
        }
        assert.equal(typeof run, "function", `${mode}/${siteId}: a built-in runner must be selected`);
        const value = await run({
          deleteAttemptId: "attempt-grok",
          expectedDeleteIdentity: { provider: "grok", id: "topic-1" }
        });
        assert.equal(value.ok, testCase.expected.ok, `${mode}/${siteId}: ${testCase.name}`);
        assert.equal(value.site, siteId, `${mode}/${siteId}: site identity must be preserved`);
        assert.equal(value.reason, testCase.expected.reason, `${mode}/${siteId}: ${testCase.name} reason`);
        assert.equal(behavior.state.deleteActivations, testCase.expected.deleteActivations, `${mode}/${siteId}: ${testCase.name} Delete activations`);
        assert.equal(behavior.state.confirmationObservations, testCase.expected.confirmationObservations, `${mode}/${siteId}: ${testCase.name} confirmation observations`);
        assert.equal(behavior.state.ownedConfirmationFinishes, testCase.expected.ownedConfirmationFinishes || 0, `${mode}/${siteId}: ${testCase.name} owned confirmation finishes`);
        if (testCase.expected.triggerLookups !== undefined) {
          assert.equal(behavior.state.triggerLookups, testCase.expected.triggerLookups, `${mode}/${siteId}: ${testCase.name} trigger lookups`);
        }
      }
    }
  }

  console.log("Grok and Grok Mirror optional delete-confirmation behavior: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
