(() => {
  // shared/protocol.js
  var GENERIC_POST_MESSAGE_SOURCE = "chatclub";
  var NATIVE_COPY_SOURCE = "chatclub-native-copy:2026.07.08.13";
  var GEMINI_MODEL_PICKER_SOURCE = "chatclub-gemini-model-picker:2026.07.13.3";
  var MAIN_WORLD_LOCATION_SOURCE = "chatclub:main-world-location:2026.07.13.3";
  var NOTION_SEND_TEXT_SOURCE = "chatclub-notion-send-text:2026.07.13.13";
  var NOTION_SEND_PROMPT_SOURCE = "chatclub-notion-send-prompt:2026.07.13.13";
  var NOTION_SEND_ACTIVATED_EVENT = "chatclub:notion-send-activated:2026.07.13.1";
  var SEND_TEXT_POST_MESSAGE_SOURCE = "chatclub:send-text:2026.07.13.7";
  var DELETE_THREAD_POST_MESSAGE_SOURCE = "chatclub:delete-thread:2026.07.10.2";
  var MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE = "chatclub:message-navigator:2026.07.08.12";
  var SUMMARY_POST_MESSAGE_SOURCE = "chatclub:summary:2026.07.08.13";
  var PREFERRED_MODEL_POST_MESSAGE_SOURCE = "chatclub:preferred-model:2026.07.13.2";
  var CONTENT_BRIDGE_VERSION = "2026.07.15.7";
  var GROK_COOKIE_BRIDGE_VERSION = "2026.07.15.1";
  var EXTENSION_RUNTIME_RELAY_SOURCE = "chatclub:runtime-relay:2026.07.15.7";
  var SECURE_FRAME_COMMAND_SOURCE = "chatclub:frame-command:2026.07.15.7";
  var DEEPSEEK_DELETE_SOURCE = "chatclub-deepseek-delete-thread:2026.07.03.30";
  var PAGE_SUMMARY_SOURCE = "chatclub-summary-userscript:2026.07.15.7";
  var NAVIGATION_FOCUS_GUARD_RUNTIME = "navigation-focus-guard";
  var NAVIGATION_FOCUS_GUARD_RUNTIME_VERSION = "2026.07.15.2";
  var FRAME_TOAST_POSITION_EVENT = "chatclub:frame-toast-position:2026.07.13.1";
  var CUSTOM_SUMMARY_EXECUTOR = "__CHATCLUB_SUMMARY_CUSTOM_EXECUTOR_2026_07_14__";
  var TOPIC_DELETE_REQUEST_EVENT = "chatclub:delete-site:request";
  var TOPIC_DELETE_MENU_COMMAND_EVENT = "chatclub:delete-site:menu-command";
  var TOPIC_DELETE_RESULT_EVENT = "chatclub:delete-site:result";
  var TOPIC_DELETE_PING_EVENT = "chatclub:delete-site:ping";
  var TOPIC_DELETE_READY_EVENT = "chatclub:delete-site:ready";
  var TOPIC_DELETE_BRIDGE_SOURCE = "chatclub-delete-sites";
  var CONTENT_PROTOCOL = Object.freeze({
    GENERIC_POST_MESSAGE_SOURCE,
    NATIVE_COPY_SOURCE,
    GEMINI_MODEL_PICKER_SOURCE,
    MAIN_WORLD_LOCATION_SOURCE,
    NOTION_SEND_TEXT_SOURCE,
    NOTION_SEND_PROMPT_SOURCE,
    NOTION_SEND_ACTIVATED_EVENT,
    SEND_TEXT_POST_MESSAGE_SOURCE,
    DELETE_THREAD_POST_MESSAGE_SOURCE,
    MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE,
    SUMMARY_POST_MESSAGE_SOURCE,
    PREFERRED_MODEL_POST_MESSAGE_SOURCE,
    CONTENT_BRIDGE_VERSION,
    EXTENSION_RUNTIME_RELAY_SOURCE,
    SECURE_FRAME_COMMAND_SOURCE,
    DEEPSEEK_DELETE_SOURCE,
    PAGE_SUMMARY_SOURCE,
    NAVIGATION_FOCUS_GUARD_RUNTIME,
    NAVIGATION_FOCUS_GUARD_RUNTIME_VERSION,
    FRAME_TOAST_POSITION_EVENT,
    CUSTOM_SUMMARY_EXECUTOR,
    TOPIC_DELETE_REQUEST_EVENT,
    TOPIC_DELETE_MENU_COMMAND_EVENT,
    TOPIC_DELETE_RESULT_EVENT,
    TOPIC_DELETE_PING_EVENT,
    TOPIC_DELETE_READY_EVENT,
    TOPIC_DELETE_BRIDGE_SOURCE
  });

  // content-src/grok-cookie-bridge.js
  function installGrokCookieBridge() {
    const EXTENSION_API = globalThis.browser || globalThis.chrome;
    const BRIDGE_VERSION = GROK_COOKIE_BRIDGE_VERSION;
    const INSTALLATION_KEY = "__CHATCLUB_GROK_COOKIE_BRIDGE_VERSION__";
    const RELOAD_MARKER = `chatclub:grok-cookie-bridge:reload:${BRIDGE_VERSION}`;
    if (location.protocol !== "https:" || location.hostname.toLowerCase() !== "grok.com") return;
    if (window.top === window) return;
    if (globalThis[INSTALLATION_KEY] === `${BRIDGE_VERSION}:pending`) return;
    globalThis[INSTALLATION_KEY] = `${BRIDGE_VERSION}:pending`;
    function sendMessage(message) {
      const promiseRuntime = globalThis.browser?.runtime;
      if (promiseRuntime?.sendMessage) return promiseRuntime.sendMessage(message);
      return new Promise((resolve, reject) => {
        if (!EXTENSION_API?.runtime?.sendMessage) {
          reject(new Error("Extension runtime messaging is unavailable"));
          return;
        }
        EXTENSION_API.runtime.sendMessage(message, (response) => {
          const runtimeError = EXTENSION_API.runtime.lastError?.message;
          if (runtimeError) reject(new Error(runtimeError));
          else resolve(response);
        });
      });
    }
    sendMessage({ source: "chatclub", action: "syncGrokSessionCookies", bridgeVersion: BRIDGE_VERSION }).then((response) => {
      if (!response?.success || !response.reloadRequired) {
        try {
          sessionStorage.removeItem(RELOAD_MARKER);
        } catch {
        }
        return;
      }
      let alreadyReloaded = false;
      try {
        alreadyReloaded = sessionStorage.getItem(RELOAD_MARKER) === location.href;
        if (!alreadyReloaded) sessionStorage.setItem(RELOAD_MARKER, location.href);
      } catch {
        return;
      }
      if (!alreadyReloaded) location.reload();
    }).catch(() => {
    }).finally(() => {
      if (globalThis[INSTALLATION_KEY] === `${BRIDGE_VERSION}:pending`) {
        delete globalThis[INSTALLATION_KEY];
      }
    });
  }
  installGrokCookieBridge();
})();
