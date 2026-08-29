import { SUMMARY_SITE_CONFIGS, loadBuiltInSummarySource } from "../../shared/summary-sites.js";
import { t } from "../../shared/i18n.js";
import { createId } from "../../shared/storage-schema.js";
import { storageGet, storageSet } from "../../shared/storage-adapter.js";
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
import { createSettingsKit, moveListItemByDelta } from "./kit.js";
import { linesFromText, requireSettingsSectionStatePort } from "./section-contract.js";
import { createPromptTemplateSettings } from "./prompt-templates.js";
import {
  requireControllerContext,
  requireControllerFunction,
  validateControllerContract
} from "../controller-contract.js";

export function createSummarySettingsSection(ctx) {
  const controllerName = "Summary settings section";
  ctx = validateControllerContract(ctx, controllerName, {
    state: "object",
    svgIcon: "function",
    notifyConfigReload: "function",
    saveOptionsPatch: "function",
    ensureUserScriptsPermission: "function",
    probeSummaryCollector: "function?",
    userScriptsPermissionContains: "function?"
  });
  const state = requireSettingsSectionStatePort(
    requireControllerContext(ctx, controllerName, "state"),
    controllerName,
    [
      "options",
      "settingsPromptTemplateDragId",
      "summaryCollectorDragId",
      "summaryCollectorEditingId",
      "summaryCollectorLastRun",
      "summarySettingsTab"
    ]
  );
  const svgIcon = requireControllerFunction(ctx, controllerName, "svgIcon");
  const notifyConfigReload = requireControllerFunction(ctx, controllerName, "notifyConfigReload");
  const saveOptionsPatch = requireControllerFunction(ctx, controllerName, "saveOptionsPatch");
  const ensureUserScriptsPermission = requireControllerFunction(ctx, controllerName, "ensureUserScriptsPermission");
  const probeSummaryCollector = typeof ctx.probeSummaryCollector === "function" ? ctx.probeSummaryCollector : null;
  const userScriptsPermissionContains = typeof ctx.userScriptsPermissionContains === "function"
    ? ctx.userScriptsPermissionContains
    : null;
  const settingsKit = createSettingsKit({ svgIcon });
  const {
    settingsBlock,
    settingsReorderHandle,
    settingsIconAction,
    settingsInnerTabs,
    settingsList,
    settingsPaneToolbar,
    settingsPrimaryAction
  } = settingsKit;
  const promptTemplates = createPromptTemplateSettings({
    kind: "summary",
    state,
    notifyConfigReload,
    saveOptionsPatch,
    settingsKit
  });

  function recordFullTextBlock(redraw) {
    const enabled = state.options.recordFullText === true;
    const toggle = el("input", {
      type: "checkbox",
      role: "switch",
      checked: enabled,
      "aria-label": t("summary.recordFullText")
    });
    toggle.addEventListener("change", async () => {
      state.options = await saveOptionsPatch({ recordFullText: toggle.checked === true });
      redraw();
    });
    return settingsBlock(
      t("summary.recordFullText"),
      t("summary.recordFullTextHelp"),
      el("label", { class: "appearance-toggle-control" },
        el("span", { class: "appearance-toggle-copy" },
          el("strong", {}, t("common.enabled"))
        ),
        toggle
      )
    );
  }

  function summaryPromptSettingsBlock(redraw, goToSection = () => {}) {
    return el("div", { class: "settings-template-pane" }, promptTemplates.blocks(redraw, goToSection));
  }

  function summaryScriptsSettingsBlock(redraw) {
    return settingsBlock(t("summary.collectors.title"), t("summary.collectors.desc"),
      settingsPaneToolbar(t("summary.collectors.manage"),
        settingsPrimaryAction(t("summary.collector.add"), "plus", () => openSummaryCollectorEditor(null, redraw))
      ),
      settingsList(["", t("summary.collector.name"), t("summary.collector.fallback"), t("summary.collector.enabled"), t("summary.collector.actions")], summaryCollectorRows(redraw), "summary-collector-list")
    );
  }

  function summarySettingsPane(redraw, goToSection = () => {}) {
    void loadCollectorLastRun().then((loaded) => { if (loaded) redraw(); });
    const active = state.summarySettingsTab === "scripts" ? "scripts" : "ai";
    return el("div", { class: "settings-pane" },
      recordFullTextBlock(redraw),
      settingsInnerTabs([
        ["ai", t("summary.aiTab"), t("summary.aiTabDesc")],
        ["scripts", t("summary.scriptsTab"), t("summary.scriptsTabDesc")]
      ], active, (id) => {
        state.summarySettingsTab = id;
        if (id !== "scripts") state.summaryCollectorEditingId = "";
        redraw();
      }),
      active === "scripts" ? summaryScriptsSettingsBlock(redraw) : summaryPromptSettingsBlock(redraw, goToSection)
    );
  }

  function summaryFallbackLabel(mode) {
    return mode === "allowPageText" ? t("summary.collector.pageText") : t("summary.collector.structured");
  }

  function summaryHostsText(config) {
    return (config.hosts || []).join(", ") || t("summary.collector.noHosts");
  }

  function summaryBuiltInDefault(config) {
    return SUMMARY_SITE_CONFIGS.find((item) => item.id === config.id) || null;
  }

  async function saveSummaryCollectors(configs, redraw, options = {}) {
    state.options = await saveOptionsPatch({ summarySiteConfigs: configs });
    if (options.reloadRuntime !== false) await notifyConfigReload();
    redraw();
  }

  function summaryCollectorUserscript(config) {
    return typeof config?.customUserscript === "string" ? config.customUserscript : "";
  }

  function summaryCollectorSourceMode(config) {
    return config?.sourceMode === "custom" || Boolean(config?.customUserscript || config?.userscriptOverride)
      ? "custom"
      : "builtIn";
  }

  function summaryCollectorSourceLabel(config) {
    return summaryCollectorSourceMode(config) === "custom"
      ? t("summary.collector.customNoAutoUpdate")
      : t("summary.collector.builtInAutoUpdate");
  }

  const SUMMARY_COLLECTOR_LAST_RUN_KEY = "chatclub.summaryCollectorLastRun.v1";
  let lastRunHydrated = false;

  function normalizeOfficialHits(hits) {
    if (!hits || typeof hits !== "object" || Array.isArray(hits)) return null;
    return {
      conversationRoots: Math.max(0, Number(hits.conversationRoots) || 0),
      messageRoots: Math.max(0, Number(hits.messageRoots) || 0),
      classified: Math.max(0, Number(hits.classified) || 0),
      user: Math.max(0, Number(hits.user) || 0),
      assistant: Math.max(0, Number(hits.assistant) || 0),
      droppedNoRole: Math.max(0, Number(hits.droppedNoRole) || 0),
      droppedNoText: Math.max(0, Number(hits.droppedNoText) || 0)
    };
  }

  function normalizeCollectorLastRun(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const collectorId = String(value.collectorId || "").trim();
    if (!collectorId) return null;
    return {
      collectorId,
      ok: value.ok === true,
      turnCount: Math.max(0, Number(value.turnCount) || 0),
      stage: String(value.stage || "none"),
      officialHits: normalizeOfficialHits(value.officialHits),
      error: String(value.error || ""),
      href: String(value.href || ""),
      at: Number(value.at) || 0
    };
  }

  async function loadCollectorLastRun() {
    if (lastRunHydrated) return false;
    lastRunHydrated = true;
    try {
      const stored = normalizeCollectorLastRun(await storageGet(SUMMARY_COLLECTOR_LAST_RUN_KEY));
      if (stored && !state.summaryCollectorLastRun) {
        state.summaryCollectorLastRun = stored;
        return true;
      }
    } catch {}
    return false;
  }

  async function persistCollectorLastRun(run) {
    const normalized = normalizeCollectorLastRun(run);
    state.summaryCollectorLastRun = normalized;
    if (!normalized) return;
    try { await storageSet(SUMMARY_COLLECTOR_LAST_RUN_KEY, normalized); } catch {}
  }

  function formatCollectorStage(stage) {
    const key = `summary.collector.stage.${String(stage || "none")}`;
    const label = t(key);
    return label === key ? String(stage || "none") : label;
  }

  function formatOfficialHits(hits) {
    const normalized = normalizeOfficialHits(hits);
    if (!normalized) return "";
    return t("summary.collector.hits", {
      roots: normalized.conversationRoots,
      messages: normalized.messageRoots,
      user: normalized.user,
      assistant: normalized.assistant
    });
  }

  function formatCollectorLastRun(run) {
    if (!run) return t("summary.collector.lastRunNone");
    const stage = formatCollectorStage(run.stage);
    const hits = formatOfficialHits(run.officialHits);
    const detail = [stage, hits].filter(Boolean).join(" · ");
    if (run.ok) {
      const base = t("summary.collector.probeOk", { count: Number(run.turnCount) || 0 });
      return detail ? `${base} · ${detail}` : base;
    }
    if (run.error === "no-frame") return t("summary.collector.noActiveFrame");
    const fail = t("summary.collector.probeFail", { error: run.error || t("common.failed") });
    return detail ? `${fail} · ${detail}` : fail;
  }

  function summaryCollectorRunModeLabel(mode) {
    return mode === "pageWorldFirst" ? t("summary.collector.pageWorldFirst") : t("summary.collector.serialBridge");
  }

  function createSummaryCollectorDraft() {
    return {
      id: createId("summary-collector"),
      name: "",
      enabled: true,
      builtIn: false,
      fallbackMode: "structuredOnly",
      hosts: [],
      pathPrefixes: [],
      userscriptRunMode: "serial",
      userscriptTimeoutMs: 24000,
      copyTimeoutMs: "",
      userscript: ""
    };
  }

  async function openSummaryCollectorEditor(config, redraw) {
    const editing = Boolean(config);
    const builtIn = config ? summaryBuiltInDefault(config) : null;
    let builtInUserscript = "";
    if (builtIn) {
      try { builtInUserscript = await loadBuiltInSummarySource(builtIn.id); }
      catch (error) {
        console.error("[ChatClub] Failed to load Summary userscript", error);
        toast(error?.message || String(error), "error");
        return;
      }
    }
    let sourceMode = builtIn
      ? summaryCollectorSourceMode(config || {})
      : "custom";
    const draft = structuredClone({
      ...createSummaryCollectorDraft(),
      ...(config || {}),
      builtIn: Boolean(builtIn),
      sourceMode,
      userscript: sourceMode === "custom" ? summaryCollectorUserscript(config || {}) : builtInUserscript
    });
    const nameInput = input(draft.name || "", { placeholder: t("summary.collector.namePlaceholder") });
    const enabledInput = el("input", { type: "checkbox", checked: draft.enabled !== false });
    const hostsInput = textarea((draft.hosts || []).join("\n"), { placeholder: "chatgpt.com\n*.chatgpt.com" });
    const pathInput = textarea((draft.pathPrefixes || []).join("\n"), { placeholder: "/assistant" });
    const messagePullSelect = select(draft.fallbackMode || "structuredOnly", [
      { value: "structuredOnly", label: t("summary.collector.userscriptOnly") },
      { value: "allowPageText", label: t("summary.collector.withPageFallback") }
    ]);
    const runModeSelect = select(draft.userscriptRunMode || "serial", [
      { value: "serial", label: t("summary.collector.serialBridge") },
      { value: "pageWorldFirst", label: t("summary.collector.pageWorldFirst") }
    ]);
    const timeoutInput = input(String(draft.userscriptTimeoutMs || 24000), { type: "number", min: "5000", max: "45000", step: "1000" });
    const copyTimeoutInput = input(draft.copyTimeoutMs ? String(draft.copyTimeoutMs) : "", { type: "number", min: "300", max: "10000", step: "100", placeholder: t("common.optional") });
    const userscriptInput = textarea(draft.userscript || "", { placeholder: "return api.extractTurns(...)" });
    userscriptInput.readOnly = Boolean(builtIn && sourceMode !== "custom");
    userscriptInput.classList.add("settings-code-textarea");
    hostsInput.classList.add("settings-compact-textarea");
    pathInput.classList.add("settings-compact-textarea");
    const sourceLabelNode = builtIn
      ? el("small", { dataset: { userscriptSourceLabel: "summary" } })
      : null;
    const permissionStatus = el("small", { dataset: { userscriptPermissionStatus: "summary" } });
    const permissionRequest = button(t("userscripts.permissionRequest"), async () => {
      await ensureUserScriptsPermission();
      await refreshPermissionStatus();
    });
    permissionRequest.dataset.userscriptPermissionRequest = "summary";
    const permissionNotice = el("div", {
      class: "settings-info-callout settings-userscript-permission-notice",
      role: "note",
      "aria-live": "polite",
      dataset: { userscriptPermissionNotice: "summary" }
    },
      svgIcon("alert"),
      el("div", {},
        el("strong", {}, t("userscripts.permissionNoticeTitle")),
        el("p", {}, t("userscripts.permissionNoticeBody")),
        permissionStatus,
        permissionRequest
      )
    );
    async function refreshPermissionStatus() {
      let granted = false;
      if (typeof userScriptsPermissionContains === "function") {
        try { granted = await userScriptsPermissionContains(); } catch { granted = false; }
      }
      permissionStatus.textContent = granted
        ? t("userscripts.permissionStatusGranted")
        : t("userscripts.permissionStatusMissing");
      permissionRequest.hidden = granted;
    }
    const syncSourceModeUi = () => {
      permissionNotice.hidden = sourceMode !== "custom";
      if (sourceLabelNode) {
        sourceLabelNode.textContent = summaryCollectorSourceLabel({ ...draft, sourceMode });
      }
      if (sourceMode === "custom") void refreshPermissionStatus();
    };
    syncSourceModeUi();
    let dialog;
    const close = () => dialog.remove();
    void loadCollectorLastRun();
    const lastRunNode = el("small", {
      class: "summary-collector-last-run",
      "aria-live": "polite"
    }, formatCollectorLastRun(
      state.summaryCollectorLastRun?.collectorId === (config?.id || draft.id)
        ? state.summaryCollectorLastRun
        : null
    ));
    const probeCurrentTab = probeSummaryCollector
      ? async () => {
        const timeout = Math.max(5000, Math.min(45000, Number(timeoutInput.value) || 24000));
        const copyTimeout = copyTimeoutInput.value.trim()
          ? Math.max(300, Math.min(10000, Number(copyTimeoutInput.value) || 0))
          : undefined;
        const probeConfig = {
          ...draft,
          name: nameInput.value.trim() || draft.name,
          enabled: enabledInput.checked,
          builtIn: Boolean(builtIn),
          hosts: linesFromText(hostsInput.value),
          pathPrefixes: linesFromText(pathInput.value),
          fallbackMode: messagePullSelect.value,
          userscriptRunMode: runModeSelect.value,
          userscriptTimeoutMs: timeout,
          sourceMode,
          ...(sourceMode === "custom" ? { customUserscript: userscriptInput.value } : {}),
          ...(copyTimeout ? { copyTimeoutMs: copyTimeout } : {})
        };
        const result = await probeSummaryCollector(probeConfig);
        await persistCollectorLastRun({
          collectorId: config?.id || draft.id,
          ...result,
          at: Date.now()
        });
        lastRunNode.textContent = formatCollectorLastRun(state.summaryCollectorLastRun);
        if (result?.ok) toast(t("summary.collector.probeOk", { count: Number(result.turnCount) || 0 }), "success");
        else toast(formatCollectorLastRun(state.summaryCollectorLastRun), "error");
      }
      : null;
    const save = async () => {
      const hosts = linesFromText(hostsInput.value);
      const userscript = userscriptInput.value;
      if (!nameInput.value.trim()) return toast(t("summary.collector.nameRequired"), "error");
      if (!hosts.length) return toast(t("summary.collector.hostsRequired"), "error");
      if (sourceMode === "custom" && !userscript.trim()) return toast(t("summary.collector.userscriptRequired"), "error");
      if (sourceMode === "custom" && !await ensureUserScriptsPermission()) return;
      const timeout = Math.max(5000, Math.min(45000, Number(timeoutInput.value) || 24000));
      const copyTimeout = copyTimeoutInput.value.trim() ? Math.max(300, Math.min(10000, Number(copyTimeoutInput.value) || 0)) : undefined;
      const nextConfig = {
        ...draft,
        name: nameInput.value.trim(),
        enabled: enabledInput.checked,
        builtIn: Boolean(builtIn),
        hosts,
        pathPrefixes: linesFromText(pathInput.value),
        fallbackMode: messagePullSelect.value,
        userscriptRunMode: runModeSelect.value,
        userscriptTimeoutMs: timeout,
        sourceMode,
        userscriptLength: (sourceMode === "custom" ? userscript : builtInUserscript).length,
      };
      if (sourceMode === "custom") nextConfig.customUserscript = userscript;
      else delete nextConfig.customUserscript;
      delete nextConfig.userscript;
      delete nextConfig.userscriptOverride;
      if (copyTimeout) nextConfig.copyTimeoutMs = copyTimeout;
      else delete nextConfig.copyTimeoutMs;
      if (!builtIn) {
        nextConfig.builtIn = false;
        delete nextConfig.userscriptFile;
        delete nextConfig.configVersion;
      }
      const configs = editing
        ? state.options.summarySiteConfigs.map((item) => item.id === config.id ? nextConfig : item)
        : [...state.options.summarySiteConfigs, nextConfig];
      state.summaryCollectorEditingId = "";
      await saveSummaryCollectors(configs, redraw);
      toast(t(editing ? "toast.summaryUserscriptSaved" : "toast.summaryCollectorAdded"), "success");
      close();
    };
    dialog = editorModal(t(editing ? "summary.collector.editTitle" : "summary.collector.addTitle"),
      el("div", { class: "settings-editor-form summary-userscript-editor" },
        el("div", { class: "settings-dialog-grid summary-userscript-grid" },
          field(t("summary.collector.name"), nameInput),
          el("label", { class: "settings-dialog-check" },
            enabledInput,
            el("span", {}, t("common.enabled"))
          ),
          field(t("summary.collector.hosts"), el("div", { class: "settings-field-stack" },
            hostsInput,
            el("small", {}, t("summary.collector.hostHelp"))
          )),
          field(t("summary.collector.pathPrefixes"), el("div", { class: "settings-field-stack" },
            pathInput,
            el("small", {}, t("summary.collector.pathHelp"))
          )),
          field(t("summary.collector.messagePull"), messagePullSelect),
          field(t("summary.collector.runMode"), runModeSelect),
          field(t("summary.collector.timeout"), timeoutInput),
          field(t("summary.collector.copyTimeout"), copyTimeoutInput)
        ),
        el("div", { class: "settings-info-callout" },
          svgIcon("summary"),
          el("div", {},
            el("strong", {}, t("summary.collector.infoTitle")),
            el("p", {}, t("summary.collector.infoBody")),
            sourceLabelNode,
            el("div", { class: "summary-collector-last-run-row" },
              el("strong", {}, t("summary.collector.lastRun")),
              lastRunNode
            )
          )
        ),
        permissionNotice,
        field(t("summary.collector.userscript"), userscriptInput),
        el("div", { class: "modal-footer" },
          builtIn ? button(t("summary.collector.editCopy"), () => {
            sourceMode = "custom";
            userscriptInput.readOnly = false;
            syncSourceModeUi();
            userscriptInput.focus();
          }) : null,
          builtIn ? button(t("summary.collector.resetBuiltIn"), async () => {
            await resetSummaryCollector(config, redraw);
            close();
          }) : null,
          probeCurrentTab ? button(t("summary.collector.probe"), probeCurrentTab) : null,
          button(t("common.cancel"), close),
          button(editing ? t("common.save") : t("common.add"), save, "primary")
        )
      ),
      close,
      true,
      t("common.close")
    );
    dialog.querySelector(".modal")?.classList.add("settings-editor-modal", "settings-userscript-modal");
  }

  function summaryCollectorRows(redraw) {
    return state.options.summarySiteConfigs.flatMap((config) => {
      const expanded = state.summaryCollectorEditingId === config.id;
      const row = summaryCollectorRow(config, expanded, redraw);
      if (!expanded) return row;
      return [row, summaryCollectorDetails(config, redraw)];
    });
  }

  function summaryCollectorRow(config, expanded, redraw) {
    const builtIn = Boolean(config.builtIn);
    return el("div", {
      class: `ui-list-row settings-list-row summary-collector-row ${expanded ? "summary-collector-row-active" : ""}`.trim(),
      draggable: "true",
      dataset: { collectorId: config.id },
      onclick: (event) => {
        if (event.target instanceof Element && event.target.closest("button,input,select,a")) return;
        state.summaryCollectorEditingId = expanded ? "" : config.id;
        redraw();
      },
      ondragstart: (event) => startSummaryCollectorDrag(event, config),
      ondragend: cleanupSummaryCollectorDrag,
      ondragover: (event) => previewSummaryCollectorDrop(event, config),
      ondragleave: (event) => event.currentTarget.classList.remove("drop-before", "drop-after"),
      ondrop: (event) => dropSummaryCollector(event, config, redraw)
    },
      settingsReorderHandle(t("summary.collector.drag"), {
        ids: state.options.summarySiteConfigs.map((item) => item.id),
        id: config.id,
        onMove: (delta) => {
          saveSummaryCollectors(moveListItemByDelta(state.options.summarySiteConfigs, config.id, delta), redraw, { reloadRuntime: false });
        }
      }),
      el("div", { class: "summary-collector-name" },
        el("strong", {}, config.name || config.id),
        builtIn ? el("span", { class: "summary-collector-star", title: t("summary.collector.builtIn"), "aria-label": t("summary.collector.builtIn") }, "★") : null
      ),
      el("span", { class: "summary-fallback-badge" }, summaryFallbackLabel(config.fallbackMode)),
      el("label", { class: "settings-check", title: config.enabled === false ? t("common.disabled") : t("common.enabled") },
        el("input", {
          type: "checkbox",
          "aria-label": `${config.name || config.id} ${t("summary.collector.enabled")}`,
          checked: config.enabled !== false,
          onchange: async (event) => {
            if (event.target.checked && summaryCollectorSourceMode(config) === "custom" && !await ensureUserScriptsPermission()) {
              event.target.checked = false;
              return;
            }
            const configs = state.options.summarySiteConfigs.map((item) => item.id === config.id ? { ...item, enabled: event.target.checked } : item);
            await saveSummaryCollectors(configs, redraw);
          }
        })
      ),
      el("div", { class: "settings-row-actions" },
        settingsIconAction(expanded ? t("common.close") : t("common.edit"), "edit", (event) => {
          event.stopPropagation();
          openSummaryCollectorEditor(config, redraw);
        }, "", false, "settings.action.edit"),
        builtIn
          ? settingsIconAction(t("common.reset"), "reset", async (event) => {
            event.stopPropagation();
            await resetSummaryCollector(config, redraw);
          }, "settings-reset-icon", !summaryBuiltInDefault(config) || summaryCollectorSourceMode(config) !== "custom", "settings.action.reset")
          : settingsIconAction(t("common.delete"), "trash", async (event) => {
            event.stopPropagation();
            await deleteSummaryCollector(config, redraw);
          }, "danger", false, "settings.action.delete")
      )
    );
  }

  function summaryCollectorDetails(config, redraw) {
    const fallback = select(config.fallbackMode || "structuredOnly", [
      { value: "structuredOnly", label: t("summary.collector.structuredOnly") },
      { value: "allowPageText", label: t("summary.collector.allowPageText") }
    ], {
      onchange: async (event) => {
        const configs = state.options.summarySiteConfigs.map((item) => item.id === config.id ? { ...item, fallbackMode: event.target.value } : item);
        await saveSummaryCollectors(configs, redraw);
        toast(t("toast.collectorFallbackSaved"), "success");
      }
    });
    return el("div", { class: "summary-collector-details" },
      el("div", { class: "summary-collector-details-grid" },
        field(t("summary.collector.hosts"), el("div", { class: "summary-host-chips" },
          (config.hosts || []).length
            ? (config.hosts || []).map((host) => el("code", {}, host))
            : el("span", { class: "muted" }, t("summary.collector.noHosts"))
        )),
        field(t("summary.collector.fallback"), fallback),
        field(t("summary.collector.userscript"), el("div", { class: "summary-script-meta" },
          el("strong", {}, config.userscriptFile || t("summary.collector.inlineRuntime")),
          el("small", {}, summaryCollectorSourceLabel(config)),
          el("span", {}, config.userscriptLength ? t("summary.collector.chars", { count: config.userscriptLength }) : t("summary.collector.customCollector"))
        )),
        field(t("summary.collector.matcher"), el("div", { class: "summary-script-meta" },
          el("span", {}, summaryHostsText(config)),
          (config.pathPrefixes || []).length ? el("small", {}, (config.pathPrefixes || []).join(", ")) : null
        )),
        field(t("summary.collector.runMode"), el("div", { class: "summary-script-meta" },
          el("span", {}, summaryCollectorRunModeLabel(config.userscriptRunMode)),
          el("small", {}, t("summary.collector.timeoutMs", { count: config.userscriptTimeoutMs || 24000 }))
        )),
        field(t("summary.collector.lastRun"), el("small", {},
          formatCollectorLastRun(
            state.summaryCollectorLastRun?.collectorId === config.id
              ? state.summaryCollectorLastRun
              : null
          )
        ))
      )
    );
  }

  async function resetSummaryCollector(config, redraw) {
    const defaults = summaryBuiltInDefault(config);
    if (!defaults) return;
    const configs = state.options.summarySiteConfigs.map((item) => {
      if (item.id !== config.id) return item;
      const next = {
        ...item,
        builtIn: true,
        configVersion: defaults.configVersion,
        userscriptFile: defaults.userscriptFile,
        scriptType: "summary",
        scriptId: defaults.scriptId || defaults.id,
        scriptVersion: defaults.configVersion,
        sourceMode: "builtIn",
        userscriptLength: defaults.userscriptLength
      };
      delete next.customUserscript;
      delete next.userscript;
      delete next.userscriptOverride;
      return next;
    });
    state.summaryCollectorEditingId = "";
    await saveSummaryCollectors(configs, redraw);
    toast(t("toast.collectorReset"), "success");
  }

  async function deleteSummaryCollector(config, redraw) {
    if (summaryBuiltInDefault(config)) return;
    if (!window.confirm(t("summary.collector.deleteConfirm", { name: config.name || config.id }))) return;
    const configs = state.options.summarySiteConfigs.filter((item) => item.id !== config.id);
    state.summaryCollectorEditingId = "";
    await saveSummaryCollectors(configs, redraw);
    toast(t("toast.summaryCollectorDeleted"), "success");
  }

  function startSummaryCollectorDrag(event, config) {
    state.summaryCollectorDragId = config.id;
    event.currentTarget.classList.add("dragging");
    event.dataTransfer?.setData("text/plain", config.id);
    event.dataTransfer?.setData("application/x-chatclub-summary-collector", config.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function cleanupSummaryCollectorDrag() {
    state.summaryCollectorDragId = "";
    document.querySelectorAll(".summary-collector-row").forEach((row) => {
      row.classList.remove("dragging", "drop-before", "drop-after");
    });
  }

  function summaryCollectorDropPlacement(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY > rect.top + rect.height / 2 ? "after" : "before";
  }

  function previewSummaryCollectorDrop(event, config) {
    const sourceId = state.summaryCollectorDragId || event.dataTransfer?.getData("application/x-chatclub-summary-collector") || "";
    if (!sourceId || sourceId === config.id) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    event.currentTarget.classList.toggle("drop-after", summaryCollectorDropPlacement(event) === "after");
    event.currentTarget.classList.toggle("drop-before", summaryCollectorDropPlacement(event) !== "after");
  }

  async function dropSummaryCollector(event, targetConfig, redraw) {
    const sourceId = state.summaryCollectorDragId || event.dataTransfer?.getData("application/x-chatclub-summary-collector") || event.dataTransfer?.getData("text/plain") || "";
    if (!sourceId || sourceId === targetConfig.id) return;
    event.preventDefault();
    const placement = summaryCollectorDropPlacement(event);
    const source = state.options.summarySiteConfigs.find((item) => item.id === sourceId);
    if (!source) return cleanupSummaryCollectorDrag();
    const withoutSource = state.options.summarySiteConfigs.filter((item) => item.id !== sourceId);
    const targetIndex = withoutSource.findIndex((item) => item.id === targetConfig.id);
    if (targetIndex < 0) return cleanupSummaryCollectorDrag();
    const insertIndex = targetIndex + (placement === "after" ? 1 : 0);
    const configs = [...withoutSource.slice(0, insertIndex), source, ...withoutSource.slice(insertIndex)];
    cleanupSummaryCollectorDrag();
    await saveSummaryCollectors(configs, redraw, { reloadRuntime: false });
  }

  function reset() {
    state.summaryCollectorEditingId = "";
    state.summaryCollectorDragId = "";
    cleanupSummaryCollectorDrag();
    promptTemplates.reset();
  }

  return Object.freeze({
    pane: summarySettingsPane,
    reset
  });
}
