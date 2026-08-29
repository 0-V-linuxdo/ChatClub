#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const css = read("styles/chatclub.css");
const agents = read("AGENTS.md");
const officialRules = read("app/settings/official-rules-styles.js");
const favicon = read("app/favicon/service.js");
const runtime = read("app/runtime.js");

const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf(":root[data-theme=\"dark\"]"));
assert.ok(rootBlock.includes(":root {"), "component tokens must live on :root");

const tokens = {
  "--accent": "var(--primary)",
  "--soft": "var(--primary-2)",
  "--link": "var(--primary)",
  "--info": "var(--primary)",
  "--drop-indicator": "var(--primary)",
  "--focus-ring": "color-mix(in srgb, var(--primary) 54%, transparent)",
  "--topbar-height": "51px",
  "--space-1": "4px",
  "--space-2": "8px",
  "--space-3": "12px",
  "--space-4": "16px",
  "--font-size": "13px",
  "--font-size-sm": "12px",
  "--font-size-xs": "11px",
  "--font-size-md": "15px",
  "--font-size-display": "18px",
  "--workspace-z-sidebar": "15",
  "--workspace-z-topbar": "20",
  "--workspace-z-topbar-edit": "30",
  "--workspace-z-topbar-controls": "101",
  "--font-weight-normal": "500",
  "--font-weight-medium": "600",
  "--font-weight-semibold": "650",
  "--font-weight-bold": "760",
  "--font-weight-heavy": "800",
  "--disabled-opacity": "0.48",
  "--target-min": "24px",
  "--control-hover": "var(--hover)",
  "--control-pressed": "color-mix(in srgb, var(--primary) 16%, var(--panel))",
  "--control-selected": "color-mix(in srgb, var(--primary-2) 76%, var(--panel))",
  "--ui-compact-height": "var(--settings-action-size)",
  "--ui-chrome-height": "34px",
  "--ui-reorder-cluster": "calc(var(--settings-control-height) + (var(--target-min) * 2) + 8px)",
  "--ui-radius-xs": "4px",
  "--ui-radius-tab": "5px",
  "--ui-radius-nested": "6px",
  "--ui-radius-pill": "999px",
  "--ui-accessory-height": "28px",
  "--toast-text": "var(--text)",
  "--danger-hover": "color-mix(in srgb, var(--danger) 78%, black)",
  "--danger-active": "color-mix(in srgb, var(--danger) 64%, black)"
};

for (const [name, value] of Object.entries(tokens)) {
  assert.match(
    rootBlock,
    new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")};`),
    `component token ${name} must stay ${value}`
  );
}

