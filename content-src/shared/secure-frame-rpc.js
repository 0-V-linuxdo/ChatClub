export function installSecureFrameRpc(options = {}) {
  const extensionApi = options.extensionApi;
  const runtimes = options.runtimes;
  const version = String(options.version || "");
  const source = String(options.source || "");
  const bridgeDocumentId = String(options.bridgeDocumentId || "");
  const secureFrameToken = String(options.secureFrameToken || "");
  const dispatch = options.dispatch;
  if (!runtimes?.install || !version || !source || !bridgeDocumentId || !secureFrameToken || typeof dispatch !== "function") {
    throw new TypeError("Secure Frame RPC installation is incomplete");
  }
  return runtimes.install("frame-rpc", version, () => {
    const listener = (message, sender, sendResponse) => {
      if (
        message?.source !== source
        || message.type !== "request"
        || message.bridgeDocumentId !== bridgeDocumentId
        || message.secureFrameToken !== secureFrameToken
        || sender?.id !== extensionApi?.runtime?.id
      ) return false;
      Promise.resolve(dispatch(message.action, message.data || {}))
        .then((data) => sendResponse({ success: true, data }))
        .catch((error) => sendResponse({
          success: false,
          error: error?.message || String(error),
          ...(error?.code === "CAPABILITY_UNAVAILABLE" ? {
            code: "CAPABILITY_UNAVAILABLE",
            capability: String(error.capability || ""),
            delivered: false
          } : { delivered: true })
        }));
      return true;
    };
    return {
      api: Object.freeze({ listener, bridgeDocumentId }),
      activate() {
        extensionApi?.runtime?.onMessage?.addListener?.(listener);
      },
      dispose() {
        try { extensionApi?.runtime?.onMessage?.removeListener?.(listener); } catch {}
      }
    };
  });
}
