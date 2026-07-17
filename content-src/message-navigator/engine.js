import {
  MESSAGE_NAVIGATOR_EFFECT_MODES,
  MESSAGE_NAVIGATOR_ROOT_ID,
  MESSAGE_NAVIGATOR_STYLE_ID
} from "./constants.js";
import { visible } from "./dom-kernel.js";
import { dedupeItems } from "./collection-kernel.js";
import { fallbackEffectTarget, resolveEffectTarget } from "./effect-target.js";
import {
  rolePrefix,
  scrollParent,
  scrollToTop,
  scrollerRect,
  scrollerTop
} from "./scroll.js";
import { messageNavigatorCss } from "./styles.js";

const EFFECT_MODES = new Set(MESSAGE_NAVIGATOR_EFFECT_MODES);
const ROOT_ID = MESSAGE_NAVIGATOR_ROOT_ID;
const STYLE_ID = MESSAGE_NAVIGATOR_STYLE_ID;

export class MessageNavigator {
  constructor({ version, adapters } = {}) {
    if (!String(version || "").trim()) throw new TypeError("Message Navigator engine requires version.");
    if (!adapters || typeof adapters !== "object" || typeof adapters.generic?.collect !== "function") {
      throw new TypeError("Message Navigator engine requires a generic adapter.");
    }
    this.version = String(version);
    this.adapters = adapters;
    this.enabled = false;
    this.config = null;
    this.options = {};
    this.messages = [];
    this.idToMessage = new Map();
    this.root = null;
    this.indicator = null;
    this.menu = null;
    this.observer = null;
    this.buildTimer = 0;
    this.scrollTimer = 0;
    this.effectTimer = 0;
    this.menuCloseTimer = 0;
    this.menuFocusTimer = 0;
    this.menuPinnedOpen = false;
    this.jumpToken = 0;
    this.activeId = "";
    this.effectTarget = null;
    this.boundScroll = () => this.onScroll();
    this.boundResize = () => this.scheduleBuild(160);
    this.boundOpenMenu = () => this.openMenu();
    this.boundScheduleCloseMenu = () => this.scheduleCloseMenu();
    this.boundDocumentPointerDown = (event) => this.onDocumentPointerDown(event);
    this.boundDocumentKeydown = (event) => {
      if (event.key === "Escape" && !event.isComposing && event.keyCode !== 229) this.closeMenu();
    };
    this.boundRootFocusIn = () => this.openMenu();
    this.boundRootFocusOut = () => {
      clearTimeout(this.menuFocusTimer);
      this.menuFocusTimer = setTimeout(() => {
        if (!this.enabled) return;
        if (this.root?.contains?.(document.activeElement)) return;
        this.scheduleCloseMenu();
      }, 0);
    };
  }

  setEnabled(data = {}) {
    if (data.enabled === false) {
      this.destroy();
      return this.state();
    }
    return this.enable(data.config || {}, data.options || {}, { openMenu: data.openMenu === true });
  }

  enable(config = {}, options = {}, ui = {}) {
    this.destroy();
    this.enabled = true;
    this.config = {
      ...config,
      adapter: String(config.adapter || "generic").trim() || "generic",
      messageSelector: String(config.messageSelector || "").trim(),
      textCleanupSelectors: Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : [],
      summaryMaxChars: Math.max(20, Math.min(180, Number(config.summaryMaxChars) || 60))
    };
    this.options = {
      effectMode: EFFECT_MODES.has(options.effectMode) ? options.effectMode : "border",
      primaryColor: /^#[0-9a-f]{6}$/i.test(String(options.primaryColor || "")) ? options.primaryColor : "#1f7a5f"
    };
    if (!this.config.messageSelector) throw new Error("Message navigator selector is empty");
    this.injectStyle();
    this.createRoot();
    this.observe();
    this.build();
    this.scheduleBuild(600);
    if (ui.openMenu) this.openMenu({ pinned: true });
    return this.state();
  }

  injectStyle() {
    document.getElementById(STYLE_ID)?.remove();
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = messageNavigatorCss(ROOT_ID, this.options.primaryColor);
    (document.head || document.documentElement).append(style);
  }

  createRoot() {
    document.getElementById(ROOT_ID)?.remove();
    this.root = document.createElement("aside");
    this.root.id = ROOT_ID;
    this.root.setAttribute("aria-label", "ChatClub message navigator");
    this.indicator = document.createElement("div");
    this.indicator.className = "chatclub-message-nav-indicator";
    this.menu = document.createElement("div");
    this.menu.className = "chatclub-message-nav-menu";
    this.menu.setAttribute("role", "menu");
    this.root.append(this.menu, this.indicator);
    document.documentElement.append(this.root);
    this.bindMenuHover();
  }

  bindMenuHover() {
    this.indicator?.addEventListener?.("pointerenter", this.boundOpenMenu);
    this.indicator?.addEventListener?.("pointerleave", this.boundScheduleCloseMenu);
    this.menu?.addEventListener?.("pointerenter", this.boundOpenMenu);
    this.menu?.addEventListener?.("pointerleave", this.boundScheduleCloseMenu);
    this.root?.addEventListener?.("focusin", this.boundRootFocusIn);
    this.root?.addEventListener?.("focusout", this.boundRootFocusOut);
  }

