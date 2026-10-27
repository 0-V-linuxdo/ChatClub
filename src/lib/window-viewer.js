// Window viewer shared by Pocket and send history (v2 01 §5.5, 04 §3.4, 03 §6.3): a viewer modal at workspace
// width with a 260 px sidebar, collapse, optional focus mode, fullscreen, four resize edges and a remembered size.

import { h, clear, icon } from "./dom.js";

const readSize = (key) => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v && v.width > 0 && v.height > 0 ? v : null;
  } catch {
    return null;
  }
};
const writeSize = (key, v) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // ignore
  }
};

/**
 * @param {object} ctx plugin ctx (needs services "ui", t)
 * @param {object} o
 * @param {string} o.key modal key
 * @param {string} [o.sizeKey] localStorage key for { width, height }
 * @param {() => Node} o.titleIcon icon (or icon button) shown before the title
 * @param {() => string} o.title
 * @param {() => string} o.sidebarTitle heading of the sidebar column
 * @param {(el: HTMLElement) => void} o.renderSidebar
 * @param {(el: HTMLElement) => void} o.renderMainHead title block + actions of the current item
 * @param {(el: HTMLElement) => void} o.renderMain
 * @param {boolean} [o.focusable] offers focus mode
 * @param {{ get: () => boolean, set: (v: boolean) => void }} [o.collapsed] sidebar collapse state holder
 * @param {() => void} [o.onClose]
 */
export function openWindowViewer(ctx, o) {
  const t = ctx.t;
  const shellUi = ctx.services.get("ui");
  let focus = false;
  let fullscreen = false;
  const collapsed = o.collapsed ?? (() => {
    let v = false;
    return { get: () => v, set: (x) => (v = x) };
  })();
  const els = {};
  let handleRef = null;

  const winBtn = (name, label, onClick) => h("button.cc-window-btn", { type: "button", "aria-label": label, dataset: { tip: label }, onclick: onClick }, icon(name, { size: 15 }));

  const drawHeader = () => {
    clear(els.header);
    const leftArea = h("div.cc-wv-side-head");
    if (focus) {
      leftArea.append(o.titleIcon(), h("button.cc-btn.ghost.cc-wv-exit-focus", { type: "button", onclick: () => setFocus(false) }, t("viewer.exitFocus")));
      leftArea.classList.add("focus");
    } else {
      leftArea.append(
        o.titleIcon(),
        h("strong.cc-wv-title", o.title()),
        h("span.grow"),
        winBtn(collapsed.get() ? "sidebarExpand" : "sidebarCollapse", t(collapsed.get() ? "viewer.expandSidebar" : "viewer.collapseSidebar"), () => {
          collapsed.set(!collapsed.get());
          apply();
          drawHeader();
        }),
        ...(o.focusable ? [winBtn("focusMode", t("viewer.focus"), () => setFocus(true))] : []),
      );
    }
    els.mainHead = h("div.cc-wv-main-head");
    o.renderMainHead(els.mainHead);
    els.header.append(leftArea, els.mainHead,
      winBtn(fullscreen ? "minimize" : "maximize", t(fullscreen ? "viewer.restore" : "viewer.fullscreen"), () => toggleFullscreen()),
      h("button.cc-window-btn", { type: "button", "aria-label": t("common.close"), dataset: { tip: t("common.close"), closeControl: "" }, onclick: () => handleRef?.close("button") }, icon("x", { size: 16 })));
  };
  const apply = () => {
    if (!els.box) return;
    els.box.classList.toggle("focus", focus);
    els.box.classList.toggle("collapsed", !focus && collapsed.get());
    els.box.classList.toggle("maximized", fullscreen);
  };
  const setFocus = (on) => {
    focus = !!on;
    apply();
    drawHeader();
  };
  const toggleFullscreen = () => {
    fullscreen = !fullscreen;
    apply();
    drawHeader();
  };

  const addResize = (box) => {
    for (const dir of ["n", "s", "e", "w"]) {
      const grip = h(`div.cc-wv-resize.${dir}`);
      grip.addEventListener("pointerdown", (event) => {
        if (fullscreen) return;
        event.preventDefault();
        const rect = box.getBoundingClientRect();
        const sx = event.clientX;
        const sy = event.clientY;
        grip.setPointerCapture(event.pointerId);
        document.body.classList.add("cc-dragging-panel");
        const move = (e) => {
          // The box stays centered, so an edge moves twice as fast as the pointer would otherwise suggest.
          if (dir === "e" || dir === "w") {
            const dx = (e.clientX - sx) * (dir === "e" ? 2 : -2);
            box.style.width = `${Math.max(560, Math.min(window.innerWidth - 16, rect.width + dx))}px`;
          } else {
            const dy = (e.clientY - sy) * (dir === "s" ? 2 : -2);
            box.style.height = `${Math.max(360, Math.min(window.innerHeight - 16, rect.height + dy))}px`;
          }
        };
        const up = () => {
          grip.removeEventListener("pointermove", move);
          grip.removeEventListener("pointerup", up);
          document.body.classList.remove("cc-dragging-panel");
          const r = box.getBoundingClientRect();
          if (o.sizeKey) writeSize(o.sizeKey, { width: Math.round(r.width), height: Math.round(r.height) });
        };
        grip.addEventListener("pointermove", move);
        grip.addEventListener("pointerup", up);
      });
      box.append(grip);
    }
  };

  const handle = shellUi.openModal(({ handle: hd }) => {
    handleRef = hd;
    els.box = hd.el;
    els.header = h("div.cc-wv-header");
    els.sidebar = h("div.cc-wv-sidebar");
    els.main = h("div.cc-wv-main");
    const saved = o.sizeKey ? readSize(o.sizeKey) : null;
    if (saved) {
      hd.el.style.width = `${Math.min(saved.width, window.innerWidth - 16)}px`;
      hd.el.style.height = `${Math.min(saved.height, window.innerHeight - 16)}px`;
    }
    drawHeader();
    o.renderSidebar(els.sidebar);
    o.renderMain(els.main);
    queueMicrotask(() => {
      apply();
      addResize(hd.el);
    });
    return h("div", { style: { display: "contents" } }, els.header, h("div.cc-wv-body", h("aside.cc-wv-aside", h("div.cc-wv-aside-title", o.sidebarTitle?.() ?? ""), els.sidebar), els.main));
  }, { key: o.key, kind: "viewer", size: "workspace", className: "cc-wv", onClose: () => o.onClose?.() });

  return {
    handle,
    isOpen: () => !!handleRef && handleRef.el.isConnected,
    close: () => handleRef?.close("api"),
    toggleFullscreen,
    isFullscreen: () => fullscreen,
    refreshHeader: () => drawHeader(),
    refreshSidebar: () => {
      clear(els.sidebar);
      o.renderSidebar(els.sidebar);
    },
    refreshMain: () => {
      clear(els.main);
      o.renderMain(els.main);
      drawHeader();
    },
    refresh() {
      this.refreshSidebar();
      this.refreshMain();
    },
  };
}

