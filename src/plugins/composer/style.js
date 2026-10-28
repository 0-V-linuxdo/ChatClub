export default String.raw`
.cc-composer-slot { flex: none; display: flex; align-items: center; width: clamp(min(320px, calc(100vw - 32px)), 48vw, 760px); height: 40px; position: relative; }
.cc-composer {
  --composer-font: 16px;
  position: relative; width: 100%; display: flex; flex-direction: column; min-height: 40px;
  border: 1px solid var(--line); border-radius: 12px; background: var(--panel); color: var(--text);
}
.cc-composer:focus-within { border-color: var(--primary); }
.cc-composer-row { display: flex; align-items: center; gap: 8px; min-height: 38px; padding: 0 8px 0 12px; }
.cc-composer.stacked .cc-composer-row { flex-wrap: wrap; padding-top: 6px; padding-bottom: 4px; }
.cc-composer.stacked .cc-composer-text { flex-basis: 100%; order: -1; }
.cc-composer.stacked .cc-composer-tools-gap { flex: 1; }
.cc-composer-modes { display: flex; gap: 2px; flex: none; }
.cc-composer-mode { width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 6px; background: transparent; color: var(--muted); padding: 0; }
.cc-composer-mode[aria-pressed="true"] { background: var(--primary); color: var(--on-primary); }
.cc-composer-mode .cc-icon { width: 16px; height: 16px; }
.cc-composer-text { flex: 1; min-width: 0; display: flex; align-items: center; }
.cc-composer textarea {
  width: 100%; resize: none; border: 0; outline: none; background: transparent; color: inherit; padding: 8px 0;
  font: inherit; font-size: var(--composer-font); line-height: 1.4; height: 38px; max-height: var(--composer-max-h, 180px); overflow-y: hidden;
}
.cc-composer:not(.expanded) textarea { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cc-composer.expanded textarea { overflow-y: auto; }
.cc-composer textarea::placeholder { color: var(--muted); }
.cc-composer-send { width: 28px; height: 28px; flex: none; display: inline-flex; align-items: center; justify-content: center; border: 0; padding: 0; border-radius: 6px; background: var(--primary); color: var(--on-primary); }
.cc-composer-send:disabled { opacity: .48; }
.cc-composer-send .cc-icon { width: 15px; height: 15px; }
.cc-composer-queue { flex: none; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: color-mix(in srgb, var(--primary) 16%, transparent); color: var(--primary); font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.cc-composer-status { flex: none; display: inline-flex; align-items: center; gap: 6px; max-width: 220px; color: var(--muted); font-size: var(--fs-small); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.cc-composer-status.error { color: var(--warning, var(--danger)); }
.cc-composer-status .cc-spinner { width: 13px; height: 13px; color: var(--primary); }
.cc-composer.docked-expanded { position: fixed; z-index: var(--z-panel); box-shadow: var(--shadow-pop, var(--shadow)); }
.cc-composer-menu { width: 236px; }
`;
