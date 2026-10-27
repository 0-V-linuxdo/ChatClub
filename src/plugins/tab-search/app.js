// TabSearch: search mode results for the composer and the tabs search window (v2 02 §11, 03 §8).

import { h, clear } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { appIconUrl, appIconImg } from "../../lib/app-icon.js";
import { activityTime, sectionOf, SECTION_IDS } from "../workspace-tabs/model.js";

const SNIPPET_MAX = 96;

/** A window of at most `max` characters around the first hit. */
export function snippetAround(text, query, max = SNIPPET_MAX) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!query) return s.slice(0, max);
  const i = s.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return s.slice(0, max);
  const start = Math.max(0, Math.min(i - Math.floor((max - query.length) / 2), s.length - max));
  return `${start > 0 ? "…" : ""}${s.slice(start, start + max)}${start + max < s.length ? "…" : ""}`;
}

/** Title matches first (by activity), then full-text-only hits; empty query = most recent. */
export function rankResults(items, query, nameOf, textHits = new Map()) {
  const q = query.trim().toLowerCase();
  const byTime = [...items].sort((a, b) => activityTime(b) - activityTime(a));
  if (!q) return byTime.map((item) => ({ item }));
  const titled = byTime.filter((x) => nameOf(x).toLowerCase().includes(q)).map((item) => ({ item, snippet: textHits.get(item.workspaceId) ?? null, fullText: false }));
  const titledIds = new Set(titled.map((r) => r.item.workspaceId));
  const textOnly = byTime.filter((x) => !titledIds.has(x.workspaceId) && textHits.has(x.workspaceId)).map((item) => ({ item, snippet: textHits.get(item.workspaceId), fullText: true }));
  return [...titled, ...textOnly];
}

const highlight = (text, query) => {
  const s = String(text ?? "");
  const q = query.trim();
  if (!q) return [s];
  const out = [];
  let rest = s;
  for (let guard = 0; guard < 20; guard += 1) {
    const i = rest.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) break;
    out.push(rest.slice(0, i), h("mark", rest.slice(i, i + q.length)));
    rest = rest.slice(i + q.length);
  }
  out.push(rest);
  return out;
};

// Whether the search window was last left full screen (07 §1.3).
const SIZE_KEY = "chatclub.tabsSearchPanelSize.v1";