export const WINDOW_VIEWER_STYLE = String.raw`
.cc-modal.cc-wv { position: relative; height: min(820px, calc(100vh - 48px)); max-height: calc(100vh - 16px); display: flex; flex-direction: column; }
.cc-modal.cc-wv.maximized { width: 100vw !important; height: 100vh !important; max-height: 100vh; border-radius: 0; border: 0; box-shadow: none; }
.cc-modal.cc-wv.maximized .cc-wv-resize { display: none; }
.cc-wv-header { display: flex; align-items: center; gap: 8px; min-height: 52px; padding: 8px 12px; border-bottom: 1px solid var(--line); }
.cc-wv-side-head { display: flex; align-items: center; gap: 8px; width: 248px; flex: none; }
.cc-wv-side-head.focus { width: auto; }
.cc-wv.collapsed .cc-wv-side-head { width: auto; }
.cc-wv-side-head .grow { flex: 1; }
.cc-wv-title { font-size: 16px; }
.cc-wv-main-head { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; }
.cc-wv-main-head .head-text { flex: 1; min-width: 0; }
.cc-wv-main-head .head-title { font-weight: 700; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cc-wv-main-head .head-sub { font-size: 12px; color: var(--muted); min-height: 16px; }
.cc-wv-body { flex: 1; min-height: 0; display: flex; }
.cc-wv-aside { width: 260px; flex: none; display: flex; flex-direction: column; border-right: 1px solid var(--line); min-height: 0; }
.cc-wv.focus .cc-wv-aside, .cc-wv.collapsed .cc-wv-aside { display: none; }
.cc-wv-aside-title { padding: 10px 12px 4px; font-size: 12px; font-weight: 700; color: var(--muted); }
.cc-wv-aside-title:empty { display: none; }
.cc-wv-sidebar { flex: 1; min-height: 0; overflow: auto; padding: 4px 8px 12px; display: flex; flex-direction: column; gap: 4px; }
.cc-wv-main { flex: 1; min-width: 0; min-height: 0; overflow: auto; padding: 14px 16px; }
.cc-wv-item { all: unset; box-sizing: border-box; display: flex; flex-direction: column; gap: 3px; padding: 8px 10px; border-radius: 8px; border: 1px solid transparent; cursor: pointer; }
.cc-wv-item:hover { background: var(--hover); }
.cc-wv-item[aria-current="true"] { background: color-mix(in srgb, var(--primary) 12%, transparent); border-color: var(--primary); }
.cc-wv-item .line1 { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cc-wv-item .line2 { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--muted); min-width: 0; }
.cc-wv-item .line2 .txt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cc-wv-group-label { padding: 8px 10px 2px; font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; }
.cc-wv-empty-side { padding: 16px 10px; color: var(--muted); font-size: 13px; }
.cc-wv-empty { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--muted); text-align: center; }
.cc-wv-empty strong { color: var(--text); font-size: 15px; }
.cc-wv-resize { position: absolute; z-index: 3; }
.cc-wv-resize.n { top: -3px; left: 12px; right: 12px; height: 8px; cursor: ns-resize; }
.cc-wv-resize.s { bottom: -3px; left: 12px; right: 12px; height: 8px; cursor: ns-resize; }
.cc-wv-resize.e { right: -3px; top: 12px; bottom: 12px; width: 8px; cursor: ew-resize; }
.cc-wv-resize.w { left: -3px; top: 12px; bottom: 12px; width: 8px; cursor: ew-resize; }
.cc-stack-icons { display: inline-flex; }
.cc-stack-icons img, .cc-stack-icons .letter { width: 14px; height: 14px; border-radius: 50%; border: 1.5px solid var(--panel); margin-left: -4px; background: var(--panel); }
.cc-stack-icons > :first-child { margin-left: 0; }
.cc-stack-icons .letter { display: inline-grid; place-items: center; font-size: 8px; font-weight: 700; background: var(--primary); color: #fff; }
`;
