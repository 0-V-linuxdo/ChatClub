export default `
.cc-user-plugin-frame { display: none; }
.cc-up-import { display: flex; flex-direction: column; gap: 14px; }
.cc-up-source { display: flex; flex-direction: column; gap: 8px; }
.cc-up-row { display: flex; gap: 8px; align-items: center; }
.cc-up-row .cc-input { flex: 1; min-width: 0; }
.cc-up-file-name { color: var(--muted); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-up-import textarea { min-height: 180px; font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; }
.cc-up-preview { border: 1px solid var(--line); border-radius: var(--radius); padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; font-size: 13px; }
.cc-up-preview .muted { color: var(--muted); }
.cc-up-preview .title { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.cc-up-preview .title strong { font-size: 15px; }
.cc-up-preview ul { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
.cc-up-preview .grant { font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; margin-right: 6px; }
.cc-up-preview .error { color: var(--danger); }
.cc-up-preview .warning { color: var(--muted); font-size: 12px; }
`;