export default {
  start(ctx) {
    const t = ctx.t;
    const shellUi = ctx.services.get("ui");
    const tabs = ctx.services.get("workspaceTabs");
    const composer = ctx.services.get("composer");
    const apps = ctx.services.get("apps");
    if (!tabs || !composer) return;
    const fullText = () => ctx.services.get("fullText");
    const fullTextOn = () => !!fullText()?.enabled?.();

    const textHits = async (query, ids) => {
      if (!query.trim() || !fullTextOn()) return new Map();
      try {
        const hits = await fullText().search(query, { workspaceIds: ids });
        const map = new Map();
        for (const hit of hits ?? []) if (hit?.workspaceId && !map.has(hit.workspaceId)) map.set(hit.workspaceId, snippetAround(hit.text, query));
        return map;
      } catch (error) {
        ctx.logger.warn("Full-text search failed:", error?.message || error);
        return new Map();
      }
    };
    const query = async (q) => {
      const items = await tabs.load();
      const hits = await textHits(q, items.map((x) => x.workspaceId));
      return rankResults(items, q, (x) => tabs.nameOf(x), hits);
    };

    // ------------------------------------------------------------ composer search mode (03 §8)
    ctx.contribute("composer.searchProvider", {
      id: "TabSearch:tabs",
      async search(q, { limit = 12 } = {}) {
        const ranked = await query(q);
        return ranked.slice(0, limit).map(({ item, snippet }) => ({
          id: item.workspaceId,
          title: tabs.nameOf(item),
          snippet,
          icons: (item.appIds ?? []).map((id) => apps.get(id)).filter(Boolean).map((app) => appIconUrl(ctx.host, app)),
          time: activityTime(item),
          status: item.live ? "open" : "closed",
          open: () => (item.isSelf ? null : tabs.activate(item)),
        }));
      },
      openWindow: (q) => openWindow(q),
    });

    // ------------------------------------------------------------ search window (02 §11)
    const openWindow = (initial = "") => {
      let selected = null;
      let results = [];
      let seq = 0;
      const modal = shellUi.openModal(({ onClose, handle }) => {
        const input = ui.textInput({ value: initial, placeholder: t(fullTextOn() ? "tabSearch.placeholderFull" : "tabSearch.placeholder") });
        input.setAttribute("autofocus", "");
        const listEl = h("div.cc-tabsearch-list", { attrs: { role: "listbox" } });
        const preview = h("div.cc-tabsearch-preview");
        const openBtn = ui.button({ label: t("tabSearch.openTab"), icon: "external", variant: "primary", disabled: true, onClick: () => {
          if (!selected) return;
          onClose("open");
          tabs.activate(selected);
        } });
        const maxBtn = ui.iconButton({ icon: "maximize", label: t("tabSearch.maximize"), tipId: "viewer.fullscreen", onClick: () => {
          const maximized = handle.el.classList.toggle("maximized");
          try {
            localStorage.setItem(SIZE_KEY, JSON.stringify({ maximized }));
          } catch {
            // storage unavailable
          }
        } });

        const renderPreview = async () => {
          clear(preview);
          openBtn.disabled = !selected || !!selected.isSelf;
          if (!selected) {
            preview.append(h("div.empty", t("tabSearch.select")));
            return;
          }
          const want = selected.workspaceId;
          let clusters = [];
          try {
            clusters = (await fullText()?.preview?.(want)) ?? [];
          } catch {
            clusters = [];
          }
          if (selected?.workspaceId !== want) return;
          if (!clusters.length) {
            preview.append(h("div.empty", t("tabSearch.noRecord")));
            return;
          }
          for (const cluster of clusters) {
            const app = apps.get(cluster.appId);
            const box = h("section.cc-tabsearch-cluster", h("h3", app ? appIconImg(ctx.host, app) : null, app?.name ?? cluster.appId ?? ""));
            for (const msg of cluster.messages ?? []) {
              const copy = ui.iconButton({ icon: "copy", compact: true, label: t("tabSearch.copy"), className: "copy", onClick: async () => {
                try {
                  await navigator.clipboard.writeText(msg.text);
                  shellUi.toast(t("tabSearch.copied"), "success");
                } catch {
                  // ignore
                }
              } });
              box.append(h("div.cc-tabsearch-msg", { class: msg.role === "user" ? "user" : "", attrs: { "aria-label": t(msg.role === "user" ? "tabSearch.user" : "tabSearch.assistant") } }, msg.text, copy));
            }
            preview.append(box);
          }
        };
        const renderList = () => {
          clear(listEl);
          const q = input.value;
          if (q.trim() && !fullTextOn()) listEl.append(h("div.cc-tabsearch-note", t("tabSearch.enableFullText")));
          if (!results.length) {
            listEl.append(h("div.cc-empty", { style: { padding: "16px 8px", color: "var(--muted)" } }, t("tabSearch.none")));
            return;
          }
          const groups = new Map(SECTION_IDS.map((id) => [id, []]));
          for (const r of results) groups.get(sectionOf(activityTime(r.item))).push(r);
          for (const [id, part] of groups) {
            if (!part.length) continue;
            listEl.append(h("div.cc-tabs-sec", t(`tabs.section.${id}`)));
            for (const r of part) {
              const btn = h("button.cc-tabsearch-item", { type: "button", attrs: { role: "option", "aria-selected": String(selected?.workspaceId === r.item.workspaceId) } },
                h("span.row", h("span.title", highlight(tabs.nameOf(r.item), q)), r.fullText ? h("span.badge", t("tabSearch.fullTextBadge")) : null),
                r.snippet ? h("span.snippet", highlight(r.snippet, q)) : null);
              btn.addEventListener("click", () => {
                selected = r.item;
                renderList();
                renderPreview();
              });
              btn.addEventListener("dblclick", () => {
                if (r.item.isSelf) return;
                onClose("open");
                tabs.activate(r.item);
              });
              listEl.append(btn);
            }
          }
        };
        const run = async () => {
          const mine = ++seq;
          const next = await query(input.value);
          if (mine !== seq) return;
          results = next;
          if (selected && !results.some((r) => r.item.workspaceId === selected.workspaceId)) selected = null;
          renderList();
          renderPreview();
        };
        input.addEventListener("input", run);
        run();
        const body = h("div.cc-tabsearch", h("div.cc-tabsearch-left", h("div.box", input), listEl), preview);
        const layout = shellUi.modalLayout({ title: t("tabSearch.title"), icon: "search", body, actions: [openBtn, maxBtn], onClose });
        layout.querySelector(".cc-modal-body").style.padding = "0";
        return layout;
      }, { key: "tab-search", kind: "viewer", size: "workspace" });
      try {
        if (JSON.parse(localStorage.getItem(SIZE_KEY) || "{}")?.maximized) modal?.el?.classList.add("maximized");
      } catch {
        // storage unavailable
      }
      return modal;
    };

    ctx.contribute("topbar.item", { id: "search", labelKey: "tabSearch.button", icon: "search", shortcutAction: "enterSearchMode", onClick: () => composer.enterSearchMode() });
    ctx.contribute("shortcut.action", { id: "enterSearchMode", labelKey: "tabSearch.shortcut", run: () => composer.enterSearchMode() });
    ctx.services.provide("tabSearch", { openWindow, query });
  },
};
