export default String.raw`
.cc-shell[data-topbar="auto"] { grid-template-rows: 0 minmax(0, 1fr); }
/* The fixed top bar leaves the grid, so pin the workspace to its row or it lands in the 0-height one. */
.cc-shell[data-topbar="auto"] > .cc-workspace-slot { grid-row: 2; }
.cc-shell[data-topbar="auto"] .cc-topbar-slot { position: fixed; top: 0; left: 0; right: 0; transform: translateY(-100%); transition: transform var(--topbar-out); pointer-events: none; }
.cc-shell[data-topbar="auto"][data-topbar-shown="true"] .cc-topbar-slot { transform: none; transition: transform var(--topbar-in); pointer-events: auto; }
.cc-shell[data-topbar="auto"] .cc-sidebar-slot { top: 0; }
.cc-topbar-autohide-catcher { position: fixed; left: 0; right: 0; height: 40px; z-index: var(--z-topbar); background: transparent; }
.cc-topbar-autohide-catcher[hidden] { display: none; }
@media (prefers-reduced-motion: reduce) { .cc-shell[data-topbar="auto"] .cc-topbar-slot { transition: none !important; } }
`;
