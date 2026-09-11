#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(root, "styles/chatclub.css"), "utf8");
const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");

assert.match(
  css,
  /\.prompt-collapsed-preview\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?white-space:\s*nowrap;[\s\S]*?text-overflow:\s*ellipsis;/,
  "the collapsed preview overlay must clip long placeholder and draft text"
);
assert.match(
  css,
  /\.prompt-collapsed-preview-text\s*\{[\s\S]*?flex:\s*1;[\s\S]*?min-width:\s*0;[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/,
  "preview text is the flex child that actually ellipsizes"
);

assert.match(
  css,
  /\.prompt-shell-expanded \.prompt-collapsed-preview:not\(\.prompt-collapsed-preview-empty\)[\s\S]{0,160}?\{[\s\S]*?display:\s*none;/,
  "expanded compose hides the preview only when it is showing a draft"
);
assert.match(
  css,
  /\.prompt-shell-expanded\.prompt-shell-has-images \.prompt-collapsed-preview[\s\S]{0,80}?\{[\s\S]*?display:\s*none;/,
  "expanded image drafts keep using the in-flow image strip, not the collapsed preview"
);
assert.match(
  css,
  /\.prompt-input-expanded \+ \.prompt-collapsed-preview:not\(\.prompt-collapsed-preview-empty\)\s*\{[\s\S]*?display:\s*none;/,
  "an expanded textarea sibling hides a non-empty preview"
);
assert.match(
  css,
  /:focus \+ \.prompt-collapsed-preview:not\(\.prompt-collapsed-preview-empty\)/,
  "unexpanded focus hides a non-empty preview, not the empty placeholder overlay"
);
assert.doesNotMatch(
  css,
  /\.prompt-shell-expanded \.prompt-collapsed-preview\s*\{/,
  "expanded compose must not hide .prompt-collapsed-preview-empty"
);
assert.doesNotMatch(
  css,
  /\.prompt-input-expanded \+ \.prompt-collapsed-preview\s*\{/,
  "expanded textarea must not hide an empty sibling preview"
);

assert.match(
  css,
  /\.prompt-input:not\(\.prompt-input-expanded\)::placeholder\s*\{[\s\S]*?color:\s*transparent;/,
  "collapsed compose must not paint the native placeholder under the overlay"
);
assert.match(
  css,
  /\.prompt-input:not\(\.prompt-input-expanded\):focus::placeholder\s*\{[\s\S]*?color:\s*transparent;/,
  "focused empty compose keeps native ::placeholder transparent so the ellipsized overlay remains the visible hint"
);
assert.match(
  css,
  /\.prompt-input-expanded::placeholder\s*\{[\s\S]*?color:\s*transparent;/,
  "expanded empty compose also keeps native ::placeholder transparent"
);
assert.doesNotMatch(
  css,
  /\.prompt-input:not\(\.prompt-input-expanded\):focus::placeholder\s*\{[^}]*color:\s*var\(--muted\)/,
  "focused compose must not reveal the wrapping native placeholder"
);

assert.match(
  css,
  /\.prompt-shell-search \.prompt-collapsed-preview,[\s\S]*?display:\s*none;/,
  "search mode still hides the collapsed preview"
);
assert.match(
  css,
  /\.prompt-shell-search \.prompt-input:not\(\.prompt-input-expanded\)::placeholder\s*\{[\s\S]*?color:\s*var\(--muted\);/,
  "search still uses the native field placeholder"
);

assert.match(
  agents,
  /prompt-collapsed-preview-empty` visible \(nowrap \+ ellipsis\)/,
  "the overlay contract must keep empty compose on the ellipsizing preview"
);
assert.match(
  agents,
  /Do not JS-slice the placeholder to `TOPBAR_PROMPT_PLACEHOLDER_MAX_LEN`/,
  "display truncation stays in CSS, not a JS slice of MAX_LEN"
);

assert.match(
  css,
  /\.prompt-input:placeholder-shown\s*\{[\s\S]*?white-space:\s*nowrap;/,
  "empty native placeholder layout must stay on one line so scrollHeight cannot add a second line box"
);
assert.match(
  agents,
  /promptInputHeight` `empty/,
  "empty focused compose must size to --prompt-collapsed-height instead of placeholder scrollHeight"
);
assert.match(
  agents,
  /do not grow `--topbar-height` to fit it/,
  "empty-focus height must not stretch the 51px topbar"
);

console.log("topbar prompt placeholder ellipsis: ok");
