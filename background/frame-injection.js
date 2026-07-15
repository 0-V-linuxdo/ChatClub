function messageText(error) {
  return String(error?.message || error || "");
}

export function documentTargetUnsupported(error) {
  const message = messageText(error);
  return /\bdocumentIds?\b/i.test(message)
    && /(?:not\s+supported|unsupported|unexpected|unknown|unrecognized|invalid\s+(?:property|key|field))/i.test(message);
}

function extensionBase(api) {
  const value = String(api?.runtime?.getURL?.("") || "");
  if (!/^[a-z][a-z0-9+.-]*:\/\/[^/]+\/$/i.test(value)) {
    throw new Error("Packaged userscript injection requires an extension runtime origin");
  }
  return value;
}

function senderFrameIdentity(api, sender = {}) {
  const tabId = sender?.tab?.id;
  const frameId = sender?.frameId;
  const senderUrl = String(sender?.url || "").trim();
  const base = extensionBase(api);
  if (sender?.id && sender.id !== api.runtime.id) {
    throw new Error("Packaged userscript injection sender is not this extension");
  }
  if (!Number.isInteger(tabId) || !Number.isInteger(frameId) || frameId <= 0) {
    throw new Error("Packaged userscript injection requires a child frame sender");
  }
  if (!/^https?:\/\//i.test(senderUrl)) {
    throw new Error("Packaged userscript injection requires an HTTP(S) sender");
  }
  if (!String(sender?.tab?.url || "").startsWith(base)) {
    throw new Error("Packaged userscript injection requires the ChatClub extension tab");
  }
  return { tabId, frameId, senderUrl };
}

export async function verifiedDirectChildFrameContext(api, sender = {}, expected = null) {
  if (!api?.webNavigation?.getFrame) {
    throw new Error("Packaged userscript frame verification API is unavailable");
  }
  const identity = senderFrameIdentity(api, sender);
  const frame = await api.webNavigation.getFrame({
    tabId: identity.tabId,
    frameId: identity.frameId
  });
  if (
    !frame
    || (Number.isInteger(frame.tabId) && frame.tabId !== identity.tabId)
    || (Number.isInteger(frame.frameId) && frame.frameId !== identity.frameId)
    || frame.parentFrameId !== 0
    || String(frame.url || "") !== identity.senderUrl
  ) {
    throw new Error("Packaged userscript injection frame is not the verified direct child document");
  }
  const senderDocumentId = String(sender?.documentId || "").trim();
  const navigationDocumentId = String(frame.documentId || "").trim();
  if (senderDocumentId && navigationDocumentId && senderDocumentId !== navigationDocumentId) {
    throw new Error("Packaged userscript injection document changed");
  }
  const context = {
    ...identity,
    documentId: senderDocumentId || navigationDocumentId
  };
  if (
    expected
    && (
      context.tabId !== expected.tabId
      || context.frameId !== expected.frameId
      || context.senderUrl !== expected.senderUrl
      || (expected.documentId && context.documentId && context.documentId !== expected.documentId)
    )
  ) {
    throw new Error("Packaged userscript injection frame changed before fallback");
  }
  return Object.freeze(context);
}

export async function executeVerifiedPackagedFrameFile(api, sender, file, options = {}) {
  const scriptFile = String(file || "").trim();
  if (!scriptFile) throw new Error("Packaged userscript file is unavailable");
  if (!api?.scripting?.executeScript) throw new Error("Packaged userscript injection API is unavailable");
  const context = await verifiedDirectChildFrameContext(api, sender);
  const frameTarget = { tabId: context.tabId, frameIds: [context.frameId] };
  const execute = (target) => api.scripting.executeScript({
    target,
    files: [scriptFile],
    world: String(options.world || "MAIN")
  });
  if (!context.documentId) return execute(frameTarget);
  try {
    return await execute({ tabId: context.tabId, documentIds: [context.documentId] });
  } catch (error) {
    if (!documentTargetUnsupported(error)) throw error;
    await verifiedDirectChildFrameContext(api, sender, context);
    return execute(frameTarget);
  }
}

export async function verifiedCustomUserscriptTarget(api, sender) {
  const context = await verifiedDirectChildFrameContext(api, sender);
  if (!context.documentId) {
    throw new Error("Cannot inject custom userscript: sender document id is unavailable");
  }
  return { tabId: context.tabId, documentIds: [context.documentId] };
}
