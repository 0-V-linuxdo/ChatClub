import { button, confirmationModal, el, toast } from "../../ui/dom.js";
import { t } from "../../shared/i18n.js";
import { installOfficialRulesSettingsStyles } from "./official-rules-styles.js";

const FEATURE_LABELS = Object.freeze({
  summary: "Summary",
  messageNavigator: "Message Navigator",
  delete: "Delete Sites"
});

const SITE_LABELS = Object.freeze({
  aiStudio: "Google AI Studio",
  chatgpt: "ChatGPT",
  claude: "Claude",
  deepseek: "DeepSeek",
  dola: "Dola",
  doubao: "DouBao",
  gemini: "Gemini",
  grok: "Grok",
  "grok-dairoot": "Grok Mirror",
  grokMirror: "Grok Mirror",
  kagi: "Kagi",
  kimi: "Kimi.com",
  kimiAi: "Kimi.ai",
  lechat: "Le Chat",
  lobehub: "LobeHub",
  manus: "Manus",
  notion: "Notion",
  perplexity: "Perplexity",
  poe: "Poe",
  qianwen: "Qianwen",
  qwen: "Qwen",
  typingmind: "TypingMind"
});

const SITE_GROUP_ALIASES = Object.freeze({
  "grok-dairoot": "grokMirror"
});

const SITE_GROUP_ORDER = Object.freeze([
  "chatgpt",
  "claude",
  "gemini",
  "deepseek",
  "grok",
  "grokMirror",
  "kagi",
  "notion",
  "lobehub",
  "typingmind",
  "manus",
  "poe",
  "aiStudio",
  "lechat",
  "perplexity",
  "kimi",
  "kimiAi",
  "doubao",
  "dola",
  "qwen",
  "qianwen"
]);

const FEATURE_ORDER = Object.freeze(["summary", "messageNavigator", "delete"]);

const OFFICIAL_RULES_COPY_FIELDS = Object.freeze([
  "title", "description", "tabsLabel", "tabUpdates", "tabUpdatesDescription", "tabComponents",
  "tabComponentsDescription", "modeLabel", "auto", "manual", "enableAuto", "keepBuiltIn", "checkNow",
  "applyAll", "rollbackLast", "rollback", "restore", "source", "followOfficial", "userOverride",
  "sourceRolledBack", "overrideFields", "clearOverride", "catalog", "version", "sequence", "signingKey",
  "currentKeyFingerprint", "recoveryKeyFingerprint", "releaseNotes", "fieldDiffs", "before", "after",
  "lastChecked", "lastApplied", "components", "componentsDescription", "componentUnit", "componentUnitOne",
  "candidate", "aliases", "aliasesDescription", "approveAlias", "revokeAlias", "approved", "approvalRequired",
  "activeVersion", "packagedVersion", "candidateVersion", "changed", "noCandidate", "noComponents", "noValue",
  "never", "cancel", "close", "confirmApply", "confirmRollback", "confirmRestore", "applyTitle", "applyBody",
  "rollbackLastTitle", "rollbackLastBody", "rollbackComponentTitle", "rollbackComponentBody",
  "restoreComponentTitle", "restoreComponentBody", "approveAliasTitle", "approveAliasBody", "revokeAliasTitle",
  "revokeAliasBody", "checked", "modeSaved", "applied", "rolledBack", "componentRolledBack",
  "componentRestored", "aliasApproved", "aliasRevoked", "overrideCleared", "statusIdle", "statusChecking",
  "statusApplying", "statusAvailable", "statusReady", "statusExtensionUpdateRequired", "statusRecoveryRequired",
  "statusError", "dateLocale", "labelSeparator", "testCurrentTab", "testCurrentTabUnsupported"
]);

const FEATURE_I18N_KEYS = Object.freeze({
  summary: "officialRules.featureSummary",
  messageNavigator: "officialRules.featureMessageNavigator",
  delete: "officialRules.featureDelete"
});

const OFFICIAL_RULES_TAB_ORDER = Object.freeze(["updates", "components"]);
let officialRulesSettingsInstanceSequence = 0;

function officialRulesCopy(overrides) {
  return Object.freeze({
    ...Object.fromEntries(OFFICIAL_RULES_COPY_FIELDS.map((field) => [field, t(`officialRules.${field}`)])),
    ...record(overrides)
  });
}

