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
  qsa,
  reveal,
  sleep,
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

function installDeleteCapability() {
  const runtimes = runtimeRegistry(window);
  const runtimeIdentity = createContentRuntimeBundleIdentity(CONTENT_RUNTIME_DELETE_BUNDLE_IDENTITY);
  runtimes.registerBundle(runtimeIdentity);
  const { contentDocumentId } = createContentDocumentIdentity(window);
  const dom = createDomRuntime({ activateElement, closest, normalize, qsa, visible });
  const common = createDeleteCommonCapability({
    activateElement,
    buttonText,
    classText,
    closest,
    normalize,
    qsa,
    sleep,
    visible,
    deleteCompletionTargetState,
    DELETE_COMPLETION_STATE_VERSION,
    dispatchPointerActivation: dom.dispatchPointerActivation,
    isDisabledElement: dom.isDisabledElement,
    modelCenterPoint: dom.modelCenterPoint,
    modelClick: dom.modelClick,
    modelClickableAncestor: dom.modelClickableAncestor,
    modelCustomActivationAncestor: dom.modelCustomActivationAncestor,
    modelDirectClick: dom.modelDirectClick,
    modelElementArea: dom.modelElementArea,
    modelElementFromPoint: dom.modelElementFromPoint,
    modelElementText: dom.modelElementText,
    modelEventConstructor: dom.modelEventConstructor,
    modelRect: dom.modelRect,
    nativeModelClick: dom.nativeModelClick,
    visibleSelectorElements: dom.visibleSelectorElements
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
  const sites = createDeleteSitesCapability({
    closest,
    matches,
    normalize,
    qsa,
    sleep,
    visible,
    deleteActivateUntil: common.deleteActivateUntil,
    DELETE_CANCEL_LABELS: common.DELETE_CANCEL_LABELS,
    deleteClick: common.deleteClick,
    deleteClickableElement: common.deleteClickableElement,
    deleteClickLayout: common.deleteClickLayout,
    deleteCompactToken: common.deleteCompactToken,
    deleteDialogRoots: common.deleteDialogRoots,
    deleteElementText: common.deleteElementText,
    deleteLabelMatches: common.deleteLabelMatches,
    deleteLabelMatchesExactish: common.deleteLabelMatchesExactish,
    deleteResult: common.deleteResult,
    deleteResultWithTrustedConfirm: common.deleteResultWithTrustedConfirm,
    deleteResultWithTrustedDeleteShortcut: common.deleteResultWithTrustedDeleteShortcut,
    deleteResultWithTrustedMenuClick: common.deleteResultWithTrustedMenuClick,
    dispatchDeleteKeyboardShortcut: common.dispatchDeleteKeyboardShortcut,
    clickDeleteConfirmIfAppears: common.clickDeleteConfirmIfAppears,
    clickDeleteConfirmIfPresent: common.clickDeleteConfirmIfPresent,
    findDeleteConfirmButton: common.findDeleteConfirmButton,
    isDisabledElement: dom.isDisabledElement,
    modelElementArea: dom.modelElementArea,
    modelRect: dom.modelRect,
    svgSignature: common.svgSignature,
    visibleDeleteCandidates: common.visibleDeleteCandidates,
    visibleSelectorElements: dom.visibleSelectorElements,
    waitForModel
  });
  const deepSeek = createDeleteDeepSeekCapability({
    closest,
    normalize,
    qsa,
    reveal,
    sleep,
    visible,
    deleteActivateUntil: common.deleteActivateUntil,
    deleteClick: common.deleteClick,
    deleteClickableElement: common.deleteClickableElement,
    deleteClickLayout: common.deleteClickLayout,
    deleteCompactToken: common.deleteCompactToken,
    deleteElementText: common.deleteElementText,
    deleteResult: common.deleteResult,
    findDeleteConfirmButton: common.findDeleteConfirmButton,
    clickDeleteConfirmIfPresent: common.clickDeleteConfirmIfPresent,
    layoutDeleteCandidates: common.layoutDeleteCandidates,
    serializableDeleteRect: common.serializableDeleteRect,
    svgSignature: common.svgSignature,
    trustedMenuClickForElement: common.trustedMenuClickForElement,
    trustedMenuClickPoint: common.trustedMenuClickPoint,
    dispatchPointerActivation: dom.dispatchPointerActivation,
    firstVisibleBySelectors: dom.firstVisibleBySelectors,
    isDisabledElement: dom.isDisabledElement,
    modelDirectClick: dom.modelDirectClick,
    modelElementArea: dom.modelElementArea,
    modelElementFromPoint: dom.modelElementFromPoint,
    modelEventConstructor: dom.modelEventConstructor,
    modelRect: dom.modelRect,
    nativeModelClick: dom.nativeModelClick,
    visibleSelectorElements: dom.visibleSelectorElements,
    findDeleteMenuItem: sites.findDeleteMenuItem,
    findOpenDeleteMenuItem: sites.findOpenDeleteMenuItem,
    menuRootsWithDelete: sites.menuRootsWithDelete,
    waitForModel,
    DEEPSEEK_DELETE_SOURCE: CONTENT_PROTOCOL.DEEPSEEK_DELETE_SOURCE
  });
  const runtime = createDeleteRuntimeCapability({
    normalize,
    deleteCompactToken: common.deleteCompactToken,
    deleteResult: common.deleteResult,
    deleteChatGptThread: sites.deleteChatGptThread,
    deleteGeminiThread: sites.deleteGeminiThread,
    deleteGrokThread: sites.deleteGrokThread,
    deleteKagiThread: sites.deleteKagiThread,
    deleteNotionThread: sites.deleteNotionThread,
    deleteDeepSeekThread: deepSeek.deleteDeepSeekThread,
    sanitizeDeepSeekTrustedResult: deepSeek.sanitizeDeepSeekTrustedResult,
    TOPIC_DELETE_FALLBACK_CONFIGS: deepSeek.TOPIC_DELETE_FALLBACK_CONFIGS,
    validateDeepSeekTrustedCoordinates: deepSeek.validateDeepSeekTrustedCoordinates,
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
