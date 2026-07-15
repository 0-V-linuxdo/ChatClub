import {
  createWorkspaceSessionId,
  workspaceSessionUrl
} from "../shared/workspace-session.js";

export function openableTabUrl(href) {
  try {
    const parsed = new URL(String(href || ""));
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

function normalizeOpenerTab(tab) {
  if (!tab || typeof tab.id !== "number") return null;
  return {
    id: tab.id,
    windowId: typeof tab.windowId === "number" ? tab.windowId : undefined,
    index: typeof tab.index === "number" ? tab.index : undefined
  };
}

async function resolveExplicitTab(api, openerTab) {
  const info = normalizeOpenerTab(openerTab);
  if (!info) return null;
  try {
    return await api.tabs.get(info.id);
  } catch {
    return info;
  }
}

async function resolveTargetTab(api, sender, openerTab) {
  const explicitTab = await resolveExplicitTab(api, openerTab);
  if (explicitTab?.id) return explicitTab;
  if (sender?.tab?.id) return sender.tab;
  try {
    const tabs = await api.tabs.query({ active: true, lastFocusedWindow: true });
    return tabs?.[0] || null;
  } catch {
    return null;
  }
}

function openTabCreateOptions(url, targetTab) {
  const createOptions = { url, active: true };
  if (targetTab?.windowId) {
    createOptions.windowId = targetTab.windowId;
    if (typeof targetTab.index === "number") createOptions.index = targetTab.index + 1;
    if (typeof targetTab.id === "number") createOptions.openerTabId = targetTab.id;
  }
  return createOptions;
}

async function focusCreatedTab(api, tab) {
  if (tab?.id) {
    try { await api.tabs.update(tab.id, { active: true }); } catch {}
  }
  if (tab?.windowId && api.windows?.update) {
    try { await api.windows.update(tab.windowId, { focused: true }); } catch {}
  }
}

export async function openExternalTab(api, url, sender, openerTab) {
  const targetTab = await resolveTargetTab(api, sender, openerTab);
  try {
    const tab = await api.tabs.create(openTabCreateOptions(url, targetTab));
    await focusCreatedTab(api, tab);
    return tab;
  } catch {}
  if (targetTab?.id) {
    try {
      const duplicate = await api.tabs.duplicate(targetTab.id);
      if (duplicate?.id) {
        await api.tabs.update(duplicate.id, { url, active: true });
        await focusCreatedTab(api, duplicate);
        return duplicate;
      }
    } catch {}
  }
  const tab = await api.tabs.create({ url, active: true });
  await focusCreatedTab(api, tab);
  return tab;
}

export function registerActionListener(api) {
  if (!api?.action?.onClicked?.addListener) throw new Error("Extension action API is unavailable");
  api.action.onClicked.addListener(() => {
    const url = workspaceSessionUrl(api.runtime.getURL("chatClub.html"), createWorkspaceSessionId());
    api.tabs.create({ url });
  });
}
