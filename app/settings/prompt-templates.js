import { DEFAULT_OPTIONS } from "../../shared/constants.js";
import { t } from "../../shared/i18n.js";
import { createId } from "../../shared/storage-schema.js";
import { button, editorModal, el, field, input, select, textarea, toast } from "../../ui/dom.js";
import { cleanupSettingsDragRows, moveListItem } from "./kit.js";
import {
  requireControllerContext,
  requireControllerFunction,
  validateControllerContract
} from "../controller-contract.js";

export function createPromptTemplateSettings(ctx) {
  const controllerName = "Prompt template settings";
  ctx = validateControllerContract(ctx, controllerName, {
    kind: "string",
    state: "object",
    notifyConfigReload: "function",
    saveOptionsPatch: "function",
    settingsKit: "object"
  });
  const kind = ctx.kind === "optimize" ? "optimize" : ctx.kind === "summary" ? "summary" : "";
  if (!kind) throw new TypeError("Prompt template settings requires kind to be summary or optimize.");
  const state = requireControllerContext(ctx, controllerName, "state");
  const notifyConfigReload = requireControllerFunction(ctx, controllerName, "notifyConfigReload");
  const saveOptionsPatch = requireControllerFunction(ctx, controllerName, "saveOptionsPatch");
  const {
    settingsBlock,
    settingsDragHandle,
    settingsEmptyRow,
    settingsIconAction,
    settingsList,
    settingsListDropPlacement,
    settingsPaneToolbar,
    settingsPrimaryAction
  } = requireControllerContext(ctx, controllerName, "settingsKit");

  function profileOptions() {
    return state.options.apiProfiles.map((profile) => ({ value: profile.id, label: profile.name || profile.id }));
  }

  const PROMPT_TEMPLATE_SETTINGS = {
    summary: {
      labelKey: "settings.summary.title",
      listKey: "summaryPromptTemplates",
      activeKey: "summaryPromptTemplateId",
      profileKey: "summaryApiProfileId",
      defaultId: DEFAULT_OPTIONS.summaryPromptTemplateId,
      defaults: DEFAULT_OPTIONS.summaryPromptTemplates,
      defaultPrompt: DEFAULT_OPTIONS.summaryPromptTemplates[0]?.prompt || "",
      profileToastKey: "toast.summaryProfileSaved",
      templateToastKey: "toast.summaryTemplateSaved",
      copyKey: "summary.templateCopy"
    },
    optimize: {
      labelKey: "settings.optimize.title",
      listKey: "optimizePromptTemplates",
      activeKey: "optimizePromptTemplateId",
      profileKey: "optimizeApiProfileId",
      defaultId: DEFAULT_OPTIONS.optimizePromptTemplateId,
      defaults: DEFAULT_OPTIONS.optimizePromptTemplates,
      defaultPrompt: DEFAULT_OPTIONS.optimizePromptTemplates[0]?.prompt || "",
      profileToastKey: "toast.optimizeProfileSaved",
      templateToastKey: "toast.optimizeTemplateSaved",
      copyKey: "optimize.templateCopy"
    }
  };

  function promptTemplateMeta(kind) {
    return PROMPT_TEMPLATE_SETTINGS[kind] || PROMPT_TEMPLATE_SETTINGS.summary;
  }

  function promptTemplateList(kind) {
    const meta = promptTemplateMeta(kind);
    return state.options[meta.listKey] || [];
  }

  function activePromptTemplate(kind) {
    const meta = promptTemplateMeta(kind);
    const templates = promptTemplateList(kind);
    return templates.find((item) => item.id === state.options[meta.activeKey]) || templates[0] || meta.defaults[0];
  }

  function promptTemplateBuiltInDefault(kind, template) {
    const meta = promptTemplateMeta(kind);
    return (meta.defaults || []).find((item) => item.id === template.id) || null;
  }

  function promptTemplatePreview(prompt) {
    return String(prompt || "").replace(/\s+/g, " ").trim() || t("promptTemplates.empty");
  }

  function promptTemplateLabel(template) {
    if (template?.builtIn && template.id === DEFAULT_OPTIONS.summaryPromptTemplateId) return t("promptTemplates.defaultSummary");
    if (template?.builtIn && template.id === DEFAULT_OPTIONS.optimizePromptTemplateId) return t("promptTemplates.defaultOptimize");
    return template?.title || template?.id || "";
  }

  async function savePromptTemplateState(kind, templates, activeId, redraw, message, options = {}) {
    const meta = promptTemplateMeta(kind);
    state.options = await saveOptionsPatch({
      [meta.listKey]: templates,
      [meta.activeKey]: activeId || templates[0]?.id || meta.defaultId
    });
    if (options.reloadRuntime !== false) await notifyConfigReload();
    redraw();
    if (message) toast(message, "success");
  }

  function openPromptTemplateEditor(kind, template, redraw) {
    const meta = promptTemplateMeta(kind);
    const editing = Boolean(template);
    const draft = structuredClone(template || {
      id: createId(`${kind}-template`),
      title: `New ${t(meta.labelKey)} Template`,
      prompt: meta.defaultPrompt,
      builtIn: false
    });
    const titleInput = input(promptTemplateLabel(draft), { placeholder: t("promptTemplates.name") });
    const promptInput = textarea(draft.prompt, { placeholder: t("promptTemplates.prompt") });
    let dialog;
    const close = () => dialog.remove();
    const save = async () => {
      const nextTemplate = {
        ...draft,
        title: titleInput.value.trim() || `${t(meta.labelKey)} Template`,
        prompt: promptInput.value.trim()
      };
      if (!nextTemplate.prompt) return toast(t("promptTemplates.required"), "error");
      const templates = editing
        ? promptTemplateList(kind).map((item) => item.id === draft.id ? nextTemplate : item)
        : [...promptTemplateList(kind), nextTemplate];
      await savePromptTemplateState(
        kind,
        templates,
        editing ? state.options[meta.activeKey] : nextTemplate.id,
        redraw,
        editing ? t(meta.templateToastKey) : t("toast.promptAdded")
      );
      close();
    };
    dialog = editorModal(editing ? t("promptTemplates.edit", { kind: t(meta.labelKey) }) : t("promptTemplates.addTitle", { kind: t(meta.labelKey) }),
      el("div", { class: "settings-editor-form prompt-template-editor" },
        el("div", { class: "settings-dialog-grid" },
          field(t("promptTemplates.name"), titleInput),
          field(t("promptTemplates.prompt"), promptInput)
        ),
        el("div", { class: "settings-dialog-actions" },
          button(t("common.cancel"), close),
          button(editing ? t("promptTemplates.save") : t("promptTemplates.add"), save, "primary")
        )
      ),
      close,
      false,
      t("common.close")
    );
    dialog.querySelector(".modal")?.classList.add("settings-editor-modal");
  }

  async function resetPromptTemplate(kind, template, redraw) {
    const defaults = promptTemplateBuiltInDefault(kind, template);
    if (!defaults) return;
    const templates = promptTemplateList(kind).map((item) => item.id === template.id ? structuredClone(defaults) : item);
    await savePromptTemplateState(kind, templates, state.options[promptTemplateMeta(kind).activeKey], redraw, t("toast.promptTemplateReset"));
  }

  async function resetActivePromptTemplate(kind, redraw) {
    const meta = promptTemplateMeta(kind);
    const template = activePromptTemplate(kind);
    const defaults = promptTemplateBuiltInDefault(kind, template);
    if (defaults) {
      await resetPromptTemplate(kind, template, redraw);
      return;
    }
    const defaultTemplate = meta.defaults[0];
    const templates = promptTemplateList(kind).some((item) => item.id === defaultTemplate.id)
      ? promptTemplateList(kind).map((item) => item.id === defaultTemplate.id ? structuredClone(defaultTemplate) : item)
      : [structuredClone(defaultTemplate), ...promptTemplateList(kind)];
    await savePromptTemplateState(kind, templates, defaultTemplate.id, redraw, t("toast.promptTemplateReset"));
  }

  async function deletePromptTemplate(kind, template, redraw) {
    const meta = promptTemplateMeta(kind);
    if (template.builtIn) return;
    if (!window.confirm(t("promptTemplates.deleteConfirm", { name: promptTemplateLabel(template) || t("promptTemplates.fallbackName") }))) return;
    const templates = promptTemplateList(kind).filter((item) => item.id !== template.id);
    const activeId = state.options[meta.activeKey] === template.id ? (templates[0]?.id || meta.defaultId) : state.options[meta.activeKey];
    await savePromptTemplateState(kind, templates, activeId, redraw, t("toast.promptTemplateDeleted"));
  }

  function promptTemplateRow(kind, template, redraw) {
    const meta = promptTemplateMeta(kind);
    const active = state.options[meta.activeKey] === template.id;
    const builtInDefault = promptTemplateBuiltInDefault(kind, template);
    return el("div", {
      class: `ui-list-row settings-list-row settings-manager-row prompt-template-row ${active ? "prompt-template-row-active" : ""}`.trim(),
      draggable: "true",
      dataset: { promptTemplateId: template.id, promptTemplateKind: kind },
      ondragstart: (event) => startPromptTemplateDrag(event, kind, template),
      ondragend: cleanupPromptTemplateDrag,
      ondragover: (event) => previewPromptTemplateDrop(event, kind, template),
      ondragleave: (event) => event.currentTarget.classList.remove("drop-before", "drop-after"),
      ondrop: (event) => dropPromptTemplate(event, kind, template, redraw)
    },
      settingsDragHandle(t("promptTemplates.title")),
      el("div", { class: "prompt-template-name" },
        el("strong", {}, promptTemplateLabel(template)),
        template.builtIn ? el("span", { class: "summary-collector-star", title: t("promptTemplates.builtIn"), "aria-label": t("promptTemplates.builtIn") }, "★") : null
      ),
      el("label", { class: "settings-check prompt-template-active", title: active ? t("promptTemplates.activeTemplate") : t("promptTemplates.setActive") },
        el("input", {
          type: "checkbox",
          "aria-label": `${promptTemplateLabel(template)} ${t("promptTemplates.active")}`,
          checked: active,
          onchange: async (event) => {
            if (!event.target.checked) {
              event.target.checked = true;
              return;
            }
            await savePromptTemplateState(kind, promptTemplateList(kind), template.id, redraw, t("toast.activeTemplateSaved"));
          }
        })
      ),
      el("p", { class: "prompt-template-preview" }, promptTemplatePreview(template.prompt)),
      el("div", { class: "settings-row-action-group" },
        settingsIconAction(t("promptTemplates.edit", { kind: t(meta.labelKey) }), "edit", () => openPromptTemplateEditor(kind, template, redraw), "", false, "settings.action.edit"),
        builtInDefault
          ? settingsIconAction(t("promptTemplates.reset"), "reset", () => resetPromptTemplate(kind, template, redraw), "settings-reset-icon", false, "settings.action.reset")
          : settingsIconAction(t("promptTemplates.delete"), "trash", () => deletePromptTemplate(kind, template, redraw), "danger", false, "settings.action.delete")
      )
    );
  }

  function promptTemplateListBlock(kind, redraw) {
    const meta = promptTemplateMeta(kind);
    const rows = promptTemplateList(kind).length
      ? promptTemplateList(kind).map((template) => promptTemplateRow(kind, template, redraw))
      : settingsEmptyRow(t("promptTemplates.noTemplates"));
    return settingsBlock(t("promptTemplates.title"), "",
      settingsPaneToolbar(t(meta.copyKey),
        settingsPrimaryAction(t("promptTemplates.add"), "plus", () => openPromptTemplateEditor(kind, null, redraw))
      ),
      settingsList(["", t("promptTemplates.name"), t("promptTemplates.active"), t("promptTemplates.preview"), t("profiles.actions")], rows, "settings-manager-list prompt-template-list")
    );
  }

  function promptApiSettingsBlock(kind, redraw, goToSection) {
    const meta = promptTemplateMeta(kind);
    const profileSelect = select(state.options[meta.profileKey], profileOptions(), {
      onchange: async (event) => {
        state.options = await saveOptionsPatch({ [meta.profileKey]: event.target.value });
        await notifyConfigReload();
        toast(t(meta.profileToastKey), "success");
      }
    });
    return settingsBlock(`${t(meta.labelKey)} AI`, "",
      settingsPaneToolbar(t("summary.configureAi", { kind: t(meta.labelKey) }),
        button(t("summary.resetPrompt"), () => resetActivePromptTemplate(kind, redraw)),
        button(t("summary.manageProfiles"), () => goToSection("profiles"), "primary")
      ),
      field(t("summary.apiProfile"), profileSelect)
    );
  }

  function startPromptTemplateDrag(event, kind, template) {
    state.settingsPromptTemplateDragId = template.id;
    event.currentTarget.classList.add("dragging");
    event.dataTransfer?.setData("application/x-chatclub-prompt-template", template.id);
    event.dataTransfer?.setData("application/x-chatclub-prompt-template-kind", kind);
    event.dataTransfer?.setData("text/plain", template.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function cleanupPromptTemplateDrag() {
    state.settingsPromptTemplateDragId = "";
    cleanupSettingsDragRows(".prompt-template-row");
  }

  function previewPromptTemplateDrop(event, kind, template) {
    const sourceId = state.settingsPromptTemplateDragId || event.dataTransfer?.getData("application/x-chatclub-prompt-template") || "";
    const sourceKind = event.dataTransfer?.getData("application/x-chatclub-prompt-template-kind") || kind;
    if (!sourceId || sourceId === template.id || sourceKind !== kind) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    event.currentTarget.classList.toggle("drop-after", settingsListDropPlacement(event) === "after");
    event.currentTarget.classList.toggle("drop-before", settingsListDropPlacement(event) !== "after");
  }

  async function dropPromptTemplate(event, kind, targetTemplate, redraw) {
    const sourceId = state.settingsPromptTemplateDragId || event.dataTransfer?.getData("application/x-chatclub-prompt-template") || event.dataTransfer?.getData("text/plain") || "";
    const sourceKind = event.dataTransfer?.getData("application/x-chatclub-prompt-template-kind") || kind;
    if (!sourceId || sourceId === targetTemplate.id || sourceKind !== kind) return;
    event.preventDefault();
    const templates = moveListItem(promptTemplateList(kind), sourceId, targetTemplate.id, settingsListDropPlacement(event));
    cleanupPromptTemplateDrag();
    await savePromptTemplateState(kind, templates, state.options[promptTemplateMeta(kind).activeKey], redraw, t("toast.promptTemplateOrderSaved"), { reloadRuntime: false });
  }

  function blocks(redraw, goToSection = () => {}) {
    return [
      promptApiSettingsBlock(kind, redraw, goToSection),
      promptTemplateListBlock(kind, redraw)
    ];
  }

  function reset() {
    cleanupPromptTemplateDrag();
  }

  return Object.freeze({
    blocks,
    reset
  });
}
