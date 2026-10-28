// The composer's search mode (03 §8): while on, the prompt box searches chats and lists results under it.

import { h, clear } from "../../lib/dom.js";

const SEARCH_LIMIT = 12;

/** provider: { search(query, { limit }) -> results[], openWindow(query) }. Returns a disposer. */
export function installSearchMode(ctx, composer, provider) {
  const t = ctx.t;
  const box = composer.element;
  const textarea = composer.textarea;
  const panel = h("div.cc-composer-search", { hidden: true, attrs: { role: "listbox" } });
  box.append(panel);

  let query = "";
  let results = [];
  let index = 0;
  let seq = 0;
  const highlight = (text, q) => {
    const s = String(text ?? "");
    if (!q) return [s];
    const i = s.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return [s];
    return [s.slice(0, i), h("mark", s.slice(i, i + q.length)), s.slice(i + q.length)];
  };
  const formatTime = (ms) => {
    if (!ms) return "";
    const d = new Date(ms);
    if (d.toDateString() === new Date().toDateString()) return t("composer.search.today");
    return ctx.services.get("i18n")?.formatDate?.(d, { month: "short", day: "numeric" }) ?? d.toLocaleDateString();
  };
  const render = () => {
    clear(panel);
    panel.style.setProperty("--composer-search-max", `${Math.max(160, window.innerHeight - box.getBoundingClientRect().top - 120)}px`);
    panel.append(h("div.head", query ? t("composer.search.count", { count: results.length }) : t("composer.search.recent")));
    if (!results.length) panel.append(h("div.empty", t("composer.search.empty")));
    results.forEach((result, i) => {
      const el = h("button.cc-composer-result", { type: "button", attrs: { role: "option", "aria-selected": String(i === index) } },
        h("span.icons", (result.icons ?? []).slice(0, 4).map((src) => h("img", { attrs: { src, alt: "" } }))),
        h("span.main", h("span.title", highlight(result.title, query)), result.snippet ? h("span.snippet", highlight(result.snippet, query)) : null),
        h("span.meta", h("span", formatTime(result.time)), result.status ? h("span", result.status === "open" ? t("composer.search.open") : t("composer.search.closed")) : null));
      el.addEventListener("mousedown", (e) => e.preventDefault());
      el.addEventListener("click", () => openResult(i));
      panel.append(el);
    });
    const openWindow = h("button", { type: "button", onclick: () => {
      const q = query;
      composer.exitMode();
      provider.openWindow(q);
    } }, t("composer.search.openWindow"));
    openWindow.addEventListener("mousedown", (e) => e.preventDefault());
    panel.append(h("div.foot", h("span", t("composer.search.hint")), openWindow));
  };
  const run = async () => {
    const mine = ++seq;
    const q = textarea.value.trim();
    let found = [];
    try {
      found = (await provider.search(q, { limit: SEARCH_LIMIT })) ?? [];
    } catch (error) {
      ctx.logger.warn("Search failed:", error);
    }
    if (mine !== seq || composer.mode() !== "search") return; // a newer query won
    query = q;
    results = found.slice(0, SEARCH_LIMIT);
    index = 0;
    render();
  };
  const openResult = (i) => {
    const result = results[i];
    if (!result) return;
    composer.exitMode();
    try {
      result.open?.();
    } catch (error) {
      ctx.logger.error("Opening a search result failed:", error);
    }
  };

  const mode = {
    id: "search",
    placeholder: () => (ctx.services.get("fullText")?.enabled?.() ? t("composer.search.placeholderFull") : t("composer.search.placeholder")),
    onEnter: () => {
      box.classList.add("searching");
      panel.hidden = false;
      run();
    },
    onExit: () => {
      box.classList.remove("searching");
      panel.hidden = true;
      seq += 1;
    },
    onInput: () => run(),
    onFocus: () => render(),
    onKeyDown: (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (results.length) {
          index = (index + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
          render();
        }
        return true;
      }
      if (event.key === "Enter") {
        openResult(index);
        return true;
      }
      if (event.key === "Escape") {
        event.stopPropagation();
        if (textarea.value) {
          textarea.value = "";
          run();
        } else composer.exitMode();
        return true;
      }
      if (event.key === "Tab" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
        composer.exitMode();
        return true;
      }
      return false;
    },
  };
  const enter = (q = "") => composer.enterMode(mode, q);
  const plainTab = (event) => event.key === "Tab" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;

  const offs = [
    ctx.contribute("composer.mode", { id: "search", icon: "search", labelKey: "composer.mode.search", tipId: "composer.mode.search", order: 0, enter: () => enter("") }),
    // Tab in an empty or filled compose box switches to search (after other key handlers).
    ctx.contribute("composer.keyHandler", { id: "TabSearch:tab", order: 1000, onKeyDown: (event) => (plainTab(event) ? (enter(""), true) : false) }),
    ctx.contribute("composer.placeholder", { id: "TabSearch:tabHint", order: 1000, text: () => (composer.isCollapsed() ? t("composer.placeholder.tabHint") : "") }),
  ];
  return {
    enter,
    dispose: () => {
      if (composer.mode() === "search") composer.exitMode();
      offs.forEach((off) => off?.());
      panel.remove();
    },
  };
}
