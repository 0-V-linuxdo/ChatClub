(() => {
  // <chatclub-generated-protocol>
  const PROTOCOL = Object.freeze({
    "GENERIC_POST_MESSAGE_SOURCE": "chatclub",
    "NATIVE_COPY_SOURCE": "chatclub-native-copy:2026.07.08.13",
    "GEMINI_MODEL_PICKER_SOURCE": "chatclub-gemini-model-picker:2026.07.13.3",
    "MAIN_WORLD_LOCATION_SOURCE": "chatclub:main-world-location:2026.07.13.3",
    "NOTION_SEND_TEXT_SOURCE": "chatclub-notion-send-text:2026.07.13.13",
    "NOTION_SEND_PROMPT_SOURCE": "chatclub-notion-send-prompt:2026.07.13.13",
    "NOTION_SEND_ACTIVATED_EVENT": "chatclub:notion-send-activated:2026.07.13.1",
    "SEND_TEXT_POST_MESSAGE_SOURCE": "chatclub:send-text:2026.07.13.7",
    "DELETE_THREAD_POST_MESSAGE_SOURCE": "chatclub:delete-thread:2026.07.10.2",
    "MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE": "chatclub:message-navigator:2026.07.08.12",
    "SUMMARY_POST_MESSAGE_SOURCE": "chatclub:summary:2026.07.08.13",
    "PREFERRED_MODEL_POST_MESSAGE_SOURCE": "chatclub:preferred-model:2026.07.13.2",
    "CONTENT_BRIDGE_VERSION": "2026.07.15.4",
    "EXTENSION_RUNTIME_RELAY_SOURCE": "chatclub:runtime-relay:2026.07.15.4",
    "SECURE_FRAME_COMMAND_SOURCE": "chatclub:frame-command:2026.07.15.4",
    "DEEPSEEK_DELETE_SOURCE": "chatclub-deepseek-delete-thread:2026.07.03.30",
    "PAGE_SUMMARY_SOURCE": "chatclub-summary-userscript:2026.07.15.4",
    "NAVIGATION_FOCUS_GUARD_SOURCE": "chatclub:navigation-focus-guard:2026.07.13.3",
    "FRAME_TOAST_POSITION_EVENT": "chatclub:frame-toast-position:2026.07.13.1",
    "CUSTOM_SUMMARY_EXECUTOR": "__CHATCLUB_SUMMARY_CUSTOM_EXECUTOR_2026_07_14__",
    "TOPIC_DELETE_REQUEST_EVENT": "chatclub:delete-site:request",
    "TOPIC_DELETE_MENU_COMMAND_EVENT": "chatclub:delete-site:menu-command",
    "TOPIC_DELETE_RESULT_EVENT": "chatclub:delete-site:result",
    "TOPIC_DELETE_PING_EVENT": "chatclub:delete-site:ping",
    "TOPIC_DELETE_READY_EVENT": "chatclub:delete-site:ready",
    "TOPIC_DELETE_BRIDGE_SOURCE": "chatclub-delete-sites"
  });
  // </chatclub-generated-protocol>
  const COPY_SOURCE = PROTOCOL.NATIVE_COPY_SOURCE;
  const GEMINI_MODEL_PICKER_BRIDGE_VERSION = "2026.07.13.3";
  const GEMINI_MODEL_PICKER_SOURCE = PROTOCOL.GEMINI_MODEL_PICKER_SOURCE;
  const GEMINI_MODEL_PICKER_RUN_TOKEN_ATTRIBUTE = "data-chatclub-gemini-model-picker-run";
  const PREFERRED_MODEL_FOCUS_SHIELD_ATTRIBUTE = "data-chatclub-preferred-model-focus-shield";
  const PREFERRED_MODEL_FOCUS_SHIELD_VERSION = "2026.07.13.7";
  const NAVIGATION_FOCUS_GUARD_SOURCE = PROTOCOL.NAVIGATION_FOCUS_GUARD_SOURCE;
  const NAVIGATION_FOCUS_GUARD_BRIDGE_VERSION = "2026.07.13.3";
  const NAVIGATION_FOCUS_GUARD_STORAGE_KEY = "chatclub_preferred_model_focus_guard_until";
  const NAVIGATION_FOCUS_GUARD_LEASE_MS = 180000;
  const MAIN_WORLD_LOCATION_BRIDGE_VERSION = "2026.07.13.3";
  const MAIN_WORLD_LOCATION_SOURCE = PROTOCOL.MAIN_WORLD_LOCATION_SOURCE;
  const DEEPSEEK_DELETE_BRIDGE_VERSION = "2026.07.03.30";
  const DEEPSEEK_DELETE_SOURCE = PROTOCOL.DEEPSEEK_DELETE_SOURCE;

  function installChatClubWebviewShim() {
    let params;
    try {
      params = new URLSearchParams(window.name || "");
    } catch {
      return;
    }
    if (!params.has("chatclub_webview")) return;
    if (window.__CHATCLUB_WEBVIEW_SHIM__) return;
    window.__CHATCLUB_WEBVIEW_SHIM__ = true;

    const ua = params.get("ua") || "";
    if (ua) {
      try {
        Object.defineProperty(navigator, "userAgent", {
          configurable: true,
          get: () => ua
        });
      } catch {}
    }

    if (params.get("ssc")) {
      try {
        const cookieGetter = document.__lookupGetter__?.("cookie");
        const cookieSetter = document.__lookupSetter__?.("cookie");
        if (typeof cookieGetter === "function" && typeof cookieSetter === "function") {
          Object.defineProperty(document, "cookie", {
            configurable: true,
            get() {
              return cookieGetter.call(document);
            },
            set(value) {
              const parts = String(value || "").split(/;\s*/).filter(Boolean);
              const filtered = parts.filter((part) => !/^(?:samesite|secure|partitioned)(?:=|$)/i.test(part));
              filtered.push("SameSite=None", "Secure", "Partitioned");
              cookieSetter.call(document, filtered.join("; "));
            }
          });
        }
      } catch {}
    }

    try {
      const nativeClose = window.close;
      window.close = function () {
        try {
          window.parent?.postMessage({ source: "chatclub", type: "request", action: "closeWebview", id: `${Date.now()}` }, "*");
        } catch {}
        try { return nativeClose.call(window); } catch {}
      };
    } catch {}
  }

  function preferredModelFocusShieldLease() {
    let raw = "";
    try { raw = String(document.documentElement?.getAttribute(PREFERRED_MODEL_FOCUS_SHIELD_ATTRIBUTE) || ""); } catch {}
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const token = String(parsed?.token || "");
      const generation = Math.max(0, Number(parsed?.generation) || 0);
      const expiresAt = Number(parsed?.expiresAt);
      if (!token || !Number.isFinite(expiresAt) || expiresAt <= 0) return { raw, invalid: true };
      return { raw, token, generation, expiresAt, invalid: false };
    } catch {
      return { raw, invalid: true };
    }
  }

  function removePreferredModelFocusShieldLease(raw = "") {
    try {
      const root = document.documentElement;
      if (!root) return;
      if (!raw || root.getAttribute(PREFERRED_MODEL_FOCUS_SHIELD_ATTRIBUTE) === raw) {
        root.removeAttribute(PREFERRED_MODEL_FOCUS_SHIELD_ATTRIBUTE);
      }
    } catch {}
  }

  function shortenPreferredModelFocusShieldLease(graceMs = 500) {
    const lease = preferredModelFocusShieldLease();
    if (!lease) return;
    if (lease.invalid || lease.expiresAt <= Date.now()) {
      removePreferredModelFocusShieldLease(lease.raw);
      return;
    }
    const expiresAt = Math.min(lease.expiresAt, Date.now() + Math.max(0, Number(graceMs) || 0));
    if (expiresAt >= lease.expiresAt) return;
    const value = JSON.stringify({ token: lease.token, generation: lease.generation, expiresAt });
    try {
      if (document.documentElement?.getAttribute(PREFERRED_MODEL_FOCUS_SHIELD_ATTRIBUTE) === lease.raw) {
        document.documentElement.setAttribute(PREFERRED_MODEL_FOCUS_SHIELD_ATTRIBUTE, value);
      }
    } catch {}
  }

  function consumePreferredModelBootstrapFocusShield() {
    let expiresAt = 0;
    let guardToken = "";
    try {
      const rawName = String(window.name || "");
      const marker = rawName.match(/(?:^|&)chatclub_focus_guard_until=(\d+)&chatclub_focus_guard_token=([^&]+)$/);
      if (marker) {
        expiresAt = Math.max(expiresAt, Number(marker[1]) || 0);
        guardToken = decodeURIComponent(marker[2] || "");
        window.name = rawName.slice(0, marker.index);
      } else {
        const legacyMarker = rawName.match(/(?:^|&)chatclub_focus_guard_until=(\d+)$/);
        if (legacyMarker) {
          expiresAt = Math.max(expiresAt, Number(legacyMarker[1]) || 0);
          window.name = rawName.slice(0, legacyMarker.index);
        }
      }
    } catch {}
    try {
      const stored = String(sessionStorage.getItem(NAVIGATION_FOCUS_GUARD_STORAGE_KEY) || "");
      try {
        const parsed = JSON.parse(stored);
        if (Number(parsed?.expiresAt) > expiresAt) {
          expiresAt = Number(parsed.expiresAt);
          guardToken = String(parsed.guardToken || guardToken);
        }
      } catch {
        expiresAt = Math.max(expiresAt, Number(stored) || 0);
      }
      sessionStorage.removeItem(NAVIGATION_FOCUS_GUARD_STORAGE_KEY);
    } catch {}
    const now = Date.now();
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return { expiresAt: 0, guardToken: "" };
    return {
      expiresAt: Math.min(expiresAt, now + NAVIGATION_FOCUS_GUARD_LEASE_MS),
      guardToken
    };
  }

  function installPreferredModelNavigationFocusGuardBridge() {
    const registryKey = "__CHATCLUB_PREFERRED_MODEL_NAVIGATION_FOCUS_GUARD_BRIDGE__";
    const previous = window[registryKey];
    if (previous?.version === NAVIGATION_FOCUS_GUARD_BRIDGE_VERSION) return;
    try { previous?.dispose?.(); } catch {}

    const onMessage = (event) => {
      const message = event.data;
      if (
        window.parent === window
        || event.source !== window.parent
        || !/^(?:chrome|moz)-extension:\/\//i.test(String(event.origin || ""))
        || message?.source !== NAVIGATION_FOCUS_GUARD_SOURCE
        || message.type !== "request"
        || message.action !== "prepare"
        || typeof message.id !== "string"
        || !message.id
      ) return;

      const now = Date.now();
      const guardToken = String(message.guardToken || "");
      if (!guardToken) return;
      const requestedExpiresAt = Number(message.expiresAt);
      const expiresAt = Number.isFinite(requestedExpiresAt) && requestedExpiresAt > now
        ? Math.min(requestedExpiresAt, now + NAVIGATION_FOCUS_GUARD_LEASE_MS)
        : now + NAVIGATION_FOCUS_GUARD_LEASE_MS;
      let stored = false;
      try {
        const adopt = window.__CHATCLUB_PREFERRED_MODEL_FOCUS_SHIELD__?.adoptBootstrapExpiresAt;
        stored = typeof adopt === "function" && Number(adopt(expiresAt, guardToken)) > now;
      } catch {}
      if (stored && message.phase !== "adopt") {
        try {
          sessionStorage.setItem(NAVIGATION_FOCUS_GUARD_STORAGE_KEY, JSON.stringify({ expiresAt, guardToken }));
          stored = true;
        } catch {}
        try {
          const rawName = String(window.name || "");
          const cleanName = rawName
            .replace(/(?:^|&)chatclub_focus_guard_until=\d+&chatclub_focus_guard_token=[^&]+$/, "")
            .replace(/(?:^|&)chatclub_focus_guard_until=\d+$/, "");
          window.name = `${cleanName}${cleanName ? "&" : ""}chatclub_focus_guard_until=${expiresAt}&chatclub_focus_guard_token=${encodeURIComponent(guardToken)}`;
          stored = true;
        } catch {}
      }
      try {
        event.source?.postMessage({
          source: NAVIGATION_FOCUS_GUARD_SOURCE,
          type: "response",
          action: "prepare",
          id: message.id,
          guardToken,
          ok: stored,
          expiresAt,
          documentToken: window.__CHATCLUB_PREFERRED_MODEL_FOCUS_SHIELD__?.documentToken || ""
        }, event.origin);
      } catch {}
    };
    window.addEventListener("message", onMessage, true);
    window[registryKey] = {
      version: NAVIGATION_FOCUS_GUARD_BRIDGE_VERSION,
      dispose() {
        window.removeEventListener("message", onMessage, true);
      }
    };
  }

  function installPreferredModelFocusShield() {
    const registryKey = "__CHATCLUB_PREFERRED_MODEL_FOCUS_SHIELD__";
    const previous = window[registryKey];
    const currentElementFocus = (() => {
      try { return Object.getOwnPropertyDescriptor(HTMLElement.prototype, "focus")?.value; } catch { return null; }
    })();
    let currentWindowFocus = null;
    try { currentWindowFocus = window.focus; } catch {}
    if (
      previous?.version === PREFERRED_MODEL_FOCUS_SHIELD_VERSION
      && currentElementFocus === previous.guardedElementFocus
      && currentWindowFocus === previous.guardedWindowFocus
    ) {
      try { previous.refreshLease?.(); } catch {}
      return;
    }
    const consumedBootstrap = previous
      ? { expiresAt: 0, guardToken: "" }
      : consumePreferredModelBootstrapFocusShield();
    let bootstrapExpiresAt = Math.max(
      Number(consumedBootstrap.expiresAt) || 0,
      Number(previous?.bootstrapExpiresAt) || 0
    );
    let activeBootstrapGuardToken = String(
      consumedBootstrap.guardToken
      || previous?.activeBootstrapGuardToken
      || ""
    );
    const releasedBootstrapGuardTokens = previous?.releasedBootstrapGuardTokens instanceof Set
      ? previous.releasedBootstrapGuardTokens
      : new Set();
    try { previous?.dispose?.(); } catch {}

    let elementFocusDescriptor = null;
    let windowFocusDescriptor = null;
    try { elementFocusDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "focus"); } catch {}
    try { windowFocusDescriptor = Object.getOwnPropertyDescriptor(window, "focus"); } catch {}
    const nativeElementFocus = elementFocusDescriptor?.value || HTMLElement.prototype.focus;
    const nativeWindowFocus = window.focus;
    const preferredModelRunActive = () => {
      if (bootstrapExpiresAt > Date.now()) return true;
      const lease = preferredModelFocusShieldLease();
      if (!lease) return false;
      if (lease.invalid || lease.expiresAt <= Date.now()) {
        removePreferredModelFocusShieldLease(lease.raw);
        return false;
      }
      return true;
    };
    const guardedElementFocus = function (...args) {
      if (preferredModelRunActive()) return;
      return Reflect.apply(nativeElementFocus, this, args);
    };
    const guardedWindowFocus = function (...args) {
      if (preferredModelRunActive()) return;
      return Reflect.apply(nativeWindowFocus, this, args);
    };
    const releaseBootstrapForTrustedIntent = (event) => {
      if (!event?.isTrusted || bootstrapExpiresAt <= 0) return;
      if (activeBootstrapGuardToken) releasedBootstrapGuardTokens.add(activeBootstrapGuardToken);
      bootstrapExpiresAt = 0;
      try { sessionStorage.removeItem(NAVIGATION_FOCUS_GUARD_STORAGE_KEY); } catch {}
      try {
        const rawName = String(window.name || "");
        const cleanName = rawName
          .replace(/(?:^|&)chatclub_focus_guard_until=\d+&chatclub_focus_guard_token=[^&]+$/, "")
          .replace(/(?:^|&)chatclub_focus_guard_until=\d+$/, "");
        if (cleanName !== rawName) window.name = cleanName;
      } catch {}
      try {
        if (window[registryKey]?.guardedElementFocus === guardedElementFocus) {
          window[registryKey].bootstrapExpiresAt = 0;
          window[registryKey].activeBootstrapGuardToken = activeBootstrapGuardToken;
        }
      } catch {}
    };
    const adoptBootstrapExpiresAt = (expiresAt, guardToken = "") => {
      const token = String(guardToken || "");
      if (!token || releasedBootstrapGuardTokens.has(token)) return 0;
      const next = Number(expiresAt);
      const now = Date.now();
      if (!Number.isFinite(next) || next <= now) return bootstrapExpiresAt;
      activeBootstrapGuardToken = token;
      bootstrapExpiresAt = Math.max(bootstrapExpiresAt, Math.min(next, now + NAVIGATION_FOCUS_GUARD_LEASE_MS));
      try {
        if (window[registryKey]?.guardedElementFocus === guardedElementFocus) {
          window[registryKey].bootstrapExpiresAt = bootstrapExpiresAt;
          window[registryKey].activeBootstrapGuardToken = activeBootstrapGuardToken;
        }
      } catch {}
      return bootstrapExpiresAt;
    };
    try { guardedElementFocus.toString = () => nativeElementFocus.toString(); } catch {}
    try { guardedWindowFocus.toString = () => nativeWindowFocus.toString(); } catch {}
    let elementInstalled = false;
    let windowInstalled = false;
    try {
      Object.defineProperty(HTMLElement.prototype, "focus", {
        ...(elementFocusDescriptor || { configurable: true, enumerable: false, writable: true }),
        value: guardedElementFocus
      });
      elementInstalled = HTMLElement.prototype.focus === guardedElementFocus;
    } catch {}
    try {
      const descriptor = windowFocusDescriptor && Object.prototype.hasOwnProperty.call(windowFocusDescriptor, "value")
        ? { ...windowFocusDescriptor, value: guardedWindowFocus }
        : { configurable: true, enumerable: windowFocusDescriptor?.enumerable ?? true, writable: true, value: guardedWindowFocus };
      Object.defineProperty(window, "focus", descriptor);
      windowInstalled = window.focus === guardedWindowFocus;
    } catch {}

    let expiryTimer = null;
    const refreshLease = () => {
      if (expiryTimer) clearTimeout(expiryTimer);
      expiryTimer = null;
      const lease = preferredModelFocusShieldLease();
      if (!lease) return;
      if (lease.invalid || lease.expiresAt <= Date.now()) {
        removePreferredModelFocusShieldLease(lease.raw);
        return;
      }
      const delay = Math.min(2147483000, Math.max(1, lease.expiresAt - Date.now() + 25));
      expiryTimer = setTimeout(() => {
        expiryTimer = null;
        const current = preferredModelFocusShieldLease();
        if (!current) return;
        if (current.raw !== lease.raw) {
          refreshLease();
          return;
        }
        if (current.invalid || current.expiresAt <= Date.now()) removePreferredModelFocusShieldLease(current.raw);
        else refreshLease();
      }, delay);
    };
    let leaseObserver = null;
    let rootObserver = null;
    const observeLeaseAttribute = () => {
      const root = document.documentElement;
      if (!root) return false;
      try {
        leaseObserver = new MutationObserver(refreshLease);
        leaseObserver.observe(root, {
          attributes: true,
          attributeFilter: [PREFERRED_MODEL_FOCUS_SHIELD_ATTRIBUTE]
        });
        return true;
      } catch {
        return false;
      }
    };
    if (!observeLeaseAttribute()) {
      try {
        rootObserver = new MutationObserver(() => {
          if (!observeLeaseAttribute()) return;
          try { rootObserver?.disconnect?.(); } catch {}
          rootObserver = null;
          refreshLease();
        });
        rootObserver.observe(document, { childList: true });
      } catch {}
    }
    window.addEventListener("pointerdown", releaseBootstrapForTrustedIntent, true);
    window.addEventListener("keydown", releaseBootstrapForTrustedIntent, true);

    window[registryKey] = {
      version: PREFERRED_MODEL_FOCUS_SHIELD_VERSION,
      documentToken: globalThis.crypto?.randomUUID?.()
        || `focus-shield-document-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      guardedElementFocus,
      guardedWindowFocus,
      bootstrapExpiresAt,
      activeBootstrapGuardToken,
      releasedBootstrapGuardTokens,
      elementInstalled,
      windowInstalled,
      refreshLease,
      adoptBootstrapExpiresAt,
      dispose() {
        window.removeEventListener("pointerdown", releaseBootstrapForTrustedIntent, true);
        window.removeEventListener("keydown", releaseBootstrapForTrustedIntent, true);
        try { leaseObserver?.disconnect?.(); } catch {}
        try { rootObserver?.disconnect?.(); } catch {}
        if (expiryTimer) clearTimeout(expiryTimer);
        try {
          if (HTMLElement.prototype.focus === guardedElementFocus) {
            if (elementFocusDescriptor) Object.defineProperty(HTMLElement.prototype, "focus", elementFocusDescriptor);
            else delete HTMLElement.prototype.focus;
          }
        } catch {}
        try {
          if (window.focus === guardedWindowFocus) {
            if (windowFocusDescriptor) Object.defineProperty(window, "focus", windowFocusDescriptor);
            else delete window.focus;
          }
        } catch {}
      }
    };
    refreshLease();
  }

  function installMainWorldLocationBridge() {
    const previousBridge = window.__CHATCLUB_MAIN_WORLD_LOCATION_BRIDGE__;
    if (previousBridge?.version === MAIN_WORLD_LOCATION_BRIDGE_VERSION) return;
    try { previousBridge?.dispose?.(); } catch {}

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    let lastHref = String(location.href || "");

    const notify = (kind, force = false) => {
      const href = String(location.href || "");
      if (!href || (!force && href === lastHref)) return;
      lastHref = href;
      try { document.documentElement?.removeAttribute(GEMINI_MODEL_PICKER_RUN_TOKEN_ATTRIBUTE); } catch {}
      shortenPreferredModelFocusShieldLease(500);
      try {
        window.postMessage({
          source: MAIN_WORLD_LOCATION_SOURCE,
          type: "notification",
          action: "locationChanged",
          href,
          kind: String(kind || "navigation"),
          force: Boolean(force),
          at: Date.now()
        }, "*");
      } catch {}
    };

    const wrapHistoryMethod = (original, kind) => function (...args) {
      const before = String(location.href || "");
      const result = Reflect.apply(original, this, args);
      const after = String(location.href || "");
      if (after !== before) notify(kind);
      return result;
    };
    const wrappedPushState = wrapHistoryMethod(originalPushState, "pushState");
    const wrappedReplaceState = wrapHistoryMethod(originalReplaceState, "replaceState");
    try { history.pushState = wrappedPushState; } catch {}
    try { history.replaceState = wrappedReplaceState; } catch {}

    const onPopState = () => notify("popstate", true);
    const onHashChange = () => notify("hashchange");
    const onPageHide = () => {
      try { document.documentElement?.removeAttribute(GEMINI_MODEL_PICKER_RUN_TOKEN_ATTRIBUTE); } catch {}
      shortenPreferredModelFocusShieldLease(500);
    };
    window.addEventListener("popstate", onPopState, true);
    window.addEventListener("hashchange", onHashChange, true);
    window.addEventListener("pagehide", onPageHide, true);

    window.__CHATCLUB_MAIN_WORLD_LOCATION_BRIDGE__ = {
      version: MAIN_WORLD_LOCATION_BRIDGE_VERSION,
      source: MAIN_WORLD_LOCATION_SOURCE,
      notify,
      dispose() {
        window.removeEventListener("popstate", onPopState, true);
        window.removeEventListener("hashchange", onHashChange, true);
        window.removeEventListener("pagehide", onPageHide, true);
        try { if (history.pushState === wrappedPushState) history.pushState = originalPushState; } catch {}
        try { if (history.replaceState === wrappedReplaceState) history.replaceState = originalReplaceState; } catch {}
      }
    };
  }

  function installGeminiModelPickerBridge() {
    const previousBridge = window.__CHATCLUB_GEMINI_MODEL_PICKER_BRIDGE__;
    if (previousBridge?.version === GEMINI_MODEL_PICKER_BRIDGE_VERSION) return;

    try { previousBridge?.dispose?.(); } catch {}
    try {
      if (typeof previousBridge?.messageListener === "function") {
        window.removeEventListener("message", previousBridge.messageListener, true);
      }
    } catch {}

    const previousRecords = Array.isArray(previousBridge?.records) ? previousBridge.records : [];
    let capture = window.__CHATCLUB_GEMINI_MODEL_PICKER_LISTENER_CAPTURE__;
    const records = Array.isArray(capture?.records) ? capture.records : previousRecords;
    if (records !== previousRecords) {
      for (const record of previousRecords) {
        if (!record || records.some((entry) => entry?.target === record.target && entry?.listener === record.listener)) continue;
        records.push(record);
      }
    }

    const visible = (el) => {
      try {
        const rect = el?.getBoundingClientRect?.();
        if (!rect || rect.width <= 4 || rect.height <= 4) return false;
        const style = getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
      } catch {
        return false;
      }
    };

    const firstVisible = (selectors) => {
      for (const selector of selectors) {
        try {
          for (const el of document.querySelectorAll(selector)) {
            if (visible(el)) return el;
          }
        } catch {}
      }
      return null;
    };

    const looksLikeGeminiModeTarget = (target) => {
      if (!target || target.nodeType !== 1) return false;
      const tag = String(target.tagName || "").toLowerCase();
      if (tag === "gem-button") return true;
      try {
        return Boolean(target.matches?.(
          "[data-test-id='bard-mode-menu-button'], .gds-mode-switch-button, .gem-button, bard-mode-switcher button, button[aria-label^='Open mode picker' i]"
        ));
      } catch {
        return false;
      }
    };

    const recordListener = (target, listener) => {
      if (!looksLikeGeminiModeTarget(target)) return;
      if (typeof listener !== "function" && typeof listener?.handleEvent !== "function") return;
      const duplicateIndex = records.findIndex((record) => record?.target === target && record?.listener === listener);
      if (duplicateIndex >= 0) records.splice(duplicateIndex, 1);
      records.push({ target, listener });
      while (records.length > 30) records.shift();
    };

    if (!capture?.installed) {
      const originalAddEventListener = EventTarget.prototype.addEventListener;
      const wrappedAddEventListener = function (type, listener, options) {
        const result = originalAddEventListener.apply(this, arguments);
        try {
          if (String(type || "").toLowerCase() === "click") recordListener(this, listener);
        } catch {}
        return result;
      };
      try {
        wrappedAddEventListener.toString = () => originalAddEventListener.toString();
        Object.defineProperty(EventTarget.prototype, "addEventListener", {
          configurable: true,
          writable: true,
          value: wrappedAddEventListener
        });
        capture = { installed: true, records, wrappedAddEventListener };
        window.__CHATCLUB_GEMINI_MODEL_PICKER_LISTENER_CAPTURE__ = capture;
      } catch {}
    }

    const triggerButton = () => firstVisible([
      "button[aria-label='Open mode picker']",
      "button[aria-label^='Open mode picker' i]",
      "bard-mode-switcher button[aria-label='Open mode picker']",
      "bard-mode-switcher button",
      "button[aria-label*='mode picker' i]",
      "button[aria-label*='model' i]"
    ]);

    const listenerRecordFor = (button) => {
      const host = button?.closest?.("gem-button, [data-test-id='bard-mode-menu-button'], .gds-mode-switch-button") || button;
      for (let index = records.length - 1; index >= 0; index -= 1) {
        const record = records[index];
        const target = record.target;
        if (!target?.isConnected) continue;
        if (target === host || target === button || target.contains?.(button) || host?.contains?.(target)) return record;
      }
      return records.slice().reverse().find((record) => record.target?.isConnected && looksLikeGeminiModeTarget(record.target)) || null;
    };

    const eventPathFor = (button, currentTarget) => {
      const path = [];
      const add = (node) => {
        if (node && !path.includes(node)) path.push(node);
      };
      add(button);
      for (let node = button; node; node = node.parentNode || node.host || null) add(node);
      add(currentTarget);
      add(document);
      add(window);
      return path;
    };

    const modelClickEvent = (button, currentTarget) => {
      const rect = button?.getBoundingClientRect?.();
      const clientX = rect ? rect.left + rect.width / 2 : 1;
      const clientY = rect ? rect.top + rect.height / 2 : 1;
      return {
        type: "click",
        target: button,
        srcElement: button,
        currentTarget,
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 0,
        buttons: 0,
        detail: 1,
        clientX,
        clientY,
        screenX: clientX,
        screenY: clientY,
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() {},
        stopImmediatePropagation() {},
        composedPath() { return eventPathFor(button, currentTarget); }
      };
    };

    const menuOpen = () => firstVisible([
      "gem-mode-menu",
      ".cdk-overlay-pane .gds-mode-switch-menu",
      ".cdk-overlay-pane [role='menu']",
      ".cdk-overlay-pane",
      ".gds-mode-switch-menu",
      "[role='menu']"
    ]);

    const stats = previousBridge?.stats && typeof previousBridge.stats === "object"
      ? previousBridge.stats
      : { requests: 0, invocations: 0 };
    let activeRunId = "";
    let activeRunToken = "";
    let activeRunGeneration = 0;

    const documentRunToken = () => {
      try { return String(document.documentElement?.getAttribute(GEMINI_MODEL_PICKER_RUN_TOKEN_ATTRIBUTE) || ""); } catch { return ""; }
    };

    const requestRun = (request = {}) => ({
      runId: String(request.runId || ""),
      runToken: String(request.runToken || ""),
      runGeneration: Math.max(0, Number(request.runGeneration) || 0)
    });

    const runIsCurrent = (run) => Boolean(
      run?.runId
      && run?.runToken
      && documentRunToken() === run.runToken
      && activeRunId === run.runId
      && activeRunToken === run.runToken
      && activeRunGeneration === run.runGeneration
    );

    const acceptRun = (run) => {
      if (!run?.runId || !run?.runToken || documentRunToken() !== run.runToken) return false;
      activeRunId = run.runId;
      activeRunToken = run.runToken;
      activeRunGeneration = run.runGeneration;
      return true;
    };

    const open = (request = {}) => {
      stats.requests += 1;
      const run = requestRun(request);
      if (!acceptRun(run) || !runIsCurrent(run)) {
        return {
          ok: false,
          activated: false,
          cancelled: true,
          stale: true,
          reason: "stale Gemini model picker run",
          ...run,
          records: records.length,
          invocations: stats.invocations
        };
      }
      const existing = menuOpen();
      if (existing) return { ok: true, activated: false, alreadyOpen: true, ...run, records: records.length, invocations: stats.invocations };
      const button = triggerButton();
      if (!button) return { ok: false, activated: false, reason: "trigger not found", ...run, records: records.length, invocations: stats.invocations };
      const record = listenerRecordFor(button);
      if (!record) return { ok: false, activated: false, reason: "trigger listener not captured", ...run, records: records.length, invocations: stats.invocations };
      if (!runIsCurrent(run)) {
        return {
          ok: false,
          activated: false,
          cancelled: true,
          stale: true,
          reason: "Gemini model picker run was cancelled before activation",
          ...run,
          records: records.length,
          invocations: stats.invocations
        };
      }
      try {
        const listener = record.listener;
        const event = modelClickEvent(button, record.target || button);
        if (typeof listener === "function") listener.call(record.target || button, event);
        else listener.handleEvent.call(listener, event);
        stats.invocations += 1;
        return { ok: true, activated: true, ...run, records: records.length, invocations: stats.invocations };
      } catch (error) {
        return { ok: false, activated: true, reason: error?.message || String(error || "listener failed"), ...run, records: records.length, invocations: stats.invocations };
      }
    };

    const cancel = (request = {}) => {
      const run = requestRun(request);
      const matched = Boolean(run.runId && run.runToken && activeRunId === run.runId && activeRunToken === run.runToken);
      if (matched) {
        try {
          if (documentRunToken() === run.runToken) document.documentElement?.removeAttribute(GEMINI_MODEL_PICKER_RUN_TOKEN_ATTRIBUTE);
        } catch {}
        activeRunId = "";
        activeRunToken = "";
        activeRunGeneration = 0;
      }
      return {
        ok: true,
        activated: false,
        cancelled: matched,
        stale: !matched,
        reason: String(request.reason || (matched ? "Gemini model picker run cancelled" : "Gemini model picker run is not active")),
        ...run,
        records: records.length,
        invocations: stats.invocations
      };
    };

    const messageListener = (event) => {
      const message = event.data;
      if (message?.source !== GEMINI_MODEL_PICKER_SOURCE || message.type !== "request" || !["open", "cancel"].includes(message.action)) return;
      const result = message.action === "cancel" ? cancel(message) : open(message);
      try {
        window.postMessage({
          source: GEMINI_MODEL_PICKER_SOURCE,
          type: "response",
          id: message.id,
          action: message.action,
          ...result
        }, "*");
      } catch {}
    };
    const bridge = {
      version: GEMINI_MODEL_PICKER_BRIDGE_VERSION,
      source: GEMINI_MODEL_PICKER_SOURCE,
      open,
      cancel,
      records,
      stats,
      state() {
        return { activeRunId, activeRunToken, activeRunGeneration, documentRunToken: documentRunToken() };
      },
      messageListener,
      dispose() {
        try { window.removeEventListener("message", messageListener, true); } catch {}
      }
    };
    window.__CHATCLUB_GEMINI_MODEL_PICKER_BRIDGE__ = bridge;
    window.addEventListener("message", messageListener, true);
  }

  function installDeepSeekDeleteBridge() {
    if (window.__CHATCLUB_DEEPSEEK_DELETE_BRIDGE__?.version === DEEPSEEK_DELETE_BRIDGE_VERSION) return;

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const compact = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
    const all = (selector, root = document) => {
      try { return Array.from(root.querySelectorAll(selector)); } catch { return []; }
    };
    const rectOf = (el) => {
      try {
        if (!el?.getBoundingClientRect) return null;
        const rect = el.getBoundingClientRect();
        if (!rect || rect.width < 2 || rect.height < 2) return null;
        return rect;
      } catch {
        return null;
      }
    };
    const visible = (el) => {
      const rect = rectOf(el);
      if (!rect) return false;
      try {
        const style = getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
      } catch {
        return true;
      }
    };
    const textOf = (el) => normalize([
      el?.getAttribute?.("aria-label"),
      el?.getAttribute?.("title"),
      el?.innerText || el?.textContent || ""
    ].filter(Boolean).join(" "));
    const svgTextOf = (el) => normalize(all("svg,use,path,circle", el).map((item) => [
      item.tagName,
      item.getAttribute("aria-label"),
      item.getAttribute("data-testid"),
      item.getAttribute("class"),
      item.getAttribute("href"),
      item.getAttribute("xlink:href"),
      item.getAttribute("d")
    ].filter(Boolean).join(" ")).join(" "));
    const centerOf = (el) => {
      const rect = rectOf(el);
      return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: 1, y: 1 };
    };
    const currentChatId = () => {
      const match = String(location.href || "").match(/\/(?:a\/)?chat\/s\/([^/?#]+)/i);
      return match?.[1] || "";
    };
    const chatIdFromLink = (link) => {
      const href = String(link?.href || link?.getAttribute?.("href") || "");
      const match = href.match(/\/(?:a\/)?chat\/s\/([^/?#]+)/i);
      return match?.[1] || "";
    };
    const closestClickable = (el) => {
      try {
        return el?.closest?.("button,[role='button'],[role='menuitem'],[role='option'],a[href],[aria-haspopup],[tabindex]:not([tabindex='-1']),[class*='button' i],[class*='btn' i]") || el || null;
      } catch {
        return el || null;
      }
    };
    const disabled = (el) => {
      if (!el) return true;
      try {
        return el.disabled === true
          || el.getAttribute?.("disabled") != null
          || String(el.getAttribute?.("aria-disabled") || "").toLowerCase() === "true";
      } catch {
        return false;
      }
    };
    const dispatchPointer = (el) => {
      const point = centerOf(el);
      const PointerEventCtor = typeof PointerEvent === "function" ? PointerEvent : null;
      const MouseEventCtor = typeof MouseEvent === "function" ? MouseEvent : null;
      const base = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        clientX: point.x,
        clientY: point.y,
        screenX: point.x,
        screenY: point.y,
        button: 0
      };
      let dispatched = false;
      const plans = [
        ["pointerover", PointerEventCtor, { buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true }],
        ["mouseover", MouseEventCtor, { buttons: 0, detail: 0 }],
        ["pointermove", PointerEventCtor, { buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true }],
        ["mousemove", MouseEventCtor, { buttons: 0, detail: 0 }],
        ["pointerdown", PointerEventCtor, { buttons: 1, pointerId: 1, pointerType: "mouse", isPrimary: true }],
        ["mousedown", MouseEventCtor, { buttons: 1, detail: 1 }],
        ["pointerup", PointerEventCtor, { buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true }],
        ["mouseup", MouseEventCtor, { buttons: 0, detail: 1 }],
        ["click", MouseEventCtor, { buttons: 0, detail: 1 }]
      ];
      for (const [type, Ctor, extra] of plans) {
        try {
          if (typeof Ctor !== "function") continue;
          el.dispatchEvent(new Ctor(type, { ...base, ...extra }));
          dispatched = true;
        } catch {}
      }
      try {
        el.click?.();
        dispatched = true;
      } catch {}
      return dispatched;
    };
    const eventPathFor = (target, currentTarget) => {
      const path = [];
      const add = (node) => {
        if (node && !path.includes(node)) path.push(node);
      };
      add(target);
      for (let node = target; node; node = node.parentNode || node.host || null) add(node);
      add(currentTarget);
      add(document);
      add(window);
      return path;
    };
    const fakeReactEvent = (target, currentTarget, type = "click") => {
      const point = centerOf(target);
      const event = {
        type,
        target,
        srcElement: target,
        currentTarget,
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 0,
        buttons: type === "mousedown" || type === "pointerdown" ? 1 : 0,
        detail: 1,
        clientX: point.x,
        clientY: point.y,
        screenX: point.x,
        screenY: point.y,
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() {},
        stopImmediatePropagation() {},
        isDefaultPrevented() { return this.defaultPrevented; },
        isPropagationStopped() { return false; },
        persist() {},
        composedPath() { return eventPathFor(target, currentTarget); }
      };
      event.nativeEvent = event;
      return event;
    };
    const reactPropBags = (node) => {
      const bags = [];
      const seen = new Set();
      const addBag = (bag) => {
        if (!bag || seen.has(bag)) return;
        seen.add(bag);
        bags.push(bag);
      };
      for (const current of [node, closestClickable(node), node?.parentElement].filter(Boolean)) {
        try { addBag(current); } catch {}
        let names = [];
        try { names = Object.getOwnPropertyNames(current); } catch {}
        for (const name of names) {
          if (!/react|props|fiber/i.test(name)) continue;
          let value = null;
          try { value = current[name]; } catch {}
          addBag(value);
          addBag(value?.memoizedProps);
          addBag(value?.pendingProps);
          for (let fiber = value?.return, depth = 0; fiber && depth < 6; fiber = fiber.return, depth += 1) {
            addBag(fiber.memoizedProps);
            addBag(fiber.pendingProps);
          }
        }
      }
      return bags;
    };
    const invokeReact = (node, handlerNames = ["onClick", "onPointerUp", "onMouseUp", "onPointerDown", "onMouseDown"]) => {
      if (!node || disabled(node)) return false;
      const target = closestClickable(node) || node;
      try { target.focus?.({ preventScroll: true }); } catch {
        try { target.focus?.(); } catch {}
      }
      for (const bag of reactPropBags(target)) {
        for (const handlerName of handlerNames) {
          const handler = bag?.[handlerName];
          if (typeof handler !== "function") continue;
          try {
            const eventType = handlerName.replace(/^on/, "").toLowerCase() || "click";
            handler.call(target, fakeReactEvent(target, target, eventType));
            return true;
          } catch {}
        }
      }
      return false;
    };
    const nativeClick = (node) => {
      if (!node || typeof node.click !== "function") return false;
      try {
        node.click();
        return true;
      } catch {
        return false;
      }
    };
    const activate = (node, handlerNames) => {
      const target = closestClickable(node);
      if (!target || disabled(target)) return false;
      try { target.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch {}
      return dispatchPointer(target) || nativeClick(target) || invokeReact(target, handlerNames);
    };
    const activateUntil = async (node, getter, handlerNames, { settleMs = 180 } = {}) => {
      const target = closestClickable(node);
      if (!target || disabled(target)) return null;
      try { target.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch {}
      try { target.focus?.({ preventScroll: true }); } catch {
        try { target.focus?.(); } catch {}
      }
      const read = () => {
        try { return typeof getter === "function" ? getter() : null; } catch { return null; }
      };
      const initial = read();
      if (initial) return initial;
      const attempts = [
        () => dispatchPointer(target),
        () => nativeClick(target),
        () => invokeReact(target, handlerNames)
      ];
      for (const attempt of attempts) {
        try { attempt(); } catch {}
        await wait(Math.max(40, Number(settleMs) || 40));
        const value = read();
        if (value) return value;
      }
      return read();
    };
    const waitFor = async (getter, timeoutMs = 3000, intervalMs = 90) => {
      const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
      while (Date.now() <= deadline) {
        const value = getter();
        if (value) return value;
        await wait(Math.max(30, Number(intervalMs) || 30));
      }
      return getter();
    };
    const currentTopicLink = () => {
      const links = all("a[href*='/chat/s/'],a[href*='/a/chat/s/']").filter(visible);
      const id = currentChatId();
      if (id) {
        const exact = links.find((link) => chatIdFromLink(link) === id);
        if (exact) return exact;
      }
      const selected = links.find((link) => {
        const className = String(link.className || "");
        const ariaCurrent = String(link.getAttribute?.("aria-current") || "").toLowerCase();
        return /\b(active|selected|current)\b/i.test(className) || ariaCurrent === "page";
      });
      return selected || links[0] || null;
    };
    const titleTokenFromValue = (value) => {
      const token = compact(normalize(value).replace(/\s*[-|–]\s*DeepSeek.*$/i, "").replace(/\s*-\s*深度求索.*$/i, ""));
      return /^(deepseek|deepseekintotheunknown|intotheunknown|newchat|新聊天)$/.test(token) ? "" : token;
    };
    const currentTitleTokens = () => Array.from(new Set([
      document.title,
      textOf(currentTopicLink())
    ].map(titleTokenFromValue).filter(Boolean)));
    const closeTransientMenus = () => {
      try {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true, composed: true }));
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true, composed: true }));
      } catch {}
    };
    const findHeaderMoreButton = () => {
      const titleTokens = currentTitleTokens();
      if (!titleTokens.length) return null;
      const titleNodes = [];
      const seenTitles = new Set();
      for (const node of all("h1,h2,h3,button,[role='button'],div,span")) {
        if (!node || seenTitles.has(node) || !visible(node)) continue;
        const rect = rectOf(node);
        if (!rect || rect.top < 0 || rect.top > 190 || rect.left < 120 || rect.width < 20 || rect.height < 14 || rect.height > 92) continue;
        if (String(node.href || node.getAttribute?.("href") || "").match(/\/(?:a\/)?chat\/s\//i)) continue;
        const token = compact(textOf(node));
        if (!token || !titleTokens.some((item) => token.includes(item) || item.includes(token))) continue;
        seenTitles.add(node);
        titleNodes.push({ node, rect });
      }
      const candidates = [];
      const seenButtons = new Set();
      const addButton = (button, titleRect, extraScore = 0) => {
        const target = closestClickable(button);
        if (!target || seenButtons.has(target) || disabled(target)) return;
        const rect = rectOf(target);
        if (!rect || rect.width < 10 || rect.height < 10 || rect.width > 76 || rect.height > 76) return;
        if (rect.top > titleRect.bottom + 34 || rect.bottom < titleRect.top - 34) return;
        if (rect.left < titleRect.left - 72 || rect.left > titleRect.right + 260) return;
        if (String(target.href || target.getAttribute?.("href") || "").match(/\/(?:a\/)?chat\/s\//i)) return;
        const token = compact(textOf(target));
        if (/newchat|sidebar|back|close|search|send|deepthink|model|expert|share|copy|新聊天|侧边栏|返回|关闭|搜索|发送|分享|复制/.test(token)) return;
        const signature = compact(svgTextOf(target));
        const iconish = !token || /more|menu|options|ellipsis|dots|circle|kebab|更多|菜单|选项/.test(token + signature) || all("circle", target).length >= 2 || rect.width <= 44;
        if (!iconish) return;
        seenButtons.add(target);
        candidates.push({
          element: target,
          score: extraScore
            + (rect.left >= titleRect.right - 8 ? 520 : 0)
            + (!token ? 180 : 0)
            + (/more|menu|options|ellipsis|dots|更多|菜单|选项/.test(token + signature) ? 360 : 0)
            + (/circle|dots|ellipsis|kebab/.test(signature) ? 180 : 0)
            + Math.max(0, 160 - Math.abs(rect.left - titleRect.right)),
          right: rect.right,
          left: rect.left
        });
      };
      for (const { node, rect: titleRect } of titleNodes.slice(0, 8)) {
        for (let scope = node, depth = 0; scope && scope !== document.body && depth < 5; scope = scope.parentElement, depth += 1) {
          const scopeRect = rectOf(scope);
          if (!scopeRect || scopeRect.top > 210 || scopeRect.height > 180 || scopeRect.width > 900) continue;
          for (const button of all("button,[role='button'],[aria-haspopup],[aria-expanded],[tabindex]:not([tabindex='-1']),[class*='button' i]", scope)) {
            addButton(button, titleRect, 120 - depth * 12);
          }
        }
        for (const button of all("button,[role='button'],[aria-haspopup],[aria-expanded],[tabindex]:not([tabindex='-1'])")) {
          addButton(button, titleRect, 0);
        }
      }
      candidates.sort((a, b) => b.score - a.score || b.right - a.right || b.left - a.left);
      return candidates[0]?.element || null;
    };
    const hoverTopic = (link) => {
      try { link.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch {}
      for (const target of [link, link?.parentElement, link?.parentElement?.parentElement].filter(Boolean)) {
        const point = centerOf(target);
        const PointerEventCtor = typeof PointerEvent === "function" ? PointerEvent : null;
        const MouseEventCtor = typeof MouseEvent === "function" ? MouseEvent : null;
        for (const type of ["pointerover", "mouseover", "mouseenter", "pointermove", "mousemove"]) {
          try {
            const Ctor = type.startsWith("pointer") ? PointerEventCtor : MouseEventCtor;
            if (typeof Ctor !== "function") continue;
            target.dispatchEvent(new Ctor(type, {
              bubbles: type !== "mouseenter",
              cancelable: true,
              composed: true,
              view: window,
              clientX: point.x,
              clientY: point.y,
              screenX: point.x,
              screenY: point.y,
              pointerId: 1,
              pointerType: "mouse",
              isPrimary: true
            }));
          } catch {}
        }
      }
    };
    const visualTopicRow = (link) => {
      const linkRect = rectOf(link);
      if (!link || !linkRect) return link;
      const linkToken = compact(textOf(link));
      let best = { element: link, score: linkRect.width };
      for (let node = link; node && node !== document.body; node = node.parentElement) {
        const rect = rectOf(node);
        if (!rect || rect.left > 560 || rect.width < 80 || rect.width > 620 || rect.height < 24 || rect.height > 118) continue;
        if (rect.top > linkRect.top + 14 || rect.bottom < linkRect.bottom - 14) continue;
        const token = compact(textOf(node));
        if (linkToken && token && !token.includes(linkToken) && !linkToken.includes(token)) continue;
        const className = String(node.className || "");
        const active = /\b(active|selected|current)\b/i.test(className) || String(node.getAttribute?.("aria-current") || "").toLowerCase() === "page";
        const score = rect.width + Math.max(0, rect.right - linkRect.right) * 2 + (active ? 500 : 0);
        if (score > best.score) best = { element: node, score };
      }
      return best.element || link;
    };
    const sidebarRootForTopic = (link) => {
      const roots = [];
      const seen = new Set();
      const add = (node, seedRect) => {
        if (!node || seen.has(node)) return;
        seen.add(node);
        const rect = rectOf(node);
        if (!rect || rect.left > 560 || rect.width < 120 || rect.width > 620 || rect.height < 36) return;
        if (seedRect && (rect.top > seedRect.top + 12 || rect.bottom < seedRect.bottom - 12)) return;
        const links = all("a[href*='/chat/s/'],a[href*='/a/chat/s/']", node).filter(visible).length;
        const value = textOf(node);
        const className = String(node.className || "");
        const historyish = /today|yesterday|pinned|new chat|今天|昨天|新聊天|置顶/i.test(value)
          || /scroll|history|sidebar|sider|conversation/i.test(className)
          || links >= 2;
        if (!historyish && links < 1) return;
        roots.push({
          element: node,
          score: Math.min(links, 12) * 120 + rect.width + Math.min(rect.height, 900) * 0.04 - rect.left
        });
      };
      const seedRect = rectOf(link);
      for (const seed of [link, ...all("a[href*='/chat/s/'],a[href*='/a/chat/s/']").filter(visible).slice(0, 5)]) {
        for (let node = seed; node && node !== document.body; node = node.parentElement) add(node, seed === link ? seedRect : null);
      }
      roots.sort((a, b) => b.score - a.score);
      return roots[0]?.element || null;
    };
    const topicMenuRect = (link) => {
      const base = rectOf(visualTopicRow(link)) || rectOf(link);
      if (!base) return null;
      const sidebarRect = rectOf(sidebarRootForTopic(link));
      const right = sidebarRect && sidebarRect.left <= base.left + 36 && sidebarRect.right > base.right + 20
        ? Math.min(sidebarRect.right - 10, Math.max(base.right, sidebarRect.right - 10))
        : base.right;
      return {
        left: base.left,
        top: base.top,
        right,
        bottom: base.bottom,
        width: right - base.left,
        height: base.height
      };
    };
    const findTopicMoreButton = (link) => {
      if (!link) return null;
      hoverTopic(link);
      const visualRow = visualTopicRow(link);
      const linkRect = topicMenuRect(link);
      if (!linkRect) return null;
      const candidates = [];
      const seen = new Set();
      const add = (node, extra = 0) => {
        const target = closestClickable(node);
        if (!target || seen.has(target) || target === link || disabled(target)) return;
        const rect = rectOf(target);
        if (!rect || rect.width < 8 || rect.height < 8 || rect.width > 80 || rect.height > 80) return;
        const overlaps = rect.top < linkRect.bottom + 10 && rect.bottom > linkRect.top - 10;
        const nearRight = rect.left >= linkRect.right - 132 && rect.left <= linkRect.right + 84;
        if (!overlaps || !nearRight) return;
        const value = compact(textOf(target));
        if (value && !/more|menu|options|ellipsis|dots|更多|菜单|选项/.test(value)) return;
        seen.add(target);
        candidates.push({
          element: target,
          score: extra
            + (visible(target) ? 180 : 40)
            + (!value ? 180 : 0)
            + Math.max(0, 100 - Math.abs((rect.left + rect.right) / 2 - (linkRect.right - 28))),
          right: rect.right
        });
      };
      const iconSelector = "button,[role='button'],[aria-haspopup],[aria-expanded],[tabindex]:not([tabindex='-1']),[class*='button' i],[class*='btn' i],svg,[class*='more' i],[class*='menu' i],[class*='option' i],[class*='action' i],[class*='ellipsis' i]";
      for (const node of all(iconSelector, visualRow)) add(node, 320);
      for (let scope = link, depth = 0; scope && scope !== document.body && depth < 5; scope = scope.parentElement, depth += 1) {
        for (const node of all(iconSelector, scope)) {
          add(node, 260 - depth * 18);
        }
      }
      for (const offset of [18, 28, 38, 48, 60, 76, 96, 118, 142]) {
        try {
          const pointTarget = document.elementFromPoint(Math.max(linkRect.left + 16, linkRect.right - offset), linkRect.top + linkRect.height / 2);
          if (pointTarget) add(pointTarget, 180 - offset);
        } catch {}
      }
      for (const node of all(iconSelector)) add(node, 0);
      candidates.sort((a, b) => b.score - a.score || b.right - a.right);
      return candidates[0]?.element || null;
    };
    const menuRoots = () => all([
      "[role='menu']",
      "[role='listbox']",
      "[data-radix-popper-content-wrapper]",
      "[data-floating-ui-portal]",
      "[class*='dropdown' i]",
      "[class*='popover' i]",
      "[class*='menu' i]",
      "body > div"
    ].join(", ")).filter((root) => {
      if (!visible(root)) return false;
      const value = textOf(root);
      const area = (() => {
        const rect = rectOf(root);
        return rect ? rect.width * rect.height : 0;
      })();
      return area < 450000 && /delete|rename|pin|share|删除|重命名|置顶|分享/i.test(value);
    }).sort((a, b) => {
      const ar = rectOf(a);
      const br = rectOf(b);
      return (br?.right || 0) - (ar?.right || 0) || (ar?.top || 0) - (br?.top || 0);
    });
    const isDeleteMenuText = (value) => {
      const token = compact(value);
      return token === "delete" || token === "删除";
    };
    const findDeleteMenuItem = () => {
      const roots = menuRoots();
      const candidates = [];
      for (const root of roots) {
        for (const node of all("button,[role='button'],[role='menuitem'],[tabindex]:not([tabindex='-1']),div", root)) {
          if (!visible(node) || disabled(node)) continue;
          const value = textOf(node);
          if (!isDeleteMenuText(value)) continue;
          const target = closestClickable(node);
          const rect = rectOf(target);
          candidates.push({
            element: target,
            area: rect ? rect.width * rect.height : 0,
            top: rect?.top || 0
          });
        }
      }
      candidates.sort((a, b) => a.area - b.area || a.top - b.top);
      return candidates[0]?.element || null;
    };
    const serializableRect = (rect) => rect ? {
      left: Math.round(Number(rect.left || 0) * 100) / 100,
      top: Math.round(Number(rect.top || 0) * 100) / 100,
      right: Math.round(Number(rect.right || 0) * 100) / 100,
      bottom: Math.round(Number(rect.bottom || 0) * 100) / 100,
      width: Math.round(Number(rect.width || 0) * 100) / 100,
      height: Math.round(Number(rect.height || 0) * 100) / 100
    } : null;
    const trustedMenuClickForTopicLink = (link, reason = "topic menu trigger requires trusted browser input") => {
      const linkRect = topicMenuRect(link);
      if (!linkRect) return null;
      const y = linkRect.top + linkRect.height / 2;
      const points = [18, 28, 38, 48, 60, 76, 96, 118, 142]
        .map((offset) => ({ x: Math.max(linkRect.left + 16, linkRect.right - offset), y }));
      const seen = new Set();
      const framePoints = points
        .map((point) => ({
          x: Math.round(Number(point.x) * 100) / 100,
          y: Math.round(Number(point.y) * 100) / 100
        }))
        .filter((point) => {
          if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
          const key = `${point.x},${point.y}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      const framePoint = framePoints[0];
      if (!framePoint) return null;
      return {
        kind: "topic-menu-trigger",
        site: "deepseek",
        reason,
        framePoint,
        framePoints,
        frameRect: serializableRect(linkRect),
        hoverSettleMs: 360
      };
    };
    const trustedKeySequenceForTopicLink = (link, reason = "topic menu trigger requires keyboard focus") => {
      const rowRect = topicMenuRect(link);
      const visualRect = rectOf(visualTopicRow(link)) || rectOf(link) || rowRect;
      if (!rowRect || !visualRect) return null;
      const focusX = Math.min(
        rowRect.right - 104,
        Math.max(rowRect.left + 24, visualRect.left + Math.min(180, visualRect.width * 0.42))
      );
      return {
        kind: "topic-menu-keyboard",
        site: "deepseek",
        reason,
        framePoint: {
          x: Math.round(focusX * 100) / 100,
          y: Math.round((rowRect.top + rowRect.height / 2) * 100) / 100
        },
        frameRect: serializableRect(rowRect),
        keys: [
          { key: "Tab", settleMs: 140 },
          { key: "Enter", settleMs: 260 }
        ],
        clickSettleMs: 160,
        keySettleMs: 140,
        settleMs: 460
      };
    };
    const trustedHoverForTopicLink = (link, reason = "topic menu trigger requires trusted hover") => {
      const linkRect = topicMenuRect(link);
      if (!linkRect) return null;
      return {
        kind: "topic-menu-hover",
        site: "deepseek",
        reason,
        framePoint: {
          x: Math.round(Math.max(linkRect.left + 16, linkRect.right - 28) * 100) / 100,
          y: Math.round((linkRect.top + linkRect.height / 2) * 100) / 100
        },
        frameRect: serializableRect(linkRect),
        hoverSettleMs: 520
      };
    };
    const resultWithTrustedHover = (reason, link) => {
      const trustedHover = trustedHoverForTopicLink(link, reason);
      return {
        ok: false,
        reason,
        ...(trustedHover ? { needsTrustedHover: true, trustedHover } : {})
      };
    };
    const resultWithTrustedMenuClick = (reason, link) => {
      const trustedMenuClick = trustedMenuClickForTopicLink(link, reason);
      return {
        ok: false,
        reason,
        ...(trustedMenuClick ? { needsTrustedMenuClick: true, trustedMenuClick } : {})
      };
    };
    const resultWithTrustedKeySequence = (reason, link) => {
      const trustedKeySequence = trustedKeySequenceForTopicLink(link, reason);
      const trustedMenuClick = trustedMenuClickForTopicLink(link, reason);
      return {
        ok: false,
        reason,
        ...(trustedKeySequence ? { needsTrustedKeySequence: true, trustedKeySequence } : {}),
        ...(trustedMenuClick ? { needsTrustedMenuClick: true, trustedMenuClick } : {})
      };
    };
    const dialogTextMatches = (value) => {
      const text = String(value || "").toLowerCase();
      const token = compact(value);
      return /are you sure|chat can(?:'|’)?t be recovered|chat cant be recovered|share links from it will be disabled|recover|recovered|confirm|cancel|cannot be undone|permanently|确定|确认|取消|恢复|不可恢复|无法恢复|不能恢复/.test(text)
        || /areyousure|chatcantberecovered|sharelinksfromitwillbedisabled|recover|recovered|confirm|cancel|cannotbeundone|permanently|确定|确认|取消|恢复|不可恢复|无法恢复|不能恢复/.test(token);
    };
    const dialogConfirmContextMatches = (value) => {
      const text = String(value || "").toLowerCase();
      const token = compact(value);
      return /are you sure|chat can(?:'|’)?t be recovered|chat cant be recovered|share links from it will be disabled|recover|recovered|confirm|cannot be undone|permanently|确定|确认|恢复|不可恢复|无法恢复|不能恢复/.test(text)
        || /areyousure|chatcantberecovered|sharelinksfromitwillbedisabled|recover|recovered|confirm|cannotbeundone|permanently|确定|确认|恢复|不可恢复|无法恢复|不能恢复/.test(token);
    };
    const dialogHasCancel = (value) => {
      const text = String(value || "").toLowerCase();
      const token = compact(value);
      return /cancel|取消/.test(text) || /cancel|取消/.test(token);
    };
    const dialogRoots = () => all([
      "[role='alertdialog']",
      "[role='dialog']",
      "[data-radix-dialog-content]",
      "[data-state='open']",
      "[class*='modal' i]",
      "body > div"
    ].join(", ")).filter((root) => {
      if (!visible(root)) return false;
      const rect = rectOf(root);
      const area = rect ? rect.width * rect.height : 0;
      const semantic = (() => {
        try {
          return root.matches?.("[role='alertdialog'],[role='dialog'],[data-radix-dialog-content]") || false;
        } catch {
          return false;
        }
      })();
      if (!semantic && (area < 1200 || area > 380000)) return false;
      return dialogTextMatches(textOf(root));
    })
      .sort((a, b) => {
        const ar = rectOf(a);
        const br = rectOf(b);
        return (ar ? ar.width * ar.height : 0) - (br ? br.width * br.height : 0);
      });
    const isConfirmText = (value) => {
      const token = compact(value);
      if (!token || /cancel|取消|keep|保留/.test(token)) return false;
      return token === "deletechat"
        || token === "delete"
        || token === "confirm"
        || token === "confirmdelete"
        || token === "删除"
        || token === "确认"
        || token === "确认删除"
        || token === "删除聊天";
    };
    const confirmDialogFor = (node) => {
      for (let root = node, depth = 0; root && root !== document.body && depth < 8; root = root.parentElement, depth += 1) {
        if (!visible(root)) continue;
        const rootText = textOf(root);
        if (dialogHasCancel(rootText) && dialogConfirmContextMatches(rootText)) return { element: root, text: rootText };
      }
      return null;
    };
    const findConfirmButtonFast = () => {
      const candidates = [];
      for (const node of all("button,[role='button'],[tabindex]:not([tabindex='-1']),[class*='button' i]")) {
        if (!visible(node) || disabled(node)) continue;
        const value = textOf(node);
        if (!isConfirmText(value)) continue;
        const dialog = confirmDialogFor(node);
        if (!dialog) continue;
        const target = closestClickable(node);
        if (!target || disabled(target)) continue;
        const rect = rectOf(target);
        const token = compact(value);
        candidates.push({
          element: target,
          score: token === "deletechat" || token === "删除聊天" ? 700 : 0,
          area: rect ? rect.width * rect.height : 0,
          right: rect?.right || 0,
          dialogText: dialog.text
        });
      }
      candidates.sort((a, b) => b.score - a.score || a.area - b.area || b.right - a.right);
      return candidates[0]?.element || null;
    };
    const findConfirmButton = () => {
      const fast = findConfirmButtonFast();
      if (fast) return fast;
      const candidates = [];
      for (const root of dialogRoots()) {
        const rootText = textOf(root);
        if (!dialogTextMatches(rootText)) continue;
        for (const node of all("button,[role='button'],[tabindex]:not([tabindex='-1']),[class*='button' i],div", root)) {
          if (!visible(node) || disabled(node)) continue;
          const value = textOf(node);
          if (!isConfirmText(value)) continue;
          const target = closestClickable(node);
          const rect = rectOf(target);
          candidates.push({
            element: target,
            score: compact(value) === "deletechat" || compact(value) === "删除聊天" ? 600 : 0,
            area: rect ? rect.width * rect.height : 0,
            right: rect?.right || 0
          });
        }
      }
      candidates.sort((a, b) => b.score - a.score || a.area - b.area || b.right - a.right);
      return candidates[0]?.element || null;
    };
    const confirmGone = () => !findConfirmButton();
    const clickExistingConfirm = async () => {
      const button = findConfirmButton();
      if (!button) return null;
      if (!activate(button, ["onClick", "onPointerUp", "onMouseUp"])) return { ok: false, reason: "delete confirmation click failed" };
      const closed = await waitFor(confirmGone, 5200, 140);
      return closed ? { ok: true } : { ok: false, reason: "delete confirmation did not close" };
    };
    const deleteThread = async (data = {}) => {
      const existingConfirm = await clickExistingConfirm();
      if (existingConfirm) return existingConfirm;
      const existingDeleteItem = await waitFor(findDeleteMenuItem, (data?.trustedKeySequenceRetried || data?.trustedMenuClickRetried) ? 3400 : 300, 60);
      if (existingDeleteItem && activate(existingDeleteItem, ["onClick", "onPointerUp", "onMouseUp"])) {
        const existingMenuConfirm = await waitFor(findConfirmButton, 4200, 100);
        if (!existingMenuConfirm) return { ok: false, reason: "delete confirmation button not found" };
        if (!activate(existingMenuConfirm, ["onClick", "onPointerUp", "onMouseUp"])) {
          return { ok: false, reason: "delete confirmation click failed" };
        }
        const closed = await waitFor(confirmGone, 6200, 140);
        return closed ? { ok: true } : { ok: false, reason: "delete confirmation did not close" };
      }
      if (data?.trustedMenuClickRetried) return { ok: false, reason: "trusted topic menu click did not open" };
      const headerTrigger = findHeaderMoreButton();
      const openTriggerAndDelete = async (trigger, timeoutMs = 3000) => {
        const deleteItem = await activateUntil(
          trigger,
          findDeleteMenuItem,
          ["onClick", "onPointerUp", "onMouseUp", "onPointerDown", "onMouseDown"],
          { settleMs: 220 }
        ) || await waitFor(findDeleteMenuItem, timeoutMs, 90);
        if (!deleteItem) return null;
        return activate(deleteItem, ["onClick", "onPointerUp", "onMouseUp"]) ? deleteItem : null;
      };
      if (headerTrigger) {
        if (await openTriggerAndDelete(headerTrigger, 2600)) {
          const headerConfirm = await waitFor(findConfirmButton, 4200, 100);
          if (!headerConfirm) return { ok: false, reason: "delete confirmation button not found" };
          if (!activate(headerConfirm, ["onClick", "onPointerUp", "onMouseUp"])) {
            return { ok: false, reason: "delete confirmation click failed" };
          }
          const closed = await waitFor(confirmGone, 6200, 140);
          return closed ? { ok: true } : { ok: false, reason: "delete confirmation did not close" };
        }
        closeTransientMenus();
      }
      const link = currentTopicLink();
      if (!link) return { ok: false, reason: "current topic row not found" };
      const trigger = await waitFor(() => findTopicMoreButton(link), 1800, 80);
      if (!trigger) return data?.trustedMenuClickRetried
        ? { ok: false, reason: "trusted topic menu click did not open" }
        : data?.trustedKeySequenceRetried
          ? resultWithTrustedMenuClick("keyboard topic menu did not open", link)
        : resultWithTrustedKeySequence("topic menu trigger not found", link);
      const deleteItem = await openTriggerAndDelete(trigger, 3000);
      if (!deleteItem) return data?.trustedMenuClickRetried
        ? { ok: false, reason: "trusted topic menu click did not open" }
        : data?.trustedKeySequenceRetried
          ? resultWithTrustedMenuClick("keyboard topic menu did not open", link)
        : resultWithTrustedKeySequence("delete menu item not found", link);
      const confirmButton = await waitFor(findConfirmButton, 4200, 100);
      if (!confirmButton) return { ok: false, reason: "delete confirmation button not found" };
      if (!activate(confirmButton, ["onClick", "onPointerUp", "onMouseUp"])) {
        return { ok: false, reason: "delete confirmation click failed" };
      }
      const closed = await waitFor(confirmGone, 6200, 140);
      return closed ? { ok: true } : { ok: false, reason: "delete confirmation did not close" };
    };

    window.__CHATCLUB_DEEPSEEK_DELETE_BRIDGE__ = { version: DEEPSEEK_DELETE_BRIDGE_VERSION, deleteThread };
    window.addEventListener("message", async (event) => {
      const message = event.data;
      if (message?.source !== DEEPSEEK_DELETE_SOURCE || message.type !== "request" || message.action !== "deleteThread") return;
      let result;
      try {
        result = await deleteThread(message.data || {});
      } catch (error) {
        result = { ok: false, reason: error?.message || String(error || "delete bridge failed") };
      }
      try {
        window.postMessage({
          source: DEEPSEEK_DELETE_SOURCE,
          type: "response",
          id: message.id,
          action: "deleteThread",
          site: "deepseek",
          ...result
        }, "*");
      } catch {}
    }, true);
  }

  const NATIVE_COPY_BRIDGE_VERSION = "2026.07.08.13";
  if (window.__CHATCLUB_NATIVE_COPY_BRIDGE_VERSION__ !== NATIVE_COPY_BRIDGE_VERSION) {
    window.__CHATCLUB_NATIVE_COPY_BRIDGE__ = true;
    window.__CHATCLUB_NATIVE_COPY_BRIDGE_VERSION__ = NATIVE_COPY_BRIDGE_VERSION;
    const captures = new Map();
    let hooksInstalled = false;
    const post = (type, action, data) => {
      try {
        window.postMessage({ source: COPY_SOURCE, type, id: action.id, action: action.action, data }, "*");
      } catch {}
    };
    const activeCaptureId = () => {
      let current = null;
      captures.forEach((_record, id) => { current = id; });
      return current;
    };
    const captureText = (id, text, priority = 1) => {
      const record = captures.get(id);
      const value = String(text || "");
      if (!record || !value) return false;
      if (record.priority > priority) return true;
      record.priority = priority;
      record.text = value;
      post("capture", { id, action: "capture" }, { text: value, priority });
      return true;
    };
    const mimePriority = (type) => {
      const value = String(type || "").toLowerCase();
      if (!value) return 0;
      if (/text\/plain|^text$|plain/.test(value)) return 6;
      if (/text\/html|html/.test(value)) return 2;
      if (value.startsWith("text/")) return /uri|url/.test(value) ? 1 : 4;
      return 0;
    };
    const selectedText = () => {
      try {
        const selection = window.getSelection?.();
        if (selection && String(selection)) return String(selection);
      } catch {}
      try {
        const element = document.activeElement;
        const tag = String(element?.tagName || "").toLowerCase();
        if (tag !== "textarea" && tag !== "input") return "";
        const type = String(element?.getAttribute?.("type") || "").toLowerCase();
        if (tag === "input" && /^(?:button|checkbox|color|file|hidden|image|radio|range|reset|submit|password)$/.test(type)) return "";
        const start = Number(element["selectionStart"]);
        const end = Number(element["selectionEnd"]);
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) return String(element["value"] || "").slice(start, end);
      } catch {}
      return "";
    };
    const captureTransfer = (transfer, id) => {
      try {
        const plain = transfer?.getData?.("text/plain") || transfer?.getData?.("text") || transfer?.getData?.("Text") || "";
        if (plain) return captureText(id, plain, 6);
        const html = transfer?.getData?.("text/html") || "";
        if (html) return captureText(id, html, 2);
      } catch {}
      return false;
    };
    const blobText = async (blob) => {
      try {
        if (blob && typeof blob.text === "function") return await blob.text();
        if (blob !== undefined && blob !== null) return String(blob);
      } catch {}
      return "";
    };
    const clipboardItemsText = async (items) => {
      let fallback = "";
      let html = "";
      try {
        for (const item of Array.from(items || [])) {
          if (!item?.types) continue;
          for (const type of Array.from(item.types || [])) {
            const priority = mimePriority(type);
            if (!priority) continue;
            const blob = await item.getType(type);
            const value = await blobText(blob);
            if (!value) continue;
            if (priority >= 6) return value;
            if (priority > 2 && !fallback) fallback = value;
            else if (!html) html = value;
          }
        }
      } catch {}
      return fallback || html;
    };
    const captureClipboardValue = (id, value, handlesItems = false) => {
      if (!id) return false;
      if (handlesItems) {
        clipboardItemsText(value).then((text) => captureText(id, text, 6));
        return true;
      }
      return captureText(id, value, 6);
    };
    const wrapMethod = (target, key, handlesItems = false) => {
      try {
        const original = target?.[key];
        if (typeof original !== "function") return false;
        if (original.__CHATCLUB_NATIVE_COPY_WRAPPED_VERSION__ === NATIVE_COPY_BRIDGE_VERSION) return true;
        const wrapped = function (...args) {
          const id = activeCaptureId();
          if (id) {
            captureClipboardValue(id, args[0], handlesItems);
            return Promise.resolve();
          }
          return original.apply(this && this !== window ? this : target, args);
        };
        wrapped.__CHATCLUB_NATIVE_COPY_WRAPPED__ = true;
        wrapped.__CHATCLUB_NATIVE_COPY_WRAPPED_VERSION__ = NATIVE_COPY_BRIDGE_VERSION;
        Object.defineProperty(target, key, { configurable: true, writable: true, value: wrapped });
        return true;
      } catch {
        return false;
      }
    };
    const wrapDataTransfer = () => {
      try {
        const proto = window.DataTransfer?.prototype;
        const original = proto?.setData;
        if (typeof original !== "function") return false;
        if (original.__CHATCLUB_NATIVE_COPY_WRAPPED_VERSION__ === NATIVE_COPY_BRIDGE_VERSION) return true;
        const wrapped = function (...args) {
          const id = activeCaptureId();
          if (id) {
            const priority = mimePriority(args[0]);
            if (priority) captureText(id, args[1], priority);
            return undefined;
          }
          return original.apply(this, args);
        };
        wrapped.__CHATCLUB_NATIVE_COPY_WRAPPED__ = true;
        wrapped.__CHATCLUB_NATIVE_COPY_WRAPPED_VERSION__ = NATIVE_COPY_BRIDGE_VERSION;
        Object.defineProperty(proto, "setData", { configurable: true, writable: true, value: wrapped });
        return true;
      } catch {
        return false;
      }
    };
    const dispatchSyntheticCopyEvent = () => {
      try {
        const init = { bubbles: true, cancelable: true };
        let event = null;
        try {
          const transfer = typeof DataTransfer === "function" ? new DataTransfer() : undefined;
          event = new ClipboardEvent("copy", { ...init, clipboardData: transfer });
        } catch {
          event = new Event("copy", init);
        }
        const target = document.activeElement || document;
        target.dispatchEvent(event);
        return true;
      } catch {
        return false;
      }
    };
    const wrapExecCommand = () => {
      try {
        const original = document.execCommand;
        if (typeof original !== "function") return false;
        if (original.__CHATCLUB_NATIVE_COPY_WRAPPED_VERSION__ === NATIVE_COPY_BRIDGE_VERSION) return true;
        const wrapped = function (...args) {
          const id = activeCaptureId();
          const command = String(args[0] || "").toLowerCase();
          if (id && command === "copy") {
            const before = selectedText();
            if (before) captureText(id, before, 3);
            const result = dispatchSyntheticCopyEvent();
            const after = selectedText();
            if (after) captureText(id, after, 4);
            return result || Boolean(after || before);
          }
          return original.apply(document, args);
        };
        wrapped.__CHATCLUB_NATIVE_COPY_WRAPPED__ = true;
        wrapped.__CHATCLUB_NATIVE_COPY_WRAPPED_VERSION__ = NATIVE_COPY_BRIDGE_VERSION;
        Object.defineProperty(document, "execCommand", { configurable: true, writable: true, value: wrapped });
        return true;
      } catch {
        return false;
      }
    };
    const installClipboardHooks = () => {
      try {
        const clipboard = navigator.clipboard;
        const proto = clipboard && Object.getPrototypeOf(clipboard);
        let installed = false;
        for (const target of [clipboard, proto].filter(Boolean)) {
          installed = wrapMethod(target, "writeText", false) || installed;
          installed = wrapMethod(target, "write", true) || installed;
        }
        try {
          if (clipboard) {
            const proxy = new Proxy(clipboard, {
              get(target, key, receiver) {
                if (key === "writeText") {
                  return (text) => {
                    const id = activeCaptureId();
                    if (id) {
                      captureText(id, text, 7);
                      return Promise.resolve();
                    }
                    return Reflect.get(target, key, receiver).call(target, text);
                  };
                }
                if (key === "write") {
                  return (items) => {
                    const id = activeCaptureId();
                    if (id) {
                      clipboardItemsText(items).then((text) => captureText(id, text, 7));
                      return Promise.resolve();
                    }
                    return Reflect.get(target, key, receiver).call(target, items);
                  };
                }
                const value = Reflect.get(target, key, receiver);
                return typeof value === "function" ? value.bind(target) : value;
              }
            });
            for (const target of [navigator, Object.getPrototypeOf(navigator)].filter(Boolean)) {
              try {
                Object.defineProperty(target, "clipboard", { configurable: true, get: () => proxy });
                installed = true;
              } catch {}
            }
          }
        } catch {}
        hooksInstalled = wrapDataTransfer() || hooksInstalled || installed;
        hooksInstalled = wrapExecCommand() || hooksInstalled;
        return hooksInstalled;
      } catch {
        return hooksInstalled;
      }
    };
    const copyEventCapture = (event) => {
      const id = activeCaptureId();
      if (!id) return;
      try { event?.preventDefault?.(); } catch {}
      const selected = selectedText();
      if (selected) captureText(id, selected, 3);
      const sample = () => {
        try {
          captureTransfer(event?.clipboardData, id);
          const current = selectedText();
          if (current) captureText(id, current, 2);
        } catch {}
      };
      sample();
      setTimeout(sample, 0);
      setTimeout(sample, 30);
    };
    installClipboardHooks();
    window.addEventListener("copy", copyEventCapture, true);
    window.addEventListener("copy", copyEventCapture, false);

    window.addEventListener("message", (event) => {
      const message = event.data;
      if (message?.source !== COPY_SOURCE || message.type !== "request") return;
      if (message.action === "install") {
        const previous = captures.get(message.id);
        if (previous?.timer) clearTimeout(previous.timer);
        const timeoutMs = Math.max(300, Number(message.data?.timeoutMs || message.timeoutMs || message.timeout || message.data?.timeout) || 5000);
        const timer = setTimeout(() => captures.delete(message.id), timeoutMs);
        installClipboardHooks();
        captures.set(message.id, { text: "", priority: 0, timer });
        post("response", message, { installed: true, hooks: hooksInstalled });
      }
      if (message.action === "restore") {
        const record = captures.get(message.id) || {};
        if (record.timer) clearTimeout(record.timer);
        captures.delete(message.id);
        post("response", message, { text: record.text || "" });
      }
    }, true);
  }

  function installGrokStorageAccessBridge() {
    if (window.__CHATCLUB_GROK_STORAGE_ACCESS_BRIDGE__) return;
    window.__CHATCLUB_GROK_STORAGE_ACCESS_BRIDGE__ = true;

    const RELOAD_KEY = "__chatclub_grok_storage_access_reloaded__";
    const diag = {
      version: "2026-07-02-storage-access",
      href: String(location.href || ""),
      host: String(location.hostname || ""),
      framed: true,
      referrer: "",
      ancestorOrigins: [],
      supported: {
        hasStorageAccess: typeof document.hasStorageAccess === "function",
        requestStorageAccess: typeof document.requestStorageAccess === "function",
        permissionsQuery: !!navigator.permissions?.query
      },
      permissionState: "",
      hasStorageAccess: null,
      status: "starting",
      requested: false,
      requestResult: "",
      requestError: "",
      userGestureArmed: false,
      reloadScheduled: false,
      reloadReason: "",
      updatedAt: new Date().toISOString()
    };
    window.__CHATCLUB_GROK_EMBED_DIAG__ = diag;

    const update = (patch = {}) => {
      Object.assign(diag, patch, {
        href: String(location.href || ""),
        updatedAt: new Date().toISOString()
      });
      try {
        diag.referrer = String(document.referrer || "");
      } catch {}
      try {
        diag.ancestorOrigins = Array.from(location.ancestorOrigins || []);
      } catch {}
      return diag;
    };

    const storageMarker = () => `${location.origin || "grok"}|${location.pathname || "/"}`;

    const readHasStorageAccess = async () => {
      if (typeof document.hasStorageAccess !== "function") {
        update({ hasStorageAccess: null });
        return null;
      }
      try {
        const hasAccess = await document.hasStorageAccess();
        update({ hasStorageAccess: Boolean(hasAccess) });
        return Boolean(hasAccess);
      } catch (error) {
        update({ hasStorageAccess: null, hasStorageAccessError: error?.message || String(error || "hasStorageAccess failed") });
        return null;
      }
    };

    const readPermissionState = async () => {
      if (!navigator.permissions?.query) return "";
      try {
        const permission = await navigator.permissions.query({ name: "storage-access" });
        update({ permissionState: String(permission.state || "") });
        permission.onchange = () => update({ permissionState: String(permission.state || "") });
        return String(permission.state || "");
      } catch (error) {
        update({ permissionState: "", permissionError: error?.message || String(error || "permission query failed") });
        return "";
      }
    };

    const reloadOnce = (reason) => {
      const marker = storageMarker();
      try {
        if (sessionStorage.getItem(RELOAD_KEY) === marker) {
          update({ status: "reload-skipped", reloadReason: reason || "", reloadSkipped: "already reloaded for this page" });
          return;
        }
        sessionStorage.setItem(RELOAD_KEY, marker);
      } catch {}
      update({ status: "reload-scheduled", reloadScheduled: true, reloadReason: reason || "" });
      setTimeout(() => {
        try { location.reload(); } catch {}
      }, 80);
    };

    const requestAccess = async (reason) => {
      if (typeof document.requestStorageAccess !== "function") {
        update({ status: "unsupported", requestError: "document.requestStorageAccess is unavailable" });
        return false;
      }
      update({ status: "requesting", requested: true, requestReason: reason || "" });
      try {
        await document.requestStorageAccess();
        const hasAccess = await readHasStorageAccess();
        update({ status: "granted", requestResult: "granted", requestError: "", hasStorageAccess: hasAccess });
        reloadOnce(reason || "requestStorageAccess");
        return true;
      } catch (error) {
        update({ status: "request-failed", requestResult: "failed", requestError: error?.message || String(error || "requestStorageAccess failed") });
        return false;
      }
    };

    const armUserGesture = (reason) => {
      if (diag.userGestureArmed || typeof document.requestStorageAccess !== "function") return;
      update({ status: "waiting-for-user-gesture", userGestureArmed: true, userGestureReason: reason || "" });
      const cleanup = () => {
        for (const type of ["click", "pointerup", "touchend", "keydown"]) {
          window.removeEventListener(type, handler, true);
        }
      };
      const handler = (event) => {
        if (!event?.isTrusted) return;
        if (event.type === "keydown" && !["Enter", " ", "Spacebar"].includes(event.key)) return;
        cleanup();
        update({ userGestureArmed: false, status: "user-gesture-received", userGestureType: event.type });
        requestAccess("trusted-user-gesture");
      };
      for (const type of ["click", "pointerup", "touchend", "keydown"]) {
        window.addEventListener(type, handler, true);
      }
    };

    const run = async () => {
      update({ status: "checking" });
      const hasAccess = await readHasStorageAccess();
      const permissionState = await readPermissionState();
      if (hasAccess === true) {
        update({ status: "already-granted", requestResult: "not-needed", requestError: "" });
        return;
      }
      if (permissionState === "granted") {
        await requestAccess("permission-granted");
        return;
      }
      armUserGesture(permissionState || "permission-unknown");
    };

    run().catch((error) => update({ status: "failed", requestError: error?.message || String(error || "storage access bridge failed") }));
  }

  const host = String(location.hostname || "").toLowerCase();
  const framed = (() => {
    try { return window.parent !== window; } catch { return true; }
  })();

  installChatClubWebviewShim();
  installPreferredModelFocusShield();
  installPreferredModelNavigationFocusGuardBridge();
  installMainWorldLocationBridge();

  if (host === "gemini.google.com" || host.endsWith(".gemini.google.com")) {
    installGeminiModelPickerBridge();
  }

  if (host === "chat.deepseek.com" || host === "deepseek.com" || host.endsWith(".deepseek.com")) {
    installDeepSeekDeleteBridge();
  }

  if (framed && (host === "grok.com" || host.endsWith(".grok.com") || host === "grok.x.ai" || host.endsWith(".grok.x.ai"))) {
    installGrokStorageAccessBridge();
  }

  if (framed && (host === "claude.ai" || host.endsWith(".claude.ai"))) {
    try {
      if (location.pathname === "/") location.replace(`/new${location.search}${location.hash}`);
      Object.defineProperty(document, "referrer", { get: () => "" });
    } catch {}
  }

  if (framed && (host === "app.notion.com" || host.endsWith(".notion.so"))) {
    const NOTION_SEND_BRIDGE_VERSION = "2026.07.13.13";
    if (window.__CHATCLUB_NOTION_SEND_BRIDGE_VERSION__ === NOTION_SEND_BRIDGE_VERSION) return;
    try { window.__CHATCLUB_NOTION_SEND_BRIDGE_CLEANUP__?.(); } catch {}
    const notionSendBridgeAbort = new AbortController();
    window.__CHATCLUB_NOTION_SEND_BRIDGE_CLEANUP__ = () => {
      try { notionSendBridgeAbort.abort(); } catch {}
    };
    window.__CHATCLUB_NOTION_SEND_BRIDGE_VERSION__ = NOTION_SEND_BRIDGE_VERSION;
    window.__CHATCLUB_NOTION_SUBMIT_BRIDGE__ = true;
    const NOTION_SEND_TEXT_SOURCE = PROTOCOL.NOTION_SEND_TEXT_SOURCE;
    const NOTION_SEND_PROMPT_SOURCE = PROTOCOL.NOTION_SEND_PROMPT_SOURCE;
    const NOTION_SEND_TEXT_EVENT = "chatclub:notion-send-text:2026.07.13.13";
    const NOTION_SEND_PROMPT_EVENT = "chatclub:notion-send-prompt:2026.07.13.13";
    const NOTION_SEND_ACTIVATED_EVENT = PROTOCOL.NOTION_SEND_ACTIVATED_EVENT;
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const deadlineFromPayload = (payload = {}, fallbackMs = 10000) => {
      const value = Number(payload?.deadlineAt);
      return Number.isFinite(value) && value > Date.now() ? value : Date.now() + Math.max(1000, Number(fallbackMs) || 10000);
    };
    const remainingDeadlineMs = (deadlineAt, fallbackMs = 1000) => {
      const value = Number(deadlineAt);
      if (!Number.isFinite(value) || value <= 0) return Math.max(0, Number(fallbackMs) || 0);
      return Math.max(0, value - Date.now());
    };
    const deadlineExpired = (deadlineAt) => remainingDeadlineMs(deadlineAt, 1) <= 0;
    const waitUntilDeadline = async (ms, deadlineAt) => {
      const delay = Math.min(Math.max(0, Number(ms) || 0), remainingDeadlineMs(deadlineAt, ms));
      if (delay <= 0) return false;
      await wait(delay);
      return !deadlineExpired(deadlineAt);
    };
    const normalize = (value) => String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n?/g, "\n")
      .trim();
    const compact = (value) => normalize(value).toLowerCase().replace(/\s+/g, "");
    const visible = (el) => {
      if (!el?.getBoundingClientRect) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 4 && rect.height > 4 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
    };
    const isDisabled = (el) => {
      if (!el) return true;
      if (el.disabled || el.hasAttribute?.("disabled") || el.hasAttribute?.("data-disabled")) return true;
      const ariaDisabled = String(el.getAttribute?.("aria-disabled") || "").trim().toLowerCase();
      if (ariaDisabled === "true") return true;
      const dataState = String(el.getAttribute?.("data-state") || "").trim().toLowerCase();
      if (dataState === "disabled") return true;
      try {
        if (typeof el.matches === "function" && el.matches(":disabled")) return true;
      } catch {}
      return false;
    };
    const labelOf = (el) => normalize([
      el?.getAttribute?.("aria-label"),
      el?.getAttribute?.("title"),
      el?.getAttribute?.("data-testid"),
      el?.getAttribute?.("data-test-id"),
      el?.innerText,
      el?.textContent
    ].filter(Boolean).join(" "));
    const queryAll = (root, selector) => {
      try { return Array.from(root?.querySelectorAll?.(selector) || []); } catch { return []; }
    };
    const rectOf = (element) => {
      try {
        const rect = element?.getBoundingClientRect?.();
        return rect && rect.width > 0 && rect.height > 0 ? rect : null;
      } catch {
        return null;
      }
    };
    const collectOpenShadowElements = (root, selector) => {
      const out = [];
      const seenElements = new Set();
      const seenRoots = new Set();
      let hostCount = 0;
      const push = (element) => {
        if (!element || seenElements.has(element)) return;
        seenElements.add(element);
        out.push(element);
      };
      const visit = (scope) => {
        if (!scope || seenRoots.has(scope) || hostCount > 1800) return;
        seenRoots.add(scope);
        if (scope.nodeType === 1) {
          try { if (scope.matches?.(selector)) push(scope); } catch {}
        }
        for (const element of queryAll(scope, selector)) push(element);
        for (const host of queryAll(scope, "*")) {
          if (!host?.shadowRoot) continue;
          hostCount += 1;
          if (hostCount > 1800) break;
          visit(host.shadowRoot);
        }
      };
      visit(root || document);
      return out;
    };
    const editorScope = (editor) => editor?.closest?.("form")
      || editor?.closest?.("[class*='composer' i],[class*='input' i],[data-testid*='composer' i]")
      || editor?.parentElement?.parentElement
      || editor?.parentElement
      || document.body;
    const editorText = (editor) => editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement
      ? normalize(editor.value)
      : normalize(editor?.innerText || editor?.textContent || "");
    const promptMatches = (actual, expected) => {
      const a = normalize(actual);
      const b = normalize(expected);
      return Boolean(a && b && a === b);
    };
    const promptWhitespaceCollapsedMatches = (actual, expected) => {
      const a = normalize(actual);
      const b = normalize(expected);
      if (!a || !b || a === b) return false;
      const compactActual = compact(a);
      const compactExpected = compact(b);
      return Boolean(compactActual && compactExpected && compactActual === compactExpected);
    };
    const promptReceiveFailureReason = (editor, value) => {
      return promptWhitespaceCollapsedMatches(editorText(editor), value)
        ? "Notion AI collapsed prompt whitespace/newlines before submit"
        : "Notion AI input did not receive the prompt";
    };
    const promptSubmitFailureReason = (editor, value) => {
      return promptWhitespaceCollapsedMatches(editorText(editor), value)
        ? "Notion AI collapsed prompt whitespace/newlines before submit"
        : "Notion AI kept the prompt in the composer after submit";
    };
    const findEditor = () => Array.from(document.querySelectorAll("div[contenteditable='true'][role='textbox'],div[contenteditable='true'],div[role='textbox'],textarea"))
      .filter(visible)
      .sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0] || null;
    const activateEditor = async (editor) => {
      if (!editor) return null;
      try { editor.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch {}
      try { editor.click?.(); } catch {}
      try { editor.focus?.({ preventScroll: true }); } catch { try { editor.focus?.(); } catch {} }
      await wait(40);
      return findEditor() || editor;
    };
    const waitFor = async (check, timeoutMs = 2000, intervalMs = 80, deadlineAt = 0) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs && !deadlineExpired(deadlineAt)) {
        const result = check();
        if (result) return result;
        if (!await waitUntilDeadline(intervalMs, deadlineAt)) break;
      }
      return check();
    };
    const selectEditorContents = (editor) => {
      if (!editor || editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) return;
      const selection = window.getSelection?.();
      const range = document.createRange();
      range.selectNodeContents(editor);
      selection?.removeAllRanges?.();
      selection?.addRange?.(range);
    };
    const dispatchInput = (editor, value, inputType = "insertText") => {
      try {
        editor.dispatchEvent(new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          composed: true,
          inputType,
          data: value
        }));
      } catch {}
      try {
        editor.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          cancelable: false,
          composed: true,
          inputType,
          data: value
        }));
      } catch {
        try { editor.dispatchEvent(new Event("input", { bubbles: true, composed: true })); } catch {}
      }
    };
    const setNativeValue = (editor, value) => {
      const prototype = Object.getPrototypeOf(editor);
      const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, "value");
      if (descriptor?.set) descriptor.set.call(editor, value);
      else editor.value = value;
    };
    const escapeHtml = (value) => String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    const insertEditorHtml = async (editor, value) => {
      selectEditorContents(editor);
      try { document.execCommand("insertHTML", false, escapeHtml(value).replace(/\n/g, "<br>")); } catch {}
      dispatchInput(editor, value, "insertFromPaste");
      await wait(120);
      return promptMatches(editorText(editor), value);
    };
    const insertEditorText = async (editor, value) => {
      selectEditorContents(editor);
      try { document.execCommand("insertText", false, value); } catch {}
      dispatchInput(editor, value);
      await wait(90);
      return promptMatches(editorText(editor), value);
    };
    const setEditorText = async (editor, value) => {
      editor = await activateEditor(editor);
      if (!editor) return false;
      if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
        setNativeValue(editor, value);
        dispatchInput(editor, value);
        return promptMatches(editorText(editor), value);
      }
      if (/\n/.test(normalize(value)) && await insertEditorHtml(editor, value)) return true;
      if (await insertEditorText(editor, value)) return true;
      if (!/\n/.test(normalize(value)) && await insertEditorHtml(editor, value)) return true;
      return false;
    };
    const liveEditor = async (fallback = null, timeoutMs = 3000, deadlineAt = 0) => await waitFor(findEditor, timeoutMs, 100, deadlineAt) || fallback;
    const clearEditorText = async (editor) => {
      editor = await activateEditor(editor);
      if (!editor) return;
      if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
        setNativeValue(editor, "");
        dispatchInput(editor, "", "deleteContentBackward");
        await wait(80);
        return;
      }
      try {
        selectEditorContents(editor);
        document.execCommand("delete", false);
      } catch {}
      dispatchInput(editor, "", "deleteContentBackward");
      await wait(100);
    };
    const prepareComposerForRun = async (editor, deadlineAt = 0) => {
      await clearAttachments(editor);
      if (deadlineExpired(deadlineAt)) return null;
      editor = await liveEditor(editor, 3000, deadlineAt);
      await clearEditorText(editor);
      return await liveEditor(editor, 3000, deadlineAt);
    };
    const ensurePromptCommitted = async (editor, text, deadlineAt = 0) => {
      if (!text) return { ok: true, editor: await liveEditor(editor, 2000, deadlineAt) };
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        if (deadlineExpired(deadlineAt)) break;
        editor = await liveEditor(editor, attempt === 1 ? 3000 : 4000, deadlineAt);
        if (!editor) break;
        const alreadyCommitted = promptMatches(editorText(editor), text);
        const writeStarted = alreadyCommitted || await setEditorText(editor, text);
        const written = writeStarted && await waitFor(() => promptMatches(editorText(editor), text), 2200, 80, deadlineAt);
        if (written) return { ok: true, editor };
        if (!await waitUntilDeadline(140, deadlineAt)) break;
      }
      return {
        ok: false,
        editor,
        reason: deadlineExpired(deadlineAt) ? "Send deadline exceeded" : promptReceiveFailureReason(editor, text)
      };
    };
    const countPromptOutsideEditor = (editor, value) => {
      const needle = compact(value);
      if (!needle) return 0;
      let text = "";
      try {
        const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const parent = node.parentElement;
          if (!parent || editor?.contains?.(parent)) continue;
          if (!normalize(node.nodeValue)) continue;
          text += `\n${node.nodeValue}`;
        }
      } catch {}
      const haystack = compact(text);
      if (!haystack || !haystack.includes(needle)) return 0;
      return haystack.split(needle).length - 1;
    };
    const isNotionComposerElement = (element, requireVisible = true) => {
      if (!element) return false;
      if (requireVisible && !visible(element)) return false;
      const tag = String(element.tagName || "").toLowerCase();
      const editable = tag === "textarea"
        || tag === "input"
        || String(element.getAttribute?.("contenteditable") || "").toLowerCase() === "true"
        || String(element.getAttribute?.("role") || "").toLowerCase() === "textbox";
      return editable && !isDisabled(element);
    };
    const resolveNotionComposerElement = (element, { requireVisible = true } = {}) => {
      if (isNotionComposerElement(element, requireVisible)) return element;
      try {
        const scoped = element?.querySelector?.("div[contenteditable='true'][role='textbox'],div[contenteditable='true'],textarea,input[role='textbox']");
        if (isNotionComposerElement(scoped, requireVisible)) return scoped;
      } catch {}
      return findEditor();
    };
    const focusNotionComposer = async (deadlineAt = 0) => {
      const composer = await waitFor(findEditor, 4000, 120, deadlineAt);
      if (!composer) return null;
      const activated = await activateEditor(composer);
      await waitUntilDeadline(20, deadlineAt);
      return activated;
    };
    const findNotionComposerContainer = (composerEl) => {
      const composer = resolveNotionComposerElement(composerEl, { requireVisible: false }) || composerEl || null;
      const scopes = [];
      const pushScope = (scope) => {
        if (scope && !scopes.includes(scope)) scopes.push(scope);
      };
      try { pushScope(composer?.closest?.("form") || null); } catch {}
      try { pushScope(composer?.closest?.("[data-testid*='chat' i],[data-testid*='composer' i],[data-testid*='prompt' i],[data-testid*='unified-chat' i]") || null); } catch {}
      try {
        let node = composer?.parentElement || null;
        for (let depth = 0; node && depth < 8; depth += 1) {
          pushScope(node);
          node = node.parentElement || null;
        }
      } catch {}
      pushScope(editorScope(composer));
      pushScope(composer);
      const composerRect = rectOf(composer);
      const ranked = scopes.map((scope, index) => {
        const rect = rectOf(scope);
        if (!rect) return { scope, score: -Infinity };
        if (composerRect) {
          const containsComposer = rect.left <= composerRect.left + 4
            && rect.right >= composerRect.right - 4
            && rect.top <= composerRect.top + 4
            && rect.bottom >= composerRect.bottom - 4;
          if (!containsComposer) return { scope, score: -Infinity };
          if (rect.width + 8 < composerRect.width || rect.height + 8 < composerRect.height) {
            return { scope, score: -Infinity };
          }
        }
        const text = labelOf(scope).toLowerCase();
        let score = 0;
        if (String(scope?.tagName || "").toLowerCase() === "form") score += 220;
        if (text.includes("composer") || text.includes("prompt")) score += 220;
        if (text.includes("unified-chat")) score += 140;
        if (text.includes("do anything with ai")) score += 120;
        if (composer && scope?.contains?.(composer)) score += 100;
        if (queryAll(scope, "button,[role='button']").length > 0) score += 45;
        if (composerRect) {
          const extraHeight = rect.height - composerRect.height;
          score += extraHeight >= 24 ? 140 + Math.min(140, extraHeight) : 35;
        }
        if (rect.width >= 320) score += 60;
        if (rect.height >= 80 && rect.height <= 560) score += 170;
        else if (rect.height > 560) score -= Math.min(700, rect.height - 560);
        return { scope, score: score - index * 3 };
      }).filter((item) => Number.isFinite(item.score)).sort((a, b) => b.score - a.score);
      return ranked[0]?.scope || scopes.find(Boolean) || document.body || document;
    };
    const findNotionSendButtonNearComposer = (composerEl) => {
      const composer = resolveNotionComposerElement(composerEl, { requireVisible: false }) || composerEl || findEditor();
      const composerContainer = findNotionComposerContainer(composer);
      const composerRect = rectOf(composerContainer) || rectOf(composer);
      const scopes = [];
      const push = (scope) => {
        if (scope && !scopes.includes(scope)) scopes.push(scope);
      };
      try { push(composer?.closest?.("form") || null); } catch {}
      push(composerContainer);
      push(document);
      const selector = [
        "button[type='submit']",
        "button[aria-label*='submit ai message' i]",
        "button[title*='submit ai message' i]",
        "button[data-testid*='submit' i]",
        "button[aria-label*='submit' i]",
        "button[aria-label*='send' i]",
        "button[title*='send' i]",
        "button[data-testid*='send' i]",
        "button[aria-label*='发送' i]",
        "[role='button'][aria-label*='submit ai message' i]",
        "[role='button'][aria-label*='submit' i]",
        "[role='button'][aria-label*='send' i]",
        "[role='button'][data-testid*='send' i]"
      ].join(",");
      const seen = new Set();
      const candidates = [];
      const excluded = /\b(close|cancel|delete|remove|clear|dismiss|stop|attach|upload|file|image|photo)\b|关闭|取消|删除|移除|清空|停止|上传/i;
      for (const scope of scopes) {
        for (const button of collectOpenShadowElements(scope, selector)) {
          if (!button || seen.has(button) || !visible(button)) continue;
          seen.add(button);
          const label = labelOf(button);
          if (excluded.test(label)) continue;
          const rect = rectOf(button);
          if (composerRect && rect) {
            const nearY = rect.top >= composerRect.top - 96 && rect.bottom <= composerRect.bottom + 96;
            const nearX = rect.left >= composerRect.left - 160 && rect.right <= composerRect.right + 180;
            if (!nearY || !nearX) continue;
          }
          candidates.push(button);
        }
      }
      candidates.sort((a, b) => {
        const score = (text) => {
          const value = String(text || "").toLowerCase();
          let points = 0;
          if (value === "send" || value === "发送") points += 700;
          if (value.includes("submit ai message")) points += 650;
          if (value.includes("submit")) points += 260;
          if (value.includes("send") || value.includes("发送")) points += 220;
          return points;
        };
        const aScore = score(labelOf(a));
        const bScore = score(labelOf(b));
        if (aScore !== bScore) return bScore - aScore;
        return (rectOf(b)?.right || 0) - (rectOf(a)?.right || 0);
      });
      return candidates[0] || null;
    };
    const isNotionSendButtonDisabled = (button) => {
      if (!button) return true;
      if (isDisabled(button)) return true;
      const dataState = String(button.getAttribute?.("data-state") || "").toLowerCase();
      return dataState === "disabled";
    };
    const notifyNotionSendActivated = (payload = {}, method = "notion-submit") => {
      const sendId = String(payload?.sendId || "").trim();
      if (!sendId) return;
      try {
        window.dispatchEvent(new CustomEvent(NOTION_SEND_ACTIVATED_EVENT, {
          detail: JSON.stringify({
            sendId,
            appId: "NotionAI",
            method,
            activatedAt: Date.now(),
            deadlineAt: Math.max(0, Number(payload?.deadlineAt) || 0)
          })
        }));
      } catch {}
    };
    const sendNotionMessage = async (editor, deadlineAt = 0, payload = {}) => {
      const composer = resolveNotionComposerElement(editor, { requireVisible: true }) || await focusNotionComposer(deadlineAt);
      if (!composer) return { ok: false, method: "notion-bridge", reason: "Notion AI input element not found" };
      const button = findNotionSendButtonNearComposer(composer);
      if (button) {
        if (!isNotionSendButtonDisabled(button)) {
          if (deadlineExpired(deadlineAt)) return { ok: false, method: "notion-bridge", reason: "Send deadline exceeded" };
          notifyNotionSendActivated(payload, "notion-button");
          try {
            if (clickElement(button)) return { ok: true, method: "notion-bridge-button" };
          } catch {}
          try {
            button.click?.();
            return { ok: true, method: "notion-bridge-button" };
          } catch {}
        }
      }
      if (deadlineExpired(deadlineAt)) return { ok: false, method: "notion-bridge", reason: "Send deadline exceeded" };
      notifyNotionSendActivated(payload, "notion-enter");
      await pressEnter(composer);
      return { ok: true, method: "notion-bridge-enter" };
    };
    const clickElement = (el) => {
      const rect = el?.getBoundingClientRect?.();
      const base = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        button: 0,
        buttons: 1,
        clientX: rect ? rect.left + rect.width / 2 : 1,
        clientY: rect ? rect.top + rect.height / 2 : 1
      };
      try {
        el?.scrollIntoView?.({ block: "center", inline: "nearest" });
      } catch {}
      try {
        if (window.PointerEvent) {
          el.dispatchEvent(new PointerEvent("pointerover", { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true }));
          el.dispatchEvent(new PointerEvent("pointerenter", { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true }));
          el.dispatchEvent(new PointerEvent("pointermove", { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true }));
          el.dispatchEvent(new PointerEvent("pointerdown", { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true }));
          el.dispatchEvent(new PointerEvent("pointerup", { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 0 }));
        }
      } catch {}
      try {
        for (const type of ["mouseover", "mouseenter", "mousemove", "mousedown", "mouseup", "click"]) {
          el.dispatchEvent(new MouseEvent(type, { ...base, buttons: type === "mouseup" || type === "click" ? 0 : 1 }));
        }
      } catch {}
      try { el.click?.(); } catch {}
      return true;
    };
    const pressEnter = async (editor) => {
      editor?.focus?.();
      const init = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true };
      for (const type of ["keydown", "keypress", "keyup"]) {
        try { editor?.dispatchEvent(new KeyboardEvent(type, init)); } catch {}
        await wait(45);
      }
    };
    const imageExtension = (mime) => {
      const value = String(mime || "").toLowerCase();
      if (value === "image/jpeg") return "jpg";
      if (value === "image/png") return "png";
      if (value === "image/webp") return "webp";
      if (value === "image/gif") return "gif";
      if (value === "image/bmp") return "bmp";
      if (value === "image/svg+xml") return "svg";
      if (value === "image/avif") return "avif";
      return value.split("/").pop()?.replace(/[^a-z0-9]/gi, "") || "png";
    };
    const mimeFromDataUrl = (dataUrl) => String(dataUrl || "").match(/^data:([^;,]+)[;,]/i)?.[1]?.toLowerCase() || "";
    const dataUrlToFile = (entry = {}, index = 0) => {
      const dataUrl = String(entry.dataUrl || entry.dataURL || "").trim();
      if (!/^data:image\//i.test(dataUrl)) return null;
      const commaIndex = dataUrl.indexOf(",");
      if (commaIndex < 0) return null;
      const meta = dataUrl.slice(5, commaIndex);
      const payload = dataUrl.slice(commaIndex + 1);
      const type = String(entry.type || "").trim() || mimeFromDataUrl(dataUrl) || "image/png";
      const name = String(entry.name || "").trim() || `prompt-image-${index + 1}.${imageExtension(type)}`;
      try {
        let bytes;
        if (/(?:^|;)base64(?:;|$)/i.test(meta)) {
          const binary = atob(payload);
          bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        } else {
          bytes = new TextEncoder().encode(decodeURIComponent(payload));
        }
        return new File([bytes], name, { type, lastModified: Number(entry.lastModified) || Date.now() });
      } catch {
        return null;
      }
    };
    const promptFiles = (images) => (Array.isArray(images) ? images : [])
      .map((entry, index) => dataUrlToFile(entry, index))
      .filter((file) => file && String(file.type || "").startsWith("image/"));
    const createTransfer = (files = [], textValue = "") => {
      try {
        const transfer = new DataTransfer();
        files.forEach((file) => transfer.items.add(file));
        if (textValue) {
          try { transfer.setData("text/plain", String(textValue)); } catch {}
        }
        return transfer;
      } catch {
        return null;
      }
    };
    const dispatchTransfer = (target, type, transfer) => {
      if (!target || type !== "paste") return false;
      const init = { bubbles: true, cancelable: true, composed: true };
      let event = null;
      try {
        if (typeof ClipboardEvent === "function") {
          event = new ClipboardEvent("paste", { ...init, clipboardData: transfer });
        }
      } catch {}
      if (!event) {
        try { event = new Event(type, init); } catch { event = null; }
      }
      if (!event) return false;
      try { Object.defineProperty(event, "clipboardData", { value: transfer, configurable: true }); } catch {}
      try { Object.defineProperty(event, "dataTransfer", { value: transfer, configurable: true }); } catch {}
      try { target.dispatchEvent(event); return true; } catch { return false; }
    };
    const getElementText = (element) => normalize(element?.innerText || element?.textContent || "");
    const getElementSearchText = (element) => normalize([
      element?.getAttribute?.("aria-label"),
      element?.getAttribute?.("title"),
      element?.getAttribute?.("alt"),
      element?.getAttribute?.("data-testid"),
      element?.getAttribute?.("data-test-id"),
      element?.getAttribute?.("class"),
      element?.innerText,
      element?.textContent
    ].filter(Boolean).join(" "));
    const getNotionAttachmentScope = (editor) => findNotionComposerContainer(editor) || editorScope(editor) || document.body || document;
    const isLikelyNotionAttachmentPreviewElement = (element) => {
      if (!element) return false;
      const dataTestId = String(element.getAttribute?.("data-testid") || element.getAttribute?.("data-test-id") || "").toLowerCase();
      const className = String(element.getAttribute?.("class") || "").toLowerCase();
      return dataTestId.includes("attachment")
        || dataTestId.includes("file-preview")
        || dataTestId.includes("upload-preview")
        || className.includes("attachment")
        || className.includes("file-preview")
        || className.includes("upload-preview")
        || className.includes("image-preview");
    };
    const isLikelyNotionAttachmentImage = (element) => {
      if (!element || String(element.tagName || "").toLowerCase() !== "img") return false;
      const src = String(element.getAttribute?.("src") || "").trim();
      if (!src) return false;
      if (/^blob:|^data:image\//i.test(src)) return true;
      if (!/^(?:https?:)?\/\//i.test(src)) return false;
      const rect = rectOf(element);
      if (!rect) return false;
      const minSide = Math.min(rect.width, rect.height);
      const maxSide = Math.max(rect.width, rect.height);
      if (minSide < 32 || maxSide > 360 || rect.width * rect.height < 1200) return false;
      const label = getElementSearchText(element).toLowerCase();
      if (/\b(?:avatar|favicon|logo|icon)\b/.test(label) && maxSide <= 72) return false;
      return true;
    };
    const isNotionAttachmentActionElement = (element) => {
      if (!element) return false;
      const tag = String(element.tagName || "").toLowerCase();
      const role = String(element.getAttribute?.("role") || "").toLowerCase();
      const isActionElement = tag === "button" || role === "button";
      const haystack = getElementSearchText(element).toLowerCase();
      if (/(?:移除|删除|取消|关闭)/.test(haystack)) return true;
      if (haystack.includes("remove attachment") || haystack.includes("remove file") || haystack.includes("remove image")) return true;
      if (haystack.includes("delete attachment") || haystack.includes("delete file") || haystack.includes("delete image")) return true;
      if (haystack.includes("dismiss attachment") || haystack.includes("dismiss file") || haystack.includes("dismiss image")) return true;
      if (haystack.includes("cancel upload") || haystack.includes("remove upload") || haystack.includes("delete upload")) return true;
      if (!isActionElement) return false;
      return /\b(?:remove|delete|dismiss|cancel|close)\b/.test(haystack)
        && /\b(?:attachment|file|image|upload|preview)\b/.test(haystack);
    };
    const isLikelyNotionAttachmentCard = (element, scope) => {
      if (!element || element === scope || element === document || element === document.body || !visible(element)) return false;
      const images = queryAll(element, "img").filter(isLikelyNotionAttachmentImage);
      if (isLikelyNotionAttachmentPreviewElement(element)) return images.length <= 1;
      const rect = rectOf(element);
      if (!rect || rect.width > 520 || rect.height > 320) return false;
      if (images.length !== 1) return false;
      const actions = queryAll(element, "button,[role='button']").filter(isNotionAttachmentActionElement);
      if (actions.length > 0) return true;
      return Math.min(rect.width, rect.height) >= 36 && Math.max(rect.width, rect.height) <= 380;
    };
    const findNotionAttachmentCardElement = (element, scope) => {
      if (!element) return null;
      let node = element;
      let depth = 0;
      while (node && node.nodeType === 1 && depth < 8) {
        if (isLikelyNotionAttachmentCard(node, scope)) return node;
        if (node === scope || node === document.body) break;
        node = node.parentElement;
        depth += 1;
      }
      return isLikelyNotionAttachmentImage(element) ? element : null;
    };
    const isNotionAttachmentMarker = (element) => {
      if (!element || !visible(element)) return false;
      const tag = String(element.tagName || "").toLowerCase();
      if (tag === "img") return isLikelyNotionAttachmentImage(element);
      if (isNotionAttachmentActionElement(element)) return true;
      if (isLikelyNotionAttachmentPreviewElement(element)) return true;
      return false;
    };
    const attachmentSnapshot = (editor) => {
      const scope = getNotionAttachmentScope(editor);
      const selector = [
        "img",
        "img[src^='blob:']",
        "img[src^='data:image/']",
        "[data-testid*='attachment' i]",
        "[data-testid*='file-preview' i]",
        "[data-testid*='upload-preview' i]",
        "[data-test-id*='attachment' i]",
        "[data-test-id*='file-preview' i]",
        "[data-test-id*='upload-preview' i]",
        "[class*='attachment' i]",
        "[class*='file-preview' i]",
        "[class*='upload-preview' i]",
        "[class*='image-preview' i]",
        "button[aria-label*='remove attachment' i]",
        "button[aria-label*='remove file' i]",
        "button[aria-label*='remove image' i]",
        "button[aria-label*='delete attachment' i]",
        "button[aria-label*='delete file' i]",
        "button[aria-label*='delete image' i]",
        "button[aria-label*='dismiss' i]",
        "button[aria-label*='cancel upload' i]",
        "button[aria-label*='close' i]",
        "button[title*='remove attachment' i]",
        "button[title*='remove file' i]",
        "button[title*='remove image' i]",
        "button[title*='delete attachment' i]",
        "button[title*='delete file' i]",
        "button[title*='delete image' i]",
        "button[title*='dismiss' i]",
        "button[title*='cancel upload' i]",
        "button[title*='close' i]",
        "[role='button'][aria-label*='remove attachment' i]",
        "[role='button'][aria-label*='remove file' i]",
        "[role='button'][aria-label*='remove image' i]",
        "[role='button'][aria-label*='delete attachment' i]",
        "[role='button'][aria-label*='delete file' i]",
        "[role='button'][aria-label*='delete image' i]",
        "[role='button'][aria-label*='dismiss' i]",
        "[role='button'][aria-label*='cancel upload' i]",
        "[role='button'][aria-label*='close' i]",
        "button[aria-label*='移除' i]",
        "button[aria-label*='删除' i]",
        "button[aria-label*='取消' i]"
      ].join(",");
      const markers = collectOpenShadowElements(scope, selector).filter(isNotionAttachmentMarker);
      const groups = new Map();
      for (const marker of markers) {
        const card = findNotionAttachmentCardElement(marker, scope);
        const markerTag = String(marker.tagName || "").toLowerCase();
        const markerSrc = markerTag === "img" ? String(marker.getAttribute?.("src") || "").trim() : "";
        const key = card || (markerSrc ? `img:${markerSrc}` : marker);
        const existing = groups.get(key) || {
          root: card || marker,
          elements: [],
          hasImage: false,
          hasRemove: false,
          hasPreview: false
        };
        existing.elements.push(marker);
        if (isLikelyNotionAttachmentImage(marker)) existing.hasImage = true;
        if (isNotionAttachmentActionElement(marker)) existing.hasRemove = true;
        if (isLikelyNotionAttachmentPreviewElement(marker)) existing.hasPreview = true;
        if (card && card !== marker) {
          if (!existing.hasImage && queryAll(card, "img").some(isLikelyNotionAttachmentImage)) existing.hasImage = true;
          if (!existing.hasRemove && queryAll(card, "button,[role='button']").some(isNotionAttachmentActionElement)) existing.hasRemove = true;
          if (!existing.hasPreview && isLikelyNotionAttachmentPreviewElement(card)) existing.hasPreview = true;
        }
        groups.set(key, existing);
      }
      const unique = Array.from(groups.values());
      const imageCount = unique.filter((group) => group.hasImage).length;
      const removeCount = unique.filter((group) => group.hasRemove).length;
      const previewCount = unique.length;
      const attachmentCount = Math.max(imageCount, removeCount, previewCount);
      const fingerprint = unique.slice(0, 12).map((group) => {
        const root = group.root || group.elements[0] || null;
        const image = group.elements.find(isLikelyNotionAttachmentImage)
          || (root ? queryAll(root, "img").find(isLikelyNotionAttachmentImage) : null);
        const rect = rectOf(root);
        return [
          String(root?.tagName || "").toLowerCase(),
          String(root?.getAttribute?.("data-testid") || root?.getAttribute?.("data-test-id") || ""),
          String(root?.getAttribute?.("aria-label") || ""),
          String(image?.getAttribute?.("src") || "").slice(0, 80),
          getElementText(root).slice(0, 80),
          rect ? `${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)},${Math.round(rect.height)}` : ""
        ].join(":");
      }).join("|");
      return {
        attachmentCount,
        imageCount,
        removeCount,
        previewCount,
        hasAttachment: attachmentCount > 0,
        fingerprint
      };
    };
    const getNotionAttachmentFingerprint = (snapshot) => snapshot
      ? `${snapshot.attachmentCount || 0};${snapshot.imageCount || 0};${snapshot.removeCount || 0};${snapshot.previewCount || 0};${snapshot.fingerprint || ""}`
      : "";
    const hasNotionAttachmentSnapshotChange = (previousSnapshot, nextSnapshot) => {
      const previousCount = Number(previousSnapshot?.attachmentCount || 0);
      const nextCount = Number(nextSnapshot?.attachmentCount || 0);
      if (nextCount > previousCount) return true;
      if (Number(nextSnapshot?.imageCount || 0) > Number(previousSnapshot?.imageCount || 0)) return true;
      if (Number(nextSnapshot?.removeCount || 0) > Number(previousSnapshot?.removeCount || 0)) return true;
      if (Number(nextSnapshot?.previewCount || 0) > Number(previousSnapshot?.previewCount || 0)) return true;
      return nextCount > 0 && getNotionAttachmentFingerprint(nextSnapshot) !== getNotionAttachmentFingerprint(previousSnapshot);
    };
    const hasNotionUploadInProgress = (editor) => {
      const scope = getNotionAttachmentScope(editor);
      const selector = [
        "[aria-busy='true']",
        "[role='progressbar']",
        "progress",
        "[data-testid*='uploading' i]",
        "[data-testid*='upload' i]",
        "[data-test-id*='uploading' i]",
        "[data-test-id*='upload' i]",
        "[class*='uploading' i]",
        "[class*='spinner' i]",
        "[class*='loading' i]"
      ].join(",");
      return collectOpenShadowElements(scope, selector).some((element) => {
        if (!element || !visible(element)) return false;
        if (findNotionAttachmentCardElement(element, scope)) return true;
        if (isLikelyNotionAttachmentPreviewElement(element)) return true;
        const tag = String(element.tagName || "").toLowerCase();
        const role = String(element.getAttribute?.("role") || "").toLowerCase();
        const ariaBusy = String(element.getAttribute?.("aria-busy") || "").toLowerCase() === "true";
        const haystack = getElementSearchText(element).toLowerCase();
        const uploadContext = /\b(?:upload|uploading|attachment|file-preview|upload-preview|file|image|preview)\b/.test(haystack)
          || /上传|附件|图片|图像|文件|预览/.test(haystack);
        if (uploadContext) return true;
        if (!(ariaBusy || role === "progressbar" || tag === "progress")) return false;
        let node = element.parentElement || null;
        for (let depth = 0; node && depth < 4; depth += 1) {
          if (node === scope || node === document.body) break;
          if (findNotionAttachmentCardElement(node, scope) || isLikelyNotionAttachmentPreviewElement(node)) return true;
          const parentHaystack = getElementSearchText(node).toLowerCase();
          if (/\b(?:upload|uploading|attachment|file-preview|upload-preview|file|image|preview)\b/.test(parentHaystack) || /上传|附件|图片|图像|文件|预览/.test(parentHaystack)) return true;
          node = node.parentElement || null;
        }
        return false;
      });
    };
    const waitForStableNotionState = async ({ computeState, isSatisfied, timeoutMs = 45000, settleMs = 600, intervalMs = 160, deadlineAt = 0 }) => {
      const start = Date.now();
      let lastState = computeState();
      let lastKey = "";
      let stableSince = 0;
      while (Date.now() - start < timeoutMs && !deadlineExpired(deadlineAt)) {
        lastState = computeState();
        const key = String(lastState?.stateKey || "");
        if (isSatisfied(lastState)) {
          if (key !== lastKey) {
            stableSince = Date.now();
            lastKey = key;
          } else if (!stableSince) {
            stableSince = Date.now();
          }
          if (Date.now() - stableSince >= settleMs) return { ok: true, state: lastState };
        } else {
          stableSince = 0;
          lastKey = key;
        }
        if (!await waitUntilDeadline(intervalMs, deadlineAt)) break;
      }
      return { ok: false, state: lastState };
    };
    const waitForNotionAttachmentChange = async (editor, previousSnapshot, timeoutMs = 9000, deadlineAt = 0) => {
      const start = Date.now();
      let snapshot = attachmentSnapshot(editor);
      let busy = hasNotionUploadInProgress(editor);
      while (Date.now() - start < timeoutMs && !deadlineExpired(deadlineAt)) {
        snapshot = attachmentSnapshot(editor);
        busy = hasNotionUploadInProgress(editor);
        if (hasNotionAttachmentSnapshotChange(previousSnapshot, snapshot) || busy) {
          return { ok: true, snapshot, busy };
        }
        if (!await waitUntilDeadline(120, deadlineAt)) break;
      }
      return { ok: false, snapshot, busy };
    };
    const getNotionImagesReadyState = (editor, { requireImage = true, minAttachments = 0 } = {}) => {
      const composer = resolveNotionComposerElement(editor, { requireVisible: false }) || findEditor();
      const snapshot = attachmentSnapshot(composer);
      const requiredAttachments = Math.max(0, Number(minAttachments) || 0);
      const attachmentCount = Number(snapshot?.attachmentCount || 0);
      const uploadBusy = requireImage && hasNotionUploadInProgress(composer);
      const hasEnoughAttachments = !requireImage || (attachmentCount > 0 && attachmentCount >= requiredAttachments);
      return {
        composer,
        snapshot,
        attachmentCount,
        requiredAttachments,
        uploadBusy,
        ok: Boolean(composer && hasEnoughAttachments && !uploadBusy),
        stateKey: `${getNotionAttachmentFingerprint(snapshot)};busy=${uploadBusy ? 1 : 0};min=${requiredAttachments}`
      };
    };
    const waitForNotionImagesReady = async (editor, { requireImage = true, minAttachments = 0, timeoutMs = 45000, intervalMs = 160, settleMs = 600, deadlineAt = 0 } = {}) => {
      let composerRef = resolveNotionComposerElement(editor, { requireVisible: true }) || await focusNotionComposer(deadlineAt);
      if (!composerRef) return { ok: false, reason: "no-composer", attachmentCount: 0, uploadBusy: false };
      const observed = await waitForStableNotionState({
        computeState: () => {
          const resolved = resolveNotionComposerElement(composerRef, { requireVisible: false }) || composerRef;
          composerRef = resolved;
          return getNotionImagesReadyState(composerRef, { requireImage, minAttachments });
        },
        isSatisfied: (state) => Boolean(state?.ok),
        timeoutMs,
        intervalMs,
        settleMs,
        deadlineAt
      });
      const state = observed.state || getNotionImagesReadyState(composerRef, { requireImage, minAttachments });
      return {
        ok: Boolean(observed.ok),
        composer: state.composer || composerRef,
        snapshot: state.snapshot || null,
        attachmentCount: Number(state.attachmentCount || 0),
        requiredAttachments: Number(state.requiredAttachments || 0),
        uploadBusy: Boolean(state.uploadBusy),
        reason: observed.ok ? "ok" : (deadlineExpired(deadlineAt) ? "deadline" : "timeout"),
        message: observed.ok ? "" : `Notion images not ready: attachment=${state.attachmentCount || 0}, busy=${state.uploadBusy ? 1 : 0}`
      };
    };
    const getNotionReadyToSendState = (editor, { requireImage = false, minAttachments = 0 } = {}) => {
      const composer = resolveNotionComposerElement(editor, { requireVisible: false }) || findEditor();
      const snapshot = attachmentSnapshot(composer);
      const textLength = editorText(composer).trim().length;
      const sendButton = findNotionSendButtonNearComposer(composer);
      const sendReady = sendButton ? !isNotionSendButtonDisabled(sendButton) : textLength > 0;
      const requiredAttachments = Math.max(0, Number(minAttachments) || 0);
      const attachmentCount = Number(snapshot?.attachmentCount || 0);
      const uploadBusy = requireImage && hasNotionUploadInProgress(composer);
      const hasEnoughAttachments = !requireImage || (attachmentCount > 0 && attachmentCount >= requiredAttachments);
      return {
        composer,
        snapshot,
        sendButton,
        sendReady,
        attachmentCount,
        requiredAttachments,
        uploadBusy,
        textLength,
        ok: Boolean(composer && sendReady && (!requireImage || (hasEnoughAttachments && !uploadBusy))),
        stateKey: `${getNotionAttachmentFingerprint(snapshot)};send=${sendReady ? 1 : 0};busy=${uploadBusy ? 1 : 0};text=${textLength};min=${requiredAttachments}`
      };
    };
    const waitForNotionReadyToSend = async (editor, { requireImage = false, minAttachments = 0, timeoutMs = 45000, intervalMs = 160, settleMs = 600, deadlineAt = 0 } = {}) => {
      let composerRef = resolveNotionComposerElement(editor, { requireVisible: true }) || await focusNotionComposer(deadlineAt);
      if (!composerRef) return { ok: false, reason: "no-composer", sendReady: false };
      const observed = await waitForStableNotionState({
        computeState: () => {
          const resolved = resolveNotionComposerElement(composerRef, { requireVisible: false }) || composerRef;
          composerRef = resolved;
          return getNotionReadyToSendState(composerRef, { requireImage, minAttachments });
        },
        isSatisfied: (state) => Boolean(state?.ok),
        timeoutMs,
        intervalMs,
        settleMs,
        deadlineAt
      });
      const state = observed.state || getNotionReadyToSendState(composerRef, { requireImage, minAttachments });
      return {
        ok: Boolean(observed.ok),
        composer: state.composer || composerRef,
        button: state.sendButton || null,
        snapshot: state.snapshot || null,
        attachmentCount: Number(state.attachmentCount || 0),
        requiredAttachments: Number(state.requiredAttachments || 0),
        uploadBusy: Boolean(state.uploadBusy),
        sendReady: Boolean(state.sendReady),
        reason: observed.ok ? "ok" : (deadlineExpired(deadlineAt) ? "deadline" : "timeout"),
        message: observed.ok ? "" : `Notion composer not ready: attachment=${state.attachmentCount || 0}, text=${state.textLength || 0}, busy=${state.uploadBusy ? 1 : 0}, sendReady=${state.sendReady ? 1 : 0}`
      };
    };
    const attachImagesOnce = async (editor, files, textValue = "") => {
      editor = await activateEditor(editor);
      if (!editor) return false;
      const transfer = createTransfer(files, textValue);
      if (!transfer) return false;
      const fired = dispatchTransfer(editor, "paste", transfer);
      await wait(80);
      return fired;
    };
    const commitPastedTextEarly = async (editor, textValue, deadlineAt = 0) => {
      const expected = normalize(textValue);
      if (!expected) return { editor, committed: true, usedFallback: false };
      if (deadlineExpired(deadlineAt)) return { editor, committed: false, usedFallback: false };
      editor = await liveEditor(editor, 1000, deadlineAt);
      if (!editor) return { editor: null, committed: false, usedFallback: false };
      if (promptMatches(editorText(editor), expected)) return { editor, committed: true, usedFallback: false };
      const committed = await setEditorText(editor, expected);
      editor = await liveEditor(editor, 1000, deadlineAt);
      return {
        editor,
        committed: Boolean(committed && promptMatches(editorText(editor), expected)),
        usedFallback: true
      };
    };
    const clearAttachments = async (editor) => {
      const scope = getNotionAttachmentScope(editor);
      try {
        const selector = [
          "button[aria-label*='remove attachment' i]",
          "button[aria-label*='remove file' i]",
          "button[aria-label*='remove image' i]",
          "button[aria-label*='delete attachment' i]",
          "button[aria-label*='delete file' i]",
          "button[aria-label*='delete image' i]",
          "button[aria-label*='dismiss' i]",
          "button[aria-label*='cancel upload' i]",
          "button[title*='remove attachment' i]",
          "button[title*='remove file' i]",
          "button[title*='remove image' i]",
          "button[title*='delete attachment' i]",
          "button[title*='delete file' i]",
          "button[title*='delete image' i]",
          "button[title*='移除' i]",
          "button[title*='删除' i]",
          "button[aria-label*='移除' i]",
          "button[aria-label*='删除' i]"
        ].join(",");
        const seen = new Set();
        const buttons = collectOpenShadowElements(scope, selector)
          .map((element) => {
            try { return element.closest?.("button,[role='button']") || element; } catch { return element; }
          })
          .filter((element) => {
            if (!element || seen.has(element) || !visible(element) || isDisabled(element)) return false;
            seen.add(element);
            return isNotionAttachmentActionElement(element) || Boolean(findNotionAttachmentCardElement(element, scope));
          })
          .slice(0, 20);
        buttons.forEach(clickElement);
      } catch {}
      await wait(350);
    };
    const attachImagesWithRetries = async (editor, files, retryCount = 3, deadlineAt = 0, textValue = "") => {
      const attempts = Math.max(0, Number(retryCount) || 0) + 1;
      let reason = "";
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        if (deadlineExpired(deadlineAt)) return { ok: false, reason: "Send deadline exceeded" };
        if (attempt > 1) {
          editor = await prepareComposerForRun(await liveEditor(editor, 3000, deadlineAt), deadlineAt);
          if (!editor) return { ok: false, reason: "Notion AI input element not found before retry" };
        }
        const baseline = attachmentSnapshot(editor);
        const pasteAccepted = await attachImagesOnce(editor, files, textValue);
        if (!pasteAccepted) reason = "Notion AI image and text insertion did not accept paste";
        const earlyText = await commitPastedTextEarly(editor, textValue, deadlineAt);
        editor = earlyText.editor || editor;
        if (textValue && !earlyText.committed) reason = "Notion AI prompt text was not committed immediately after paste";
        const accepted = await waitForNotionAttachmentChange(editor, baseline, Math.min(9000, remainingDeadlineMs(deadlineAt, 9000)), deadlineAt);
        if (!accepted.ok && !accepted.busy) {
          if (pasteAccepted) {
            reason = "Notion AI image and text paste was dispatched but no attachment was detected";
            continue;
          }
          reason = reason || "Notion AI image and text insertion did not accept paste";
          continue;
        }
        const expectedCount = Math.max(Number(baseline.attachmentCount || 0) + files.length, files.length);
        const ready = await waitForNotionImagesReady(editor, {
          requireImage: true,
          minAttachments: expectedCount,
          timeoutMs: Math.min(45000, remainingDeadlineMs(deadlineAt, 45000)),
          intervalMs: 160,
          settleMs: 600,
          deadlineAt
        });
        if (ready.ok) return { ok: true, attempts: attempt, editor };
        reason = ready.message || ready.reason || "Notion AI image upload did not become ready";
      }
      return { ok: false, reason: reason || "Notion AI image and text upload did not become ready" };
    };
    const submitted = (editor, value, beforeOutsideCount) => {
      const currentText = editorText(editor);
      if (promptMatches(currentText, value)) return countPromptOutsideEditor(editor, value) > beforeOutsideCount;
      if (promptWhitespaceCollapsedMatches(currentText, value)) return countPromptOutsideEditor(editor, value) > beforeOutsideCount;
      return true;
    };
    const notionSendRequestCache = new Map();
    const notionSendRequestKey = (payload = {}, scope = "prompt") => {
      const sendId = String(payload?.sendId || payload?.id || "").trim();
      return sendId ? `${scope}:${sendId}` : "";
    };
    const forgetNotionSendRequest = (key, record, delayMs) => {
      setTimeout(() => {
        if (notionSendRequestCache.get(key) === record) notionSendRequestCache.delete(key);
      }, delayMs);
    };
    const runNotionSendOnce = async (payload, scope, runner) => {
      const key = notionSendRequestKey(payload, scope);
      if (!key) return runner();
      const existing = notionSendRequestCache.get(key);
      if (existing) return existing.promise;
      const record = { promise: null };
      record.promise = Promise.resolve().then(runner).then((result) => {
        record.promise = Promise.resolve(result);
        forgetNotionSendRequest(key, record, 120000);
        return result;
      }, (error) => {
        forgetNotionSendRequest(key, record, 30000);
        throw error;
      });
      notionSendRequestCache.set(key, record);
      return record.promise;
    };
    const sendNotionText = async (payload = {}) => {
      const deadlineAt = deadlineFromPayload(payload, 10000);
      const text = String(payload?.text || "").trim();
      if (!text) return { ok: false, sent: false, method: "notion-bridge", reason: "Prompt is empty" };
      if (deadlineExpired(deadlineAt)) return { ok: false, sent: false, method: "notion-bridge", reason: "Send deadline exceeded" };
      const editor = await waitFor(findEditor, 3000, 100, deadlineAt);
      if (!editor) return { ok: false, sent: false, method: "notion-bridge", reason: "Notion AI input element not found" };
      const beforeOutsideCount = countPromptOutsideEditor(editor, text);
      const writeStarted = await setEditorText(editor, text);
      const written = writeStarted && await waitFor(() => promptMatches(editorText(editor), text), 2200, 80, deadlineAt);
      if (!written) {
        return { ok: false, sent: false, method: "notion-bridge", reason: deadlineExpired(deadlineAt) ? "Send deadline exceeded" : promptReceiveFailureReason(editor, text) };
      }
      const readyToSend = await waitForNotionReadyToSend(editor, {
        requireImage: false,
        timeoutMs: Math.min(10000, remainingDeadlineMs(deadlineAt, 10000)),
        intervalMs: 160,
        settleMs: 300,
        deadlineAt
      });
      if (!readyToSend.ok) {
        return { ok: false, sent: false, method: "notion-bridge", reason: readyToSend.message || "Notion AI submit button stayed disabled" };
      }
      const sendEditor = readyToSend.composer || editor;
      const sent = await sendNotionMessage(editor, deadlineAt, payload);
      if (!sent.ok) {
        return { ok: false, sent: false, method: "notion-bridge", reason: sent.reason || "Notion AI submit failed" };
      }
      if (await waitFor(() => submitted(sendEditor, text, beforeOutsideCount), 2600, 100, deadlineAt)) {
        return { ok: true, sent: true, method: sent.method || "notion-bridge-button", verified: true };
      }
      return {
        ok: false,
        sent: false,
        method: "notion-bridge",
        reason: promptSubmitFailureReason(sendEditor, text)
      };
    };
    const sendNotionPrompt = async (payload = {}) => runNotionSendOnce(payload, "prompt", async () => {
      const deadlineAt = deadlineFromPayload(payload, 60000);
      const text = String(payload.text || "").trim();
      const files = promptFiles(payload.images);
      if (!text && !files.length) return { ok: false, sent: false, method: "notion-prompt-bridge", reason: "Prompt is empty" };
      if (Array.isArray(payload.images) && payload.images.length && !files.length) {
        return { ok: false, sent: false, method: "notion-prompt-bridge", reason: "Image payload could not be restored" };
      }
      if (deadlineExpired(deadlineAt)) return { ok: false, sent: false, method: "notion-prompt-bridge", reason: "Send deadline exceeded" };
      let editor = await waitFor(findEditor, 3000, 100, deadlineAt);
      if (!editor) return { ok: false, sent: false, method: "notion-prompt-bridge", reason: "Notion AI input element not found" };
      editor = await prepareComposerForRun(editor, deadlineAt);
      if (!editor) return { ok: false, sent: false, method: "notion-prompt-bridge", reason: "Notion AI input element not found" };
      if (files.length) {
        const attached = await attachImagesWithRetries(editor, files, payload.imageRetryCount ?? 3, deadlineAt, text);
        if (!attached.ok) return { ok: false, sent: false, method: "notion-prompt-bridge", reason: attached.reason || "Image insertion failed" };
        editor = await liveEditor(attached.editor || editor, 4000, deadlineAt);
      }
      if (text) {
        const committedAfterImages = await ensurePromptCommitted(editor, text, deadlineAt);
        if (!committedAfterImages.ok) {
          return { ok: false, sent: false, method: "notion-prompt-bridge", reason: committedAfterImages.reason || promptReceiveFailureReason(committedAfterImages.editor || editor, text) };
        }
        editor = await liveEditor(committedAfterImages.editor, 4000, deadlineAt);
        const committedBeforeSend = await ensurePromptCommitted(editor, text, deadlineAt);
        if (!committedBeforeSend.ok) {
          return { ok: false, sent: false, method: "notion-prompt-bridge", reason: committedBeforeSend.reason || promptReceiveFailureReason(committedBeforeSend.editor || editor, text) };
        }
        editor = await liveEditor(committedBeforeSend.editor, 4000, deadlineAt);
      }
      if (text && !promptMatches(editorText(editor), text)) {
        const committedBeforeClick = await ensurePromptCommitted(editor, text, deadlineAt);
        if (!committedBeforeClick.ok || !promptMatches(editorText(committedBeforeClick.editor || editor), text)) {
          return { ok: false, sent: false, method: "notion-prompt-bridge", reason: committedBeforeClick.reason || promptReceiveFailureReason(committedBeforeClick.editor || editor, text) };
        }
        editor = committedBeforeClick.editor || editor;
      }
      if (deadlineExpired(deadlineAt)) return { ok: false, sent: false, method: "notion-prompt-bridge", reason: "Send deadline exceeded" };
      const readyToSend = await waitForNotionReadyToSend(editor, {
        requireImage: files.length > 0,
        minAttachments: files.length,
        timeoutMs: Math.min(45000, remainingDeadlineMs(deadlineAt, 45000)),
        intervalMs: 160,
        settleMs: 600,
        deadlineAt
      });
      if (!readyToSend.ok) {
        return { ok: false, sent: false, method: "notion-prompt-bridge", reason: readyToSend.message || "Notion AI composer not ready to send" };
      }
      editor = readyToSend.composer || editor;
      const beforeOutsideCount = text ? countPromptOutsideEditor(editor, text) : 0;
      const sent = await sendNotionMessage(editor, deadlineAt, payload);
      if (!sent.ok) {
        return { ok: false, sent: false, method: "notion-prompt-bridge", reason: sent.reason || "Notion AI submit failed" };
      }
      const method = sent.method === "notion-bridge-enter" ? "notion-prompt-bridge-enter" : "notion-prompt-bridge-button";
      if (!text) return { ok: true, sent: true, method, verified: false };
      if (await waitFor(() => submitted(editor, text, beforeOutsideCount), 2600, 100, deadlineAt)) {
        return { ok: true, sent: true, method, verified: true };
      }
      return {
        ok: false,
        sent: false,
        method: "notion-prompt-bridge",
        reason: promptSubmitFailureReason(editor, text)
      };
    });
    const notionSendListenerOptions = { capture: true, signal: notionSendBridgeAbort.signal };
    window.addEventListener(NOTION_SEND_TEXT_EVENT, async (event) => {
      const id = event.detail?.id || "";
      let data;
      try {
        data = await runNotionSendOnce(event.detail || {}, "text", () => sendNotionText(event.detail || {}));
      } catch (error) {
        data = {
          ok: false,
          sent: false,
          method: "notion-bridge",
          reason: error?.message || String(error || "Notion AI send failed")
        };
      }
      window.postMessage({ source: NOTION_SEND_TEXT_SOURCE, type: "response", id, data }, "*");
    }, notionSendListenerOptions);
    window.addEventListener(NOTION_SEND_PROMPT_EVENT, async (event) => {
      const id = event.detail?.id || "";
      let data;
      try {
        data = await sendNotionPrompt(event.detail || {});
      } catch (error) {
        data = {
          ok: false,
          sent: false,
          method: "notion-prompt-bridge",
          reason: error?.message || String(error || "Notion AI prompt send failed")
        };
      }
      window.postMessage({ source: NOTION_SEND_PROMPT_SOURCE, type: "response", id, data }, "*");
    }, notionSendListenerOptions);
    window.addEventListener("chatclub:notion-submit", async (event) => {
      const id = event.detail?.id || "";
      const editor = findEditor();
      let ok = false;
      try {
        editor?.focus?.();
        for (const type of ["keydown", "keypress", "keyup"]) {
          editor?.dispatchEvent(new KeyboardEvent(type, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true }));
          await wait(40);
        }
        ok = true;
      } catch {}
      window.postMessage({ source: "chatclub-notion-submit", type: "response", id, ok }, "*");
    }, notionSendListenerOptions);
  }
})();
