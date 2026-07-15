function rootApi() {
  return globalThis.browser || globalThis.chrome || null;
}

function callbackError() {
  return globalThis.chrome?.runtime?.lastError?.message || "";
}

function callPromise(path, args = []) {
  const api = rootApi();
  let owner = api;
  for (const key of path.slice(0, -1)) owner = owner?.[key];
  const method = owner?.[path[path.length - 1]];
  if (typeof method !== "function") {
    return Promise.reject(new Error(`Extension API unavailable: ${path.join(".")}`));
  }
  if (globalThis.browser && api === globalThis.browser) {
    try { return Promise.resolve(method.apply(owner, args)); }
    catch (error) { return Promise.reject(error); }
  }
  return new Promise((resolve, reject) => {
    try {
      method.apply(owner, [...args, (value) => {
        const message = callbackError();
        if (message) reject(new Error(message));
        else resolve(value);
      }]);
    } catch (error) {
      reject(error);
    }
  });
}

export function extensionApi() {
  return rootApi();
}

export function runtimeGetUrl(path = "") {
  const api = rootApi();
  if (!api?.runtime?.getURL) throw new Error("Extension runtime.getURL is unavailable");
  return api.runtime.getURL(path);
}

export function runtimeSendMessage(message) {
  return callPromise(["runtime", "sendMessage"], [message]);
}

export function tabsGetCurrent() {
  return callPromise(["tabs", "getCurrent"]);
}

export async function currentExtensionTab() {
  try {
    const tab = await tabsGetCurrent();
    return tab && typeof tab === "object" ? tab : null;
  } catch {
    return null;
  }
}

export async function currentExtensionTabId() {
  const tab = await currentExtensionTab();
  return Number.isInteger(tab?.id) ? tab.id : null;
}

export async function runtimeRequest(message) {
  const response = await runtimeSendMessage(message);
  if (!response?.success) throw new Error(response?.error || "extension request failed");
  return response;
}

export function tabsCreate(options) {
  return callPromise(["tabs", "create"], [options]);
}

export function tabsUpdate(tabId, options) {
  return callPromise(["tabs", "update"], [tabId, options]);
}

export function windowsUpdate(windowId, options) {
  return callPromise(["windows", "update"], [windowId, options]);
}

export function storageLocalGet(key) {
  return callPromise(["storage", "local", "get"], [key]);
}

export function storageLocalSet(value) {
  return callPromise(["storage", "local", "set"], [value]);
}

export function storageLocalRemove(key) {
  return callPromise(["storage", "local", "remove"], [key]);
}

export function permissionsContains(permissions) {
  return callPromise(["permissions", "contains"], [permissions]);
}

export function permissionsRequest(permissions) {
  return callPromise(["permissions", "request"], [permissions]);
}
