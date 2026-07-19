import { CONTENT_PROTOCOL } from "../shared/protocol.js";
import { CONTENT_RUNTIME_PRELOAD_BUNDLE_IDENTITY } from "../shared/content-runtime-version.generated.js";
import { createContentRuntimeBundleIdentity } from "../shared/content-runtime-identity.js";
import { runtimeRegistry } from "./shared/runtime-registry.js";
import { installGrokStorageAccessBridge } from "./preload/grok-storage-access.js";
import { installNativeCopyBridge } from "./preload/native-copy.js";
import { installDeepSeekDeleteBridge } from "./preload/deepseek-delete.js";
import { installNotionSendBridge } from "./preload/notion-send.js";

function installPreload() {
  const PROTOCOL = CONTENT_PROTOCOL;
  const runtimes = runtimeRegistry(window);
  const runtimeIdentity = createContentRuntimeBundleIdentity(CONTENT_RUNTIME_PRELOAD_BUNDLE_IDENTITY);
  runtimes.registerBundle(runtimeIdentity);
  const PRELOAD_IMPLEMENTATION_VERSION = runtimeIdentity.bundle.implementationVersion;
  const COPY_SOURCE = PROTOCOL.NATIVE_COPY_SOURCE;
  const GEMINI_MODEL_PICKER_BRIDGE_VERSION = PRELOAD_IMPLEMENTATION_VERSION;
  const GEMINI_MODEL_PICKER_SOURCE = PROTOCOL.GEMINI_MODEL_PICKER_SOURCE;
  const GEMINI_MODEL_PICKER_RUN_TOKEN_ATTRIBUTE = "data-chatclub-gemini-model-picker-run";
  const PREFERRED_MODEL_FOCUS_SHIELD_ATTRIBUTE = "data-chatclub-preferred-model-focus-shield";
  const PREFERRED_MODEL_FOCUS_SHIELD_VERSION = PRELOAD_IMPLEMENTATION_VERSION;
  const NAVIGATION_FOCUS_GUARD_RUNTIME = PROTOCOL.NAVIGATION_FOCUS_GUARD_RUNTIME;
  const NAVIGATION_FOCUS_GUARD_BRIDGE_VERSION = PROTOCOL.NAVIGATION_FOCUS_GUARD_RUNTIME_VERSION;
  const NAVIGATION_FOCUS_GUARD_STORAGE_KEY = "chatclub_preferred_model_focus_guard_until";
  const NAVIGATION_FOCUS_GUARD_LEASE_MS = 180000;
  const MAIN_WORLD_LOCATION_BRIDGE_VERSION = PRELOAD_IMPLEMENTATION_VERSION;
  const MAIN_WORLD_LOCATION_SOURCE = PROTOCOL.MAIN_WORLD_LOCATION_SOURCE;
  const DEEPSEEK_DELETE_SOURCE = PROTOCOL.DEEPSEEK_DELETE_SOURCE;

  function installChatClubWebviewShim() {
    let params;
    try {
      params = new URLSearchParams(window.name || "");
    } catch {
      return;
    }
    if (!params.has("chatclub_webview")) return;
    if (window.__CHATCLUB_WEBVIEW_SHIM__ === PRELOAD_IMPLEMENTATION_VERSION) return;
    window.__CHATCLUB_WEBVIEW_SHIM__ = PRELOAD_IMPLEMENTATION_VERSION;

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
    const prepare = (message = {}) => {
      const now = Date.now();
      const guardToken = String(message.guardToken || "");
      if (!guardToken) return { ok: false, reason: "focus guard token is missing" };
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
      return {
        ok: stored,
        guardToken,
        expiresAt,
        documentToken: window.__CHATCLUB_PREFERRED_MODEL_FOCUS_SHIELD__?.documentToken || ""
      };
    };
    runtimes.register(NAVIGATION_FOCUS_GUARD_RUNTIME, {
      version: NAVIGATION_FOCUS_GUARD_BRIDGE_VERSION,
      api: Object.freeze({ prepare }),
      dispose() {}
    });
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

    if (capture?.installed && capture.version !== PRELOAD_IMPLEMENTATION_VERSION) {
      try {
        if (EventTarget.prototype.addEventListener === capture.wrappedAddEventListener && capture.originalAddEventListener) {
          EventTarget.prototype.addEventListener = capture.originalAddEventListener;
        }
      } catch {}
      capture = { records };
    }

    if (!capture?.installed) {
      const originalAddEventListener = EventTarget.prototype.addEventListener;
      const wrappedAddEventListener = function (type, listener, _options) {
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
        capture = {
          installed: true,
          version: PRELOAD_IMPLEMENTATION_VERSION,
          records,
          originalAddEventListener,
          wrappedAddEventListener
        };
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

  const host = String(location.hostname || "").toLowerCase();
  const framed = (() => {
    try { return window.parent !== window; } catch { return true; }
  })();

  runtimes.install("preload-root", PRELOAD_IMPLEMENTATION_VERSION, () => ({
    api: Object.freeze({ version: PRELOAD_IMPLEMENTATION_VERSION }),
    activate() {
      installChatClubWebviewShim();
      installPreferredModelFocusShield();
      installPreferredModelNavigationFocusGuardBridge();
      installMainWorldLocationBridge();
      installNativeCopyBridge(runtimes, COPY_SOURCE);

      if (host === "gemini.google.com" || host.endsWith(".gemini.google.com")) {
        installGeminiModelPickerBridge();
      }

      if (host === "chat.deepseek.com" || host === "deepseek.com" || host.endsWith(".deepseek.com")) {
        installDeepSeekDeleteBridge(runtimes, DEEPSEEK_DELETE_SOURCE);
      }

      if (framed && (host === "grok.com" || host.endsWith(".grok.com") || host === "grok.x.ai" || host.endsWith(".grok.x.ai"))) {
        installGrokStorageAccessBridge(runtimes);
      }

      if (framed && (host === "claude.ai" || host.endsWith(".claude.ai"))) {
        try {
          if (location.pathname === "/") location.replace(`/new${location.search}${location.hash}`);
          Object.defineProperty(document, "referrer", { get: () => "" });
        } catch {}
      }

      if (framed && (host === "app.notion.com" || host.endsWith(".notion.so"))) {
        installNotionSendBridge(runtimes, PROTOCOL);
      }
    },
    dispose() {
      for (const key of [
        "__CHATCLUB_PREFERRED_MODEL_FOCUS_SHIELD__",
        "__CHATCLUB_MAIN_WORLD_LOCATION_BRIDGE__",
        "__CHATCLUB_GEMINI_MODEL_PICKER_BRIDGE__"
      ]) {
        try { window[key]?.dispose?.(); } catch {}
      }
    }
  }));
}

installPreload();
