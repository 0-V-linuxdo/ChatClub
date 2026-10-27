// Share (page): the share panel, long screenshots of chat iframes and text export (v2 04 §4).

import { h, clear } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { conversationKey } from "../../lib/conversation.js";
import { estimateOverlap, searchRange, refineOverlap, fitScale, outputWidth, composeLayout, shareFileName, shareText, TITLE_H, BG, FG } from "./stitch.js";

const RECT_KEY = "chatclub.sharePanelSize.v1";
const MAX_SLICES = 60;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STYLE = String.raw`
.cc-share { display: flex; flex-direction: column; gap: 12px; height: 100%; min-height: 0; padding: 14px 16px; box-sizing: border-box; }
.cc-share-row { display: grid; grid-template-columns: 64px 1fr; align-items: center; gap: 12px; font-size: 13px; }
.cc-share-row > span { color: var(--muted); }
.cc-share [aria-disabled="true"] { opacity: .55; pointer-events: none; }
.cc-share-targets { display: flex; flex-direction: column; gap: 4px; max-height: 160px; overflow: auto; padding: 6px 8px; border: 1px solid var(--line); border-radius: 8px; }
.cc-share-targets label { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.cc-share-targets .state { margin-left: auto; font-size: 11.5px; color: var(--muted); }
.cc-share-hint { font-size: 12px; color: var(--muted); }
.cc-share-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.cc-share-status { min-height: 18px; font-size: 12.5px; color: var(--muted); }
.cc-share-status.error { color: var(--danger); }
.cc-share-preview { flex: 1; min-height: 0; overflow: auto; border: 1px solid var(--line); border-radius: 8px; background: var(--panel-2); display: flex; }
.cc-share-preview img { width: 100%; height: auto; align-self: flex-start; display: block; }
.cc-share-preview .empty { margin: auto; color: var(--muted); }
.cc-share-preview textarea { flex: 1; border: 0; resize: none; padding: 12px; background: transparent; color: inherit; font: 13px/1.5 var(--mono, ui-monospace, monospace); }
`;

