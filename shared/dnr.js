import { uniqueMatchPatterns } from "./url-match.js";

function requestDomainsFromApps(chatApps) {
  const domains = new Set();
  for (const app of chatApps || []) {
    try {
      domains.add(new URL(app.url).hostname);
    } catch {}
    for (const host of app.hosts || []) domains.add(String(host).replace(/^\*\./, ""));
  }
  return Array.from(domains).filter(Boolean);
}

export function buildDynamicDnrRules(chatApps, extensionHost) {
  const responseHeaders = [
    { header: "X-Frame-Options", operation: "remove" },
    { header: "Content-Security-Policy", operation: "remove" },
    { header: "Content-Security-Policy-Report-Only", operation: "remove" }
  ];
  const requestHeaders = [
    { header: "Sec-Fetch-Dest", operation: "set", value: "document" },
    { header: "Sec-Fetch-Site", operation: "set", value: "same-origin" }
  ];
  const action = { type: "modifyHeaders", requestHeaders, responseHeaders };
  const resourceTypes = ["main_frame", "sub_frame"];
  const domains = requestDomainsFromApps(chatApps);
  const rules = [];
  let id = 1;
  if (extensionHost) {
    rules.push({
      id: id++,
      priority: 1,
      action,
      condition: { initiatorDomains: [extensionHost], resourceTypes }
    });
  }
  if (domains.length) {
    rules.push({
      id: id++,
      priority: 1,
      action,
      condition: { requestDomains: domains, resourceTypes }
    });
  }
  for (const app of chatApps || []) {
    for (const rule of app.networkRules || []) {
      rules.push({ ...rule, id: id++, priority: rule.priority || 1 });
    }
  }
  return rules;
}

export function contentScriptMatches(chatApps) {
  const matches = new Set(uniqueMatchPatterns(chatApps));
  // Match Mod's Notion handling: Notion often navigates from /ai to /chat?t=...
  // and custom configs may only keep the start URL.
  if ((chatApps || []).some((app) => app?.id === "NotionAI" || /notion/i.test(`${app?.name || ""} ${app?.url || ""}`))) {
    for (const pattern of ["https://app.notion.com/*", "https://www.notion.so/*", "https://notion.so/*"]) matches.add(pattern);
  }
  const output = Array.from(matches).sort();
  return output.length ? output : ["https://*/*", "http://*/*"];
}
