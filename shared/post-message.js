import {
  DELETE_THREAD_POST_MESSAGE_SOURCE,
  GENERIC_POST_MESSAGE_SOURCE,
  MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE,
  PREFERRED_MODEL_POST_MESSAGE_SOURCE,
  SEND_TEXT_POST_MESSAGE_SOURCE,
  SUMMARY_POST_MESSAGE_SOURCE
} from "./protocol.js";

const SOURCE = GENERIC_POST_MESSAGE_SOURCE;
export {
  DELETE_THREAD_POST_MESSAGE_SOURCE,
  MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE,
  PREFERRED_MODEL_POST_MESSAGE_SOURCE,
  SEND_TEXT_POST_MESSAGE_SOURCE,
  SUMMARY_POST_MESSAGE_SOURCE
};

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
    const signal = options?.signal;
    const id = requestId();
    let settled = false;
    let timer = 0;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      timer = 0;
      window.removeEventListener("message", onMessage);
      signal?.removeEventListener?.("abort", onAbort);
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const onAbort = () => {
      const error = new Error(`[PostMessage] Request cancelled: ${action}`);
      error.name = "AbortError";
      finish(reject, error);
    };
    const onMessage = (event) => {
      if (event.source !== iframe.contentWindow) return;
      const message = event.data;
      if (message?.source === source && message.type === "response" && message.id === id) {
        message.error ? finish(reject, new Error(message.error)) : finish(resolve, message.data);
      }
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    window.addEventListener("message", onMessage);
    signal?.addEventListener?.("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      finish(reject, new Error(`[PostMessage] Timeout waiting for response: ${action}`));
    }, timeout);
    try {
      iframe.contentWindow.postMessage({ source, type: "request", action, id, data }, "*");
    } catch (error) {
      finish(reject, error instanceof Error ? error : new Error(String(error || "postMessage failed")));
    }
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
