const OFFICIAL_RULES_SETTINGS_STYLE_ID = "chatclub-official-rules-settings-style";

const OFFICIAL_RULES_SETTINGS_CSS = `
.official-rules-card {
  width: 100%;
  max-width: none;
  box-sizing: border-box;
}

.official-rules-card[aria-busy="true"] {
  cursor: progress;
}

.official-rules-heading,
.official-rules-toolbar,
.official-rules-component-heading,
.official-rules-alias-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.official-rules-heading-copy {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  align-items: center;
}

.official-rules-heading-copy > .svg-icon {
  width: 27px;
  height: 27px;
}

.official-rules-heading h4,
.official-rules-section h5 {
  margin: 0;
}

.official-rules-heading p,
.official-rules-section-copy,
.official-rules-component-copy small,
.official-rules-alias-copy small,
.official-rules-confirmation p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.official-rules-status {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  padding: 0 10px;
  color: var(--muted);
  font-size: 12px;
  font-weight: var(--font-weight-bold);
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--panel-2);
}

.official-rules-status[data-state="ready"],
.official-rules-status[data-state="up-to-date"],
.official-rules-status[data-state="applied"] {
  color: color-mix(in srgb, var(--success) 78%, var(--text));
  border-color: color-mix(in srgb, var(--success) 36%, var(--line));
  background: color-mix(in srgb, var(--success) 10%, var(--panel));
}

.official-rules-status[data-state="candidate"],
.official-rules-status[data-state="available"] {
  color: color-mix(in srgb, var(--warning) 82%, var(--text));
  border-color: color-mix(in srgb, var(--warning-fill) 36%, var(--line));
  background: color-mix(in srgb, var(--warning-fill) 10%, var(--panel));
}

.official-rules-status[data-state="error"] {
  color: color-mix(in srgb, var(--danger) 80%, var(--text));
  border-color: color-mix(in srgb, var(--danger) 36%, var(--line));
  background: color-mix(in srgb, var(--danger) 10%, var(--panel));
}

.official-rules-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  width: 100%;
  box-sizing: border-box;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: calc(var(--ui-radius) + 2px);
  background: color-mix(in srgb, var(--panel-2) 60%, transparent);
}

.official-rules-tab {
  min-width: 0;
  min-height: 42px;
  display: grid;
  gap: 2px;
  align-content: center;
  padding: 6px 13px;
  color: var(--muted);
  text-align: left;
  border: 1px solid transparent;
  border-radius: var(--ui-radius);
  background: transparent;
}

.official-rules-tab:hover {
  color: var(--text);
  background: color-mix(in srgb, var(--primary-2) 28%, transparent);
}

.official-rules-tab:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: -2px;
}

.official-rules-tab[aria-selected="true"] {
  color: var(--text);
  border-color: color-mix(in srgb, var(--primary) 52%, var(--line));
  background: var(--control-selected);
  box-shadow: 0 1px 0 color-mix(in srgb, white 8%, transparent) inset;
}

.official-rules-tab strong,
.official-rules-tab span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.official-rules-tab strong {
  font-size: 13px;
  line-height: 1.15;
}

.official-rules-tab span {
  font-size: 11px;
  line-height: 1.2;
}

.official-rules-tab-panel {
  min-width: 0;
  display: grid;
  gap: 18px;
}

.official-rules-tab-panel[hidden] {
  display: none;
}

.official-rules-mode {
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(92px, 1fr));
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: var(--ui-radius);
  background: var(--panel-2);
}

.official-rules-mode button {
  min-height: var(--ui-action-size);
  padding: 0 12px;
  color: var(--muted);
  font-weight: var(--font-weight-bold);
  border: 0;
  border-radius: var(--ui-radius);
  background: transparent;
}

.official-rules-mode button[aria-pressed="true"] {
  color: var(--text);
  background: var(--panel);
  box-shadow: 0 1px 4px color-mix(in srgb, black 10%, transparent);
}

.official-rules-actions,
.official-rules-row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.official-rules-action {
  display: inline-flex;
  min-height: var(--ui-control-height);
  gap: var(--space-2);
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  color: var(--text);
  font-size: 13px;
  font-weight: var(--font-weight-bold);
  border: 1px solid var(--line-strong);
  border-radius: var(--ui-radius);
  background: color-mix(in srgb, var(--panel) 88%, var(--panel-2));
}

.official-rules-action:hover:not(:disabled),
.official-rules-action:focus-visible {
  border-color: color-mix(in srgb, var(--primary) 48%, var(--line));
  background: color-mix(in srgb, var(--primary) 12%, var(--panel));
  outline: 0;
}

.official-rules-action.primary {
  color: var(--on-primary);
  border-color: var(--primary);
  background: var(--primary);
}

.official-rules-action.danger {
  color: color-mix(in srgb, var(--danger) 82%, var(--text));
}

.official-rules-action:disabled {
  cursor: not-allowed;
  opacity: var(--disabled-opacity);
}

.official-rules-action .svg-icon {
  width: 16px;
  height: 16px;
}

.official-rules-details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--ui-radius);
  background: var(--line);
}

.official-rules-detail {
  min-width: 0;
  display: grid;
  gap: 4px;
  padding: 11px 12px;
  background: var(--panel);
}

.official-rules-detail dt {
  color: var(--muted);
  font-size: 11px;
  font-weight: var(--font-weight-bold);
}

.official-rules-detail dd {
  min-width: 0;
  margin: 0;
  color: var(--text);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.official-rules-section {
  display: grid;
  gap: 10px;
}

.official-rules-candidate,
.official-rules-error,
.official-rules-empty {
  padding: 11px 12px;
  border: 1px solid var(--line);
  border-radius: var(--ui-radius);
  background: color-mix(in srgb, var(--panel-2) 64%, var(--panel));
}

.official-rules-empty {
  text-align: center;
  border-style: dashed;
  background: color-mix(in srgb, var(--panel) 86%, var(--bg));
}

.official-rules-release-notes {
  margin: 8px 0 0;
  white-space: pre-wrap;
}

.official-rules-candidate-sites {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.official-rules-candidate-site {
  padding: 9px 10px;
  border: 1px solid color-mix(in srgb, var(--primary) 18%, var(--line));
  border-radius: var(--ui-radius);
  background: color-mix(in srgb, var(--panel) 76%, transparent);
}

.official-rules-candidate-site-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
  justify-content: space-between;
}

.official-rules-candidate-site-heading .official-rules-chip-list {
  margin-top: 0;
}

.official-rules-diff-list {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.official-rules-diff {
  border: 1px solid color-mix(in srgb, var(--primary) 18%, var(--line));
  border-radius: var(--ui-radius);
  padding: 8px;
}

.official-rules-diff dl {
  display: grid;
  gap: 6px;
  margin: 6px 0 0;
}

.official-rules-diff dl > div {
  display: grid;
  gap: 2px;
}

.official-rules-diff dt {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  font-weight: var(--font-weight-semibold);
}

.official-rules-diff dd {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.official-rules-error {
  color: color-mix(in srgb, var(--danger) 82%, var(--text));
  border-color: color-mix(in srgb, var(--danger) 34%, var(--line));
  background: color-mix(in srgb, var(--danger) 9%, var(--panel));
}

.official-rules-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.official-rules-chip {
  padding: 3px 8px;
  color: var(--primary);
  font-size: 11px;
  font-weight: var(--font-weight-bold);
  border: 1px solid color-mix(in srgb, var(--primary) 28%, var(--line));
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 8%, var(--panel));
}

.official-rules-site-list,
.official-rules-alias-list {
  display: grid;
  gap: 8px;
}

.official-rules-site {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--ui-radius);
  background: color-mix(in srgb, var(--panel-2) 54%, var(--panel));
}

.official-rules-site[data-attention="true"] {
  border-color: color-mix(in srgb, var(--primary) 34%, var(--line));
}

.official-rules-site-summary {
  display: flex;
  min-height: 54px;
  box-sizing: border-box;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  cursor: pointer;
  list-style: none;
}

.official-rules-site-summary::-webkit-details-marker {
  display: none;
}

.official-rules-site-summary::before {
  content: "›";
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 22px;
  line-height: 1;
  transform: rotate(0deg);
  transition: transform 150ms ease;
}

.official-rules-site[open] > .official-rules-site-summary::before {
  transform: rotate(90deg);
}

.official-rules-site-summary:hover {
  background: color-mix(in srgb, var(--primary) 6%, transparent);
}

.official-rules-site-summary:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: -2px;
}

.official-rules-site-name {
  min-width: 130px;
  display: grid;
  gap: 2px;
}

.official-rules-site-name small {
  color: var(--muted);
  font-size: 11px;
}

.official-rules-site-features,
.official-rules-site-states {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
}

.official-rules-site-features {
  min-width: 0;
  flex: 1 1 220px;
}

.official-rules-site-states:empty {
  display: none;
}

.official-rules-feature,
.official-rules-site-state {
  padding: 3px 7px;
  font-size: 10px;
  font-weight: var(--font-weight-bold);
  border-radius: 999px;
}

.official-rules-feature {
  color: var(--muted);
  border: 1px solid var(--line);
  background: var(--panel);
}

.official-rules-site-state {
  color: var(--primary);
  border: 1px solid color-mix(in srgb, var(--primary) 28%, var(--line));
  background: color-mix(in srgb, var(--primary) 8%, var(--panel));
}

.official-rules-site-components {
  display: grid;
  gap: 8px;
  padding: 8px;
  border-top: 1px solid var(--line);
  background: color-mix(in srgb, var(--panel-2) 42%, transparent);
}

.official-rules-component,
.official-rules-alias {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  padding: 11px 12px;
  border: 1px solid var(--line);
  border-radius: var(--ui-radius);
  background: color-mix(in srgb, var(--panel-2) 54%, var(--panel));
}

.official-rules-component[data-changed="true"] {
  border-color: color-mix(in srgb, var(--primary) 34%, var(--line));
}

.official-rules-component-copy,
.official-rules-alias-copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.official-rules-component-copy strong,
.official-rules-alias-copy strong {
  overflow-wrap: anywhere;
}

.official-rules-component-key {
  width: fit-content;
  color: var(--primary);
  font-size: 11px;
  overflow-wrap: anywhere;
  user-select: all;
}

.official-rules-component-versions {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 12px;
  color: var(--muted);
  font-size: 11px;
}

.official-rules-override-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
}

.official-rules-override-fields small {
  margin: 0;
}

.official-rules-component-versions code,
.official-rules-alias code {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.official-rules-alias-state {
  width: fit-content;
  padding: 2px 7px;
  color: color-mix(in srgb, var(--warning) 82%, var(--text));
  font-size: 11px;
  font-weight: var(--font-weight-bold);
  border-radius: 999px;
  background: color-mix(in srgb, var(--warning-fill) 12%, var(--panel));
}

.official-rules-alias-state[data-approved="true"] {
  color: color-mix(in srgb, var(--success) 78%, var(--text));
  background: color-mix(in srgb, var(--success) 11%, var(--panel));
}

.official-rules-confirmation {
  display: grid;
  gap: 14px;
}

.official-rules-confirmation code {
  overflow-wrap: anywhere;
  user-select: all;
}

@media (max-width: 820px) {
  .official-rules-tabs {
    gap: 3px;
    padding: 3px;
  }

  .official-rules-tab {
    min-height: 40px;
    padding: 6px 9px;
  }

  .official-rules-tab-panel {
    gap: 14px;
  }

  .official-rules-details {
    grid-template-columns: 1fr;
  }

  .official-rules-component,
  .official-rules-alias {
    grid-template-columns: 1fr;
  }

  .official-rules-site-summary {
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .official-rules-site-name {
    min-width: calc(100% - 34px);
  }

  .official-rules-site-features {
    padding-left: 28px;
  }

  .official-rules-row-actions .official-rules-action {
    flex: 1 1 140px;
  }
}
`;

export function installOfficialRulesSettingsStyles(targetDocument = document) {
  const existing = targetDocument.getElementById?.(OFFICIAL_RULES_SETTINGS_STYLE_ID);
  if (existing) return existing;
  const style = targetDocument.createElement("style");
  style.id = OFFICIAL_RULES_SETTINGS_STYLE_ID;
  style.textContent = OFFICIAL_RULES_SETTINGS_CSS;
  (targetDocument.head || targetDocument.documentElement).append(style);
  return style;
}
