import { TOPIC_DELETE_SITE_CONFIGS, loadBuiltInTopicDeleteSource } from "../../shared/topic-delete-sites.js";
import { t } from "../../shared/i18n.js";
import { createId } from "../../shared/storage-schema.js";
import {
  button,
  editorModal,
  el,
  field,
  input,
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

export function createTopicDeletionSettingsSection(ctx) {
  const controllerName = "Topic deletion settings section";
  ctx = validateControllerContract(ctx, controllerName, {
    state: "object",
    svgIcon: "function",
    notifyConfigReload: "function",
    saveOptionsPatch: "function",
    ensureUserScriptsPermission: "function"
  });
  const state = requireSettingsSectionStatePort(
    requireControllerContext(ctx, controllerName, "state"),
    controllerName,
    ["options", "topicDeleteSiteExpandedId"]
  );
  const svgIcon = requireControllerFunction(ctx, controllerName, "svgIcon");
  const notifyConfigReload = requireControllerFunction(ctx, controllerName, "notifyConfigReload");
  const saveOptionsPatch = requireControllerFunction(ctx, controllerName, "saveOptionsPatch");
  const ensureUserScriptsPermission = requireControllerFunction(ctx, controllerName, "ensureUserScriptsPermission");
  const {
    settingsBlock,
    settingsDragHandle,
    settingsIconAction,
    settingsList,
    settingsListDropPlacement,
    settingsPaneToolbar,
    settingsPrimaryAction
  } = createSettingsKit({ svgIcon });
  let siteDragId = "";

  function pane(redraw) {
    return el("div", { class: "settings-pane" },
      settingsBlock(t("topicDeletion.sites.title"), t("topicDeletion.sites.desc"),
        settingsPaneToolbar(t("topicDeletion.sites.manage"),
          settingsPrimaryAction(t("topicDeletion.site.add"), "plus", () => openSiteEditor(null, redraw))
        ),
        settingsList([
          "",
          t("topicDeletion.site.name"),
          t("topicDeletion.site.scope"),
          t("topicDeletion.site.enabled"),
          t("topicDeletion.site.actions")
        ], siteRows(redraw), "topic-delete-list")
      )
    );
  }

  function builtInDefault(config) {
    return TOPIC_DELETE_SITE_CONFIGS.find((item) => item.id === config.id) || null;
  }

  function scopeText(config) {
    const appIds = (config.appIds || []).filter(Boolean);
    if (appIds.length) return appIds.join(", ");
    const hosts = (config.hosts || []).filter(Boolean);
    return hosts.length ? hosts.join(", ") : t("topicDeletion.site.noScope");
  }

  async function saveSites(configs, redraw) {
    state.options = await saveOptionsPatch({ topicDeleteSiteConfigs: configs });
    await notifyConfigReload();
    redraw();
  }

  function cleanupSiteDrag() {
    siteDragId = "";
    cleanupSettingsDragRows(".topic-delete-row");
  }

  function startSiteDrag(event, config) {
    siteDragId = config.id;
    event.currentTarget.classList.add("dragging");
    event.dataTransfer?.setData("application/x-chatclub-topic-delete-site", config.id);
    event.dataTransfer?.setData("text/plain", config.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function previewSiteDrop(event, config) {
    const sourceId = siteDragId || event.dataTransfer?.getData("application/x-chatclub-topic-delete-site") || "";
    if (!sourceId || sourceId === config.id) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    event.currentTarget.classList.toggle("drop-after", settingsListDropPlacement(event) === "after");
    event.currentTarget.classList.toggle("drop-before", settingsListDropPlacement(event) !== "after");
  }

  async function dropSite(event, targetConfig, redraw) {
    const sourceId = siteDragId || event.dataTransfer?.getData("application/x-chatclub-topic-delete-site") || event.dataTransfer?.getData("text/plain") || "";
    if (!sourceId || sourceId === targetConfig.id) return;
    event.preventDefault();
    const configs = moveListItem(state.options.topicDeleteSiteConfigs || [], sourceId, targetConfig.id, settingsListDropPlacement(event));
    cleanupSiteDrag();
    await saveSites(configs, redraw);
  }

  function userscript(config) {
    return typeof config?.customUserscript === "string" ? config.customUserscript : "";
  }

  function sourceMode(config) {
    return config?.sourceMode === "custom" || Boolean(config?.customUserscript || config?.userscriptOverride)
      ? "custom"
      : "builtIn";
  }

  function sourceLabel(config) {
    return sourceMode(config) === "custom"
      ? t("topicDeletion.site.customNoAutoUpdate")
      : t("topicDeletion.site.builtInAutoUpdate");
  }

  function userscriptRuntimeLabel(config) {
    const source = userscript(config);
    if (sourceMode(config) !== "custom") return t("topicDeletion.site.standaloneRuntime");
    return /\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/.test(source)
      ? t("topicDeletion.site.standaloneRuntime")
      : t("topicDeletion.site.legacyRuntime");
  }

  async function copyUserscript(source) {
    try {
      await navigator.clipboard.writeText(String(source || ""));
      toast(t("toast.topicDeleteUserscriptCopied"), "success");
    } catch (error) {
      console.warn("[ChatClub] Failed to copy Delete Site userscript", error);
      toast(t("toast.copyFailed"), "error");
    }
  }

  function createSiteDraft() {
    return {
      id: createId("topic-delete"),
      name: "",
      enabled: true,
      builtIn: false,
      appIds: [],
      hosts: [],
      pathPrefixes: [],
      userscriptTimeoutMs: 15000,
      userscript: ""
    };
  }

  async function openSiteEditor(config, redraw) {
    const editing = Boolean(config);
    const builtIn = config ? builtInDefault(config) : null;
    let defaultUserscript = "";
    if (builtIn) {
      try {
        defaultUserscript = await loadBuiltInTopicDeleteSource(builtIn.id);
      } catch (error) {
        console.error("[ChatClub] Failed to load Delete Site userscript", error);
        toast(error?.message || String(error), "error");
        return;
      }
    }
    let currentSourceMode = builtIn ? sourceMode(config || {}) : "custom";
    const draft = structuredClone({
      ...createSiteDraft(),
      ...(config || {}),
      builtIn: Boolean(builtIn),
      sourceMode: currentSourceMode
    });
    draft.userscript = config ? (currentSourceMode === "custom" ? userscript(config) : defaultUserscript) : "";
    const nameInput = input(draft.name || "", { placeholder: t("topicDeletion.site.namePlaceholder") });
    const enabledInput = el("input", { type: "checkbox", checked: draft.enabled !== false });
    const appIdsInput = textarea((draft.appIds || []).join("\n"), { placeholder: "Kagi\nGrok" });
    const hostsInput = textarea((draft.hosts || []).join("\n"), { placeholder: "example.com\n*.example.com" });
    const pathInput = textarea((draft.pathPrefixes || []).join("\n"), { placeholder: "/chat/" });
    const timeoutInput = input(String(draft.userscriptTimeoutMs || 15000), { type: "number", min: "5000", max: "45000", step: "1000" });
    const userscriptInput = textarea(draft.userscript || "", { placeholder: "// ==UserScript==\n// @name Custom Delete Site\n// ==/UserScript==\n..." });
    userscriptInput.readOnly = Boolean(builtIn && currentSourceMode !== "custom");
    appIdsInput.classList.add("settings-compact-textarea");
    hostsInput.classList.add("settings-compact-textarea");
    pathInput.classList.add("settings-compact-textarea");
    userscriptInput.classList.add("settings-code-textarea");
    let dialog;
    const close = () => dialog.remove();
    const save = async () => {
      const appIds = linesFromText(appIdsInput.value);
      const hosts = linesFromText(hostsInput.value);
      const source = userscriptInput.value;
      if (!nameInput.value.trim()) return toast(t("topicDeletion.site.nameRequired"), "error");
      if (!appIds.length && !hosts.length) return toast(t("topicDeletion.site.matcherRequired"), "error");
      if (currentSourceMode === "custom" && !source.trim()) return toast(t("topicDeletion.site.userscriptRequired"), "error");
      if (currentSourceMode === "custom" && !await ensureUserScriptsPermission()) return;
      const timeout = Math.max(5000, Math.min(45000, Number(timeoutInput.value) || 15000));
      const nextConfig = {
        ...draft,
        name: nameInput.value.trim(),
        enabled: enabledInput.checked,
        builtIn: Boolean(builtIn),
        appIds,
        hosts,
        pathPrefixes: linesFromText(pathInput.value),
        userscriptTimeoutMs: timeout,
        sourceMode: currentSourceMode,
        userscriptLength: (currentSourceMode === "custom" ? source : defaultUserscript).length
      };
      if (currentSourceMode === "custom") nextConfig.customUserscript = source;
      else delete nextConfig.customUserscript;
      delete nextConfig.userscript;
      delete nextConfig.userscriptOverride;
      if (!builtIn) {
        nextConfig.builtIn = false;
        delete nextConfig.userscriptFile;
        nextConfig.sourceMode = "custom";
      }
      const configs = editing
        ? (state.options.topicDeleteSiteConfigs || []).map((item) => item.id === config.id ? nextConfig : item)
        : [...(state.options.topicDeleteSiteConfigs || []), nextConfig];
      state.topicDeleteSiteExpandedId = "";
      await saveSites(configs, redraw);
      toast(t(editing ? "toast.topicDeleteSiteSaved" : "toast.topicDeleteSiteAdded"), "success");
      close();
    };
    dialog = editorModal(t(editing ? "topicDeletion.site.editTitle" : "topicDeletion.site.addTitle"),
      el("div", { class: "settings-editor-form topic-delete-editor" },
        el("div", { class: "settings-dialog-grid topic-delete-grid" },
          field(t("topicDeletion.site.name"), nameInput),
          el("label", { class: "settings-dialog-check" }, enabledInput, el("span", {}, t("common.enabled"))),
          field(t("topicDeletion.site.appIds"), el("div", { class: "settings-field-stack" },
            appIdsInput, el("small", {}, t("topicDeletion.site.appIdsHelp"))
          )),
          field(t("topicDeletion.site.hosts"), el("div", { class: "settings-field-stack" },
            hostsInput, el("small", {}, t("topicDeletion.site.hostHelp"))
          )),
          field(t("topicDeletion.site.pathPrefixes"), el("div", { class: "settings-field-stack" },
            pathInput, el("small", {}, t("topicDeletion.site.pathHelp"))
          )),
          field(t("topicDeletion.site.timeout"), timeoutInput)
        ),
        el("div", { class: "settings-info-callout" },
          svgIcon("trash"),
          el("div", {},
            el("strong", {}, t("topicDeletion.site.infoTitle")),
            el("p", {}, t("topicDeletion.site.infoBody")),
            builtIn ? el("small", {}, sourceLabel({ ...draft, sourceMode: currentSourceMode })) : null
          )
        ),
        field(t("topicDeletion.site.userscript"), userscriptInput),
        el("div", { class: "settings-dialog-actions" },
          button(t("topicDeletion.site.copyUserscript"), () => copyUserscript(userscriptInput.value)),
          builtIn ? button(t("topicDeletion.site.editCopy"), () => {
            currentSourceMode = "custom";
            userscriptInput.readOnly = false;
            userscriptInput.focus();
          }) : null,
          builtIn ? button(t("topicDeletion.site.resetBuiltIn"), async () => {
            await resetSite(config, redraw);
            close();
          }) : null,
          button(t("common.cancel"), close),
          button(editing ? t("common.save") : t("common.add"), save, "primary")
        )
      ),
      close,
      false,
      t("common.close")
    );
    dialog.querySelector(".modal")?.classList.add("settings-editor-modal");
  }

  function siteRows(redraw) {
    return (state.options.topicDeleteSiteConfigs || []).flatMap((config) => {
      const expanded = state.topicDeleteSiteExpandedId === config.id;
      const row = siteRow(config, expanded, redraw);
      if (!expanded) return row;
      return [row, siteDetails(config)];
    });
  }

  function siteRow(config, expanded, redraw) {
    const builtIn = Boolean(builtInDefault(config));
    return el("div", {
      class: `ui-list-row settings-list-row topic-delete-row ${expanded ? "topic-delete-row-active" : ""}`.trim(),
      draggable: "true",
      dataset: { topicDeleteSiteId: config.id },
      onclick: (event) => {
        if (event.target instanceof Element && event.target.closest("button,input,select,a,.settings-drag-handle")) return;
        state.topicDeleteSiteExpandedId = expanded ? "" : config.id;
        redraw();
      },
      ondragstart: (event) => startSiteDrag(event, config),
      ondragend: cleanupSiteDrag,
      ondragover: (event) => previewSiteDrop(event, config),
      ondragleave: (event) => event.currentTarget.classList.remove("drop-before", "drop-after"),
      ondrop: (event) => dropSite(event, config, redraw)
    },
      settingsDragHandle(t("topicDeletion.site.drag")),
      el("div", { class: "topic-delete-name" },
        el("strong", {}, config.name || config.id),
        builtIn ? el("span", { class: "summary-collector-star", title: t("topicDeletion.site.builtIn"), "aria-label": t("topicDeletion.site.builtIn") }, "★") : null
      ),
      el("span", { class: "topic-delete-scope-badge" }, scopeText(config)),
      el("label", { class: "settings-check", title: config.enabled === false ? t("common.disabled") : t("common.enabled") },
        el("input", {
          type: "checkbox",
          "aria-label": `${config.name || config.id} ${t("topicDeletion.site.enabled")}`,
          checked: config.enabled !== false,
          onchange: async (event) => {
            if (event.target.checked && sourceMode(config) === "custom" && !await ensureUserScriptsPermission()) {
              event.target.checked = false;
              return;
            }
            const configs = (state.options.topicDeleteSiteConfigs || []).map((item) => item.id === config.id ? { ...item, enabled: event.target.checked } : item);
            await saveSites(configs, redraw);
            toast(event.target.checked ? t("toast.topicDeleteSiteEnabled") : t("toast.topicDeleteSiteDisabled"), "success");
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
    return sourceMode(config) === "custom";
  }

  function siteDetails(config) {
    const chips = (items, emptyKey) => {
      const values = (items || []).filter(Boolean);
      return el("div", { class: "summary-host-chips" },
        values.length
          ? values.map((item) => el("code", {}, item))
          : el("span", { class: "muted" }, t(emptyKey))
      );
    };
    return el("div", { class: "topic-delete-details summary-collector-details" },
      el("div", { class: "summary-collector-details-grid" },
        field(t("topicDeletion.site.appIds"), chips(config.appIds, "topicDeletion.site.noAppIds")),
        field(t("topicDeletion.site.hosts"), chips(config.hosts, "topicDeletion.site.noHosts")),
        field(t("topicDeletion.site.pathPrefixes"), chips(config.pathPrefixes, "topicDeletion.site.noPathPrefixes")),
        field(t("topicDeletion.site.userscript"), el("div", { class: "summary-script-meta" },
          el("strong", {}, config.userscriptFile || t("topicDeletion.site.inlineRuntime")),
          el("small", {}, userscriptRuntimeLabel(config)),
          el("small", {}, sourceLabel(config)),
          el("span", {}, config.userscriptLength ? t("topicDeletion.site.chars", { count: config.userscriptLength }) : t("topicDeletion.site.noUserscript")),
          sourceMode(config) === "custom" ? el("small", {}, t("topicDeletion.site.override")) : null
        )),
        field(t("topicDeletion.site.timeout"), el("div", { class: "summary-script-meta" },
          el("span", {}, t("topicDeletion.site.timeoutMs", { count: config.userscriptTimeoutMs || 15000 }))
        )),
        field(t("topicDeletion.site.status"), el("div", { class: "summary-script-meta" },
          el("span", {}, config.enabled === false ? t("common.disabled") : t("common.enabled")),
          el("small", {}, config.enabled === false ? t("topicDeletion.site.disabledHelp") : t("topicDeletion.site.enabledHelp"))
        ))
      )
    );
  }

  async function resetSite(config, redraw) {
    const defaults = builtInDefault(config);
    if (!defaults) return;
    const configs = (state.options.topicDeleteSiteConfigs || []).map((item) => {
      if (item.id !== config.id) return item;
      const next = {
        ...item,
        userscriptFile: defaults.userscriptFile,
        scriptType: defaults.scriptType,
        scriptId: defaults.scriptId,
        scriptVersion: defaults.scriptVersion,
        builtIn: true,
        sourceMode: "builtIn",
        userscriptLength: defaults.userscriptLength
      };
      delete next.customUserscript;
      delete next.userscript;
      delete next.userscriptOverride;
      return next;
    });
    state.topicDeleteSiteExpandedId = "";
    await saveSites(configs, redraw);
    toast(t("toast.topicDeleteSiteReset"), "success");
  }

  async function deleteSite(config, redraw) {
    if (builtInDefault(config)) return;
    if (!window.confirm(t("topicDeletion.site.deleteConfirm", { name: config.name || config.id }))) return;
    const configs = (state.options.topicDeleteSiteConfigs || []).filter((item) => item.id !== config.id);
    state.topicDeleteSiteExpandedId = "";
    await saveSites(configs, redraw);
    toast(t("toast.topicDeleteSiteDeleted"), "success");
  }

  return Object.freeze({ pane });
}
