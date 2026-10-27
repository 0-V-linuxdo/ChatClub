export default String.raw`
.cc-ws { position: absolute; inset: 0; display: flex; overflow-x: auto; overflow-y: hidden; background: var(--bg); scrollbar-width: thin; }
.cc-ws-col { position: relative; flex: none; display: flex; flex-direction: column; min-width: 280px; height: 100%; border-right: 1px solid var(--line); background: var(--panel); }
.cc-ws[data-fullscreen="true"] .cc-ws-col:not([data-fullscreen="true"]) { display: none; }
.cc-ws[data-fullscreen="true"] .cc-ws-col { width: 100% !important; }
.cc-ws-col.cc-highlight::after { content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 5; border: 2px solid var(--primary); box-shadow: inset 0 0 0 3px color-mix(in srgb, var(--primary) 22%, transparent); animation: cc-ws-highlight 1.6s ease-out forwards; }
@keyframes cc-ws-highlight { 0%, 60% { opacity: 1; } 100% { opacity: 0; } }
.cc-ws-col.dragging-col { opacity: .58; }
.cc-ws-col.drop-before::before, .cc-ws-col.drop-after::after { content: ""; position: absolute; top: 0; bottom: 0; width: 2px; background: var(--drop-indicator); z-index: 5; }
.cc-ws-col.drop-before::before { left: 0; }
.cc-ws-col.drop-after::after { right: -1px; }
.cc-ws-head { display: flex; align-items: flex-end; height: 35px; min-height: 35px; padding: 0 4px 0 4px; background: var(--panel-2); border-bottom: 1px solid var(--line); }
.cc-ws-tabs { flex: 1; min-width: 0; display: flex; align-items: flex-end; gap: 2px; overflow-x: auto; scrollbar-width: none; height: 100%; }
.cc-ws-tabs::-webkit-scrollbar { display: none; }
.cc-ws-tabs.drop-target { background: color-mix(in srgb, var(--primary) 8%, transparent); }
.cc-ws-tab {
  position: relative; flex: none; display: flex; align-items: center; gap: 6px; height: 34px; max-width: 178px; padding: 0 4px 0 6px;
  border: 1px solid transparent; border-bottom: 0; border-radius: var(--radius-tab) var(--radius-tab) 0 0; background: transparent;
  color: var(--muted); font-size: var(--fs-small); font-weight: var(--fw-semibold); user-select: none; -webkit-user-drag: none; cursor: default;
  margin-bottom: -1px;
}
.cc-ws-tab:hover { color: var(--text); }
.cc-ws-tab[aria-selected="true"] { background: var(--panel); color: var(--text); border-color: var(--line); border-bottom: 1px solid var(--panel); }
.cc-ws-tab img, .cc-ws-tab .fallback { width: 16px; height: 16px; border-radius: var(--radius-icon); flex: none; }
.cc-ws-tab .fallback { color: var(--muted); }
.cc-ws-tab .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-ws-tab .close { width: 24px; height: 24px; flex: none; display: inline-flex; align-items: center; justify-content: center; border: 0; padding: 0; border-radius: 50%; background: transparent; color: var(--muted); opacity: .72; }
.cc-ws-tab[aria-selected="true"] .close { opacity: .9; }
.cc-ws-tab .close:hover { opacity: 1; background: var(--hover); color: var(--text); }
.cc-ws-tab .close .cc-icon { width: 13px; height: 13px; }
.cc-ws-tab.drop-left::before, .cc-ws-tab.drop-right::after { content: ""; position: absolute; top: 6px; bottom: 6px; width: 2px; background: var(--drop-indicator); border-radius: 2px; }
.cc-ws-tab.drop-left::before { left: -2px; }
.cc-ws-tab.drop-right::after { right: -2px; }
.cc-ws-tab.drag-ghost { opacity: .5; }
.cc-ws-add { flex: none; align-self: center; margin-left: 2px; }
.cc-ws-buttons { flex: none; display: flex; align-items: center; gap: 2px; height: 100%; padding-left: 4px; }
.cc-ws-body { position: relative; flex: 1; min-height: 0; overflow: hidden; background: var(--panel); }
.cc-ws-body iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: var(--panel); }
.cc-ws-body iframe[hidden] { display: block !important; visibility: hidden; pointer-events: none; }
.cc-ws.dragging iframe { pointer-events: none; }
.cc-ws-overlay { position: absolute; inset: 0; z-index: var(--z-frame-overlay); display: flex; align-items: center; justify-content: center; cursor: wait; background: transparent; }
:root[data-theme="dark"] .cc-ws-overlay { background: color-mix(in srgb, var(--bg) var(--overlay-opacity, 82%), transparent); }
.cc-ws-overlay.new-topic { background: #000 !important; transition: opacity .9s ease; }
.cc-ws-overlay.fading { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .cc-ws-overlay.new-topic { transition: none; } }
.cc-ws-status { z-index: var(--z-frame-status); display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border: 1px solid var(--line); border-radius: var(--radius-pill); background: color-mix(in srgb, var(--panel) 94%, transparent); box-shadow: var(--shadow); font-size: 14px; font-weight: var(--fw-medium); color: var(--text); }
.cc-ws-status .cc-spinner { color: var(--primary); width: 14px; height: 14px; }
.cc-ws-buttons .cc-compact-btn[aria-busy="true"] .cc-icon { animation: cc-spin .9s linear infinite; }
.cc-ws-buttons .cc-compact-btn.danger { color: var(--danger); }
.cc-ws-frame-toast { position: absolute; z-index: var(--z-frame-toast); display: inline-flex; width: max-content; align-items: center; gap: 8px; padding: 8px 12px; max-width: calc(100% - 24px); border: 1px solid var(--toast-border); border-radius: var(--radius); background: var(--toast-bg); box-shadow: var(--shadow); backdrop-filter: blur(12px); font-size: var(--fs-body); pointer-events: none; }
.cc-ws-toast-setting { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.cc-ws-toast-preview { position: relative; width: 100%; max-width: 360px; height: 220px; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel-2, var(--panel)); cursor: grab; touch-action: none; outline: none; }
.cc-ws-toast-preview:focus-visible { box-shadow: 0 0 0 2px var(--primary); }
.cc-ws-toast-preview-head { height: 28px; border-bottom: 1px solid var(--line); background: var(--panel); }
.cc-ws-toast-sample { pointer-events: none; white-space: nowrap; }
.cc-ws-toast-meta { display: flex; align-items: center; gap: 12px; color: var(--muted); font-size: var(--fs-small, 12px); }
.cc-ws-frame-toast .cc-spinner { color: var(--primary); width: 14px; height: 14px; }
.cc-ws-frame-toast[data-type="error"] { border-color: color-mix(in srgb, var(--danger) 50%, var(--toast-border)); }
.cc-ws-frame-toast[data-type="success"] .cc-icon { color: var(--success); }
.cc-ws-frame-toast[data-type="error"] .cc-icon { color: var(--danger); }
`;
