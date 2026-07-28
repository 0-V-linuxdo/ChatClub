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
    confirmationWaits: 0,
    confirmationOpen: ["dialog", "both"].includes(options.baselineConfirmation),
    confirmationButtonOpen: ["button", "both"].includes(options.baselineConfirmation)
  };
  const trigger = { id: "grok-conversation-menu" };
  return {
    state,
    topRightMenuTrigger(...args) {
      state.triggerLookups += 1;
      const flattened = args.flatMap((value) => Array.isArray(value) ? value : (value?.labels || []));
      assert.ok(flattened.some((label) => /more|menu|更多|菜单/i.test(label)), "Grok must resolve a conversation menu trigger");
      return options.trigger === false ? null : trigger;
    },
    async openTriggerAndClickDelete(actualTrigger, labels) {
      assert.equal(actualTrigger, trigger);
      assert.ok(labels.includes("Delete"), "Grok must require an explicit Delete action");
      assert.ok(labels.includes("删除"), "Grok must retain the explicit localized Delete action");
      if (options.explicitDelete === false) return false;
      state.deleteActivations += 1;
      state.confirmationOpen = options.confirmation === "closed" || options.confirmation === "stuck";
      state.confirmationButtonOpen = state.confirmationOpen || options.confirmation === "button-stuck";
      return true;
    },
    async clickDeleteConfirmIfAppears(appearTimeoutMs, closeTimeoutMs) {
      state.confirmationWaits += 1;
      assert.equal(appearTimeoutMs, 900, "Grok confirmation must use the short optional observation window");
      assert.equal(closeTimeoutMs, 5200, "an observed confirmation must retain the bounded close window");
      if (options.confirmation === "closed") {
        state.confirmationOpen = false;
        state.confirmationButtonOpen = false;
        return { appeared: true, confirmed: true };
      }
      if (options.confirmation === "stuck" || options.confirmation === "button-stuck") {
        return { appeared: true, confirmed: false };
      }
      state.confirmationOpen = false;
      state.confirmationButtonOpen = false;
      return { appeared: false, confirmed: false };
    },
    findDeleteConfirmButton() {
      return state.confirmationButtonOpen ? { id: "grok-delete-confirm" } : null;
    },
    deleteDialogRoots() {
      return state.confirmationOpen ? [{ id: "grok-delete-confirmation" }] : [];
    }
  };
}

function nativeGrokDelete(source, behavior) {
  const body = section(
    source,
    "  async function deleteGrokThread()",
    "\n  const GEMINI_DELETE_CONVERSATION_ACTION_SELECTOR",
    "native Grok delete runner"
  );
  const factory = new Function(
    "topRightMenuTrigger",
    "openTriggerAndClickDelete",
    "clickDeleteConfirmIfAppears",
    "findDeleteConfirmButton",
    "deleteDialogRoots",
    "deleteResult",
    `"use strict"; ${body}; return deleteGrokThread;`
  );
  return factory(
    behavior.topRightMenuTrigger,
    behavior.openTriggerAndClickDelete,
    behavior.clickDeleteConfirmIfAppears,
    behavior.findDeleteConfirmButton,
    behavior.deleteDialogRoots,
    (ok, site, reason = "") => ({ ok, site, ...(reason ? { reason } : {}) })
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
  return router({ id: siteId, name: siteId, builtIn: true }, { appId: siteId });
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
    "clickDeleteConfirmIfAppears",
    "findDeleteConfirmButton",
    "deleteDialogRoots",
    "result",
    `"use strict"; ${body}; return deleteTopRight;`
  );
  const run = factory(
    behavior.topRightMenuTrigger,
    behavior.openTriggerAndClickDelete,
    behavior.clickDeleteConfirmIfAppears,
    behavior.findDeleteConfirmButton,
    behavior.deleteDialogRoots,
    (ok, reason = "") => ({ ok, site: siteId, ...(reason ? { reason } : {}) })
  );
  return () => run(
    siteId,
    ["Delete Chat", "Delete chat", "Delete", "删除聊天", "删除"],
    ["More", "More actions", "Menu", "Options", "更多", "菜单"]
  );
}