function officialRulesFeatureLabel(feature) {
  const key = FEATURE_I18N_KEYS[feature];
  return key ? t(key) : FEATURE_LABELS[feature] || clean(feature);
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function clean(value, fallback = "") {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function displayDescriptor(value) {
  if (!value || typeof value !== "object") return clean(value);
  const label = clean(value.label || value.name || value.id || value.type);
  const detail = clean(value.url || value.ref || value.version);
  return [label, detail].filter(Boolean).join(" · ");
}

function normalizeComponentKey(value) {
  const key = clean(value);
  return /^[^/\s]+\/[^/\s]+$/.test(key) ? key : "";
}

function officialRulesComponentIdentity(componentKey) {
  const key = normalizeComponentKey(componentKey);
  const [feature, siteId, ...extra] = key.split("/");
  if (!feature || !siteId || extra.length) return null;
  const siteGroupId = SITE_GROUP_ALIASES[siteId] || siteId;
  return {
    feature,
    featureLabel: officialRulesFeatureLabel(feature),
    siteId,
    siteGroupId,
    siteLabel: SITE_LABELS[siteGroupId] || SITE_LABELS[siteId] || siteId
  };
}

function orderIndex(order, value) {
  const index = order.indexOf(value);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

function compareStableText(left, right) {
  const a = clean(left).toLowerCase();
  const b = clean(right).toLowerCase();
  return a < b ? -1 : a > b ? 1 : 0;
}

function groupOfficialRulesComponentsBySite(components) {
  const groups = new Map();
  for (const component of list(components)) {
    const identity = component.siteGroupId ? component : officialRulesComponentIdentity(component.componentKey);
    if (!identity) continue;
    const siteGroupId = identity.siteGroupId;
    if (!groups.has(siteGroupId)) {
      groups.set(siteGroupId, {
        siteGroupId,
        siteLabel: identity.siteLabel,
        components: []
      });
    }
    groups.get(siteGroupId).components.push(component);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      components: group.components.sort((left, right) => (
        orderIndex(FEATURE_ORDER, left.feature) - orderIndex(FEATURE_ORDER, right.feature)
        || compareStableText(left.componentKey, right.componentKey)
      ))
    }))
    .sort((left, right) => (
      orderIndex(SITE_GROUP_ORDER, left.siteGroupId) - orderIndex(SITE_GROUP_ORDER, right.siteGroupId)
      || compareStableText(left.siteLabel, right.siteLabel)
      || compareStableText(left.siteGroupId, right.siteGroupId)
    ));
}

function officialRulesComponentLabel(componentKey, providedLabel = "") {
  const identity = officialRulesComponentIdentity(componentKey);
  if (!identity) return clean(providedLabel) || normalizeComponentKey(componentKey) || t("officialRules.noValue");
  const siteLabel = clean(providedLabel) || identity.siteLabel;
  return `${officialRulesFeatureLabel(identity.feature)} · ${siteLabel}`;
}

function normalizeChangedComponent(value) {
  const item = typeof value === "string" ? { componentKey: value } : record(value);
  const componentKey = normalizeComponentKey(item.componentKey || item.key || item.id);
  const identity = officialRulesComponentIdentity(componentKey);
  return componentKey ? {
    ...item,
    ...identity,
    componentKey,
    label: officialRulesComponentLabel(componentKey, item.label || item.name),
    currentVersion: clean(item.currentVersion || item.activeVersion),
    candidateVersion: clean(item.candidateVersion || item.version),
    fieldDiffs: normalizeFieldDiffs(item.fieldDiffs ?? item.diffs ?? item.diff)
  } : null;
}

function normalizeFieldDiffs(value) {
  const entries = Array.isArray(value)
    ? value.map((item) => ["", item])
    : Object.entries(record(value));
  return entries.map(([fallbackField, raw]) => {
    const item = record(raw);
    if (!item) return fallbackField || clean(raw) ? { field: fallbackField || clean(raw), before: undefined, after: undefined } : null;
    const field = clean(item.field || item.path || item.key || fallbackField);
    if (!field) return null;
    return {
      field,
      before: item.before ?? item.from ?? item.oldValue,
      after: item.after ?? item.to ?? item.newValue
    };
  }).filter(Boolean);
}

function normalizeComponent(value, fallbackKey, changedKeys) {
  const item = typeof value === "string" ? { componentKey: value } : record(value);
  const componentKey = normalizeComponentKey(item.componentKey || item.key || item.id || fallbackKey);
  if (!componentKey) return null;
  const identity = officialRulesComponentIdentity(componentKey);
  const overrideSource = item.overrideFields ?? item.userOverrideFields ?? item.overrides;
  const overrideFields = [...new Set((Array.isArray(overrideSource)
    ? overrideSource
    : Object.keys(record(overrideSource))).map((field) => clean(field)).filter(Boolean))];
  const rawSource = clean(item.source || item.sourceMode).toLowerCase();
  const rolledBack = item.rolledBack === true || item.pinned === true || /pinned|rollback|rolled-back/.test(rawSource);
  const userOverride = !rolledBack && (
    item.userOverride === true
    || item.hasOverride === true
    || overrideFields.length > 0
    || /user.?override|override/.test(rawSource)
  );
  return {
    ...item,
    ...identity,
    componentKey,
    label: officialRulesComponentLabel(componentKey, item.label || item.name),
    sourceMode: userOverride ? "userOverride" : rolledBack ? "rolledBack" : "followOfficial",
    overrideFields,
    canClearOverride: overrideFields.length > 0 || item.userOverride === true || item.hasOverride === true,
    activeVersion: clean(item.activeVersion || item.version || item.currentVersion),
    packagedVersion: clean(item.packagedVersion || item.bundledVersion),
    candidateVersion: clean(item.candidateVersion || item.pendingVersion),
    changed: item.changed === true || changedKeys.has(componentKey),
    canRollback: item.canRollback === true,
    canRestore: item.canRestore === true
  };
}

function normalizeDeleteAlias(value) {
  const item = record(value);
  const componentKey = normalizeComponentKey(item.componentKey || item.key || item.id);
  const host = clean(item.host || item.hostname);
  if (!componentKey.startsWith("delete/") || !host) return null;
  const identity = officialRulesComponentIdentity(componentKey);
  return {
    ...item,
    ...identity,
    componentKey,
    componentLabel: officialRulesComponentLabel(componentKey, item.componentLabel || item.siteName || item.label),
    host: host.toLowerCase(),
    approved: item.approved === true
  };
}

/**
 * Preferred snapshot shape:
 * { mode, phase, source, catalog, version, sequence, keyId,
 *   lastCheckedAt, lastAppliedAt, canRollbackLast,
 *   candidate: { available, version, sequence, keyId, changedComponents, deleteAliases },
 *   components: [{ componentKey: `${feature}/${siteId}`, activeVersion, packagedVersion, candidateVersion,
 *                  source, canRollback, canRestore }] }
 */
function normalizeOfficialRulesSnapshot(value = {}) {
  const source = record(value);
  const active = record(source.active);
  const candidateSource = record(source.candidate);
  const changedComponents = list(candidateSource.changedComponents ?? source.candidateChangedComponents)
    .map(normalizeChangedComponent)
    .filter(Boolean);
  const changedKeys = new Set(changedComponents.map((item) => item.componentKey));
  const componentSource = source.components;
  const normalizedComponents = (Array.isArray(componentSource)
    ? componentSource.map((item) => ["", item])
    : Object.entries(record(componentSource)))
    .map(([key, item]) => normalizeComponent(item, key, changedKeys))
    .filter(Boolean);
  const knownComponentKeys = new Set(normalizedComponents.map((item) => item.componentKey));
  for (const changed of changedComponents) {
    if (knownComponentKeys.has(changed.componentKey)) continue;
    normalizedComponents.push(normalizeComponent({
      ...changed,
      activeVersion: changed.currentVersion,
      candidateVersion: changed.candidateVersion,
      changed: true
    }, changed.componentKey, changedKeys));
  }
  const deleteAliases = list(
    candidateSource.deleteAliases
      ?? candidateSource.deleteAliasApprovals
      ?? source.deleteAliases
      ?? source.pendingDeleteAliases
  ).map(normalizeDeleteAlias).filter(Boolean);
  const candidateVersion = clean(candidateSource.version);
  const candidateSequence = clean(candidateSource.sequence);
  const candidateAvailable = typeof candidateSource.available === "boolean"
    ? candidateSource.available
    : Boolean(candidateVersion || candidateSequence || changedComponents.length);
  const declaredMode = source.mode === "auto" || source.mode === "manual" ? source.mode : "undecided";
  const consentDecided = source.consentDecided === false ? false : declaredMode !== "undecided";
  const fingerprints = record(source.keyFingerprints ?? source.fingerprints);
  return {
    mode: consentDecided ? declaredMode : "undecided",
    consentDecided,
    phase: clean(source.phase || source.status, "idle").toLowerCase(),
    source: displayDescriptor(source.source ?? active.source),
    catalog: displayDescriptor(source.catalog ?? source.catalogId ?? active.catalog),
    version: clean(source.version ?? source.activeVersion ?? active.version),
    sequence: clean(source.sequence ?? active.sequence),
    keyId: clean(source.keyId ?? source.key ?? active.keyId ?? active.key),
    currentKeyFingerprint: clean(
      source.currentKeyFingerprint
      ?? fingerprints.current
      ?? fingerprints.currentKey
      ?? active.currentKeyFingerprint
    ),
    recoveryKeyFingerprint: clean(
      source.recoveryKeyFingerprint
      ?? fingerprints.recovery
      ?? fingerprints.recoveryKey
      ?? active.recoveryKeyFingerprint
    ),
    lastCheckedAt: source.lastCheckedAt ?? source.checkedAt ?? null,
    lastAppliedAt: source.lastAppliedAt ?? source.appliedAt ?? null,
    canRollbackLast: source.canRollbackLast === true,
    components: normalizedComponents,
    candidate: {
      available: candidateAvailable,
      version: candidateVersion,
      sequence: candidateSequence,
      keyId: clean(candidateSource.keyId || candidateSource.key),
      releaseNotes: clean(candidateSource.releaseNotes ?? source.releaseNotes),
      changedComponents,
      deleteAliases
    },
    error: clean(source.error?.message || source.error || source.lastError)
  };
}

function approvedOfficialDeleteAliases(value) {
  const snapshot = value?.candidate?.deleteAliases ? value : normalizeOfficialRulesSnapshot(value);
  return list(snapshot.candidate?.deleteAliases)
    .filter((item) => item.approved === true)
    .map((item) => ({ componentKey: item.componentKey, host: item.host }));
}

function formatOfficialRulesTime(value, fallback, locale) {
  if (value === null || value === undefined || value === "") return fallback;
  const timestamp = typeof value === "number" ? value : Date.parse(String(value));
  if (!Number.isFinite(timestamp)) return fallback;
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}

function validateOfficialRulesService(service) {
  if (!service || typeof service !== "object") throw new TypeError("Official rules settings requires an officialRules service.");
  for (const method of [
    "snapshot",
    "subscribe",
    "setMode",
    "checkNow",
    "clearOverride",
    "applyCandidate",
    "rollbackLast",
    "rollbackComponent",
    "restoreComponent",
    "setDeleteAliasApproval"
  ]) {
    if (typeof service[method] !== "function") throw new TypeError(`Official rules service requires ${method}().`);
  }
  return service;
}

function stateLabel(phase, copy) {
  if (phase === "checking") return copy.statusChecking;
  if (phase === "applying") return copy.statusApplying;
  if (phase === "extension-update-required") return copy.statusExtensionUpdateRequired;
  if (phase === "recovery-required") return copy.statusRecoveryRequired;
  if (phase === "candidate" || phase === "available") return copy.statusAvailable;
  if (phase === "ready" || phase === "up-to-date" || phase === "applied") return copy.statusReady;
  if (phase === "error") return copy.statusError;
  return copy.statusIdle;
}

export function createOfficialRulesSettingsCard(dependencies = {}) {
  const officialRules = validateOfficialRulesService(dependencies.officialRules);
  if (typeof dependencies.svgIcon !== "function") throw new TypeError("Official rules settings requires svgIcon().");
  const svgIcon = dependencies.svgIcon;
  const notify = typeof dependencies.notify === "function" ? dependencies.notify : toast;
  const testCurrentTab = typeof dependencies.testCurrentTab === "function" ? dependencies.testCurrentTab : null;
  const copyOverrides = record(dependencies.copy);
  let copy = officialRulesCopy(copyOverrides);
  installOfficialRulesSettingsStyles();

  const instanceId = ++officialRulesSettingsInstanceSequence;

  const host = el("section", {
    class: "settings-manage-card official-rules-card",
    dataset: { officialRulesSettings: "true" }
  });
  let current = normalizeOfficialRulesSnapshot();
  let busy = "loading";
  let destroyed = false;
  let refreshGeneration = 0;
  let unsubscribe = () => {};
  let activeRulesTab = "updates";
  const siteDisclosureState = new Map();
  const componentProbeResults = new Map();

  function icon(name) {
    try { return svgIcon(name); } catch { return null; }
  }

  function actionButton(label, iconName, onClick, options = {}) {
    return el("button", {
      class: `official-rules-action ${options.variant || ""}`.trim(),
      type: "button",
      disabled: options.disabled === true,
      dataset: options.action ? { officialRulesAction: options.action } : null,
      onclick: onClick
    }, iconName ? icon(iconName) : null, el("span", {}, label));
  }

  function detail(label, value) {
    return el("div", { class: "official-rules-detail" },
      el("dt", {}, label),
      el("dd", {}, clean(value, copy.noValue))
    );
  }

  function labeled(label, value) {
    const spacing = copy.dateLocale === "zh-CN" ? "" : " ";
    return `${label}${copy.labelSeparator}${spacing}${value}`;
  }

  function componentFeatureLabel(component) {
    return officialRulesFeatureLabel(component?.feature);
  }

  function componentCountLabel(count) {
    return `${count} ${count === 1 ? copy.componentUnitOne : copy.componentUnit}`;
  }

  function modeControls() {
    return el("div", { class: "official-rules-mode", role: "group", "aria-label": copy.modeLabel },
      [
        ["auto", current.consentDecided ? copy.auto : copy.enableAuto],
        ["manual", current.consentDecided ? copy.manual : copy.keepBuiltIn]
      ].map(([mode, label]) => el("button", {
        type: "button",
        "aria-pressed": String(current.mode === mode),
        disabled: Boolean(busy) || current.phase === "recovery-required",
        dataset: { officialRulesMode: mode },
        onclick: () => perform(`mode:${mode}`, () => officialRules.setMode(mode), copy.modeSaved)
      }, label))
    );
  }

  function rulesTabId(tab) {
    return `official-rules-${instanceId}-tab-${tab}`;
  }

  function rulesPanelId(tab) {
    return `official-rules-${instanceId}-panel-${tab}`;
  }

  function selectRulesTab(tab, focus = false) {
    if (!OFFICIAL_RULES_TAB_ORDER.includes(tab)) return;
    if (tab !== activeRulesTab) {
      activeRulesTab = tab;
      render();
    }
    if (focus) host.querySelector(`[data-official-rules-tab="${tab}"]`)?.focus?.();
  }

  function rulesTabKeydown(event, tab) {
    const currentIndex = OFFICIAL_RULES_TAB_ORDER.indexOf(tab);
    let nextIndex = currentIndex;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + OFFICIAL_RULES_TAB_ORDER.length) % OFFICIAL_RULES_TAB_ORDER.length;
    else if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % OFFICIAL_RULES_TAB_ORDER.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = OFFICIAL_RULES_TAB_ORDER.length - 1;
    else return;
    event.preventDefault();
    selectRulesTab(OFFICIAL_RULES_TAB_ORDER[nextIndex], true);
  }

  function rulesTabButton(tab, label, description) {
    const active = tab === activeRulesTab;
    return el("button", {
      id: rulesTabId(tab),
      class: "official-rules-tab",
      type: "button",
      role: "tab",
      tabindex: active ? "0" : "-1",
      "aria-selected": String(active),
      "aria-controls": rulesPanelId(tab),
      dataset: { officialRulesTab: tab },
      onclick: () => selectRulesTab(tab, true),
      onkeydown: (event) => rulesTabKeydown(event, tab)
    }, el("strong", {}, label), el("span", {}, description));
  }

  function rulesTabs() {
    return el("div", { class: "official-rules-tabs", role: "tablist", "aria-label": copy.tabsLabel },
      rulesTabButton("updates", copy.tabUpdates, copy.tabUpdatesDescription),
      rulesTabButton("components", copy.tabComponents, copy.tabComponentsDescription)
    );
  }

  function candidateBlock() {
    if (!current.candidate.available) return el("div", { class: "official-rules-empty" }, copy.noCandidate);
    const changed = current.candidate.changedComponents;
    const siteGroups = groupOfficialRulesComponentsBySite(changed);
    return el("div", { class: "official-rules-candidate" },
      el("strong", {}, [
        current.candidate.version ? `${copy.version} ${current.candidate.version}` : "",
        current.candidate.sequence ? `${copy.sequence} ${current.candidate.sequence}` : ""
      ].filter(Boolean).join(" · ") || copy.candidate),
      current.candidate.keyId ? el("p", { class: "official-rules-section-copy" }, labeled(copy.signingKey, current.candidate.keyId)) : null,
      current.candidate.releaseNotes
        ? el("p", { class: "official-rules-release-notes" }, labeled(copy.releaseNotes, current.candidate.releaseNotes))
        : null,
      siteGroups.length
        ? el("div", { class: "official-rules-candidate-sites" }, siteGroups.map(candidateSiteGroup))
        : null
    );
  }

  function candidateSiteGroup(group) {
    return el("article", {
      class: "official-rules-candidate-site",
      dataset: { officialRulesCandidateSite: group.siteGroupId }
    },
    el("div", { class: "official-rules-candidate-site-heading" },
      el("strong", {}, group.siteLabel),
      el("div", { class: "official-rules-chip-list" }, group.components.map((component) => (
        el("span", { class: "official-rules-chip" }, componentFeatureLabel(component))
      )))
    ),
    group.components.some((component) => component.fieldDiffs.length)
      ? el("div", { class: "official-rules-diff-list" }, group.components
        .filter((component) => component.fieldDiffs.length)
        .map((component) => el("section", { class: "official-rules-diff" },
          el("strong", {}, componentFeatureLabel(component)),
          el("dl", {}, component.fieldDiffs.map((diff) => el("div", {},
            el("dt", {}, diff.field),
            el("dd", {}, `${labeled(copy.before, displayDiffValue(diff.before))} · ${labeled(copy.after, displayDiffValue(diff.after))}`)
          )))
        )))
      : null
    );
  }

  function displayDiffValue(value) {
    if (value === undefined) return copy.noValue;
    if (typeof value === "string") return value || copy.noValue;
    try { return JSON.stringify(value); } catch { return clean(value, copy.noValue); }
  }

  function openConfirmation({ title, body, confirmLabel, variant = "primary", actionKey, task, successMessage }) {
    let dialog;
    let applying = false;
    const close = (force = false) => {
      if (applying && force !== true) return;
      dialog?.remove();
    };
    const cancelButton = button(copy.cancel, () => close());
    const confirmButton = button(confirmLabel, apply, variant);
    const setApplying = (value) => {
      applying = value;
      cancelButton.disabled = value;
      confirmButton.disabled = value;
      const header = dialog?.querySelector(".modal-header");
      header?.querySelector(".icon-button")?.toggleAttribute("disabled", value);
      dialog?.querySelector(".modal")?.setAttribute("aria-busy", String(value));
    };
    async function apply() {
      if (applying) return;
      setApplying(true);
      const ok = await perform(actionKey, task, successMessage);
      if (ok) close(true);
      else setApplying(false);
    }
    dialog = confirmationModal(
      title,
      el("div", { class: "official-rules-confirmation" },
        typeof body === "string" ? el("p", {}, body) : body,
        el("div", { class: "modal-footer" }, cancelButton, confirmButton)
      ),
      close,
      false,
      copy.close
    );
    dialog.querySelector(".modal")?.classList.add("official-rules-confirmation-modal");
  }

  function applyCandidate() {
    const aliases = approvedOfficialDeleteAliases(current);
    openConfirmation({
      title: copy.applyTitle,
      body: el("div", {},
        el("p", {}, copy.applyBody),
        aliases.length
          ? el("div", { class: "official-rules-chip-list" }, aliases.map((item) => el("code", { class: "official-rules-chip" }, item.host)))
          : null
      ),
      confirmLabel: copy.confirmApply,
      actionKey: "apply",
      task: () => officialRules.applyCandidate({ approvedDeleteAliases: aliases }),
      successMessage: copy.applied
    });
  }

  function rollbackLast() {
    openConfirmation({
      title: copy.rollbackLastTitle,
      body: copy.rollbackLastBody,
      confirmLabel: copy.confirmRollback,
      variant: "danger",
      actionKey: "rollback-last",
      task: () => officialRules.rollbackLast(),
      successMessage: copy.rolledBack
    });
  }

  function componentAction(component, kind) {
    const rollback = kind === "rollback";
    openConfirmation({
      title: rollback ? copy.rollbackComponentTitle : copy.restoreComponentTitle,
      body: el("div", {},
        el("p", {}, rollback ? copy.rollbackComponentBody : copy.restoreComponentBody),
        el("code", {}, officialRulesComponentLabel(component.componentKey))
      ),
      confirmLabel: rollback ? copy.confirmRollback : copy.confirmRestore,
      variant: rollback ? "danger" : "primary",
      actionKey: `${kind}:${component.componentKey}`,
      task: () => rollback
        ? officialRules.rollbackComponent(component.componentKey)
        : officialRules.restoreComponent(component.componentKey),
      successMessage: rollback ? copy.componentRolledBack : copy.componentRestored
    });
  }

  function clearComponentOverride(component) {
    return perform(
      `clear-override:${component.componentKey}`,
      () => officialRules.clearOverride(component.componentKey),
      copy.overrideCleared
    );
  }

  async function probeComponent(component) {
    if (!testCurrentTab || component.feature !== "summary") {
      notify(copy.testCurrentTabUnsupported, "error");
      return;
    }
    try {
      const result = await testCurrentTab(component.componentKey);
      const stage = String(result?.stage || "none");
      const hits = result?.officialHits;
      const waitMs = Math.max(0, Number(result?.waitMsApplied) || 0);
      const miss = hits?.miss ? ` · miss ${hits.miss}` : "";
      const slotHits = hits?.slots && typeof hits.slots === "object" && !Array.isArray(hits.slots)
        ? Object.entries(hits.slots).filter(([, count]) => Number(count) > 0).map(([slot, count]) => `${slot}:${count}`).join(" ")
        : "";
      const hitText = hits
        ? ` · roots ${Number(hits.conversationRoots) || 0}/${Number(hits.messageRoots) || 0} u${Number(hits.user) || 0}/a${Number(hits.assistant) || 0} drop ${Number(hits.droppedNoRole) || 0}/${Number(hits.droppedNoText) || 0}${miss}${slotHits ? ` · ${slotHits}` : ""}`
        : "";
      const waitText = waitMs > 0 ? ` · wait ${waitMs}ms` : "";
      if (result?.ok) {
        const label = `${copy.testCurrentTab}: ${Number(result.turnCount) || 0} · ${stage}${hitText}${waitText}`;
        componentProbeResults.set(component.componentKey, label);
        notify(label, "success");
      } else {
        const error = result?.error === "unsupported"
          ? copy.testCurrentTabUnsupported
          : (result?.error || copy.statusError);
        const label = `${error} · ${stage}${hitText}${waitText}`;
        componentProbeResults.set(component.componentKey, label);
        notify(label, "error");
      }
      render();
    } catch (error) {
      notify(error?.message || String(error), "error");
    }
  }

  function aliasAction(alias) {
    const approve = !alias.approved;
    openConfirmation({
      title: approve ? copy.approveAliasTitle : copy.revokeAliasTitle,
      body: el("div", {},
        el("p", {}, approve ? copy.approveAliasBody : copy.revokeAliasBody),
        el("code", {}, alias.host)
      ),
      confirmLabel: approve ? copy.approveAlias : copy.revokeAlias,
      variant: approve ? "danger" : "secondary",
      actionKey: `alias:${alias.componentKey}:${alias.host}`,
      task: () => officialRules.setDeleteAliasApproval({
        componentKey: alias.componentKey,
        host: alias.host,
        approved: approve
      }),
      successMessage: approve ? copy.aliasApproved : copy.aliasRevoked
    });
  }

  function componentRow(component) {
    const sourceLabel = component.sourceMode === "rolledBack"
      ? copy.sourceRolledBack
      : component.sourceMode === "userOverride"
        ? copy.userOverride
        : copy.followOfficial;
    return el("article", {
      class: "official-rules-component",
      dataset: {
        officialRulesComponent: component.componentKey,
        changed: String(component.changed)
      }
    },
    el("div", { class: "official-rules-component-copy" },
      el("strong", {}, componentFeatureLabel(component)),
      el("code", { class: "official-rules-component-key" }, component.componentKey),
      el("small", {}, labeled(copy.source, sourceLabel)),
      component.overrideFields.length
        ? el("div", { class: "official-rules-override-fields" },
          el("small", {}, labeled(copy.overrideFields, "")),
          component.overrideFields.map((field) => el("code", { class: "official-rules-chip" }, field))
        )
        : null,
      el("div", { class: "official-rules-component-versions" },
        el("span", {}, `${copy.activeVersion} `, el("code", {}, component.activeVersion || copy.noValue)),
        el("span", {}, `${copy.packagedVersion} `, el("code", {}, component.packagedVersion || copy.noValue)),
        component.candidateVersion
          ? el("span", {}, `${copy.candidateVersion} `, el("code", {}, component.candidateVersion))
          : null,
        component.changed ? el("span", { class: "official-rules-chip" }, copy.changed) : null,
        componentProbeResults.get(component.componentKey)
          ? el("small", { class: "official-rules-probe-result" }, componentProbeResults.get(component.componentKey))
          : null
      )
    ),
    el("div", { class: "official-rules-row-actions" },
      testCurrentTab && component.feature === "summary"
        ? actionButton(copy.testCurrentTab, "preview", () => probeComponent(component), {
          action: `test:${component.componentKey}`,
          disabled: Boolean(busy)
        })
        : null,
      actionButton(copy.clearOverride, "reset", () => clearComponentOverride(component), {
        action: `clear-override:${component.componentKey}`,
        disabled: Boolean(busy) || current.phase === "recovery-required" || !component.canClearOverride
      }),
      actionButton(copy.rollback, "history", () => componentAction(component, "rollback"), {
        action: `rollback:${component.componentKey}`,
        variant: "danger",
        disabled: Boolean(busy) || current.phase === "recovery-required" || !component.canRollback
      }),
      actionButton(copy.restore, "reset", () => componentAction(component, "restore"), {
        action: `restore:${component.componentKey}`,
        disabled: Boolean(busy) || current.phase === "recovery-required" || !component.canRestore
      })
    ));
  }

  function siteGroupNeedsAttention(group) {
    return group.components.some((component) => (
      component.changed || component.sourceMode === "userOverride" || component.sourceMode === "rolledBack"
    ));
  }

  function siteGroupStateBadges(group) {
    const states = [];
    if (group.components.some((component) => component.changed)) states.push(copy.changed);
    if (group.components.some((component) => component.sourceMode === "userOverride")) states.push(copy.userOverride);
    if (group.components.some((component) => component.sourceMode === "rolledBack")) states.push(copy.sourceRolledBack);
    return states.map((label) => el("span", { class: "official-rules-site-state" }, label));
  }

  function siteGroup(group) {
    const defaultOpen = siteGroupNeedsAttention(group);
    const open = siteDisclosureState.has(group.siteGroupId)
      ? siteDisclosureState.get(group.siteGroupId)
      : defaultOpen;
    let renderedOpen = open;
    return el("details", {
      class: "official-rules-site",
      dataset: {
        officialRulesSite: group.siteGroupId,
        attention: String(defaultOpen)
      },
      open,
      ontoggle: (event) => {
        if (!event.currentTarget.isConnected) return;
        const nextOpen = event.currentTarget.open === true;
        if (nextOpen === renderedOpen) return;
        renderedOpen = nextOpen;
        siteDisclosureState.set(group.siteGroupId, nextOpen);
      }
    },
    el("summary", { class: "official-rules-site-summary" },
      el("span", { class: "official-rules-site-name" },
        el("strong", {}, group.siteLabel),
        el("small", {}, componentCountLabel(group.components.length))
      ),
      el("span", { class: "official-rules-site-features" }, group.components.map((component) => (
        el("span", { class: "official-rules-feature" }, componentFeatureLabel(component))
      ))),
      el("span", { class: "official-rules-site-states" }, siteGroupStateBadges(group))
    ),
    el("div", { class: "official-rules-site-components" }, group.components.map(componentRow))
    );
  }

  function aliasesSection() {
    const aliases = current.candidate.deleteAliases;
    if (!aliases.length) return null;
    return el("div", { class: "official-rules-section" },
      el("div", { class: "official-rules-alias-heading" },
        el("div", {}, el("h5", {}, copy.aliases), el("p", { class: "official-rules-section-copy" }, copy.aliasesDescription))
      ),
      el("div", { class: "official-rules-alias-list" }, aliases.map((alias) => el("article", {
        class: "official-rules-alias",
        dataset: { officialRulesAlias: `${alias.componentKey}:${alias.host}` }
      },
      el("div", { class: "official-rules-alias-copy" },
        el("strong", {}, officialRulesComponentLabel(alias.componentKey)),
        el("small", {}, alias.componentKey),
        el("code", {}, alias.host),
        el("span", {
          class: "official-rules-alias-state",
          dataset: { approved: String(alias.approved) }
        }, alias.approved ? copy.approved : copy.approvalRequired)
      ),
      el("div", { class: "official-rules-row-actions" },
        actionButton(alias.approved ? copy.revokeAlias : copy.approveAlias, alias.approved ? "reset" : "alert", () => aliasAction(alias), {
          action: `alias:${alias.componentKey}:${alias.host}`,
          variant: alias.approved ? "" : "danger",
          disabled: Boolean(busy) || current.phase === "recovery-required"
        })
      ))))
    );
  }

  function updatesPanel() {
    const active = activeRulesTab === "updates";
    const children = active ? [
      el("div", { class: "official-rules-toolbar" },
        modeControls(),
        el("div", { class: "official-rules-actions" },
          actionButton(copy.checkNow, "reload", () => perform("check", () => officialRules.checkNow(), copy.checked), {
            action: "check",
            disabled: Boolean(busy) || current.phase === "recovery-required"
          }),
          actionButton(copy.applyAll, "check", applyCandidate, {
            action: "apply",
            variant: "primary",
            disabled: Boolean(busy) || current.phase === "recovery-required" || !current.candidate.available
          }),
          actionButton(copy.rollbackLast, "history", rollbackLast, {
            action: "rollback-last",
            variant: "danger",
            disabled: Boolean(busy) || current.phase === "recovery-required" || !current.canRollbackLast
          })
        )
      ),
      el("dl", { class: "official-rules-details" },
        detail(copy.source, current.source),
        detail(copy.catalog, current.catalog),
        detail(copy.version, current.version),
        detail(copy.sequence, current.sequence),
        detail(copy.signingKey, current.keyId),
        detail(copy.currentKeyFingerprint, current.currentKeyFingerprint),
        detail(copy.recoveryKeyFingerprint, current.recoveryKeyFingerprint),
        detail(copy.lastChecked, formatOfficialRulesTime(current.lastCheckedAt, copy.never, copy.dateLocale)),
        detail(copy.lastApplied, formatOfficialRulesTime(current.lastAppliedAt, copy.never, copy.dateLocale))
      ),
      el("div", { class: "official-rules-section" },
        el("div", { class: "official-rules-component-heading" }, el("h5", {}, copy.candidate)),
        candidateBlock()
      ),
      aliasesSection()
    ].filter(Boolean) : [];
    return el("section", {
      id: rulesPanelId("updates"),
      class: "official-rules-tab-panel",
      role: "tabpanel",
      tabindex: "0",
      hidden: !active,
      "aria-labelledby": rulesTabId("updates"),
      dataset: { officialRulesPanel: "updates" }
    }, children);
  }

  function componentsPanel() {
    const active = activeRulesTab === "components";
    const children = active ? [
      el("div", { class: "official-rules-section" },
        el("div", { class: "official-rules-component-heading" },
          el("div", {},
            el("h5", {}, copy.components),
            el("p", { class: "official-rules-section-copy" }, copy.componentsDescription)
          )
        ),
        current.components.length
          ? el("div", { class: "official-rules-site-list" }, groupOfficialRulesComponentsBySite(current.components).map(siteGroup))
          : el("div", { class: "official-rules-empty" }, copy.noComponents)
      )
    ] : [];
    return el("section", {
      id: rulesPanelId("components"),
      class: "official-rules-tab-panel",
      role: "tabpanel",
      tabindex: "0",
      hidden: !active,
      "aria-labelledby": rulesTabId("components"),
      dataset: { officialRulesPanel: "components" }
    }, children);
  }

  function render() {
    if (destroyed) return;
    const focusedTab = host.contains?.(document.activeElement)
      ? clean(document.activeElement?.dataset?.officialRulesTab)
      : "";
    const phase = busy === "loading"
      ? "checking"
      : current.phase === "recovery-required"
        ? "recovery-required"
        : current.error ? "error" : current.phase;
    host.setAttribute("aria-busy", String(Boolean(busy)));
    const content = [
      el("div", { class: "official-rules-heading" },
        el("div", { class: "official-rules-heading-copy" },
          icon("reload"),
          el("div", {}, el("h4", {}, copy.title), el("p", {}, copy.description))
        ),
        el("span", {
          class: "official-rules-status",
          dataset: { state: phase },
          role: "status",
          "aria-live": "polite"
        }, stateLabel(phase, copy))
      ),
      rulesTabs(),
      current.error ? el("div", { class: "official-rules-error", role: "alert" }, current.error) : null,
      updatesPanel(),
      componentsPanel()
    ];
    host.replaceChildren(...content.filter(Boolean));
    if (focusedTab) host.querySelector(`[data-official-rules-tab="${focusedTab}"]`)?.focus?.();
  }

  async function readSnapshot(generation) {
    const value = await officialRules.snapshot();
    if (destroyed || generation !== refreshGeneration) return;
    current = normalizeOfficialRulesSnapshot(value);
  }

  async function refresh() {
    const generation = ++refreshGeneration;
    const ownsBusyState = !busy || busy === "loading";
    if (ownsBusyState) busy = "loading";
    render();
    try {
      await readSnapshot(generation);
    } catch (error) {
      if (!destroyed && generation === refreshGeneration) current = { ...current, error: clean(error?.message || error, copy.statusError) };
    } finally {
      if (!destroyed && generation === refreshGeneration) {
        if (ownsBusyState) busy = "";
        render();
      }
    }
    return current;
  }

  async function perform(actionKey, task, successMessage) {
    if (destroyed || busy) return false;
    busy = actionKey;
    current = { ...current, error: "" };
    render();
    try {
      await task();
      const generation = ++refreshGeneration;
      await readSnapshot(generation);
      notify(successMessage, "success");
      return true;
    } catch (error) {
      const message = clean(error?.message || error, copy.statusError);
      current = { ...current, phase: "error", error: message };
      notify(message, "error");
      return false;
    } finally {
      busy = "";
      render();
    }
  }

  function syncLanguage() {
    if (destroyed) return false;
    copy = officialRulesCopy(copyOverrides);
    render();
    return true;
  }

  try {
    const stop = officialRules.subscribe((value) => {
      if (destroyed) return;
      if (value && typeof value === "object") {
        current = normalizeOfficialRulesSnapshot(value);
        render();
      } else {
        void refresh();
      }
    });
    if (typeof stop === "function") unsubscribe = stop;
  } catch (error) {
    current = { ...current, phase: "error", error: clean(error?.message || error, copy.statusError) };
  }

  render();
  void refresh();

  return Object.freeze({
    card: host,
    refresh,
    syncLanguage,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      refreshGeneration += 1;
      try { unsubscribe(); } catch {}
      host.remove();
    }
  });
}