  openMenu(options = {}) {
    clearTimeout(this.menuCloseTimer);
    if (options.pinned) this.menuPinnedOpen = true;
    this.root?.classList?.add("chatclub-message-nav-open");
  }

  closeMenu() {
    clearTimeout(this.menuCloseTimer);
    this.menuPinnedOpen = false;
    this.root?.classList?.remove("chatclub-message-nav-open");
    return this.state();
  }

  scheduleCloseMenu(delay = 180) {
    if (this.menuPinnedOpen) return;
    clearTimeout(this.menuCloseTimer);
    this.menuCloseTimer = setTimeout(() => {
      if (this.root?.contains?.(document.activeElement)) return;
      this.closeMenu();
    }, delay);
  }

  eventInsideRoot(event) {
    if (!this.root) return false;
    try {
      const path = event.composedPath?.() || [];
      if (path.includes(this.root)) return true;
    } catch {}
    return Boolean(event.target && this.root.contains?.(event.target));
  }

  onDocumentPointerDown(event) {
    if (!this.enabled || !this.root?.classList?.contains("chatclub-message-nav-open")) return;
    if (this.eventInsideRoot(event)) return;
    this.closeMenu();
  }

  observe() {
    this.observer = new MutationObserver(() => this.scheduleBuild(360));
    try { this.observer.observe(document.body || document.documentElement, { childList: true, subtree: true }); } catch {}
    window.addEventListener("scroll", this.boundScroll, true);
    window.addEventListener("resize", this.boundResize, true);
    document.addEventListener("pointerdown", this.boundDocumentPointerDown, true);
    document.addEventListener("keydown", this.boundDocumentKeydown, true);
  }

  scheduleBuild(delay = 250) {
    if (!this.enabled) return;
    clearTimeout(this.buildTimer);
    this.buildTimer = setTimeout(() => this.build(), delay);
  }

  collect() {
    const adapter = this.adapters[this.config.adapter] || this.adapters.generic;
    const items = adapter.collect?.(this.config) || this.adapters.generic.collect(this.config);
    return dedupeItems(items)
      .map((item) => {
        const role = item.role === "user" || item.role === "thinking" ? item.role : "assistant";
        const target = item.target || item.element;
        return {
          ...item,
          target,
          effectTarget: resolveEffectTarget({ ...item, target, role }, this.config, adapter),
          role
        };
      })
      .filter((item) => item.text && visible(item.target || item.element))
      .map((item, index) => ({
        ...item,
        id: `message-${index + 1}`,
        role: item.role
      }));
  }

  build() {
    if (!this.enabled || !this.root?.isConnected) return;
    this.messages = this.collect();
    this.idToMessage = new Map(this.messages.map((item) => [item.id, item]));
    this.render();
    this.updateActive();
  }

  render() {
    this.indicator.replaceChildren();
    this.menu.replaceChildren();
    if (!this.messages.length) {
      const empty = document.createElement("div");
      empty.className = "chatclub-message-nav-empty";
      empty.textContent = "No messages";
      this.menu.append(empty);
      return;
    }
    for (const message of this.messages) {
      const line = document.createElement("button");
      line.className = "chatclub-message-nav-line";
      line.type = "button";
      line.title = `${rolePrefix(message.role)} ${message.text}`;
      line.dataset.targetId = message.id;
      line.setAttribute("aria-label", message.text);
      line.addEventListener("click", () => this.jumpTo(message.id));
      this.indicator.append(line);

      const item = document.createElement("button");
      item.className = "chatclub-message-nav-item";
      item.type = "button";
      item.dataset.targetId = message.id;
      item.setAttribute("role", "menuitem");
      item.addEventListener("click", () => this.jumpTo(message.id));
      const role = document.createElement("span");
      role.className = "chatclub-message-nav-role";
      role.textContent = rolePrefix(message.role);
      const text = document.createElement("span");
      text.className = "chatclub-message-nav-text";
      text.textContent = message.text;
      item.append(role, text);
      this.menu.append(item);
    }
  }

  onScroll() {
    if (!this.enabled) return;
    clearTimeout(this.scrollTimer);
    this.scrollTimer = setTimeout(() => this.updateActive(), 80);
  }

  setActive(id) {
    const targetId = this.idToMessage.has(id) ? id : "";
    this.activeId = targetId;
    const elements = [
      ...Array.from(this.indicator?.querySelectorAll?.(".chatclub-message-nav-line") || []),
      ...Array.from(this.menu?.querySelectorAll?.(".chatclub-message-nav-item") || [])
    ];
    for (const element of elements) {
      element.classList.toggle("active", Boolean(targetId) && element.dataset.targetId === targetId);
    }
  }

