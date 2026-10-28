export default String.raw`
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
.cc-tips-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.cc-tips-group { border-top: 1px solid var(--line); padding: 6px 0; }
.cc-tips-group > summary { cursor: pointer; font-weight: var(--fw-semibold); padding: 6px 0; }
.cc-tips-row { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
.cc-tips-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.cc-tips-text code { color: var(--muted); font-size: var(--fs-small); }
.cc-tips-preview { border: 1px solid var(--line); background: var(--panel); border-radius: 8px; width: 28px; height: 28px; display: inline-grid; place-items: center; color: var(--muted); }
`;
