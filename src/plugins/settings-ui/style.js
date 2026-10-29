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
.cc-settings-body { --settings-body-pad-top: 20px; flex: 1; min-height: 0; overflow-y: auto; scrollbar-gutter: stable; padding: var(--settings-body-pad-top) 24px 24px; }
/* Inner tab strip: underlined text tabs, as on the Void++ plugin page. */
.cc-subtabs { display: flex; flex-wrap: wrap; gap: 2px; margin-bottom: 16px; border-bottom: 1px solid var(--line); }
.cc-subtabs button { position: relative; min-height: 32px; padding: 0 10px; border: 0; border-radius: 8px 8px 0 0; background: transparent; color: var(--muted); font-weight: var(--fw-medium); }
.cc-subtabs button:hover { color: var(--text); background: var(--hover); }
.cc-subtabs button[aria-selected="true"] { color: var(--text); }
.cc-subtabs button[aria-selected="true"]::after { content: ""; position: absolute; inset-inline: 8px; bottom: -1px; height: 2px; border-radius: 1px; background: var(--primary); }
/* Settings cards follow the Void++ card: 8px radius, hairline border, a slightly raised surface,
   a header split from the body by a hairline. */
.cc-settings { --settings-card-bg: color-mix(in srgb, var(--text) 3%, var(--panel)); --settings-card-line: color-mix(in srgb, var(--text) 8%, transparent); }
.cc-settings .cc-card { border: 1px solid var(--settings-card-line); border-radius: 8px; background: var(--settings-card-bg); overflow: hidden; }
.cc-settings .cc-card + .cc-card { margin-top: 16px; }
.cc-settings .cc-card-title { padding: 10px 12px; border-bottom: 1px solid var(--settings-card-line); font-size: 14px; font-weight: var(--fw-medium); }
.cc-settings .cc-card-body { padding: 0 12px; }
/* Every card body keeps 12px from its edges; field rows at the very top or bottom drop their own
   padding on that side so the gap stays 12px instead of doubling. */
.cc-settings .cc-card-body { padding-block: 12px; }
.cc-settings .cc-card-body > .cc-field:first-child, .cc-settings .cc-card-body > :first-child > .cc-field:first-child { padding-top: 0; }
.cc-settings .cc-card-body > .cc-field:last-child, .cc-settings .cc-card-body > :last-child > .cc-field:last-child { padding-bottom: 0; }
.cc-settings .cc-card-body > :first-child, .cc-settings .cc-card-body > :first-child > :first-child { margin-top: 0; }
.cc-settings .cc-card-body > :last-child, .cc-settings .cc-card-body > :last-child > :last-child { margin-bottom: 0; }
.cc-settings .cc-field { padding: 12px 0; border-bottom-color: var(--settings-card-line); }
.cc-settings .cc-field-name .label { font-size: 14px; font-weight: var(--fw-medium); }
.cc-settings .cc-field-name .desc { font-size: var(--fs-small); line-height: 1.5; }
${TABLE_STYLE}
.cc-settings .cc-stable { border-color: var(--settings-card-line); background: var(--settings-card-bg); }
.cc-settings .cc-stable-head { background: transparent; border-bottom-color: var(--settings-card-line); }
.cc-settings .cc-stable-row { background: transparent; border-bottom-color: var(--settings-card-line); }
.cc-settings .cc-card .cc-stable { background: var(--panel); }
`;
