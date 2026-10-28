export default String.raw`
.cc-ws { position: absolute; inset: 0; display: flex; overflow-x: auto; overflow-y: hidden; background: var(--bg); scrollbar-width: thin; }
.cc-ws-col { position: relative; flex: none; display: flex; flex-direction: column; min-width: 280px; height: 100%; border-right: 1px solid var(--line); background: var(--panel); }
.cc-ws[data-fullscreen="true"] .cc-ws-col:not([data-fullscreen="true"]) { display: none; }
.cc-ws[data-fullscreen="true"] .cc-ws-col { width: 100% !important; }
.cc-ws-col.cc-highlight::after { content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 5; border: 2px solid var(--primary); box-shadow: inset 0 0 0 3px color-mix(in srgb, var(--primary) 22%, transparent); animation: cc-ws-highlight 1.6s ease-out forwards; }
@keyframes cc-ws-highlight { 0%, 60% { opacity: 1; } 100% { opacity: 0; } }
.cc-ws-head { display: flex; align-items: flex-end; height: 35px; min-height: 35px; padding: 0 4px 0 4px; background: var(--panel-2); border-bottom: 1px solid var(--line); }
.cc-ws-tabs { flex: 1; min-width: 0; display: flex; align-items: flex-end; gap: 2px; overflow-x: auto; scrollbar-width: none; height: 100%; }
.cc-ws-tabs::-webkit-scrollbar { display: none; }
.cc-ws-tab {
  position: relative; flex: none; display: flex; align-items: center; gap: 6px; height: 34px; max-width: 178px; padding: 0 4px 0 6px;
  border: 1px solid transparent; border-radius: var(--radius-tab) var(--radius-tab) 0 0; background: transparent;
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
.cc-ws-add { flex: none; align-self: center; margin-left: 2px; }
.cc-ws-buttons { flex: none; display: flex; align-items: center; gap: 2px; height: 100%; padding-left: 4px; }
.cc-ws-body { position: relative; flex: 1; min-height: 0; overflow: hidden; background: var(--panel); }
.cc-ws-body iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: var(--panel); }
.cc-ws-body iframe[hidden] { display: block !important; visibility: hidden; pointer-events: none; }
.cc-ws-overlay { position: absolute; inset: 0; z-index: var(--z-frame-overlay); display: flex; align-items: center; justify-content: center; cursor: wait; background: transparent; }
.cc-ws-overlay.new-topic { background: #000 !important; transition: opacity .9s ease; }
.cc-ws-overlay.fading { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .cc-ws-overlay.new-topic { transition: none; } }
.cc-ws-status { z-index: var(--z-frame-status); display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border: 1px solid var(--line); border-radius: var(--radius-pill); background: color-mix(in srgb, var(--panel) 94%, transparent); box-shadow: var(--shadow); font-size: 14px; font-weight: var(--fw-medium); color: var(--text); }
.cc-ws-status .cc-spinner { color: var(--primary); width: 14px; height: 14px; }
.cc-ws-buttons .cc-compact-btn[aria-busy="true"] .cc-icon { animation: cc-spin .9s linear infinite; }
.cc-ws-buttons .cc-compact-btn.danger { color: var(--danger); }
`;
