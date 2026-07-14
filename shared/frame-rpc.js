import { currentExtensionTabId, runtimeRequest } from "./extension-api.js";

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_TIMEOUT_MS = 60000;

function frameBridgeDocumentId(iframe) {
  return String(iframe?.dataset?.preferredModelDocumentId || "").trim();
}

/**
 * Send an extension-internal command to the isolated content script that
 * registered the current iframe document. The background validates the
 * extension page, tab and per-document token before routing the command.
 */
export async function sendToContentFrame(iframe, action, data = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const bridgeDocumentId = frameBridgeDocumentId(iframe);
  if (!bridgeDocumentId) throw new Error(`[FrameRPC] Content document is not registered: ${action}`);
  const appTabId = await currentExtensionTabId();
  if (!Number.isInteger(appTabId)) throw new Error(`[FrameRPC] Extension tab is unavailable: ${action}`);
  const boundedTimeoutMs = Math.max(250, Math.min(MAX_TIMEOUT_MS, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
  const response = await runtimeRequest({
    source: "chatclub",
    action: "sendFrameCommand",
    appTabId,
    bridgeDocumentId,
    command: String(action || ""),
    data,
    timeoutMs: boundedTimeoutMs
  });
  return response.data;
}

export async function verifyContentFrameRegistration(bridgeDocumentId) {
  const token = String(bridgeDocumentId || "").trim();
  if (!token) return false;
  const appTabId = await currentExtensionTabId();
  if (!Number.isInteger(appTabId)) return false;
  try {
    const response = await runtimeRequest({
      source: "chatclub",
      action: "verifyFrameContext",
      appTabId,
      bridgeDocumentId: token
    });
    return response.data || null;
  } catch {
    return false;
  }
}
