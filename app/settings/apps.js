import {
  BUILTIN_CHAT_APPS,
  PROMPT_IMAGE_PASTE_STRATEGY_BATCH,
  PROMPT_IMAGE_PASTE_STRATEGY_SEQUENTIAL
} from "../../shared/constants.js";
import { t } from "../../shared/i18n.js";
import {
  createId,
  normalizeBuiltinChatAppOrder,
  normalizePromptImagePasteStrategy
} from "../../shared/storage-schema.js";
import {
  CHAT_FRAME_ALLOW_FEATURES,
  CHAT_FRAME_SANDBOX_TOKENS,
  REFERRER_POLICIES,
  iframeConfigRiskKeys,
  inspectIframeConfig,
  resolveChatFrameAttributeContract
} from "../../shared/chat-frame-config.js";
import { saveCustomConfig } from "../../shared/storage-adapter.js";
import {
  button,
  confirmationModal,
  editorModal,
  el,
  field,
  input,
  select,
  textarea,
  toast,
  viewerModal
} from "../../ui/dom.js";
import {
  cleanupSettingsDragRows,
  createSettingsKit,
  moveListItem
} from "./kit.js";
import { requireSettingsSectionStatePort } from "./section-contract.js";
import {
  requireControllerContext,
  requireControllerFunction,
  validateControllerContract
} from "../controller-contract.js";

