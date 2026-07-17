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
  sleep,
  visible
} from "./shared/summary-runtime.js";
import { createContentDocumentIdentity } from "./shared/content-document-identity.js";
import { runtimeRegistry } from "./shared/runtime-registry-client.js";
import { installContentCapability } from "./shared/command-router.js";
import { createDomRuntime } from "./shared/dom-runtime.js";
import { createPreferredCommonCapability } from "./capabilities/preferred-common.js";
import { createPreferredGeminiCapability } from "./capabilities/preferred-gemini.js";
import { createPreferredGrokCapability } from "./capabilities/preferred-grok.js";
import { createPreferredNotionDeepSeekCapability } from "./capabilities/preferred-notion-deepseek.js";

export function installPreferredModelCapability() {
  const runtimes = runtimeRegistry(window);
  const runtimeIdentity = createContentRuntimeBundleIdentity(CONTENT_RUNTIME_PREFERRED_MODEL_BUNDLE_IDENTITY);
  runtimes.registerBundle(runtimeIdentity);
  const { contentDocumentId } = createContentDocumentIdentity(window);
  const current = () => Boolean(
    runtimes.isActive
    && window.__CHATCLUB_CONTENT_BRIDGE_VERSION__ === runtimeIdentity.implementationVersion
  );
  let common = null;
  const summaryDeps = { activateElement, closest, matches, normalize, qs, qsa, sleep, visible };
  const dom = createDomRuntime({
    ...summaryDeps,
    DELETE_CLICKABLE_SELECTOR: "button,[role='button'],[role='menuitem'],[role='option'],[tabindex]:not([tabindex='-1'])",
    assertPreferredModelRun: (...args) => common.assertPreferredModelRun(...args),
    armPreferredModelFocusShield: (...args) => common.armPreferredModelFocusShield(...args)
  });
  common = createPreferredCommonCapability({
    ...summaryDeps,
    ...dom,
    contentDocumentId,
    GEMINI_MODEL_PICKER_RUN_TOKEN_ATTRIBUTE: "data-chatclub-gemini-model-picker-run",
    PREFERRED_MODEL_FOCUS_SHIELD_LEASE_MS: 5000,
    PREFERRED_MODEL_FOCUS_SHIELD_ATTRIBUTE: "data-chatclub-preferred-model-focus-shield",
    PREFERRED_MODEL_FOCUS_SHIELD_RELEASE_GRACE_MS: 400,
    GEMINI_MODEL_PICKER_SOURCE: CONTENT_PROTOCOL.GEMINI_MODEL_PICKER_SOURCE,
    contentBridgeIsCurrent: current
  });
  const gemini = createPreferredGeminiCapability({ ...summaryDeps, ...dom, ...common });
  const grok = createPreferredGrokCapability({ ...summaryDeps, ...dom, ...common, ...gemini });
  const handlers = createPreferredNotionDeepSeekCapability({
    ...summaryDeps,
    ...dom,
    ...common,
    ...gemini,
    ...grok
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
