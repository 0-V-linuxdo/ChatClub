export default String.raw`
/* Pinned to the very top of the scrolling body: it covers the body's top padding and its own bottom gap,
   so cards scrolling underneath never show above, between or below the tabs and the search row. */
.cc-plugins-top { --pad: var(--settings-body-pad-top, 20px); position: sticky; top: calc(-1 * var(--pad)); z-index: 2; display: flex; flex-direction: column; gap: 16px; margin: calc(-1 * var(--pad)) 0 0; padding: var(--pad) 0 16px; background: var(--panel); }
.cc-plugins-top .cc-subtabs { margin-bottom: 0; }
.cc-plugins-tools { display: flex; gap: 12px; align-items: center; }
.cc-plugins-tools .cc-input { flex: 1; min-width: 0; }
.cc-plugins-tools .cc-plugins-filter { width: 7.5rem; flex: none; }
.cc-plugins-toolbar { margin-top: 0; }
/* The pinned bar below pulls itself up over the body padding, so the banner keeps a 16px gap by adding it. */
.cc-plugins-banner { display: flex; align-items: center; gap: 12px; padding: 10px 12px; margin-bottom: calc(16px + var(--settings-body-pad-top, 20px)); border: 1px solid color-mix(in srgb, var(--warning-fill) 40%, transparent); background: color-mix(in srgb, var(--warning-fill) 12%, var(--panel)); border-radius: 8px; color: var(--warning); }
.cc-plugins-banner span { flex: 1; font-size: var(--fs-small); }
.cc-plugins-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 900px) { .cc-plugins-grid { grid-template-columns: minmax(0, 1fr); } }
.cc-plugins-divider { height: 1px; margin: 16px 0; background: var(--line); }
/* Plugin card (Void++ card): body, hairline, footer. */
.cc-plugin-card { contain: content; display: flex; flex-direction: column; min-height: 120px; min-width: 0; border: 1px solid var(--settings-card-line, var(--line)); border-radius: 8px; background: var(--settings-card-bg, var(--panel)); overflow: hidden; }
.cc-plugin-card .body { flex: 1; display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; }
.cc-plugin-card .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.cc-plugin-card .name { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; overflow: hidden; }
.cc-plugin-card .glyph { width: 24px; height: 24px; flex: none; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; background: color-mix(in srgb, var(--text) 10%, transparent); color: var(--text); }
.cc-plugin-card .glyph .cc-icon { width: 14px; height: 14px; }
.cc-plugin-card .title { min-width: 0; flex-shrink: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: var(--fw-medium); }
.cc-plugin-card .hint { display: inline-flex; flex: none; color: var(--muted); line-height: 0; }
.cc-plugin-card .hint .cc-icon { width: 14px; height: 14px; }
.cc-plugin-card .hint.failed-icon { color: var(--danger); }
.cc-plugin-card .controls { display: flex; align-items: center; gap: 6px; flex: none; }
.cc-plugin-card .controls .cc-compact-btn { width: 24px; height: 24px; color: var(--muted); }
.cc-plugin-card .controls .cc-compact-btn.active { color: var(--text); }
.cc-plugin-card .desc { margin-top: 4px; color: var(--muted); font-size: 13px; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.cc-plugin-card .sep { height: 1px; background: var(--settings-card-line, var(--line)); }
.cc-plugin-card .footer { display: flex; align-items: center; gap: 6px; padding: 6px 12px; }
.cc-plugin-card .authors { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: color-mix(in srgb, var(--muted) 80%, var(--panel)); font-size: 11px; }
.cc-plugin-card.required { opacity: 0.4; }
.cc-plugin-card.failed { opacity: 0.5; border-color: color-mix(in srgb, var(--danger) 45%, transparent); }
.cc-modal.cc-plugin-dialog { width: min(600px, calc(100vw - 32px)); min-height: min(420px, calc(100vh - 32px)); }
.cc-plugin-dialog-list { display: flex; flex-direction: column; gap: 12px; margin-top: 8px; }
.cc-plugin-dialog-list .cc-field { grid-template-columns: minmax(0, 1fr) auto; padding: 0; border: 0; }
.cc-plugin-dialog-list .cc-field.stacked { grid-template-columns: minmax(0, 1fr); }
.cc-plugin-dialog-list .cc-field-name .label { font-size: 14px; font-weight: var(--fw-regular); }
.cc-plugin-dialog-list .cc-slider-row { width: 100%; }
.cc-plugin-dialog-list .cc-slider-row input[type="range"] { flex: 1; width: auto; }
.cc-plugin-dialog-meta { color: var(--muted); font-size: var(--fs-small); margin-bottom: 8px; }
`;