(async () => {
  const nativeSource = read("content-src/capabilities/delete-sites.js");
  const nativeRouterSource = read("content-src/capabilities/delete-runtime.js");
  const standaloneSource = read("build-src/topic-delete-userscript-engine-sites.js");

  const nativeSection = section(
    nativeSource,
    "  async function deleteGrokThread()",
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
    assert.match(source, /clickDeleteConfirmIfAppears\(900, 5200\)/, `${name}: Grok confirmation must be optional and briefly observed`);
    assert.match(source, /findDeleteConfirmButton\(\) \|\| deleteDialogRoots\(\)\.length/, `${name}: either a visible confirmation button or dialog root must fail closed`);
    assert.match(source, /deleteDialogRoots\(\)\.length/, `${name}: a confirmation left open must fail closed`);
    assert.doesNotMatch(source, /clickDeleteConfirmIfPresent\(5200\)/, `${name}: Grok must not require a confirmation button`);
    assert.ok(
      source.indexOf("findDeleteConfirmButton() || deleteDialogRoots().length")
        < source.indexOf("topRightMenuTrigger"),
      `${name}: a confirmation present before this attempt must fail before menu discovery`
    );
  }
  assert.match(nativeRouterSource, /siteId === "grokMirror"[\s\S]*deleteGrokThread\(payload\)[\s\S]*site: "grokMirror"/, "native Grok Mirror must share the audited Grok runner and preserve its site identity");
  assert.match(standaloneSource, /grok: \(\) => deleteTopRight\("grok"/, "standalone Grok must use the optional-confirm runner");
  assert.match(standaloneSource, /grokMirror: \(\) => deleteTopRight\("grokMirror"/, "standalone Grok Mirror must use the optional-confirm runner");

  const cases = [
    {
      name: "confirmation predates the attempt",
      options: { baselineConfirmation: "both" },
      expected: {
        ok: false,
        reason: "unverified delete confirmation is already open",
        deleteActivations: 0,
        confirmationWaits: 0,
        triggerLookups: 0
      }
    },
    {
      name: "no confirmation",
      options: { confirmation: "none" },
      expected: { ok: true, deleteActivations: 1, confirmationWaits: 1 }
    },
    {
      name: "optional confirmation closes",
      options: { confirmation: "closed" },
      expected: { ok: true, deleteActivations: 1, confirmationWaits: 1 }
    },
    {
      name: "optional confirmation remains open",
      options: { confirmation: "stuck" },
      expected: { ok: false, reason: "delete confirmation did not close", deleteActivations: 1, confirmationWaits: 1 }
    },
    {
      name: "confirmation button remains without a recognized dialog root",
      options: { confirmation: "button-stuck" },
      expected: { ok: false, reason: "delete confirmation did not close", deleteActivations: 1, confirmationWaits: 1 }
    },
    {
      name: "no explicit Delete action",
      options: { explicitDelete: false },
      expected: { ok: false, reason: "delete menu item not found", deleteActivations: 0, confirmationWaits: 0 }
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
        const value = await run();
        assert.equal(value.ok, testCase.expected.ok, `${mode}/${siteId}: ${testCase.name}`);
        assert.equal(value.site, siteId, `${mode}/${siteId}: site identity must be preserved`);
        assert.equal(value.reason, testCase.expected.reason, `${mode}/${siteId}: ${testCase.name} reason`);
        assert.equal(behavior.state.deleteActivations, testCase.expected.deleteActivations, `${mode}/${siteId}: ${testCase.name} Delete activations`);
        assert.equal(behavior.state.confirmationWaits, testCase.expected.confirmationWaits, `${mode}/${siteId}: ${testCase.name} confirmation waits`);
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
