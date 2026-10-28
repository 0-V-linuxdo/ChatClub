// PromptHistory: send history, ↑/↓ navigation, the history window with matched site conversations,
// right-click quick save and the settings section (v2 03 §6).

import { h, clear, icon } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { renderMarkdown } from "../../lib/markdown.js";
import { openWindowViewer } from "../../lib/window-viewer.js";
import { settingsTable } from "../../lib/settings-table.js";
import { normalizeHistory, addToHistory, dateBucket, filterHistory, matchConversations, userMessagesAsItems } from "./model.js";

const KEY = "promptSendHistory";
const SIZE_KEY = "chatclub.historyPanelSize.v1";
const BUCKETS = ["today", "yesterday", "lastWeek", "lastMonth", "earlier"];

const STYLE = String.raw`
.cc-history-clusters { display: flex; flex-direction: column; gap: 16px; }
.cc-history-row { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 4px; }
.cc-history-card { flex: none; display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); overflow: hidden; }
.cc-history-card .card-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--line); }
.cc-history-card .card-head img, .cc-history-card .card-head .letter { width: 18px; height: 18px; border-radius: 4px; flex: none; }
.cc-history-card .card-head .letter { display: inline-grid; place-items: center; font-size: 10px; font-weight: 700; background: var(--primary); color: #fff; border-radius: 50%; }
.cc-history-card .card-title { flex: 1; min-width: 0; font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cc-history-card .card-body { flex: 1; min-height: 0; overflow: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; }
.cc-history-card .part-head { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; }
.cc-history-card .user-text, .cc-history-prompt { white-space: pre-wrap; font-size: 13.5px; }
.cc-history-prompt.standalone { padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel-2); max-height: 40%; overflow: auto; overflow-wrap: anywhere; }
.cc-wv-empty.cc-history-empty { height: auto; min-height: 160px; flex: 1; }
.cc-history-bucket { margin: 10px 6px 4px; font-size: 11.5px; font-weight: 600; color: var(--muted); }
.cc-history-search { flex: 1; max-width: 420px; position: relative; display: flex; align-items: center; }
.cc-history-search input { width: 100%; padding-left: 30px; padding-right: 28px; }
.cc-history-search .lead { position: absolute; left: 9px; color: var(--muted); display: inline-flex; }
.cc-history-search .clear { position: absolute; right: 4px; }
.cc-history-ops { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.cc-history-thumbs { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.cc-history-thumbs img { width: 96px; height: 96px; object-fit: cover; border-radius: 8px; border: 1px solid var(--line); }
.cc-history-loading { display: flex; align-items: center; gap: 8px; color: var(--muted); margin: 4px 0 14px; }
`;

