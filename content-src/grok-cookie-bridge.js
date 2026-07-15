import { GROK_COOKIE_BRIDGE_VERSION } from "../shared/protocol.js";

export function installGrokCookieBridge() {
  const EXTENSION_API = globalThis.browser || globalThis.chrome;
  const BRIDGE_VERSION = GROK_COOKIE_BRIDGE_VERSION;
  const INSTALLATION_KEY = "__CHATCLUB_GROK_COOKIE_BRIDGE_VERSION__";
  const RELOAD_MARKER = `chatclub:grok-cookie-bridge:reload:${BRIDGE_VERSION}`;

  if (location.protocol !== "https:" || location.hostname.toLowerCase() !== "grok.com") return;
  if (window.top === window) return;
  if (globalThis[INSTALLATION_KEY] === `${BRIDGE_VERSION}:pending`) return;
  globalThis[INSTALLATION_KEY] = `${BRIDGE_VERSION}:pending`;

  function sendMessage(message) {
    const promiseRuntime = globalThis.browser?.runtime;
    if (promiseRuntime?.sendMessage) return promiseRuntime.sendMessage(message);
    return new Promise((resolve, reject) => {
      if (!EXTENSION_API?.runtime?.sendMessage) {
        reject(new Error("Extension runtime messaging is unavailable"));
        return;
      }
      EXTENSION_API.runtime.sendMessage(message, (response) => {
        const runtimeError = EXTENSION_API.runtime.lastError?.message;
        if (runtimeError) reject(new Error(runtimeError));
        else resolve(response);
      });
    });
  }

  sendMessage({ source: "chatclub", action: "syncGrokSessionCookies", bridgeVersion: BRIDGE_VERSION })
    .then((response) => {
      if (!response?.success || !response.reloadRequired) {
        try { sessionStorage.removeItem(RELOAD_MARKER); } catch {}
        return;
      }
      let alreadyReloaded = false;
      try {
        alreadyReloaded = sessionStorage.getItem(RELOAD_MARKER) === location.href;
        if (!alreadyReloaded) sessionStorage.setItem(RELOAD_MARKER, location.href);
      } catch {
        return;
      }
      if (!alreadyReloaded) location.reload();
    })
    .catch(() => {})
    .finally(() => {
      if (globalThis[INSTALLATION_KEY] === `${BRIDGE_VERSION}:pending`) {
        delete globalThis[INSTALLATION_KEY];
      }
    });
}

installGrokCookieBridge();
