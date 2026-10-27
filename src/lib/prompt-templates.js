// Prompt templates shared by Summary and Optimize (v2 06 §10.2): records, the settings card and editor.

import { h, clear, uid } from "./dom.js";
import * as ui from "./ui.js";
import { settingsTable, reorderButtonsOn } from "./settings-table.js";

/** Normalizes {id,title,prompt,builtIn}[]; the built-in template is always present with its own text. */
export function normalizeTemplates(list, builtin) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    if (!raw || typeof raw.id !== "string" || seen.has(raw.id)) continue;
    const prompt = String(raw.prompt ?? "");
    if (!prompt.trim()) continue;
    seen.add(raw.id);
    out.push({ id: raw.id, title: String(raw.title ?? "").trim() || raw.id, prompt, builtIn: raw.id === builtin.id || !!raw.builtIn });
  }
  if (!seen.has(builtin.id)) out.unshift({ ...builtin, builtIn: true });
  return out;
}

export const activeTemplate = (templates, id) => templates.find((x) => x.id === id) ?? templates[0];

/**
 * Renders the template card. opts: { host, t, ui: shellUi, templates(), save(list), activeId(), setActive(id), builtin, descKey }
 */
export function renderTemplateCard(container, opts) {
  const { t, host } = opts;
  const shellUi = opts.ui;
  const body = h("div");
  const openEditor = (existing) => shellUi.openModal(({ onClose }) => {
    const title = ui.textInput({ value: existing?.title ?? "" });
    const prompt = ui.textArea({ value: existing?.prompt ?? "", rows: 12, mono: false });
    const row = ui.field({ label: t("templates.field.prompt"), control: prompt });
    const ok = () => {
      if (!prompt.value.trim()) {
        row.setError(t("templates.error.prompt"));
        return;
      }
      const list = opts.templates();
      if (existing) opts.save(list.map((x) => (x.id === existing.id ? { ...x, title: title.value.trim() || x.title, prompt: prompt.value } : x)));
      else opts.save([...list, { id: `template-${uid("t").slice(2)}`, title: title.value.trim() || t("templates.untitled"), prompt: prompt.value, builtIn: false }]);
      onClose("save");
    };
    return shellUi.modalLayout({
      title: t(existing ? "templates.editTitle" : "templates.addTitle"),
      body: h("div", ui.field({ label: t("templates.field.title"), control: title }), row),
      footer: [ui.button({ label: t("templates.cancel"), onClick: () => onClose("cancel") }), ui.button({ label: t("templates.save"), variant: "primary", onClick: ok })],
      onClose,
    });
  }, { kind: "editor", size: "wide" });

  const draw = () => {
    clear(body);
    const list = opts.templates();
    const active = activeTemplate(list, opts.activeId())?.id;
    body.append(h("div.cc-section-toolbar", h("span.desc", t(opts.descKey)), ui.button({ label: t("templates.add"), icon: "plus", variant: "primary", onClick: () => openEditor(null) })));
    body.append(settingsTable({
      t,
      rows: list,
      moveButtons: reorderButtonsOn(host),
      onReorder: (ids) => opts.save(ids.map((id) => list.find((x) => x.id === id))),
      columns: [
        { label: t("templates.col.name"), width: "minmax(120px, 1fr)", render: (x) => h("span", { style: { display: "inline-flex", alignItems: "center", gap: "6px" } }, h("strong", x.title), x.builtIn ? ui.badge("★", "builtin") : null) },
        { label: t("templates.col.active"), width: "72px", render: (x) => ui.checkbox({ checked: x.id === active, onChange: () => {
          opts.setActive(x.id);
          draw();
        } }) },
        { label: t("templates.col.preview"), width: "minmax(160px, 2.4fr)", render: (x) => h("span", { style: { display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden", color: "var(--muted)" } }, x.prompt) },
      ],
      actions: (x) => [
        ui.iconButton({ icon: "edit", label: t("templates.edit"), tipId: "settings.action.edit", onClick: () => openEditor(x) }),
        x.builtIn
          ? ui.iconButton({ icon: "reset", label: t("templates.reset"), tipId: "settings.action.reset", onClick: () => {
            opts.save(opts.templates().map((y) => (y.id === x.id ? { ...opts.builtin, builtIn: true } : y)));
          } })
          : ui.iconButton({ icon: "trash", label: t("templates.delete"), tipId: "settings.action.delete", className: "danger", onClick: async () => {
            const ok = await shellUi.confirm({ title: t("templates.deleteTitle", { title: x.title }), description: t("settings.deleteConfirm"), danger: true });
            if (!ok) return;
            opts.save(opts.templates().filter((y) => y.id !== x.id));
            if (opts.activeId() === x.id) opts.setActive(opts.builtin.id);
          } }),
      ],
    }));
  };
  draw();
  container.append(ui.card({ title: t("templates.card"), body }));
  return draw;
}

/** "Profile · model" choices for a feature's API select. */
export function apiChoices(api) {
  const out = [];
  for (const p of api.list()) {
    out.push({ value: `${p.id}\n`, label: `${p.name} · ${p.model}` });
    for (const m of api.modelOptions(p.id)) if (m !== p.model) out.push({ value: `${p.id}\n${m}`, label: `${p.name} · ${m}` });
  }
  return out;
}

export const templateStrings = {
  zh: {
    "templates.card": "提示词模板",
    "templates.add": "添加模板",
    "templates.edit": "编辑",
    "templates.delete": "删除",
    "templates.reset": "重置模板",
    "templates.col.name": "名称",
    "templates.col.active": "启用",
    "templates.col.preview": "提示词预览",
    "templates.field.title": "名称",
    "templates.field.prompt": "提示词",
    "templates.error.prompt": "提示词不能为空",
    "templates.editTitle": "编辑模板",
    "templates.addTitle": "添加模板",
    "templates.save": "保存",
    "templates.cancel": "取消",
    "templates.untitled": "未命名模板",
    "templates.deleteTitle": "删除模板“{title}”",
    "templates.api": "API 配置",
    "templates.manageApi": "管理 API 服务商",
  },
  en: {
    "templates.card": "Prompt templates",
    "templates.add": "Add template",
    "templates.edit": "Edit",
    "templates.delete": "Delete",
    "templates.reset": "Reset template",
    "templates.col.name": "Name",
    "templates.col.active": "Active",
    "templates.col.preview": "Prompt preview",
    "templates.field.title": "Name",
    "templates.field.prompt": "Prompt",
    "templates.error.prompt": "The prompt can't be empty",
    "templates.editTitle": "Edit template",
    "templates.addTitle": "Add template",
    "templates.save": "Save",
    "templates.cancel": "Cancel",
    "templates.untitled": "Untitled template",
    "templates.deleteTitle": "Delete template “{title}”",
    "templates.api": "API settings",
    "templates.manageApi": "Manage API providers",
  },
};
