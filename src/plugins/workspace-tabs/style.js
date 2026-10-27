export default String.raw`
.cc-tabs { position: absolute; top: 0; left: 0; bottom: 0; display: flex; flex-direction: column; width: var(--tabs-w, 320px); background: var(--panel); border-right: 1px solid var(--line); box-shadow: 16px 0 28px rgba(0,0,0,.18); z-index: 15; }
.cc-tabs[hidden] { display: none; }
.cc-shell[data-fullscreen="true"] .cc-tabs { display: none; }
.cc-shell[data-topbar="auto"] .cc-sidebar-slot { top: 0; }
.cc-tabs-head { display: flex; align-items: center; gap: 6px; min-height: 44px; padding: 14px 14px 10px; border-bottom: 1px solid var(--line); }
.cc-tabs-head .count { min-width: 22px; height: 22px; padding: 0 6px; border-radius: 999px; background: var(--primary); color: var(--on-primary); font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.cc-tabs-head .title { flex: 1; min-width: 0; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cc-tabs-list { flex: 1; min-height: 0; overflow-y: auto; padding: 6px 8px 16px; }
.cc-tabs-sec { margin: 12px 4px 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
.cc-tabs-row { position: relative; display: flex; align-items: center; gap: 8px; min-height: 36px; padding: 8px 10px; border-radius: 8px; border: 1px solid transparent; cursor: pointer; user-select: none; }
.cc-tabs-row:hover, .cc-tabs-row:focus-within { background: var(--hover); border-color: var(--line); }
.cc-tabs-row.self { background: var(--control-selected); border-color: var(--primary); }
.cc-tabs-row.in-folder { margin-left: 18px; }
.cc-tabs-row .num { flex: none; min-width: 14px; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.cc-tabs-row .pin-mark { flex: none; color: var(--muted); display: inline-flex; }
.cc-tabs-row .name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cc-tabs-row .icons { flex: none; display: inline-flex; }
.cc-tabs-row .icons img { width: 16px; height: 16px; border-radius: 4px; background: var(--panel); box-shadow: 0 0 0 2px var(--panel); }
.cc-tabs-row .icons img + img { margin-left: -5px; }
.cc-tabs-row .actions { display: none; gap: 2px; }
.cc-tabs-row:hover .actions, .cc-tabs-row:focus-within .actions, .cc-tabs-row.menu-open .actions { display: inline-flex; }
.cc-tabs-row:hover .icons, .cc-tabs-row:focus-within .icons { display: none; }
.cc-tabs-row.editing { cursor: default; }
.cc-tabs-row.editing input { flex: 1; min-width: 0; }
.cc-tabs-folder { display: flex; align-items: center; gap: 6px; min-height: 32px; padding: 4px 8px; border-radius: 8px; border: 1px solid transparent; cursor: pointer; user-select: none; }
.cc-tabs-folder:hover { background: var(--hover); }
.cc-tabs-folder .name { flex: 1; min-width: 0; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cc-tabs-folder .n { color: var(--muted); font-size: 12px; }
.cc-tabs-folder .actions { display: none; gap: 2px; }
.cc-tabs-folder:hover .actions { display: inline-flex; }
.cc-tabs-folder.drop-into { box-shadow: inset 0 0 0 2px var(--primary); }
.cc-tabs-row.drop-before::before, .cc-tabs-folder.drop-before::before, .cc-tabs-row.drop-after::after, .cc-tabs-folder.drop-after::after { content: ""; position: absolute; left: 6px; right: 6px; height: 2px; background: var(--primary); border-radius: 1px; }
.cc-tabs-folder { position: relative; }
.cc-tabs-row.drop-before::before, .cc-tabs-folder.drop-before::before { top: -2px; }
.cc-tabs-row.drop-after::after, .cc-tabs-folder.drop-after::after { bottom: -2px; }
.cc-tabs-row.dragging, .cc-tabs-folder.dragging { opacity: .5; }
.cc-tabs-empty { padding: 24px 12px; color: var(--muted); text-align: center; }
.cc-tabs-resize { position: absolute; top: 0; right: -3px; bottom: 0; width: 6px; cursor: ew-resize; }
.cc-topbar-brand { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 8px; border: 0; border-radius: 8px; background: transparent; color: var(--text); font-weight: 700; cursor: pointer; white-space: nowrap; }
.cc-topbar-brand:hover { background: var(--hover); }
.cc-topbar-brand img { width: 28px; height: 28px; }
@media (max-width: 900px) { .cc-topbar-brand span { display: none; } }
`;
