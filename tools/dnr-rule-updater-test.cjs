#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { functionSource } = require("./function-source.cjs");

const root = path.resolve(__dirname, "..");
const runtimeSource = fs.readFileSync(path.join(root, "background/runtime.js"), "utf8");
const runtimeConfigSource = fs.readFileSync(path.join(root, "background/runtime-config-application.js"), "utf8");
const context = vm.createContext({ AggregateError, Promise, TypeError });
vm.runInContext(`
  ${functionSource(runtimeConfigSource, "normalizedPreferredTabIds")}
  ${functionSource(runtimeConfigSource, "replaceDnrRules")}
  globalThis.normalizeTabs = normalizedPreferredTabIds;
  globalThis.replaceRules = replaceDnrRules;
`, context);

(async () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.normalizeTabs([7, null, 3, "4", false, -1]))),
    [7, 3],
    "strict runtime configuration must ignore non-integer and negative preferred tab IDs"
  );

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
  }, [sessionRule], [dynamicRule], () => {});
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
  await assert.rejects(
    context.replaceRules({
      getDynamicRules: async () => [{ id: 81 }],
      getSessionRules: async () => [{ id: 82 }],
      updateSessionRules: async () => {},
      updateDynamicRules: async () => {
        cleanupAttempts += 1;
        throw new Error("cleanup unavailable");
      }
    }, [sessionRule], [dynamicRule], () => {}),
    /cleanup unavailable/,
    "strict runtime apply must reject when stale dynamic DNR rules cannot be removed"
  );
  assert.equal(cleanupAttempts, 1, "dynamic cleanup failure must surface to the outer atomic restore path");

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

  console.log("DNR rule replacement and extension-tab discovery: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
