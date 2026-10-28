export default String.raw`
.cc-sidebar-editor { display: grid; gap: 8px; width: 100%; }
.cc-sidebar-editor .cc-stable-row { min-height: 44px; }
.cc-sidebar-editor-name { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
.cc-sidebar-editor-name > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cc-sidebar-editor-name svg { color: var(--muted); flex: none; }
.cc-sidebar-editor .cc-stable-head > div:nth-child(3), .cc-sidebar-editor-switch { text-align: right; }
.cc-sidebar-editor-switch { display: flex; justify-content: flex-end; }
`;
