import { CONTENT_PROTOCOL } from "../shared/protocol.js";
import { CONTENT_RUNTIME_SEND_BUNDLE_IDENTITY } from "../shared/content-runtime-version.generated.js";
import { createContentRuntimeBundleIdentity } from "../shared/content-runtime-identity.js";
import {
  buttonText,
  compareText,
  normalize,
  qsa,
  sleep,
  text,
  visible
} from "./shared/summary-runtime.js";
import { createSubmissionNavigationTracker } from "./shared/submission-navigation.js";
import { runtimeRegistry } from "./shared/runtime-registry-client.js";
import { installContentCapability } from "./shared/command-router.js";
import { isDisabledElement } from "./shared/dom-runtime.js";
import { createSendCapability } from "./capabilities/send-runtime.js";

function installSendCapability() {
  const runtimes = runtimeRegistry(window);
  const runtimeIdentity = createContentRuntimeBundleIdentity(CONTENT_RUNTIME_SEND_BUNDLE_IDENTITY);
  runtimes.registerBundle(runtimeIdentity);
  const submissionNavigation = createSubmissionNavigationTracker(window);
  const handlers = createSendCapability({
    qsa,
    visible,
    normalize,
    isDisabledElement,
    sleep,
    buttonText,
    compareText,
    text,
    PROMPT_IMAGE_PASTE_STRATEGY_BATCH: "batch",
    NOTION_SEND_PROMPT_SOURCE: CONTENT_PROTOCOL.NOTION_SEND_PROMPT_SOURCE,
    NOTION_SEND_PROMPT_EVENT: CONTENT_PROTOCOL.NOTION_SEND_PROMPT_EVENT,
    NOTION_SEND_TEXT_SOURCE: CONTENT_PROTOCOL.NOTION_SEND_TEXT_SOURCE,
    NOTION_SEND_TEXT_EVENT: CONTENT_PROTOCOL.NOTION_SEND_TEXT_EVENT,
    contentBridgeIsCurrent: () => Boolean(
      runtimes.isActive
      && window.__CHATCLUB_CONTENT_BRIDGE_VERSION__ === runtimeIdentity.implementationVersion
    ),
    markSubmissionNavigation: submissionNavigation.mark
  });
  installContentCapability(runtimes, {
    capability: "send",
    owner: "content-capability:send",
    version: runtimeIdentity.bundle.implementationVersion,
    routerVersion: runtimeIdentity.implementationVersion,
    handlers
  });
}

installSendCapability();
