// PromptHandoff (background): the handoff ledger in storage.session with expiry (v2 02 §13, 07 §1.2).

const LEDGER_KEY = "chatclubWorkspacePromptHandoffsV1";
const PAYLOAD_PREFIX = "chatclubWorkspacePromptPayloadV1:";
const ALARM = "chatclub-workspace-prompt-handoff-expiry-v1";
const TTL_MS = 2 * 60 * 1000;
const WORKSPACE_ID_RE = /^page-[0-9a-f-]{8,64}$/i;

const session = () => chrome.storage.session;
const readLedger = async () => (await session().get(LEDGER_KEY))[LEDGER_KEY] ?? {};
const writeLedger = (ledger) => session().set({ [LEDGER_KEY]: ledger });

async function sweep() {
  const ledger = await readLedger();
  const now = Date.now();
  const expired = Object.values(ledger).filter((e) => e.expiresAt <= now);
  if (!expired.length) return;
  for (const e of expired) delete ledger[e.id];
  await writeLedger(ledger);
  await session().remove(expired.map((e) => PAYLOAD_PREFIX + e.id));
  for (const e of expired) notify(e.sourceTabId, { id: e.id, accepted: false, reason: "expired" });
}

function notify(tabId, data) {
  if (typeof tabId !== "number") return;
  chrome.tabs.sendMessage(tabId, { type: "chatclub.handoffSettled", ...data }).catch?.(() => {});
}

export default {
  alarms: [ALARM],
  async onAlarm() {
    await sweep();
    const ledger = await readLedger();
    if (!Object.keys(ledger).length) await chrome.alarms.clear(ALARM);
  },
  handlers: {
    open: {
      sender: "extensionPage",
      validate: (p) => p && Array.isArray(p.appIds) && p.appIds.length > 0,
      async handle(payload, sender) {
        const id = crypto.randomUUID();
        const workspaceId = `page-${crypto.randomUUID()}`;
        const now = Date.now();
        await session().set({ [PAYLOAD_PREFIX + id]: { text: String(payload.text ?? ""), images: Array.isArray(payload.images) ? payload.images : [], appIds: payload.appIds.map(String).slice(0, 8) } });
        const pageUrl = chrome.runtime.getURL("chatClub.html");
        const tab = await chrome.tabs.create({
          url: `${pageUrl}#workspace=${encodeURIComponent(workspaceId)}&handoff=${id}`,
          index: typeof sender.tab?.index === "number" ? sender.tab.index + 1 : undefined,
          windowId: sender.tab?.windowId,
          active: true,
        });
        const ledger = await readLedger();
        ledger[id] = { id, sourceTabId: sender.tab?.id ?? null, targetTabId: tab.id, workspaceId, createdAt: now, expiresAt: now + TTL_MS, status: "pending" };
        await writeLedger(ledger);
        await chrome.alarms.create(ALARM, { periodInMinutes: 1 });
        return { ok: true, id, tabId: tab.id, workspaceId };
      },
    },
    claim: {
      sender: "extensionPage",
      validate: (p) => p && typeof p.id === "string",
      async handle(payload, sender) {
        await sweep();
        const ledger = await readLedger();
        const entry = ledger[payload.id];
        if (!entry || entry.status !== "pending" || entry.targetTabId !== sender.tab?.id) return { ok: false };
        if (payload.workspaceId && WORKSPACE_ID_RE.test(payload.workspaceId) && payload.workspaceId !== entry.workspaceId) return { ok: false };
        const data = (await session().get(PAYLOAD_PREFIX + entry.id))[PAYLOAD_PREFIX + entry.id];
        if (!data) return { ok: false };
        entry.status = "claimed";
        await writeLedger(ledger);
        return { ok: true, ...data };
      },
    },
    settle: {
      sender: "extensionPage",
      validate: (p) => p && typeof p.id === "string",
      async handle(payload, sender) {
        const ledger = await readLedger();
        const entry = ledger[payload.id];
        if (!entry || entry.targetTabId !== sender.tab?.id) return { ok: false };
        delete ledger[entry.id];
        await writeLedger(ledger);
        await session().remove(PAYLOAD_PREFIX + entry.id);
        notify(entry.sourceTabId, { id: entry.id, accepted: !!payload.accepted });
        return { ok: true };
      },
    },
  },
  on: {
    tabRemoved: async (tabId) => {
      const ledger = await readLedger();
      const hit = Object.values(ledger).find((e) => e.targetTabId === tabId);
      if (!hit) return;
      delete ledger[hit.id];
      await writeLedger(ledger);
      await session().remove(PAYLOAD_PREFIX + hit.id);
      notify(hit.sourceTabId, { id: hit.id, accepted: false, reason: "closed" });
    },
  },
};
