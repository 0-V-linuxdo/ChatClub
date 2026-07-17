const FRAME_LIFECYCLE_ACTIONS = new Set(["locationChanged", "contentUnloading"]);

function relaySenderContext(token, context = {}) {
  return {
    tabId: context.tabId,
    frameId: context.frameId,
    documentId: context.browserDocumentId || context.documentId,
    bridgeDocumentId: token,
    frameBindingId: context.frameBindingId,
    url: context.url
  };
}

export function createAuthenticatedFrameRelay(options = {}) {
  const authenticate = options.registeredSenderContext;
  const sendRuntimeMessage = options.sendRuntimeMessage;
  const relaySource = String(options.relaySource || "");
  const shortcutActions = options.shortcutActions;
  const rememberContext = options.rememberContext;
  if (
    typeof authenticate !== "function"
    || typeof sendRuntimeMessage !== "function"
    || !relaySource
    || !(shortcutActions instanceof Set)
    || typeof rememberContext !== "function"
  ) throw new TypeError("Authenticated frame relay dependencies are incomplete");

  async function shortcutTriggered(message = {}, sender = {}) {
    const action = String(message.shortcutAction || "");
    const { token, context } = await authenticate(message, sender);
    if (!shortcutActions.has(action)) throw new Error(`Unknown shortcut action: ${action}`);
    const digit = /^([1-9])$/.exec(String(message.matchObj?.digit || ""))?.[1];
    await sendRuntimeMessage({
      source: relaySource,
      action: "shortcutTriggered",
      shortcutAction: action,
      matchObj: digit ? { digit } : {},
      senderContext: relaySenderContext(token, context)
    });
  }

  async function frameBinding(message = {}, sender = {}) {
    const challenge = String(message.challenge || "");
    const generation = Number(message.generation);
    const browserDocumentId = String(message.browserDocumentId || "").trim();
    if (
      !/^[a-f0-9]{64}$/i.test(challenge)
      || !Number.isSafeInteger(generation)
      || generation <= 0
      || !browserDocumentId
    ) {
      throw new Error("Secure frame binding challenge is invalid");
    }
    const { token, context } = await authenticate(message, sender);
    if (!context.browserDocumentId || String(context.browserDocumentId) !== browserDocumentId) {
      throw new Error("Secure frame binding browser document changed");
    }
    await sendRuntimeMessage({
      source: relaySource,
      action: "frameBinding",
      challenge,
      generation,
      senderContext: relaySenderContext(token, context),
      data: {
        documentId: token,
        browserDocumentId,
        frameBindingId: context.frameBindingId,
        bridgeVersion: context.bridgeVersion,
        runtimeIdentity: context.runtimeIdentity
      }
    });
  }

  async function frameLifecycle(message = {}, sender = {}) {
    const action = String(message.lifecycleAction || "");
    if (!FRAME_LIFECYCLE_ACTIONS.has(action)) throw new Error(`Unknown frame lifecycle action: ${action}`);
    const { token, context } = await authenticate(message, sender);
    const data = message.data && typeof message.data === "object" ? message.data : {};
    if (action === "locationChanged" && /^https?:\/\//i.test(String(data.href || ""))) {
      context.url = String(data.href);
      context.registeredAt = Date.now();
      rememberContext(token, context);
    }
    await sendRuntimeMessage({
      source: relaySource,
      action: "frameLifecycle",
      lifecycleAction: action,
      senderContext: relaySenderContext(token, context),
      data: {
        ...data,
        documentId: token,
        bridgeVersion: context.bridgeVersion,
        runtimeIdentity: context.runtimeIdentity
      }
    });
  }

  return Object.freeze({ frameBinding, frameLifecycle, shortcutTriggered });
}
