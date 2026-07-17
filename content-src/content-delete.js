import { CONTENT_PROTOCOL } from "../shared/protocol.js";
import { CONTENT_RUNTIME_DELETE_BUNDLE_IDENTITY } from "../shared/content-runtime-version.generated.js";
import { createContentRuntimeBundleIdentity } from "../shared/content-runtime-identity.js";
import {
  DELETE_COMPLETION_STATE_VERSION,
  deleteConversationIdentityFromHref,
  deleteCompletionTargetState,
  normalizeDeleteFrameHref,
  sameDeleteConversationIdentity
} from "../shared/delete-completion.js";
import {
  EXECUTE_TOPIC_DELETE_USERSCRIPT_REQUEST,
  INSTALL_TOPIC_DELETE_USERSCRIPT_REQUEST
} from "../shared/content-background-requests.js";
import {
  activateElement,
  buttonText,
  classText,
  closest,
  matches,
  normalize,
  qs,
  qsa,
  reveal,
  sleep,
  text,
  visible
} from "./shared/summary-runtime.js";
import { createContentDocumentIdentity } from "./shared/content-document-identity.js";
import { runtimeRegistry } from "./shared/runtime-registry-client.js";
import { installContentCapability } from "./shared/command-router.js";
import { createDomRuntime } from "./shared/dom-runtime.js";
import { requestBackground } from "./shared/extension-runtime.js";
import { createDeleteCommonCapability } from "./capabilities/delete-common.js";
import { createDeleteSitesCapability } from "./capabilities/delete-sites.js";
import { createDeleteDeepSeekCapability } from "./capabilities/delete-deepseek.js";
import { createDeleteRuntimeCapability } from "./capabilities/delete-runtime.js";

export function installDeleteCapability() {
  const runtimes = runtimeRegistry(window);
  const runtimeIdentity = createContentRuntimeBundleIdentity(CONTENT_RUNTIME_DELETE_BUNDLE_IDENTITY);
  runtimes.registerBundle(runtimeIdentity);
  const { contentDocumentId } = createContentDocumentIdentity(window);
  const summaryDeps = {
    activateElement,
    buttonText,
    classText,
    closest,
    matches,
    normalize,
    qs,
    qsa,
    reveal,
    sleep,
    text,
    visible
  };
  const dom = createDomRuntime({
    ...summaryDeps,
    DELETE_CLICKABLE_SELECTOR: "button,[role='button'],[role='menuitem'],[role='option'],a[href],[aria-haspopup],[tabindex]:not([tabindex='-1']),[class*='button' i],[class*='btn' i]",
    assertPreferredModelRun() {},
    armPreferredModelFocusShield() {}
  });
  const common = createDeleteCommonCapability({
    ...summaryDeps,
    ...dom,
    deleteCompletionTargetState,
    DELETE_COMPLETION_STATE_VERSION
  });
  const waitForModel = async (getter, timeoutMs = 2500, intervalMs = 120) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const value = getter();
      if (value) return value;
      await sleep(intervalMs);
    }
    return getter();
  };
  const sites = createDeleteSitesCapability({ ...summaryDeps, ...dom, ...common, waitForModel });
  const deepSeek = createDeleteDeepSeekCapability({
    ...summaryDeps,
    ...dom,
    ...common,
    ...sites,
    waitForModel,
    DEEPSEEK_DELETE_SOURCE: CONTENT_PROTOCOL.DEEPSEEK_DELETE_SOURCE
  });
  const runtime = createDeleteRuntimeCapability({
    ...summaryDeps,
    ...dom,
    ...common,
    ...sites,
    ...deepSeek,
    waitForModel,
    PROTOCOL: CONTENT_PROTOCOL,
    requestBackground,
    EXECUTE_TOPIC_DELETE_USERSCRIPT_REQUEST,
    INSTALL_TOPIC_DELETE_USERSCRIPT_REQUEST,
    contentDocumentId,
    normalizeDeleteFrameHref,
    deleteConversationIdentityFromHref,
    sameDeleteConversationIdentity
  });
  installContentCapability(runtimes, {
    capability: "delete",
    owner: "content-capability:delete",
    version: runtimeIdentity.bundle.implementationVersion,
    routerVersion: runtimeIdentity.implementationVersion,
    handlers: {
      deleteThread: runtime.deleteThread,
      getDeleteConfirmState: (data) => common.topicDeleteConfirmState(
        data?.site || "topic-delete",
        data?.identity || null
      )
    }
  });
}

installDeleteCapability();
