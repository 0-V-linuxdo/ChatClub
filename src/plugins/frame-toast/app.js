// FrameToast: in-column notices ("Submitting", "Sent", errors) at a user-chosen spot (06 §3.3).

import { h, icon } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";

export default {
  start(ctx) {
    const t = ctx.t;
    const shellUi = ctx.services.get("ui");
    const workspace = ctx.services.get("workspace");
    if (!workspace) return;

    const FRAME_TOAST_INSET = 12;
    // Same lengths as the page toasts (06 §3.3); errors stay twice as long. 0 keeps a toast until dismissed.
    const frameToast = (groupOrFrame, text, { type = "message", spinner = false, duration } = {}) => {
      const body = workspace.columnBody(groupOrFrame);
      if (!body) return () => {};
      const stay = shellUi.toastStayMs?.() ?? 3200;
      if (duration !== 0) duration = type === "error" ? stay * 2 : stay;
      const position = ctx.settings.frameToastPosition ?? {};
      const el = h("div.cc-ws-frame-toast", { dataset: { type }, attrs: { role: "status" } },
        spinner ? ui.spinner() : type === "success" ? icon("check", { size: 14 }) : type === "error" ? icon("circleAlert", { size: 14 }) : null,
        h("span", text));
      const pct = (v, d) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(100, Number(v))) : d);
      // The point is where the toast sits inside the column: 0/0 is the top-left corner, 100/100 the
      // bottom-right; the toast is shifted by the same share of its own size so it never leaves the column.
      const x = pct(position.x, 100);
      const y = pct(position.y, 100);
      el.style.left = `calc(${FRAME_TOAST_INSET}px + (100% - ${2 * FRAME_TOAST_INSET}px) * ${x / 100})`;
      el.style.top = `calc(${FRAME_TOAST_INSET}px + (100% - ${2 * FRAME_TOAST_INSET}px) * ${y / 100})`;
      el.style.transform = `translate(-${x}%, -${y}%)`;
      body.append(el);
      let timer = duration > 0 ? setTimeout(() => el.remove(), duration) : null;
      return () => {
        clearTimeout(timer);
        timer = null;
        el.remove();
      };
    };

    // Appearance → Site toast: drag the sample toast inside a small column preview (06 §3.3).
    ctx.contribute("appearance.group", {
      id: "FrameToast:position",
      tab: "workspace",
      order: 40,
      titleKey: "workspace.toast.card",
      render(container, gctx) {
        const store = ctx.settings;
        const pct = (v, d) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(100, Math.round(Number(v)))) : d);
        let pos = { x: pct(store.frameToastPosition?.x, 100), y: pct(store.frameToastPosition?.y, 100) };
        const sample = h("div.cc-ws-frame-toast.cc-ws-toast-sample", { dataset: { type: "success" } }, icon("check", { size: 14 }), h("span", t("workspace.toast.sample")));
        const preview = h("div.cc-ws-toast-preview", { attrs: { tabindex: "0", role: "slider", "aria-label": t("workspace.toast.position") } }, h("div.cc-ws-toast-preview-head"), sample);
        const coords = h("span.cc-ws-toast-coords");
        const place = () => {
          sample.style.left = `calc(${FRAME_TOAST_INSET}px + (100% - ${2 * FRAME_TOAST_INSET}px) * ${pos.x / 100})`;
          sample.style.top = `calc(${FRAME_TOAST_INSET}px + (100% - ${2 * FRAME_TOAST_INSET}px) * ${pos.y / 100})`;
          sample.style.transform = `translate(-${pos.x}%, -${pos.y}%)`;
          coords.textContent = t("workspace.toast.coords", { x: pos.x, y: pos.y });
          preview.setAttribute("aria-valuetext", coords.textContent);
        };
        const save = () => (store.frameToastPosition = { ...pos });
        const fromPointer = (e) => {
          const r = preview.getBoundingClientRect();
          pos = { x: pct(((e.clientX - r.left) / r.width) * 100, pos.x), y: pct(((e.clientY - r.top) / r.height) * 100, pos.y) };
          place();
        };
        preview.addEventListener("pointerdown", (e) => {
          if (e.button !== 0) return;
          preview.setPointerCapture?.(e.pointerId);
          preview.focus();
          fromPointer(e);
          const move = (ev) => fromPointer(ev);
          const up = () => {
            preview.removeEventListener("pointermove", move);
            preview.removeEventListener("pointerup", up);
            preview.removeEventListener("pointercancel", up);
            save();
          };
          preview.addEventListener("pointermove", move);
          preview.addEventListener("pointerup", up);
          preview.addEventListener("pointercancel", up);
        });
        preview.addEventListener("keydown", (e) => {
          const step = e.shiftKey ? 5 : 1;
          const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
          if (!d) return;
          e.preventDefault();
          pos = { x: pct(pos.x + d[0], pos.x), y: pct(pos.y + d[1], pos.y) };
          place();
          save();
        });
        const reset = ui.button({ label: t("workspace.toast.reset"), onClick: () => {
          pos = { x: 100, y: 100 };
          place();
          save();
        } });
        place();
        container.append(
          ui.field({ label: t("workspace.toast.position"), desc: t("workspace.toast.position.desc"), control: h("div.cc-ws-toast-setting", preview, h("div.cc-ws-toast-meta", coords, reset)) }),
        );
        void gctx;
      },
    });

    ctx.services.provide("frameToast", frameToast);
  },
};
