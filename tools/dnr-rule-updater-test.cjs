#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { functionSource } = require("./function-source.cjs");

const root = path.resolve(__dirname, "..");
const runtimeSource = fs.readFileSync(path.join(root, "background/runtime.js"), "utf8");
const context = vm.createContext({ Promise, TypeError, queueMicrotask });
vm.runInContext(`
  ${functionSource(runtimeSource, "normalizedPreferredTabIds")}
  ${functionSource(runtimeSource, "createDnrRuleUpdater")}
  ${functionSource(runtimeSource, "replaceDnrRules")}
  globalThis.createUpdater = createDnrRuleUpdater;
  globalThis.replaceRules = replaceDnrRules;
`, context);

(async () => {
  const events = [];
  const releases = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const updater = context.createUpdater(async (tabIds) => {
    const label = tabIds.join(",");
    events.push(`start:${label}`);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => { releases.push(resolve); });
    inFlight -= 1;
    events.push(`finish:${label}`);
    return tabIds;
  });

  const first = updater(7);
  const second = updater(3);
  const invalidIds = [updater(null), updater(undefined), updater("4"), updater(false)];
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events, ["start:3,7"], "same-turn frame preparations must share one DNR update batch");
  const third = updater(11);
  const fourth = updater(9);
  assert.deepEqual(events, ["start:3,7"], "a later batch must wait for the active DNR replacement");
  releases.shift()();
  assert.deepEqual(JSON.parse(JSON.stringify(await first)), [3, 7]);
  assert.deepEqual(JSON.parse(JSON.stringify(await second)), [3, 7]);
  for (const result of await Promise.all(invalidIds)) {
    assert.deepEqual(JSON.parse(JSON.stringify(result)), [3, 7], "non-integer tab IDs must be ignored");
  }
  await new Promise((resolve) => { setImmediate(resolve); });
  assert.deepEqual(events, ["start:3,7", "finish:3,7", "start:9,11"]);
  releases.shift()();
  assert.deepEqual(JSON.parse(JSON.stringify(await third)), [9, 11]);
  assert.deepEqual(JSON.parse(JSON.stringify(await fourth)), [9, 11]);
  assert.equal(maxInFlight, 1, "DNR rule replacement must never overlap");

  let attempts = 0;
  const recoveringUpdater = context.createUpdater(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("expected first failure");
    return "recovered";
  });
  await assert.rejects(recoveringUpdater(21), /expected first failure/);
  assert.equal(await recoveringUpdater(22), "recovered", "a failed update must not poison later frame preparations");

  const sessionRule = { id: 1, condition: { tabIds: [17] } };
  const dynamicRule = { id: 1, condition: { initiatorDomains: ["extension-id"] } };
  const fallbackCalls = [];
  const fallbackSessionCalls = [];
  const fallbackResult = await context.replaceRules({
    getDynamicRules: async () => [{ id: 91 }],
    getSessionRules: async () => [{ id: 92 }],
    updateSessionRules: async (details) => {
      fallbackSessionCalls.push(details);
      if (fallbackSessionCalls.length === 1) throw new Error("session rule replacement unavailable");
    },
    updateDynamicRules: async (details) => { fallbackCalls.push(details); }
  }, [sessionRule], [dynamicRule]);
  assert.equal(fallbackResult, "dynamic");
  assert.deepEqual(
    JSON.parse(JSON.stringify(fallbackSessionCalls)),
    [
      { removeRuleIds: [92], addRules: [sessionRule] },
      { removeRuleIds: [92], addRules: [] }
    ],
    "failed session replacement must attempt removal-only cleanup before dynamic fallback"
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(fallbackCalls)),
    [{ removeRuleIds: [91], addRules: [dynamicRule] }],
    "a rejected session update must install the separately built dynamic-safe rules"
  );
  assert.equal(
    fallbackCalls[0].addRules.some((rule) => Object.hasOwn(rule.condition, "tabIds")),
    false,
    "dynamic fallback rules must never contain session-only tabIds"
  );

  let cleanupAttempts = 0;
  const warnings = [];
  const sessionResult = await context.replaceRules({
    getDynamicRules: async () => [{ id: 81 }],
    getSessionRules: async () => [{ id: 82 }],
    updateSessionRules: async () => {},
    updateDynamicRules: async () => {
      cleanupAttempts += 1;
      throw new Error("cleanup unavailable");
    }
  }, [sessionRule], [dynamicRule], (message) => warnings.push(message));
  assert.equal(sessionResult, "session", "dynamic cleanup failure must not discard active session rules");
  assert.equal(cleanupAttempts, 1, "dynamic cleanup must not be mistaken for a session-install failure");
  assert.match(warnings.join("\n"), /stale dynamic rules could not be removed/);

  let failTabQuery = false;
  let tabQueryResult = [
    { id: 12, url: "chrome-extension://extension-id/chatClub.html" },
    { id: 99, url: "https://example.com/" }
  ];
  const tabContext = vm.createContext({
    console: { warn() {} },
    chrome: {
      runtime: { getURL: () => "chrome-extension://extension-id/" },
      tabs: {
        query: async () => {
          if (failTabQuery) throw new Error("tab query unavailable");
          return tabQueryResult;
        }
      }
    }
  });
  vm.runInContext(`
    const APP_NAME = "Test";
    const knownExtensionPageTabIds = new Set();
    const candidateExtensionPageTabIds = new Set();
    const revokedExtensionPageTabIds = new Set();
    const extensionPageTabRevisions = new Map();
    const updateDnrRules = () => Promise.resolve();
    ${functionSource(runtimeSource, "advanceExtensionPageTabRevision")}
    ${functionSource(runtimeSource, "rememberKnownExtensionPageTab")}
    ${functionSource(runtimeSource, "discoverExtensionPageTab")}
    ${functionSource(runtimeSource, "normalizedPreferredTabIds")}
    ${functionSource(runtimeSource, "currentExtensionPageTabIds")}
    ${functionSource(runtimeSource, "forgetKnownExtensionPageTab")}
    globalThis.currentTabIds = currentExtensionPageTabIds;
    globalThis.rememberTabId = rememberKnownExtensionPageTab;
    globalThis.revokeTabId = forgetKnownExtensionPageTab;
  `, tabContext);
  let releaseFreshStaleQuery;
  tabQueryResult = new Promise((resolve) => { releaseFreshStaleQuery = resolve; });
  const freshStaleQuery = tabContext.currentTabIds([]);
  tabContext.revokeTabId(31);
  releaseFreshStaleQuery([
    { id: 12, url: "chrome-extension://extension-id/chatClub.html" },
    { id: 31, url: "chrome-extension://extension-id/chatClub.html" }
  ]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(await freshStaleQuery)),
    [12],
    "an unknown lifecycle-negative event must invalidate an older extension-tab query result"
  );
  tabContext.rememberTabId(31);
  tabQueryResult = [
    { id: 12, url: "chrome-extension://extension-id/chatClub.html" },
    { id: 99, url: "https://example.com/" }
  ];
  assert.deepEqual(
    JSON.parse(JSON.stringify(await tabContext.currentTabIds([31]))),
    [12, 31],
    "a verified sender tab must be unioned with discovered extension tabs"
  );
  let releaseStaleQuery;
  tabQueryResult = new Promise((resolve) => { releaseStaleQuery = resolve; });
  const staleQuery = tabContext.currentTabIds([31]);
  tabContext.revokeTabId(31);
  releaseStaleQuery([
    { id: 12, url: "chrome-extension://extension-id/chatClub.html" },
    { id: 31, url: "chrome-extension://extension-id/chatClub.html" }
  ]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(await staleQuery)),
    [12],
    "a stale extension-tab query result must not override a newer lifecycle revocation"
  );
  let releaseStaleExternalQuery;
  tabQueryResult = new Promise((resolve) => { releaseStaleExternalQuery = resolve; });
  const staleExternalQuery = tabContext.currentTabIds([]);
  tabContext.rememberTabId(31);
  releaseStaleExternalQuery([
    { id: 12, url: "chrome-extension://extension-id/chatClub.html" },
    { id: 31, url: "https://example.com/" }
  ]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(await staleExternalQuery)),
    [12, 31],
    "a stale external-tab query result must not override newer verified extension state"
  );
  tabQueryResult = [
    { id: 12, url: "chrome-extension://extension-id/chatClub.html" },
    { id: 31, url: "https://example.com/" }
  ];
  assert.deepEqual(
    JSON.parse(JSON.stringify(await tabContext.currentTabIds([31]))),
    [12],
    "an explicitly observed external tab must revoke an earlier preferred extension tab ID"
  );
  failTabQuery = true;
  assert.deepEqual(
    JSON.parse(JSON.stringify(await tabContext.currentTabIds([31, 44]))),
    [12, 44],
    "query failure must retain valid IDs without reviving a revoked external tab"
  );

  console.log("DNR rule updater serialization: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
