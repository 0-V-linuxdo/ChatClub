#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

const { functionSource } = require("./function-source.cjs");
const panelSource = read("app/composer/search-panel.js");
const composer = read("app/composer/controller.js");
const runtime = read("app/runtime.js");
const css = read("styles/chatclub.css");
const agents = read("AGENTS.md");
const i18n = read("shared/i18n.js");

assert.doesNotMatch(panelSource, /from "\.\.\/workspace\//, "composer search must not import workspace-domain modules");
assert.doesNotMatch(panelSource, /viewerModal|editorModal|confirmationModal|taskModal/);
assert.doesNotMatch(panelSource, /class: ["'`]modal/);
assert.doesNotMatch(panelSource, /transform:/);
assert.match(panelSource, /overlay-surface/);
assert.match(panelSource, /prompt-shell-search/);
assert.match(panelSource, /setAttribute\("role", "combobox"\)/);
assert.match(panelSource, /role: "listbox"/);
assert.match(panelSource, /event\.key === "Escape"/);
assert.match(panelSource, /event\.key === "Enter"/);
assert.match(composer, /searchPanel\.handleInput/);
assert.match(composer, /searchPanel\.handleKeydown/);
assert.match(composer, /searchPanel\.handleTab/);
assert.match(composer, /searchPanel\.exit\(\{ restoreField: true \}\)/);
assert.match(runtime, /composerController\.enterSearchMode\(\)/);
assert.match(runtime, /listComposerSearchRecords/);
assert.match(css, /\.prompt-search-results \{[\s\S]*?overlay-surface|z-index:\s*var\(--overlay-z-popover\)/);
assert.match(css, /\.prompt-send-button \{[\s\S]*?border-radius:\s*var\(--ui-radius\)/);
assert.doesNotMatch(css, /\.prompt-send-button \{[^}]*border-radius:\s*var\(--ui-radius-pill\)/, "send is a rounded square, not a pill");
assert.match(css, /\.prompt-input-row\s*\{[\s\S]*?height:\s*var\(--prompt-collapsed-height\);/);
assert.match(css, /--prompt-collapsed-height:\s*40px;/);
assert.match(css, /\.topbar \.composer:not\(\.composer-center-slot\)\s*\{[\s\S]*?--prompt-collapsed-height:\s*38px/);
assert.match(css, /--prompt-shell-radius:\s*calc\(var\(--ui-radius\) \+ var\(--space-1\)\)/);
assert.match(css, /--prompt-search-radius:\s*var\(--prompt-shell-radius\)/);
assert.match(css, /\.prompt-input-row\s*\{[\s\S]*?display:\s*grid/);
assert.match(composer, /prompt-pin-button/);
// Search keeps the dock/float toggle reachable so a floating search panel can be docked
// without leaving search; only plus and send are hidden there.
assert.doesNotMatch(css, /\.prompt-shell-search \.prompt-pin-button/);
assert.match(css, /\.prompt-shell:not\(\.prompt-shell-search\) \.prompt-input-row\s*\{[\s\S]*?background:\s*var\(--panel\)/);
assert.match(css, /\.prompt-shell:not\(\.prompt-shell-search\) \.prompt-input-row\s*\{[\s\S]*?border-radius:\s*var\(--prompt-shell-radius\)/);
assert.doesNotMatch(css, /\.prompt-shell:not\(\.prompt-shell-search\) \.prompt-input-row\s*\{[^}]*border-radius:\s*var\(--ui-radius-pill\)/, "compose row is a rounded rectangle, not a pill");
assert.match(css, /\.prompt-shell:not\(\.prompt-shell-search\) \.prompt-input-row:focus-within\s*\{[\s\S]*?border-color:\s*var\(--line-strong\)/);
assert.match(css, /\.composer-center-host \.prompt-shell:not\(\.prompt-shell-search\) \.prompt-input-row\s*\{[\s\S]*?box-shadow:\s*var\(--overlay-shadow\)/);
assert.match(css, /\.prompt-shell:not\(\.prompt-shell-search\):not\(\.prompt-shell-expanded\) \.prompt-input-row\s*\{[\s\S]*?max-height:\s*var\(--prompt-collapsed-height\)/);
assert.match(css, /\.prompt-shell-expanded:not\(\.prompt-shell-search\) \.prompt-input-row\s*\{[\s\S]*?background:\s*var\(--panel\)/);
assert.match(css, /\.prompt-shell-expanded:not\(\.prompt-shell-search\) \.prompt-input-row\s*\{[\s\S]*?border-radius:\s*var\(--prompt-shell-radius\)/);
assert.match(css, /\.prompt-input-expanded\s*\{[\s\S]*?box-shadow:\s*none/);
assert.doesNotMatch(css, /\.prompt-input-expanded\s*\{[^}]*box-shadow:\s*0 12px 28px/);
assert.match(css, /\.prompt-send-button\.tooltip-trigger \{[\s\S]*?position:\s*static/);
assert.match(css, /\.textarea\.prompt-input \{[\s\S]*?min-height:\s*0 !important/);
assert.match(css, /line-height:\s*var\(--prompt-collapsed-line\)/);
assert.match(css, /:focus \+ \.prompt-collapsed-preview/);
assert.match(css, /\.prompt-mode-switch/);
assert.match(css, /\.prompt-mode-chip\[aria-pressed="true"\](?:,\s*\n\.prompt-mode-chip\[aria-pressed="true"\]:hover)?\s*\{[\s\S]*?background:\s*var\(--primary\)/);
assert.match(css, /\.prompt-mode-chip\[aria-pressed="true"\][\s\S]{0,180}color:\s*var\(--on-primary\)/);
assert.match(css, /\.prompt-mode-chip\[aria-pressed="true"\]:hover/);
assert.doesNotMatch(
  css,
  /\.prompt-mode-chip\[aria-pressed="true"\][^{]*\{[^}]*background:\s*var\(--control-selected\)/,
  "pressed search/compose chip must not use the faint --control-selected well"
);
assert.match(css, /\.prompt-mode-chip:hover\s*\{[\s\S]*?background:\s*var\(--control-hover\)/);
assert.match(css, /\.prompt-mode-chip\s*\{[\s\S]*?color:\s*var\(--text\)/);
assert.doesNotMatch(css, /\.prompt-mode-chip\s*\{[^}]*color:\s*var\(--muted\)/, "unpressed mode chip rest ink is --text, not --muted");
assert.match(css, /\.prompt-actions-button\s*\{[\s\S]*?color:\s*var\(--text\)/);
assert.match(css, /\.prompt-clear-button\s*\{[\s\S]*?color:\s*var\(--text\)/);
assert.match(css, /\.prompt-clear-button\.compact-icon,\s*\n\.prompt-actions-button\.compact-icon\s*\{[\s\S]*?color:\s*var\(--text\)/);
assert.match(css, /\.prompt-mode-chip\s*\{[\s\S]*?border-radius:\s*var\(--ui-radius-nested\)/);
assert.match(css, /\.prompt-mode-switch\s*\{[\s\S]*?background:\s*transparent/);
assert.doesNotMatch(css, /\.prompt-mode-switch\s*\{[^}]*box-shadow:\s*inset/, "mode switch is flat tabs without a track well");
assert.match(css, /\.prompt-mode-switch\s*\{[\s\S]*?position:\s*static/);
assert.doesNotMatch(css, /\.prompt-mode-chip[^{]*\{[^}]*transform:/);
assert.match(css, /\.prompt-shell-expanded:not\(\.prompt-shell-search\) \.prompt-mode-switch\s*\{[\s\S]*?display:\s*inline-flex/);
assert.doesNotMatch(css, /\.prompt-shell-expanded:not\(\.prompt-shell-search\) \.prompt-mode-switch\s*\{[^}]*display:\s*none/);
assert.doesNotMatch(css, /\.prompt-shell:not\(\.prompt-shell-expanded\):not\(\.prompt-shell-search\) \.prompt-actions-button[^{]*\{[^}]*display:\s*none/, "collapsed compose must keep the plus visible");
assert.match(css, /\.prompt-shell-search \.prompt-actions-button/);
assert.match(css, /\.prompt-actions-button\.prompt-actions-button-active,\s*\.prompt-actions-button\[aria-expanded="true"\]\s*\{/);
assert.match(agents, /prompt-actions-button` plus stays visible/);
assert.match(agents, /plus stays visible in collapsed compose/);
assert.match(agents, /must not collapse the shell/);
assert.match(agents, /prompt-actions-button-active/);
assert.match(css, /\.prompt-shell-expanded:not\(\.prompt-shell-search\) \.textarea\.prompt-input/);
assert.match(css, /\.prompt-shell-search:has\(\.prompt-search-results:not\(\[hidden\]\)\)::before\s*\{[\s\S]*?background:\s*var\(--panel\)/);
assert.match(css, /\.prompt-shell-search:has\(\.prompt-search-results:not\(\[hidden\]\)\)::before\s*\{[\s\S]*?box-shadow:\s*var\(--overlay-shadow\)/);
assert.match(css, /\.prompt-shell-search:has\(\.prompt-search-results:not\(\[hidden\]\)\) \.prompt-input-row\s*\{[\s\S]*?background:\s*transparent/);
assert.doesNotMatch(css, /\.prompt-shell-search:has\(\.prompt-search-results:not\(\[hidden\]\)\) \.prompt-input-row\s*\{[^}]*border-bottom-color/);
assert.match(css, /\.prompt-search-results \{[\s\S]*?padding:\s*0 var\(--space-1\) var\(--space-2\)/);
assert.doesNotMatch(
  css,
  /\.prompt-search-results \{[^}]*max-height:[^;]*--prompt-search-row/,
  "the row budget belongs to .prompt-search-list; a row count on the panel also has to pay for the group label and footer and leaves a blank stub row"
);
assert.match(
  css,
  /\.prompt-search-list\s*\{[\s\S]*?max-height:\s*calc\(var\(--prompt-search-row\) \* 6 \+ var\(--space-1\) \* 5\)/,
  "the result list shows six whole rows"
);
assert.match(css, /--prompt-search-row:\s*calc\(var\(--ui-control-height\) \+ var\(--space-2\)\)/);
assert.doesNotMatch(css, /--prompt-search-row:\s*calc\(var\(--ui-control-height\) \+ var\(--space-4\)\)/, "52px rows are outside the 40-48 desktop band");
assert.match(css, /\.prompt-search-option \{[\s\S]*?height:\s*var\(--prompt-search-row\)/, "one fixed row height for plain and snippet rows");
assert.match(css, /\.prompt-search-option \{[\s\S]*?--prompt-search-surface:\s*var\(--panel\)/);
assert.match(css, /\.prompt-search-option:hover\s*\{[\s\S]*?--prompt-search-surface:\s*var\(--control-hover\)[\s\S]*?border-color:\s*var\(--line\)/);
assert.match(
  css,
  /\.prompt-search-option\.is-active\s*\{[\s\S]*?--prompt-search-surface:\s*var\(--control-selected\)[\s\S]*?border-color:\s*var\(--primary\)/,
  "keyboard selection needs a 3:1 edge; --control-selected is 1.02:1 against --control-hover"
);
assert.doesNotMatch(
  css,
  /\.prompt-search-option:hover,\s*\n\.prompt-search-option\.is-active/,
  "hover and keyboard selection must not share one declaration"
);
assert.doesNotMatch(
  css,
  /\.prompt-search-option[^{]*\{[^}]*background:\s*color-mix\(in srgb, var\(--primary\) 12%, var\(--panel\)\)/,
  "12% primary is the byte-identical value --hover resolves to in dark theme"
);
assert.match(css, /\.prompt-search-option-title\s*\{[\s\S]*?font-size:\s*var\(--font-size\);/);
assert.doesNotMatch(css, /\.prompt-search-option-title\s*\{[^}]*font-size:\s*var\(--font-size-md\)/, "--font-size-md is reserved for page titles");
assert.match(css, /\.prompt-search-group\s*\{[\s\S]*?font-size:\s*var\(--font-size-xs\)/);
assert.match(css, /\.prompt-search-group\[hidden\]\s*\{[\s\S]*?display:\s*none/);
assert.match(css, /\.prompt-search-footer\s*\{[\s\S]*?margin:\s*var\(--space-2\) calc\(var\(--space-1\) \* -1\) calc\(var\(--space-2\) \* -1\)/);
assert.match(css, /\.prompt-search-footer\s*\{[\s\S]*?padding:\s*0 var\(--space-3\)/);
assert.match(css, /\.prompt-search-viewer-button\s*\{[\s\S]*?color:\s*var\(--text\)/);
assert.doesNotMatch(css, /\.prompt-search-viewer-button\s*\{[^}]*color:\s*var\(--primary\)/, "the viewer link is secondary and only reaches for --primary on hover");
assert.match(css, /\.prompt-shell-search:has\(\.prompt-search-results:not\(\[hidden\]\)\)::before\s*\{[\s\S]*?border:\s*1px solid var\(--line-strong\)/, "a backdrop-less card needs a readable edge in dark theme");
assert.match(css, /\.prompt-shell-search \.prompt-input-row\s*\{[\s\S]*?border:\s*1px solid var\(--line-strong\)/);
assert.match(css, /\.prompt-search-option-time\s*\{[\s\S]*?margin-left:\s*auto/);
assert.match(css, /\.prompt-search-option-copy\s*\{[\s\S]*?flex-direction:\s*column/);
assert.match(css, /\.prompt-search-option-snippet\s*\{[\s\S]*?color:\s*var\(--muted\)/);
assert.match(css, /\.prompt-search-option-snippet\s*\{[\s\S]*?white-space:\s*nowrap/);
assert.match(css, /\.prompt-search-option-snippet\s*\{[\s\S]*?text-overflow:\s*ellipsis/);
assert.match(css, /\.prompt-search-results \{[\s\S]*?position:\s*static/);
assert.doesNotMatch(css, /\.prompt-search-results \{[\s\S]*?border-bottom-left-radius:\s*var\(--ui-radius-pill\)/);
assert.match(css, /\.prompt-search-option \{[\s\S]*?display:\s*flex/);
assert.match(css, /\.prompt-search-option \{[\s\S]*?justify-content:\s*flex-start/);
assert.match(css, /\.prompt-search-option \{[\s\S]*?min-height:\s*var\(--prompt-search-row\)/);
assert.match(
  css,
  /\.prompt-search-option \{[\s\S]*?--favicon-stack-surface:\s*var\(--prompt-search-surface\);/,
  "the row hands its own surface to the shared favicon stack"
);
assert.doesNotMatch(
  css,
  /\.prompt-search-option-favicons \.chat-favicon-stack-item[\s\S]{0,120}box-shadow/,
  "the stack ring is owned by the shared rule through --favicon-stack-surface, not a local override"
);
assert.doesNotMatch(
  css,
  /\.prompt-search-option-favicons[^{]*\{[^}]*border-radius:\s*50%/,
  "site marks stay on the shared --ui-radius-xs stack instead of being cropped into circles"
);
assert.doesNotMatch(css, /\.prompt-search-option-favicons[^{]*\{[^}]*object-fit:\s*cover/);
assert.doesNotMatch(css, /\.prompt-search-option-favicons[^{]*\{[^}]*box-shadow:\s*0 0 0 1px var\(--bg\)/, "--bg is darker than the row and haloes every mark");
assert.match(css, /\.prompt-input:not\(\.prompt-input-expanded\):focus::placeholder/);
assert.match(
  css,
  /\.prompt-input,\s*\n\.prompt-input::placeholder \{\s*\n\s*font-size: var\(--topbar-prompt-input-font-size\);/,
  "search query and placeholder must use the same font-size as typed input"
);
assert.doesNotMatch(
  css,
  /\.prompt-input-expanded \{[^}]*font-size:/,
  "search stays unexpanded, so font-size must not live only on the expanded compose field"
);
assert.match(css, /\.prompt-send-button:disabled \{[\s\S]*?background:\s*transparent/);
assert.match(css, /\.prompt-shell\.prompt-shell-search[\s\S]{0,400}box-shadow:\s*none/);
assert.match(css, /\.prompt-shell-search \.prompt-input-row\s*\{[\s\S]*?box-shadow:\s*var\(--overlay-shadow\)/);
assert.match(css, /\.prompt-search-results \{[\s\S]*?box-shadow:\s*none/);
assert.match(css, /\.prompt-shell-search:has\(\.prompt-search-results:not\(\[hidden\]\)\) \.prompt-search-results[\s\S]{0,280}padding-top:\s*0/);
assert.match(css, /\.composer-center-host\.overlay-surface\s*\{[\s\S]*?background:\s*transparent/);
assert.match(css, /\.prompt-search-list\s*\{[\s\S]*?scrollbar-width:\s*thin/);
assert.match(css, /\.prompt-search-list::-webkit-scrollbar\s*\{[\s\S]*?width:\s*6px[\s\S]*?border:\s*0/);
assert.match(css, /\.prompt-search-list::-webkit-scrollbar-track[\s\S]*?background:\s*transparent[\s\S]*?border:\s*0/);
assert.match(css, /\.prompt-search-list::-webkit-scrollbar-thumb\s*\{[\s\S]*?border:\s*0/);
assert.match(
  css,
  /\.prompt-search-list\s*\{[\s\S]*?scrollbar-gutter:\s*stable/,
  "a styled ::-webkit-scrollbar is a classic scrollbar, so the gutter must be stable or row width jumps with the result count"
);
assert.match(css, /\.ui-empty-state\[hidden\][\s\S]{0,160}display:\s*none\s*!important/);
assert.match(css, /\.prompt-search-empty\[hidden\][\s\S]{0,80}display:\s*none\s*!important/);
assert.match(css, /\.prompt-input \{[\s\S]*?position:\s*relative;/);
assert.doesNotMatch(css, /\.prompt-input \{[^}]*position:\s*absolute;/);
assert.match(panelSource, /prompt-mode-switch/);
assert.match(panelSource, /prompt-mode-chip-compose/);
assert.match(panelSource, /prompt-mode-chip-search/);
assert.match(panelSource, /tabindex: "-1"/);
assert.match(panelSource, /function handleTab\(/);
assert.match(panelSource, /renderTime\(record, timeLabel\)/);
assert.match(panelSource, /prompt-search-option-time/);
assert.match(panelSource, /prompt-search-option-copy/);
assert.match(panelSource, /prompt-search-option-snippet/);
assert.match(panelSource, /matchKind === "body"/);
assert.match(panelSource, /workspaceSearch\.formatTime/);
assert.match(panelSource, /workspaceSearch\.copy/);
assert.match(panelSource, /workspaceSearch\.highlight/);
assert.doesNotMatch(panelSource, /function highlightQuery\(/);
assert.doesNotMatch(panelSource, /month: "short", day: "numeric"/);
assert.doesNotMatch(panelSource, /workspace\.tabs\.searchSidebar/);
assert.doesNotMatch(panelSource, /prompt-search-option-meta/);
assert.doesNotMatch(panelSource, /workspace\.tabs\.empty/);
assert.doesNotMatch(panelSource, /prompt-search-toggle/);
assert.match(runtime, /renderComposerSearchFavicons/);
assert.match(runtime, /renderFavicons: renderComposerSearchFavicons/);
assert.match(runtime, /stackClass: "prompt-search-option-favicons"/);
assert.doesNotMatch(panelSource, /createSvgIcon/, "the search panel must render chip icons through the caller's renderIcon port");
assert.doesNotMatch(panelSource, /ui\/icons\.js/);
assert.match(panelSource, /options\.renderIcon/);
assert.match(composer, /renderIcon: \(name\) => createSvgIcon\(name\)/);
assert.match(panelSource, /modeChipContent\("split", composeLabel\)/);
assert.match(panelSource, /modeChipContent\("search", searchLabel\)/);
assert.doesNotMatch(panelSource, /modeChipContent\("edit"/);
assert.match(panelSource, /"data-tooltip-id": "composer\.mode\.search"/);
assert.match(panelSource, /prompt-mode-chip prompt-mode-chip-compose tooltip-trigger/);
assert.match(panelSource, /prompt-mode-chip prompt-mode-chip-search tooltip-trigger/);
assert.match(css, /\.prompt-mode-chip\s*\{[\s\S]*?width:\s*var\(--ui-accessory-height\)/);
assert.match(css, /\.prompt-mode-chip \.svg-icon\s*\{[\s\S]*?width:\s*16px/);
assert.match(functionSource(panelSource, "searchPlaceholder"), /composer\.search\.placeholder/);
assert.doesNotMatch(functionSource(panelSource, "searchPlaceholder"), /tabToCompose/);
assert.match(runtime, /formatTime:\s*formatWorkspaceSearchTime/);
assert.match(runtime, /workspaceSearchCopy\(\{[\s\S]*voice:\s*"composer"/);
assert.match(runtime, /highlight:\s*highlightQuery/);
assert.doesNotMatch(functionSource(composer, "enterSearchMode"), /expandInput\(/);
assert.match(composer, /onRestoreField\(field\)[\s\S]*if \(document\.activeElement === field\) expandInput\(field\)/);
assert.doesNotMatch(functionSource(composer, "collapseInput"), /searchPanel\.exit/);
assert.match(composer, /onStashField\(field\)/);
assert.match(composer, /restoreSelectionSoon\(field\)/);
assert.match(functionSource(composer, "enterSearchMode"), /collapseInput\(/);
assert.match(panelSource, /options\.onStashField\?\.\(field\)/);
assert.doesNotMatch(functionSource(panelSource, "enter"), /query = ""/);
assert.doesNotMatch(functionSource(panelSource, "exit"), /query = ""/);
assert.match(functionSource(composer, "handleInputKeydown"), /searchPanel\.handleTab/);
assert.match(agents, /Search mode stays single-line in the topbar slot/);
assert.match(agents, /Inside `#composer-center-host`/);
assert.match(agents, /visible `\.prompt-mode-switch`/);
assert.match(agents, /expanded compose must not `display: none` that switch/);
assert.match(agents, /Pressed `\.prompt-mode-chip\[aria-pressed="true"\]` fills `--primary`/);
assert.match(agents, /unpressed chip, plus, and clear rest ink is `--text`/);
assert.match(agents, /do not restore `--control-selected` on that chip/);
assert.match(agents, /FIND marks \(\`\.workspace-tabs-search-mark`/);
assert.match(css, /\.workspace-tabs-search-mark\s*\{[\s\S]*?color-mix\(in srgb, var\(--primary\) 78%, var\(--panel\)\)/);
assert.match(css, /\.workspace-tabs-search-mark\s*\{[\s\S]*?color:\s*var\(--on-primary\)/);
assert.match(css, /\.workspace-tabs-search-mark\s*\{[\s\S]*?font-weight:\s*var\(--font-weight-medium\)/);
assert.doesNotMatch(css, /\.workspace-tabs-search-mark\s*\{[^}]*color:\s*inherit/);
assert.match(css, /forced-colors:\s*active[\s\S]{0,120}\.workspace-tabs-search-mark[\s\S]{0,80}background:\s*Mark/);
assert.match(agents, /Tab while `\.prompt-input` owns the caret toggles compose and search/);
assert.match(agents, /factory-on `enterSearchMode`/);
assert.match(agents, /Mac ⌥⇧F \/ Windows Alt\+Shift\+F/);
assert.match(agents, /do not add a fourth sidebar search icon/);
assert.match(agents, /composer\.search\.placeholder/);
assert.match(agents, /Leaving search while `\.prompt-input` still holds the caret must `expandInput`/);
assert.doesNotMatch(css, /\.prompt-search-results \{[^}]*transform:/);
assert.match(agents, /Do not wrap `\.prompt-shell` in `viewerModal`/);
assert.match(agents, /Topbar Search enters composer search mode/);
assert.match(agents, /card chrome lives on the input row/);
assert.match(agents, /expanded compose keeps that same row chrome/);
assert.match(agents, /one joined card/);
assert.match(agents, /no divider seam/);
assert.match(agents, /renderFavicons/);
assert.match(agents, /`scrollbar-gutter: stable`/);
assert.match(agents, /`\.prompt-search-list` alone owns the whole-row budget/);
assert.match(agents, /`\.prompt-search-group` is a caption above the scroll container/);
assert.match(agents, /One 12px rail carries the mode switch/);
assert.match(agents, /`\.prompt-search-option-title` is `--font-size`, not `--font-size-md`/);
assert.match(agents, /a fill cannot carry that state/);
assert.match(agents, /Do not restore the 22px `border-radius: 50%`/);
assert.match(agents, /its card edge is `1px solid var\(--line-strong\)`/);
assert.match(agents, /`workspace\.tabs\.today` \/ `workspace\.tabs\.yesterday` through `dateGroupId`/);
assert.match(panelSource, /prompt-search-group/);
assert.match(panelSource, /composer\.search\.recent/);
assert.match(panelSource, /composer\.search\.count/);
assert.match(i18n, /"composer\.search\.recent": "Recent"/);
assert.match(i18n, /"composer\.search\.count": "\{count\} result\{plural\}"/);
assert.match(i18n, /"composer\.search\.recent": "最近"/);
assert.match(i18n, /"composer\.search\.count": "\{count\} 个结果"/);
assert.match(agents, /prompt-search-option-time/);
assert.match(agents, /prompt-search-option-snippet/);
assert.match(agents, /matchKind: "body"/);
assert.match(agents, /markdown emphasis, code ticks, heading hashes/);
assert.match(agents, /must not paint `workspace\.tabs\.empty`/);
assert.match(agents, /`\.ui-empty-state\[hidden\]`/);
assert.match(agents, /compose draft and search query are independent buffers/);
assert.match(i18n, /"composer\.mode\.tabToSearch": "Press Tab to search chats"/);
assert.match(i18n, /"composer\.mode\.tabToCompose": "Press Tab to compose"/);
assert.match(i18n, /"composer\.mode\.tabToSearch": "按下 Tab 搜索对话"/);
assert.match(i18n, /"composer\.mode\.tabToCompose": "按下 Tab 返回发送"/);

class FakeNode {
  constructor(tagName = "div") {
    this.nodeType = tagName === "#text" ? 3 : 1;
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.style = { setProperty() {} };
    this.attributes = new Map();
    this.listeners = new Map();
    this.parentElement = null;
    this.textContent = "";
    this.value = "";
    this.hidden = false;
    this._classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this._classes.add(name)),
      contains: (name) => this._classes.has(name),
      remove: (...names) => names.forEach((name) => this._classes.delete(name)),
      toggle: (name, force) => {
        const enabled = force === undefined ? !this._classes.has(name) : Boolean(force);
        if (enabled) this._classes.add(name);
        else this._classes.delete(name);
        return enabled;
      }
    };
  }

  get className() {
    return [...this._classes].join(" ");
  }

  set className(value) {
    this._classes = new Set(String(value || "").split(/\s+/).filter(Boolean));
  }

  get isConnected() {
    return Boolean(this.parentElement);
  }

  append(...children) {
    for (const child of children) {
      if (!child) continue;
      child.parentElement = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this.append(...children);
  }

  before(node) {
    const parent = this.parentElement;
    if (!parent || !node) return;
    const index = parent.children.indexOf(this);
    node.parentElement = parent;
    parent.children.splice(Math.max(0, index), 0, node);
  }

  after(node) {
    const parent = this.parentElement;
    if (!parent || !node) return;
    const index = parent.children.indexOf(this);
    node.parentElement = parent;
    parent.children.splice(index + 1, 0, node);
  }

  setAttribute(name, value) {
    const key = String(name);
    this.attributes.set(key, String(value));
    if (key === "class") this.className = value;
    if (key === "hidden") this.hidden = true;
  }

  getAttribute(name) {
    return this.attributes.get(String(name)) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(String(name));
    if (name === "hidden") this.hidden = false;
  }

  matches(selector) {
    const value = String(selector || "").trim();
    if (value.startsWith(".")) {
      return value.slice(1).split(".").filter(Boolean).every((name) => this.classList.contains(name));
    }
    return value.toUpperCase() === this.tagName;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      for (const child of node.children || []) {
        if (child.matches(selector)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
}

function nodeText(node) {
  if (!node) return "";
  if (node.nodeType === 3) return String(node.textContent || "");
  return (node.children || []).map(nodeText).join("");
}

const previous = {
  Node: globalThis.Node,
  document: globalThis.document
};

globalThis.Node = FakeNode;
globalThis.document = {
  body: new FakeNode("body"),
  createElement: (tagName) => new FakeNode(tagName),
  createElementNS: (_ns, tagName) => new FakeNode(tagName),
  createTextNode: (value) => {
    const node = new FakeNode("#text");
    node.textContent = String(value);
    return node;
  },
  querySelector(selector) { return this.body.querySelector(selector); },
  querySelectorAll(selector) { return this.body.querySelectorAll(selector); }
};

(async () => {
  try {
    const { createComposerSearchPanel } = await import(moduleUrl("app/composer/search-panel.js"));
    const {
      collectWorkspaceSearchRecords,
      formatWorkspaceSearchTime,
      highlightQuery,
      workspaceSearchCopy
    } = await import(moduleUrl("app/workspace/tab-search.js"));
    const { setLanguage } = await import(moduleUrl("shared/i18n.js"));
    setLanguage("en");
    const records = [
      { workspaceId: "page-live1xxxxxxx", title: "Live desk", live: true, current: false, appIds: ["Grok"], viewedAt: Date.UTC(2026, 8, 10) },
      { workspaceId: "page-closed1xxxxx", title: "Closed desk", live: false, current: false, appIds: ["Claude"], updatedAt: Date.UTC(2026, 8, 9) }
    ];
    const fullTextStore = {
      "page-live1xxxxxxx": {
        workspaceId: "page-live1xxxxxxx",
        topicTitle: "Live desk",
        updatedAt: new Date(Date.UTC(2026, 8, 10)).toISOString(),
        frames: [{
          appId: "Grok",
          appName: "Grok",
          href: "https://grok.com/c/1",
          messages: [
            { role: "user", text: `${"padding ".repeat(40)}leftover-needle sits in the user turn ${"tail ".repeat(40)}` },
            { role: "assistant", text: "以下是关于**菲利普·K·迪克 (PKD) 尚未出中文版的长篇小说**的调研结果。" }
          ]
        }]
      }
    };
    const opened = [];
    const viewers = [];
    let panel;
    let fullTextEnabled = false;
    panel = createComposerSearchPanel({
      onEnter() { panel.enter(); },
      renderIcon: (name) => {
        const icon = new FakeNode("svg");
        icon.className = "svg-icon";
        icon.setAttribute("data-icon", name);
        return icon;
      },
      workspaceSearch: {
        listRecords: async (query) => collectWorkspaceSearchRecords({
          items: records,
          store: fullTextStore,
          query,
          fullTextEnabled,
          labelOf: (item) => item.title
        }),
        openRecord: async (record) => { opened.push(record.workspaceId); },
        openViewer: (opts) => { viewers.push(opts); },
        highlight: highlightQuery,
        formatTime: formatWorkspaceSearchTime,
        copy: () => workspaceSearchCopy({ fullTextEnabled, voice: "composer" }),
        renderFavicons: () => {
          const node = new FakeNode("span");
          node.className = "prompt-search-option-favicons";
          return node;
        }
      }
    });
    const shell = new FakeNode("div");
    shell.className = "prompt-shell";
    const row = new FakeNode("div");
    row.className = "prompt-input-row";
    const field = new FakeNode("textarea");
    field.className = "prompt-input";
    field.placeholder = "Message all active chats";
    const send = new FakeNode("button");
    send.className = "prompt-send-button";
    const clear = new FakeNode("button");
    clear.className = "prompt-clear-button";
    row.append(field, clear, send);
    shell.append(row);
    globalThis.document.body.append(shell);
    panel.attach(shell);
    assert.equal(panel.isActive(), false);
    const modeSwitch = shell.querySelector(".prompt-mode-switch");
    const composeChip = shell.querySelector(".prompt-mode-chip-compose");
    const searchChip = shell.querySelector(".prompt-mode-chip-search");
    assert.equal(Boolean(modeSwitch), true, "mode switch is visible at rest");
    assert.equal(Boolean(composeChip && searchChip), true, "compose and search chips are labeled controls");
    assert.equal(composeChip.getAttribute("tabindex"), "-1");
    assert.equal(searchChip.getAttribute("tabindex"), "-1");
    assert.equal(composeChip.getAttribute("data-tooltip-id"), "composer.mode.compose");
    assert.equal(searchChip.getAttribute("data-tooltip-id"), "composer.mode.search");
    assert.equal(composeChip.getAttribute("aria-label"), "Compose", "icon-only compose chip must keep its accessible name");
    assert.equal(searchChip.getAttribute("aria-label"), "Search", "icon-only search chip must keep its accessible name");
    assert.equal(composeChip.getAttribute("data-tooltip"), "Compose");
    assert.equal(searchChip.getAttribute("data-tooltip"), "Search");
    assert.equal(composeChip.querySelector(".svg-icon")?.getAttribute("data-icon"), "split", "compose chip renders the split glyph through the icon port");
    assert.equal(searchChip.querySelector(".svg-icon")?.getAttribute("data-icon"), "search", "search chip renders the search glyph through the icon port");
    assert.equal(composeChip.querySelector(".svg-icon")?.getAttribute("aria-hidden"), "true", "chip glyphs are decorative");
    assert.equal(composeChip.getAttribute("aria-pressed"), "true");
    assert.equal(searchChip.getAttribute("aria-pressed"), "false");
    assert.equal(field.placeholder, "Press Tab to search chats");
    assert.equal(field.getAttribute("aria-label"), "Message all active chats");
    const tabEvent = () => ({
      key: "Tab",
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      isComposing: false,
      keyCode: 9,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; }
    });
    const tab = tabEvent();
    assert.equal(panel.handleTab(tab), true);
    assert.equal(tab.defaultPrevented, true);
    assert.equal(panel.isActive(), true);
    assert.equal(shell.classList.contains("prompt-shell-search"), true);
    assert.equal(searchChip.getAttribute("aria-pressed"), "true");
    assert.equal(composeChip.getAttribute("aria-pressed"), "false");
    assert.equal(field.placeholder, "Search chats");
    assert.equal(field.getAttribute("aria-label"), "Search chats");
    assert.equal(shell.querySelector(".prompt-search-list")?.getAttribute("aria-label"), "Search results");
    fullTextEnabled = true;
    panel.syncField();
    assert.equal(field.placeholder, "Search chats or full text");
    assert.equal(field.getAttribute("aria-label"), "Search chats or full text");
    fullTextEnabled = false;
    panel.syncField();
    assert.equal(field.placeholder, "Search chats");
    const shiftTab = tabEvent();
    shiftTab.shiftKey = true;
    assert.equal(panel.handleTab(shiftTab), true);
    assert.equal(panel.isActive(), false, "Shift+Tab leaves search");
    assert.equal(panel.handleTab({
      key: "Tab",
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      isComposing: true,
      keyCode: 229,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() {}
    }), false, "IME Tab must not toggle");
    assert.equal(panel.isActive(), false);
    assert.equal(panel.handleTab({
      key: "Tab",
      altKey: false,
      ctrlKey: true,
      metaKey: false,
      isComposing: false,
      preventDefault() {},
      stopPropagation() {}
    }), false, "modified Tab must not toggle");
    searchChip.listeners.get("click")[0]({ preventDefault() {}, stopPropagation() {} });
    assert.equal(panel.isActive(), true, "search chip click enters search");
    composeChip.listeners.get("click")[0]({ preventDefault() {}, stopPropagation() {} });
    assert.equal(panel.isActive(), false, "compose chip click exits search");
    panel.enter();
    assert.equal(shell.classList.contains("prompt-shell-search"), true);
    assert.equal(searchChip.getAttribute("aria-pressed"), "true");
    const emptyNode = shell.querySelector(".prompt-search-empty");
    assert.equal(emptyNode.hidden, true, "empty query must not show an empty state before recency loads");
    assert.doesNotMatch(String(emptyNode.textContent || ""), /No ChatClub tabs/);
    await new Promise((resolve) => { setImmediate(resolve); });
    const options = shell.querySelectorAll(".prompt-search-option");
    assert.equal(options.length, 2, "empty query lists recency rows");
    assert.equal(emptyNode.hidden, true, "empty query must not show an empty state after recency loads");
    const groupNode = shell.querySelector(".prompt-search-group");
    assert.equal(Boolean(groupNode), true, "the results panel carries a caption above the list");
    assert.equal(groupNode.parentElement, shell.querySelector(".prompt-search-results"), "the caption sits outside the scroll container");
    assert.equal(groupNode.hidden, false);
    assert.equal(groupNode.textContent, "Recent", "an empty query labels the recency rows");
    assert.equal(options[0].children[0]?.classList.contains("prompt-search-option-favicons"), true, "site favicons sit to the left of the title");
    assert.ok(options[0].querySelector(".prompt-search-option-copy"), "title and snippet share one copy column");
    assert.ok(options[0].querySelector(".prompt-search-option-title"), "search rows keep a title after the favicon stack");
    assert.equal(options[0].querySelector(".prompt-search-option-meta"), null, "search rows must not use app-name text meta");
    assert.equal(options[0].querySelector(".prompt-search-option-snippet"), null, "empty query must not paint a snippet");
    const timeNode = options[0].querySelector(".prompt-search-option-time");
    assert.equal(Boolean(timeNode), true, "search rows show a date on the right");
    assert.ok(String(nodeText(timeNode) || "").trim(), "date label must not be empty");
    field.value = "Closed";
    panel.handleInput({ target: field });
    await new Promise((resolve) => { setImmediate(resolve); });
    assert.equal(panel.query(), "Closed");
    const filtered = shell.querySelectorAll(".prompt-search-option");
    assert.equal(filtered.length, 1, "query filters title hits");
    assert.equal(groupNode.textContent, "1 result", "a query labels the caption with the result count");
    assert.match(nodeText(filtered[0]), /Closed desk/);
    assert.equal(filtered[0].querySelector(".prompt-search-option-snippet"), null, "title hits stay one line");
    const titleHit = filtered[0].querySelector(".prompt-search-option-title");
    assert.ok(titleHit.querySelector(".workspace-tabs-search-mark"), "title hits mark the title");
    const enter = {
      key: "Enter",
      shiftKey: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() {}
    };
    assert.equal(panel.handleKeydown(enter), true);
    await new Promise((resolve) => { setImmediate(resolve); });
    assert.deepEqual(opened, ["page-closed1xxxxx"]);
    assert.equal(panel.isActive(), false, "activating a row exits search");
    panel.enter();
    fullTextEnabled = true;
    field.value = "leftover-needle";
    panel.handleInput({ target: field });
    await new Promise((resolve) => { setImmediate(resolve); });
    const bodyRows = shell.querySelectorAll(".prompt-search-option");
    assert.equal(bodyRows.length, 1, "body-only hits still render one row");
    const bodyTitle = bodyRows[0].querySelector(".prompt-search-option-title");
    const bodySnippet = bodyRows[0].querySelector(".prompt-search-option-snippet");
    assert.equal(nodeText(bodyTitle), "Live desk", "body-only hits keep the unmarked desk title");
    assert.equal(bodyTitle.querySelector(".workspace-tabs-search-mark"), null, "body-only hits must not mark the title");
    assert.equal(Boolean(bodySnippet), true, "body-only hits paint a snippet line");
    assert.match(nodeText(bodySnippet), /leftover-needle/);
    assert.ok(bodySnippet.querySelector(".workspace-tabs-search-mark"), "the snippet marks the full-text hit");
    assert.match(String(bodyRows[0].getAttribute("aria-label") || ""), /leftover-needle/);
    field.value = "pkd";
    panel.handleInput({ target: field });
    await new Promise((resolve) => { setImmediate(resolve); });
    const markdownRows = shell.querySelectorAll(".prompt-search-option");
    assert.equal(markdownRows.length, 1, "markdown body hits still render one row");
    const markdownSnippet = markdownRows[0].querySelector(".prompt-search-option-snippet");
    assert.equal(Boolean(markdownSnippet), true, "markdown body hits paint a snippet line");
    assert.match(nodeText(markdownSnippet), /PKD/);
    assert.doesNotMatch(nodeText(markdownSnippet), /\*\*/, "composer snippets must not leak markdown emphasis markers");
    assert.ok(markdownSnippet.querySelector(".workspace-tabs-search-mark"), "flattened snippets still mark the full-text hit");
    fullTextEnabled = false;
    field.value = "no-such-desk";
    panel.handleInput({ target: field });
    await new Promise((resolve) => { setImmediate(resolve); });
    assert.equal(shell.querySelectorAll(".prompt-search-option").length, 0, "a miss query must not keep recency rows");
    assert.equal(emptyNode.hidden, false, "a miss query shows the matching-chats empty state");
    assert.equal(groupNode.hidden, true, "the caption must not sit above an empty state");
    assert.match(String(emptyNode.textContent || ""), /No matching chats/);
    assert.doesNotMatch(String(emptyNode.textContent || ""), /No ChatClub tabs/);
    const escape = {
      key: "Escape",
      preventDefault() {},
      stopPropagation() {}
    };
    panel.handleKeydown(escape);
    assert.equal(panel.query(), "");
    panel.handleKeydown(escape);
    assert.equal(panel.isActive(), false, "empty Escape leaves search");
    assert.equal(field.placeholder, "Press Tab to search chats", "leaving search restores the Tab compose hint");
    panel.enter();
    const footer = shell.querySelector(".prompt-search-viewer-button");
    footer.listeners.get("click")[0]({ preventDefault() {}, stopPropagation() {} });
    assert.equal(viewers.length, 1);
    assert.equal(typeof viewers[0].query, "string");

    const customField = new FakeNode("textarea");
    customField.className = "prompt-input";
    customField.placeholder = "Type";
    const customRow = new FakeNode("div");
    customRow.className = "prompt-input-row";
    customRow.append(customField);
    const customShell = new FakeNode("div");
    customShell.className = "prompt-shell";
    customShell.append(customRow);
    globalThis.document.body.append(customShell);
    const customPanel = createComposerSearchPanel({
      composePlaceholder: () => "Type"
    });
    customPanel.attach(customShell);
    assert.equal(customField.placeholder, "Type", "custom placeholders must not be replaced by the Tab hint");
    assert.equal(customField.getAttribute("aria-label"), "Type");
    customPanel.enter();
    assert.equal(customField.placeholder, "Search chats");
    assert.equal(customField.getAttribute("aria-label"), "Search chats");
    customPanel.exit({ restoreField: false });
    assert.equal(customField.placeholder, "Type", "exiting search must restore a custom compose placeholder");

    let stashedDraft = "";
    const draftField = new FakeNode("textarea");
    draftField.className = "prompt-input";
    draftField.value = "It always seems impossible until it is done.";
    const draftRow = new FakeNode("div");
    draftRow.className = "prompt-input-row";
    draftRow.append(draftField);
    const draftShell = new FakeNode("div");
    draftShell.className = "prompt-shell";
    draftShell.append(draftRow);
    globalThis.document.body.append(draftShell);
    let draftPanel;
    draftPanel = createComposerSearchPanel({
      onEnter() { draftPanel.enter(); },
      onStashField(nextField) { stashedDraft = String(nextField?.value || ""); },
      onRestoreField(nextField) {
        if (!nextField) return;
        nextField.value = stashedDraft;
      }
    });
    draftPanel.attach(draftShell);
    assert.equal(draftPanel.handleTab(tabEvent()), true);
    assert.equal(draftPanel.isActive(), true);
    assert.equal(stashedDraft, "It always seems impossible until it is done.");
    assert.equal(draftField.value, "", "search mode must not show the compose draft");
    draftField.value = "rational male";
    draftPanel.handleInput({ target: draftField });
    assert.equal(draftPanel.query(), "rational male");
    assert.equal(draftPanel.handleTab(tabEvent()), true);
    assert.equal(draftPanel.isActive(), false);
    assert.equal(draftField.value, "It always seems impossible until it is done.", "Tab back must restore the compose draft");
    assert.equal(draftPanel.query(), "rational male", "search query must survive the compose restore");
    assert.equal(draftPanel.handleTab(tabEvent()), true);
    assert.equal(draftField.value, "rational male", "Tab into search must restore the last query");
  } finally {
    globalThis.Node = previous.Node;
    globalThis.document = previous.document;
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
