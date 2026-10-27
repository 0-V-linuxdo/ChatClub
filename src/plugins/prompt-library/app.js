// PromptLibrary: saved prompts, the library window, quick insert and the settings section (v2 03 §5).

import { h, clear, uid } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";
import { settingsTable, reorderButtonsOn } from "../../lib/settings-table.js";

const KEY = "promptLibrary";
const TITLE_MAX = 100;
const PROMPT_MAX = 2000;

/** Stored array → clean records; old name/content fields are read too (07 §1.4). */
export function normalizeLibrary(list, untitled = (n) => `Prompt ${n}`) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    if (!raw || typeof raw !== "object") continue;
    const prompt = String(raw.prompt ?? raw.content ?? "").slice(0, PROMPT_MAX);
    if (!prompt.trim()) continue;
    let id = typeof raw.id === "string" && raw.id ? raw.id : `prompt-${Math.random().toString(36).slice(2, 10)}`;
    while (seen.has(id)) id = `${id}-1`;
    seen.add(id);
    const title = String(raw.title ?? raw.name ?? "").trim().slice(0, TITLE_MAX) || untitled(out.length + 1);
    out.push({ id, title, prompt });
  }
  return out;
}

export default {
  async start(ctx) {
    const t = ctx.t;
    const shellUi = ctx.services.get("ui");
    const composer = ctx.services.get("composer");
    let items = [];
    const listeners = new Set();
    const changed = () => listeners.forEach((fn) => fn());
    const load = async () => {
      const raw = await ctx.storage.get(KEY).catch(() => []);
      items = normalizeLibrary(raw, (n) => t("library.untitled", { n }));
      changed();
    };
    // Writes are serialized so quick edits can't overwrite each other.
    let chain = Promise.resolve();
    const save = (next) => {
      items = next;
      changed();
      chain = chain.then(() => ctx.storage.set(KEY, items)).catch((error) => {
        ctx.logger.error("Saving the prompt library failed:", error);
        shellUi.toast(String(error?.message || error), "error");
      });
      return chain;
    };
    await load();
    ctx.storage.onChanged?.(KEY, () => load());

    const insert = (item) => {
      if (!item || !composer) return;
      composer.insertText(item.prompt);
      shellUi.toast(t("library.inserted"), "success");
    };

    const counter = (field, max) => {
      const el = h("span", { style: { fontSize: "12px", color: "var(--muted)" } });
      const update = () => (el.textContent = `${field.value.length}/${max}`);
      field.addEventListener("input", update);
      update();
      return el;
    };
    const openEditor = (existing) => shellUi.openModal(({ onClose }) => {
      const title = ui.textInput({ value: existing?.title ?? "" });
      title.maxLength = TITLE_MAX;
      const prompt = ui.textArea({ value: existing?.prompt ?? "", rows: 8 });
      prompt.maxLength = PROMPT_MAX;
      const ok = () => {
        const tt = title.value.trim();
        const pp = prompt.value;
        if (!tt || !pp.trim()) {
          shellUi.toast(t("library.missing"), "error");
          return;
        }
        if (existing) save(items.map((x) => (x.id === existing.id ? { ...x, title: tt, prompt: pp } : x)));
        else save([...items, { id: `prompt-${uid("p").slice(2)}`, title: tt, prompt: pp }]);
        shellUi.toast(t(existing ? "library.updated" : "library.added"), "success");
        onClose("save");
      };
      const body = h("div",
        ui.field({ label: t("library.field.title"), help: counter(title, TITLE_MAX), control: title }),
        ui.field({ label: t("library.field.prompt"), help: counter(prompt, PROMPT_MAX), control: prompt }));
      return shellUi.modalLayout({ title: t(existing ? "library.editTitle" : "library.addTitle"), icon: "library", body, footer: [ui.button({ label: t("library.cancel"), onClick: () => onClose("cancel") }), ui.button({ label: t("library.ok"), variant: "primary", onClick: ok })], onClose });
    }, { kind: "editor" });
    const remove = async (item) => {
      const ok = await shellUi.confirm({ title: t("library.deleteTitle", { title: item.title }), description: t("settings.deleteConfirm"), danger: true });
      if (!ok) return;
      save(items.filter((x) => x.id !== item.id));
      shellUi.toast(t("library.deleted"), "success");
    };

    /** The shared table; `onInsert` adds the insert action (library window only). */
    const renderTable = (container, { onInsert } = {}) => {
      const draw = () => {
        clear(container);
        if (!items.length) {
          container.append(h("div.cc-empty", { style: { padding: "32px", textAlign: "center", color: "var(--muted)" } },
            h("p", t("library.empty")), ui.button({ label: t("library.add"), icon: "plus", variant: "primary", onClick: () => openEditor(null) })));
          return;
        }
        container.append(settingsTable({
          t,
          rows: items,
          moveButtons: reorderButtonsOn(ctx.host),
          onReorder: (ids) => {
            save(ids.map((id) => items.find((x) => x.id === id)));
            shellUi.toast(t("library.orderSaved"), "success");
          },
          columns: [
            { label: t("library.col.title"), width: "minmax(120px, 0.8fr)", render: (x) => h("strong.cell-ellipsis", { style: { fontWeight: "600" } }, x.title) },
            { label: t("library.col.prompt"), width: "minmax(160px, 2fr)", render: (x) => h("span.cell-ellipsis", { attrs: { title: x.prompt } }, x.prompt.replace(/\s+/g, " ")) },
          ],
          actions: (x) => [
            ui.iconButton({ icon: "edit", label: t("library.edit"), tipId: "settings.action.edit", onClick: () => openEditor(x) }),
            ui.iconButton({ icon: "trash", label: t("library.delete"), tipId: "settings.action.delete", className: "danger", onClick: () => remove(x) }),
            onInsert ? ui.iconButton({ icon: "insert", label: t("library.insert"), tipId: "settings.action.insert", onClick: () => onInsert(x) }) : null,
          ],
        }));
      };
      listeners.add(draw);
      draw();
      return () => listeners.delete(draw);
    };

    const openLibrary = () => {
      let off = () => {};
      return shellUi.openModal(({ onClose }) => {
        const box = h("div");
        off = renderTable(box, { onInsert: (x) => {
          onClose("insert");
          insert(x);
        } });
        return shellUi.modalLayout({ title: t("library.title"), icon: "library", body: box, actions: [ui.button({ label: t("library.add"), icon: "plus", variant: "primary", onClick: () => openEditor(null) })], onClose });
      }, { key: "prompt-library", kind: "viewer", size: "wide", onClose: () => off() });
    };

    ctx.contribute("composer.action", { id: "library", icon: "library", labelKey: "library.action", order: 10, onClick: () => openLibrary() });
    ctx.contribute("composer.keyHandler", {
      id: "PromptLibrary:slash",
      onKeyDown(event, cctx) {
        if (event.key !== "/" || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return false;
        const ta = event.target;
        if (!cctx.isEmpty || ta.selectionStart !== 0 || ta.selectionEnd !== 0) return false;
        openLibrary();
        return true;
      },
    });
    ctx.contribute("shortcut.action", { id: "insertPrompt", labelKey: "library.shortcut", run: (match) => insert(items[Number(match?.digit) - 1]) });
    ctx.contribute("settings.section", {
      id: "prompts",
      titleKey: "library.title",
      descKey: "library.section.desc",
      icon: "library",
      order: 90,
      group: "prompts",
      render(container, sctx) {
        const box = h("div");
        container.append(h("div.cc-section-toolbar", h("span.desc"), ui.button({ label: t("library.add"), icon: "plus", variant: "primary", onClick: () => openEditor(null) })), box);
        sctx.onDispose(renderTable(box));
      },
    });

    ctx.contribute("dataTransfer", {
      id: "promptLibrary",
      labelKey: "library.transfer",
      modes: [{ value: "merge", labelKey: "io.mode.merge" }, { value: "replace", labelKey: "io.mode.replace" }],
      check: (data) => {
        const list = Array.isArray(data) ? data : [];
        const valid = normalizeLibrary(list).length;
        return { count: valid, warnings: list.length > valid ? [t("io.warn.invalid", { n: list.length - valid })] : [] };
      },
      export: async () => items.map((x) => ({ ...x })),
      import: async (data, mode) => {
        const incoming = normalizeLibrary(data, (n) => t("library.untitled", { n }));
        if (mode === "replace") return save(incoming);
        const key = (x) => `${x.title}\u241f${x.prompt}`;
        const have = new Set(items.map(key));
        const ids = new Set(items.map((x) => x.id));
        return save([...items, ...incoming.filter((x) => !have.has(key(x))).map((x) => (ids.has(x.id) ? { ...x, id: `${x.id}-${Date.now().toString(36)}` } : x))]);
      },
      reset: async () => save([]),
    });
    ctx.services.provide("promptLibrary", { list: () => items.map((x) => ({ ...x })), open: openLibrary, insert: (id) => insert(items.find((x) => x.id === id)) });
  },
};
