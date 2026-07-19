import { GROK_COOKIE_BRIDGE_VERSION } from "../shared/protocol.js";
import { CONTENT_RUNTIME_GROK_COOKIE_BRIDGE_BUNDLE_IDENTITY } from "../shared/content-runtime-version.generated.js";
import { SYNC_GROK_SESSION_COOKIES_REQUEST } from "../shared/content-background-requests.js";
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

  if (location.protocol !== "https:" || location.hostname.toLowerCase() !== "grok.com") return;
  if (window.top === window) return;

  runtimes.install("grok-cookie-bridge-root", INSTALLATION_VERSION, () => {
    let disposed = false;
    return {
      api: Object.freeze({ version: INSTALLATION_VERSION, runtimeIdentity }),
      activate() {
        if (disposed || globalThis[INSTALLATION_KEY] === `${INSTALLATION_VERSION}:pending`) return;
        globalThis[INSTALLATION_KEY] = `${INSTALLATION_VERSION}:pending`;
        requestBackground(SYNC_GROK_SESSION_COOKIES_REQUEST, { bridgeVersion: BRIDGE_VERSION })
          .then((response) => {
            if (disposed) return;
            if (!response.reloadRequired) {
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
        if (globalThis[INSTALLATION_KEY] === `${INSTALLATION_VERSION}:pending`) {
          delete globalThis[INSTALLATION_KEY];
        }
      }
    };
  });
}

installGrokCookieBridge();
