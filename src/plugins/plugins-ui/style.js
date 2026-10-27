export default String.raw`
.cc-plugins-top { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
.cc-plugins-tabs { display: flex; flex-wrap: wrap; gap: 4px; }
.cc-plugins-tabs button { min-height: 30px; padding: 0 12px; border: 1px solid var(--line); border-radius: var(--radius-pill); background: var(--panel); font-weight: var(--fw-medium); }
.cc-plugins-tabs button:hover { background: var(--hover); }
.cc-plugins-tabs button[aria-selected="true"] { background: var(--control-selected); border-color: var(--primary); color: var(--text); }
.cc-plugins-tools { display: flex; gap: 8px; align-items: center; }
.cc-plugins-tools .cc-input { flex: 1; }
.cc-plugins-tools .cc-segmented button { min-height: 34px; padding: 0 12px; }
.cc-plugins-banner { display: flex; align-items: center; gap: 12px; padding: 10px 12px; margin-bottom: 12px; border: 1px solid color-mix(in srgb, var(--warning-fill) 36%, transparent); background: color-mix(in srgb, var(--warning-fill) 12%, var(--panel)); border-radius: var(--radius); }
.cc-plugins-banner span { flex: 1; font-weight: var(--fw-semibold); }
.cc-plugins-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 1100px) { .cc-plugins-grid { grid-template-columns: minmax(0, 1fr); } }
.cc-plugins-divider { display: flex; align-items: center; gap: 12px; margin: 20px 0 12px; color: var(--muted); font-size: var(--fs-small); font-weight: var(--fw-semibold); }
.cc-plugins-divider::after { content: ""; flex: 1; height: 1px; background: var(--line); }
.cc-plugin-card { display: flex; flex-direction: column; gap: 8px; padding: 14px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); min-width: 0; }
.cc-plugin-card:hover { border-color: var(--line-strong); }
.cc-plugin-card.failed { border-color: color-mix(in srgb, var(--warning-fill) 60%, var(--line)); background: color-mix(in srgb, var(--warning-fill) 6%, var(--panel)); }
.cc-plugin-card .row { display: flex; align-items: center; gap: 10px; min-width: 0; }
.cc-plugin-card .glyph { width: 32px; height: 32px; flex: none; display: inline-flex; align-items: center; justify-content: center; border-radius: var(--radius); background: var(--primary-2); color: var(--primary); }
.cc-plugin-card .glyph .cc-icon { width: 17px; height: 17px; }
.cc-plugin-card .name { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-weight: var(--fw-bold); }
.cc-plugin-card .desc { color: var(--muted); font-size: var(--fs-small); line-height: 1.5; min-height: 36px; }
.cc-plugin-card .authors { color: var(--muted); font-size: var(--fs-xs); min-height: 16px; }
.cc-plugin-card .actions { display: flex; align-items: center; gap: 2px; }
.cc-plugin-card .lock { color: var(--muted); display: inline-flex; }
.cc-plugin-card .failed-note { display: flex; align-items: center; gap: 6px; color: var(--warning); font-size: var(--fs-small); font-weight: var(--fw-semibold); }
.cc-plugin-dialog-meta { color: var(--muted); font-size: var(--fs-small); margin-bottom: 8px; }
`;
