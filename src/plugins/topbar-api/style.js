export default String.raw`
.cc-topbar {
  position: relative; display: flex; align-items: center; gap: var(--space-2); height: var(--topbar-h); padding: 6px 8px;
  background: var(--panel); border-bottom: 1px solid var(--line); white-space: nowrap; overflow: hidden;
}
.cc-topbar-flex { flex: 1 1 0; min-width: 0; }
.cc-topbar-btn {
  width: 34px; height: 34px; flex: none; display: inline-flex; align-items: center; justify-content: center; padding: 0;
  border: 1px solid transparent; border-radius: var(--radius); background: transparent; color: var(--text);
}
.cc-topbar-btn .cc-icon { width: 19px; height: 19px; }
.cc-topbar-btn:hover:not(:disabled), .cc-topbar-btn[aria-expanded="true"] { border-color: var(--line); background: var(--hover); }
.cc-topbar-btn.action { border-color: var(--line); background: var(--panel); }
.cc-topbar-btn.action .cc-icon { width: 16px; height: 16px; }
.cc-topbar-btn.action:hover:not(:disabled) { border-color: var(--primary); }
.cc-topbar-btn.danger { color: var(--danger); }
.cc-topbar-btn.active { color: var(--primary); border-color: var(--primary); background: var(--control-selected); }
.cc-topbar-btn:disabled { opacity: var(--disabled-opacity); cursor: not-allowed; }
.cc-topbar-item { flex: none; display: flex; align-items: center; min-width: 0; }
.cc-topbar-item.grow { flex: 1 1 auto; }
.cc-shell[data-topbar="auto"] { grid-template-rows: 0 minmax(0, 1fr); }
.cc-shell[data-topbar="auto"] .cc-topbar-slot { position: fixed; top: 0; left: 0; right: 0; transform: translateY(-100%); transition: transform var(--topbar-out); pointer-events: none; }
.cc-shell[data-topbar="auto"][data-topbar-shown="true"] .cc-topbar-slot { transform: none; transition: transform var(--topbar-in); pointer-events: auto; }
.cc-shell[data-topbar="auto"] .cc-sidebar-slot { top: 0; }
@media (prefers-reduced-motion: reduce) { .cc-shell[data-topbar="auto"] .cc-topbar-slot { transition: none !important; } }

.cc-topbar.editing { overflow-x: auto; z-index: var(--z-topbar-edit); }
.cc-topbar.editing .cc-topbar-item { padding: 2px; border: 1px dashed transparent; border-radius: var(--radius); cursor: grab; }
.cc-topbar.editing .cc-topbar-item:hover { border-color: var(--line-strong); }
.cc-topbar.editing .cc-topbar-item.dragging { opacity: .45; }
.cc-topbar.editing .cc-topbar-item > * { pointer-events: none; }
.cc-topbar.editing .cc-topbar-flex { min-width: 48px; height: 34px; border: 1px dashed var(--line-strong); border-radius: var(--radius); }
.cc-drop-line { width: 2px; align-self: stretch; background: var(--drop-indicator); border-radius: 2px; flex: none; }
.cc-topbar-palette {
  position: absolute; left: 0; right: 0; top: 100%; z-index: var(--z-topbar-edit); padding: 12px 16px 16px;
  background: var(--panel); border-bottom: 1px solid var(--line); box-shadow: var(--shadow);
}
.cc-topbar-palette.removing { background: color-mix(in srgb, var(--danger) 8%, var(--panel)); }
.cc-topbar-palette .hint { color: var(--muted); margin-bottom: 12px; }
.cc-palette-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 8px; }
.cc-palette-cell {
  height: 72px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 4px;
  border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); font-size: var(--fs-small); cursor: grab; text-align: center;
}
.cc-palette-cell:hover { border-color: var(--primary); background: var(--hover); }
.cc-palette-cell .cc-icon { width: 24px; height: 24px; }
.cc-palette-cell span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-palette-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.cc-palette-actions .primary { box-shadow: 0 2px 8px color-mix(in srgb, var(--primary) 28%, transparent); }
`;
