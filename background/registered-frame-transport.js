import { documentTargetUnsupported } from "./frame-injection.js";
import { frameRouteError } from "./frame-command-errors.js";

export async function verifiedRegisteredFrameFallbackTarget(api, context = {}) {
  const tabId = context.tabId;
  const frameId = context.frameId;
  const expectedDocumentId = String(context.documentId || "").trim();
  const expectedUrl = String(context.url || "").trim();
  if (!Number.isInteger(tabId) || !Number.isInteger(frameId) || frameId <= 0 || !expectedDocumentId || !expectedUrl) {
    throw frameRouteError("STALE_DOCUMENT", "Secure frame fallback target is incomplete", false);
  }
  const frame = await api.webNavigation.getFrame({ tabId, frameId });
  const currentDocumentId = String(frame?.documentId || "").trim();
  if (
    !frame
    || (Number.isInteger(frame.tabId) && frame.tabId !== tabId)
    || (Number.isInteger(frame.frameId) && frame.frameId !== frameId)
    || frame.parentFrameId !== 0
    || String(frame.url || "") !== expectedUrl
    || !currentDocumentId
    || currentDocumentId !== expectedDocumentId
  ) {
    throw frameRouteError("STALE_DOCUMENT", "Secure frame document changed before compatibility fallback", false);
  }
  return { tabId, frameId };
}

export async function executeInRegisteredFrameWithDocumentFallback(
  context,
  execute,
  verifyFallbackTarget
) {
  if (typeof execute !== "function") throw new TypeError("Registered frame executor is unavailable");
  const target = context.documentId
    ? { tabId: context.tabId, documentIds: [context.documentId] }
    : { tabId: context.tabId, frameIds: [context.frameId] };
  try {
    return await execute(target);
  } catch (error) {
    if (!context.documentId || !documentTargetUnsupported(error)) throw error;
    if (typeof verifyFallbackTarget !== "function") throw error;
    const fallback = await verifyFallbackTarget(context);
    return execute({ tabId: fallback.tabId, frameIds: [fallback.frameId] });
  }
}

export async function sendMessageToRegisteredFrame(
  api,
  context,
  message,
  verifyFallbackTarget
) {
  const options = context.documentId
    ? { documentId: context.documentId }
    : { frameId: context.frameId };
  try {
    return await api.tabs.sendMessage(context.tabId, message, options);
  } catch (error) {
    if (!context.documentId || !documentTargetUnsupported(error)) throw error;
    if (typeof verifyFallbackTarget !== "function") throw error;
    const fallback = await verifyFallbackTarget(context);
    return api.tabs.sendMessage(fallback.tabId, message, { frameId: fallback.frameId });
  }
}
