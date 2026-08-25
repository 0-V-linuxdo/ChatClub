import { GROK_COOKIE_BRIDGE_VERSION } from "../shared/protocol.js";
import { CONTENT_RUNTIME_GROK_COOKIE_BRIDGE_BUNDLE_IDENTITY } from "../shared/content-runtime-version.generated.js";
import {
  ARM_GROK_MIRROR_ACCOUNT_SWITCH_REQUEST,
  SYNC_GROK_SESSION_COOKIES_REQUEST
} from "../shared/content-background-requests.js";
import { createContentRuntimeBundleIdentity } from "../shared/content-runtime-identity.js";
import { runtimeRegistry } from "./shared/runtime-registry.js";
import { requestBackground } from "./shared/extension-runtime.js";

function installGrokCookieBridge() {
  const runtimes = runtimeRegistry(window);
  const runtimeIdentity = createContentRuntimeBundleIdentity(CONTENT_RUNTIME_GROK_COOKIE_BRIDGE_BUNDLE_IDENTITY);
  runtimes.registerBundle(runtimeIdentity);
  const BRIDGE_VERSION = GROK_COOKIE_BRIDGE_VERSION;
  const INSTALLATION_VERSION = runtimeIdentity.bundle.implementationVersion;
  const INSTALLATION_KEY = "__CHATCLUB_GROK_COOKIE_BRIDGE_VERSION__";
  const RELOAD_MARKER = `chatclub:grok-cookie-bridge:reload:${INSTALLATION_VERSION}`;
  const MIRROR_ACCOUNT_SWITCH_ARM_TIMEOUT_MS = 9000;
  const supportedHosts = new Set(["grok.com", "gk.dairoot.cn", "manus.im"]);
  const extensionProtocol = (() => {
    try {
      const extensionApi = globalThis.browser || globalThis.chrome;
      return new URL(extensionApi?.runtime?.getURL?.("") || "").protocol;
    } catch {
      return "";
    }
  })();
  const accountSwitchInterceptionEnabled = extensionProtocol === "chrome-extension:";

  if (location.protocol !== "https:" || !supportedHosts.has(location.hostname.toLowerCase())) return;
  if (window.top === window) return;

  runtimes.install("grok-cookie-bridge-root", INSTALLATION_VERSION, () => {
    let disposed = false;
    let accountSwitching = false;
    let cancelAccountSwitchWait = () => {};
    const normalizedActionText = (element) => String(element?.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
    const mirrorAccountSwitchAction = (rawTarget) => {
      const target = rawTarget instanceof Element ? rawTarget : null;
      if (!target) return null;
      const floatingBall = target.closest("#floatingBall");
      if (
        floatingBall
        && floatingBall === document.getElementById("floatingBall")
        && document.querySelectorAll("#floatingBall").length === 1
        && floatingBall.matches("div#floatingBall")
        && normalizedActionText(floatingBall) === "换号"
      ) return floatingBall;
      const button = target.closest("button");
      const modal = button?.closest("#randomAccountModal");
      if (!button || !modal || modal !== document.getElementById("randomAccountModal")) return null;
      const explicitActions = [...modal.querySelectorAll(".modal-footer button.btn.btn-primary")];
      return explicitActions.length === 1
        && explicitActions[0] === button
        && normalizedActionText(button) === "确定"
        ? button
        : null;
    };
    const interceptMirrorAccountSwitch = (event) => {
      if (
        disposed
        || location.hostname.toLowerCase() !== "gk.dairoot.cn"
        || event?.isTrusted !== true
        || event?.button !== 0
        || event?.metaKey
        || event?.ctrlKey
        || event?.shiftKey
        || event?.altKey
      ) return;
      if (!mirrorAccountSwitchAction(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (accountSwitching) return;
      accountSwitching = true;
      const sourceDocument = document;
      const sourceHref = String(location.href || "");
      const continueNativeAccountSwitch = () => {
        if (
          disposed
          || document !== sourceDocument
          || location.protocol !== "https:"
          || location.hostname.toLowerCase() !== "gk.dairoot.cn"
          || String(location.href || "") !== sourceHref
        ) {
          accountSwitching = false;
          return false;
        }
        try {
          localStorage.removeItem("modes-selected-id");
          location.assign("/api/random-login");
          return true;
        } catch {
          accountSwitching = false;
          return false;
        }
      };
      const armResponseIsValid = (response) => Boolean(
        response
        && typeof response === "object"
        && !Array.isArray(response)
        && Object.keys(response).length === 3
        && response.success === true
        && typeof response.armed === "boolean"
        && typeof response.proceed === "boolean"
      );
      let armRequest;
      try {
        armRequest = requestBackground(
          ARM_GROK_MIRROR_ACCOUNT_SWITCH_REQUEST,
          { bridgeVersion: BRIDGE_VERSION }
        );
      } catch {
        accountSwitching = false;
        return;
      }
      let settled = false;
      let armTimer = 0;
      const settleArm = (response) => {
        if (settled) return;
        settled = true;
        if (armTimer) clearTimeout(armTimer);
        armTimer = 0;
        cancelAccountSwitchWait = () => {};
        if (armResponseIsValid(response) && response.proceed === true) {
          continueNativeAccountSwitch();
        } else {
          accountSwitching = false;
        }
      };
      cancelAccountSwitchWait = () => settleArm(null);
      armTimer = setTimeout(() => settleArm(null), MIRROR_ACCOUNT_SWITCH_ARM_TIMEOUT_MS);
      Promise.resolve(armRequest).then(settleArm, () => settleArm(null));
    };
    return {
      api: Object.freeze({ version: INSTALLATION_VERSION, runtimeIdentity }),
      activate() {
        if (disposed || globalThis[INSTALLATION_KEY] === `${INSTALLATION_VERSION}:pending`) return;
        if (accountSwitchInterceptionEnabled) {
          document.addEventListener("click", interceptMirrorAccountSwitch, true);
        }
        globalThis[INSTALLATION_KEY] = `${INSTALLATION_VERSION}:pending`;
        requestBackground(SYNC_GROK_SESSION_COOKIES_REQUEST, { bridgeVersion: BRIDGE_VERSION })
          .then((response) => {
            if (disposed || accountSwitching) return;
            if (!response.reloadRequired) {
              try { sessionStorage.removeItem(RELOAD_MARKER); } catch {}
              return;
            }
            let alreadyReloaded = false;
            try {
              const reloadTarget = `${location.origin || ""}${location.pathname || "/"}`;
              alreadyReloaded = sessionStorage.getItem(RELOAD_MARKER) === reloadTarget;
              if (!alreadyReloaded) sessionStorage.setItem(RELOAD_MARKER, reloadTarget);
            } catch {
              return;
            }
            if (!alreadyReloaded && !disposed) location.reload();
          })
          .catch(() => {})
          .finally(() => {
            if (globalThis[INSTALLATION_KEY] === `${INSTALLATION_VERSION}:pending`) {
              delete globalThis[INSTALLATION_KEY];
            }
          });
      },
      dispose() {
        disposed = true;
        cancelAccountSwitchWait();
        cancelAccountSwitchWait = () => {};
        if (accountSwitchInterceptionEnabled) {
          document.removeEventListener("click", interceptMirrorAccountSwitch, true);
        }
        if (globalThis[INSTALLATION_KEY] === `${INSTALLATION_VERSION}:pending`) {
          delete globalThis[INSTALLATION_KEY];
        }
      }
    };
  });
}

installGrokCookieBridge();
