// AppShell: page skeleton plus the base UI API every plugin uses through ctx.ui (spec v1.2 §11.4, v2 01 §5–§6).

import { h, icon, clear } from "../../lib/dom.js";
import * as uiLib from "../../lib/ui.js";
import { renderSafely } from "../../kernel/extension-points.js";

const TOAST_MS = { short: 1600, default: 3200, long: 32000 };
const TOAST_ICONS = { success: "check", error: "circleAlert", warning: "alert", info: "info" };

export default {
  start(ctx) {
    const doc = document;
    const t = ctx.t;
    const page = doc.body.dataset.page === "options" ? "options" : "workspace";
    const mount = doc.getElementById("chatclub-root") ?? doc.body.appendChild(h("div#chatclub-root"));

    // ------------------------------------------------------------ skeleton
    const topbarSlot = h("header.cc-topbar-slot", { id: "cc-topbar-slot" });
    const workspaceSlot = h("main.cc-workspace-slot", { id: "cc-workspace-slot" });
    const sidebarSlot = h("div.cc-sidebar-slot", { id: "cc-sidebar-slot" });
    const shell = h("div.cc-shell", { dataset: { page } }, page === "workspace" ? [topbarSlot, workspaceSlot, sidebarSlot] : [workspaceSlot]);
    const overlayRoot = h("div.cc-overlay-root", { id: "cc-overlay-root" });
    const menuRoot = h("div", { id: "cc-menu-root" });
    const toastHost = h("div.cc-toasts", { attrs: { "aria-hidden": "true" } });
    const livePolite = h("div.cc-sr-only", { attrs: { "aria-live": "polite", role: "status" } });
    const liveAssertive = h("div.cc-sr-only", { attrs: { "aria-live": "assertive", role: "alert" } });
    clear(mount);
    mount.append(shell);
    doc.body.append(overlayRoot, menuRoot, toastHost, livePolite, liveAssertive);
    ctx.onDispose(() => {
      for (const el of [shell, overlayRoot, menuRoot, toastHost, livePolite, liveAssertive]) el.remove();
    });

    // ------------------------------------------------------------ layer stack
    // Every overlay (modal, menu, floating panel) registers a layer; Esc closes the topmost
    // layer only, and only when that layer allows it (v2 01 §5.5).
    const layers = [];
    const pushLayer = (layer) => {
      layers.push(layer);
      updateInert();
      return () => {
        const i = layers.indexOf(layer);
        if (i >= 0) layers.splice(i, 1);
        updateInert();
      };
    };
    const updateInert = () => {
      const modals = layers.filter((l) => l.kind === "modal");
      const top = modals[modals.length - 1];
      shell.inert = !!top;
      for (const l of layers) {
        if (l.kind === "modal" || l.kind === "panel") l.el.inert = !!top && l !== top && layers.indexOf(l) < layers.indexOf(top);
      }
      doc.documentElement.style.overflow = top ? "hidden" : "";
    };
    const onKeydown = (event) => {
      if (event.key !== "Escape" || event.isComposing) return;
      if (pinnedRich) {
        hideRich();
        event.preventDefault();
        return;
      }
      const top = layers[layers.length - 1];
      if (!top) return;
      event.preventDefault();
      event.stopPropagation();
      if (top.escapeCloses && !top.busy?.()) top.close("escape");
    };
    doc.addEventListener("keydown", onKeydown, true);
    ctx.onDispose(() => doc.removeEventListener("keydown", onKeydown, true));

    // ------------------------------------------------------------ focus guard
    // Chat pages focus themselves (on load, after a reply, on a timer) and can pull the caret out of
    // a dialog, panel, menu or text field, even while the workspace is inert. Remember where focus
    // was and hand it back when an iframe takes it without the user going there. The composer is
    // left to PromptFocus, which leases the caret to it.
    let lastFocus = null; // { el, layer }
    let pointerOverFrame = false;
    let frameFocusOkUntil = 0;
    const GUARDED_LAYERS = new Set(["modal", "panel", "menu"]);
    const layerOf = (node) => [...layers].reverse().find((l) => GUARDED_LAYERS.has(l.kind) && l.el.contains(node)) ?? null;
    const onFocusIn = (event) => {
      const target = event.target;
      if (target?.tagName === "IFRAME") return;
      const layer = layerOf(target);
      lastFocus = layer || (isTextField(target) && !target.closest(".cc-composer")) ? { el: target, layer } : null;
    };
    const onMouseOver = (event) => (pointerOverFrame = event.target?.tagName === "IFRAME");
    const onWindowBlur = () => {
      const saved = lastFocus;
      setTimeout(() => {
        if (doc.activeElement?.tagName !== "IFRAME" || !doc.hasFocus()) return;
        const modals = layers.filter((l) => l.kind === "modal");
        const top = modals[modals.length - 1];
        const usable = (el) => el?.isConnected && !el.closest("[inert]") && !el.disabled;
        let target = null;
        if (top) {
          // The workspace is inert under a dialog: the user cannot have gone there.
          target = saved?.layer === top && usable(saved.el) ? saved.el : top.focusTarget?.() ?? firstFocusable(top.el);
        } else if (saved && !pointerOverFrame && Date.now() > frameFocusOkUntil) {
          if (saved.layer && !layers.includes(saved.layer)) return;
          if (usable(saved.el)) target = saved.el;
        }
        target?.focus({ preventScroll: true });
      }, 60);
    };
    doc.addEventListener("focusin", onFocusIn, true);
    doc.addEventListener("mouseover", onMouseOver, true);
    window.addEventListener("blur", onWindowBlur);
    /** Lets a deliberate move into a chat frame (a click on it, trusted input) keep the focus. */
    const allowFrameFocus = (ms = 600) => (frameFocusOkUntil = Math.max(frameFocusOkUntil, Date.now() + ms));
    ctx.events.on("Frames:userClickedFrame", () => allowFrameFocus());
    ctx.onDispose(() => {
      doc.removeEventListener("focusin", onFocusIn, true);
      doc.removeEventListener("mouseover", onMouseOver, true);
      window.removeEventListener("blur", onWindowBlur);
    });

    // ------------------------------------------------------------ modals
    const modalsByKey = new Map();
    const MODAL_KINDS = { viewer: { backdrop: true, escape: true }, editor: {}, task: {}, confirm: {} };

    function openModal(render, options = {}) {
      const { key, kind = "viewer", size, className, onClose, initialFocus, bare = false } = options;
      if (key && modalsByKey.has(key)) {
        const existing = modalsByKey.get(key);
        existing.bringToFront();
        return existing;
      }
      const rules = MODAL_KINDS[kind] ?? MODAL_KINDS.viewer;
      const nested = layers.some((l) => l.kind === "modal");
      const box = h(bare ? "div.cc-modal-bare" : "div.cc-modal", { class: [size, className].filter(Boolean).join(" "), attrs: { role: "dialog", "aria-modal": "true" } });
      const backdrop = h("div.cc-modal-backdrop", { class: nested ? "nested" : "" }, box);
      const returnFocus = doc.activeElement;
      let busy = false;
      let closed = false;
      const handle = {
        key,
        el: box,
        close(reason = "api") {
          if (closed || busy) return false;
          closed = true;
          removeLayer();
          backdrop.remove();
          if (key) modalsByKey.delete(key);
          try {
            onClose?.(reason);
          } catch (error) {
            ctx.logger.error("Modal onClose threw:", error);
          }
          if (returnFocus && typeof returnFocus.focus === "function" && returnFocus.isConnected) returnFocus.focus();
          return true;
        },
        setBusy(value) {
          busy = !!value;
          box.querySelectorAll("[data-close-control]").forEach((el) => (el.disabled = busy));
        },
        isBusy: () => busy,
        bringToFront() {
          overlayRoot.append(backdrop);
          const i = layers.indexOf(layer);
          if (i >= 0) {
            layers.splice(i, 1);
            layers.push(layer);
            updateInert();
          }
        },
        rerender() {
          clear(box);
          renderInto();
        },
      };
      const layer = { kind: "modal", el: backdrop, escapeCloses: !!rules.escape, close: (r) => handle.close(r), busy: () => busy };
      const removeLayer = pushLayer(layer);
      const renderInto = () => {
        const content = renderSafely(ctx.logger, "modal", key ?? "modal", () => render({ onClose: (r) => handle.close(r), handle }), () =>
          modalLayout({ title: t("shell.fatal.title"), body: h("p", t("shell.fatal.body")), onClose: () => handle.close() }),
        );
        if (content) box.append(content);
      };
      renderInto();
      if (rules.backdrop) {
        backdrop.addEventListener("mousedown", (event) => {
          if (event.target === backdrop && !busy) handle.close("backdrop");
        });
      }
      box.addEventListener("keydown", (event) => trapFocus(event, box));
      overlayRoot.append(backdrop);
      if (key) modalsByKey.set(key, handle);
      layer.focusTarget = () => (initialFocus && box.querySelector(initialFocus)) || box.querySelector("[autofocus]") || firstTextField(box.querySelector(".cc-modal-body")) || firstFocusable(box);
      queueMicrotask(() => layer.focusTarget()?.focus({ preventScroll: true }));
      return handle;
    }

    function modalLayout({ title, subtitle, icon: iconName, body, footer, onClose, actions = [], closeLabel }) {
      const header = h(
        "div.cc-modal-header",
        h("div", { style: { flex: "1", minWidth: "0" } },
          h("h2.cc-modal-title", iconName ? icon(iconName, { size: 18 }) : null, title),
          subtitle ? h("div.cc-modal-subtitle", subtitle) : null),
        actions,
        onClose
          ? h("button.cc-window-btn", { type: "button", "aria-label": closeLabel ?? t("common.close"), dataset: { tip: t("common.close"), closeControl: "" }, onclick: () => onClose("button") }, icon("x", { size: 16 }))
          : null,
      );
      return h("div", { style: { display: "contents" } }, header, h("div.cc-modal-body", body), footer ? h("div.cc-modal-footer", footer) : null);
    }

    function closeModal(key) {
      return modalsByKey.get(key)?.close("api") ?? false;
    }

    function closeAllModals() {
      for (const handle of [...modalsByKey.values()]) handle.close("api");
      for (const layer of [...layers].reverse()) if (layer.kind === "modal") layer.close("api");
    }

    function confirm({ title, description, confirmText, cancelText, danger = true, tone, acknowledge, warning, onConfirm, runningText } = {}) {
      const mood = tone ?? (danger ? "danger" : "neutral");
      return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        openModal(({ onClose, handle }) => {
          const ok = h(
            "button.cc-btn.tall",
            { type: "button", class: mood === "neutral" ? "danger" : "danger-solid", disabled: !!acknowledge, dataset: { closeControl: "" } },
            h("span", confirmText ?? t("common.confirm")),
          );
          const cancel = h("button.cc-btn.tall", { type: "button", dataset: { closeControl: "" }, onclick: () => onClose("cancel") }, cancelText ?? t("common.cancel"));
          ok.addEventListener("click", async () => {
            if (!onConfirm) {
              finish(true);
              onClose("confirm");
              return;
            }
            handle.setBusy(true);
            ok.replaceChildren(uiLib.spinner(), h("span", runningText ?? t("common.running")));
            try {
              await onConfirm();
              handle.setBusy(false);
              finish(true);
              onClose("confirm");
            } catch (error) {
              handle.setBusy(false);
              ok.replaceChildren(h("span", confirmText ?? t("common.confirm")));
              toast(String(error?.message || error), "error");
            }
          });
          const ack = acknowledge
            ? h("label.cc-confirm-ack", h("input", { type: "checkbox", onchange: (e) => (ok.disabled = !e.target.checked) }), acknowledge === true ? t("common.ack") : acknowledge)
            : null;
          const body = [
            typeof description === "string" ? h("div.cc-confirm-desc", description) : description,
            warning ? h("div.cc-warning-card", { style: { marginTop: "12px" } }, warning) : null,
            ack,
          ];
          const layout = modalLayout({
            title,
            icon: mood === "neutral" ? null : "alert",
            body,
            footer: [cancel, ok],
            onClose: (r) => onClose(r),
          });
          return layout;
        }, { kind: "confirm", size: "compact", className: "cc-confirm", onClose: () => finish(false), initialFocus: ".cc-modal-footer .cc-btn:first-child" });
        const last = [...overlayRoot.querySelectorAll(".cc-confirm")].pop();
        if (last) last.dataset.tone = mood;
      });
    }

    // ------------------------------------------------------------ popup menus
    let openMenus = [];
    function openMenu({ anchor, items, align = "start", onClose, className = "", point, parent = null } = {}) {
      if (!parent) closeMenus();
      const backdrop = parent ? null : h("div.cc-menu-backdrop");
      const menu = h("div.cc-menu", { class: className, attrs: { role: "menu" } });
      const state = { menu, backdrop, parent, child: null, close: null, anchor };
      const build = () => {
        clear(menu);
        for (const item of items) {
          if (!item) continue;
          if (item === "separator" || item.separator) {
            menu.append(h("div.cc-menu-sep", { attrs: { role: "separator" } }));
            continue;
          }
          if (item.heading) {
            menu.append(h("div.cc-menu-heading", item.heading));
            continue;
          }
          const disabled = typeof item.disabled === "function" ? item.disabled() : !!item.disabled;
          const btn = h(
            "button.cc-menu-item",
            {
              type: "button",
              class: item.danger ? "danger" : "",
              disabled,
              attrs: { role: item.checked !== undefined ? "menuitemcheckbox" : "menuitem", "aria-checked": item.checked !== undefined ? String(!!item.checked) : null, "aria-haspopup": item.submenu ? "menu" : null },
              dataset: item.tip ? { tip: item.tip } : undefined,
            },
            h("span.slot", item.checked !== undefined ? (item.checked ? icon("check", { size: 15 }) : null) : item.icon ? icon(item.icon, { size: 15 }) : null),
            h("span.label", item.label),
            item.hint ? h("span.hint", item.hint) : null,
            item.submenu ? h("span.slot", icon("chevronRight", { size: 15 })) : null,
          );
          if (item.submenu) {
            const openSub = () => {
              if (state.child?.anchor === btn) return;
              state.child?.close();
              const subItems = typeof item.submenu === "function" ? item.submenu() : item.submenu;
              btn.setAttribute("aria-expanded", "true");
              state.child = openMenu({ anchor: btn, items: subItems, parent: state, align: "submenu", onClose: () => btn.removeAttribute("aria-expanded") });
            };
            btn.addEventListener("click", openSub);
            btn.addEventListener("pointerenter", openSub);
          } else {
            btn.addEventListener("pointerenter", () => {
              state.child?.close();
              state.child = null;
            });
            btn.addEventListener("click", () => {
              try {
                const keepOpen = item.keepOpen;
                if (!keepOpen) closeMenus();
                item.onSelect?.();
                if (keepOpen) build();
              } catch (error) {
                ctx.logger.error("Menu item failed:", error);
              }
            });
          }
          menu.append(btn);
        }
      };
      build();
      menu.addEventListener("keydown", (event) => menuKeys(event, menu));
      if (backdrop) {
        backdrop.addEventListener("mousedown", (event) => {
          event.preventDefault();
          closeMenus();
        });
        backdrop.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          closeMenus();
        });
        menuRoot.append(backdrop);
      }
      menuRoot.append(menu);
      positionMenu(menu, anchor, align, point);
      const removeLayer = pushLayer({ kind: "menu", el: menu, escapeCloses: true, close: () => state.close() });
      let closed = false;
      state.close = () => {
        if (closed) return;
        closed = true;
        state.child?.close();
        removeLayer();
        menu.remove();
        backdrop?.remove();
        openMenus = openMenus.filter((m) => m !== state);
        if (anchor?.setAttribute) anchor.setAttribute("aria-expanded", "false");
        try {
          onClose?.();
        } catch (error) {
          ctx.logger.error("Menu onClose threw:", error);
        }
      };
      state.rebuild = build;
      openMenus.push(state);
      if (anchor?.setAttribute && !parent) anchor.setAttribute("aria-expanded", "true");
      queueMicrotask(() => {
        if (!parent) menu.querySelector(".cc-menu-item:not(:disabled)")?.focus({ preventScroll: true });
      });
      return state;
    }

    function closeMenus() {
      for (const state of [...openMenus].reverse()) state.close();
      openMenus = [];
    }
    /** Anchored popover with custom content (layout menu, app picker). Shares the menu layer rules. */
    function openPopover({ anchor, render, align = "start", className = "", point, gap = 4, onClose, closeOnResize = true } = {}) {
      closeMenus();
      const backdrop = h("div.cc-menu-backdrop");
      const el = h("div.cc-menu.cc-popover", { class: className, attrs: { role: "dialog" } });
      const state = { menu: el, backdrop, parent: null, child: null, close: null, anchor };
      let closed = false;
      const onWinChange = () => state.close();
      const onBlur = () => setTimeout(() => {
        if (doc.activeElement?.tagName !== "IFRAME") state.close();
      }, 0);
      state.close = () => {
        if (closed) return;
        closed = true;
        removeLayer();
        el.remove();
        backdrop.remove();
        openMenus = openMenus.filter((m) => m !== state);
        window.removeEventListener("resize", onWinChange);
        window.removeEventListener("blur", onBlur);
        if (anchor?.setAttribute) anchor.setAttribute("aria-expanded", "false");
        try {
          onClose?.();
        } catch (error) {
          ctx.logger.error("Popover onClose threw:", error);
        }
      };
      backdrop.addEventListener("mousedown", (event) => {
        event.preventDefault();
        state.close();
      });
      menuRoot.append(backdrop, el);
      const content = render({ close: () => state.close(), el, reposition: () => place() });
      if (content) el.append(content);
      const place = () => {
        positionMenu(el, anchor, align, point);
        if (gap !== 4 && !point && anchor?.getBoundingClientRect) {
          const r = anchor.getBoundingClientRect();
          const top = r.bottom + gap;
          if (top + el.offsetHeight <= window.innerHeight - 8) el.style.top = `${top}px`;
        }
      };
      place();
      const removeLayer = pushLayer({ kind: "menu", el, escapeCloses: true, close: () => state.close() });
      if (closeOnResize) window.addEventListener("resize", onWinChange);
      window.addEventListener("blur", onBlur);
      openMenus.push(state);
      if (anchor?.setAttribute) anchor.setAttribute("aria-expanded", "true");
      state.reposition = place;
      return state;
    }

    function positionMenu(menu, anchor, align, point) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const rect = point ? { left: point.x, right: point.x, top: point.y, bottom: point.y, width: 0, height: 0 } : anchor?.getBoundingClientRect?.() ?? { left: 8, right: 8, top: 8, bottom: 8 };
      const mw = menu.offsetWidth || 200;
      const mh = menu.offsetHeight || 200;
      let left;
      let top;
      if (align === "submenu") {
        left = rect.right + 4;
        top = rect.top - 6;
        if (left + mw > vw - 8) left = rect.left - mw - 4;
      } else {
        left = align === "end" ? rect.right - mw : rect.left;
        top = rect.bottom + 4;
        if (top + mh > vh - 8 && rect.top - mh - 4 > 8) top = rect.top - mh - 4;
      }
      left = Math.max(8, Math.min(left, vw - mw - 8));
      top = Math.max(8, Math.min(top, vh - mh - 8));
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    }

    function menuKeys(event, menu) {
      const items = [...menu.querySelectorAll(".cc-menu-item:not(:disabled)")];
      const i = items.indexOf(doc.activeElement);
      const move = (n) => {
        event.preventDefault();
        items[(n + items.length) % items.length]?.focus();
      };
      if (event.key === "ArrowDown") move(i + 1);
      else if (event.key === "ArrowUp") move(i - 1);
      else if (event.key === "Home") move(0);
      else if (event.key === "End") move(items.length - 1);
      else if (event.key === "Tab") {
        event.preventDefault();
        closeMenus();
      } else if (event.key === "ArrowRight" && doc.activeElement?.getAttribute("aria-haspopup")) {
        event.preventDefault();
        doc.activeElement.click();
        queueMicrotask(() => openMenus[openMenus.length - 1]?.menu.querySelector(".cc-menu-item:not(:disabled)")?.focus());
      } else if (event.key === "ArrowLeft") {
        const state = openMenus.find((s) => s.menu === menu);
        if (state?.parent) {
          event.preventDefault();
          const anchorEl = state.anchor;
          state.close();
          state.parent.child = null;
          anchorEl?.focus();
        }
      }
    }

    // ------------------------------------------------------------ toasts
    let toastSeq = 0;
    const toasts = new Map();
    function toast(message, type = "message", options = {}) {
      const id = options.id ?? `toast-${++toastSeq}`;
      if (toasts.has(id)) dismissToast(id);
      const stay = TOAST_MS[ctx.settings.toastStay] ?? TOAST_MS.default;
      const duration = options.duration ?? (type === "loading" ? 0 : (type === "error" || options.action ? stay * 2 : stay));
      const lead = type === "loading" ? uiLib.spinner() : TOAST_ICONS[type] ? icon(TOAST_ICONS[type], { size: 16 }) : null;
      const actionBtn = options.action
        ? h("button.action", { type: "button", onclick: () => {
            dismissToast(id);
            options.action.onClick?.();
          } }, options.action.label)
        : null;
      const el = h("div.cc-toast", { dataset: { type } }, lead, h("span.msg", String(message)), actionBtn);
      toastHost.append(el);
      (type === "error" ? liveAssertive : livePolite).textContent = String(message);
      const entry = { el, timer: null, remaining: duration, started: 0 };
      const arm = () => {
        if (!entry.remaining) return;
        entry.started = Date.now();
        entry.timer = setTimeout(() => dismissToast(id), entry.remaining);
      };
      el.addEventListener("mouseenter", () => {
        if (!entry.timer) return;
        clearTimeout(entry.timer);
        entry.timer = null;
        entry.remaining = Math.max(400, entry.remaining - (Date.now() - entry.started));
      });
      el.addEventListener("mouseleave", arm);
      arm();
      toasts.set(id, entry);
      return id;
    }

    function dismissToast(id) {
      if (id === undefined) {
        for (const key of [...toasts.keys()]) dismissToast(key);
        return;
      }
      const entry = toasts.get(id);
      if (!entry) return;
      clearTimeout(entry.timer);
      entry.el.remove();
      toasts.delete(id);
    }

    // ------------------------------------------------------------ notice
    let notice = null;
    function showNotice({ message, type = "info", action, duration } = {}) {
      closeNotice();
      const el = h(
        "div.cc-notice",
        { dataset: { type }, attrs: { role: "status" } },
        icon(TOAST_ICONS[type] ?? "info", { size: 16 }),
        h("span.msg", message),
        action ? h("button.cc-btn", { type: "button", onclick: () => action.onClick?.() }, action.label) : null,
        h("button.cc-window-btn", { type: "button", "aria-label": t("common.close"), onclick: () => closeNotice() }, icon("x", { size: 15 })),
      );
      doc.body.append(el);
      notice = { el, timer: duration ? setTimeout(closeNotice, duration) : null };
      return el;
    }
    function closeNotice() {
      if (!notice) return;
      clearTimeout(notice.timer);
      notice.el.remove();
      notice = null;
    }

    // Rich help cards for (i) buttons.
    let richCard = null;
    let pinnedRich = null;
    function hideRich() {
      richCard?.remove();
      richCard = null;
      if (pinnedRich) pinnedRich.setAttribute("aria-expanded", "false");
      pinnedRich = null;
    }
    function showRich(btn, { title, text, tone }) {
      hideRich();
      const paragraphs = String(text ?? "").split(/\n+/).filter(Boolean);
      const bullets = paragraphs.filter((p) => /^[-•]\s/.test(p));
      const plain = paragraphs.filter((p) => !/^[-•]\s/.test(p));
      richCard = h(
        "div.cc-rich-tip",
        { dataset: { tone: tone ?? "" }, attrs: { role: "tooltip" } },
        title ? h("h4", title) : null,
        plain.map((p) => h("p", p)),
        bullets.length ? h("ul", bullets.map((b) => h("li", b.replace(/^[-•]\s/, "")))) : null,
      );
      doc.body.append(richCard);
      const rect = btn.getBoundingClientRect();
      const cw = richCard.offsetWidth;
      const ch = richCard.offsetHeight;
      let left = rect.right + 8;
      let top = rect.top - 4;
      if (left + cw > window.innerWidth - 8) {
        left = Math.max(8, rect.left);
        top = rect.bottom + 8;
      }
      top = Math.max(8, Math.min(top, window.innerHeight - ch - 8));
      richCard.style.left = `${Math.min(left, window.innerWidth - cw - 8)}px`;
      richCard.style.top = `${top}px`;
      richCard.addEventListener("pointerleave", () => {
        if (!pinnedRich) hideRich();
      });
    }
    function helpButton({ title, text, tone, label } = {}) {
      const btn = h("button.cc-help-btn", { type: "button", "aria-label": label ?? title ?? "Help", attrs: { "aria-expanded": "false" } }, icon("info", { size: 14 }));
      btn.addEventListener("pointerenter", () => {
        if (!pinnedRich) showRich(btn, { title, text, tone });
      });
      btn.addEventListener("pointerleave", (event) => {
        if (pinnedRich) return;
        if (richCard && event.relatedTarget && richCard.contains(event.relatedTarget)) return;
        setTimeout(() => {
          if (!pinnedRich && richCard && !richCard.matches(":hover")) hideRich();
        }, 120);
      });
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        if (pinnedRich === btn) return hideRich();
        showRich(btn, { title, text, tone });
        pinnedRich = btn;
        btn.setAttribute("aria-expanded", "true");
      });
      return btn;
    }
    const onDocClick = (event) => {
      if (pinnedRich && !richCard?.contains(event.target) && event.target !== pinnedRich) hideRich();
    };
    doc.addEventListener("click", onDocClick);
    ctx.onDispose(() => doc.removeEventListener("click", onDocClick));

    // ------------------------------------------------------------ floating panels (Summary, Share)
    /**
     * Persistent panel without backdrop (01 §5.5). `rect` restores a remembered { left, top, width, height }
     * (clamped into the viewport); `onRect` is told the new rect after a drag or resize.
     */
    function openFloatingPanel({ id, title, icon: iconName, body, actions = [], width = 520, height = 560, top = 52, right = 16, left, center = false, rect, minWidth = 360, minHeight = 240, onRect, maximizeTip, zIndex, onClose, escapeCloses = true } = {}) {
      const panel = h("section.cc-float-panel", { dataset: { panel: id }, attrs: { role: "dialog", "aria-label": title } });
      if (zIndex) panel.style.zIndex = zIndex;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let box;
      if (rect && rect.width > 0 && rect.height > 0) {
        const w = Math.max(minWidth, Math.min(rect.width, vw - 32));
        const hgt = Math.max(minHeight, Math.min(rect.height, vh - 32));
        box = { width: w, height: hgt, left: Math.max(8, Math.min(rect.left, vw - w - 8)), top: Math.max(8, Math.min(rect.top, vh - hgt - 8)) };
      } else {
        const w = Math.min(width, vw - 24);
        const hgt = Math.min(height, vh - top - 12);
        box = { width: w, height: hgt, top, left: left ?? (center ? Math.max(12, (vw - w) / 2) : Math.max(12, vw - w - right)) };
      }
      Object.assign(panel.style, { width: `${box.width}px`, height: `${box.height}px`, top: `${box.top}px`, left: `${box.left}px`, minWidth: `${minWidth}px`, minHeight: `${minHeight}px` });
      panel._ccMin = { minWidth, minHeight };
      panel._ccOnRect = () => {
        const r = panel.getBoundingClientRect();
        onRect?.({ left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) });
      };
      let maximized = false;
      const tipFor = (on) => (on ? t("common.restore") : maximizeTip?.() ?? t("common.maximize"));
      const maxBtn = h("button.cc-window-btn", { type: "button", "aria-label": t("common.maximize"), dataset: { tip: tipFor(false) } }, icon("maximize", { size: 15 }));
      const setMaximized = (on) => {
        maximized = !!on;
        panel.classList.toggle("maximized", maximized);
        maxBtn.replaceChildren(icon(maximized ? "minimize" : "maximize", { size: 15 }));
        maxBtn.dataset.tip = tipFor(maximized);
      };
      maxBtn.addEventListener("click", () => setMaximized(!maximized));
      const closeBtn = h("button.cc-window-btn", { type: "button", "aria-label": t("common.close"), dataset: { tip: t("common.close") } }, icon("x", { size: 16 }));
      const header = h("div.cc-float-header", h("div.cc-float-title", iconName ? icon(iconName, { size: 18 }) : null, title), actions, maxBtn, closeBtn);
      const bodyEl = h("div.cc-float-body", body);
      panel.append(header, bodyEl, h("div.cc-resize.e"), h("div.cc-resize.w"), h("div.cc-resize.s"), h("div.cc-resize.se"));
      makeDraggable(panel, header);
      makeResizable(panel);
      doc.body.append(panel);
      let closed = false;
      const handle = {
        el: panel,
        body: bodyEl,
        close(reason = "api") {
          if (closed) return;
          closed = true;
          removeLayer();
          panel.remove();
          try {
            onClose?.(reason);
          } catch (error) {
            ctx.logger.error("Panel onClose threw:", error);
          }
        },
        isOpen: () => !closed,
        isMaximized: () => maximized,
        toggleMaximized: () => setMaximized(!maximized),
        setMaximized,
        setTitle(text) {
          header.querySelector(".cc-float-title").lastChild.textContent = text;
        },
      };
      closeBtn.addEventListener("click", () => handle.close("button"));
      const panelLayer = { kind: "panel", el: panel, escapeCloses, close: (r) => handle.close(r), focusTarget: () => bodyEl.querySelector("[autofocus]") || firstFocusable(bodyEl) };
      const removeLayer = pushLayer(panelLayer);
      queueMicrotask(() => bodyEl.querySelector("[autofocus]")?.focus({ preventScroll: true }));
      return handle;
    }

    function makeDraggable(panel, grip) {
      grip.addEventListener("pointerdown", (event) => {
        if (event.target.closest("button") || panel.classList.contains("maximized")) return;
        const startX = event.clientX;
        const startY = event.clientY;
        const rect = panel.getBoundingClientRect();
        grip.setPointerCapture(event.pointerId);
        doc.body.classList.add("cc-dragging-panel");
        const move = (e) => {
          const left = Math.max(0, Math.min(window.innerWidth - 80, rect.left + e.clientX - startX));
          const top = Math.max(0, Math.min(window.innerHeight - 40, rect.top + e.clientY - startY));
          panel.style.left = `${left}px`;
          panel.style.top = `${top}px`;
        };
        const up = () => {
          grip.removeEventListener("pointermove", move);
          grip.removeEventListener("pointerup", up);
          doc.body.classList.remove("cc-dragging-panel");
          panel._ccOnRect?.();
        };
        grip.addEventListener("pointermove", move);
        grip.addEventListener("pointerup", up);
      });
    }

    function makeResizable(panel) {
      for (const handleEl of panel.querySelectorAll(".cc-resize")) {
        handleEl.addEventListener("pointerdown", (event) => {
          if (panel.classList.contains("maximized")) return;
          event.preventDefault();
          const dir = [...handleEl.classList].find((c) => c !== "cc-resize");
          const rect = panel.getBoundingClientRect();
          const sx = event.clientX;
          const sy = event.clientY;
          handleEl.setPointerCapture(event.pointerId);
          doc.body.classList.add("cc-dragging-panel");
          const { minWidth = 360, minHeight = 240 } = panel._ccMin ?? {};
          const move = (e) => {
            const dx = e.clientX - sx;
            const dy = e.clientY - sy;
            if (dir.includes("e")) panel.style.width = `${Math.max(minWidth, rect.width + dx)}px`;
            if (dir.includes("s")) panel.style.height = `${Math.max(minHeight, rect.height + dy)}px`;
            if (dir === "w") {
              const w = Math.max(minWidth, rect.width - dx);
              panel.style.width = `${w}px`;
              panel.style.left = `${rect.right - w}px`;
            }
          };
          const up = () => {
            handleEl.removeEventListener("pointermove", move);
            handleEl.removeEventListener("pointerup", up);
            doc.body.classList.remove("cc-dragging-panel");
            panel._ccOnRect?.();
          };
          handleEl.addEventListener("pointermove", move);
          handleEl.addEventListener("pointerup", up);
        });
      }
    }

    // ------------------------------------------------------------ panel extension point
    const panels = ctx.extensionPoint("panel");
    const panelApi = {
      open(id, args) {
        const entry = panels.get(id);
        if (!entry) return false;
        try {
          entry.open?.(args);
          return true;
        } catch (error) {
          ctx.logger.error(`Opening panel "${id}" failed:`, error);
          return false;
        }
      },
      toggle(id, args) {
        const entry = panels.get(id);
        if (!entry) return false;
        try {
          if (entry.isOpen?.()) entry.close?.();
          else entry.open?.(args);
          return true;
        } catch (error) {
          ctx.logger.error(`Toggling panel "${id}" failed:`, error);
          return false;
        }
      },
      has: (id) => panels.has(id),
    };

    function showFatal(message) {
      clear(workspaceSlot);
      workspaceSlot.append(
        h("div.cc-fatal", h("h1", t("shell.fatal.title")), h("p", message ?? t("shell.fatal.body")), h("div", { style: { display: "flex", gap: "8px" } },
          h("button.cc-btn.primary", { type: "button", onclick: () => location.reload() }, t("common.reload")))),
      );
    }

    ctx.contribute("appearance.field", {
      id: "AppShell:toastStay",
      group: "Appearance:general",
      order: 70,
      render(container) {
        container.append(uiLib.field({
          label: t("appShell.toastStay"),
          desc: t("appShell.toastStay.description"),
          control: uiLib.select({
            value: ctx.settings.toastStay ?? "default",
            options: ["short", "default", "long"].map((v) => ({ value: v, label: t(`appShell.toastStay.${v}`) })),
            onChange: (v) => (ctx.settings.toastStay = v),
          }),
        }));
      },
    });

    const ui = {
      toast, dismissToast, showNotice, closeNotice, openModal, closeModal, closeAllModals, confirm, modalLayout,
      openMenu, closeMenus, openPopover, helpButton, openFloatingPanel, panels: panelApi, showFatal,
      hasOpenLayer: () => layers.length > 0,
      topLayerKind: () => layers[layers.length - 1]?.kind ?? null,
      /** How long a plain toast stays, in ms (the "Toast duration" setting); errors stay twice as long. */
      toastStayMs: () => TOAST_MS[ctx.settings.toastStay] ?? TOAST_MS.default,
      allowFrameFocus,
    };
    ctx.services.provide("ui", ui);
    ctx.services.provide("shell", { page, shell, topbarSlot, workspaceSlot, sidebarSlot, overlayRoot, setFullscreen: (on) => (shell.dataset.fullscreen = String(!!on)) });
  },
};

function firstFocusable(root) {
  return root.querySelector('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])');
}

const isTextField = (el) => !!el?.matches?.('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="file"]):not([type="color"]), textarea, [contenteditable="true"]');

/** First field the user types into (text inputs and text areas), for dialogs that open on a form. */
function firstTextField(root) {
  return root?.querySelector('input:not(:disabled):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="file"]):not([type="color"]):not([readonly]), textarea:not(:disabled):not([readonly])') ?? null;
}

function trapFocus(event, box) {
  if (event.key !== "Tab") return;
  const nodes = [...box.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')].filter((n) => n.offsetParent !== null || n === document.activeElement);
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