export function createAppsSettingsSection(ctx) {
  const controllerName = "Apps settings section";
  ctx = validateControllerContract(ctx, controllerName, {
    state: "object",
    svgIcon: "function",
    notifyConfigReload: "function",
    saveOptionsPatch: "function",
    reconcileAppCatalog: "function",
    syncSummaryPanel: "function",
    syncWorkspaceDom: "function"
  });
  const state = requireSettingsSectionStatePort(
    requireControllerContext(ctx, controllerName, "state"),
    controllerName,
    ["customConfig", "options", "settingsAppsTab", "settingsBuiltinAppDragId", "settingsCustomAppDragId"]
  );
  const svgIcon = requireControllerFunction(ctx, controllerName, "svgIcon");
  const notifyConfigReload = requireControllerFunction(ctx, controllerName, "notifyConfigReload");
  const saveOptionsPatch = requireControllerFunction(ctx, controllerName, "saveOptionsPatch");
  const reconcileAppCatalog = requireControllerFunction(ctx, controllerName, "reconcileAppCatalog");
  const syncSummaryPanel = requireControllerFunction(ctx, controllerName, "syncSummaryPanel");
  const syncWorkspaceDom = requireControllerFunction(ctx, controllerName, "syncWorkspaceDom");
  const {
    settingsDragHandle,
    settingsEmptyRow,
    settingsIconAction,
    settingsInnerTabs,
    settingsList,
    settingsListDropPlacement,
    settingsPaneToolbar,
    settingsPrimaryAction
  } = createSettingsKit({ svgIcon });

  function imagePasteStrategyOptions() {
    return [
      { value: PROMPT_IMAGE_PASTE_STRATEGY_SEQUENTIAL, label: t("apps.imageStrategySequential") },
      { value: PROMPT_IMAGE_PASTE_STRATEGY_BATCH, label: t("apps.imageStrategyBatch") }
    ];
  }

  function imagePasteStrategyLabel(strategy) {
    return normalizePromptImagePasteStrategy(strategy) === PROMPT_IMAGE_PASTE_STRATEGY_BATCH
      ? t("apps.imageStrategyBatch")
      : t("apps.imageStrategySequential");
  }

  function builtInAppIsNotion(app = {}) {
    const id = String(app?.id || "").trim().toLowerCase();
    const name = String(app?.name || "").trim().toLowerCase();
    let host = "";
    try { host = new URL(String(app?.url || "")).hostname.toLowerCase(); } catch {}
    return id === "notionai"
      || /\bnotion\b/.test(name)
      || host === "app.notion.com"
      || host === "notion.so"
      || host === "www.notion.so"
      || host.endsWith(".notion.so");
  }

  function builtInImagePasteStrategyLabel(app) {
    return builtInAppIsNotion(app)
      ? t("apps.imageStrategyNotionBridge")
      : imagePasteStrategyLabel(app?.imagePasteStrategy);
  }

  function pane(redraw) {
    const activeTab = state.settingsAppsTab === "custom" || state.settingsAppsTab === "iframe"
      ? state.settingsAppsTab
      : "builtIn";
    const tabs = [
      ["builtIn", t("apps.tabBuiltIn"), t("apps.tabBuiltInDesc")],
      ["custom", t("apps.tabCustom"), t("apps.tabCustomDesc")],
      ["iframe", t("apps.tabIframe"), t("apps.tabIframeDesc")]
    ];
    const tabBar = settingsInnerTabs(tabs, activeTab, (tabId) => {
      state.settingsAppsTab = tabId;
      redraw?.();
    });
    Array.from(tabBar.querySelectorAll("[role='tab']")).forEach((tab, index) => {
      tab.dataset.appsTabId = tabs[index]?.[0] || "";
    });
    return el("div", { class: "settings-pane settings-manager-pane apps-settings-pane" },
      tabBar,
      activeTab === "custom"
        ? customPane(redraw)
        : activeTab === "iframe"
          ? iframePermissionsPane(redraw)
          : builtInPane(redraw)
    );
  }

  function reset() {
    state.settingsBuiltinAppDragId = "";
    state.settingsCustomAppDragId = "";
    cleanupSettingsDragRows(".built-in-config-row");
    cleanupSettingsDragRows(".custom-config-row");
  }

  function builtInPane(redraw) {
    const rows = orderedBuiltInApps().map((app) => builtInRow(app, redraw));
    return el("div", { class: "settings-apps-tab-panel" },
      settingsPaneToolbar(t("apps.builtInManage")),
      settingsList([
        "", t("apps.platformName"), t("apps.platformUrl"), t("apps.imagePasteStrategy"), t("apps.action")
      ], rows, "settings-manager-list built-in-config-list")
    );
  }

  function orderedBuiltInApps(order = state.options?.builtinChatAppOrder) {
    const appById = new Map(BUILTIN_CHAT_APPS.map((app) => [app.id, app]));
    return normalizeBuiltinChatAppOrder(order).map((id) => appById.get(id)).filter(Boolean);
  }

  function builtInRow(app, redraw) {
    return el("div", {
      class: "ui-list-row settings-list-row settings-manager-row built-in-config-row",
      draggable: "true",
      dataset: { builtInAppId: app.id },
      ondragstart: (event) => startBuiltInDrag(event, app),
      ondragend: cleanupBuiltInDrag,
      ondragover: (event) => previewBuiltInDrop(event, app),
      ondragleave: (event) => event.currentTarget.classList.remove("drop-before", "drop-after"),
      ondrop: (event) => dropBuiltIn(event, app, redraw)
    },
      settingsDragHandle(t("apps.platformName")),
      el("strong", { class: "settings-main-cell" }, app.name || app.id),
      el("a", { class: "settings-url-link", href: app.url, target: "_blank", rel: "noreferrer" }, app.url),
      el("span", { class: "settings-strategy-cell" }, builtInImagePasteStrategyLabel(app)),
      el("div", { class: "settings-row-action-group" },
        settingsIconAction(t("apps.viewDetails"), "preview", () => openBuiltInDetails(app), "", false, "settings.action.view")
      )
    );
  }

  function detailField(label, content) {
    return el("div", { class: "field settings-detail-field" }, el("span", {}, label), content);
  }

  function detailValue(value) {
    return el("span", { class: "settings-detail-value" }, value || t("apps.default"));
  }

  function detailCode(value) {
    return el("code", { class: "settings-detail-code" }, String(value || t("apps.default")));
  }

  function builtInHostsText(app) {
    if (Array.isArray(app.hosts) && app.hosts.length) return app.hosts.join("\n");
    try { return new URL(app.url || "").hostname || t("apps.default"); } catch { return t("apps.default"); }
  }

  function iframeAppHostsText(app, separator = ", ") {
    if (Array.isArray(app?.hosts) && app.hosts.length) return app.hosts.join(separator);
    try { return new URL(app?.url || "").hostname || t("apps.iframe.noHosts"); } catch { return t("apps.iframe.noHosts"); }
  }

  function iframeConfigForApp(app, source) {
    const raw = source === "builtIn"
      ? state.options?.builtinChatAppIframeConfigs?.[app.id]
      : app?.iframeConfig;
    return inspectIframeConfig(raw).value;
  }

  function iframeConfigIsOverridden(app, source) {
    return Boolean(iframeConfigForApp(app, source));
  }

  function resolvedIframeContract(app, source, iframeConfig = iframeConfigForApp(app, source)) {
    return resolveChatFrameAttributeContract({
      app,
      url: app?.url,
      iframeConfig,
      source,
      options: state.options
    });
  }

  function iframeAttributeSummary(app, source) {
    const attributes = resolvedIframeContract(app, source).attributes || {};
    const hasAllow = Object.hasOwn(attributes, "allow");
    const allowDirectives = hasAllow
      ? String(attributes.allow || "").split(";").map((item) => item.trim()).filter(Boolean)
      : [];
    const enabledAllowCount = allowDirectives.filter((item) => !/\s'none'\s*$/i.test(item)).length;
    const allowSummary = !hasAllow
      ? t("apps.iframe.summaryAllowOmitted")
      : t("apps.iframe.summaryAllow", { enabled: enabledAllowCount, total: allowDirectives.length });
    const sandboxSummary = !Object.hasOwn(attributes, "sandbox")
      ? t("apps.iframe.summarySandboxOmitted")
      : String(attributes.sandbox || "").trim()
        ? t("apps.iframe.summarySandbox", { count: String(attributes.sandbox).trim().split(/\s+/).length })
        : t("apps.iframe.summarySandboxStrict");
    const referrerSummary = Object.hasOwn(attributes, "referrerpolicy")
      ? t("apps.iframe.summaryReferrer", { value: attributes.referrerpolicy || t("apps.iframe.emptyValue") })
      : t("apps.iframe.summaryReferrerOmitted");
    return `${allowSummary} · ${sandboxSummary} · ${referrerSummary}`;
  }

  function iframeAction(label, iconName, action, onClick, disabled = false) {
    const control = settingsIconAction(
      label,
      iconName,
      onClick,
      action === "reset" ? "danger" : "",
      disabled,
      `settings.apps.iframe.${action}`
    );
    control.dataset.iframeAction = action;
    return control;
  }

  function iframePermissionRow(app, source, redraw) {
    const overridden = iframeConfigIsOverridden(app, source);
    return el("div", {
      class: "ui-list-row settings-list-row settings-manager-row iframe-permission-row",
      dataset: { appId: app.id, appSource: source }
    },
      el("span", { class: `iframe-permission-source is-${source === "builtIn" ? "builtin" : "custom"}` },
        source === "builtIn" ? t("apps.iframe.sourceBuiltIn") : t("apps.iframe.sourceCustom")
      ),
      el("strong", { class: "settings-main-cell iframe-permission-app" }, app.name || app.id),
      el("span", { class: "iframe-permission-hosts", title: iframeAppHostsText(app, "\n") }, iframeAppHostsText(app)),
      el("span", { class: "iframe-permission-summary", title: iframeAttributeSummary(app, source) }, iframeAttributeSummary(app, source)),
      el("span", { class: `iframe-permission-status ${overridden ? "is-overridden" : "is-default"}` },
        overridden ? t("apps.iframe.overridden") : t("apps.iframe.usingDefault")
      ),
      el("div", { class: "settings-row-action-group" },
        iframeAction(t("apps.iframe.edit"), "edit", "edit", () => openIframePermissionEditor(app, source, redraw)),
        iframeAction(t("apps.iframe.restoreDefault"), "reload", "reset", () => resetIframeConfig(app, source, redraw), !overridden)
      )
    );
  }

  function iframePermissionGroup(source, apps, redraw) {
    const title = source === "builtIn" ? t("apps.iframe.groupBuiltIn") : t("apps.iframe.groupCustom");
    const description = source === "builtIn"
      ? t("apps.iframe.groupBuiltInDesc")
      : t("apps.iframe.groupCustomDesc");
    const rows = apps.length
      ? apps.map((app) => iframePermissionRow(app, source, redraw))
      : settingsEmptyRow(t("apps.noApps"));
    return el("section", {
      class: "iframe-permission-group",
      dataset: { iframeConfigSource: source }
    },
      el("div", { class: "iframe-permission-group-header" },
        el("div", {}, el("h4", {}, title), el("p", {}, description)),
        el("span", { class: "settings-usage-chip muted" }, t("apps.iframe.platformCount", { count: apps.length }))
      ),
      settingsList([
        t("apps.iframe.source"),
        t("apps.platformName"),
        t("apps.hosts"),
        t("apps.iframe.effectivePolicy"),
        t("apps.iframe.status"),
        t("apps.action")
      ], rows, "settings-manager-list iframe-permission-list")
    );
  }

  function iframePermissionsPane(redraw) {
    return el("div", { class: "settings-apps-tab-panel iframe-permissions-pane" },
      settingsPaneToolbar(t("apps.iframe.manage")),
      el("div", { class: "settings-info-callout iframe-permission-scope-callout" },
        svgIcon("info"),
        el("div", {},
          el("strong", {}, t("apps.iframe.scopeTitle")),
          el("p", {}, t("apps.iframe.scopeNotice"))
        )
      ),
      iframePermissionGroup("builtIn", orderedBuiltInApps(), redraw),
      iframePermissionGroup("custom", state.customConfig, redraw)
    );
  }

  function issueText(issue) {
    if (typeof issue === "string") return issue;
    return String(issue?.message || issue?.code || issue || "");
  }

  function normalizedRiskKeys(config, inspection = null) {
    const risks = Array.isArray(inspection?.risks) ? inspection.risks : iframeConfigRiskKeys(config);
    return [...new Set((risks || []).map(issueText).filter(Boolean))];
  }

  async function persistIframeConfig(app, source, iframeConfig, redraw, message) {
    if (source === "builtIn") {
      const previousOptions = state.options;
      const builtinChatAppIframeConfigs = { ...(state.options?.builtinChatAppIframeConfigs || {}) };
      if (iframeConfig) builtinChatAppIframeConfigs[app.id] = iframeConfig;
      else delete builtinChatAppIframeConfigs[app.id];
      state.options = await saveOptionsPatch({ builtinChatAppIframeConfigs });
      await notifyConfigReload();
      await reconcileAppCatalog(state.customConfig, previousOptions);
      redraw?.();
      if (message) toast(message, "success");
      return;
    }
    const customConfig = state.customConfig.map((item) => {
      if (item.id !== app.id) return item;
      const next = { ...item };
      if (iframeConfig) next.iframeConfig = iframeConfig;
      else delete next.iframeConfig;
      return next;
    });
    await saveCustomList(customConfig, redraw, message);
  }

  async function resetIframeConfig(app, source, redraw) {
    await persistIframeConfig(app, source, undefined, redraw, t("toast.iframeConfigReset"));
  }

  function iframePolicyModeOptions(kind) {
    const modes = kind === "referrerPolicy"
      ? ["inherit", "value", "omit"]
      : ["inherit", "visual", "raw", "omit"];
    return modes.map((mode) => ({ value: mode, label: t(`apps.iframe.mode.${mode}`) }));
  }

  function iframePolicyMode(config, key) {
    return config?.[key]?.mode || "inherit";
  }

  function markIframeField(control, name) {
    control.dataset.iframeField = name;
    return control;
  }

  function iframePolicyOption(value, checked, fieldName) {
    const checkbox = markIframeField(input(value, { type: "checkbox", checked }), fieldName);
    return el("label", { class: "iframe-permission-option" },
      checkbox,
      el("code", {}, value)
    );
  }

  function iframeAllowFeatureIsEnabled(value, feature) {
    const directive = String(value || "").split(";")
      .map((item) => item.trim())
      .find((item) => item.split(/\s+/, 1)[0]?.toLowerCase() === String(feature).toLowerCase());
    return Boolean(directive && !/\s'none'\s*$/i.test(directive));
  }

  function iframePreviewAttribute(name, value, booleanAttributes = new Set()) {
    if (value === "" && booleanAttributes.has(name)) return name;
    const escaped = String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
    return `${name}="${escaped}"`;
  }

  function iframeContractPreview(app, inspection, contract) {
    const booleanAttributes = new Set((inspection.value?.attributes || [])
      .filter((attribute) => attribute.value === "")
      .map((attribute) => attribute.name));
    const entries = Object.entries(contract.attributes || {});
    const lines = [
      `  src="${String(app?.url || "").replaceAll('"', "&quot;")}"`,
      "  class=\"chat-frame\"",
      `  data-app-id="${String(app?.id || "").replaceAll('"', "&quot;")}"`,
      "  data-frame-binding-id=\"…\"",
      ...entries.map(([name, value]) => `  ${iframePreviewAttribute(name, value, booleanAttributes)}`)
    ];
    return `<iframe\n${lines.join("\n")}\n></iframe>`;
  }

  function renderIframeIssues(host, issues, kind) {
    const normalized = (issues || []).map(issueText).filter(Boolean);
    host.hidden = normalized.length === 0;
    host.className = `iframe-permission-issues is-${kind}`;
    host.replaceChildren(...(normalized.length
      ? [el("strong", {}, kind === "error" ? t("apps.iframe.validationErrors") : t("apps.iframe.validationWarnings")),
        el("ul", {}, normalized.map((message) => el("li", {}, message)))]
      : []));
  }

  function openIframeRiskConfirmation(riskKeys, onConfirm) {
    let dialog;
    let applying = false;
    const cancelButton = button(t("common.cancel"), () => close());
    const confirmButton = button(t("apps.iframe.confirmRiskSave"), apply, "danger");
    confirmButton.dataset.iframeAction = "confirm-risk";
    const close = (force = false) => {
      if (applying && !force) return;
      dialog?.remove();
    };
    const setApplying = (value) => {
      applying = value;
      cancelButton.disabled = value;
      confirmButton.disabled = value;
      dialog?.querySelector(".modal-header .icon-button")?.toggleAttribute("disabled", value);
      dialog?.querySelector(".modal")?.setAttribute("aria-busy", String(value));
    };
    async function apply() {
      if (applying) return;
      setApplying(true);
      try {
        await onConfirm();
        close(true);
      } catch (error) {
        setApplying(false);
        toast(error?.message || String(error), "error");
      }
    }
    dialog = confirmationModal(t("apps.iframe.riskConfirmTitle"),
      el("div", { class: "settings-editor-form iframe-permission-risk-confirm" },
        el("div", { class: "iframe-permission-risk-warning" },
          el("strong", {}, t("apps.iframe.riskConfirmLead")),
          el("p", {}, t("apps.iframe.riskConfirmBody"))
        ),
        el("ul", { class: "iframe-permission-risk-list" },
          riskKeys.map((risk) => el("li", {}, el("code", {}, risk)))
        ),
        el("div", { class: "settings-dialog-actions" }, cancelButton, confirmButton)
      ),
      close,
      false,
      t("common.close")
    );
    dialog.querySelector(".modal")?.classList.add("iframe-permission-risk-modal");
  }

  function openIframePermissionEditor(app, source, redraw) {
    const currentConfig = iframeConfigForApp(app, source);
    const currentContract = resolvedIframeContract(app, source, currentConfig);
    const currentAttributes = currentContract.attributes || {};
    const allowMode = markIframeField(
      select(iframePolicyMode(currentConfig, "allow"), iframePolicyModeOptions("allow")),
      "allow-mode"
    );
    const sandboxMode = markIframeField(
      select(iframePolicyMode(currentConfig, "sandbox"), iframePolicyModeOptions("sandbox")),
      "sandbox-mode"
    );
    const referrerMode = markIframeField(
      select(iframePolicyMode(currentConfig, "referrerPolicy"), iframePolicyModeOptions("referrerPolicy")),
      "referrer-policy-mode"
    );
    const allowRaw = markIframeField(textarea(
      currentConfig?.allow?.mode === "raw" ? currentConfig.allow.value : currentAttributes.allow || "",
      { class: "textarea settings-compact-textarea settings-code-textarea", spellcheck: "false" }
    ), "allow-raw");
    const sandboxRaw = markIframeField(textarea(
      currentConfig?.sandbox?.mode === "raw" ? currentConfig.sandbox.value : currentAttributes.sandbox || "",
      { class: "textarea settings-compact-textarea settings-code-textarea", spellcheck: "false" }
    ), "sandbox-raw");
    const referrerValue = markIframeField(select(
      currentConfig?.referrerPolicy?.mode === "value"
        ? currentConfig.referrerPolicy.value
        : currentAttributes.referrerpolicy || "no-referrer",
      REFERRER_POLICIES.map((value) => ({ value, label: value }))
    ), "referrer-policy-value");

    const configuredAllowFeatures = currentConfig?.allow?.mode === "visual"
      ? new Set(currentConfig.allow.features)
      : new Set(CHAT_FRAME_ALLOW_FEATURES.filter((feature) => iframeAllowFeatureIsEnabled(currentAttributes.allow, feature)));
    if (!configuredAllowFeatures.size && !Object.hasOwn(currentAttributes, "allow")) {
      CHAT_FRAME_ALLOW_FEATURES.forEach((feature) => configuredAllowFeatures.add(feature));
    }
    const configuredSandboxTokens = currentConfig?.sandbox?.mode === "visual"
      ? new Set(currentConfig.sandbox.tokens)
      : new Set(String(currentAttributes.sandbox || "").split(/\s+/).filter(Boolean));
    if (!configuredSandboxTokens.size && !Object.hasOwn(currentAttributes, "sandbox")) {
      CHAT_FRAME_SANDBOX_TOKENS.forEach((token) => configuredSandboxTokens.add(token));
    }

    const allowVisualPanel = el("div", { class: "iframe-permission-mode-panel iframe-permission-option-grid" },
      CHAT_FRAME_ALLOW_FEATURES.map((feature) => iframePolicyOption(
        feature,
        configuredAllowFeatures.has(feature),
        "allow-feature"
      ))
    );
    const allowRawPanel = el("div", { class: "iframe-permission-mode-panel" },
      field(t("apps.iframe.rawValue"), allowRaw),
      el("small", {}, t("apps.iframe.allowRawHelp"))
    );
    const sandboxVisualPanel = el("div", { class: "iframe-permission-mode-panel iframe-permission-option-grid" },
      CHAT_FRAME_SANDBOX_TOKENS.map((token) => iframePolicyOption(
        token,
        configuredSandboxTokens.has(token),
        "sandbox-token"
      ))
    );
    const sandboxRawPanel = el("div", { class: "iframe-permission-mode-panel" },
      field(t("apps.iframe.rawValue"), sandboxRaw),
      el("small", {}, t("apps.iframe.sandboxRawHelp"))
    );
    const referrerValuePanel = el("div", { class: "iframe-permission-mode-panel" },
      field(t("apps.iframe.referrerPolicyValue"), referrerValue)
    );

    const advancedRows = el("div", { class: "iframe-permission-attribute-rows" });
    const advancedEmpty = el("p", { class: "iframe-permission-attribute-empty" }, t("apps.iframe.noAdvancedAttributes"));
    function syncAdvancedEmpty() {
      const empty = !advancedRows.querySelector(".iframe-permission-attribute-row");
      advancedEmpty.hidden = !empty;
    }
    function appendAdvancedAttribute(attribute = {}) {
      const nameInput = markIframeField(input(attribute.name || "", {
        "aria-label": t("apps.iframe.attributeName"),
        placeholder: t("apps.iframe.attributeNamePlaceholder"),
        spellcheck: "false"
      }), "advanced-name");
      const valueInput = markIframeField(input(attribute.value ?? "", {
        "aria-label": t("apps.iframe.attributeValue"),
        placeholder: t("apps.iframe.attributeValuePlaceholder"),
        spellcheck: "false"
      }), "advanced-value");
      const remove = settingsIconAction(
        t("apps.iframe.removeAttribute"),
        "trash",
        () => {
          row.remove();
          syncAdvancedEmpty();
          updateEditor();
        },
        "danger",
        false,
        "settings.apps.iframe.removeAttribute"
      );
      remove.dataset.iframeAction = "remove-attribute";
      const row = el("div", { class: "iframe-permission-attribute-row" }, nameInput, valueInput, remove);
      advancedRows.append(row);
      syncAdvancedEmpty();
      return row;
    }
    for (const attribute of currentConfig?.attributes || []) appendAdvancedAttribute(attribute);
    syncAdvancedEmpty();
    const addAttribute = button(t("apps.iframe.addAttribute"), () => {
      appendAdvancedAttribute();
      updateEditor();
      advancedRows.lastElementChild?.querySelector("[data-iframe-field='advanced-name']")?.focus();
    });
    addAttribute.dataset.iframeAction = "add-attribute";

    const validationHost = el("div", { class: "iframe-permission-issues is-error", hidden: true });
    const warningHost = el("div", { class: "iframe-permission-issues is-warning", hidden: true });
    const riskHost = el("div", { class: "iframe-permission-draft-risks", hidden: true });
    const previewCode = el("code", { class: "settings-detail-code iframe-permission-preview-code" });
    const previewScope = el("span", { class: "iframe-permission-preview-scope" });

    function collectDraftInspection() {
      const raw = {};
      if (allowMode.value === "visual") {
        raw.allow = {
          mode: "visual",
          features: Array.from(allowVisualPanel.querySelectorAll("[data-iframe-field='allow-feature']:checked"), (node) => node.value)
        };
      } else if (allowMode.value === "raw") {
        raw.allow = { mode: "raw", value: allowRaw.value };
      } else if (allowMode.value === "omit") {
        raw.allow = { mode: "omit" };
      }
      if (sandboxMode.value === "visual") {
        raw.sandbox = {
          mode: "visual",
          tokens: Array.from(sandboxVisualPanel.querySelectorAll("[data-iframe-field='sandbox-token']:checked"), (node) => node.value)
        };
      } else if (sandboxMode.value === "raw") {
        raw.sandbox = { mode: "raw", value: sandboxRaw.value };
      } else if (sandboxMode.value === "omit") {
        raw.sandbox = { mode: "omit" };
      }
      if (referrerMode.value === "value") {
        raw.referrerPolicy = { mode: "value", value: referrerValue.value };
      } else if (referrerMode.value === "omit") {
        raw.referrerPolicy = { mode: "omit" };
      }
      const attributes = Array.from(advancedRows.querySelectorAll(".iframe-permission-attribute-row"), (row) => {
        const name = row.querySelector("[data-iframe-field='advanced-name']")?.value || "";
        const value = row.querySelector("[data-iframe-field='advanced-value']")?.value || "";
        return { name, value };
      }).filter((attribute) => attribute.name.trim() || attribute.value !== "");
      if (attributes.length) raw.attributes = attributes;
      return inspectIframeConfig(raw);
    }

    function updateModeVisibility() {
      allowVisualPanel.hidden = allowMode.value !== "visual";
      allowRawPanel.hidden = allowMode.value !== "raw";
      sandboxVisualPanel.hidden = sandboxMode.value !== "visual";
      sandboxRawPanel.hidden = sandboxMode.value !== "raw";
      referrerValuePanel.hidden = referrerMode.value !== "value";
    }

    function updateEditor() {
      updateModeVisibility();
      const inspection = collectDraftInspection();
      renderIframeIssues(validationHost, inspection.errors, "error");
      renderIframeIssues(warningHost, inspection.warnings, "warning");
      const risks = normalizedRiskKeys(inspection.value, inspection);
      riskHost.hidden = risks.length === 0;
      riskHost.replaceChildren(...(risks.length
        ? [el("strong", {}, t("apps.iframe.currentRisks")),
          el("div", { class: "iframe-permission-risk-chips" }, risks.map((risk) => el("code", {}, risk)))]
        : []));
      if (!inspection.valid) {
        previewCode.textContent = t("apps.iframe.previewInvalid");
        previewScope.textContent = t("apps.iframe.previewUnavailable");
        return inspection;
      }
      try {
        const contract = resolvedIframeContract(app, source, inspection.value);
        previewCode.textContent = iframeContractPreview(app, inspection, contract);
        previewScope.textContent = contract.inScope === false
          ? t("apps.iframe.previewFallbackScope")
          : t("apps.iframe.previewInScope");
      } catch (error) {
        previewCode.textContent = error?.message || String(error);
        previewScope.textContent = t("apps.iframe.previewUnavailable");
      }
      return inspection;
    }

    let dialog;
    let saving = false;
    const cancelButton = button(t("common.cancel"), () => close());
    const saveButton = button(t("common.save"), save, "primary");
    saveButton.dataset.iframeAction = "save";
    const close = (force = false) => {
      if (saving && !force) return;
      dialog?.remove();
    };
    const setSaving = (value) => {
      saving = value;
      cancelButton.disabled = value;
      saveButton.disabled = value;
      dialog?.querySelector(".modal-header .icon-button")?.toggleAttribute("disabled", value);
      dialog?.querySelector(".modal")?.setAttribute("aria-busy", String(value));
    };
    async function commit(iframeConfig) {
      setSaving(true);
      try {
        await persistIframeConfig(
          app,
          source,
          iframeConfig,
          redraw,
          iframeConfig ? t("toast.iframeConfigSaved") : t("toast.iframeConfigReset")
        );
        close(true);
      } catch (error) {
        setSaving(false);
        throw error;
      }
    }
    async function save() {
      if (saving) return;
      const inspection = updateEditor();
      if (!inspection.valid) {
        toast(t("apps.iframe.fixValidationErrors"), "error");
        return;
      }
      const previousRisks = new Set(normalizedRiskKeys(currentConfig));
      const addedRisks = normalizedRiskKeys(inspection.value, inspection)
        .filter((risk) => !previousRisks.has(risk));
      if (addedRisks.length) {
        openIframeRiskConfirmation(addedRisks, () => commit(inspection.value));
        return;
      }
      try {
        await commit(inspection.value);
      } catch (error) {
        toast(error?.message || String(error), "error");
      }
    }

    const editor = el("div", { class: "settings-editor-form iframe-permission-editor", dataset: { appId: app.id, appSource: source } },
      el("div", { class: "settings-info-callout iframe-permission-editor-scope" },
        svgIcon("info"),
        el("div", {},
          el("strong", {}, t("apps.iframe.editorScopeTitle", { name: app.name || app.id })),
          el("p", {}, t("apps.iframe.editorScopeBody", { hosts: iframeAppHostsText(app) }))
        )
      ),
      el("div", { class: "iframe-permission-policy-grid" },
        el("section", { class: "iframe-permission-policy-card", dataset: { iframePolicy: "allow" } },
          el("div", { class: "iframe-permission-policy-header" },
            el("h3", {}, "allow"),
            el("p", {}, t("apps.iframe.allowHelp"))
          ),
          field(t("apps.iframe.policyMode"), allowMode),
          allowVisualPanel,
          allowRawPanel
        ),
        el("section", { class: "iframe-permission-policy-card", dataset: { iframePolicy: "sandbox" } },
          el("div", { class: "iframe-permission-policy-header" },
            el("h3", {}, "sandbox"),
            el("p", {}, t("apps.iframe.sandboxHelp"))
          ),
          field(t("apps.iframe.policyMode"), sandboxMode),
          sandboxVisualPanel,
          sandboxRawPanel
        ),
        el("section", { class: "iframe-permission-policy-card", dataset: { iframePolicy: "referrerPolicy" } },
          el("div", { class: "iframe-permission-policy-header" },
            el("h3", {}, "referrerPolicy"),
            el("p", {}, t("apps.iframe.referrerPolicyHelp"))
          ),
          field(t("apps.iframe.policyMode"), referrerMode),
          referrerValuePanel
        )
      ),
      el("section", { class: "iframe-permission-advanced" },
        el("div", { class: "iframe-permission-section-header" },
          el("div", {},
            el("h3", {}, t("apps.iframe.advancedAttributes")),
            el("p", {}, t("apps.iframe.advancedAttributesHelp"))
          ),
          addAttribute
        ),
        el("div", { class: "iframe-permission-attribute-header", "aria-hidden": "true" },
          el("span", {}, t("apps.iframe.attributeName")),
          el("span", {}, t("apps.iframe.attributeValue")),
          el("span", {}, t("apps.action"))
        ),
        advancedRows,
        advancedEmpty
      ),
      el("div", { class: "iframe-permission-risk-warning" },
        el("strong", {}, t("apps.iframe.riskWarningTitle")),
        el("p", {}, t("apps.iframe.riskWarningBody"))
      ),
      validationHost,
      warningHost,
      riskHost,
      el("section", { class: "iframe-permission-preview" },
        el("div", { class: "iframe-permission-section-header" },
          el("div", {},
            el("h3", {}, t("apps.iframe.previewTitle")),
            el("p", {}, t("apps.iframe.previewHelp"))
          ),
          previewScope
        ),
        previewCode
      ),
      el("p", { class: "iframe-permission-boundary-note" }, t("apps.iframe.permissionBoundary")),
      el("div", { class: "settings-dialog-actions" }, cancelButton, saveButton)
    );
    editor.addEventListener("input", updateEditor);
    editor.addEventListener("change", updateEditor);
    dialog = editorModal(t("apps.iframe.editorTitle", { name: app.name || app.id }), editor, close, true, t("common.close"));
    dialog.querySelector(".modal")?.classList.add("iframe-permission-editor-modal");
    updateEditor();
  }

  function openBuiltInDetails(app) {
    let dialog;
    const close = () => dialog?.remove();
    dialog = viewerModal(t("apps.builtInDetailsTitle", { name: app.name || app.id }),
      el("div", { class: "settings-editor-form built-in-detail-form" },
        el("div", { class: "settings-dialog-grid built-in-detail-grid" },
          detailField(t("apps.platformName"), detailValue(app.name || app.id)),
          detailField(t("apps.provider"), detailValue(app.provider || t("apps.default"))),
          detailField(t("apps.platformUrl"),
            el("a", { class: "settings-detail-link", href: app.url, target: "_blank", rel: "noreferrer" }, app.url || t("apps.default"))
          ),
          detailField(t("apps.hosts"), detailCode(builtInHostsText(app))),
          detailField(t("apps.inputSelector"), detailCode(app.inputSelector)),
          detailField(t("apps.sendButtonSelector"), detailCode(app.sendButtonSelector)),
          detailField(t("apps.imagePasteStrategy"), detailValue(builtInImagePasteStrategyLabel(app)))
        ),
        el("div", { class: "settings-dialog-actions" }, button(t("common.close"), close, "primary"))
      ),
      close,
      false,
      t("common.close")
    );
    dialog.querySelector(".modal")?.classList.add("settings-editor-modal");
  }

  function startBuiltInDrag(event, app) {
    state.settingsBuiltinAppDragId = app.id;
    event.currentTarget.classList.add("dragging");
    event.dataTransfer?.setData("application/x-chatclub-builtin-app", app.id);
    event.dataTransfer?.setData("text/plain", app.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function cleanupBuiltInDrag() {
    state.settingsBuiltinAppDragId = "";
    cleanupSettingsDragRows(".built-in-config-row");
  }

  function previewBuiltInDrop(event, app) {
    const sourceId = state.settingsBuiltinAppDragId || event.dataTransfer?.getData("application/x-chatclub-builtin-app") || "";
    if (!sourceId || sourceId === app.id) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    const placement = settingsListDropPlacement(event);
    event.currentTarget.classList.toggle("drop-after", placement === "after");
    event.currentTarget.classList.toggle("drop-before", placement !== "after");
  }

  async function dropBuiltIn(event, targetApp, redraw) {
    const sourceId = state.settingsBuiltinAppDragId
      || event.dataTransfer?.getData("application/x-chatclub-builtin-app")
      || event.dataTransfer?.getData("text/plain")
      || "";
    if (!sourceId || sourceId === targetApp.id) return;
    event.preventDefault();
    const currentOrder = normalizeBuiltinChatAppOrder(state.options?.builtinChatAppOrder).map((id) => ({ id }));
    const builtinChatAppOrder = moveListItem(
      currentOrder,
      sourceId,
      targetApp.id,
      settingsListDropPlacement(event)
    ).map((item) => item.id);
    cleanupBuiltInDrag();
    state.options = await saveOptionsPatch({ builtinChatAppOrder });
    syncWorkspaceDom();
    redraw?.();
    toast(t("toast.builtinAppOrderSaved"), "success");
  }

  function customPane(redraw) {
    const rows = state.customConfig.length
      ? state.customConfig.map((app) => customRow(app, redraw))
      : settingsEmptyRow(t("apps.noApps"));
    return el("div", { class: "settings-apps-tab-panel" },
      settingsPaneToolbar(t("apps.manage"),
        settingsPrimaryAction(t("apps.add"), "plus", () => openCustomEditor(null, redraw))
      ),
      settingsList([
        "", t("apps.platformName"), t("apps.platformUrl"), t("apps.imagePasteStrategy"), t("apps.action")
      ], rows, "settings-manager-list custom-config-list")
    );
  }

  function customRow(app, redraw) {
    return el("div", {
      class: "ui-list-row settings-list-row settings-manager-row custom-config-row",
      draggable: "true",
      dataset: { customAppId: app.id },
      ondragstart: (event) => startCustomDrag(event, app),
      ondragend: cleanupCustomDrag,
      ondragover: (event) => previewCustomDrop(event, app),
      ondragleave: (event) => event.currentTarget.classList.remove("drop-before", "drop-after"),
      ondrop: (event) => dropCustom(event, app, redraw)
    },
      settingsDragHandle(t("apps.platformName")),
      el("strong", { class: "settings-main-cell" }, app.name || app.id),
      el("a", { class: "settings-url-link", href: app.url, target: "_blank", rel: "noreferrer" }, app.url),
      el("span", { class: "settings-strategy-cell" }, imagePasteStrategyLabel(app.imagePasteStrategy)),
      el("div", { class: "settings-row-action-group" },
        settingsIconAction(t("common.edit"), "edit", () => openCustomEditor(app, redraw), "", false, "settings.action.edit"),
        settingsIconAction(t("common.delete"), "trash", () => removeCustom(app, redraw), "danger", false, "settings.action.delete")
      )
    );
  }

  function startCustomDrag(event, app) {
    state.settingsCustomAppDragId = app.id;
    event.currentTarget.classList.add("dragging");
    event.dataTransfer?.setData("application/x-chatclub-custom-app", app.id);
    event.dataTransfer?.setData("text/plain", app.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function cleanupCustomDrag() {
    state.settingsCustomAppDragId = "";
    cleanupSettingsDragRows(".custom-config-row");
  }

  function normalizeCustomUrl(value) {
    try {
      const parsed = new URL(String(value || "").trim());
      return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
    } catch {
      return "";
    }
  }

  function previewCustomDrop(event, app) {
    const sourceId = state.settingsCustomAppDragId || event.dataTransfer?.getData("application/x-chatclub-custom-app") || "";
    if (!sourceId || sourceId === app.id) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    const placement = settingsListDropPlacement(event);
    event.currentTarget.classList.toggle("drop-after", placement === "after");
    event.currentTarget.classList.toggle("drop-before", placement !== "after");
  }

  async function dropCustom(event, targetApp, redraw) {
    const sourceId = state.settingsCustomAppDragId
      || event.dataTransfer?.getData("application/x-chatclub-custom-app")
      || event.dataTransfer?.getData("text/plain")
      || "";
    if (!sourceId || sourceId === targetApp.id) return;
    event.preventDefault();
    const customConfig = moveListItem(
      state.customConfig,
      sourceId,
      targetApp.id,
      settingsListDropPlacement(event)
    );
    cleanupCustomDrag();
    await saveCustomList(customConfig, redraw, t("toast.customConfigOrderSaved"), {
      syncWorkspace: false,
      reloadRuntime: false
    });
  }

  async function saveCustomList(customConfig, redraw, message = t("toast.customConfigSaved"), options = {}) {
    const previousCustomConfig = state.customConfig;
    state.customConfig = await saveCustomConfig(customConfig);
    if (options.reloadRuntime !== false) await notifyConfigReload();
    if (options.syncWorkspace !== false) {
      await reconcileAppCatalog(previousCustomConfig);
      syncSummaryPanel();
    }
    redraw?.();
    if (message) toast(message, "success");
  }

  function openCustomEditor(app, redraw) {
    const editing = Boolean(app);
    const draft = structuredClone(app || {
      id: createId("custom-app"),
      name: "Custom App",
      provider: "Custom",
      url: "https://www.example.com/",
      inputSelector: "",
      sendButtonSelector: "",
      imagePasteStrategy: PROMPT_IMAGE_PASTE_STRATEGY_SEQUENTIAL
    });
    const nameInput = input(draft.name, { placeholder: t("apps.platformName") });
    const providerInput = input(draft.provider, { placeholder: t("apps.provider") });
    const urlInput = input(draft.url, { placeholder: "https://example.com/" });
    const inputSelectorInput = input(draft.inputSelector, { placeholder: t("apps.inputSelector") });
    const sendSelectorInput = input(draft.sendButtonSelector, { placeholder: t("apps.sendButtonSelector") });
    const strategyInput = select(normalizePromptImagePasteStrategy(draft.imagePasteStrategy), imagePasteStrategyOptions());
    let dialog;
    const close = () => dialog.remove();
    const save = async () => {
      const rawUrl = urlInput.value.trim();
      const nextApp = {
        ...draft,
        name: nameInput.value.trim(),
        provider: providerInput.value.trim() || "Custom",
        url: normalizeCustomUrl(rawUrl),
        inputSelector: inputSelectorInput.value.trim(),
        sendButtonSelector: sendSelectorInput.value.trim(),
        imagePasteStrategy: normalizePromptImagePasteStrategy(strategyInput.value)
      };
      if (!nextApp.name || !rawUrl) {
        toast(t("apps.nameUrlRequired"), "error");
        return;
      }
      if (!nextApp.url) {
        toast(t("apps.invalidUrl"), "error");
        return;
      }
      const customConfig = editing
        ? state.customConfig.map((item) => item.id === draft.id ? nextApp : item)
        : [...state.customConfig, nextApp];
      await saveCustomList(customConfig, redraw, editing ? t("toast.customPlatformUpdated") : t("toast.customPlatformAdded"));
      close();
    };
    dialog = editorModal(editing ? t("apps.editTitle") : t("apps.addTitle"),
      el("div", { class: "settings-editor-form" },
        el("div", { class: "settings-dialog-grid" },
          field(t("apps.platformName"), nameInput),
          field(t("apps.provider"), providerInput),
          field(t("apps.platformUrl"), urlInput),
          field(t("apps.inputSelector"), inputSelectorInput),
          field(t("apps.sendButtonSelector"), sendSelectorInput),
          field(t("apps.imagePasteStrategy"), strategyInput)
        ),
        el("div", { class: "settings-dialog-actions" },
          button(t("common.cancel"), close),
          button(editing ? t("apps.save") : t("apps.addTitle"), save, "primary")
        )
      ),
      close,
      false,
      t("common.close")
    );
    dialog.querySelector(".modal")?.classList.add("settings-editor-modal");
  }

  async function removeCustom(app, redraw) {
    if (!window.confirm(t("apps.deleteConfirm", { name: app.name || "this custom platform" }))) return;
    await saveCustomList(
      state.customConfig.filter((item) => item.id !== app.id),
      redraw,
      t("toast.customPlatformDeleted")
    );
  }

  return Object.freeze({ pane, reset, openCustomAppEditor: openCustomEditor });
}