assert.match(rootBlock, /--on-primary:\s*#ffffff;/);
assert.match(rootBlock, /--success:\s*#15803d;/);
assert.match(rootBlock, /--warning:\s*#a16207;/);
assert.match(rootBlock, /--warning-fill:\s*#ca8a04;/);
assert.match(rootBlock, /--danger-soft:\s*#ff8f83;/);
assert.match(rootBlock, /--font-family:\s*ui-sans-serif, system-ui,/);
assert.match(rootBlock, /--summary-panel-border:\s*var\(--overlay-border-color\);/);
assert.match(rootBlock, /--overlay-z-panel:\s*70;/);
assert.match(rootBlock, /--overlay-z-tooltip:\s*2147483000;/);

assert.doesNotMatch(css, /#0a84ff/i, "insert carets must not use Apple blue");
assert.doesNotMatch(css, /\bInter\b/, "page chrome must not declare Inter");
assert.doesNotMatch(favicon, /\bInter\b/, "favicon fallback glyphs must not declare Inter");
assert.doesNotMatch(
  officialRules,
  /#15803d|#16a34a|#a16207|#ca8a04|#b91c1c|#dc2626|#0a84ff/,
  "official-rules settings CSS must consume semantic tokens"
);
assert.match(officialRules, /var\(--success\)/);
assert.match(officialRules, /var\(--warning\)/);
assert.match(officialRules, /var\(--warning-fill\)/);
assert.match(officialRules, /var\(--danger\)/);
assert.match(officialRules, /var\(--on-primary\)/);

assert.match(css, /\.topbar \{[^}]*height:\s*var\(--topbar-height\);/s);
assert.match(css, /\.app-shell \{[^}]*grid-template-rows:\s*var\(--topbar-height\) minmax\(0, 1fr\);/s);
assert.match(css, /\.workspace-tabs-sidebar \{[^}]*z-index:\s*var\(--workspace-z-sidebar\);/s);
assert.match(
  css,
  /\.workspace-tabs-sidebar-count \{[^}]*min-width:\s*24px;[^}]*height:\s*24px;[^}]*color:\s*var\(--on-primary\);/s
);
assert.match(css, /\.button-primary \{[^}]*color:\s*var\(--on-primary\);/s);
assert.match(
  css,
  /\.modal\.modal-alertdialog \.modal-footer \.button-danger \{[^}]*background:\s*var\(--danger\);[^}]*color:\s*var\(--on-primary\);/s
);
assert.match(
  css,
  /\.button-danger:hover:not\(:disabled\),[\s\S]*?border-color:\s*color-mix\(in srgb, var\(--danger\) 42%, var\(--line\)\);/
);
assert.match(css, /\.button:focus-visible,/);
assert.match(css, /outline:\s*2px solid var\(--focus-ring\);/);
assert.match(
  css,
  /\.tooltip-trigger::before,\s*\n\.tooltip-trigger::after \{\s*\n\s*display:\s*none !important;/
);
assert.match(css, /\.layout-preset-item \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto 24px;/s);
assert.match(css, /\.layout-preset-delete\.compact-icon \{[^}]*width:\s*24px;/s);
assert.match(css, /\.share-option-group \{[^}]*gap:\s*var\(--space-2\);/);
assert.match(css, /\.pocket-empty \.svg-icon \{[^}]*color:\s*var\(--primary\);/s);
assert.match(css, /body \{[^}]*font-family:\s*var\(--font-family\);[^}]*font-size:\s*var\(--font-size\);/s);

assert.doesNotMatch(css, /border-radius:\s*7px/, "controls must consume --ui-radius");
assert.doesNotMatch(css, /border-radius:\s*8px/, "page chrome must not write literal 8px radii");
assert.doesNotMatch(css, /border-radius:\s*10px/, "chips and overlay surfaces must not keep a 10px radius dialect");
assert.doesNotMatch(css, /var\(--tooltip-bg,\s*#4a4a4a\)/, "tooltip tokens must not fall back to hex");
assert.match(
  css,
  /\.workspace-tabs-sidebar-search:focus-within,\s*\n\.shortcut-search:focus-within \{/
);
assert.match(css, /scroll-margin-top:\s*calc\(var\(--topbar-height\) \+ var\(--space-2\)\)/);
assert.match(css, /\.ui-row-action \.svg-icon \{[^}]*width:\s*16px;/s);
assert.match(css, /\n\.share-panel-empty \{\s*\n\s*padding:\s*18px;[^}]*border:\s*1px dashed var\(--line\);/s);
assert.match(css, /\.settings-empty-row \{[^}]*border:\s*1px dashed var\(--line\);/s);
assert.match(css, /\.settings-tab\.active \{[^}]*background:\s*var\(--control-selected\);/s);
assert.match(css, /\.settings-tab:hover \{[^}]*background:\s*var\(--control-hover\);/s);
assert.match(css, /\.ui-list-row:hover,\s*\n\.settings-list-row:hover \{[^}]*background:\s*var\(--control-hover\);/s);
assert.match(css, /\.settings-inner-tab:hover \{[^}]*background:\s*var\(--control-hover\);/s);
assert.match(css, /\.summary-panel-header \{[^}]*min-height:\s*var\(--ui-chrome-height\);/s);
assert.match(css, /\.share-panel-header \{[^}]*min-height:\s*var\(--ui-chrome-height\);/s);
assert.match(css, /\.model-preference-row \{[^}]*grid-template-columns:\s*var\(--ui-reorder-cluster\)/s);
assert.doesNotMatch(css, /font-size:\s*18px/, "display titles must consume --font-size-display");
assert.match(css, /\.workspace-tabs-sidebar-search \.workspace-tabs-sidebar-search-input,\s*\n\.workspace-tabs-sidebar-search-input \{[^}]*line-height:\s*var\(--ui-control-height\);/s);
assert.match(css, /\.tooltip-preview-brand-logo \{[^}]*border-radius:\s*var\(--ui-radius\);/s);
assert.doesNotMatch(css, /font-size:\s*17px/, "headings must consume the type scale");
assert.match(officialRules, /\.official-rules-tab:hover \{[^}]*background:\s*var\(--control-hover\);/s);
assert.match(css, /\.popover-menu \.button \{[^}]*min-height:\s*var\(--ui-compact-height\);/s);
assert.match(officialRules, /border-radius:\s*calc\(var\(--ui-radius\) \+ 2px\)/);
assert.match(officialRules, /background:\s*var\(--control-selected\)/);
assert.match(officialRules, /\n\.official-rules-empty \{\s*\n\s*text-align:\s*center;\s*\n\s*border-style:\s*dashed;/);
assert.doesNotMatch(css, /#ef4444/i, "share error color must not fall back to Tailwind red");
assert.doesNotMatch(css, /font-weight:\s*(560|580|720|740|750|780)\b/, "outlier font-weights must collapse onto the type scale");
assert.doesNotMatch(officialRules, /var\(--border\)/, "official-rules CSS must not use undeclared --border");
assert.match(css, /\.tab-close \{[^}]*width:\s*var\(--target-min\);/s);
assert.match(css, /\.prompt-image-remove \{[^}]*width:\s*var\(--target-min\);/s);
assert.match(css, /\.input, \.textarea, \.select \{[^}]*border-radius:\s*var\(--ui-radius\);/s);
assert.match(css, /\.ui-list,\s*\n\.settings-list \{/);
assert.match(css, /\.pocket-empty \{[^}]*border-radius:\s*var\(--ui-radius\);/s);
assert.match(officialRules, /outline:\s*2px solid var\(--focus-ring\);/);
assert.match(officialRules, /border-radius:\s*var\(--ui-radius\)/);

assert.match(runtime, /setProperty\("--primary"/);
assert.match(runtime, /setProperty\("--primary-2"/);
assert.doesNotMatch(runtime, /setProperty\("--accent"/);

assert.match(agents, /## Component Tokens/);
assert.match(agents, /tools\/component-tokens-test\.cjs/);
assert.match(agents, /Do not load Inter/);
assert.match(agents, /do not reintroduce `#0a84ff`/);
assert.match(agents, /--target-min: 24px/);
assert.match(agents, /do not reintroduce 560–780 outliers/);
assert.match(agents, /--ui-compact-height/);
assert.match(agents, /--ui-chrome-height/);
assert.match(agents, /--ui-reorder-cluster/);
assert.match(agents, /--font-size-display/);
assert.match(agents, /WCAG 2\.5\.7/);
assert.match(agents, /--control-selected/);
assert.match(agents, /not declared-only/);
assert.match(agents, /heading `17px`/);
assert.match(agents, /--ui-radius-xs/);
assert.match(agents, /--ui-radius-tab/);
assert.match(agents, /--ui-radius-nested/);
assert.match(agents, /--ui-radius-pill/);
assert.match(agents, /--ui-accessory-height/);
assert.match(agents, /Send hover mixes `--on-primary`, not `#ffffff`/);
assert.match(agents, /## Overlay Chrome Contract/);

assert.match(css, /\.workspace-tabs-sidebar-item:hover,[\s\S]*?background:\s*var\(--control-hover\);/);
assert.match(css, /\.workspace-tabs-sidebar-folder:hover,[\s\S]*?background:\s*var\(--control-hover\);/);
assert.match(css, /\.compact-icon:hover \{[^}]*background:\s*var\(--control-hover\);/s);
assert.match(css, /\.popover-menu \.button:hover \{[^}]*background:\s*var\(--control-hover\);/s);
assert.match(css, /\.pocket-group-button:hover,[\s\S]*?background:\s*var\(--control-hover\);/);
assert.match(
  css,
  /\.prompt-send-button:hover \{[^}]*var\(--on-primary\)[^}]*var\(--on-primary\)[^}]*var\(--on-primary\)/s
);
assert.doesNotMatch(
  css,
  /\.prompt-send-button:hover \{[^}]*#ffffff/s,
  "send hover must mix --on-primary instead of #ffffff"
);
assert.match(
  css,
  /\.workspace-tabs-sidebar-item-delete:hover,[\s\S]*?background:\s*color-mix\(in srgb, var\(--danger\) 13%, transparent\);/
);
assert.match(css, /\.tab:focus-visible,/);
assert.match(css, /\.settings-tab:focus-visible,/);
assert.match(css, /\.settings-inner-tab:focus-visible,/);
assert.match(css, /\.workspace-tabs-sidebar-folder-toggle:focus-visible,/);
assert.match(css, /\.prompt-history-sidebar-item:focus-visible,/);
assert.match(css, /\.pocket-group-button:focus-visible,/);
assert.match(css, /\.share-option:focus-visible \{/);
assert.doesNotMatch(css, /border-radius:\s*4px/, "favicons must consume --ui-radius-xs");
assert.doesNotMatch(css, /border-radius:\s*5px/, "tab corners must consume --ui-radius-tab");
assert.doesNotMatch(css, /border-radius:\s*6px/, "nested chrome must consume --ui-radius-nested");
assert.match(css, /\.tab \{[^}]*border-radius:\s*var\(--ui-radius-tab\) var\(--ui-radius-tab\) 0 0;/s);
assert.match(css, /\.tab-favicon \{[^}]*border-radius:\s*var\(--ui-radius-xs\);/s);
assert.match(css, /\.popover-menu \.button \{[^}]*border-radius:\s*var\(--ui-radius-nested\);/s);
assert.doesNotMatch(css, /(?<!-)font-size:\s*15px/, "15px titles must consume --font-size-md");
assert.match(css, /\.settings-block-header h4 \{[^}]*font-size:\s*var\(--font-size-md\);/s);
assert.match(css, /\.settings-check \{[^}]*min-height:\s*var\(--target-min\);/s);
assert.match(css, /\.overlay-confirm-ack-box \{[^}]*min-height:\s*var\(--target-min\);/s);
assert.match(css, /\.tooltip-toggle-switch \{[^}]*min-height:\s*var\(--target-min\);/s);
assert.match(officialRules, /\.official-rules-mode button\[aria-pressed="true"\] \{[^}]*background:\s*var\(--control-selected\);/s);
assert.match(officialRules, /\.official-rules-site-summary:hover \{[^}]*background:\s*var\(--control-hover\);/s);

assert.doesNotMatch(css, /border-radius:\s*999px/, "pills must consume --ui-radius-pill");
assert.doesNotMatch(officialRules, /border-radius:\s*999px/, "official-rules pills must consume --ui-radius-pill");
assert.doesNotMatch(css, /(?<!-)font-size:\s*11px/, "11px must consume --font-size-xs");
assert.doesNotMatch(css, /(?<!-)font-size:\s*12px/, "12px must consume --font-size-sm");
assert.doesNotMatch(css, /(?<!-)font-size:\s*13px/, "13px must consume --font-size");
assert.doesNotMatch(officialRules, /(?<!-)font-size:\s*11px/);
assert.doesNotMatch(officialRules, /(?<!-)font-size:\s*12px/);
assert.doesNotMatch(officialRules, /(?<!-)font-size:\s*13px/);
assert.match(css, /\.workspace-tabs-sidebar-count \{[^}]*border-radius:\s*var\(--ui-radius-pill\);/s);
assert.match(css, /\.prompt-actions-button \{[^}]*width:\s*var\(--ui-accessory-height\);/s);
assert.match(officialRules, /border-radius:\s*var\(--ui-radius-pill\)/);
assert.doesNotMatch(css, /^\s*(?:min-|max-)?(?:width|height):\s*28px/m, "28px accessories must consume --ui-accessory-height");
assert.match(css, /\.workspace-tabs-sidebar-count \{[^}]*padding:\s*0 var\(--space-2\);/s);
assert.match(officialRules, /\.official-rules-status \{[^}]*min-height:\s*var\(--ui-accessory-height\);/s);

console.log("component tokens: ok");
