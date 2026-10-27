import { TABLE_STYLE } from "../../lib/settings-table.js";

export default String.raw`
.cc-settings { display: grid; grid-template-columns: 248px minmax(0, 1fr); width: var(--modal-w-workspace); height: var(--settings-h); background: var(--panel); border: 1px solid var(--overlay-border-color); border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden; }
.cc-settings.maximized { width: calc(100vw - 24px); height: calc(100vh - 24px); }
.cc-settings.page { width: 100%; height: 100vh; border: 0; border-radius: 0; box-shadow: none; }
.cc-settings-nav { display: flex; flex-direction: column; border-right: 1px solid var(--line); background: var(--panel); min-height: 0; }
.cc-settings-brand { display: flex; align-items: center; gap: 10px; padding: 18px 22px 14px; font-size: var(--fs-title); font-weight: var(--fw-bold); }
.cc-settings-brand .cc-icon { width: 20px; height: 20px; }
.cc-settings-list { flex: 1; overflow-y: auto; padding: 4px 12px 16px; display: flex; flex-direction: column; gap: 2px; }
.cc-settings-sep { height: 1px; background: var(--line); margin: 6px 10px; flex: none; }
.cc-settings-link { display: flex; align-items: center; gap: 10px; min-height: 34px; padding: 0 12px; border: 1px solid transparent; border-radius: var(--radius); background: transparent; color: var(--text); text-align: left; font-weight: var(--fw-medium); }
.cc-settings-link .cc-icon { width: 15px; height: 15px; color: var(--muted); }
.cc-settings-link:hover { background: var(--hover); border-color: var(--line); }
.cc-settings-link[aria-current="page"] { background: var(--control-selected); border-color: var(--primary); }
.cc-settings-link[aria-current="page"] .cc-icon { color: var(--primary); }
.cc-settings-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.cc-settings-head { display: flex; align-items: flex-start; gap: 8px; padding: 14px 16px 12px 24px; border-bottom: 1px solid var(--line); }
.cc-settings-head .titles { flex: 1; min-width: 0; }
.cc-settings-head h2 { margin: 0; font-size: var(--fs-title); font-weight: var(--fw-bold); }
.cc-settings-head p { margin: 2px 0 0; color: var(--muted); font-size: var(--fs-small); }
.cc-settings-body { flex: 1; min-height: 0; overflow-y: auto; scrollbar-gutter: stable; padding: 20px 24px 24px; }
.cc-subtabs { display: inline-flex; gap: 2px; padding: 4px; margin-bottom: 16px; border: 1px solid var(--line); border-radius: var(--radius); background: color-mix(in srgb, var(--line) 22%, var(--panel)); }
.cc-subtabs button { min-height: 30px; padding: 0 12px; border: 1px solid transparent; border-radius: var(--radius-nested); background: transparent; font-weight: var(--fw-semibold); }
.cc-subtabs button:hover { background: var(--hover); }
.cc-subtabs button[aria-selected="true"] { background: var(--control-selected); border-color: var(--primary); }
${TABLE_STYLE}
`;
