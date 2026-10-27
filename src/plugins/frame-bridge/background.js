// FrameBridge (background): verifies chat iframes and relays commands/events between the workspace
// page and its direct child frames. A frame is trusted only if it is a direct child (parentFrameId 0)
// of a ChatClub workspace tab, its document is current, and it presents the binding id the page created.

// binding -> { tabId, frameId, documentId, appId, url, capabilities:Set }. Mirrored to storage.session so
// a service worker restart doesn't orphan the frames that are still open.
const SESSION_KEY = "chatclubSecureFrameContexts";
const frames = new Map();
let saveTimer = null;
const saveFrames = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const plain = Object.fromEntries([...frames].map(([k, v]) => [k, { ...v, capabilities: [...(v.capabilities ?? [])] }]));
    chrome.storage.session?.set({ [SESSION_KEY]: plain }).catch(() => {});
  }, 50);
};
async function loadFrames() {
  try {
    const stored = (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY] ?? {};
    for (const [k, v] of Object.entries(stored)) if (!frames.has(k)) frames.set(k, { ...v, capabilities: new Set(v.capabilities ?? []) });
  } catch {
    // storage.session unavailable: start empty
  }
}
const DEFAULT_TIMEOUT = 8000;

const workspaceUrl = () => chrome.runtime.getURL("chatClub.html");

async function verifyFrame(sender) {
  const tabId = sender.tab?.id;
  const frameId = sender.frameId;
  if (typeof tabId !== "number" || typeof frameId !== "number" || frameId === 0) return null;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.url?.startsWith(workspaceUrl())) return null;
  const frame = await chrome.webNavigation.getFrame({ tabId, frameId }).catch(() => null);
  if (!frame || frame.parentFrameId !== 0) return null;
  if (sender.documentId && frame.documentId && frame.documentId !== sender.documentId) return null;
  return { tabId, frameId, documentId: sender.documentId ?? frame.documentId ?? null };
}

function relayToPage(tabId, binding, event, data) {
  chrome.runtime.sendMessage({ type: "chatclub.frameEvent", tabId, binding, event, data }).catch(() => {});
}

const isBinding = (p) => typeof p?.binding === "string" && /^[0-9a-f]{64}$/.test(p.binding);

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => (timer = setTimeout(() => reject(new Error("timeout")), ms)))]).finally(() => clearTimeout(timer));
}

// Registrations are serialized per binding: hello and the capability announcements of one document
// arrive together and must land in one record (no lost capabilities).
const registering = new Map();
function register(payload, sender, { fresh = false } = {}) {
  const prev = registering.get(payload.binding) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(async () => {
    const existing = frames.get(payload.binding);
    const sameDocument = existing && existing.tabId === sender.tab?.id && existing.frameId === sender.frameId && (sender.documentId ? existing.documentId === sender.documentId : true);
    if (sameDocument && !fresh) return existing;
    const where = await verifyFrame(sender);
    if (!where) throw new Error("frame not trusted");
    if (existing && existing.tabId !== where.tabId) throw new Error("binding reused");
    const keep = existing && existing.documentId === where.documentId && existing.frameId === where.frameId;
    const record = { ...where, appId: payload.appId ?? existing?.appId ?? "", url: payload.url ?? existing?.url ?? "", capabilities: new Set(keep ? existing.capabilities : []) };
    frames.set(payload.binding, record);
    saveFrames();
    return record;
  });
  registering.set(payload.binding, next);
  next.finally(() => {
    if (registering.get(payload.binding) === next) registering.delete(payload.binding);
  }).catch(() => {});
  return next;
}

