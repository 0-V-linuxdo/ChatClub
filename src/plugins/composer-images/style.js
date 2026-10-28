export default String.raw`
.cc-composer.drop-hover { border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 22%, transparent); }
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
`;
