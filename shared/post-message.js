const SOURCE = "chatclub";
export const SEND_TEXT_POST_MESSAGE_SOURCE = "chatclub:send-text:2026.07.07.1";
export const DELETE_THREAD_POST_MESSAGE_SOURCE = "chatclub:delete-thread:2026.07.04.1";
export const MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE = "chatclub:message-navigator:2026.07.08.12";

function requestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function sendToParent(action, data, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const id = requestId();
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error(`[PostMessage] Timeout waiting for response: ${action}`));
    }, timeout);
    const onMessage = (event) => {
      const message = event.data;
      if (message?.source === SOURCE && message.type === "response" && message.id === id) {
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        message.error ? reject(new Error(message.error)) : resolve(message.data);
      }
    };
    window.addEventListener("message", onMessage);
    (window.__CHATCLUB_WINDOW__ || window.parent).postMessage({ source: SOURCE, type: "request", action, id, data }, "*");
  });
}

export function sendToIframe(iframe, action, data, timeout = 5000, options = {}) {
  return new Promise((resolve, reject) => {
    if (!iframe?.contentWindow) {
      reject(new Error("[PostMessage] iframe contentWindow not available"));
      return;
    }
    const source = String(options?.source || SOURCE);
    const id = requestId();
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error(`[PostMessage] Timeout waiting for response: ${action}`));
    }, timeout);
    const onMessage = (event) => {
      if (event.source !== iframe.contentWindow) return;
      const message = event.data;
      if (message?.source === source && message.type === "response" && message.id === id) {
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        message.error ? reject(new Error(message.error)) : resolve(message.data);
      }
    };
    window.addEventListener("message", onMessage);
    iframe.contentWindow.postMessage({ source, type: "request", action, id, data }, "*");
  });
}

export function addPostMessageListener(handler, sourceFilter) {
  const listener = async (event) => {
    const message = event.data;
    if (message?.source !== SOURCE || message.type !== "request") return;
    if (sourceFilter && !sourceFilter(event.source)) return;
    try {
      const data = await handler(message.action, message.data, event);
      event.source?.postMessage({ source: SOURCE, type: "response", action: message.action, id: message.id, data }, "*");
    } catch (error) {
      event.source?.postMessage({
        source: SOURCE,
        type: "response",
        action: message.action,
        id: message.id,
        error: error instanceof Error ? error.message : "Unknown error"
      }, "*");
    }
  };
  window.addEventListener("message", listener);
  return listener;
}

export function removePostMessageListener(listener) {
  window.removeEventListener("message", listener);
}