export default {
  start(ctx) {
    const t = ctx.t;
    const shellUi = ctx.services.get("ui");
    const workspace = ctx.services.get("workspace");
    const transport = ctx.services.get("frames.transport");
    const frames = ctx.services.get("frames");
    const apps = ctx.services.get("apps");
    const summary = () => ctx.services.get("summary");
    if (!workspace) return;
    ctx.styles.register("share", STYLE);

    // In-page memory only (04 §4.2).
    const opts = { format: "image", scope: "current", direction: "vertical", selected: null };
    let handle = null;
    let els = null;
    let running = null; // { stopped, frameKey?, runId? }
    let result = null; // { kind: "image", canvas, jpegBlob, url } | { kind: "text", text }
    let status = { text: "", error: false };

    const nameOf = (appId) => apps.get(appId)?.name ?? appId;
    const allTabs = () => workspace.groups().flatMap((g, gi) => g.tabs.map((tb, ti) => ({ key: tb.id, tabId: tb.id, groupId: g.id, groupIndex: gi, tabIndex: ti, appId: tb.appId, name: nameOf(tb.appId), href: tb.href, frameKey: tb.frameKey, visible: g.activeIndex === ti })));
    const hasConversation = () => workspace.activeTargets().some((tg) => conversationKey(workspace.currentHrefSync(tg.tabId) ?? ""));

    const resolveTargets = () => {
      const list = allTabs();
      const visible = list.filter((x) => x.visible);
      if (opts.scope === "all") return list;
      if (opts.scope === "selected") {
        const picked = list.filter((x) => opts.selected?.has(x.key));
        return picked.length ? picked : visible.length ? visible : list.slice(0, 1);
      }
      const active = workspace.activeTargets();
      const displayed = workspace.displayedTargets();
      let pick = null;
      if (displayed.length < active.length && displayed[0]) pick = list.find((x) => x.tabId === displayed[0].tabId);
      if (!pick) {
        const focused = document.activeElement;
        if (focused?.tagName === "IFRAME") pick = list.find((x) => workspace.iframeOf(x.tabId) === focused);
      }
      if (!pick && active[0]) pick = list.find((x) => x.tabId === active[0].tabId);
      if (!pick) pick = visible[0] ?? list[0];
      return pick ? [pick] : [];
    };

    const setStatus = (text, error = false) => {
      status = { text, error };
      if (els) {
        els.status.textContent = text;
        els.status.classList.toggle("error", !!error);
      }
    };
    const setResult = (next) => {
      if (result?.url) URL.revokeObjectURL(result.url);
      result = next;
      render();
    };

    // ------------------------------------------------------------ image capture
    const captureTab = async () => new Promise((resolve, reject) => {
      chrome.tabs.captureVisibleTab(chrome.windows.WINDOW_ID_CURRENT, { format: "png" }, (dataUrl) => {
        const err = chrome.runtime.lastError;
        if (err || !dataUrl) reject(new Error(err?.message || "capture failed"));
        else resolve(dataUrl);
      });
    });
    const bitmapOf = async (dataUrl) => createImageBitmap(await (await fetch(dataUrl)).blob());
    const rowFeatures = (width) => (img, y) => {
      const out = [];
      const row = Math.max(0, Math.min(img.height - 1, y)) * width * 4;
      for (let k = 0; k < 32; k += 1) {
        const i = row + Math.floor(((k + 0.5) / 32) * width) * 4;
        out.push(img.data[i] * 0.299 + img.data[i + 1] * 0.587 + img.data[i + 2] * 0.114);
      }
      return out;
    };

    const switchTo = async (target) => {
      const g = workspace.groups().find((x) => x.id === target.groupId);
      const prev = g?.tabs[g.activeIndex]?.id ?? null;
      if (g && prev !== target.tabId) workspace.setActive(target.groupId, target.tabId);
      for (let i = 0; i < 24; i += 1) {
        const r = workspace.iframeOf(target.tabId)?.getBoundingClientRect();
        if (r && r.width > 8 && r.height > 8) break;
        await sleep(50);
      }
      await sleep(80);
      return () => {
        if (g && prev && prev !== target.tabId) workspace.setActive(target.groupId, prev);
      };
    };

    const longShot = async (target, run, prefix) => {
      const restore = await switchTo(target);
      const frameKey = workspace.tab(target.tabId)?.frameKey;
      const iframe = workspace.iframeOf(target.tabId);
      try {
        if (!iframe || !frameKey || !frames.isRegistered(frameKey)) throw new Error(t("share.notLoaded", { name: target.name }));
        iframe.scrollIntoView({ block: "nearest", inline: "nearest" });
        run.frameKey = frameKey;
        const send = (command, timeoutMs, payload = {}) => transport.send(frameKey, { capability: "base", command, payload }, { timeoutMs });
        const slices = [];
        try {
          let m = await send("captureStart", 10000);
          for (let n = 1; n <= MAX_SLICES; n += 1) {
            if (run.stopped) break;
            setStatus(`${prefix}${t("share.slice", { name: target.name, n })}`);
            await sleep(450);
            const rect = iframe.getBoundingClientRect();
            const bmp = await bitmapOf(await captureTab());
            const k = bmp.width / window.innerWidth;
            const sw = Math.max(1, Math.round(rect.width * k));
            // Only the part of the iframe that is inside the captured image counts (the window may be shorter).
            const visH = Math.max(1, Math.min(rect.height, bmp.height / k - rect.top));
            const sh = Math.max(1, Math.round(visH * k));
            const c = document.createElement("canvas");
            c.width = sw;
            c.height = sh;
            c.getContext("2d").drawImage(bmp, Math.round(rect.left * k), Math.round(rect.top * k), sw, sh, 0, 0, sw, sh);
            bmp.close?.();
            const clipped = Math.max(0, rect.height - visH);
            slices.push({ canvas: c, m: { ...m, scrollerHeight: Math.max(1, (m.scrollerHeight ?? m.viewportHeight) - clipped) }, k, cssWidth: rect.width });
            if (m.done || n === MAX_SLICES) break;
            m = await send("triggerScroll", 8000, { step: Math.max(1, (m.scrollerHeight ?? m.viewportHeight) - clipped - 64) });
          }
        } finally {
          await send("captureEnd", 5000).catch(() => {});
          run.frameKey = null;
        }
        if (run.stopped) return null;
        return stitch(slices);
      } finally {
        restore();
      }
    };

    const stitch = (slices) => {
      if (!slices.length) return null;
      const outW = outputWidth(slices[0].cssWidth);
      const parts = [];
      for (let i = 0; i < slices.length; i += 1) {
        const s = slices[i];
        let cut = 0;
        if (i > 0) {
          const prev = slices[i - 1];
          const est = estimateOverlap(prev.m, s.m, s.canvas.height, s.k);
          const range = searchRange(s.canvas.height);
          const w = s.canvas.width;
          const a = prev.canvas.getContext("2d").getImageData(0, 0, w, prev.canvas.height);
          const b = s.canvas.getContext("2d").getImageData(0, 0, w, s.canvas.height);
          const rowOf = rowFeatures(w);
          cut = est > 0 ? refineOverlap(est, range, prev.canvas.height, s.canvas.height, rowOf, a, b) : 0;
          if (s.m.done && est <= 0) cut = 0;
        }
        parts.push({ canvas: s.canvas, top: cut });
      }
      const scale = outW / slices[0].canvas.width;
      const total = parts.reduce((n, p) => n + Math.round((p.canvas.height - p.top) * scale), 0);
      const fit = fitScale(outW, total);
      const out = document.createElement("canvas");
      out.width = Math.round(outW * fit);
      out.height = Math.max(1, Math.round(total * fit));
      const g = out.getContext("2d");
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, out.width, out.height);
      let y = 0;
      for (const p of parts) {
        const hh = (p.canvas.height - p.top) * scale * fit;
        g.drawImage(p.canvas, 0, p.top, p.canvas.width, p.canvas.height - p.top, 0, y, out.width, hh);
        y += hh;
      }
      return out;
    };

    const compose = (shots) => {
      if (shots.length === 1) return shots[0].canvas;
      const layout = composeLayout(shots.map((s) => ({ w: s.canvas.width, h: s.canvas.height })), opts.direction);
      const fit = fitScale(layout.width, layout.height);
      const out = document.createElement("canvas");
      out.width = Math.max(1, Math.round(layout.width * fit));
      out.height = Math.max(1, Math.round(layout.height * fit));
      const g = out.getContext("2d");
      g.scale(fit, fit);
      g.fillStyle = BG;
      g.fillRect(0, 0, layout.width, layout.height);
      shots.forEach((s, i) => {
        const it = layout.items[i];
        g.fillStyle = BG;
        g.fillRect(it.x, it.y, it.w, TITLE_H);
        g.fillStyle = FG;
        g.font = `600 ${Math.max(12, Math.round(TITLE_H * 0.42))}px system-ui, sans-serif`;
        g.textBaseline = "middle";
        g.fillText(s.name, it.x + 16, it.y + TITLE_H / 2, Math.max(10, it.w - 32));
        g.drawImage(s.canvas, it.x, it.y + TITLE_H, it.w, it.h);
      });
      return out;
    };

    const toBlob = (canvas, type, quality) => new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), type, quality));

    const runImage = async (targets, run) => {
      setStatus(t("share.waitStable"));
      document.body.classList.add("share-capturing");
      try {
        const shots = [];
        for (const [i, target] of targets.entries()) {
          if (run.stopped) break;
          const prefix = targets.length > 1 ? `${t("share.progress", { i: i + 1, n: targets.length })} ` : "";
          setStatus(`${prefix}${t("share.waitStable")}`);
          const canvas = await longShot(target, run, prefix);
          if (canvas) shots.push({ canvas, name: target.name });
        }
        if (run.stopped) return;
        if (!shots.length) throw new Error(t("share.noImage"));
        const canvas = compose(shots);
        const jpegBlob = await toBlob(canvas, "image/jpeg", 0.7);
        setResult({ kind: "image", canvas, jpegBlob, url: URL.createObjectURL(jpegBlob) });
        setStatus(t("share.done", { n: shots.length }));
      } finally {
        document.body.classList.remove("share-capturing");
      }
    };

    // ------------------------------------------------------------ text capture
    const runText = async (targets, run) => {
      setStatus(t("share.collectingText"));
      await summary()?.collector?.cancelBackground?.();
      const sections = [];
      for (const [i, target] of targets.entries()) {
        if (run.stopped) break;
        setStatus(t("share.progress", { i: i + 1, n: targets.length }));
        const tab = workspace.tab(target.tabId);
        const frameKey = tab?.frameKey;
        const section = { name: target.name, title: "", href: tab?.href ?? target.href ?? "", messages: [], error: "" };
        sections.push(section);
        if (!frameKey || !workspace.iframeOf(target.tabId) || !frames.isRegistered(frameKey)) {
          section.error = t("share.notLoaded", { name: target.name });
          continue;
        }
        try {
          const meta = await transport.send(frameKey, { capability: "base", command: "getPageMeta", payload: {} }, { timeoutMs: 2500 }).catch(() => null);
          section.title = meta?.title ?? "";
          section.href = meta?.href || section.href;
          const runId = `share-${Math.random().toString(36).slice(2, 10)}`;
          run.runId = runId;
          run.frameKey = frameKey;
          const src = summary() ? await summary().collectTarget({ ...target, frameKey, href: section.href }, { userInitiated: true, runId }) : null;
          run.runId = null;
          if (run.stopped) break;
          if (src?.status === "ok" && src.messages?.length) section.messages = src.messages;
          else {
            const text = await transport.send(frameKey, { capability: "base", command: "getPageText", payload: {} }, { timeoutMs: 2500 });
            if (String(text ?? "").trim()) section.messages = [{ role: "page", text: String(text).trim() }];
          }
        } catch (error) {
          section.error = String(error?.message || error);
        }
      }
      if (run.stopped) return;
      const text = shareText(sections);
      if (!sections.some((s) => s.messages.length)) throw new Error(t("share.noText"));
      setResult({ kind: "text", text });
      setStatus(t("share.done", { n: sections.filter((s) => s.messages.length).length }));
    };

    const start = async () => {
      if (running) return;
      const targets = resolveTargets();
      if (!targets.length) {
        setStatus(t("share.noTargets"), true);
        return;
      }
      const run = { stopped: false, frameKey: null, runId: null };
      running = run;
      setResult(null);
      try {
        if (opts.format === "image") await runImage(targets, run);
        else await runText(targets, run);
      } catch (error) {
        if (!run.stopped) {
          setStatus(String(error?.message || error), true);
          ctx.reportAnomaly({ feature: "share", operation: opts.format === "image" ? "captureImage" : "collectText", message: String(error?.message || error) });
        }
      } finally {
        running = null;
        if (run.stopped) setStatus(t("share.stopped"));
        render();
      }
    };
    const stop = async () => {
      const run = running;
      if (!run) return;
      run.stopped = true;
      if (run.frameKey && run.runId) await transport.send(run.frameKey, { capability: "summary", command: "cancelSummaryCollection", payload: { runId: run.runId } }, { timeoutMs: 1500 }).catch(() => {});
      else if (run.frameKey) await transport.send(run.frameKey, { capability: "base", command: "captureEnd", payload: {} }, { timeoutMs: 5000 }).catch(() => {});
    };

    // ------------------------------------------------------------ outputs
    const copy = async () => {
      try {
        if (result?.kind === "image") {
          if (typeof ClipboardItem === "undefined") throw new Error(t("share.noImageClipboard"));
          const png = await toBlob(result.canvas, "image/png");
          await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
        } else if (result?.kind === "text") await navigator.clipboard.writeText(result.text);
        else return;
        shellUi.toast(t("share.copied"), "success");
      } catch (error) {
        shellUi.toast(String(error?.message || t("share.copyFailed")), "error");
        ctx.reportAnomaly({ feature: "share", operation: "copy", message: String(error?.message || error) });
      }
    };
    const download = () => {
      try {
        const blob = result?.kind === "image" ? result.jpegBlob : new Blob([result.text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = h("a", { attrs: { href: url, download: shareFileName(result.kind === "image" ? "jpg" : "txt") } });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      } catch (error) {
        ctx.reportAnomaly({ feature: "share", operation: "download", message: String(error?.message || error) });
      }
    };
    const openImage = async () => {
      let url = null;
      try {
        url = URL.createObjectURL(result.jpegBlob);
        await chrome.tabs.create({ url });
      } catch (error) {
        if (url) URL.revokeObjectURL(url);
        shellUi.toast(t("share.openFailed"), "error");
        ctx.reportAnomaly({ feature: "share", operation: "open", message: String(error?.message || error) });
      }
    };

    // ------------------------------------------------------------ panel
    const lockable = (el) => {
      if (running) el.setAttribute("aria-disabled", "true");
      return el;
    };
    const render = () => {
      if (!els) return;
      const busy = !!running;
      clear(els.options);
      const row = (labelKey, control) => h("div.cc-share-row", h("span", t(labelKey)), lockable(control));
      els.options.append(
        row("share.format", ui.segmented({ value: opts.format, options: [{ value: "image", label: t("share.format.image") }, { value: "text", label: t("share.format.text") }], onChange: (v) => {
          opts.format = v;
          setResult(null);
          setStatus("");
        } })),
        row("share.scope", ui.segmented({ value: opts.scope, options: ["current", "selected", "all"].map((v) => ({ value: v, label: t(`share.scope.${v}`) })), onChange: (v) => {
          opts.scope = v;
          render();
        } })),
      );
      if (opts.format === "image") {
        els.options.append(row("share.direction", ui.segmented({ value: opts.direction, options: ["vertical", "horizontal"].map((v) => ({ value: v, label: t(`share.direction.${v}`) })), onChange: (v) => (opts.direction = v) })));
      }
      if (opts.scope === "selected") {
        const tabs = allTabs();
        if (!opts.selected) opts.selected = new Set(tabs.filter((x) => x.visible).map((x) => x.key));
        const box = h("div.cc-share-targets");
        if (!tabs.length) box.append(h("span.cc-share-hint", t("share.noTargets")));
        for (const x of tabs) {
          const cb = h("input", { type: "checkbox", checked: opts.selected.has(x.key) });
          cb.addEventListener("change", () => (cb.checked ? opts.selected.add(x.key) : opts.selected.delete(x.key)));
          box.append(h("label", cb, h("span", x.name), h("span.state", t(x.visible ? "share.visible" : "share.hidden"))));
        }
        els.options.append(lockable(box));
      }
      els.options.append(h("div.cc-share-hint", t(opts.format === "image" ? "share.hint.image" : "share.hint.text")));

      clear(els.actions);
      els.actions.append(
        busy
          ? ui.button({ label: t("share.stop"), icon: "x", variant: "danger-solid", onClick: () => stop() })
          : ui.button({ label: t("share.capture"), icon: opts.format === "image" ? "preview" : "copy", variant: "primary", onClick: () => start() }),
        ui.button({ label: t("share.copy"), icon: "copy", disabled: busy || !result, onClick: () => copy() }),
        ui.button({ label: t("share.download"), icon: "download", disabled: busy || !result, onClick: () => download() }),
        ...(opts.format === "image" ? [ui.button({ label: t("share.open"), icon: "external", disabled: busy || result?.kind !== "image", onClick: () => openImage() })] : []),
      );
      els.status.textContent = status.text;
      els.status.classList.toggle("error", !!status.error);

      clear(els.preview);
      if (opts.format === "image") {
        if (result?.kind === "image") els.preview.append(h("img", { attrs: { src: result.url, alt: t("share.title") } }));
        else els.preview.append(h("div.empty", t("share.noImage")));
      } else {
        els.preview.append(h("textarea", { readOnly: true, value: result?.kind === "text" ? result.text : "", placeholder: t("share.noText") }));
      }
    };

    const readRect = () => {
      try {
        return JSON.parse(localStorage.getItem(RECT_KEY) || "null");
      } catch {
        return null;
      }
    };
    const open = () => {
      if (handle?.isOpen()) return handle;
      if (!hasConversation() && !allTabs().length) return null;
      els = { options: h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } }), actions: h("div.cc-share-actions"), status: h("div.cc-share-status"), preview: h("div.cc-share-preview") };
      const body = h("div.cc-share", els.options, els.actions, els.status, els.preview);
      handle = shellUi.openFloatingPanel({
        id: "share",
        title: t("share.title"),
        icon: "share",
        body,
        width: Math.min(720, window.innerWidth - 32),
        height: Math.min(720, window.innerHeight - 48),
        top: 64,
        center: true,
        rect: readRect(),
        minWidth: 420,
        minHeight: 420,
        onRect: (rect) => {
          try {
            localStorage.setItem(RECT_KEY, JSON.stringify(rect));
          } catch {
            // ignore
          }
        },
        maximizeTip: () => t("common.maximize"),
        onClose: () => {
          if (running) stop();
          handle?.setMaximized?.(false);
          handle = null;
          els = null;
        },
      });
      render();
      return handle;
    };

    ctx.contribute("topbar.item", {
      id: "share",
      variant: "action",
      labelKey: "share.title",
      icon: "share",
      tipId: "topbar.share",
      shortcutAction: "openSharePanel",
      disabled: () => !hasConversation(),
      onClick: () => open(),
    });
    ctx.events.on("Workspace:changed", () => ctx.services.get("topbar")?.refresh?.());
    ctx.contribute("shortcut.action", { id: "openSharePanel", labelKey: "share.shortcut", run: () => (hasConversation() ? open() : null) });
    ctx.contribute("panel", { id: "share", open: () => open(), close: () => handle?.close("api"), isOpen: () => !!handle?.isOpen(), escapeCloses: true });
    ctx.contribute("fullscreen.target", { id: "share", order: 10, isOpen: () => !!handle?.isOpen(), toggle: () => handle?.toggleMaximized() });
    ctx.services.provide("share", { open, isOpen: () => !!handle?.isOpen(), capture: start, stop, result: () => result });
  },
};
