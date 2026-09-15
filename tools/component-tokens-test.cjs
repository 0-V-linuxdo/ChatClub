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
  "--focus-ring": "var(--primary)",
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
  "--settings-site-mark": "calc(var(--target-min) + var(--space-1))",
  "--settings-image-strategy-track": "120px",
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
assert.match(rootBlock, /--summary-panel-border:\s*var\(--line-strong\);/);
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
  /\.modal\.modal-alertdialog:not\(\[data-overlay-tone="neutral"\]\) \.modal-footer \.button-danger \{[^}]*background:\s*var\(--danger\);[^}]*color:\s*var\(--on-primary\);/s
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
assert.match(css, /:root\[data-theme="dark"\] \{[\s\S]*?--danger-hover:\s*color-mix\(in srgb, var\(--danger\) 88%, black\);/);
assert.match(css, /:root\[data-theme="dark"\] \{[\s\S]*?--danger-active:\s*color-mix\(in srgb, var\(--danger\) 76%, black\);/);
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
  /\.shortcut-search:focus-within \{/
);
assert.doesNotMatch(css, /\.workspace-tabs-sidebar-search/, "the Tabs sidebar must not keep a dedicated search field");
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
assert.match(css, /\.shortcut-search-sizer,\s*\n\.shortcut-search-input \{[^}]*line-height:\s*var\(--ui-control-height\);/s);
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
assert.match(runtime, /setProperty\("--on-primary"/);
assert.match(runtime, /onPrimaryForPrimaryColor\(primaryColor\)/);
assert.match(runtime, /setProperty\("--primary-2"/);
assert.doesNotMatch(runtime, /setProperty\("--accent"/);
assert.doesNotMatch(runtime, /setProperty\("--on-primary", "#ffffff"/);

assert.match(agents, /## Component Tokens/);
assert.match(agents, /tools\/component-tokens-test\.cjs/);
assert.match(agents, /Do not load Inter/);
assert.match(agents, /do not reintroduce `#0a84ff`/);
assert.match(agents, /--target-min: 24px/);
assert.match(agents, /do not reintroduce 560–780 outliers/);
assert.match(agents, /--ui-compact-height/);
assert.match(agents, /--ui-chrome-height/);
assert.match(agents, /--ui-reorder-cluster/);
assert.match(agents, /--settings-site-mark/);
assert.match(agents, /--settings-image-strategy-track/);
assert.match(agents, /--font-size-display/);
assert.match(agents, /WCAG 2\.5\.7/);
assert.match(agents, /--control-selected/);
assert.match(agents, /do not invent `--control-selected-strong`/);
assert.match(agents, /Composer `\.prompt-mode-chip\[aria-pressed="true"\]` is filled `--primary`/);
assert.match(agents, /unpressed composer accessories \(mode chip, plus, clear\) rest `--text`/);
assert.match(agents, /other segmented checked stays `--control-selected`/);
assert.match(agents, /`--panel-2` is not a hover fill/);
assert.match(agents, /- Selected list rows: a fill cannot carry selection/);
assert.match(agents, /border-color: var\(--primary\)` \(4\.78:1 light \/ 5\.63:1 dark/);
assert.match(agents, /- Site-mark stacks: `\.chat-favicon-stack-item`/);
assert.match(agents, /--favicon-stack-surface/);
assert.match(agents, /--tabs-sidebar-item-surface/);
assert.match(agents, /- Scroll containers: `scrollbar-width: thin`/);
assert.match(agents, /Do not put a `padding-right: 2px` half-gutter back/);
assert.match(agents, /Horizontal lanes/);
assert.match(agents, /the App picker row is `--font-size-md`/);
assert.match(agents, /known micro-badge step/);
assert.match(agents, /calc\(var\(--ui-radius\) \* 2\)` \(16\)/);
assert.match(agents, /not declared-only/);
assert.match(agents, /heading `17px`/);
assert.match(agents, /--ui-radius-xs/);
assert.match(agents, /--ui-radius-tab/);
assert.match(agents, /--ui-radius-nested/);
assert.match(agents, /--ui-radius-pill/);
assert.match(agents, /--ui-accessory-height/);
assert.match(agents, /Send hover mixes `--on-primary`, not `#ffffff`/);
assert.match(agents, /`applyTheme\(\)` can keep setting `--primary`, `--primary-2`, and a luminance-paired `--on-primary`/);
assert.match(agents, /paper `#ffffff` vs ink `#082018`/);
assert.match(css, /:root\[data-theme="dark"\] \{[\s\S]*?--on-primary:\s*#082018;/);
assert.match(agents, /## Overlay Chrome Contract/);

assert.match(css, /\.workspace-tabs-sidebar-item:hover,[\s\S]*?background:\s*var\(--control-hover\);/);
assert.match(css, /\.workspace-tabs-sidebar-folder:hover,[\s\S]*?background:\s*var\(--control-hover\);/);
assert.match(css, /\.compact-icon:hover \{[^}]*background:\s*var\(--control-hover\);/s);
assert.match(css, /\.popover-menu \.button:hover \{[^}]*background:\s*var\(--control-hover\);/s);
assert.match(css, /\.pocket-group-button:hover,[\s\S]*?background:\s*var\(--control-hover\);/);
assert.match(css, /\.layout-preset-item:hover,[\s\S]*?background:\s*var\(--control-hover\);/);
assert.doesNotMatch(
  css,
  /:hover[^{]*\{[^}]*background:\s*var\(--panel-2\);/s,
  "--panel-2 is 1.01:1 against --panel in light theme, so it cannot stand in for --control-hover"
);

// A selected row is a WCAG 1.4.11 state indicator. --control-selected is 1.02:1
// against --control-hover in dark theme, so the fill cannot carry the state on
// its own: every selected list row edges itself with --primary (4.78:1 light /
// 5.63:1 dark against that fill) instead of diluting it into --line.
for (const selected of [
  "\\.workspace-tabs-sidebar-item\\.is-current",
  "\\.settings-tab\\.active",
  "\\.settings-inner-tab\\.active",
  "\\.workspace-tabs-search-item\\.active",
  "\\.prompt-history-sidebar-item\\.active",
  "\\.pocket-group-button\\.active",
  "\\.layout-preset-item\\.active",
  "\\.prompt-search-option\\.is-active"
]) {
  assert.match(
    css,
    new RegExp(`${selected} \\{[^}]*border-color:\\s*var\\(--primary\\);`, "s"),
    `${selected} needs its own 3:1 state edge`
  );
  assert.match(
    css,
    new RegExp(`${selected} \\{[^}]*var\\(--control-selected\\)`, "s"),
    `${selected} keeps the shared selected fill`
  );
}

// The shared stack overlaps its marks, so the ring and the plate behind a
// `contain` fit must be the colour of the row, not a fixed --bg that is 1.07:1
// against --panel and stays cold once the row paints a state fill.
assert.match(
  css,
  /\.chat-favicon-stack-item \{[^}]*background:\s*var\(--favicon-stack-surface, var\(--panel\)\);[^}]*box-shadow:\s*0 0 0 1px var\(--favicon-stack-surface, var\(--panel\)\);/s
);
assert.match(css, /\.chat-favicon-stack-more \{[^}]*box-shadow:\s*0 0 0 1px var\(--favicon-stack-surface, var\(--panel\)\);/s);
assert.doesNotMatch(css, /box-shadow:\s*0 0 0 1px var\(--bg\)/, "a stack ring painted in --bg haloes every mark on a state fill");
for (const row of [
  "\\.prompt-search-option",
  "\\.workspace-tabs-sidebar-item",
  "\\.workspace-tabs-search-item",
  "\\.prompt-history-sidebar-item",
  "\\.pocket-group-button"
]) {
  assert.match(
    css,
    new RegExp(`${row} \\{[^}]*--favicon-stack-surface:`, "s"),
    `${row} must hand its surface to the shared favicon stack`
  );
}
assert.match(
  css,
  /\.workspace-tabs-sidebar-item-actions \{[^}]*linear-gradient\(to right, transparent, var\(--tabs-sidebar-item-surface\) 14px\)/s,
  "the hover-only action cluster must fade into the row fill it is painted over"
);

// scrollbar-width: thin is still a classic scrollbar: it takes its width out of
// the content box only while overflowing, so every vertical list reserves it.
for (const scroller of [
  "\\.prompt-search-list",
  "\\.workspace-tabs-search-list",
  "\\.workspace-tabs-search-main",
  "\\.prompt-history-sidebar-list",
  "\\.prompt-history-conversation-clusters",
  "\\.pocket-sidebar-list",
  "\\.pocket-active-content",
  "\\.pocket-message-body",
  "\\.optimize-compare-textarea"
]) {
  assert.match(
    css,
    new RegExp(`${scroller} \\{[^}]*scrollbar-gutter:\\s*stable;`, "s"),
    `${scroller} needs a stable gutter so rows do not resize at the scroll threshold`
  );
}
assert.match(
  css,
  /\.summary-panel-preview,\s*\n\.summary-panel-result,\s*\n\.summary-preview-text,\s*\n\.summary-panel-input \{\s*\n\s*scrollbar-gutter:\s*stable;/,
  "the vertical Summary panes reserve the gutter; pre and the table wrap scroll horizontally and must not"
);
assert.doesNotMatch(
  css,
  /\.(workspace-tabs-search-list|prompt-history-sidebar-list|pocket-sidebar-list) \{[^}]*padding-right:\s*2px;/s,
  "the reserved gutter replaces the 2px that was standing in for the scrollbar"
);
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
assert.match(agents, /Settings-pane boolean glyphs/);
assert.match(agents, /hug copy with no island well/);
assert.match(css, /\.appearance-toggle-control input\s*\{[^}]*width:\s*19px;[^}]*height:\s*19px;/s);
assert.doesNotMatch(
  css,
  /\.appearance-toggle-control input\s*\{[^}]*min-width:\s*var\(--target-min/s,
  "appearance toggle glyph must not inherit --target-min"
);
assert.match(css, /\.model-preference-secondary-toggle input\s*\{[^}]*width:\s*19px;[^}]*height:\s*19px;/s);
assert.match(
  css,
  /\.model-preference-secondary-toggle\s*\{[^}]*width:\s*fit-content;/s,
  "secondary toggle must hug copy"
);
assert.doesNotMatch(
  css,
  /\.model-preference-secondary-toggle\s*\{[^}]*border:\s*1px solid/s,
  "secondary toggle must not keep island chrome"
);
assert.match(css, /\.settings-check input\s*\{[^}]*width:\s*19px;[^}]*height:\s*19px;/s);
assert.match(css, /\.tooltip-toggle-switch input\s*\{[^}]*width:\s*19px;[^}]*height:\s*19px;/s);
assert.doesNotMatch(
  css,
  /\.tooltip-toggle-switch input\s*\{[^}]*width:\s*18px;/s,
  "tooltip switch glyph must match the 19px settings-pane token"
);
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

assert.match(
  css,
  /^\s*--focus-ring:\s*var\(--primary\);/m,
  "a focus indicator owes 3:1, so --focus-ring cannot be a transparent wash of --primary"
);
assert.doesNotMatch(
  css,
  /--focus-ring:\s*color-mix\(/,
  "the --primary 54% mix composited to 2.24:1 against --panel in light theme"
);
assert.equal(
  (css.match(/--focus-ring:\s*var\(--primary\);/g) || []).length,
  3,
  "light, [data-theme=dark] and the prefers-color-scheme block all declare the token"
);
assert.doesNotMatch(
  css,
  /outline:\s*2px solid color-mix\(in srgb, var\(--primary\) 50%, transparent\)/,
  "no call site keeps a private focus-ring mix"
);
for (const [selector, label] of [
  ["\\.composer-center-mark:focus-visible", "composer center mark"],
  ["\\.prompt-send-button:focus-visible", "send"],
  ["\\.prompt-search-option:focus-visible", "composer search row"],
  ["\\.toast-action:focus-visible", "toast action"]
]) {
  assert.match(
    css,
    new RegExp(`${selector} \\{[^}]*outline:\\s*2px solid var\\(--focus-ring\\);[^}]*outline-offset:\\s*2px;`, "s"),
    `${label} keeps the ring plus the 2px offset that makes the container its neighbour`
  );
}
assert.match(
  css,
  /\.prompt-shell:not\(\.prompt-shell-search\) \.prompt-input-row:focus-within \{[^}]*border-color:\s*var\(--primary\);/s,
  "the focused composer edge is a state indicator, not resting chrome"
);
assert.match(css, /^\s*--muted:\s*#63716c;/m, "light --muted must clear 4.5:1 on --control-hover and --control-selected");
assert.doesNotMatch(css, /--muted:\s*#66746f/, "#66746f only reached 4.34:1 on --control-hover");
assert.match(
  css,
  /\.prompt-search-list \{[\s\S]*?scrollbar-color:\s*var\(--muted\) transparent;/,
  "the only painted scrollbar thumb owes 3:1 like any other control"
);
assert.match(css, /\.prompt-search-list::-webkit-scrollbar-thumb \{[^}]*background:\s*var\(--muted\);/s);
assert.match(css, /\.prompt-search-list::-webkit-scrollbar-thumb:hover \{[^}]*background:\s*var\(--text\);/s);
assert.doesNotMatch(css, /color-mix\(in srgb, var\(--muted\) 55%, transparent\)/, "the 55% wash measured 2.15:1 on --panel");
for (const [token, value] of [
  ["--composer-z-shell", "30"],
  ["--composer-z-input", "31"],
  ["--composer-z-preview", "45"],
  ["--composer-z-input-raised", "60"],
  ["--composer-z-accessory", "70"]
]) {
  assert.match(css, new RegExp(`${token}:\\s*${value};`), `${token} names a composer rung that used to be a bare literal`);
}
assert.match(css, /\.prompt-shell \{[^}]*z-index:\s*var\(--composer-z-shell\);/s);
assert.match(css, /\.prompt-input \{[^}]*z-index:\s*var\(--composer-z-input\);/s);
assert.match(css, /\.prompt-input-expanded \{[^}]*z-index:\s*var\(--composer-z-input-raised\);/s);
assert.match(css, /\.prompt-send-button \{[^}]*z-index:\s*var\(--composer-z-accessory\);/s);
assert.doesNotMatch(
  css,
  /^\s*z-index:\s*(?:30|31|45|60|70);/m,
  "composer rungs must not reuse --workspace-z-topbar-edit (30) or --overlay-z-panel (70) as literals"
);
for (const token of ["--image-scrim", "--image-scrim-opaque", "--image-scrim-ink", "--image-scrim-edge", "--image-scrim-edge-strong"]) {
  assert.match(css, new RegExp(`${token}:`), `${token} names the chrome that paints on user image content`);
}
assert.match(
  css,
  /\.prompt-image-remove\.compact-icon \{[^}]*color:\s*var\(--image-scrim-ink\);[^}]*background:\s*var\(--image-scrim\);/s,
  "the image-remove skin consumes the scrim tokens, not --on-primary over a literal plate"
);
assert.doesNotMatch(css, /\.prompt-image-remove-visible/, "the always-on !important twin of that skin must stay deleted");
assert.doesNotMatch(css, /background:\s*rgba\(12, 18, 19, 0\.82\)/, "the scrim literal lives in the token, not at the call site");
const darkRootStart = css.indexOf(':root[data-theme="dark"]');
const darkRootBlock = css.slice(darkRootStart, css.indexOf("\n}", darkRootStart));
assert.ok(!darkRootBlock.includes("--image-scrim"), "the scrim is theme-independent: its neighbour is the picture, not a theme surface");
const reducedMotionBlocks = css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g) || [];
const displacementBlock = reducedMotionBlocks.find((block) => block.includes(".tab-close.compact-icon:active"));
assert.ok(displacementBlock, "interaction displacement must have a reduced-motion peer");
for (const selector of [
  ".topbar-palette-item:active",
  ".topbar-edit-action:active:not(:disabled)",
  ".prompt-send-button:active",
  ".prompt-actions-button:active",
  ".prompt-clear-button:active",
  ".prompt-image-remove:hover",
  ".tab-close.compact-icon:active",
  ".chat-card.tab-group-buttons-hidden .chat-actions",
  ".pocket-group-button:has(.chat-favicon-stack) .pocket-group-meta",
  ".prompt-history-sidebar-item:has(.chat-favicon-stack) .prompt-history-sidebar-meta"
]) {
  assert.ok(displacementBlock.includes(selector), `${selector} displaces on interaction and must neutralise transform`);
}
assert.ok(
  css.lastIndexOf(displacementBlock) > css.lastIndexOf(".tab-close.compact-icon:active {"),
  "the block sits after the rules it neutralises so it wins on order without !important"
);
function atRuleBlocks(source, head) {
  const blocks = [];
  let from = source.indexOf(head);
  while (from !== -1) {
    let depth = 0;
    for (let i = source.indexOf("{", from); i < source.length; i += 1) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") {
        depth -= 1;
        if (!depth) {
          blocks.push(source.slice(from, i + 1));
          break;
        }
      }
    }
    from = source.indexOf(head, from + head.length);
  }
  return blocks;
}
const forcedColorsBlocks = atRuleBlocks(css, "@media (forced-colors: active) {");
const forcedStateBlock = forcedColorsBlocks.find((block) => /HighlightText/.test(block));
assert.ok(forcedStateBlock, "forced colours drops tinted fills, so states must restate themselves");
for (const selector of [
  ".workspace-tabs-sidebar-item.is-current",
  ".workspace-tabs-search-item.is-active",
  ".prompt-history-sidebar-item.is-active",
  ".pocket-group-button.is-active",
  ".prompt-search-option.is-active",
  ".layout-preset-item.active",
  ".settings-tab.active",
  ".settings-inner-tab.active"
]) {
  assert.ok(forcedStateBlock.includes(selector), `${selector} needs a forced-colors selected state`);
}
assert.match(forcedStateBlock, /background:\s*Highlight;[^}]*color:\s*HighlightText;/s);
assert.match(forcedStateBlock, /\.prompt-search-list \{[^}]*scrollbar-color:\s*ButtonText Canvas;/s);
assert.match(css, /@media \(forced-colors: active\) \{[\s\S]*?\.workspace-tabs-search-mark \{[^}]*background:\s*Mark;/);
assert.doesNotMatch(css, /\.prompt-search-option-apps/, "the composer search app line is dead since rows paint site marks");
assert.doesNotMatch(css, /\.prompt-history-conversation-favicons/, "History conversation cards never render a favicon stack");

assert.match(agents, /`--focus-ring` is the full `--primary`, not a transparent wash/);
assert.match(agents, /--composer-z-shell/);
assert.match(agents, /light `--muted` is `#63716c`/);
assert.match(agents, /--image-scrim-ink/);
assert.match(agents, /Interaction displacement honours `prefers-reduced-motion`/);
assert.match(agents, /Forced colours drops author backgrounds/);

const { pathToFileURL } = require("node:url");
const html = read("chatClub.html");
const optionsHtml = read("options.html");
assert.match(html, /styles\/chatclub\.css\?chatclub-runtime=/);
assert.match(optionsHtml, /styles\/chatclub\.css\?chatclub-runtime=/);

(async () => {
  const { onPrimaryForPrimaryColor } = await import(pathToFileURL(path.join(root, "shared/storage-schema.js")).href);
  const { DEFAULT_OPTIONS } = await import(pathToFileURL(path.join(root, "shared/constants.js")).href);
  assert.equal(DEFAULT_OPTIONS.primaryColor, "#1f7a5f");
  assert.equal(onPrimaryForPrimaryColor("#1f7a5f"), "#ffffff");
  assert.equal(onPrimaryForPrimaryColor(DEFAULT_OPTIONS.primaryColor), "#ffffff");
  assert.equal(onPrimaryForPrimaryColor("#40b889"), "#082018");
  assert.equal(onPrimaryForPrimaryColor("not-a-color"), "#ffffff");
  console.log("component tokens: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
