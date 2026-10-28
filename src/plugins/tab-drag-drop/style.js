export default String.raw`
.cc-ws-col.dragging-col { opacity: .58; }
.cc-ws-col.drop-before::before, .cc-ws-col.drop-after::after { content: ""; position: absolute; top: 0; bottom: 0; width: 2px; background: var(--drop-indicator); z-index: 5; }
.cc-ws-col.drop-before::before { left: 0; }
.cc-ws-col.drop-after::after { right: -1px; }
.cc-ws-tabs.drop-target { background: color-mix(in srgb, var(--primary) 8%, transparent); }
.cc-ws-tab.drop-left::before, .cc-ws-tab.drop-right::after { content: ""; position: absolute; top: 6px; bottom: 6px; width: 2px; background: var(--drop-indicator); border-radius: 2px; }
.cc-ws-tab.drop-left::before { left: -2px; }
.cc-ws-tab.drop-right::after { right: -2px; }
.cc-ws-tab.drag-ghost { opacity: .5; }
.cc-ws.dragging iframe { pointer-events: none; }
`;
