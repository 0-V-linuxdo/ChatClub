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
    { id: "Grok", url: "https://grok.com/", hosts: ["grok.com", "*.grok.com"] }
  ], "chatclub-extension-id");
  const frameLoadRule = rules.find((rule) => rule.condition?.initiatorDomains?.includes("chatclub-extension-id"));

  assert.ok(frameLoadRule, "the extension frame-load rule must exist");
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

  console.log("DNR navigation boundaries: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
