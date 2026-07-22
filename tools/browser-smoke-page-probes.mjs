export async function newWorkspaceTabProbe({ withTimeout }) {
  const api = globalThis.browser || globalThis.chrome;
  const session = await import(api.runtime.getURL("shared/workspace-session.js"));
  const { t } = await import(api.runtime.getURL("shared/i18n.js"));
  const currentTab = await api.tabs.getCurrent();
  if (!Number.isInteger(currentTab?.id)) throw new Error("new workspace probe could not resolve the current tab");
  const beforeIds = new Set((await api.tabs.query({})).map((tab) => tab.id));
  const createdWorkspaceTabs = async () => (await api.tabs.query({})).filter((tab) => !beforeIds.has(tab.id)
    && /\/chatClub\.html(?:[?#]|$)/.test(String(tab.url || "")));
  const brandButton = document.querySelector('[data-tooltip-id="topbar.brand"]');
  if (!brandButton) throw new Error("new workspace probe found no Logo button");
  let createdTab = null;
  try {
    brandButton.click();
    createdTab = await withTimeout(new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const created = (await createdWorkspaceTabs())[0];
          if (created) return resolve(created);
          setTimeout(poll, 25);
        } catch (error) {
          reject(error);
        }
      };
      poll();
    }), 8000, "Logo-created ChatClub tab");
    await new Promise((resolve) => setTimeout(resolve, 250));
    const createdTabs = await createdWorkspaceTabs();
    const createdWorkspaceId = session.workspaceSessionIdFromUrl(createdTab.url);
    return {
      ok: true,
      shellReady: false,
      url: createdTab.url,
      createdCount: createdTabs.length,
      responseError: [...document.querySelectorAll(".toast-error")]
        .some((item) => item.textContent?.includes(t("chat.unableToOpenTab"))),
      active: createdTab.active === true,
      adjacent: createdTab.windowId === currentTab.windowId && createdTab.index === currentTab.index + 1,
      noOpener: !Number.isInteger(createdTab.openerTabId),
      windowFocused: (await api.windows.get(createdTab.windowId))?.focused === true,
      pathname: new URL(createdTab.url).pathname,
      workspaceId: createdWorkspaceId,
      independentWorkspace: Boolean(createdWorkspaceId)
        && createdWorkspaceId !== session.workspaceSessionIdFromUrl(location.href)
    };
  } finally {
    await api.tabs.update(currentTab.id, { active: true }).catch(() => {});
    if (Number.isInteger(currentTab.windowId)) {
      await api.windows.update(currentTab.windowId, { focused: true }).catch(() => {});
    }
  }
}

export async function stableConfigInfoProbe({ request, withTimeout, expectedIds }) {
  return withTimeout(new Promise((resolve) => {
    const poll = async () => {
      const response = await request({ source: "chatclub", action: "getConfigInfo" });
      const ids = new Set((response?.value?.contentScripts || []).map((entry) => entry.id));
      if (response?.ok === true && expectedIds.every((id) => ids.has(id))) return resolve(response);
      setTimeout(poll, 50);
    };
    poll();
  }), 15000, "stable dynamic content registration");
}

export function assertNewWorkspaceTabResult(result, browserTarget, assert) {
  assert(result?.ok === true, `${browserTarget}: Logo did not create a new ChatClub tab`);
  assert(result.shellReady === true, `${browserTarget}: Logo-created ChatClub page did not initialize its app shell`);
  assert(result.createdCount === 1, `${browserTarget}: one Logo click created ${result.createdCount} ChatClub tabs`);
  assert(result.responseError === false, `${browserTarget}: Logo-created tab produced a background response error`);
  assert(result.pathname === "/chatClub.html", `${browserTarget}: Logo opened the wrong extension page`);
  assert(/^page-[A-Za-z0-9_-]{12,128}$/.test(String(result.workspaceId || "")), `${browserTarget}: Logo-created page has no stable workspace id`);
  assert(result.independentWorkspace === true, `${browserTarget}: Logo-created page reused the source workspace`);
  assert(result.noOpener === true, `${browserTarget}: Logo-created page retained an opener that can clone session state`);
  assert(result.adjacent === true, `${browserTarget}: Logo-created page was not placed beside the source page`);
  assert(result.active === true, `${browserTarget}: Logo-created page was not activated`);
  assert(result.windowFocused === true, `${browserTarget}: Logo-created page window was not focused`);
}

export async function completeChromiumNewWorkspaceTabProbe(context, sourcePage, result) {
  if (!result?.url) throw new Error("chromium: Logo-created page URL is unavailable");
  const deadline = Date.now() + 10000;
  let createdPage = null;
  while (!createdPage && Date.now() < deadline) {
    createdPage = context.pages().find((candidate) => candidate.url() === result.url) || null;
    if (!createdPage) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!createdPage) throw new Error(`chromium: Logo-created page was not observable: ${result.url}`);
  try {
    await createdPage.locator("#app .app-shell").waitFor({ state: "attached", timeout: 25000 });
    result.shellReady = true;
  } finally {
    await createdPage.close().catch(() => {});
    await sourcePage.bringToFront().catch(() => {});
  }
}

export async function completeFirefoxNewWorkspaceTabProbe(driver, By, result, sourceHandle) {
  if (!result?.url) throw new Error("firefox: Logo-created page URL is unavailable");
  const deadline = Date.now() + 10000;
  let createdHandle = "";
  try {
    while (!createdHandle && Date.now() < deadline) {
      for (const handle of await driver.getAllWindowHandles()) {
        if (handle === sourceHandle) continue;
        await driver.switchTo().window(handle);
        try {
          if (await driver.getCurrentUrl() === result.url) {
            createdHandle = handle;
            break;
          }
        } catch {}
      }
      if (!createdHandle) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!createdHandle) throw new Error(`firefox: Logo-created page was not observable: ${result.url}`);
    await driver.wait(async () => driver.findElements(By.css("#app .app-shell")).then((items) => items.length > 0), 25000);
    result.shellReady = true;
  } finally {
    if (createdHandle) {
      await driver.switchTo().window(createdHandle).catch(() => {});
      await driver.close().catch(() => {});
    }
    await driver.switchTo().window(sourceHandle).catch(() => {});
  }
}