export default {
  async start() {
    await loadFrames();
  },
  handlers: {
    hello: {
      sender: "chatFrame",
      validate: isBinding,
      async handle(payload, sender) {
        const record = await register(payload, sender, { fresh: true });
        relayToPage(record.tabId, payload.binding, "hello", { url: payload.url, title: payload.title, capabilities: [...record.capabilities] });
        return { ok: true };
      },
    },
    capabilityReady: {
      sender: "chatFrame",
      validate: isBinding,
      async handle(payload, sender) {
        const record = await register(payload, sender);
        record.capabilities.add(String(payload.capability));
        saveFrames();
        relayToPage(record.tabId, payload.binding, "capability", { capability: payload.capability });
        return { ok: true };
      },
    },
    frameEvent: {
      sender: "chatFrame",
      validate: (p) => isBinding(p) && typeof p.event === "string",
      async handle(payload, sender) {
        const record = frames.get(payload.binding);
        if (!record || record.tabId !== sender.tab?.id || record.frameId !== sender.frameId) throw new Error("unknown frame");
        if (sender.documentId && record.documentId && sender.documentId !== record.documentId) throw new Error("stale document");
        if (payload.event === "location") {
          record.url = payload.data?.href ?? record.url;
          saveFrames();
        }
        relayToPage(record.tabId, payload.binding, payload.event, payload.data ?? {});
        return { ok: true };
      },
    },
    send: {
      sender: "extensionPage",
      validate: (p) => isBinding(p) && typeof p.command === "string" && typeof p.capability === "string",
      async handle(payload, sender, ctx) {
        const record = frames.get(payload.binding);
        if (!record || record.tabId !== sender.tab?.id) throw new Error("frame not registered");
        // The owning plugin must be enabled in the background too.
        const owner = ctx.host.commandOwners.get(payload.command);
        if (!owner || owner.capability !== payload.capability) throw new Error("unknown command");
        if (!ctx.host.isPluginEnabled(owner.plugin)) throw new Error("feature disabled");
        const frame = await chrome.webNavigation.getFrame({ tabId: record.tabId, frameId: record.frameId }).catch(() => null);
        if (!frame || frame.parentFrameId !== 0 || (record.documentId && frame.documentId && frame.documentId !== record.documentId)) {
          throw new Error("frame document changed");
        }
        const options = { frameId: record.frameId };
        if (record.documentId) options.documentId = record.documentId;
        const response = await withTimeout(
          chrome.tabs.sendMessage(record.tabId, { type: "chatclub.frameCommand", binding: payload.binding, capability: payload.capability, command: payload.command, payload: payload.payload }, options),
          Math.max(500, Math.min(120000, Number(payload.timeoutMs) || DEFAULT_TIMEOUT)),
        );
        if (!response) throw new Error("no response");
        if (!response.ok) throw new Error(response.error || "command failed");
        return response.result;
      },
    },
    inject: {
      sender: "extensionPage",
      validate: (p) => isBinding(p) && Array.isArray(p.files),
      async handle(payload, sender) {
        const record = frames.get(payload.binding);
        if (!record || record.tabId !== sender.tab?.id) throw new Error("frame not registered");
        const files = payload.files.filter((f) => /^content\/[\w-]+\.js$/.test(f));
        await chrome.scripting.executeScript({ target: { tabId: record.tabId, frameIds: [record.frameId] }, files, world: payload.world === "MAIN" ? "MAIN" : "ISOLATED" });
        return { ok: true };
      },
    },
    contentPlan: {
      sender: "extensionPage",
      async handle(payload, sender, ctx) {
        return (await ctx.host.currentContentPlan()).map(({ plugin, capability, js, world }) => ({ plugin, capability, js, world }));
      },
    },
    forget: {
      sender: "extensionPage",
      validate: isBinding,
      async handle(payload, sender) {
        const record = frames.get(payload.binding);
        if (record && record.tabId === sender.tab?.id) frames.delete(payload.binding);
        saveFrames();
        return { ok: true };
      },
    },
  },
  on: {
    tabRemoved(tabId) {
      for (const [binding, record] of frames) if (record.tabId === tabId) frames.delete(binding);
      saveFrames();
    },
  },
};
