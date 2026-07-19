import { CONTENT_PROTOCOL } from "../shared/protocol.js";
import { CONTENT_RUNTIME_PREFERRED_MODEL_BUNDLE_IDENTITY } from "../shared/content-runtime-version.generated.js";
import { createContentRuntimeBundleIdentity } from "../shared/content-runtime-identity.js";
import {
  activateElement,
  closest,
  matches,
  normalize,
  qs,
  qsa,
  visible
} from "./shared/summary-runtime.js";
import { createContentDocumentIdentity } from "./shared/content-document-identity.js";
import { runtimeRegistry } from "./shared/runtime-registry-client.js";
import { installContentCapability } from "./shared/command-router.js";
import { createPreferredDomRuntime } from "./shared/dom-runtime.js";
import { createPreferredCommonCapability } from "./capabilities/preferred-common.js";
import { createPreferredGeminiCapability } from "./capabilities/preferred-gemini.js";
import { createPreferredGrokCapability } from "./capabilities/preferred-grok.js";
import { createPreferredNotionDeepSeekCapability } from "./capabilities/preferred-notion-deepseek.js";

function installPreferredModelCapability() {
  const runtimes = runtimeRegistry(window);
  const runtimeIdentity = createContentRuntimeBundleIdentity(CONTENT_RUNTIME_PREFERRED_MODEL_BUNDLE_IDENTITY);
  runtimes.registerBundle(runtimeIdentity);
  const { contentDocumentId } = createContentDocumentIdentity(window);
  const current = () => Boolean(
    runtimes.isActive
    && window.__CHATCLUB_CONTENT_BRIDGE_VERSION__ === runtimeIdentity.implementationVersion
  );
  const common = createPreferredCommonCapability({
    contentDocumentId,
    GEMINI_MODEL_PICKER_RUN_TOKEN_ATTRIBUTE: "data-chatclub-gemini-model-picker-run",
    PREFERRED_MODEL_FOCUS_SHIELD_LEASE_MS: 5000,
    PREFERRED_MODEL_FOCUS_SHIELD_ATTRIBUTE: "data-chatclub-preferred-model-focus-shield",
    PREFERRED_MODEL_FOCUS_SHIELD_RELEASE_GRACE_MS: 400,
    GEMINI_MODEL_PICKER_SOURCE: CONTENT_PROTOCOL.GEMINI_MODEL_PICKER_SOURCE,
    contentBridgeIsCurrent: current
  });
  const dom = createPreferredDomRuntime({
    activateElement,
    closest,
    normalize,
    qsa,
    visible,
    assertPreferredModelRun: common.assertPreferredModelRun,
    armPreferredModelFocusShield: common.armPreferredModelFocusShield
  });
  const gemini = createPreferredGeminiCapability({
    closest,
    matches,
    qsa,
    visible,
    armPreferredModelFocusShield: common.armPreferredModelFocusShield,
    assertPreferredModelRun: common.assertPreferredModelRun,
    preferredModelResult: common.preferredModelResult,
    requestGeminiModelPickerBridgeOpen: common.requestGeminiModelPickerBridgeOpen,
    waitForPreferredModel: common.waitForPreferredModel,
    compactModelText: dom.compactModelText,
    firstVisibleBySelectors: dom.firstVisibleBySelectors,
    isDisabledElement: dom.isDisabledElement,
    modelElementArea: dom.modelElementArea,
    modelElementText: dom.modelElementText,
    modelEventConstructor: dom.modelEventConstructor,
    modelRect: dom.modelRect,
    parseBooleanAttr: dom.parseBooleanAttr,
    preferredModelActivate: dom.preferredModelActivate,
    visibleSelectorElements: dom.visibleSelectorElements
  });
  const grok = createPreferredGrokCapability({
    closest,
    matches,
    normalize,
    qs,
    qsa,
    visible,
    assertPreferredModelRun: common.assertPreferredModelRun,
    preferredModelResult: common.preferredModelResult,
    preferredModelSleep: common.preferredModelSleep,
    waitForPreferredModel: common.waitForPreferredModel,
    dismissPreferredModelMenu: gemini.dismissPreferredModelMenu,
    alnumModelToken: dom.alnumModelToken,
    compactModelText: dom.compactModelText,
    isDisabledElement: dom.isDisabledElement,
    modelElementArea: dom.modelElementArea,
    modelElementText: dom.modelElementText,
    modelRect: dom.modelRect,
    parseBooleanAttr: dom.parseBooleanAttr,
    preferredModelActivate: dom.preferredModelActivate,
    preferredModelPointerActivate: dom.preferredModelPointerActivate,
    visibleSelectorElements: dom.visibleSelectorElements
  });
  const handlers = createPreferredNotionDeepSeekCapability({
    closest,
    normalize,
    visible,
    abortActivePreferredModelRun: common.abortActivePreferredModelRun,
    assertPreferredModelRun: common.assertPreferredModelRun,
    nextPreferredModelBridgeRunSequence: common.nextPreferredModelBridgeRunSequence,
    preferredModelAbortReason: common.preferredModelAbortReason,
    preferredModelCancelled: common.preferredModelCancelled,
    preferredModelResult: common.preferredModelResult,
    preferredModelSleep: common.preferredModelSleep,
    preferredModelState: common.preferredModelState,
    publishPreferredModelBridgeRun: common.publishPreferredModelBridgeRun,
    releasePreferredModelBridgeRun: common.releasePreferredModelBridgeRun,
    waitForPreferredModel: common.waitForPreferredModel,
    modelResult: common.modelResult,
    applyGeminiPreferredModel: gemini.applyGeminiPreferredModel,
    dismissPreferredModelMenu: gemini.dismissPreferredModelMenu,
    applyGrokPreferredModel: grok.applyGrokPreferredModel,
    alnumModelToken: dom.alnumModelToken,
    isDisabledElement: dom.isDisabledElement,
    modelElementArea: dom.modelElementArea,
    modelElementText: dom.modelElementText,
    modelRect: dom.modelRect,
    preferredModelActivate: dom.preferredModelActivate,
    visibleSelectorElements: dom.visibleSelectorElements
  });
  installContentCapability(runtimes, {
    capability: "preferred-model",
    owner: "content-capability:preferred-model",
    version: runtimeIdentity.bundle.implementationVersion,
    routerVersion: runtimeIdentity.implementationVersion,
    handlers: {
      applyPreferredModel: handlers.runPreferredModelApply,
      cancelPreferredModelApply: handlers.cancelPreferredModelApply
    },
    dispose: () => common.abortActivePreferredModelRun("preferred model capability disposed")
  });
}

installPreferredModelCapability();
