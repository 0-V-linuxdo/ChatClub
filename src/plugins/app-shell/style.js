// Shell layout and shared component styles (spec v2 01 §4–§6).
export default String.raw`
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
  min-width: 980px; background: var(--bg); color: var(--text); font-family: var(--font);
  font-size: var(--fs-body); font-weight: var(--fw-regular); line-height: 1.4; overflow: hidden;
  -webkit-font-smoothing: antialiased;
}
body[data-page="options"] { overflow: auto; }
button, input, select, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }
[hidden] { display: none !important; }
.cc-icon { flex: none; display: block; }
:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
* { scrollbar-width: thin; scrollbar-color: var(--scrollbar-thumb) transparent; }
*::-webkit-scrollbar { width: 6px; height: 6px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: var(--radius-pill); }
*::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-thumb-hover); }
.cc-scroll-y { overflow-y: auto; scrollbar-gutter: stable; }
.cc-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* ---- shell grid ---- */
.cc-shell { position: fixed; inset: 0; display: grid; grid-template-rows: var(--topbar-h) minmax(0, 1fr); }
.cc-shell[data-fullscreen="true"] { grid-template-rows: 0 minmax(0, 1fr); }
.cc-shell[data-fullscreen="true"] .cc-topbar-slot { visibility: hidden; }
.cc-topbar-slot { position: relative; z-index: var(--z-topbar); min-width: 0; }
.cc-workspace-slot { position: relative; min-width: 0; min-height: 0; }
.cc-sidebar-slot { position: absolute; top: var(--topbar-h); left: 0; bottom: 0; z-index: var(--z-sidebar); }
.cc-shell[data-page="options"] { position: static; display: block; }
.cc-fatal { margin: 80px auto; max-width: 520px; padding: var(--space-4); border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); }
.cc-fatal h1 { font-size: var(--fs-title); margin: 0 0 var(--space-2); }

/* ---- buttons ---- */
.cc-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 30px; padding: 0 10px;
  border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); color: var(--text);
  font-weight: var(--fw-medium); white-space: nowrap; transition: border-color .12s, background-color .12s;
}
.cc-btn:hover:not(:disabled) { border-color: var(--primary); }
.cc-btn:active:not(:disabled) { background: var(--control-pressed); }
.cc-btn.primary { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
.cc-btn.primary:hover:not(:disabled) { background: color-mix(in srgb, var(--primary) 88%, #000); }
.cc-btn.danger { color: var(--danger); }
.cc-btn.danger:hover:not(:disabled) { border-color: color-mix(in srgb, var(--danger) 42%, var(--line)); }
.cc-btn.danger-solid { background: var(--danger); border-color: var(--danger); color: var(--on-primary); }
.cc-btn.danger-solid:hover:not(:disabled) { background: var(--danger-hover); border-color: var(--danger-hover); }
.cc-btn.danger-solid:active:not(:disabled) { background: var(--danger-active); }
.cc-btn.tall { min-height: var(--control-h); min-width: 94px; }
.cc-btn:disabled, .cc-icon-btn:disabled, .cc-compact-btn:disabled { opacity: var(--disabled-opacity); cursor: not-allowed; }
.cc-icon-btn {
  width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; padding: 0;
  border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); color: var(--text);
}
.cc-icon-btn:hover:not(:disabled) { border-color: var(--primary); }
.cc-icon-btn[aria-pressed="true"] { color: var(--primary); background: color-mix(in srgb, var(--primary) 12%, transparent); }
.cc-compact-btn {
  width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; padding: 0;
  border: 1px solid transparent; border-radius: var(--radius-nested); background: transparent; color: var(--muted);
}
.cc-compact-btn .cc-icon { width: 15px; height: 15px; }
.cc-compact-btn:hover:not(:disabled), .cc-compact-btn[aria-expanded="true"] { border-color: var(--line-strong); background: var(--hover); color: var(--text); }
.cc-compact-btn.active { color: var(--primary); }
.cc-btn .cc-spinner { width: 14px; height: 14px; }
.cc-spinner { width: 16px; height: 16px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: cc-spin .8s linear infinite; flex: none; }
@keyframes cc-spin { to { transform: rotate(360deg); } }
.cc-link-btn { border: 0; background: none; padding: 0; color: var(--link); font-weight: var(--fw-medium); }

/* ---- form controls ---- */
.cc-input, .cc-textarea, .cc-select {
  width: 100%; min-height: var(--control-h); padding: 8px 10px; border: 1px solid var(--line); border-radius: var(--radius);
  background: var(--panel); color: var(--text); outline: none;
}
.cc-textarea { min-height: 86px; resize: vertical; line-height: 1.5; }
.cc-select { width: 16rem; max-width: 100%; padding-right: 28px; }
.cc-input:focus, .cc-textarea:focus, .cc-select:focus {
  border-color: color-mix(in srgb, var(--primary) 72%, var(--line));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 18%, transparent);
}
.cc-input:disabled, .cc-textarea:disabled, .cc-select:disabled { opacity: var(--disabled-opacity); cursor: not-allowed; }
.cc-input.mono, .cc-textarea.mono { font-family: var(--font-mono); font-size: var(--fs-small); }
.cc-check { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; }
.cc-check input { width: 19px; height: 19px; margin: 0; accent-color: var(--primary); cursor: pointer; }
.cc-check input:disabled { cursor: not-allowed; opacity: var(--disabled-opacity); }
.cc-switch { position: relative; display: inline-flex; width: 34px; height: 20px; flex: none; }
.cc-switch input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
.cc-switch span { position: absolute; inset: 0; border-radius: var(--radius-pill); background: var(--line-strong); transition: background-color .15s; pointer-events: none; }
.cc-switch span::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform .15s; }
.cc-switch input:checked + span { background: var(--primary); }
.cc-switch input:checked + span::after { transform: translateX(14px); }
.cc-switch input:focus-visible + span { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.cc-switch input:disabled { cursor: not-allowed; }
.cc-switch input:disabled + span { opacity: var(--disabled-opacity); }
.cc-segmented { display: inline-flex; border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; background: var(--panel); }
.cc-segmented button { display: inline-flex; align-items: center; gap: 6px; min-height: var(--control-h); padding: 0 var(--space-4); border: 0; border-right: 1px solid var(--line); background: transparent; font-weight: var(--fw-medium); }
.cc-segmented button:last-child { border-right: 0; }
.cc-segmented button:hover { background: var(--hover); }
.cc-segmented button[aria-pressed="true"] { background: var(--control-selected); box-shadow: inset 0 0 0 1px var(--primary); }
.cc-slider-row { display: inline-flex; align-items: center; gap: var(--space-2); }
.cc-slider-row input[type="range"] { width: 220px; accent-color: var(--primary); }
.cc-slider-row output { width: 48px; font-variant-numeric: tabular-nums; }
.cc-color-row { display: inline-flex; gap: var(--space-2); align-items: center; }
.cc-color-row input[type="color"] { width: 36px; height: 36px; padding: 3px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); cursor: pointer; }
.cc-color-row .cc-input { width: 86px; font-family: var(--font-mono); }
.cc-field-error { color: var(--danger); font-size: var(--fs-small); margin-top: 4px; }

/* ---- field grid & cards ---- */
.cc-card { border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); }
.cc-card + .cc-card { margin-top: var(--space-4); }
.cc-card-title { padding: 12px var(--space-4); border-bottom: 1px solid var(--line); font-weight: var(--fw-bold); font-size: var(--fs-body); }
.cc-card-body { padding: 0 var(--space-4); }
.cc-field { display: grid; grid-template-columns: minmax(11rem, 16rem) minmax(0, 1fr); gap: var(--space-4); align-items: center; padding: 12px 0; border-bottom: 1px solid color-mix(in srgb, var(--line) 72%, transparent); }
.cc-field:last-child { border-bottom: 0; }
.cc-field-name { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cc-field-name .label { display: inline-flex; align-items: center; gap: 6px; font-weight: var(--fw-semibold); }
.cc-field-name .desc { color: var(--muted); font-size: var(--fs-small); }
.cc-field-control { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; }
.cc-field-control > .cc-input, .cc-field-control > .cc-textarea { max-width: 100%; }
.cc-help-btn { display: inline-flex; width: 18px; height: 18px; align-items: center; justify-content: center; border: 0; padding: 0; background: none; color: var(--muted); border-radius: 50%; }
.cc-help-btn:hover, .cc-help-btn[aria-expanded="true"] { color: var(--primary); }
.cc-help-btn .cc-icon { width: 14px; height: 14px; }
.cc-empty { display: flex; align-items: center; justify-content: center; min-height: 112px; padding: var(--space-4); border: 1px dashed var(--line); border-radius: var(--radius); color: var(--muted); text-align: center; }
.cc-badge { display: inline-flex; align-items: center; gap: 3px; height: 18px; padding: 0 6px; border-radius: var(--radius-pill); font-size: var(--fs-xs); font-weight: var(--fw-semibold); background: var(--primary-2); color: var(--primary); white-space: nowrap; }
.cc-badge.warning { background: color-mix(in srgb, var(--warning-fill) 16%, var(--panel)); color: var(--warning); }
.cc-badge.danger { background: color-mix(in srgb, var(--danger) 12%, var(--panel)); color: var(--danger); }
.cc-badge.muted { background: color-mix(in srgb, var(--line) 60%, var(--panel)); color: var(--muted); }
.cc-warning-card { padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--warning-fill) 36%, transparent); background: color-mix(in srgb, var(--warning-fill) 12%, var(--panel)); border-radius: var(--radius); font-size: var(--fs-small); }
.cc-table { width: 100%; border-collapse: separate; border-spacing: 0; }
.cc-table th { position: sticky; top: 0; z-index: 1; text-align: left; font-size: var(--fs-small); color: var(--muted); font-weight: var(--fw-medium); background: color-mix(in srgb, var(--line) 30%, var(--panel)); padding: 8px 12px; }
.cc-table td { padding: 10px 12px; border-bottom: 1px solid color-mix(in srgb, var(--line) 72%, transparent); height: 56px; }
.cc-table td.name { font-weight: var(--fw-semibold); }

/* ---- overlays: modal ---- */
.cc-overlay-root { position: fixed; inset: 0; pointer-events: none; z-index: var(--z-modal); }
.cc-overlay-root > * { pointer-events: auto; }
.cc-modal-backdrop { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: var(--overlay-backdrop); animation: cc-fade var(--fade); }
.cc-modal-backdrop.nested { background: transparent; z-index: var(--z-modal-nested); }
@keyframes cc-fade { from { opacity: 0; } to { opacity: 1; } }
.cc-modal {
  display: flex; flex-direction: column; width: var(--modal-w); max-height: var(--modal-max-h); background: var(--panel);
  border: 1px solid var(--overlay-border-color); border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden;
}
.cc-modal.compact { width: var(--modal-w-compact); }
.cc-modal.wide { width: var(--modal-w-wide); }
.cc-modal.task { width: var(--modal-w-task); }
.cc-modal.workspace { width: var(--modal-w-workspace); }
.cc-modal.maximized { width: 100vw; height: 100vh; max-height: 100vh; border-radius: 0; border: 0; }
.cc-modal-header { display: flex; align-items: center; gap: var(--space-2); min-height: var(--modal-header-h); padding: 14px 16px; border-bottom: 1px solid var(--line); }
.cc-modal-title { flex: 1; min-width: 0; margin: 0; font-size: var(--fs-title); font-weight: var(--fw-bold); display: flex; align-items: center; gap: 8px; }
.cc-modal-subtitle { color: var(--muted); font-size: var(--fs-small); font-weight: var(--fw-regular); margin-top: 2px; }
.cc-modal-body { padding: var(--space-4); overflow: auto; flex: 1; min-height: 0; }
.cc-modal-footer { display: flex; justify-content: flex-end; align-items: center; gap: var(--space-2); padding: 10px 16px 16px; border-top: 1px solid var(--line); }
.cc-modal-footer .spacer { flex: 1; }
.cc-window-btn { width: var(--close-button); height: var(--close-button); display: inline-flex; align-items: center; justify-content: center; border: 1px solid transparent; border-radius: var(--radius); background: transparent; color: var(--text); padding: 0; }
.cc-window-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--primary) 14%, transparent); border-color: var(--primary); }
.cc-window-btn:disabled { opacity: var(--disabled-opacity); cursor: not-allowed; }
.cc-confirm .cc-modal-title { color: var(--danger); }
.cc-confirm[data-tone="warning"] .cc-modal-title { color: var(--warning); }
.cc-confirm[data-tone="neutral"] .cc-modal-title { color: var(--text); }
.cc-confirm-desc { white-space: pre-wrap; line-height: 1.55; }
.cc-confirm-ack { display: flex; align-items: center; gap: 6px; margin-top: var(--space-3); }

/* ---- popup menu ---- */
.cc-menu-backdrop { position: fixed; inset: 0; z-index: var(--z-menu-backdrop); background: transparent; }
.cc-menu.cc-popover { max-width: calc(100vw - 16px); }
.cc-menu {
  position: fixed; z-index: var(--z-menu); min-width: 184px; max-width: min(260px, calc(100vw - 16px)); max-height: calc(100vh - 16px);
  overflow: auto; padding: 6px; display: flex; flex-direction: column; gap: 2px; background: var(--panel);
  border: 1px solid var(--line-strong); border-radius: var(--radius); box-shadow: var(--shadow); animation: cc-fade var(--fade);
}
.cc-menu.wide { max-width: min(320px, calc(100vw - 16px)); }
.cc-menu-item {
  display: flex; align-items: center; gap: 8px; min-height: 32px; padding: 0 9px; border: 0; border-radius: var(--radius-nested);
  background: transparent; color: var(--text); font-weight: var(--fw-medium); text-align: left; width: 100%;
}
.cc-menu-item .slot { width: 18px; display: inline-flex; justify-content: center; color: var(--muted); }
.cc-menu-item .slot .cc-icon { width: 15px; height: 15px; }
.cc-menu-item .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-menu-item .hint { color: var(--muted); font-size: var(--fs-xs); }
.cc-menu-item:hover:not(:disabled), .cc-menu-item:focus-visible, .cc-menu-item[aria-expanded="true"] { background: var(--hover); outline: none; }
.cc-menu-item.danger, .cc-menu-item.danger .slot { color: var(--danger); }
.cc-menu-item:disabled { opacity: var(--disabled-opacity); cursor: not-allowed; }
.cc-menu-sep { height: 1px; margin: 4px 7px; background: var(--line); flex: none; }
.cc-menu-heading { padding: 6px 9px 2px; font-size: var(--fs-xs); color: var(--muted); font-weight: var(--fw-semibold); }

/* ---- toast & notice ---- */
.cc-toasts { position: fixed; right: 18px; bottom: 18px; z-index: var(--z-toast); display: flex; flex-direction: column; align-items: flex-end; gap: 8px; pointer-events: none; }
.cc-toast {
  pointer-events: auto; display: flex; align-items: center; gap: 8px; max-width: 420px; padding: 10px 12px;
  background: var(--toast-bg); border: 1px solid var(--toast-border); border-radius: var(--radius); box-shadow: var(--shadow);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); animation: cc-toast-in .18s ease;
}
.cc-toast .cc-icon { width: 16px; height: 16px; }
.cc-toast[data-type="success"] > .cc-icon { color: var(--success); }
.cc-toast[data-type="error"] > .cc-icon { color: var(--danger); }
.cc-toast[data-type="warning"] > .cc-icon { color: var(--warning); }
.cc-toast[data-type="info"] > .cc-icon, .cc-toast[data-type="loading"] { color: var(--text); }
.cc-toast .cc-spinner { color: var(--primary); width: 14px; height: 14px; }
.cc-toast .msg { white-space: pre-wrap; }
.cc-toast .action { border: 0; background: none; color: var(--primary); font-weight: var(--fw-semibold); padding: 0 2px; }
@keyframes cc-toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.cc-notice {
  position: fixed; top: calc(var(--topbar-h) + 8px); left: 50%; transform: translateX(-50%); z-index: var(--z-toast);
  display: flex; align-items: center; gap: var(--space-2); max-width: min(720px, calc(100vw - 40px)); padding: 8px 8px 8px 12px;
  background: var(--panel); border: 1px solid var(--line-strong); border-radius: var(--radius); box-shadow: var(--shadow);
}
.cc-notice[data-type="warning"] { border-color: color-mix(in srgb, var(--warning-fill) 50%, var(--line)); }
.cc-notice[data-type="error"] { border-color: color-mix(in srgb, var(--danger) 50%, var(--line)); }
.cc-notice .msg { flex: 1; }

/* ---- tooltip ---- */
.cc-tooltip {
  position: fixed; z-index: var(--z-tooltip); max-width: 320px; padding: 8px 12px; border-radius: var(--radius);
  background: color-mix(in srgb, var(--tooltip-bg) 92%, #000); color: var(--tooltip-text); font-size: var(--fs-small);
  font-weight: var(--fw-semibold); box-shadow: var(--shadow); pointer-events: none; opacity: 0; transform: translateY(4px);
  transition: opacity .12s ease, transform .12s ease;
}
.cc-tooltip.show { opacity: 1; transform: none; }
.cc-tooltip::before { content: ""; position: absolute; left: var(--arrow-x, 50%); width: 0; height: 0; border: 6px solid transparent; transform: translateX(-50%); }
.cc-tooltip[data-side="bottom"]::before { top: -12px; border-bottom-color: color-mix(in srgb, var(--tooltip-bg) 92%, #000); }
.cc-tooltip[data-side="top"]::before { bottom: -12px; border-top-color: color-mix(in srgb, var(--tooltip-bg) 92%, #000); }
.cc-rich-tip {
  position: fixed; z-index: var(--z-tooltip); max-width: 360px; padding: 12px 14px; background: var(--panel); color: var(--text);
  border: 1px solid var(--line-strong); border-radius: var(--radius); box-shadow: var(--shadow); font-size: var(--fs-body);
  font-weight: 400; line-height: 1.5;
}
.cc-rich-tip h4 { margin: 0 0 6px; font-size: var(--fs-body); font-weight: var(--fw-bold); }
.cc-rich-tip[data-tone="warning"] h4 { color: var(--warning); }
.cc-rich-tip p { margin: 0 0 6px; }
.cc-rich-tip p:last-child, .cc-rich-tip ul:last-child { margin-bottom: 0; }
.cc-rich-tip ul { margin: 0 0 6px; padding-left: 18px; }

/* ---- floating panel ---- */
.cc-float-panel {
  position: fixed; z-index: var(--z-panel); display: flex; flex-direction: column; background: var(--panel);
  border: 1px solid var(--line-strong); border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden; min-width: 360px; min-height: 240px;
}
.cc-float-panel.maximized { inset: 12px !important; width: auto !important; height: auto !important; }
.cc-float-header { display: flex; align-items: center; gap: 8px; min-height: var(--modal-header-h); padding: 8px 10px 8px 16px; border-bottom: 1px solid var(--line); cursor: move; user-select: none; }
.cc-float-title { flex: 1; font-size: var(--fs-title); font-weight: var(--fw-bold); display: flex; align-items: center; gap: 8px; }
.cc-float-body { flex: 1; min-height: 0; overflow: auto; }
.cc-resize { position: absolute; z-index: 2; }
.cc-resize.e { top: 0; right: 0; width: 12px; height: 100%; cursor: ew-resize; }
.cc-resize.w { top: 0; left: 0; width: 12px; height: 100%; cursor: ew-resize; }
.cc-resize.s { left: 0; bottom: 0; height: 12px; width: 100%; cursor: ns-resize; }
.cc-resize.n { left: 0; top: 0; height: 6px; width: 100%; cursor: ns-resize; }
.cc-resize.se { right: 0; bottom: 0; width: 16px; height: 16px; cursor: nwse-resize; }
.cc-float-panel.maximized .cc-resize { display: none; }
body.cc-dragging-panel iframe { pointer-events: none !important; }
body.cc-dragging-panel { user-select: none; }
/* Share capture: ChatClub's own layers stay out of the screenshot (04 §4.4). */
body.share-capturing .cc-float-panel, body.share-capturing .cc-toasts, body.share-capturing .cc-modal-backdrop,
body.share-capturing .cc-menu, body.share-capturing .cc-tooltip, body.share-capturing aside.cc-tabs { visibility: hidden !important; }

@media (prefers-reduced-motion: reduce) {
  .cc-toast, .cc-tooltip { animation: none; transform: none; transition: opacity .12s ease; }
}
@media (prefers-reduced-transparency: reduce) {
  .cc-toast { backdrop-filter: none; -webkit-backdrop-filter: none; background: var(--panel); }
}
@media (forced-colors: active) {
  .cc-menu-item:hover, .cc-btn:hover { outline: 1px solid Highlight; }
}
.cc-tips-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.cc-tips-group { border-top: 1px solid var(--line); padding: 6px 0; }
.cc-tips-group > summary { cursor: pointer; font-weight: var(--fw-semibold); padding: 6px 0; }
.cc-tips-row { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
.cc-tips-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.cc-tips-text code { color: var(--muted); font-size: var(--fs-small); }
.cc-tips-preview { border: 1px solid var(--line); background: var(--panel); border-radius: 8px; width: 28px; height: 28px; display: inline-grid; place-items: center; color: var(--muted); }
`;
