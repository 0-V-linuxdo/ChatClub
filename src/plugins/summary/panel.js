// Summary panel (v2 04 §2): persistent panel with preview of collected sources and the generated summary.

import { h, clear, icon } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { renderMarkdown } from "../../lib/markdown.js";

const RECT_KEY = "chatclub.summaryPanelSize.v4";

/** User content of the summary request (04 §2.5). */
export function buildSummaryContext(sources, question = "") {
  const sections = sources
    .filter((s) => s.status === "ok" && s.messages?.length)
    .map((s, i) => {
      const head = `# ${s.pageTitle || s.title || s.href || `Source ${i + 1}`}`;
      return [head, ...s.messages.map((m) => `${m.role}: ${m.text}`)].join("\n\n");
    });
  const context = sections.join("\n\n---\n\n");
  return question.trim() ? `Question:\n${question.trim()}\n\nContext:\n${context}` : `Context:\n${context}`;
}

export function createSummaryPanel(ctx, { collector, templates, activeTemplate, selection }) {
  const t = ctx.t;
  const shellUi = ctx.services.get("ui");
  const api = ctx.services.get("apiProfiles");
  const workspace = ctx.services.get("workspace");
  const pocket = () => ctx.services.get("pocket");
  const fullText = () => ctx.services.get("fullText");
  const shortcutLabel = (id) => ctx.services.get("shortcuts")?.labelFor?.(id) ?? "";

  const state = { sources: [], view: "preview", collecting: false, generating: false, refreshing: new Set(), expanded: new Set(), error: "", notice: "", summary: null, question: "" };
  let handle = null;
  let els = null;

  const readRect = async () => {
    let rect = null;
    try {
      rect = await ctx.storage.get(RECT_KEY);
    } catch {
      rect = null;
    }
    if (!rect) {
      try {
        rect = JSON.parse(localStorage.getItem(RECT_KEY) || "null");
        if (rect) ctx.storage.set(RECT_KEY, rect).catch(() => {});
      } catch {
        rect = null;
      }
    }
    return rect && Number(rect.width) > 0 ? rect : null;
  };
  const saveRect = (rect) => {
    ctx.storage.set(RECT_KEY, rect).catch(() => {});
    try {
      localStorage.setItem(RECT_KEY, JSON.stringify(rect));
    } catch {
      // ignore
    }
  };

  const busy = () => state.collecting || state.generating;
  const okSources = () => state.sources.filter((s) => s.status === "ok" && s.messages?.length);
  const canSave = () => okSources().some((s) => s.messages.some((m) => m.role === "user") && s.messages.some((m) => m.role === "assistant"));

  // ------------------------------------------------------------ rendering
  const statusCard = ({ spinner = false, title, desc, steps }) =>
    h("div.cc-sum-status",
      spinner ? ui.spinner() : icon("summary", { size: 20 }),
      h("div",
        h("div.title", title),
        desc ? h("div.desc", desc) : null,
        steps ? h("ol.steps", steps.map((s, i) => h("li", { dataset: { state: i < 1 ? "done" : i === 1 ? "current" : "waiting" } }, s))) : null));

  const roleLabel = (role) => t(role === "user" ? "summary.role.user" : role === "assistant" ? "summary.role.assistant" : "summary.role.page");

  const sourceCard = (source, index) => {
    const ok = source.status === "ok";
    const expanded = !ok || state.expanded.has(source.key);
    const refreshing = state.refreshing.has(source.key);
    const logo = source.logoUrl
      ? h("img.logo", { attrs: { src: source.logoUrl, alt: "" }, onerror: (e) => e.target.replaceWith(h("span.logo.letter", (source.brand || "?").slice(0, 1))) })
      : h("span.logo.letter", (source.brand || "?").slice(0, 1));
    const refresh = ui.iconButton({ icon: refreshing ? "loader" : "refreshCw", compact: true, label: t(refreshing ? "summary.refreshing" : "summary.refreshSource"), disabled: refreshing || busy(), onClick: (e) => {
      e.stopPropagation();
      refreshSource(source);
    } });
    if (refreshing) refresh.classList.add("spinning");
    const link = h("button.href", { type: "button", title: source.href, onclick: (e) => {
      e.stopPropagation();
      workspace.highlightTab(source.tabId);
    } }, source.href || "");
    const head = h("div.head", { attrs: { role: "button", tabindex: "0", "aria-expanded": String(expanded) }, dataset: { tip: t(expanded ? "summary.collapse" : "summary.expand") } },
      h("div.row1", logo, h("strong", source.brand || source.name), h("span.sep", "|"), h("span.title", source.title || ""),
        !ok ? ui.badge(t(source.status === "failed" ? "summary.badge.failed" : "summary.badge.skipped"), source.status === "failed" ? "danger" : "muted") : null,
        h("span.grow"), refresh),
      h("div.row2", link));
    const toggle = () => {
      if (!ok) return;
      if (state.expanded.has(source.key)) state.expanded.delete(source.key);
      else state.expanded.add(source.key);
      render();
    };
    head.addEventListener("click", toggle);
    head.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });
    const body = expanded
      ? h("div.body", ok
        ? source.messages.map((m) => h("div.msg", { dataset: { role: m.role } }, h("div.role", roleLabel(m.role)), m.role === "page" ? h("div.page-text", m.text) : renderMarkdown(m.text)))
        : h("div.reason", source.reason || ""))
      : null;
    return h("section.cc-sum-card", { dataset: { status: source.status, index: String(index) } }, head, body);
  };

  const renderContent = () => {
    const box = els.content;
    clear(box);
    if (state.error) box.append(h("div.cc-sum-error", state.error));
    if (state.notice) box.append(h("div.cc-sum-notice", state.notice));
    if (state.view === "preview") {
      if (state.collecting) {
        box.append(statusCard({ spinner: true, title: t("summary.collecting"), desc: t("summary.collecting.desc"), steps: [t("summary.step.find"), t("summary.step.read"), t("summary.step.preview")] }));
        return;
      }
      if (!state.sources.length && !state.error && !state.notice) {
        box.append(statusCard({ title: t("summary.empty"), desc: t("summary.empty.desc") }));
        return;
      }
      if (state.sources.length) {
        box.append(h("div.cc-sum-line", okSources().length ? t("summary.collected", { n: okSources().length }) : t("summary.noContext")));
        state.sources.forEach((s, i) => box.append(sourceCard(s, i)));
      }
      return;
    }
    const model = api.resolve(selection()).model;
    if (state.generating) {
      box.append(statusCard({ spinner: true, title: t("summary.generating", { model }), desc: t("summary.generating.desc", { model }) }));
      return;
    }
    if (state.summary?.error) {
      box.append(h("div.cc-sum-error", state.summary.error));
      return;
    }
    if (state.summary?.text) {
      box.append(h("article.cc-sum-article", renderMarkdown(state.summary.text)));
      return;
    }
    box.append(statusCard({ title: t("summary.none"), desc: collector.canCollect() ? t("summary.none.desc") : t("summary.none.unavailable") }));
  };

  const render = () => {
    if (!els) return;
    const b = busy();
    const collectable = collector.canCollect();
    els.ask.disabled = b;
    els.saveBtn.hidden = !pocket();
    if (pocket()) {
      els.saveBtn.replaceChildren(icon(pocket().iconName(), { size: 15 }), h("span", pocket().label()));
    }
    els.saveBtn.disabled = b || !canSave();
    els.previewBtn.disabled = b;
    els.sumBtn.disabled = b || !collectable;
    els.askBtn.disabled = b || !els.ask.value.trim() || !collectable;
    for (const tab of els.tabs.querySelectorAll("button")) tab.setAttribute("aria-selected", String(tab.dataset.view === state.view));
    renderContent();
  };

  // ------------------------------------------------------------ actions
  const collect = async () => {
    state.sources = [];
    state.summary = null;
    state.expanded = new Set();
    state.error = "";
    state.notice = "";
    state.view = "preview";
    const targets = collector.targets();
    if (!targets.length) {
      state.error = t("summary.noFrame");
      render();
      return;
    }
    state.collecting = true;
    render();
    try {
      state.sources = await collector.collectAll({ userInitiated: true });
      for (const s of state.sources) {
        if (s.status === "failed") ctx.reportAnomaly?.({ feature: "summary", operation: "collectSource", message: s.reason });
      }
      if (fullText()?.enabled?.()) fullText().recordSources?.(state.sources.filter((s) => s.status === "ok")).catch?.(() => {});
    } catch (error) {
      state.error = String(error?.message || error);
      ctx.reportAnomaly?.({ feature: "summary", operation: "collect", message: state.error });
    } finally {
      state.collecting = false;
      render();
    }
  };

  const refreshSource = async (source) => {
    state.refreshing.add(source.key);
    render();
    try {
      const target = collector.targets().find((tg) => tg.tabId === source.tabId) ?? (() => {
        const tab = workspace.tab(source.tabId);
        return tab ? { tabId: tab.id, groupId: tab.groupId, appId: tab.appId, frameKey: tab.frameKey, order: source.order, href: tab.href } : null;
      })();
      const next = target && workspace.iframeOf(source.tabId)?.isConnected
        ? await collector.collectTarget({ ...target, order: source.order }, { userInitiated: true })
        : { ...source, status: "failed", reason: t("summary.reason.gone"), messages: undefined };
      const i = state.sources.findIndex((s) => s.key === source.key);
      if (i >= 0) state.sources[i] = next;
      if (next.status === "ok" && fullText()?.enabled?.()) fullText().recordSources?.([next]).catch?.(() => {});
    } finally {
      state.refreshing.delete(source.key);
      render();
    }
  };

  const generate = async (question) => {
    state.view = "summary";
    state.summary = null;
    render();
    if (!okSources().length) await collect();
    if (!okSources().length) {
      state.view = "preview";
      state.notice = t("summary.none.unavailable");
      render();
      return;
    }
    state.view = "summary";
    state.generating = true;
    render();
    const { profile, model } = api.resolve(selection());
    try {
      if (!profile?.apiKey && /api\.openai\.com/.test(profile?.endpoint ?? "")) throw new Error(t("summary.noKey"));
      const template = activeTemplate();
      const { text } = await api.chat(selection(), { messages: [{ role: "system", content: template.prompt }, { role: "user", content: buildSummaryContext(state.sources, question) }] });
      if (!String(text || "").trim()) throw new Error(t("summary.emptyAnswer"));
      state.summary = { text: String(text).trim(), model };
    } catch (error) {
      const message = t("summary.failed", { model, reason: String(error?.message || error) });
      state.summary = { error: message };
      ctx.reportAnomaly?.({ feature: "summary", operation: "generate", message });
    } finally {
      state.generating = false;
      render();
    }
  };

  const saveToPocket = async () => {
    const p = pocket();
    if (!p) return;
    await p.saveSources(okSources());
  };

  // ------------------------------------------------------------ open / close
  const open = async () => {
    if (handle?.isOpen()) {
      collect();
      return handle;
    }
    const rect = await readRect();
    const ask = h("textarea.cc-sum-ask", { attrs: { rows: "2", placeholder: t("summary.ask.placeholder") } });
    ask.addEventListener("input", () => render());
    ask.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.shiftKey || e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      if (busy()) return;
      const q = ask.value.trim();
      if (q) generate(q);
      else generate("");
    });
    const saveBtn = ui.button({ label: "", onClick: () => saveToPocket() });
    const previewBtn = ui.button({ label: t("summary.preview"), icon: "preview", onClick: () => collect() });
    const sumBtn = ui.button({ label: t("summary.summarize"), icon: "summary", onClick: () => {
      ask.value = "";
      generate("");
    } });
    const askBtn = ui.button({ label: t("summary.ask"), icon: "send", variant: "primary", onClick: () => generate(ask.value) });
    const tabs = h("div.cc-sum-tabs", { attrs: { role: "tablist" } },
      ["preview", "summary"].map((view) => h("button", { type: "button", dataset: { view }, attrs: { role: "tab" }, onclick: () => {
        state.view = view;
        render();
      } }, t(`summary.view.${view}`))));
    const content = h("div.cc-sum-content");
    const body = h("div.cc-sum", ask, h("div.cc-sum-actions", saveBtn, previewBtn, h("span.grow"), sumBtn, askBtn), tabs, content);
    els = { ask, saveBtn, previewBtn, sumBtn, askBtn, tabs, content };
    handle = shellUi.openFloatingPanel({
      id: "summary",
      title: t("summary.topbar"),
      icon: "summary",
      body,
      width: Math.min(900, window.innerWidth - 24),
      height: Math.min(860, window.innerHeight - 64),
      top: 52,
      center: true,
      rect,
      minWidth: 420,
      minHeight: 420,
      onRect: saveRect,
      maximizeTip: () => {
        const combo = shortcutLabel("enterFullscreen");
        return combo ? `${t("common.maximize")} (${combo})` : t("common.maximize");
      },
      onClose: () => {
        handle = null;
        els = null;
      },
    });
    render();
    if (collector.canCollect() || collector.targets().length) collect();
    else render();
    return handle;
  };

  return {
    open,
    close: () => handle?.close("api"),
    isOpen: () => !!handle?.isOpen(),
    toggleMaximized: () => handle?.toggleMaximized(),
    sources: () => state.sources.map((s) => ({ ...s })),
    refresh: () => render(),
  };
}

