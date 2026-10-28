// Pocket (page): saving batches, the window viewer, opening chats and restoring a batch (v2 04 §3).

import { h, clear, icon } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { renderMarkdown } from "../../lib/markdown.js";
import { openWindowViewer } from "../../lib/window-viewer.js";
import { hostMatchesList } from "../../lib/conversation.js";
import { normalizeList, buildBatch, groupBatches, clusters, normalizeCardSize, restorePlan, restorableUrl, mergeImport, POCKET_LIMIT } from "./model.js";

const ACTIVE_KEY = "chatclub.pocketActiveGroupId.v1";
const SIZE_KEY = "chatclub.pocketPanelSize.v1";

const POCKET_STYLE = String.raw`
.cc-pocket-clusters { display: flex; flex-direction: column; gap: 16px; }
.cc-pocket-cluster .shared-q { font-weight: 600; margin: 0 0 8px; white-space: pre-wrap; }
.cc-pocket-row { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 4px; }
.cc-pocket-card { flex: none; display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); overflow: hidden; }
.cc-pocket-card .card-head { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--line); }
.cc-pocket-card .card-head img, .cc-pocket-card .card-head .letter { width: 18px; height: 18px; border-radius: 4px; flex: none; margin-top: 1px; }
.cc-pocket-card .card-head .letter { display: inline-grid; place-items: center; font-size: 10px; font-weight: 700; background: var(--primary); color: #fff; border-radius: 50%; }
.cc-pocket-card .card-title { font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cc-pocket-card .card-link { all: unset; cursor: pointer; display: block; font-size: 11.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.cc-pocket-card .card-link:hover { color: var(--primary); text-decoration: underline; }
.cc-pocket-card .card-body { flex: 1; min-height: 0; overflow: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; }
.cc-pocket-card .part-head { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; }
.cc-pocket-card .user-text { white-space: pre-wrap; font-size: 13.5px; }
.cc-pocket-ops { display: flex; flex-direction: column; gap: 10px; padding: 12px; margin-bottom: 14px; border: 1px solid var(--line); border-radius: 8px; max-width: 520px; }
.cc-pocket-ops label { display: grid; grid-template-columns: 90px 1fr 56px; align-items: center; gap: 10px; font-size: 13px; }
`;

