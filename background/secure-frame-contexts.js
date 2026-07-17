import { APP_NAME } from "../shared/constants.js";
import { normalizeContentRuntimeIdentity } from "../shared/content-runtime-identity.js";
import {
  assertContentRuntimePackageBundleIdentity,
  contentRuntimePackageBundleIdentityMatches
} from "../shared/content-runtime-package-identity.js";

const FRAME_CONTEXT_SESSION_KEY = "chatclubSecureFrameContexts";
const FRAME_CONTEXT_MAX_AGE_MS = 30 * 60 * 1000;
const FRAME_CONTEXT_MAX_ENTRIES = 512;

export function createSecureFrameContextRegistry(api) {
  if (!api?.runtime || !api?.webNavigation) throw new TypeError("Secure frame context registry requires the extension API");
  const contexts = new Map();
  let hydration = null;
  let writeChain = Promise.resolve();

  function frameContextToken(value) {
    const token = String(value || "").trim();
    return /^[a-z0-9][a-z0-9._:-]{8,191}$/i.test(token) ? token : "";
  }

  function frameBindingToken(value) {
    const token = String(value || "").trim();
    return /^[a-f0-9]{64}$/i.test(token) ? token : "";
  }

  function prune(now = Date.now()) {
    for (const [token, context] of contexts) {
      if (!context || now - Number(context.registeredAt || 0) > FRAME_CONTEXT_MAX_AGE_MS) contexts.delete(token);
    }
    if (contexts.size <= FRAME_CONTEXT_MAX_ENTRIES) return;
    const oldest = [...contexts.entries()]
      .sort((a, b) => Number(a[1]?.registeredAt || 0) - Number(b[1]?.registeredAt || 0));
    for (const [token] of oldest.slice(0, contexts.size - FRAME_CONTEXT_MAX_ENTRIES)) contexts.delete(token);
  }

  function serialized() {
    prune();
    return Object.fromEntries(contexts);
  }

  function hydrate() {
    if (hydration) return hydration;
    hydration = (async () => {
      try {
        const stored = await api.storage.session?.get?.(FRAME_CONTEXT_SESSION_KEY);
        const entries = stored?.[FRAME_CONTEXT_SESSION_KEY];
        if (entries && typeof entries === "object" && !Array.isArray(entries)) {
          for (const [rawToken, context] of Object.entries(entries)) {
            const token = frameContextToken(rawToken);
            if (!token || !context || typeof context !== "object") continue;
            const runtimeIdentity = normalizeContentRuntimeIdentity(context.runtimeIdentity);
            if (!contentRuntimePackageBundleIdentityMatches(runtimeIdentity, "content/content.js")) continue;
            contexts.set(token, {
              ...context,
              runtimeIdentity,
              browserDocumentId: String(context.browserDocumentId || context.documentId || ""),
              legacyDocumentId: String(context.legacyDocumentId || "")
            });
          }
        }
      } catch (error) {
        console.warn(`[${APP_NAME}] secure frame registry could not be restored`, error);
      }
      prune();
    })();
    return hydration;
  }

  function persist() {
    if (!api.storage.session?.set) return Promise.resolve();
    const value = serialized();
    writeChain = writeChain
      .catch(() => {})
      .then(() => api.storage.session.set({ [FRAME_CONTEXT_SESSION_KEY]: value }))
      .catch((error) => console.warn(`[${APP_NAME}] secure frame registry could not be saved`, error));
    return writeChain;
  }

  async function register(message = {}, sender = {}) {
    const token = frameContextToken(message.bridgeDocumentId);
    const frameBindingId = frameBindingToken(message.frameBindingId);
    const secureToken = /^[a-f0-9]{32,128}$/i.test(String(message.secureFrameToken || ""))
      ? String(message.secureFrameToken)
      : "";
    const tabId = sender?.tab?.id;
    const frameId = sender?.frameId;
    const senderUrl = String(sender?.url || "").trim();
    const runtimeIdentity = assertContentRuntimePackageBundleIdentity(
      message.runtimeIdentity,
      "content/content.js",
      "Secure frame runtime identity"
    );
    if (String(message.bridgeVersion || "") !== runtimeIdentity.protocolVersion) {
      throw new Error("Secure frame protocol version does not match its runtime identity");
    }
    if (!token || !secureToken || !frameBindingId || !Number.isInteger(tabId) || !Number.isInteger(frameId) || frameId <= 0 || !/^https?:\/\//i.test(senderUrl)) {
      throw new Error("Secure frame registration is invalid");
    }
    if (!String(sender?.tab?.url || "").startsWith(api.runtime.getURL(""))) {
      throw new Error("Secure frame registration requires a direct child of the ChatClub extension page");
    }
    const frame = await api.webNavigation.getFrame({ tabId, frameId });
    if (!frame || frame.parentFrameId !== 0 || String(frame.url || "") !== senderUrl) {
      throw new Error("Secure frame registration does not match a direct child document");
    }
    const senderDocumentId = String(sender?.documentId || "").trim();
    const navigationDocumentId = String(frame.documentId || "").trim();
    const legacyDocumentId = /^legacy:[a-f0-9]{64}$/i.test(String(message.browserDocumentId || ""))
      ? String(message.browserDocumentId)
      : "";
    if (senderDocumentId && navigationDocumentId && senderDocumentId !== navigationDocumentId) {
      throw new Error("Secure frame registration document changed");
    }
    const documentId = senderDocumentId || navigationDocumentId;
    const browserDocumentId = documentId || legacyDocumentId;
    if (!browserDocumentId) throw new Error("Secure frame registration browser document is unavailable");
    await hydrate();
    for (const [existingToken, context] of contexts) {
      if (context?.tabId === tabId && context?.frameId === frameId && existingToken !== token) contexts.delete(existingToken);
    }
    const context = {
      tabId,
      frameId,
      documentId,
      browserDocumentId,
      legacyDocumentId,
      url: senderUrl,
      frameBindingId,
      secureToken,
      bridgeVersion: String(message.bridgeVersion || ""),
      runtimeIdentity,
      registeredAt: Date.now()
    };
    contexts.set(token, context);
    prune();
    await persist();
    return context;
  }

  async function context(token) {
    await hydrate();
    prune();
    return contexts.get(frameContextToken(token)) || null;
  }

  function remember(token, value) {
    contexts.set(token, value);
    persist();
  }

  async function registeredSenderContext(message = {}, sender = {}) {
    const token = frameContextToken(message.bridgeDocumentId);
    const frameBindingId = frameBindingToken(message.frameBindingId);
    const registered = await context(token);
    if (!registered || registered.tabId !== sender?.tab?.id || registered.frameId !== sender?.frameId) {
      throw new Error("Runtime relay sender is not the registered frame document");
    }
    if (!contentRuntimePackageBundleIdentityMatches(registered.runtimeIdentity, "content/content.js")) {
      throw new Error("Runtime relay sender generation is stale");
    }
    const senderDocumentId = String(sender?.documentId || "").trim();
    const contextDocumentId = String(registered.documentId || "").trim();
    const contextBrowserDocumentId = String(registered.browserDocumentId || contextDocumentId).trim();
    const contextLegacyDocumentId = String(registered.legacyDocumentId || "").trim();
    const claimedBrowserDocumentId = String(message.browserDocumentId || "").trim();
    if (contextDocumentId && senderDocumentId && contextDocumentId !== senderDocumentId) {
      throw new Error("Runtime relay sender document changed");
    }
    const browserDocumentMatches = senderDocumentId
      ? senderDocumentId === contextBrowserDocumentId
      : claimedBrowserDocumentId === contextBrowserDocumentId
        || (/^legacy:[a-f0-9]{64}$/i.test(claimedBrowserDocumentId) && claimedBrowserDocumentId === contextLegacyDocumentId);
    if (!contextBrowserDocumentId || !browserDocumentMatches) throw new Error("Runtime relay browser document changed");
    if (!frameBindingId || frameBindingId !== registered.frameBindingId) throw new Error("Runtime relay frame binding changed");
    return { token, context: registered };
  }

  return Object.freeze({
    context,
    frameBindingToken,
    frameContextToken,
    persist,
    register,
    registeredSenderContext,
    remember
  });
}