export default {
  start(ctx) {
    const t = ctx.t;
    const shellUi = ctx.services.get("ui");
    const workspace = ctx.services.get("workspace");
    const composer = () => ctx.services.get("composer");
    const summary = () => ctx.services.get("summary");
    const fullText = () => ctx.services.get("fullText");
    const pocket = () => ctx.services.get("pocket");
    ctx.styles.register("prompt-history", STYLE);

    // ------------------------------------------------------------ data (serialized writes)
    let items = [];
    const listeners = new Set();
    const notify = () => {
      for (const fn of listeners) fn();
      viewer?.refresh();
    };
    const load = async () => {
      items = normalizeHistory(await ctx.storage.get(KEY));
      return items;
    };
    let writing = Promise.resolve();
    /** Applies `fn(current)` on the freshest stored list, one write at a time. */
    const update = (fn) => {
      writing = writing.then(async () => {
        await load();
        items = normalizeHistory(fn(items));
        await ctx.storage.set(KEY, items);
      }).catch((error) => ctx.logger.warn("Saving send history failed:", error)).then(notify);
      return writing;
    };
    const ready = load().then(notify);
    ctx.storage.onChanged?.(KEY, () => load().then(notify));

    ctx.onDispose(ctx.events.on("Composer:accepted", (payload) => {
      const text = String(payload?.text ?? "");
      const images = (payload?.images ?? []).map(({ name, type, size, dataUrl }) => ({ name, type, size, dataUrl }));
      if (!text.trim() && !images.length) return;
      fullText()?.notePrompt?.(text, (payload.targets ?? []).map((tg) => tg.tabId));
      update((list) => addToHistory(list, { id: `history-${Math.random().toString(36).slice(2, 12)}`, text, images, createdAt: new Date().toISOString() }));
    }));

    // ------------------------------------------------------------ ↑/↓ navigation (03 §6.2)
    let nav = null; // { index, stash, shown }
    ctx.contribute("composer.keyHandler", {
      id: "PromptHistory:navigate",
      onKeyDown(event, cctx) {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return false;
        if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
        const ta = event.target;
        if (!ta || ta.tagName !== "TEXTAREA" || ta.selectionStart !== ta.selectionEnd) return false;
        const c = cctx.composer;
        if (nav && c.getDraft().text !== nav.shown) nav = null; // the user edited: leave history
        const value = ta.value;
        if (event.key === "ArrowUp") {
          if (value.slice(0, ta.selectionStart).includes("\n")) return false;
          const next = nav ? nav.index + 1 : 0;
          if (next >= items.length) return !!nav;
          if (!nav) nav = { index: -1, stash: c.getDraft(), shown: "" };
          nav.index = next;
        } else {
          if (!nav || value.slice(ta.selectionEnd).includes("\n")) return false;
          nav.index -= 1;
        }
        if (nav.index < 0) {
          const stash = nav.stash;
          nav = null;
          c.setDraft({ text: stash.text, images: stash.images });
          return true;
        }
        const item = items[nav.index];
        nav.shown = item.text;
        c.setDraft({ text: item.text, images: item.images.map((x) => ({ ...x })) });
        return true;
      },
    });

    // ------------------------------------------------------------ matched conversations
    const liveCache = { at: 0, workspaceId: null, sources: [] };
    const fromFrames = (frames) => (frames ?? []).map((f) => ({ appId: f.appId, appName: f.appName, logoUrl: f.logoUrl, href: f.href, title: f.title, messages: f.messages }));
    const storedSources = async () => {
      const out = [];
      try {
        for (const r of (await fullText()?.exportAll?.()) ?? []) out.push(...fromFrames(r.frames));
      } catch {
        // ignore
      }
      for (const e of pocket()?.entries?.() ?? []) {
        out.push({ appId: e.appId, appName: e.appName, logoUrl: e.logoUrl, href: e.chatUrl, title: e.title, messages: [{ role: "user", text: e.userMessage }, { role: "assistant", text: e.assistantMessage }] });
      }
      return out;
    };
    /** Current tabs: a stored frame whose mark matches the live ledger, else a live collection (04 §5.9). */
    const liveSources = async () => {
      const wsId = workspace?.workspaceId?.();
      if (!summary() || !wsId) return [];
      if (liveCache.workspaceId === wsId && Date.now() - liveCache.at < 60000) return liveCache.sources;
      const out = [];
      const toCollect = [];
      for (const target of summary().collector.targets()) {
        const fresh = await fullText()?.freshFrame?.(target).catch?.(() => null);
        if (fresh) out.push(...fromFrames([fresh]));
        else toCollect.push(target);
      }
      const collected = [];
      for (const target of toCollect) {
        const s = await summary().collectTarget(target, { userInitiated: true });
        if (s.status === "ok") collected.push(s);
      }
      if (collected.length && fullText()?.enabled?.()) fullText().recordSources(collected, { mark: "fresh" }).catch?.(() => {});
      out.push(...collected.map((s) => ({ appId: s.appId, appName: s.brand, logoUrl: s.logoUrl, href: s.href, title: s.title, messages: s.messages })));
      Object.assign(liveCache, { at: Date.now(), workspaceId: wsId, sources: out });
      return out;
    };
    const matches = new Map(); // item id -> { loading, clusters }
    const loadMatches = async (item) => {
      if (!item) return;
      const known = matches.get(item.id);
      if (known && (known.loading || known.done)) return;
      const entry = { loading: true, done: false, clusters: [] };
      matches.set(item.id, entry);
      viewer?.refreshMain();
      try {
        entry.clusters = matchConversations(item.text, await storedSources());
        viewer?.refreshMain();
        const live = await liveSources();
        entry.clusters = matchConversations(item.text, [...live, ...(await storedSources())]);
      } catch (error) {
        ctx.logger.warn("Matching conversations failed:", error);
      } finally {
        entry.loading = false;
        entry.done = true;
        viewer?.refreshMain();
      }
    };

    // ------------------------------------------------------------ actions
    const insert = (item) => {
      if (!item || !composer()) return;
      composer().setDraft({ text: item.text, images: item.images.map((x) => ({ ...x })) }, { caret: "end" });
      shellUi.toast(t("history.inserted"), "success");
      viewer?.close();
    };
    const remove = (item) => {
      const index = items.findIndex((x) => x.id === item.id);
      if (index < 0) return;
      update((list) => list.filter((x) => x.id !== item.id));
      shellUi.toast(t("history.deleted"), "success", {
        action: {
          label: t("history.undo"),
          onClick: () => {
            update((list) => {
              const next = [...list];
              next.splice(Math.min(index, next.length), 0, item);
              return next;
            });
            shellUi.toast(t("history.restored"), "success");
          },
        },
      });
    };
    const saveToPocket = async (item) => {
      const m = matches.get(item.id);
      const sources = (m?.clusters ?? []).map((c, order) => ({
        key: c.key,
        appId: c.appId,
        href: c.href,
        title: c.title,
        brand: c.appName,
        name: c.appName,
        logoUrl: c.logoUrl,
        order,
        messages: c.pairs.flatMap((p) => [{ role: "user", text: p.user }, { role: "assistant", text: p.assistant }]),
      }));
      if (!pocket()) return;
      await pocket().saveSources(sources, { noneKey: "pocket.history.none" });
    };
    const clearAll = () => shellUi.confirm({
      title: t("history.clear.title"),
      description: t("history.clear.desc"),
      confirmText: t("history.clear"),
      danger: true,
      onConfirm: async () => {
        await update(() => []);
        shellUi.toast(t("history.cleared"), "success");
      },
    });

    let quickBusy = false;
    /** Right click on the History button: user messages of this workspace into history (03 §6.4). */
    const quickSave = async (btn) => {
      if (quickBusy) return;
      quickBusy = true;
      btn?.setAttribute("aria-busy", "true");
      try {
        let sources = [];
        const live = (await summary()?.collectAll({ userInitiated: true })) ?? [];
        const ok = live.filter((s) => s.status === "ok");
        if (ok.length && fullText()?.enabled?.()) fullText().recordSources(ok, { mark: "fresh" }).catch?.(() => {});
        sources = ok;
        if (!sources.length) sources = fromFrames(await fullText()?.framesFor?.(workspace.workspaceId()));
        const users = sources.flatMap((s) => (s.messages ?? []).filter((m) => m.role === "user" && String(m.text).trim()).map((m) => String(m.text).trim()));
        if (!users.length) {
          shellUi.toast(t("history.quick.none"), "error");
          return;
        }
        await ready;
        const fresh = userMessagesAsItems(sources, items);
        if (fresh.length) await update((list) => [...fresh, ...list]);
        const texts = new Set(users);
        const batch = items.filter((x) => texts.has(x.text.trim()));
        shellUi.toast(fresh.length ? t("history.quick.saved", { n: fresh.length }) : t("history.quick.refreshed", { n: batch.length }), "success");
        if (viewer?.isOpen() && batch.length) {
          activeId = batch[0].id;
          query = "";
          for (const x of batch) matches.delete(x.id);
          viewer.refresh();
          loadMatches(current());
        }
      } catch (error) {
        ctx.logger.warn("History quick save failed:", error);
        shellUi.toast(t("history.quick.none"), "error");
      } finally {
        quickBusy = false;
        btn?.removeAttribute("aria-busy");
      }
    };

    // ------------------------------------------------------------ viewer
    let viewer = null;
    let activeId = null;
    let query = "";
    let opsOpen = false;
    let sidebarCollapsed = false;
    const visible = () => filterHistory(items, query);
    const current = () => {
      const list = visible();
      return list.find((x) => x.id === activeId) ?? list[0] ?? null;
    };
    const fmtTime = (iso) => {
      const d = new Date(iso);
      return Number.isFinite(d.getTime()) ? d.toLocaleString() : "";
    };
    const firstLine = (s) => String(s ?? "").split("\n").find((l) => l.trim())?.trim() ?? "";
    const logo = (url, name) => {
      const letter = h("span.letter", (name || "?").slice(0, 1));
      if (!url) return letter;
      const img = h("img", { attrs: { src: url, alt: "" } });
      img.addEventListener("error", () => img.replaceWith(h("span.letter", (name || "?").slice(0, 1))), { once: true });
      return img;
    };
    const copyText = async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        shellUi.toast(t("history.copied"), "success");
      } catch {
        shellUi.toast(t("history.copyFailed"), "error");
      }
    };
    const cardSize = () => {
      const v = ctx.host.plugins?.Pocket?.settings?.store?.pocketCardSize ?? {};
      const w = Number(v.width);
      const hh = Number(v.height);
      return { width: w >= 360 && w <= 760 ? w : 460, height: hh >= 420 && hh <= 820 ? hh : 560 };
    };
    const card = (cluster, pair) => {
      const size = cardSize();
      return h("article.cc-history-card", { style: { width: `${size.width}px`, height: `${size.height}px` } },
        h("div.card-head", logo(cluster.logoUrl, cluster.appName), h("span.card-title", { attrs: { title: cluster.href } }, cluster.appName || cluster.title || cluster.href)),
        h("div.card-body",
          h("section", h("div.part-head", t("history.user"), h("span", { style: { flex: "1" } }), ui.iconButton({ icon: "copy", compact: true, label: t("history.copy"), onClick: () => copyText(pair.user) })), h("div.user-text", pair.user)),
          h("section", h("div.part-head", t("history.assistant"), h("span", { style: { flex: "1" } }), ui.iconButton({ icon: "copy", compact: true, label: t("history.copy"), onClick: () => copyText(pair.assistant) })), renderMarkdown(pair.assistant))));
    };

    const renderSidebar = (el) => {
      if (!items.length) {
        el.append(h("div.cc-wv-empty-side", t("history.empty.side")));
        return;
      }
      const list = visible();
      if (!list.length) {
        el.append(h("div.cc-wv-empty-side", t("history.noMatch")));
        return;
      }
      const cur = current();
      let bucket = null;
      for (const x of list) {
        const b = dateBucket(x.createdAt);
        if (b !== bucket) {
          bucket = b;
          el.append(h("div.cc-history-bucket", t(`history.bucket.${b}`)));
        }
        el.append(h("button.cc-wv-item", { type: "button", attrs: { "aria-current": String(x === cur) }, onclick: () => {
          activeId = x.id;
          opsOpen = false;
          viewer.refresh();
          loadMatches(x);
        } },
        h("span.line1", firstLine(x.text) || t("history.imagesOnly")),
        h("span.line2", h("span.txt", [x.images.length ? t("history.images", { n: x.images.length }) : "", fmtTime(x.createdAt)].filter(Boolean).join(" · ")))));
      }
    };
    let searchInput = null;
    let focusSearch = false;
    let searchHasFocus = false;
    const renderMainHead = (el) => {
      const cur = current();
      // The head is redrawn on every refresh: keep the caret in the search box (it gets it on open).
      // The old box is already detached here, so whether it had focus is tracked by its own events.
      const keepFocus = focusSearch || searchHasFocus;
      searchInput = h("input.cc-input", { type: "search", value: query, placeholder: t("history.search"), attrs: { "aria-label": t("history.search"), autofocus: "" } });
      {
        const input = searchInput;
        input.addEventListener("focus", () => (searchHasFocus = true));
        // Removal blurs the box while it is still attached; only a blur that leaves it in place counts.
        input.addEventListener("blur", () => queueMicrotask(() => {
          if (input.isConnected) searchHasFocus = false;
        }));
      }
      if (keepFocus) {
        const input = searchInput;
        requestAnimationFrame(() => {
          if (!input.isConnected) return;
          input.focus({ preventScroll: true });
          input.setSelectionRange?.(input.value.length, input.value.length);
          focusSearch = false;
        });
      }
      const clearBtn = ui.iconButton({ icon: "x", compact: true, label: t("history.searchClear"), className: "clear", onClick: () => {
        query = "";
        searchInput.value = "";
        viewer.refreshSidebar();
        viewer.refreshMain();
        clearBtn.hidden = true;
      } });
      clearBtn.hidden = !query;
      searchInput.addEventListener("input", () => {
        query = searchInput.value;
        clearBtn.hidden = !query;
        viewer.refreshSidebar();
        viewer.refreshMain();
      });
      const opsBtn = ui.button({ label: t("history.actions"), icon: "menu", disabled: !cur, onClick: () => {
        opsOpen = !opsOpen;
        viewer.refreshMain();
        opsBtn.setAttribute("aria-expanded", String(opsOpen));
      } });
      opsBtn.setAttribute("aria-expanded", String(opsOpen));
      el.append(
        h("div.head-text", h("div.head-title", cur ? firstLine(cur.text) || t("history.imagesOnly") : t("history.title")), h("div.head-sub", cur ? fmtTime(cur.createdAt) : "")),
        h("div.cc-history-search", h("span.lead", icon("search", { size: 14 })), searchInput, clearBtn),
        opsBtn);
    };
    const renderMain = (el) => {
      const cur = current();
      if (!cur) {
        el.append(h("div.cc-wv-empty", icon("history", { size: 32 }), h("strong", t("history.empty.title")), h("span", t("history.empty.desc"))));
        return;
      }
      if (opsOpen) {
        el.append(h("div.cc-history-ops",
          ui.button({ label: t("history.saveToPocket"), icon: pocket()?.iconName?.() ?? "star", onClick: () => saveToPocket(cur) }),
          ui.button({ label: t("history.insert"), icon: "insert", onClick: () => insert(cur) }),
          ui.button({ label: t("history.delete"), icon: "trash", className: "danger", onClick: () => remove(cur) })));
      }
      const m = matches.get(cur.id);
      if (!m) queueMicrotask(() => loadMatches(cur));
      if (!m || m.loading) el.append(h("div.cc-history-loading", h("span.cc-spinner"), t("history.matching")));
      const clusters = m?.clusters ?? [];
      if (clusters.length) {
        const box = h("div.cc-history-clusters");
        for (const c of clusters) box.append(h("section", h("div.cc-history-row", c.pairs.map((p) => card(c, p)))));
        el.append(box);
      } else if (m && !m.loading) {
        el.append(h("div.cc-history-prompt.standalone", cur.text),
          ...(cur.images.length ? [h("div.cc-history-thumbs", cur.images.map((img) => h("img", { attrs: { src: img.dataUrl, alt: img.name, title: img.name } })))] : []),
          h("div.cc-wv-empty.cc-history-empty", h("span", t("history.noConversations"))));
      }
    };

    const openViewer = async () => {
      if (viewer?.isOpen()) return viewer;
      await ready;
      opsOpen = false;
      matches.clear();
      focusSearch = true;
      searchHasFocus = false;
      viewer = openWindowViewer(ctx, {
        key: "history",
        sizeKey: SIZE_KEY,
        focusable: true,
        collapsed: { get: () => sidebarCollapsed, set: (v) => (sidebarCollapsed = v) },
        titleIcon: () => h("span.cc-wv-title-icon", icon("history", { size: 18 })),
        title: () => t("history.title"),
        sidebarTitle: () => t("history.title"),
        renderSidebar,
        renderMainHead,
        renderMain,
        onClose: () => {
          viewer = null;
        },
      });
      viewer.refresh();
      return viewer;
    };

    // ------------------------------------------------------------ contributions
    ctx.contribute("topbar.item", {
      id: "history",
      variant: "action",
      labelKey: "history.title",
      icon: "history",
      tipId: "topbar.history",
      shortcutAction: "openHistoryPanel",
      onClick: () => openViewer(),
      onContextMenu: (event, item) => {
        event.preventDefault();
        quickSave(item?.anchor ?? event.currentTarget);
      },
    });
    ctx.contribute("shortcut.action", { id: "openHistoryPanel", labelKey: "history.shortcut", run: () => openViewer() });
    ctx.contribute("panel", { id: "history", open: () => openViewer(), close: () => viewer?.close(), isOpen: () => !!viewer?.isOpen(), escapeCloses: true });
    ctx.contribute("fullscreen.target", { id: "history", order: 30, isOpen: () => !!viewer?.isOpen(), toggle: () => viewer?.toggleFullscreen() });
    ctx.contribute("dataTransfer", {
      id: "promptSendHistory",
      labelKey: "history.transfer",
      modes: [{ value: "merge", labelKey: "io.mode.merge" }, { value: "replace", labelKey: "io.mode.replace" }],
      export: async () => normalizeHistory(await ctx.storage.get(KEY)),
      import: async (data, mode) => update((list) => (mode === "replace" ? data : [...list, ...(Array.isArray(data) ? data : [])])),
      reset: async () => update(() => []),
    });
    ctx.contribute("settings.section", {
      id: "promptHistory",
      titleKey: "history.section.title",
      descKey: "history.section.desc",
      icon: "history",
      order: 100,
      group: "prompts",
      render(container, sctx) {
        const box = h("div");
        const draw = () => {
          clear(box);
          box.append(ui.card({
            title: t("history.title"),
            body: h("div",
              h("p", { style: { color: "var(--muted)", margin: "0 0 6px" } }, t("history.section.cardDesc")),
              h("p", { style: { color: "var(--muted)", margin: "0 0 10px" } }, t("history.section.note")),
              settingsTable({
                t,
                rows: items,
                empty: t("history.empty.side"),
                columns: [
                  { label: t("history.col.time"), width: "minmax(140px, 180px)", render: (x) => h("span", fmtTime(x.createdAt)) },
                  { label: t("history.col.prompt"), width: "minmax(160px, 1fr)", render: (x) => h("span.cell-ellipsis", { attrs: { title: x.text } }, x.text.replace(/\s+/g, " ") || t("history.images", { n: x.images.length })) },
                ],
                actions: (x) => [
                  composer() ? ui.iconButton({ icon: "insert", label: t("history.insert"), tipId: "settings.action.insert", onClick: () => insert(x) }) : null,
                  ui.iconButton({ icon: "trash", label: t("history.delete"), tipId: "settings.action.delete", className: "danger", onClick: () => remove(x) }),
                ],
              }),
              items.length ? h("div", { style: { marginTop: "12px" } }, ui.button({ label: t("history.clear"), icon: "trash", className: "danger", onClick: () => clearAll() })) : null),
          }));
        };
        listeners.add(draw);
        draw();
        sctx.onDispose(() => listeners.delete(draw));
        container.append(box);
      },
    });

    ctx.services.provide("promptHistory", {
      list: () => items.map((x) => ({ ...x })),
      open: openViewer,
      isOpen: () => !!viewer?.isOpen(),
      quickSave,
    });
  },
};
