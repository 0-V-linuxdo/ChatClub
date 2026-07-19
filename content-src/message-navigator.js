import { MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE } from "../shared/protocol.js";
import { CONTENT_RUNTIME_MESSAGE_NAVIGATOR_BUNDLE_IDENTITY } from "../shared/content-runtime-version.generated.js";
import { createContentRuntimeBundleIdentity } from "../shared/content-runtime-identity.js";
import { runtimeRegistry } from "./shared/runtime-registry-client.js";
import { installContentCapability } from "./shared/command-router.js";
import { createMessageNavigatorPort } from "./shared/message-navigator-port.js";
import { createMessageNavigatorAdapters } from "./message-navigator/adapters.js";
import { MESSAGE_NAVIGATOR_RUNTIME_NAME } from "./message-navigator/constants.js";
import { MessageNavigator } from "./message-navigator/engine.js";

const MESSAGE_NAVIGATOR_GLOBAL_NAME = "__CHATCLUB_MESSAGE_NAVIGATOR__";

function installMessageNavigator() {
  /*
   * ChatClub Message Navigator.
   * Adapted from Notion-style-AI-Navigator-main by 0-V-linuxdo under the MIT License.
   */
  const version = MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE.split(":").at(-1);
  const runtimes = runtimeRegistry(window);
  const runtimeIdentity = createContentRuntimeBundleIdentity(CONTENT_RUNTIME_MESSAGE_NAVIGATOR_BUNDLE_IDENTITY);
  runtimes.registerBundle(runtimeIdentity);
  const existing = runtimes.registration(MESSAGE_NAVIGATOR_RUNTIME_NAME);
  let navigatorRuntime = existing?.version === version ? existing.api : null;
  if (existing?.version === version) {
    if (runtimes.isActive) window[MESSAGE_NAVIGATOR_GLOBAL_NAME] = existing.api;
  } else {
    runtimes.invalidate(MESSAGE_NAVIGATOR_RUNTIME_NAME, `replaced by ${version}`);
    navigatorRuntime = new MessageNavigator({
      version,
      adapters: createMessageNavigatorAdapters()
    });
    runtimes.register(MESSAGE_NAVIGATOR_RUNTIME_NAME, {
      version,
      api: navigatorRuntime,
      activate() {
        const previous = window[MESSAGE_NAVIGATOR_GLOBAL_NAME];
        if (previous !== navigatorRuntime) {
          try { previous?.destroy?.(); } catch {}
          window[MESSAGE_NAVIGATOR_GLOBAL_NAME] = navigatorRuntime;
        }
      },
      dispose() {
        navigatorRuntime.destroy();
        if (window[MESSAGE_NAVIGATOR_GLOBAL_NAME] === navigatorRuntime) {
          delete window[MESSAGE_NAVIGATOR_GLOBAL_NAME];
        }
      }
    });
  }
  const port = createMessageNavigatorPort(runtimes);
  installContentCapability(runtimes, {
    capability: "message-navigator",
    owner: "content-capability:message-navigator",
    version: runtimeIdentity.bundle.implementationVersion,
    routerVersion: runtimeIdentity.implementationVersion,
    handlers: {
      setMessageNavigator: (data) => port.setEnabled(data),
      hideMessageNavigatorMenu: () => port.hideMenu(),
      getMessageNavigatorState: () => port.state()
    }
  });
}

installMessageNavigator();
