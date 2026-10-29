export default String.raw`
/* The slot keeps its docked width while the box floats, so the top bar items do not shift. */
.cc-composer-slot.floating { justify-content: center; }
.cc-composer-float { position: fixed; z-index: var(--z-panel); left: 50%; transform: translateX(-50%); width: clamp(min(320px, calc(100vw - 32px)), 48vw, 760px); }
.cc-composer-float .cc-composer { box-shadow: var(--shadow-pop, 0 18px 48px rgba(0,0,0,.28)); }
`;
