#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const dataModule = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

(async () => {
  const urlMatchUrl = `data:text/javascript;base64,${Buffer.from(read("shared/url-match.js")).toString("base64")}`;
  const dnrSource = read("shared/dnr.js")
    .replace('from "./url-match.js"', `from ${JSON.stringify(urlMatchUrl)}`);
  const { buildDynamicDnrRules } = await dataModule(dnrSource);
  const rules = buildDynamicDnrRules([
    { id: "Grok", url: "https://grok.com/", hosts: ["grok.com", "*.grok.com"] },
    { id: "NotionAI", url: "https://app.notion.com/ai", hosts: ["app.notion.com", "notion.so", "www.notion.so", "*.notion.so"] }
  ], "chatclub-extension-id", [41, null, 17, "7", false, undefined, 41]);
  const frameLoadRule = rules.find((rule) => rule.condition?.initiatorDomains?.includes("chatclub-extension-id"));
  const activeTabRule = rules.find((rule) => Array.isArray(rule.condition?.tabIds));

  assert.ok(frameLoadRule, "the extension frame-load rule must exist");
  assert.ok(activeTabRule, "the active extension-tab navigation rule must exist");
  assert.deepEqual(
    frameLoadRule.condition.resourceTypes,
    ["main_frame", "sub_frame"],
    "request-header rewriting must be limited to document navigation"
  );
  for (const resourceType of ["websocket", "xmlhttprequest", "other", "script", "image"]) {
    assert.ok(
      !frameLoadRule.condition.resourceTypes.includes(resourceType),
      `${resourceType} requests must not be rewritten as document navigation`
    );
  }
  assert.ok(
    frameLoadRule.action.requestHeaders.some((entry) => entry.header === "Sec-Fetch-Dest" && entry.value === "document"),
    "the regression fixture must cover the document-only header rewrite"
  );
  assert.deepEqual(activeTabRule.condition.tabIds, [17, 41], "active extension tab ids must be normalized and deduplicated");
  assert.deepEqual(activeTabRule.condition.resourceTypes, ["sub_frame"], "the active-tab fallback must affect subframes only");
  assert.ok(activeTabRule.condition.requestDomains.includes("app.notion.com"), "the active-tab fallback must cover app.notion.com");
  assert.ok(activeTabRule.condition.requestDomains.includes("notion.so"), "the active-tab fallback must cover Notion redirects");
  assert.ok(
    activeTabRule.action.requestHeaders.some((entry) => entry.header === "Sec-Fetch-Dest" && entry.value === "document"),
    "self-navigation in an owned extension tab must retain the document request contract"
  );
  assert.ok(
    activeTabRule.action.requestHeaders.some((entry) => entry.header === "If-None-Match" && entry.operation === "remove"),
    "self-navigation must not reuse an unmodified cached framing response"
  );
  for (const rule of [frameLoadRule, activeTabRule]) {
    for (const header of ["X-Frame-Options", "Content-Security-Policy", "Content-Security-Policy-Report-Only"]) {
      assert.ok(
        rule.action.responseHeaders.some((entry) => entry.header === header && entry.operation === "remove"),
        `${header} must be removed from protected frame responses`
      );
    }
  }

  const backgroundOnlyRules = buildDynamicDnrRules([
    { id: "NotionAI", url: "https://app.notion.com/ai", hosts: ["app.notion.com"] }
  ], "chatclub-extension-id");
  assert.equal(
    backgroundOnlyRules.some((rule) => Array.isArray(rule.condition?.tabIds)),
    false,
    "domain-only response-header removal must not leak into ordinary browser tabs"
  );

  console.log("DNR navigation boundaries: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
