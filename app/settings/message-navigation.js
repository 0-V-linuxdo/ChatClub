import {
  MESSAGE_NAVIGATOR_EFFECT_MODES,
  MESSAGE_NAVIGATOR_SITE_CONFIGS,
  normalizeMessageNavigatorEffectMode
} from "../../shared/message-navigator-sites.js";
import { t } from "../../shared/i18n.js";
import { createId } from "../../shared/storage-schema.js";
import {
  button,
  editorModal,
  el,
  field,
  input,
  select,
  textarea,
  toast
} from "../../ui/dom.js";
import {
  cleanupSettingsDragRows,
  createSettingsKit,
  moveListItem
} from "./kit.js";
import {
  requireControllerContext,
  requireControllerFunction,
  validateControllerContract
} from "../controller-contract.js";
import { linesFromText, requireSettingsSectionStatePort } from "./section-contract.js";

export function createMessageNavigationSettingsSection(ctx) {
  const controllerName = "Message navigation settings section";
  ctx = validateControllerContract(ctx, controllerName, {
    state: "object",
    svgIcon: "function",
    notifyConfigReload: "function",
    saveOptionsPatch: "function"
  });
  const state = requireSettingsSectionStatePort(
    requireControllerContext(ctx, controllerName, "state"),
    controllerName,
    ["messageNavigatorSettingsTab", "messageNavigatorSiteExpandedId", "options"]
  );
  const svgIcon = requireControllerFunction(ctx, controllerName, "svgIcon");
  const notifyConfigReload = requireControllerFunction(ctx, controllerName, "notifyConfigReload");
  const saveOptionsPatch = requireControllerFunction(ctx, controllerName, "saveOptionsPatch");
  const {
    settingsBlock,
    settingsDragHandle,
    settingsIconAction,
    settingsInnerTabs,
    settingsList,
    settingsListDropPlacement,
    settingsPaneToolbar,
    settingsPrimaryAction,
    settingsValueChips
  } = createSettingsKit({ svgIcon });
  let siteDragId = "";

  function pane(redraw) {
    const activeTab = state.messageNavigatorSettingsTab === "sites" ? "sites" : "effects";
    state.messageNavigatorSettingsTab = activeTab;
    return el("div", { class: "settings-pane message-navigator-settings-pane" },
      settingsInnerTabs([
        ["effects", t("messageNavigator.effects.title"), t("messageNavigator.effects.tabDesc")],
        ["sites", t("messageNavigator.sites.title"), t("messageNavigator.sites.tabDesc")]
      ], activeTab, (id) => {
        state.messageNavigatorSettingsTab = id;
        redraw();
      }),
      activeTab === "sites" ? sitesBlock(redraw) : effectsBlock(redraw)
    );
  }

  function reset() {
    state.messageNavigatorSiteExpandedId = "";
    state.messageNavigatorSettingsTab = "effects";
    siteDragId = "";
  }

  function effectsBlock(redraw) {
    const preview = effectPreview();
    return settingsBlock(t("messageNavigator.effects.title"), t("messageNavigator.effects.desc"),
      el("div", { class: "message-navigator-effect-layout" },
        el("div", { class: "message-navigator-effect-main" },
          field(t("messageNavigator.effectMode"), select(state.options.messageNavigatorEffectMode || "border", effectOptions(), {
            onchange: async (event) => {
              state.options = await saveOptionsPatch({
                messageNavigatorEffectMode: normalizeMessageNavigatorEffectMode(event.target.value)
              });
              toast(t("toast.messageNavigatorEffectSaved"), "success");
              redraw();
            }
          })),
          preview.action
        ),
        el("div", { class: "message-navigator-effect-aside" }, preview.stage)
      )
    );
  }

  function sitesBlock(redraw) {
    return settingsBlock(t("messageNavigator.sites.title"), t("messageNavigator.sites.desc"),
      settingsPaneToolbar(t("messageNavigator.sites.manage"),
        settingsPrimaryAction(t("messageNavigator.site.add"), "plus", () => openSiteEditor(null, redraw))
      ),
      settingsList([
        "",
        t("messageNavigator.site.name"),
        t("messageNavigator.site.scope"),
        t("messageNavigator.site.enabled"),
        t("messageNavigator.site.actions")
      ], siteRows(redraw), "message-navigator-list")
    );
  }

  function effectPreview() {
    const mode = normalizeMessageNavigatorEffectMode(state.options.messageNavigatorEffectMode || "border");
    const target = el("div", { class: "message-navigator-effect-preview-target", tabindex: "0" },
      el("span", { class: "message-navigator-effect-preview-role" }, "A"),
      el("span", { class: "message-navigator-effect-preview-text" }, t("messageNavigator.preview.message"))
    );
    return {
      stage: el("div", { class: "message-navigator-effect-preview" },
        el("div", { class: "message-navigator-effect-preview-stage" },
          target,
          el("div", { class: "message-navigator-effect-preview-lines", "aria-hidden": "true" },
            el("span", {}),
            el("span", { class: "active" }),
            el("span", {})
          )
        )
      ),
      action: el("button", {
        class: "button button-secondary message-navigator-effect-preview-action",
        type: "button",
        onclick: () => playEffectPreview(target, mode)
      }, svgIcon("preview"), el("span", {}, t("messageNavigator.preview.play")))
    };
  }

  function playEffectPreview(target, mode) {
    if (!target) return;
    const normalized = normalizeMessageNavigatorEffectMode(mode || state.options.messageNavigatorEffectMode || "border");
    const classes = MESSAGE_NAVIGATOR_EFFECT_MODES.map((item) => `chatclub-message-nav-effect-${item}`);
    clearTimeout(target.__chatclubMessageNavigatorPreviewTimer);
    target.classList.remove(...classes);
    if (normalized === "none") return;
    const effectClass = `chatclub-message-nav-effect-${normalized}`;
    try { void target.offsetWidth; } catch {}
    target.classList.add(effectClass);
    target.__chatclubMessageNavigatorPreviewTimer = setTimeout(() => {
      target.classList.remove(effectClass);
    }, normalized === "border" ? 1800 : 1500);
  }

  function effectOptions() {
    return MESSAGE_NAVIGATOR_EFFECT_MODES.map((mode) => ({
      value: mode,
      label: t(`messageNavigator.effect.${mode}`)
    }));
  }

  function builtInDefault(config) {
    return MESSAGE_NAVIGATOR_SITE_CONFIGS.find((item) => item.id === config.id) || null;
  }

  function scopeText(config) {
    const appIds = (config.appIds || []).filter(Boolean);
    if (appIds.length) return appIds.join(", ");
    const hosts = (config.hosts || []).filter(Boolean);
    return hosts.length ? hosts.join(", ") : t("messageNavigator.site.noScope");
  }

  function adapterLabel(adapter) {
    const id = String(adapter || "generic");
    const key = `messageNavigator.adapter.${id}`;
    const label = t(key);
    return label === key ? id : label;
  }

  async function saveSites(configs, redraw) {
    state.options = await saveOptionsPatch({ messageNavigatorSiteConfigs: configs });
    await notifyConfigReload();
    redraw();
  }

  function cleanupSiteDrag() {
    siteDragId = "";
    cleanupSettingsDragRows(".message-navigator-row");
  }

  function startSiteDrag(event, config) {
    siteDragId = config.id;
    event.currentTarget.classList.add("dragging");
    event.dataTransfer?.setData("application/x-chatclub-message-navigator-site", config.id);
    event.dataTransfer?.setData("text/plain", config.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function previewSiteDrop(event, config) {
    const sourceId = siteDragId || event.dataTransfer?.getData("application/x-chatclub-message-navigator-site") || "";
    if (!sourceId || sourceId === config.id) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    event.currentTarget.classList.toggle("drop-after", settingsListDropPlacement(event) === "after");
    event.currentTarget.classList.toggle("drop-before", settingsListDropPlacement(event) !== "after");
  }

  async function dropSite(event, targetConfig, redraw) {
    const sourceId = siteDragId || event.dataTransfer?.getData("application/x-chatclub-message-navigator-site") || event.dataTransfer?.getData("text/plain") || "";
    if (!sourceId || sourceId === targetConfig.id) return;
    event.preventDefault();
    const configs = moveListItem(state.options.messageNavigatorSiteConfigs || [], sourceId, targetConfig.id, settingsListDropPlacement(event));
    cleanupSiteDrag();
    await saveSites(configs, redraw);
  }

  function createSiteDraft() {
    return {
      id: createId("message-navigator"),
      name: "",
      enabled: true,
      builtIn: false,
      appIds: [],
      hosts: [],
      pathPrefixes: [],
      adapter: "generic",
      messageSelector: "",
      userSelector: "",
      assistantSelector: "",
      textCleanupSelectors: [],
      summaryMaxChars: 60
    };
  }

  function openSiteEditor(config, redraw) {
    const editing = Boolean(config);
    const builtIn = config ? builtInDefault(config) : null;
    const draft = structuredClone({
      ...createSiteDraft(),
      ...(config || {}),
      builtIn: Boolean(builtIn)
    });
    const nameInput = input(draft.name || "", { placeholder: t("messageNavigator.site.namePlaceholder") });
    const enabledInput = el("input", { type: "checkbox", checked: draft.enabled !== false });
    const appIdsInput = textarea((draft.appIds || []).join("\n"), { placeholder: "ChatGPT\nKagi" });
    const hostsInput = textarea((draft.hosts || []).join("\n"), { placeholder: "example.com\n*.example.com" });
    const pathInput = textarea((draft.pathPrefixes || []).join("\n"), { placeholder: "/chat/" });
    const adapterSelect = select(draft.adapter || "generic", adapterOptions());
    const selectorInput = textarea(draft.messageSelector || "", { placeholder: "article[data-message-author-role], .message" });
    const userSelectorInput = textarea(draft.userSelector || "", { placeholder: t("common.optional") });
    const assistantSelectorInput = textarea(draft.assistantSelector || "", { placeholder: t("common.optional") });
    const cleanupInput = textarea((draft.textCleanupSelectors || []).join("\n"), { placeholder: "button\nsvg\n[role='toolbar']" });
    const summaryMaxInput = input(String(draft.summaryMaxChars || 60), { type: "number", min: "20", max: "180", step: "5" });
    for (const node of [appIdsInput, hostsInput, pathInput, userSelectorInput, assistantSelectorInput, cleanupInput]) {
      node.classList.add("settings-compact-textarea");
    }
    selectorInput.classList.add("settings-code-textarea");
    let dialog;
    const close = () => dialog.remove();
    const save = async () => {
      const appIds = linesFromText(appIdsInput.value);
      const hosts = linesFromText(hostsInput.value);
      const messageSelector = selectorInput.value.trim();
      if (!nameInput.value.trim()) return toast(t("messageNavigator.site.nameRequired"), "error");
      if (!appIds.length && !hosts.length) return toast(t("messageNavigator.site.matcherRequired"), "error");
      if (!messageSelector) return toast(t("messageNavigator.site.selectorRequired"), "error");
      const nextConfig = {
        ...draft,
        name: nameInput.value.trim(),
        enabled: enabledInput.checked,
        builtIn: Boolean(builtIn),
        appIds,
        hosts,
        pathPrefixes: linesFromText(pathInput.value),
        adapter: adapterSelect.value || "generic",
        messageSelector,
        userSelector: userSelectorInput.value.trim(),
        assistantSelector: assistantSelectorInput.value.trim(),
        textCleanupSelectors: linesFromText(cleanupInput.value),
        summaryMaxChars: Math.max(20, Math.min(180, Number(summaryMaxInput.value) || 60))
      };
      if (!builtIn) {
        nextConfig.builtIn = false;
        delete nextConfig.configVersion;
      }
      const configs = editing
        ? (state.options.messageNavigatorSiteConfigs || []).map((item) => item.id === config.id ? nextConfig : item)
        : [...(state.options.messageNavigatorSiteConfigs || []), nextConfig];
      state.messageNavigatorSiteExpandedId = "";
      await saveSites(configs, redraw);
      toast(t(editing ? "toast.messageNavigatorSiteSaved" : "toast.messageNavigatorSiteAdded"), "success");
      close();
    };
    dialog = editorModal(t(editing ? "messageNavigator.site.editTitle" : "messageNavigator.site.addTitle"),
      el("div", { class: "settings-editor-form message-navigator-editor" },
        el("div", { class: "settings-dialog-grid message-navigator-grid" },
          field(t("messageNavigator.site.name"), nameInput),
          el("label", { class: "settings-dialog-check" }, enabledInput, el("span", {}, t("common.enabled"))),
          field(t("messageNavigator.site.appIds"), el("div", { class: "settings-field-stack" },
            appIdsInput, el("small", {}, t("messageNavigator.site.appIdsHelp"))
          )),
          field(t("messageNavigator.site.hosts"), el("div", { class: "settings-field-stack" },
            hostsInput, el("small", {}, t("messageNavigator.site.hostHelp"))
          )),
          field(t("messageNavigator.site.pathPrefixes"), el("div", { class: "settings-field-stack" },
            pathInput, el("small", {}, t("messageNavigator.site.pathHelp"))
          )),
          field(t("messageNavigator.site.adapter"), adapterSelect),
          field(t("messageNavigator.site.summaryMaxChars"), summaryMaxInput)
        ),
        el("div", { class: "settings-info-callout" },
          svgIcon("navigator"),
          el("div", {},
            el("strong", {}, t("messageNavigator.site.infoTitle")),
            el("p", {}, t("messageNavigator.site.infoBody")),
            builtIn ? el("small", {}, t("messageNavigator.site.builtInAutoUpdate")) : null
          )
        ),
        field(t("messageNavigator.site.messageSelector"), selectorInput),
        el("div", { class: "settings-dialog-grid message-navigator-selector-grid" },
          field(t("messageNavigator.site.userSelector"), userSelectorInput),
          field(t("messageNavigator.site.assistantSelector"), assistantSelectorInput),
          field(t("messageNavigator.site.cleanupSelectors"), cleanupInput)
        ),
        el("div", { class: "settings-dialog-actions" },
          builtIn ? button(t("messageNavigator.site.resetBuiltIn"), async () => {
            await resetSite(config, redraw);
            close();
          }) : null,
          button(t("common.cancel"), close),
          button(editing ? t("common.save") : t("common.add"), save, "primary")
        )
      ),
      close,
      true,
      t("common.close")
    );
    dialog.querySelector(".modal")?.classList.add("settings-editor-modal");
  }

  function adapterOptions() {
    const ids = ["generic", ...MESSAGE_NAVIGATOR_SITE_CONFIGS.map((item) => item.adapter)].filter(Boolean);
    return Array.from(new Set(ids)).map((id) => ({ value: id, label: adapterLabel(id) }));
  }

  function siteRows(redraw) {
    return (state.options.messageNavigatorSiteConfigs || []).flatMap((config) => {
      const expanded = state.messageNavigatorSiteExpandedId === config.id;
      const row = siteRow(config, expanded, redraw);
      if (!expanded) return row;
      return [row, siteDetails(config)];
    });
  }

  function siteRow(config, expanded, redraw) {
    const builtIn = Boolean(builtInDefault(config));
    return el("div", {
      class: `ui-list-row settings-list-row message-navigator-row ${expanded ? "message-navigator-row-active" : ""}`.trim(),
      draggable: "true",
      dataset: { messageNavigatorSiteId: config.id },
      onclick: (event) => {
        if (event.target instanceof Element && event.target.closest("button,input,select,a,.settings-drag-handle")) return;
        state.messageNavigatorSiteExpandedId = expanded ? "" : config.id;
        redraw();
      },
      ondragstart: (event) => startSiteDrag(event, config),
      ondragend: cleanupSiteDrag,
      ondragover: (event) => previewSiteDrop(event, config),
      ondragleave: (event) => event.currentTarget.classList.remove("drop-before", "drop-after"),
      ondrop: (event) => dropSite(event, config, redraw)
    },
      settingsDragHandle(t("messageNavigator.site.drag")),
      el("div", { class: "message-navigator-name" },
        el("strong", {}, config.name || config.id),
        builtIn ? el("span", { class: "summary-collector-star", title: t("messageNavigator.site.builtIn"), "aria-label": t("messageNavigator.site.builtIn") }, "★") : null
      ),
      el("span", { class: "message-navigator-scope-badge" }, scopeText(config)),
      el("label", { class: "settings-check", title: config.enabled === false ? t("common.disabled") : t("common.enabled") },
        el("input", {
          type: "checkbox",
          "aria-label": `${config.name || config.id} ${t("messageNavigator.site.enabled")}`,
          checked: config.enabled !== false,
          onchange: async (event) => {
            const configs = (state.options.messageNavigatorSiteConfigs || []).map((item) => item.id === config.id ? { ...item, enabled: event.target.checked } : item);
            await saveSites(configs, redraw);
            toast(event.target.checked ? t("toast.messageNavigatorSiteEnabled") : t("toast.messageNavigatorSiteDisabled"), "success");
          }
        })
      ),
      el("div", { class: "settings-row-actions" },
        settingsIconAction(t("common.edit"), "edit", (event) => {
          event.stopPropagation();
          openSiteEditor(config, redraw);
        }, "", false, "settings.action.edit"),
        builtIn
          ? settingsIconAction(t("common.reset"), "reset", async (event) => {
            event.stopPropagation();
            await resetSite(config, redraw);
          }, "settings-reset-icon", !canReset(config), "settings.action.reset")
          : settingsIconAction(t("common.delete"), "trash", async (event) => {
            event.stopPropagation();
            await deleteSite(config, redraw);
          }, "danger", false, "settings.action.delete")
      )
    );
  }

  function canReset(config) {
    const defaults = builtInDefault(config);
    if (!defaults) return false;
    const keys = ["name", "adapter", "messageSelector", "userSelector", "assistantSelector", "summaryMaxChars"];
    return keys.some((key) => JSON.stringify(config[key] ?? "") !== JSON.stringify(defaults[key] ?? ""))
      || JSON.stringify(config.hosts || []) !== JSON.stringify(defaults.hosts || [])
      || JSON.stringify(config.pathPrefixes || []) !== JSON.stringify(defaults.pathPrefixes || [])
      || JSON.stringify(config.appIds || []) !== JSON.stringify(defaults.appIds || [])
      || JSON.stringify(config.textCleanupSelectors || []) !== JSON.stringify(defaults.textCleanupSelectors || []);
  }

  function siteDetails(config) {
    return el("div", { class: "message-navigator-details summary-collector-details" },
      el("div", { class: "summary-collector-details-grid" },
        field(t("messageNavigator.site.appIds"), settingsValueChips(config.appIds, t("messageNavigator.site.noAppIds"))),
        field(t("messageNavigator.site.hosts"), settingsValueChips(config.hosts, t("messageNavigator.site.noHosts"))),
        field(t("messageNavigator.site.pathPrefixes"), settingsValueChips(config.pathPrefixes, t("messageNavigator.site.noPathPrefixes"))),
        field(t("messageNavigator.site.adapter"), el("div", { class: "summary-script-meta" },
          el("strong", {}, adapterLabel(config.adapter)),
          el("small", {}, config.builtIn ? t("messageNavigator.site.builtInAutoUpdate") : t("messageNavigator.site.customConfig"))
        )),
        field(t("messageNavigator.site.messageSelector"), el("div", { class: "summary-script-meta" },
          el("code", {}, config.messageSelector || t("messageNavigator.site.noSelector")),
          el("small", {}, t("messageNavigator.site.summaryMaxCharsValue", { count: config.summaryMaxChars || 60 }))
        )),
        field(t("messageNavigator.site.status"), el("div", { class: "summary-script-meta" },
          el("span", {}, config.enabled === false ? t("common.disabled") : t("common.enabled")),
          el("small", {}, config.enabled === false ? t("messageNavigator.site.disabledHelp") : t("messageNavigator.site.enabledHelp"))
        ))
      )
    );
  }

  async function resetSite(config, redraw) {
    const defaults = builtInDefault(config);
    if (!defaults) return;
    const configs = (state.options.messageNavigatorSiteConfigs || []).map((item) => {
      if (item.id !== config.id) return item;
      return { ...structuredClone(defaults), enabled: item.enabled !== false };
    });
    state.messageNavigatorSiteExpandedId = "";
    await saveSites(configs, redraw);
    toast(t("toast.messageNavigatorSiteReset"), "success");
  }

  async function deleteSite(config, redraw) {
    if (builtInDefault(config)) return;
    if (!window.confirm(t("messageNavigator.site.deleteConfirm", { name: config.name || config.id }))) return;
    const configs = (state.options.messageNavigatorSiteConfigs || []).filter((item) => item.id !== config.id);
    state.messageNavigatorSiteExpandedId = "";
    await saveSites(configs, redraw);
    toast(t("toast.messageNavigatorSiteDeleted"), "success");
  }

  return Object.freeze({ pane, reset });
}
