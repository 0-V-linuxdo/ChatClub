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
  "--workspace-z-sidebar": "15",
  "--workspace-z-topbar": "20",
  "--workspace-z-topbar-edit": "30",
  "--workspace-z-topbar-controls": "101"
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
assert.match(css, /\.button:focus-visible,/);
assert.match(css, /outline:\s*2px solid var\(--focus-ring\);/);
assert.match(
  css,
  /\.tooltip-trigger::before,\s*\n\.tooltip-trigger::after \{\s*\n\s*display:\s*none !important;/
);
assert.match(css, /\.layout-preset-item \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 24px;/s);
assert.match(css, /\.layout-preset-delete\.compact-icon \{[^}]*width:\s*24px;/s);
assert.match(css, /\.share-option-group \{[^}]*gap:\s*var\(--space-2\);/);
assert.match(css, /\.pocket-empty \.svg-icon \{[^}]*color:\s*var\(--primary\);/s);
assert.match(css, /body \{[^}]*font-family:\s*var\(--font-family\);[^}]*font-size:\s*var\(--font-size\);/s);

assert.match(runtime, /setProperty\("--primary"/);
assert.match(runtime, /setProperty\("--primary-2"/);
assert.doesNotMatch(runtime, /setProperty\("--accent"/);

assert.match(agents, /## Component Tokens/);
assert.match(agents, /tools\/component-tokens-test\.cjs/);
assert.match(agents, /Do not load Inter/);
assert.match(agents, /do not reintroduce `#0a84ff`/);
assert.match(agents, /## Overlay Chrome Contract/);

console.log("component tokens: ok");
