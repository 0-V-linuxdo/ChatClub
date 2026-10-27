// NetRules: session rules that let chat sites load inside ChatClub workspace iframes (v2 07 §6).
// Rule A (priority 2): requests initiated by this extension (main_frame/sub_frame).
// Rule B (priority 1): sub_frame requests to any platform host, only inside workspace tabs (tabIds).
// Both rewrite a few request headers and strip frame-blocking response headers.

const RULE_EXTENSION = 9001;
const RULE_PLATFORMS = 9002;
const RULE_NOTION_SW = 9003;
const NOTION_DOMAINS = ["notion.so", "notion.com"];
let leaseActive = false;
let startedCtx = null;
const workspaceTabs = new Set();

const action = () => ({
  type: "modifyHeaders",
  requestHeaders: [
    { header: "user-agent", operation: "set", value: navigator.userAgent },
    { header: "sec-fetch-dest", operation: "set", value: "document" },
    { header: "sec-fetch-site", operation: "set", value: "same-origin" },
    { header: "if-none-match", operation: "remove" },
  ],
  responseHeaders: [
    { header: "x-frame-options", operation: "remove" },
    { header: "content-security-policy", operation: "remove" },
    { header: "content-security-policy-report-only", operation: "remove" },
  ],
});

const toDomain = (host) => String(host).replace(/^\*\./, "").replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, "").replace(/:\d+$/, "");

async function install(ctx) {
  const hostsFn = ctx.host.getService("content.defaultHosts");
  const hosts = [...new Set((typeof hostsFn === "function" ? await hostsFn() : []).map(toDomain).filter(Boolean))];
  const rules = [
    {
      id: RULE_EXTENSION,
      priority: 2,
      condition: { initiatorDomains: [chrome.runtime.id], resourceTypes: ["main_frame", "sub_frame"] },
      action: action(),
    },
  ];
  if (hosts.length && workspaceTabs.size) {
    rules.push({
      id: RULE_PLATFORMS,
      priority: 1,
      condition: { requestDomains: hosts, resourceTypes: ["sub_frame"], tabIds: [...workspaceTabs] },
      action: action(),
    });
  }
  // Notion's service worker fetches and caches the chat document itself (tab -1, not a sub_frame), then answers
  // the iframe navigation from that cache with the original X-Frame-Options / CSP. While a Notion preflight
  // lease is open (05 §6.3, at most 5 minutes) those worker fetches lose the frame-blocking headers too.
  if (leaseActive) {
    rules.push({
      id: RULE_NOTION_SW,
      priority: 1,
      condition: { requestDomains: NOTION_DOMAINS, tabIds: [-1], resourceTypes: ["xmlhttprequest", "other"] },
      action: { type: "modifyHeaders", responseHeaders: action().responseHeaders },
    });
  }
  const dnr = chrome.declarativeNetRequest;
  const update = dnr.updateSessionRules ? dnr.updateSessionRules.bind(dnr) : dnr.updateDynamicRules.bind(dnr);
  await update({ removeRuleIds: [RULE_EXTENSION, RULE_PLATFORMS, RULE_NOTION_SW], addRules: rules });
}

// ---------------------------------------------------------------- Notion preflight lease (v2 05 §6.3)
// Before a Notion iframe loads, the tab gets a lease: prepared → navigating, then cleared when the frame
// finishes loading. The ledger lives in storage.session so a restarted worker picks it up; an alarm
// clears leases that outlive LEASE_MS.
const NOTION = /(^|\.)notion\.(so|com)$/i;
const LEASE_KEY = "chatclubNotionFramePreflightLeasesV1";
const LEASE_ALARM = "chatclub-notion-frame-preflight-lease-expiry-v1";
const LEASE_MS = 5 * 60 * 1000;
const session = () => chrome.storage.session ?? chrome.storage.local;
const hostOf = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
};
let leaseChain = Promise.resolve();
const withLeases = (fn) => {
  const run = leaseChain.then(async () => {
    const ledger = (await session().get(LEASE_KEY))[LEASE_KEY] ?? {};
    const next = fn({ ...ledger }) ?? ledger;
    for (const [tabId, lease] of Object.entries(next)) if (!lease || Date.now() - lease.at > LEASE_MS) delete next[tabId];
    await session().set({ [LEASE_KEY]: next });
    const active = Object.keys(next).length > 0;
    if (active !== leaseActive) {
      leaseActive = active;
      if (startedCtx) reinstall(startedCtx);
    }
    const soonest = Math.min(...Object.values(next).map((l) => l.at + LEASE_MS));
    try {
      if (Number.isFinite(soonest)) await chrome.alarms.create(LEASE_ALARM, { when: Math.max(Date.now() + 30_000, soonest) });
      else await chrome.alarms.clear(LEASE_ALARM);
    } catch {
      // alarms unavailable
    }
    return next;
  });
  leaseChain = run.catch(() => {});
  return run;
};

let chain = Promise.resolve();
const reinstall = (ctx) => (chain = chain.then(() => install(ctx)).catch((error) => ctx.logger.warn("Installing network rules failed:", error?.message || error)));

export default {
  alarms: [LEASE_ALARM],
  onAlarm: () => withLeases((ledger) => ledger),
  async start(ctx) {
    startedCtx = ctx;
    leaseActive = Object.keys((await session().get(LEASE_KEY).catch(() => ({})))[LEASE_KEY] ?? {}).length > 0;
    try {
      const tabs = await chrome.tabs.query({ url: `${chrome.runtime.getURL("chatClub.html")}*` });
      tabs.forEach((t) => workspaceTabs.add(t.id));
    } catch {
      // ignore
    }
    await reinstall(ctx);
    ctx.events.on("contentPlanChanged", () => reinstall(ctx));
  },
  handlers: {
    prepareFrame: {
      sender: "extensionPage",
      validate: (payload) => !payload || typeof payload === "object",
      async handle(_payload, sender, ctx) {
        const tabId = sender.tab?.id;
        if (typeof tabId !== "number") throw new Error("no tab");
        if (NOTION.test(hostOf(_payload?.url))) await withLeases((ledger) => ({ ...ledger, [tabId]: { state: "prepared", at: Date.now() } }));
        if (!workspaceTabs.has(tabId)) {
          workspaceTabs.add(tabId);
          await reinstall(ctx);
        } else await chain;
        return { ok: true };
      },
    },
  },
  on: {
    navigationCommitted(details) {
      if (details.frameId === 0 || !NOTION.test(hostOf(details.url))) return;
      return withLeases((ledger) => (ledger[details.tabId] ? { ...ledger, [details.tabId]: { ...ledger[details.tabId], state: "navigating" } } : ledger));
    },
    navigationCompleted(details) {
      if (details.frameId === 0 || !NOTION.test(hostOf(details.url))) return;
      return withLeases((ledger) => {
        delete ledger[details.tabId];
        return ledger;
      });
    },
    async tabRemoved(tabId, _info, ctx) {
      withLeases((ledger) => {
        delete ledger[tabId];
        return ledger;
      });
      if (!workspaceTabs.delete(tabId)) return;
      await reinstall(ctx);
    },
  },
};
