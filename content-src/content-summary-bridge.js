import { CONTENT_PROTOCOL } from "../shared/protocol.js";
import {
  CONTENT_RUNTIME_SUMMARY_BRIDGE_BUNDLE_IDENTITY,
  CONTENT_RUNTIME_SUMMARY_ISOLATED_BUNDLE_IDENTITY,
  CONTENT_RUNTIME_SUMMARY_MAIN_BUNDLE_IDENTITY
} from "../shared/content-runtime-version.generated.js";
import { EXECUTE_SUMMARY_USERSCRIPT_REQUEST } from "../shared/content-background-requests.js";
import {
  contentRuntimeBundleIdentityMatches,
  createContentRuntimeBundleIdentity
} from "../shared/content-runtime-identity.js";
import {
  buttonText,
  closest,
  copy,
  copyFirst,
  extractCopySequence,
  extractNativeCopyConversation,
  extractTurns,
  hasUserAndAssistant,
  merge,
  normalize,
  pageSummaryRequest,
  pageSummaryRuntimeState,
  qs,
  qsa,
  reveal,
  sleep,
  text,
  userscriptFindCopyButtons,
  visible
} from "./shared/summary-runtime.js";
import { createContentDocumentIdentity } from "./shared/content-document-identity.js";
import { runtimeRegistry } from "./shared/runtime-registry-client.js";
import { installContentCapability } from "./shared/command-router.js";
import { requestBackground } from "./shared/extension-runtime.js";
import { createSummaryCapability } from "./capabilities/summary-runtime.js";

function installSummaryBridgeCapability() {
  const runtimes = runtimeRegistry(window);
  const runtimeIdentity = createContentRuntimeBundleIdentity(CONTENT_RUNTIME_SUMMARY_BRIDGE_BUNDLE_IDENTITY);
  const mainRuntimeIdentity = createContentRuntimeBundleIdentity(CONTENT_RUNTIME_SUMMARY_MAIN_BUNDLE_IDENTITY);
  const isolatedRuntimeIdentity = createContentRuntimeBundleIdentity(CONTENT_RUNTIME_SUMMARY_ISOLATED_BUNDLE_IDENTITY);
  runtimes.registerBundle(runtimeIdentity);
  const { contentDocumentId } = createContentDocumentIdentity(window);
  const handlers = createSummaryCapability({
    buttonText,
    closest,
    copy,
    copyFirst,
    extractCopySequence,
    extractNativeCopyConversation,
    extractTurns,
    hasUserAndAssistant,
    merge,
    normalize,
    pageSummaryRequest,
    pageSummaryRuntimeState,
    qs,
    qsa,
    reveal,
    sleep,
    text,
    userscriptFindCopyButtons,
    visible,
    requestBackground,
    EXECUTE_SUMMARY_USERSCRIPT_REQUEST,
    contentDocumentId,
    runtimes,
    CONTENT_BRIDGE_VERSION: CONTENT_PROTOCOL.CONTENT_BRIDGE_VERSION,
    contentRuntimeBundleIdentityMatches,
    SUMMARY_MAIN_RUNTIME_IDENTITY: mainRuntimeIdentity,
    SUMMARY_ISOLATED_RUNTIME_IDENTITY: isolatedRuntimeIdentity,
    CONTENT_RUNTIME_IDENTITY: runtimeIdentity
  });
  installContentCapability(runtimes, {
    capability: "summary",
    owner: "content-capability:summary",
    version: runtimeIdentity.bundle.implementationVersion,
    routerVersion: runtimeIdentity.implementationVersion,
    handlers
  });
}

installSummaryBridgeCapability();
