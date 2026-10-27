export default String.raw`
.cc-composer-slot { flex: none; display: flex; align-items: center; width: clamp(min(320px, calc(100vw - 32px)), 48vw, 760px); height: 40px; position: relative; }
.cc-composer-slot.floating { width: auto; }
.cc-composer {
  --composer-font: 16px;
  position: relative; width: 100%; display: flex; flex-direction: column; min-height: 40px;
  border: 1px solid var(--line); border-radius: 12px; background: var(--panel); color: var(--text);
}
.cc-composer:focus-within { border-color: var(--primary); }
.cc-composer.drop-hover { border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 22%, transparent); }
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
.cc-composer-images { display: flex; gap: 6px; padding: 8px 12px 0; flex-wrap: wrap; }
.cc-composer-images[hidden] { display: none; }
.cc-composer-thumb { position: relative; width: 44px; height: 44px; border-radius: 6px; overflow: hidden; border: 1px solid var(--line); background: var(--panel-2); }
.cc-composer-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cc-composer-thumb button { position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; border-radius: 50%; border: 0; padding: 0; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,.62); color: #fff; }
.cc-composer-thumb:hover button, .cc-composer-thumb button:focus-visible { display: inline-flex; }
.cc-composer-thumb button .cc-icon { width: 11px; height: 11px; }
.cc-composer:not(.expanded) .cc-composer-images { padding: 0; position: absolute; left: 84px; top: 9px; pointer-events: none; }
.cc-composer:not(.expanded) .cc-composer-images:not([hidden]) ~ .cc-composer-row textarea { padding-left: 0; }
.cc-composer:not(.expanded) .cc-composer-thumb { width: 22px; height: 22px; border-radius: 4px; }
.cc-composer:not(.expanded) .cc-composer-thumb button { display: none !important; }
.cc-composer.docked-expanded { position: fixed; z-index: var(--z-panel); box-shadow: var(--shadow-pop, var(--shadow)); }
.cc-composer-float { position: fixed; z-index: var(--z-panel); left: 50%; transform: translateX(-50%); width: clamp(min(320px, calc(100vw - 32px)), 48vw, 760px); }
.cc-composer-float .cc-composer { box-shadow: var(--shadow-pop, 0 18px 48px rgba(0,0,0,.28)); }
.cc-composer-search { border-top: 1px solid var(--line); padding: 6px; max-height: var(--composer-search-max, 420px); overflow-y: auto; }
.cc-composer-search[hidden] { display: none; }
.cc-composer.searching { border-radius: 12px; }
.cc-composer-search .head { font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; padding: 4px 8px 6px; }
.cc-composer-result { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 40px; padding: 6px 10px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--text); text-align: left; }
.cc-composer-result:hover { background: var(--hover); }
.cc-composer-result[aria-selected="true"] { background: var(--control-selected); border-color: var(--primary); }
.cc-composer-result .icons { display: flex; flex: none; }
.cc-composer-result .icons img { width: 16px; height: 16px; border-radius: 4px; border: 1px solid var(--panel); margin-left: -5px; background: var(--panel); }
.cc-composer-result .icons img:first-child { margin-left: 0; }
.cc-composer-result .main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.cc-composer-result .title, .cc-composer-result .snippet { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-composer-result .snippet { color: var(--muted); font-size: var(--fs-small); }
.cc-composer-result mark { background: color-mix(in srgb, var(--primary) 26%, transparent); color: inherit; border-radius: 2px; }
.cc-composer-result .meta { flex: none; color: var(--muted); font-size: var(--fs-small); display: flex; gap: 8px; }
.cc-composer-search .foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 8px 2px; color: var(--muted); font-size: var(--fs-small); }
.cc-composer-search .foot button { border: 0; background: transparent; color: var(--primary); padding: 2px 4px; font: inherit; }
.cc-composer-search .empty { padding: 14px 8px; color: var(--muted); text-align: center; }
.cc-composer-menu { width: 236px; }
`;
