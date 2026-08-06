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

export async function readPromptHandoffSessionState() {
  const api = globalThis.browser || globalThis.chrome;
  const values = await api.storage.session.get(null);
  const ledger = values?.chatclubWorkspacePromptHandoffsV1;
  return {
    ledgerIds: Object.keys(ledger?.entries || {}).sort(),
    payloadKeys: Object.keys(values || {})
      .filter((key) => key.startsWith("chatclubWorkspacePromptPayloadV1:"))
      .sort()
  };
}

export async function promptHandoffTabProbe({ withTimeout, readSessionState }) {
  const api = globalThis.browser || globalThis.chrome;
  const session = await import(api.runtime.getURL("shared/workspace-session.js"));
  const { t } = await import(api.runtime.getURL("shared/i18n.js"));
  const currentTab = await api.tabs.getCurrent();
  if (!Number.isInteger(currentTab?.id)) throw new Error("prompt handoff probe could not resolve the current tab");
  if (typeof readSessionState !== "function") throw new Error("prompt handoff probe requires session-state inspection");
  const beforeIds = new Set((await api.tabs.query({})).map((tab) => tab.id));
  const beforeStorage = await readSessionState();
  const createdWorkspaceTabs = async () => (await api.tabs.query({})).filter((tab) => !beforeIds.has(tab.id)
    && /\/chatClub\.html(?:[?#]|$)/.test(String(tab.url || "")));
  const brandButton = document.querySelector('[data-tooltip-id="topbar.brand"]');
  const promptInput = document.querySelector(".prompt-input");
  const frames = Array.from(document.querySelectorAll(".chat-frame"));
  if (!brandButton || !promptInput || !frames.length) {
    throw new Error("prompt handoff probe requires the Logo, Composer, and at least one source frame");
  }
  const originalAppIds = frames.map((frame) => String(frame.dataset.appId || ""));
  const prompt = `ChatClub browser smoke prompt handoff ${Date.now()}`;
  let createdTab = null;
  let details = null;
  try {
    frames.forEach((frame, index) => { frame.dataset.appId = `browser-smoke-missing-app-${index}`; });
    promptInput.value = prompt;
    promptInput.dispatchEvent(new Event("input", { bubbles: true }));
    const dynamicLabel = brandButton.getAttribute("aria-label") === t("topbar.sendInNewTab");
    brandButton.click();
    const duplicateGuarded = brandButton.disabled === true && brandButton.getAttribute("aria-busy") === "true";
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
    }), 8000, "prompt handoff ChatClub tab");
    await new Promise((resolve) => setTimeout(resolve, 250));
    const createdTabs = await createdWorkspaceTabs();
    const createdWorkspaceId = session.workspaceSessionIdFromUrl(createdTab.url);
    details = {
      ok: true,
      shellReady: false,
      url: createdTab.url,
      prompt,
      beforeStorage,
      createdCount: createdTabs.length,
      responseError: [...document.querySelectorAll(".toast-error")]
        .some((item) => item.textContent?.includes(t("chat.unableToOpenTab"))),
      dynamicLabel,
      duplicateGuarded,
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
    frames.forEach((frame, index) => { frame.dataset.appId = originalAppIds[index]; });
    await api.tabs.update(currentTab.id, { active: true }).catch(() => {});
    if (Number.isInteger(currentTab.windowId)) {
      await api.windows.update(currentTab.windowId, { focused: true }).catch(() => {});
    }
  }
  return {
    ...details,
    sourceFrameIdsRestored: frames.every((frame, index) => frame.dataset.appId === originalAppIds[index])
  };
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

export function assertPromptHandoffTabResult(result, browserTarget, assert) {
  assert(result?.ok === true, `${browserTarget}: prompt handoff Logo did not create a ChatClub tab`);
  assert(result.shellReady === true, `${browserTarget}: prompt handoff target did not initialize its app shell`);
  assert(result.createdCount === 1, `${browserTarget}: guarded prompt handoff created ${result.createdCount} ChatClub tabs`);
  assert(result.responseError === false, `${browserTarget}: prompt handoff produced a background response error`);
  assert(result.dynamicLabel === true, `${browserTarget}: nonempty Composer did not update the Logo action label`);
  assert(result.duplicateGuarded === true, `${browserTarget}: prompt handoff did not synchronously guard duplicate Logo clicks`);
  assert(result.pathname === "/chatClub.html", `${browserTarget}: prompt handoff opened the wrong extension page`);
  assert(/^page-[A-Za-z0-9_-]{12,128}$/.test(String(result.workspaceId || "")), `${browserTarget}: prompt handoff target has no stable workspace id`);
  assert(result.independentWorkspace === true, `${browserTarget}: prompt handoff reused the source workspace`);
  assert(result.noOpener === true, `${browserTarget}: prompt handoff target retained an opener`);
  assert(result.adjacent === true, `${browserTarget}: prompt handoff target was not placed beside the source page`);
  assert(result.active === true, `${browserTarget}: prompt handoff target was not activated`);
  assert(result.windowFocused === true, `${browserTarget}: prompt handoff target window was not focused`);
  assert(result.sourceFrameIdsRestored === true, `${browserTarget}: prompt handoff probe did not restore source frame identities`);
  assert(result.targetDraftRetained === true, `${browserTarget}: rejected prompt handoff target did not retain its draft`);
  assert(result.targetFrameCount === 0, `${browserTarget}: invalid prompt targets created ${result.targetFrameCount} iframe(s)`);
  assert(result.sourceDraftRetained === true, `${browserTarget}: rejected prompt handoff cleared the source draft`);
  assert(result.ledgerClean === true, `${browserTarget}: prompt handoff ledger was not cleaned`);
  assert(result.payloadClean === true, `${browserTarget}: prompt handoff payload was not cleaned`);
}

function sameStringArray(first, second) {
  return JSON.stringify(first || []) === JSON.stringify(second || []);
}

function promptHandoffTargetReady(result, targetState, storageState) {
  return targetState?.draft === result.prompt
    && targetState.frameCount === 0
    && sameStringArray(storageState?.ledgerIds, result.beforeStorage?.ledgerIds)
    && sameStringArray(storageState?.payloadKeys, result.beforeStorage?.payloadKeys);
}

async function chromiumPromptHandoffTargetState(page) {
  return page.evaluate(() => ({
    draft: document.querySelector(".prompt-input")?.value || "",
    frameCount: document.querySelectorAll(".chat-frame").length
  }));
}

async function chromiumPromptHandoffStorageState(page) {
  return page.evaluate(readPromptHandoffSessionState);
}

async function clearChromiumSourcePrompt(page, prompt) {
  return page.evaluate((expectedPrompt) => {
    const input = document.querySelector(".prompt-input");
    const retained = input?.value === expectedPrompt;
    if (input) {
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    return retained;
  }, prompt);
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

export async function completeChromiumPromptHandoffTabProbe(context, sourcePage, result) {
  if (!result?.url) throw new Error("chromium: prompt handoff target URL is unavailable");
  const observableDeadline = Date.now() + 10000;
  let createdPage = null;
  while (!createdPage && Date.now() < observableDeadline) {
    createdPage = context.pages().find((candidate) => candidate.url() === result.url) || null;
    if (!createdPage) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!createdPage) throw new Error(`chromium: prompt handoff target was not observable: ${result.url}`);
  try {
    await createdPage.locator("#app .app-shell").waitFor({ state: "attached", timeout: 25000 });
    result.shellReady = true;
    const readyDeadline = Date.now() + 25000;
    let targetState = null;
    let storageState = null;
    while (Date.now() < readyDeadline) {
      targetState = await chromiumPromptHandoffTargetState(createdPage);
      storageState = await chromiumPromptHandoffStorageState(createdPage);
      if (promptHandoffTargetReady(result, targetState, storageState)) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    result.targetDraftRetained = targetState?.draft === result.prompt;
    result.targetFrameCount = targetState?.frameCount;
    result.ledgerClean = sameStringArray(storageState?.ledgerIds, result.beforeStorage?.ledgerIds);
    result.payloadClean = sameStringArray(storageState?.payloadKeys, result.beforeStorage?.payloadKeys);
  } finally {
    await createdPage.close().catch(() => {});
    await sourcePage.bringToFront().catch(() => {});
    result.sourceDraftRetained = await clearChromiumSourcePrompt(sourcePage, result.prompt).catch(() => false);
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

export async function completeFirefoxPromptHandoffTabProbe(driver, By, result, sourceHandle) {
  if (!result?.url) throw new Error("firefox: prompt handoff target URL is unavailable");
  const observableDeadline = Date.now() + 10000;
  let createdHandle = "";
  try {
    while (!createdHandle && Date.now() < observableDeadline) {
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
    if (!createdHandle) throw new Error(`firefox: prompt handoff target was not observable: ${result.url}`);
    await driver.wait(async () => driver.findElements(By.css("#app .app-shell")).then((items) => items.length > 0), 25000);
    result.shellReady = true;
    let targetState = null;
    let storageState = null;
    await driver.wait(async () => {
      targetState = await driver.executeScript(`return {
        draft: document.querySelector(".prompt-input")?.value || "",
        frameCount: document.querySelectorAll(".chat-frame").length
      };`);
      storageState = await driver.executeAsyncScript(`
        const done = arguments[arguments.length - 1];
        (${readPromptHandoffSessionState.toString()})().then(done, (error) => done({ error: error?.message || String(error) }));
      `);
      return promptHandoffTargetReady(result, targetState, storageState);
    }, 25000);
    result.targetDraftRetained = targetState?.draft === result.prompt;
    result.targetFrameCount = targetState?.frameCount;
    result.ledgerClean = sameStringArray(storageState?.ledgerIds, result.beforeStorage?.ledgerIds);
    result.payloadClean = sameStringArray(storageState?.payloadKeys, result.beforeStorage?.payloadKeys);
  } finally {
    if (createdHandle) {
      await driver.switchTo().window(createdHandle).catch(() => {});
      await driver.close().catch(() => {});
    }
    await driver.switchTo().window(sourceHandle).catch(() => {});
    result.sourceDraftRetained = await driver.executeScript(`
      const input = document.querySelector(".prompt-input");
      const retained = input?.value === arguments[0];
      if (input) {
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return retained;
    `, result.prompt).catch(() => false);
  }
}
