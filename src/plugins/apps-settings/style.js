// Styles for the apps settings section and its editors.

export default String.raw`
.cc-apps-wide .cc-field-control > .cc-input, .cc-apps-wide .cc-field-control > div > .cc-input { width: 100%; }
.cc-apps-name { display: flex; align-items: center; gap: 10px; min-width: 0; }
.cc-apps-name img, .cc-apps-name .fallback { width: 20px; height: 20px; border-radius: 4px; flex: none; }
.cc-apps-url { color: var(--primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
.cc-apps-strategy { display: inline-flex; color: var(--muted); }
.cc-apps-switches { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
.cc-apps-detail { display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 10px 16px; font-size: 13px; }
.cc-apps-detail dt { color: var(--muted); }
.cc-apps-detail dd { margin: 0; font-family: var(--font-mono); word-break: break-all; }
.cc-apps-hint { color: var(--muted); font-size: 12px; margin-top: 6px; min-height: 16px; }
.cc-apps-icon-preview { width: 64px; height: 64px; border: 1px solid var(--line); border-radius: 8px; display: grid; place-items: center; background: var(--panel-2); }
.cc-apps-icon-preview img, .cc-apps-icon-preview .fallback { width: 40px; height: 40px; }
.cc-apps-row { display: flex; gap: 8px; align-items: center; }
.cc-apps-checks { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 6px 14px; margin-top: 8px; }
.cc-apps-checks label { display: flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 12.5px; }
.cc-apps-preview { font-family: var(--font-mono); font-size: 12px; background: var(--panel-2); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; white-space: pre-wrap; word-break: break-all; }
.cc-apps-msg { font-size: 12.5px; margin: 4px 0; }
.cc-apps-msg.error { color: var(--danger); }
.cc-apps-msg.warning { color: var(--warning); }
.cc-apps-notice { color: var(--muted); font-size: var(--fs-small); margin: 0 0 12px; }
`;
