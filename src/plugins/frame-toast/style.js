export default String.raw`
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
