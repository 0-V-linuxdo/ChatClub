#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;
const { functionSource } = require("./function-source.cjs");

(async () => {
  const icons = read("ui/icons.js");
  const apps = read("app/settings/apps.js");
  const css = read("styles/chatclub.css");
  const constants = read("shared/constants.js");
  const i18n = await import(moduleUrl("shared/i18n.js"));

  assert.match(icons, /\blistOrdered:\s*\[/);
  assert.match(icons, /\bimages:\s*\[/);
  assert.match(icons, /\bcable:\s*\[/);
  assert.match(icons, /M6\.5 20H3\.4c0-1 2\.6-1\.925 2\.6-3\.5a1\.5 1\.5 0 0 0-2\.6-1\.02/);
  assert.match(icons, /m22 11-1\.296-1\.296a2\.4 2\.4 0 0 0-3\.408 0L11 16/);
  assert.match(icons, /M19 14V6\.5a1 1 0 0 0-7 0v11a1 1 0 0 1-7 0V10/);

  assert.match(constants, /PROMPT_IMAGE_PASTE_STRATEGY_SEQUENTIAL = "sequential"/);
  assert.match(constants, /PROMPT_IMAGE_PASTE_STRATEGY_BATCH = "batch"/);
  assert.doesNotMatch(constants, /PROMPT_IMAGE_PASTE_STRATEGY_NOTION/);
  assert.doesNotMatch(constants, /notion-bridge/);

  assert.match(apps, /function strategyMark\(app, notion\)/);
  assert.doesNotMatch(apps, /function imagePasteStrategyKind\(/);
  assert.doesNotMatch(apps, /function builtInImagePasteStrategyKind\(/);
  const strategyMarkSource = functionSource(apps, "strategyMark");
  assert.match(strategyMarkSource, /notion && builtInAppIsNotion\(app\) \? "notion-bridge"/);
  assert.match(strategyMarkSource, /kind === "notion-bridge" \? "cable"/);
  assert.match(strategyMarkSource, /kind === "batch" \? "images"/);
  assert.match(strategyMarkSource, /"listOrdered"/);
  assert.match(strategyMarkSource, /settings-strategy-cell tooltip-trigger settings-image-strategy-mark/);
  assert.match(strategyMarkSource, /role: "img"/);
  assert.match(strategyMarkSource, /"aria-label": label/);
  assert.match(strategyMarkSource, /"data-tooltip": label/);
  assert.match(strategyMarkSource, /dataset: \{ strategy: kind \}/);
  assert.match(strategyMarkSource, /svgIcon\(icon\)/);
  assert.doesNotMatch(strategyMarkSource, /settingsIconAction/);
  assert.doesNotMatch(strategyMarkSource, /type: "button"/);

  const builtInRowSource = functionSource(apps, "builtInRow");
  assert.match(builtInRowSource, /strategyMark\(app, true\)/);
  assert.doesNotMatch(
    builtInRowSource,
    /el\("span", \{ class: "settings-strategy-cell" \}, builtInImagePasteStrategyLabel/
  );

  const customRowSource = functionSource(apps, "customRow");
  assert.match(customRowSource, /strategyMark\(app\)/);
  assert.doesNotMatch(
    customRowSource,
    /el\("span", \{ class: "settings-strategy-cell" \}, imagePasteStrategyLabel/
  );

  assert.match(
    functionSource(apps, "openBuiltInDetails"),
    /detailValue\(builtInImagePasteStrategyLabel\(app\)\)/,
    "details modal keeps the text label"
  );
  assert.match(
    functionSource(apps, "openCustomEditor"),
    /select\(normalizePromptImagePasteStrategy\(draft\.imagePasteStrategy\), imagePasteStrategyOptions\(\)\)/,
    "custom editor keeps a text select"
  );
  assert.match(
    functionSource(apps, "imagePasteStrategyOptions"),
    /PROMPT_IMAGE_PASTE_STRATEGY_SEQUENTIAL[\s\S]*PROMPT_IMAGE_PASTE_STRATEGY_BATCH/
  );
  assert.doesNotMatch(functionSource(apps, "imagePasteStrategyOptions"), /notion-bridge|NotionBridge/);

  assert.match(
    css,
    /--settings-image-strategy-track:\s*120px/
  );
  assert.match(
    css,
    /@media \(max-width: 1040px\) \{[\s\S]*--settings-image-strategy-track:\s*104px/
  );
  assert.match(
    css,
    /\.built-in-config-row \{[^}]*min-width:\s*648px;[^}]*grid-template-columns:\s*var\(--ui-reorder-cluster\)\s+var\(--settings-site-mark\)\s+minmax\(136px, \.9fr\)\s+minmax\(220px, 1\.36fr\)\s+var\(--settings-image-strategy-track\)\s+78px/s
  );
  assert.match(
    css,
    /\.custom-config-row \{[^}]*min-width:\s*668px;[^}]*grid-template-columns:\s*var\(--ui-reorder-cluster\)\s+var\(--settings-site-mark\)\s+minmax\(136px, \.9fr\)\s+minmax\(220px, 1\.36fr\)\s+var\(--settings-image-strategy-track\)\s+88px/s
  );
  assert.match(
    css,
    /\.built-in-config-row \{[^}]*min-width:\s*608px;[^}]*grid-template-columns:\s*var\(--ui-reorder-cluster\)\s+var\(--settings-site-mark\)\s+minmax\(118px, \.86fr\)\s+minmax\(176px, 1\.22fr\)\s+var\(--settings-image-strategy-track\)\s+74px/s
  );
  assert.match(
    css,
    /\.custom-config-row \{[^}]*min-width:\s*628px;[^}]*grid-template-columns:\s*var\(--ui-reorder-cluster\)\s+var\(--settings-site-mark\)\s+minmax\(118px, \.86fr\)\s+minmax\(176px, 1\.22fr\)\s+var\(--settings-image-strategy-track\)\s+80px/s
  );
  assert.doesNotMatch(
    css,
    /\.built-in-config-row \{[^}]*grid-template-columns:[^;}]*max-content/s
  );
  assert.doesNotMatch(
    css,
    /\.custom-config-row \{[^}]*grid-template-columns:[^;}]*max-content/s
  );
  const headerStrategy = css.match(
    /\.built-in-config-list \.settings-list-header span:nth-child\(5\),\s*\n\.custom-config-list \.settings-list-header span:nth-child\(5\) \{([^}]+)\}/
  );
  assert.ok(headerStrategy, "platform lists must share the Image Paste Strategy header rule");
  assert.match(headerStrategy[1], /text-align:\s*center/);
  assert.match(headerStrategy[1], /white-space:\s*normal/);
  assert.match(headerStrategy[1], /text-wrap:\s*balance/);
  assert.match(headerStrategy[1], /line-height:\s*1\.15/);
  assert.match(headerStrategy[1], /padding:\s*0 var\(--space-1\)/);
  assert.doesNotMatch(headerStrategy[1], /white-space:\s*nowrap/);
  assert.match(css, /\.settings-image-strategy-mark \.svg-icon \{[^}]*width:\s*16px/s);
  assert.match(
    css,
    /\.built-in-config-list \.settings-strategy-cell\.settings-image-strategy-mark,[\s\S]*?overflow:\s*visible/
  );

  i18n.setLanguage("en");
  assert.equal(i18n.t("apps.imagePasteStrategy"), "Image Paste Strategy");
  assert.equal(i18n.t("apps.imageStrategySequential"), "Paste one by one");
  assert.equal(i18n.t("apps.imageStrategyBatch"), "Batch paste");
  assert.equal(i18n.t("apps.imageStrategyNotionBridge"), "Notion bridge");
  i18n.setLanguage("zh_CN");
  assert.equal(i18n.t("apps.imagePasteStrategy"), "图片粘贴策略");
  assert.equal(i18n.t("apps.imageStrategySequential"), "逐张粘贴");
  assert.equal(i18n.t("apps.imageStrategyBatch"), "批量粘贴");
  assert.equal(i18n.t("apps.imageStrategyNotionBridge"), "Notion 桥接");

  console.log("image paste strategy icon: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