export default {
  start(ctx) {
    ctx.contribute("appearance.field", {
      id: "Pocket:icon",
      group: "Appearance:general",
      order: 60,
      render(container) {
        container.append(ui.field({
          label: ctx.t("appearance.pocketIcon"),
          desc: ctx.t("appearance.pocketIcon.desc"),
          control: ui.segmented({
            value: ctx.settings.pocketIcon === "pocket" ? "pocket" : "star",
            options: [{ value: "star", label: ctx.t("appearance.pocketIcon.star") }, { value: "pocket", label: ctx.t("appearance.pocketIcon.pocket") }],
            onChange: (v) => (ctx.settings.pocketIcon = v),
          }),
        }));
      },
    });
    const t = ctx.t;
    const shellUi = ctx.services.get("ui");
    const workspace = ctx.services.get("workspace");
    const apps = ctx.services.get("apps");
    const summary = () => ctx.services.get("summary");
    const fullText = () => ctx.services.get("fullText");
    ctx.styles.register("pocket", POCKET_STYLE);

    let entries = [];
    const load = async () => {
      entries = normalizeList(await ctx.storage.get("pocketHistory"));
      return entries;
    };
    let writing = Promise.resolve();
    const save = (next) => {
      entries = normalizeList(next);
      writing = writing.then(() => ctx.storage.set("pocketHistory", entries)).catch((error) => ctx.logger.warn("Saving Pocket failed:", error));
      viewer?.refresh();
      return writing;
    };
    load();
    ctx.storage.onChanged?.("pocketHistory", () => load().then(() => viewer?.refresh()));

    const iconName = () => (ctx.settings.pocketIcon === "pocket" ? "pocket" : "star");
    const label = () => t(ctx.settings.pocketIcon === "pocket" ? "pocket.name.pocket" : "pocket.name.star");
    const toggleIcon = () => {
      ctx.settings.pocketIcon = ctx.settings.pocketIcon === "pocket" ? "star" : "pocket";
      ctx.services.get("topbar")?.refresh?.();
      ctx.services.get("topbar")?.rerender?.();
      summary()?.refreshPanel?.();
      viewer?.refreshHeader();
      viewer?.refreshMain();
    };

    // ------------------------------------------------------------ saving
    const saveSources = async (sources, { noneKey = "pocket.nothing" } = {}) => {
      try {
        const batch = buildBatch(sources.filter((s) => s.messages?.length), { groups: workspace.groups() });
        if (!batch.length) {
          shellUi.toast(t(noneKey), "error");
          return 0;
        }
        await load();
        await save([...batch, ...entries]);
        const n = entries.filter((e) => e.batchId === batch[0].batchId).length;
        shellUi.toast(t("pocket.saved", { n }), "success");
        return n;
      } catch (error) {
        ctx.logger.warn("Saving to Pocket failed:", error);
        shellUi.toast(t("pocket.nothing"), "error");
        return 0;
      }
    };
    const sourcesFromFrames = (frames) => (frames ?? []).map((f, i) => ({
      key: f.instanceId || `${f.appId}\n${f.href}`,
      instanceId: f.instanceId || "",
      appId: f.appId,
      href: f.href,
      title: f.title,
      brand: f.appName,
      name: f.appName,
      logoUrl: f.logoUrl,
      order: f.order ?? i,
      messages: f.messages,
    }));

    let quickBusy = false;
    /** Right click on the top bar button: collect live, else fall back to this workspace's full text (04 §3.3). */
    const quickSave = async (btn) => {
      if (quickBusy) return;
      quickBusy = true;
      btn?.setAttribute("aria-busy", "true");
      try {
        const live = await summary().collectAll({ userInitiated: true });
        const ok = live.filter((s) => s.status === "ok" && s.messages?.some((m) => m.role === "assistant"));
        if (ok.length && fullText()?.enabled?.()) fullText().recordSources?.(ok, { mark: "fresh" })?.catch?.(() => {});
        let sources = ok;
        if (!sources.length) sources = sourcesFromFrames(await fullText()?.framesFor?.(workspace.workspaceId()));
        await saveSources(sources, { noneKey: "pocket.quick.none" });
      } catch (error) {
        ctx.logger.warn("Pocket quick save failed:", error);
        shellUi.toast(t("pocket.nothing"), "error");
      } finally {
        quickBusy = false;
        btn?.removeAttribute("aria-busy");
      }
    };

    // ------------------------------------------------------------ opening and restoring
    const inferApp = (href) => {
      try {
        const host = new URL(href).hostname;
        return apps.list().find((a) => hostMatchesList(host, a.hosts ?? []))?.id ?? "";
      } catch {
        return "";
      }
    };
    const openChat = (entry) => {
      try {
        const groups = workspace.groups();
        const all = groups.flatMap((g) => g.tabs.map((tb, i) => ({ g, tb, visible: g.activeIndex === i })));
        let hit = all.find((x) => x.tb.id === entry.instanceId);
        if (!hit && entry.appId) hit = all.find((x) => x.tb.appId === entry.appId && x.visible) ?? all.find((x) => x.tb.appId === entry.appId);
        if (!hit) {
          const host = new URL(entry.chatUrl).hostname;
          hit = all.find((x) => {
            try {
              return new URL(x.tb.href).hostname === host;
            } catch {
              return false;
            }
          });
        }
        const url = hit ? restorableUrl(hit.tb.appId, entry.chatUrl) : null;
        if (!hit || !url) throw new Error("no target");
        workspace.setActive(hit.g.id, hit.tb.id);
        if (!workspace.navigateTab(hit.tb.id, url)) throw new Error("navigate failed");
        ctx.services.get("workspaceSession")?.saveNow?.().catch?.(() => {});
        viewer?.close();
      } catch {
        shellUi.toast(t("pocket.openFailed"), "error");
      }
    };
    const restoreBatch = (batch) => {
      const plan = restorePlan(batch.entries, inferApp);
      if (!plan.length) {
        shellUi.toast(t("pocket.openFailed"), "error");
        return;
      }
      const ok = workspace.applySnapshot({
        schemaVersion: 1,
        layout: { type: "temporary", presetId: null, name: t("pocket.restoreLayout"), pocketBatchId: batch.batchId },
        groups: plan.map((tabs) => ({ tabs: tabs.map((x) => ({ appId: x.appId, currentHref: x.url })), activeIndex: 0, temporary: true, pocketBatchId: batch.batchId })),
        fullscreenGroupIndex: null,
        topicTitle: "",
        topicTitleCustom: false,
      }, { reason: "pocket-restore" });
      if (!ok) {
        shellUi.toast(t("pocket.openFailed"), "error");
        return;
      }
      ctx.services.get("workspaceSession")?.saveNow?.().catch?.(() => {});
      const first = batch.entries.find((e) => e.userMessage.trim())?.userMessage;
      if (first) ctx.services.get("topicTitle")?.fromText?.(first);
      shellUi.toast(t("pocket.restored"), "success");
      viewer?.close();
    };

    // ------------------------------------------------------------ viewer
    let viewer = null;
    let activeId = null;
    let opsOpen = false;
    let sidebarCollapsed = false;
    try {
      activeId = localStorage.getItem(ACTIVE_KEY);
    } catch {
      activeId = null;
    }
    const batches = () => groupBatches(entries);
    const currentBatch = () => {
      const list = batches();
      return list.find((b) => b.batchId === activeId) ?? list[0] ?? null;
    };
    const fmtTime = (iso) => {
      const d = new Date(iso);
      return Number.isFinite(d.getTime()) ? d.toLocaleString() : "";
    };
    const oneLine = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
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
        shellUi.toast(t("pocket.copied"), "success");
      } catch {
        shellUi.toast(t("pocket.copyFailed"), "error");
      }
    };
    const removeEntry = (entry) => {
      save(entries.filter((e) => e.id !== entry.id));
      shellUi.toast(t("pocket.deleted"), "success");
    };
    const card = (entry, { showUser }) => {
      const size = normalizeCardSize(ctx.settings.pocketCardSize);
      const name = entry.appName || entry.title || "";
      return h("article.cc-pocket-card", { style: { width: `${size.width}px`, height: `${size.height}px` } },
        h("div.card-head", logo(entry.logoUrl, name),
          h("div", { style: { flex: "1", minWidth: "0" } },
            h("div.card-title", entry.title || entry.appName || t("pocket.savedChat")),
            h("button.card-link", { type: "button", title: entry.chatUrl, onclick: () => openChat(entry) }, entry.chatUrl)),
          entry.appName ? h("span.cc-chip", entry.appName) : null,
          ui.iconButton({ icon: "insert", compact: true, label: t("pocket.openChat"), onClick: () => openChat(entry) }),
          ui.iconButton({ icon: "trash", compact: true, label: t("pocket.deleteItem"), className: "danger", onClick: () => removeEntry(entry) })),
        h("div.card-body",
          showUser ? h("section", h("div.part-head", t("pocket.user"), h("span", { style: { flex: "1" } }), ui.iconButton({ icon: "copy", compact: true, label: t("pocket.copy"), onClick: () => copyText(entry.userMessage) })), h("div.user-text", entry.userMessage)) : null,
          h("section", h("div.part-head", t("pocket.assistant"), h("span", { style: { flex: "1" } }), ui.iconButton({ icon: "copy", compact: true, label: t("pocket.copy"), onClick: () => copyText(entry.assistantMessage) })), renderMarkdown(entry.assistantMessage))));
    };
    const stackIcons = (batch) => {
      const seen = new Set();
      const box = h("span.cc-stack-icons");
      for (const e of batch.entries) {
        const k = e.logoUrl || e.appName;
        if (seen.has(k)) continue;
        seen.add(k);
        box.append(logo(e.logoUrl, e.appName));
        if (seen.size >= 5) break;
      }
      return box;
    };

    const renderSidebar = (el) => {
      const list = batches();
      if (!list.length) {
        el.append(h("div.cc-wv-empty-side", t("pocket.noGroups")));
        return;
      }
      const current = currentBatch();
      for (const b of list) {
        const firstUser = b.entries.find((e) => e.userMessage.trim())?.userMessage;
        const names = [...new Set(b.entries.map((e) => e.appName).filter(Boolean))];
        const time = b.batchId === "legacy" ? t("pocket.legacy") : fmtTime(b.createdAt);
        el.append(h("button.cc-wv-item", { type: "button", attrs: { "aria-current": String(b === current) }, onclick: () => {
          activeId = b.batchId;
          opsOpen = false;
          try {
            localStorage.setItem(ACTIVE_KEY, activeId);
          } catch {
            // ignore
          }
          viewer.refresh();
        } },
        h("span.line1", oneLine(firstUser) || time),
        h("span.line2", stackIcons(b), h("span.txt", `${time} · [${b.entries.length}]${names.length ? `: ${names.join(" · ")}` : ""}`))));
      }
    };
    const renderMainHead = (el) => {
      const b = currentBatch();
      if (!b) return;
      const firstUser = b.entries.find((e) => e.userMessage.trim())?.userMessage ?? "";
      el.append(
        h("div.head-text", h("div.head-title", oneLine(firstUser) || t("pocket.savedChat")), h("div.head-sub", b.batchId === "legacy" ? t("pocket.legacy") : fmtTime(b.createdAt))),
        ui.button({ label: t("pocket.restore"), icon: "insert", onClick: () => restoreBatch(b) }),
        (() => {
          const btn = ui.button({ label: t("pocket.actions"), icon: "menu", onClick: () => {
            opsOpen = !opsOpen;
            viewer.refreshMain();
          } });
          btn.setAttribute("aria-expanded", String(opsOpen));
          return btn;
        })());
    };
    let saveTimer = 0;
    const slider = (labelKey, key, min, max) => {
      const size = normalizeCardSize(ctx.settings.pocketCardSize);
      const value = h("span", `${size[key]}px`);
      const input = h("input", { type: "range", min: String(min), max: String(max), step: "20", value: String(size[key]) });
      const apply = (persist) => {
        const next = { ...normalizeCardSize(ctx.settings.pocketCardSize), [key]: Number(input.value) };
        value.textContent = `${next[key]}px`;
        for (const c of document.querySelectorAll(".cc-pocket-card, .cc-history-card")) c.style[key] = `${next[key]}px`;
        clearTimeout(saveTimer);
        if (persist) ctx.settings.pocketCardSize = next;
        else saveTimer = setTimeout(() => (ctx.settings.pocketCardSize = next), 180);
      };
      input.addEventListener("input", () => apply(false));
      input.addEventListener("change", () => apply(true));
      return h("label", t(labelKey), input, value);
    };
    const renderMain = (el) => {
      const b = currentBatch();
      if (!b) {
        el.append(h("div.cc-wv-empty", icon(iconName(), { size: 32 }), h("strong", t("pocket.empty.title")), h("span", t("pocket.empty.desc"))));
        return;
      }
      if (opsOpen) el.append(h("div.cc-pocket-ops", slider("pocket.cardWidth", "width", 360, 760), slider("pocket.cardHeight", "height", 420, 820)));
      const box = h("div.cc-pocket-clusters");
      for (const c of clusters(b.entries)) {
        if (c.merged) box.append(h("section.cc-pocket-cluster", h("p.shared-q", c.userMessage), h("div.cc-pocket-row", c.entries.map((e) => card(e, { showUser: false })))));
        else box.append(h("section.cc-pocket-cluster", h("div.cc-pocket-row", card(c.entries[0], { showUser: true }))));
      }
      el.append(box);
    };

    const openViewer = async () => {
      if (viewer?.isOpen()) return viewer;
      opsOpen = false;
      viewer = openWindowViewer(ctx, {
        key: "pocket",
        sizeKey: SIZE_KEY,
        focusable: true,
        collapsed: { get: () => sidebarCollapsed, set: (v) => (sidebarCollapsed = v) },
        titleIcon: () => ui.iconButton({ icon: iconName(), label: t("pocket.toggleIcon"), onClick: () => toggleIcon() }),
        title: label,
        sidebarTitle: () => t("pocket.groups"),
        renderSidebar,
        renderMainHead,
        renderMain,
        onClose: () => {
          viewer = null;
        },
      });
      await load();
      viewer?.refresh();
      return viewer;
    };

    // ------------------------------------------------------------ contributions
    ctx.contribute("topbar.item", {
      id: "pocket",
      labelKey: () => (ctx.settings.pocketIcon === "pocket" ? "pocket.name.pocket" : "pocket.name.star"),
      icon: () => iconName(),
      tipId: "topbar.pocket",
      shortcutAction: "openPocketPanel",
      onClick: () => openViewer(),
      onContextMenu: (event, item) => {
        event.preventDefault();
        quickSave(item?.anchor ?? event.currentTarget);
      },
    });
    ctx.contribute("shortcut.action", { id: "openPocketPanel", labelKey: "pocket.shortcut", run: () => openViewer() });
    ctx.contribute("panel", { id: "pocket", open: () => openViewer(), close: () => viewer?.close(), isOpen: () => !!viewer?.isOpen(), escapeCloses: true });
    ctx.contribute("fullscreen.target", { id: "pocket", order: 40, isOpen: () => !!viewer?.isOpen(), toggle: () => viewer?.toggleFullscreen() });
    ctx.contribute("tabsSidebar.button", {
      id: "pocket",
      icon: () => iconName(),
      labelKey: "pocket.sidebarSave",
      tipId: "workspace.tabs.pocket",
      order: 20,
      onClick: async (item) => {
        let sources = sourcesFromFrames(await fullText()?.framesFor?.(item.workspaceId));
        if (!sources.length && item.workspaceId === workspace.workspaceId()) {
          const live = await summary().collectAll({ userInitiated: true });
          sources = live.filter((s) => s.status === "ok");
        }
        await saveSources(sources, { noneKey: "pocket.sidebar.none" });
      },
    });
    ctx.contribute("dataTransfer", {
      id: "pocketHistory",
      modes: [{ value: "merge", labelKey: "io.mode.merge" }, { value: "replace", labelKey: "io.mode.replace" }],
      check: (data) => {
        const list = Array.isArray(data) ? data : [];
        const valid = normalizeList(list).length;
        const warnings = [];
        if (list.length - valid > 0) warnings.push(ctx.t("io.warn.invalid", { n: list.length - valid }));
        if (list.length > POCKET_LIMIT) warnings.push(ctx.t("io.warn.pocketLimit"));
        return { count: valid, warnings };
      },
      labelKey: "pocket.transfer",
      export: async () => normalizeList(await ctx.storage.get("pocketHistory")),
      import: async (data, mode) => {
        await load();
        await save(mode === "replace" ? normalizeList(data) : mergeImport(entries, data));
      },
      reset: async () => save([]),
    });

    ctx.services.provide("pocket", {
      iconName,
      label,
      toggleIcon,
      saveSources,
      sourcesFromFrames,
      quickSave,
      open: openViewer,
      isOpen: () => !!viewer?.isOpen(),
      entries: () => entries.map((e) => ({ ...e })),
    });
  },
};
