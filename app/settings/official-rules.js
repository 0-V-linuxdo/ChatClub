import { button, confirmationModal, el, toast } from "../../ui/dom.js";
import { installOfficialRulesSettingsStyles } from "./official-rules-styles.js";

const FEATURE_LABELS = Object.freeze({
  summary: "Summary",
  messageNavigator: "Message Navigator",
  delete: "Delete Sites"
});

const SITE_LABELS = Object.freeze({
  chatgpt: "ChatGPT",
  claude: "Claude",
  deepseek: "DeepSeek",
  gemini: "Gemini",
  grok: "Grok",
  grokMirror: "Grok Mirror",
  kagi: "Kagi",
  lobehub: "LobeHub",
  notion: "Notion",
  typingmind: "TypingMind"
});

const OFFICIAL_RULES_ZH_CN = Object.freeze({
  title: "官方增量规则",
  description: "无需更新插件即可接收经签名验证的官方站点规则；自定义规则不会被覆盖。",
  auto: "自动检查",
  manual: "仅手动检查",
  enableAuto: "启用自动检查",
  keepBuiltIn: "保持内置规则／仅手动检查",
  checkNow: "立即检查",
  applyAll: "应用本次全部增量",
  rollbackLast: "回退上次更新",
  rollback: "回退",
  restore: "恢复",
  source: "当前来源",
  followOfficial: "跟随官方",
  userOverride: "用户覆盖",
  sourceRolledBack: "已回滚",
  overrideFields: "用户覆盖字段",
  clearOverride: "清除覆盖",
  catalog: "规则目录",
  version: "规则版本",
  sequence: "序列号",
  signingKey: "签名密钥",
  currentKeyFingerprint: "当前密钥指纹",
  recoveryKeyFingerprint: "恢复密钥指纹",
  releaseNotes: "发布说明",
  fieldDiffs: "字段变化",
  before: "更新前",
  after: "更新后",
  lastChecked: "上次检查",
  lastApplied: "上次应用",
  components: "组件状态",
  candidate: "待应用更新",
  aliases: "Delete Sites 新域名授权",
  aliasesDescription: "新域名只有在你逐项授权后才会获得删除能力。未授权域名不会随其他规则一起启用。",
  approveAlias: "允许此域名",
  revokeAlias: "撤销授权",
  approved: "已授权",
  approvalRequired: "等待授权",
  activeVersion: "当前",
  packagedVersion: "插件内置",
  candidateVersion: "候选",
  changed: "有更新",
  noCandidate: "当前没有待应用的官方规则更新。",
  noComponents: "尚无可显示的组件状态。",
  noValue: "—",
  never: "从未",
  cancel: "取消",
  confirmApply: "确认应用",
  confirmRollback: "确认回退",
  confirmRestore: "确认恢复",
  applyTitle: "应用官方规则更新",
  applyBody: "将原子应用本次发布涉及的全部 changed components，不能部分选择；未授权的 Delete Sites 新域名会保持禁用。",
  rollbackLastTitle: "回退上次官方规则更新",
  rollbackLastBody: "将恢复到应用上次增量更新之前的规则快照。",
  rollbackComponentTitle: "回退组件规则",
  rollbackComponentBody: "将只回退这个组件，其他组件保持当前版本。",
  restoreComponentTitle: "恢复组件规则",
  restoreComponentBody: "将恢复这个组件此前回退的官方规则版本。",
  approveAliasTitle: "授权 Delete Sites 新域名",
  approveAliasBody: "授权后，Delete Sites 可在此域名执行删除操作。仅在确认它属于所示官方站点时继续。",
  revokeAliasTitle: "撤销 Delete Sites 域名授权",
  revokeAliasBody: "撤销后，此域名不会再获得官方 Delete Sites 删除能力。",
  checked: "已完成规则检查",
  modeSaved: "更新方式已保存",
  applied: "官方规则已应用",
  rolledBack: "已回退官方规则",
  componentRolledBack: "组件规则已回退",
  componentRestored: "组件规则已恢复",
  aliasApproved: "新域名已授权",
  aliasRevoked: "新域名授权已撤销",
  overrideCleared: "用户覆盖已清除",
  statusIdle: "等待检查",
  statusChecking: "正在检查",
  statusApplying: "正在应用",
  statusAvailable: "发现更新",
  statusReady: "已是最新",
  statusExtensionUpdateRequired: "需要更新插件",
  statusRecoveryRequired: "需要恢复配置",
  statusError: "更新异常"
});

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

function officialRulesComponentLabel(componentKey, providedLabel = "") {
  const key = normalizeComponentKey(componentKey);
  const [feature, siteId, ...extra] = key.split("/");
  if (!feature || !siteId || extra.length) return clean(providedLabel) || key || OFFICIAL_RULES_ZH_CN.noValue;
  const featureLabel = FEATURE_LABELS[feature] || feature;
  const siteLabel = clean(providedLabel) || SITE_LABELS[siteId] || siteId;
  return `${featureLabel} · ${siteLabel}`;
}

