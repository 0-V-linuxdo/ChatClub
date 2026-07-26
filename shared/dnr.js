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

function currentUserAgent() {
  return globalThis.navigator?.userAgent || "";
}

function normalizedTabIds(tabIds) {
  return Array.from(new Set((tabIds || [])
    .filter((value) => Number.isInteger(value) && value >= 0)))
    .sort((a, b) => a - b);
}

function extensionFrameRequestHeaders() {
  const headers = [
    { header: "Sec-Fetch-Dest", operation: "set", value: "document" },
    { header: "Sec-Fetch-Site", operation: "set", value: "same-origin" },
    { header: "If-None-Match", operation: "remove" }
  ];
  const userAgent = currentUserAgent();
  if (userAgent) headers.unshift({ header: "User-Agent", operation: "set", value: userAgent });
  return headers;
}

export function buildDynamicDnrRules(chatApps, extensionHost, extensionTabIds = []) {
  const responseHeaders = [
    { header: "X-Frame-Options", operation: "remove" },
    { header: "Content-Security-Policy", operation: "remove" },
    { header: "Content-Security-Policy-Report-Only", operation: "remove" }
  ];
  const frameLoadAction = { type: "modifyHeaders", requestHeaders: extensionFrameRequestHeaders(), responseHeaders };
  const resourceTypes = ["main_frame", "sub_frame"];
  const tabIds = normalizedTabIds(extensionTabIds);
  const domains = requestDomainsFromApps(chatApps);
  const rules = [];
  let id = 1;
  if (extensionHost) {
    rules.push({
      id: id++,
      priority: 2,
      action: frameLoadAction,
      condition: { initiatorDomains: [extensionHost], resourceTypes }
    });
  }
  if (domains.length && tabIds.length) {
    rules.push({
      id: id++,
      priority: 1,
      action: frameLoadAction,
      condition: { requestDomains: domains, resourceTypes: ["sub_frame"], tabIds }
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