export const SUMMARY_STYLE = String.raw`
.cc-sum { display: flex; flex-direction: column; gap: 10px; height: 100%; padding: 12px 14px 14px; box-sizing: border-box; }
.cc-sum-ask { width: 100%; box-sizing: border-box; resize: vertical; min-height: 54px; max-height: 200px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--input-bg, var(--panel)); color: var(--text); font: inherit; font-size: 14px; }
.cc-sum-ask:focus { outline: none; border-color: var(--primary); }
.cc-sum-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cc-sum-actions .grow, .cc-sum-card .grow { flex: 1; }
.cc-sum-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); }
.cc-sum-tabs button { border: 0; background: none; color: var(--muted); font: inherit; font-size: 13px; font-weight: 600; padding: 7px 12px; border-bottom: 2px solid transparent; cursor: pointer; }
.cc-sum-tabs button[aria-selected="true"] { color: var(--text); border-bottom-color: var(--primary); }
.cc-sum-content { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 10px; }
.cc-sum-status { display: flex; gap: 12px; align-items: flex-start; padding: 16px; border: 1px dashed var(--line); border-radius: 8px; color: var(--muted); }
.cc-sum-status .title { color: var(--text); font-weight: 600; margin-bottom: 4px; }
.cc-sum-status .desc { font-size: 13px; }
.cc-sum-status .steps { display: flex; gap: 10px; margin: 10px 0 0; padding: 0; list-style: none; font-size: 12px; }
.cc-sum-status .steps li[data-state="done"] { color: var(--success, var(--primary)); }
.cc-sum-status .steps li[data-state="current"] { color: var(--primary); font-weight: 600; }
.cc-sum-status .steps li + li::before { content: "→"; margin-right: 10px; color: var(--muted); }
.cc-sum-error { padding: 8px 12px; border-radius: 8px; background: color-mix(in srgb, var(--danger) 12%, transparent); border: 1px solid color-mix(in srgb, var(--danger) 36%, transparent); color: var(--danger); font-size: 13px; }
.cc-sum-notice { padding: 8px 12px; border-radius: 8px; background: var(--hover); font-size: 13px; }
.cc-sum-line { font-size: 12px; color: var(--muted); }
.cc-sum-card { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
.cc-sum-card .head { padding: 8px 10px; cursor: pointer; display: flex; flex-direction: column; gap: 3px; }
.cc-sum-card .head:hover { background: var(--hover); }
.cc-sum-card .row1 { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 13px; }
.cc-sum-card .row1 .title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); }
.cc-sum-card .sep { color: var(--line-strong); }
.cc-sum-card .logo { width: 16px; height: 16px; border-radius: 4px; flex: none; }
.cc-sum-card .logo.letter { display: inline-grid; place-items: center; background: var(--primary); color: #fff; font-size: 10px; font-weight: 700; border-radius: 50%; }
.cc-sum-card .href { all: unset; cursor: pointer; font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.cc-sum-card .href:hover { color: var(--primary); text-decoration: underline; }
.cc-sum-card .body { border-top: 1px solid var(--line); padding: 8px 10px; display: flex; flex-direction: column; gap: 8px; }
.cc-sum-card .reason { font-size: 13px; color: var(--muted); }
.cc-sum-card .msg { padding: 4px 0 4px 10px; border-left: 3px solid var(--line-strong); }
.cc-sum-card .msg[data-role="user"] { border-left-color: var(--primary); }
.cc-sum-card .msg[data-role="page"] { border-left-color: var(--muted); }
.cc-sum-card .msg .role { font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; margin-bottom: 2px; }
.cc-sum-card .page-text { white-space: pre-wrap; font-size: 13px; max-height: 360px; overflow: auto; }
.cc-sum-card .spinning svg { animation: cc-spin 1s linear infinite; }
.cc-sum-article { padding: 4px 2px; }
@keyframes cc-spin { to { transform: rotate(360deg); } }
`;