function normalizeChangedComponent(value) {
  const item = typeof value === "string" ? { componentKey: value } : record(value);
  const componentKey = normalizeComponentKey(item.componentKey || item.key || item.id);
  return componentKey ? {
    ...item,
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
  return {
    ...item,
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

function formatOfficialRulesTime(value, fallback = OFFICIAL_RULES_ZH_CN.never) {
  if (value === null || value === undefined || value === "") return fallback;
  const timestamp = typeof value === "number" ? value : Date.parse(String(value));
  if (!Number.isFinite(timestamp)) return fallback;
  try {
    return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
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
  const copy = Object.freeze({ ...OFFICIAL_RULES_ZH_CN, ...record(dependencies.copy) });
  installOfficialRulesSettingsStyles();

  const host = el("section", {
    class: "settings-manage-card official-rules-card",
    dataset: { officialRulesSettings: "true" },
    "aria-live": "polite"
  });
  let current = normalizeOfficialRulesSnapshot();
  let busy = "loading";
  let destroyed = false;
  let refreshGeneration = 0;
  let unsubscribe = () => {};

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

  function modeControls() {
    return el("div", { class: "official-rules-mode", role: "group", "aria-label": "官方规则更新方式" },
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

  function candidateBlock() {
    if (!current.candidate.available) return el("div", { class: "official-rules-empty" }, copy.noCandidate);
    const changed = current.candidate.changedComponents;
    return el("div", { class: "official-rules-candidate" },
      el("strong", {}, [
        current.candidate.version ? `${copy.version} ${current.candidate.version}` : "",
        current.candidate.sequence ? `${copy.sequence} ${current.candidate.sequence}` : ""
      ].filter(Boolean).join(" · ") || copy.candidate),
      current.candidate.keyId ? el("p", { class: "official-rules-section-copy" }, `${copy.signingKey}：${current.candidate.keyId}`) : null,
      current.candidate.releaseNotes
        ? el("p", { class: "official-rules-release-notes" }, `${copy.releaseNotes}：${current.candidate.releaseNotes}`)
        : null,
      changed.length ? el("div", { class: "official-rules-chip-list" },
        changed.map((component) => el("span", { class: "official-rules-chip" }, component.label))
      ) : null,
      changed.some((component) => component.fieldDiffs.length)
        ? el("div", { class: "official-rules-diff-list" }, changed.filter((component) => component.fieldDiffs.length)
          .map((component) => el("article", { class: "official-rules-diff" },
            el("strong", {}, component.label),
            el("dl", {}, component.fieldDiffs.map((diff) => el("div", {},
              el("dt", {}, diff.field),
              el("dd", {}, `${copy.before}：${displayDiffValue(diff.before)} · ${copy.after}：${displayDiffValue(diff.after)}`)
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
        el("div", { class: "settings-dialog-actions" }, cancelButton, confirmButton)
      ),
      close,
      false,
      "关闭"
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
        el("code", {}, component.label)
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
      el("strong", {}, component.label),
      el("code", { class: "official-rules-component-key" }, component.componentKey),
      el("small", {}, `${copy.source}：${sourceLabel}`),
      component.overrideFields.length
        ? el("div", { class: "official-rules-override-fields" },
          el("small", {}, `${copy.overrideFields}：`),
          component.overrideFields.map((field) => el("code", { class: "official-rules-chip" }, field))
        )
        : null,
      el("div", { class: "official-rules-component-versions" },
        el("span", {}, `${copy.activeVersion} `, el("code", {}, component.activeVersion || copy.noValue)),
        el("span", {}, `${copy.packagedVersion} `, el("code", {}, component.packagedVersion || copy.noValue)),
        component.candidateVersion
          ? el("span", {}, `${copy.candidateVersion} `, el("code", {}, component.candidateVersion))
          : null,
        component.changed ? el("span", { class: "official-rules-chip" }, copy.changed) : null
      )
    ),
    el("div", { class: "official-rules-row-actions" },
      actionButton(copy.clearOverride, "reset", () => clearComponentOverride(component), {
        action: `clear-override:${component.componentKey}`,
        disabled: Boolean(busy) || !component.canClearOverride
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
        el("strong", {}, alias.componentLabel),
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

  function render() {
    if (destroyed) return;
    const phase = busy === "loading"
      ? "checking"
      : current.phase === "recovery-required"
        ? "recovery-required"
        : current.error ? "error" : current.phase;
    host.setAttribute("aria-busy", String(Boolean(busy)));
    host.replaceChildren(
      el("div", { class: "official-rules-heading" },
        el("div", { class: "official-rules-heading-copy" },
          icon("reload"),
          el("div", {}, el("h4", {}, copy.title), el("p", {}, copy.description))
        ),
        el("span", { class: "official-rules-status", dataset: { state: phase } }, stateLabel(phase, copy))
      ),
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
        detail(copy.lastChecked, formatOfficialRulesTime(current.lastCheckedAt, copy.never)),
        detail(copy.lastApplied, formatOfficialRulesTime(current.lastAppliedAt, copy.never))
      ),
      current.error ? el("div", { class: "official-rules-error", role: "alert" }, current.error) : null,
      el("div", { class: "official-rules-section" },
        el("div", { class: "official-rules-component-heading" }, el("h5", {}, copy.candidate)),
        candidateBlock()
      ),
      el("div", { class: "official-rules-section" },
        el("div", { class: "official-rules-component-heading" }, el("h5", {}, copy.components)),
        current.components.length
          ? el("div", { class: "official-rules-component-list" }, current.components.map(componentRow))
          : el("div", { class: "official-rules-empty" }, copy.noComponents)
      ),
      aliasesSection()
    );
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
    destroy() {
      if (destroyed) return;
      destroyed = true;
      refreshGeneration += 1;
      try { unsubscribe(); } catch {}
      host.remove();
    }
  });
}