  updateActive() {
    if (!this.messages.length) return;
    const viewportY = Math.max(80, Math.min(window.innerHeight - 80, window.innerHeight * 0.42));
    let active = this.messages[0];
    for (const message of this.messages) {
      try {
        const rect = (message.target || message.element).getBoundingClientRect();
        if (rect.top <= viewportY) active = message;
        if (rect.top > viewportY) break;
      } catch {}
    }
    this.setActive(active?.id || "");
  }

  async jumpTo(id) {
    const message = this.idToMessage.get(id);
    const target = message?.target || message?.element;
    if (!target) return;
    const effectRole = message.role === "user" ? "user" : "assistant";
    const effectTarget = message.effectTarget
      || fallbackEffectTarget(message.element, target, this.config, effectRole);
    const token = this.jumpToken + 1;
    this.jumpToken = token;
    this.setActive(id);
    const scroller = scrollParent(target);
    const rect = target.getBoundingClientRect();
    const base = scrollerRect(scroller);
    const offset = Math.max(30, Math.min(140, Number(this.config.scrollOffsetPx) || 64));
    const top = scrollerTop(scroller) + rect.top - base.top - offset;
    scrollToTop(scroller, Math.max(0, top));
    await this.waitForScrollIdle(scroller, token);
    if (this.jumpToken !== token) return;
    if (effectTarget) this.applyEffect(effectTarget);
    this.updateActive();
  }

  waitForScrollIdle(scroller, token) {
    return new Promise((resolve) => {
      const eventTarget = (!scroller || scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body)
        ? window
        : scroller;
      let done = false;
      let idleTimer = 0;
      let fallbackTimer = 0;
      const cleanup = () => {
        clearTimeout(idleTimer);
        clearTimeout(fallbackTimer);
        try { eventTarget?.removeEventListener?.("scroll", onScroll); } catch {}
      };
      const finish = () => {
        if (done) return;
        done = true;
        cleanup();
        resolve();
      };
      const onScroll = () => {
        if (this.jumpToken !== token) return finish();
        clearTimeout(idleTimer);
        idleTimer = setTimeout(finish, 150);
      };
      try { eventTarget?.addEventListener?.("scroll", onScroll, { passive: true }); } catch {}
      idleTimer = setTimeout(finish, 260);
      fallbackTimer = setTimeout(finish, 900);
    });
  }

  clearEffect() {
    clearTimeout(this.effectTimer);
    if (!this.effectTarget) return;
    this.effectTarget.classList.remove(
      "chatclub-message-nav-effect-border",
      "chatclub-message-nav-effect-pulse",
      "chatclub-message-nav-effect-fade",
      "chatclub-message-nav-effect-jiggle"
    );
    this.effectTarget.style.removeProperty("--cc-message-nav-accent");
    this.effectTarget = null;
  }

  applyEffect(target) {
    this.clearEffect();
    const mode = EFFECT_MODES.has(this.options.effectMode) ? this.options.effectMode : "border";
    if (mode === "none" || !target?.classList) return;
    this.effectTarget = target;
    const effectClass = `chatclub-message-nav-effect-${mode}`;
    target.classList.remove(effectClass);
    target.style.setProperty("--cc-message-nav-accent", this.options.primaryColor);
    try { void target.offsetWidth; } catch {}
    target.classList.add(effectClass);
    this.effectTimer = setTimeout(() => this.clearEffect(), mode === "border" ? 1800 : 1500);
  }

  state() {
    return {
      ok: true,
      enabled: this.enabled,
      siteId: this.config?.id || "",
      adapter: this.config?.adapter || "",
      messageCount: this.messages.length,
      activeId: this.activeId,
      menuOpen: Boolean(this.root?.classList?.contains("chatclub-message-nav-open")),
      version: this.version
    };
  }

  destroy() {
    this.enabled = false;
    clearTimeout(this.buildTimer);
    clearTimeout(this.scrollTimer);
    clearTimeout(this.menuCloseTimer);
    clearTimeout(this.menuFocusTimer);
    this.clearEffect();
    try { this.observer?.disconnect?.(); } catch {}
    this.observer = null;
    window.removeEventListener("scroll", this.boundScroll, true);
    window.removeEventListener("resize", this.boundResize, true);
    document.removeEventListener("pointerdown", this.boundDocumentPointerDown, true);
    document.removeEventListener("keydown", this.boundDocumentKeydown, true);
    this.indicator?.removeEventListener?.("pointerenter", this.boundOpenMenu);
    this.indicator?.removeEventListener?.("pointerleave", this.boundScheduleCloseMenu);
    this.menu?.removeEventListener?.("pointerenter", this.boundOpenMenu);
    this.menu?.removeEventListener?.("pointerleave", this.boundScheduleCloseMenu);
    this.root?.removeEventListener?.("focusin", this.boundRootFocusIn);
    this.root?.removeEventListener?.("focusout", this.boundRootFocusOut);
    this.closeMenu();
    this.root?.remove();
    this.root = null;
    this.indicator = null;
    this.menu = null;
    this.messages = [];
    this.jumpToken += 1;
    this.idToMessage.clear();
    document.getElementById(STYLE_ID)?.remove();
  }
}
