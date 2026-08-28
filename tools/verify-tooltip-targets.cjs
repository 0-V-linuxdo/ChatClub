#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const AUTHOR_ROOTS = Object.freeze(["app", "ui"]);
const TOOLTIP_ID_PATTERN = /[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+/;
const LIVE_TOOLTIP_ID = /^(?:topbar|workspace|summary|share|pocket|history|viewer|optimize|settings|appPicker)\./;
const LITERAL_TOOLTIP_ID = new RegExp(`(?:${[
  String.raw`"data-tooltip-id"\s*:\s*"`,
  String.raw`setAttribute\(\s*"data-tooltip-id"\s*,\s*"`,
  String.raw`tooltipId\s*:\s*"`
].join("|")})(${TOOLTIP_ID_PATTERN.source})"`, "g");
const HELPER_LAST_ID = new RegExp(
  String.raw`\b(?:iconButton|compactIconButton|menuButton|actionButton|topIconButton|shareActionButton|summaryActionButton|settingsIconAction|actionsMenuItem|createActionButton|createTopIconButton|createCompactIconButton|createMenuButton|createSettingsIconAction)\([\s\S]*?,\s*"(${TOOLTIP_ID_PATTERN.source})"\s*\)`,
  "g"
);
const DYNAMIC_TOOLTIP_VALUE = /(?:tooltipId|"data-tooltip-id")\s*:\s*([^,\n]+)/g;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function filesUnder(directory, relative = "") {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(absolute, childRelative));
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(childRelative);
  }
  return files;
}

function authorSources() {
  return AUTHOR_ROOTS.flatMap((directory) => (
    filesUnder(path.join(root, directory)).map((file) => `${directory}/${file}`)
  )).sort();
}

function addId(ids, value) {
  const id = String(value || "").trim();
  if (LIVE_TOOLTIP_ID.test(id)) ids.add(id);
}

function normalizeDynamicExpression(value) {
  const raw = String(value || "").trim();
  if (raw.startsWith("`")) {
    const end = raw.indexOf("`", 1);
    return end > 0 ? raw.slice(0, end + 1) : raw;
  }
  return raw.replace(/[,;]+$/, "").trim();
}

function expandDynamicTooltipValue(value, discovered, errors, owner) {
  const expression = normalizeDynamicExpression(value);
  if (!expression || expression === "null" || expression === '""' || expression === "''") return;
  if (/^["']/.test(expression)) return;
  if (
    expression === "tooltipId"
    || expression === "tooltipId || null"
    || expression === "options.tooltipId || null"
    || expression === "disabled ? null : target.id"
    || expression === "meta.tooltipId || null"
    || expression === "tooltipIdForItem(item)"
  ) return;
  if (expression === "TABS_SIDEBAR_SORT_LABEL_KEYS[mode]") {
    discovered.dynamic.add(`${owner}:TABS_SIDEBAR_SORT_LABEL_KEYS`);
    return;
  }
  const template = expression.match(/^`([^`]+)`$/);
  if (template?.[1] === "topbar.settings.${id}" || template?.[1] === "topbar.settings.${sectionId}") {
    discovered.dynamic.add(`${owner}:topbar.settings`);
    return;
  }
  if (template?.[1] === "settings.apps.iframe.${action}") {
    discovered.dynamic.add(`${owner}:settings.apps.iframe`);
    return;
  }
  errors.push(`${owner}: unsupported dynamic tooltip id ${expression}`);
}

function collectLiveTooltipIds(errors) {
  const ids = new Set();
  const discovered = { dynamic: new Set() };
  for (const file of authorSources()) {
    const source = read(file);
    for (const match of source.matchAll(LITERAL_TOOLTIP_ID)) addId(ids, match[1]);
    for (const match of source.matchAll(HELPER_LAST_ID)) addId(ids, match[1]);
    for (const match of source.matchAll(DYNAMIC_TOOLTIP_VALUE)) {
      expandDynamicTooltipValue(match[1], discovered, errors, file);
    }
  }
  return { ids, discovered };
}

function appearancePreviewIds() {
  const source = read("app/settings/appearance.js");
  const block = source.match(/const tooltipPreviewIcon = \(targetId\) => \(\{([\s\S]*?)\}\)\[targetId\]/);
  if (!block) throw new Error("app/settings/appearance.js must keep a tooltipPreviewIcon map");
  return new Set([...block[1].matchAll(/"([^"]+)":/g)].map((match) => match[1]));
}

async function verifyTooltipTargets() {
  const errors = [];
  const {
    TOOLTIP_TARGET_GROUPS,
    TOOLTIP_TARGET_IDS
  } = await import(pathToFileURL(path.join(root, "shared/constants.js")).href);
  const { SETTINGS_SECTIONS } = await import(pathToFileURL(path.join(root, "app/settings/sections.js")).href);
  const { TABS_SIDEBAR_SORT_LABEL_KEYS } = await import(pathToFileURL(path.join(root, "app/workspace/tabs-sidebar-sort.js")).href);
  const { normalizeOptions } = await import(pathToFileURL(path.join(root, "shared/storage-schema.js")).href);
  const { setLanguage, t } = await import(pathToFileURL(path.join(root, "shared/i18n.js")).href);

  const catalog = new Set(TOOLTIP_TARGET_IDS);
  const { ids: liveIds, discovered } = collectLiveTooltipIds(errors);
  if (discovered.dynamic.has("app/workspace/tabs-sidebar-controller.js:TABS_SIDEBAR_SORT_LABEL_KEYS")) {
    for (const id of Object.values(TABS_SIDEBAR_SORT_LABEL_KEYS)) addId(liveIds, id);
  }
  if ([...discovered.dynamic].some((entry) => entry.endsWith(":topbar.settings"))) {
    for (const [id] of SETTINGS_SECTIONS) addId(liveIds, `topbar.settings.${id}`);
  }
  if ([...discovered.dynamic].some((entry) => entry.endsWith(":settings.apps.iframe"))) {
    addId(liveIds, "settings.apps.iframe.edit");
    addId(liveIds, "settings.apps.iframe.reset");
  }

  for (const id of [...liveIds].sort()) {
    if (!catalog.has(id)) {
      errors.push(`live tooltip id ${id} is missing from TOOLTIP_TARGET_GROUPS; Settings cannot persist a disable toggle`);
    }
  }

  const previewIds = appearancePreviewIds();
  for (const id of TOOLTIP_TARGET_IDS) {
    if (!previewIds.has(id)) errors.push(`Button Tips preview is missing an icon for ${id}`);
    const kept = normalizeOptions({ tooltipDisabledIds: [id] }).tooltipDisabledIds;
    if (kept.length !== 1 || kept[0] !== id) {
      errors.push(`tooltipDisabledIds must retain catalog id ${id}; normalizeOptions kept ${JSON.stringify(kept)}`);
    }
  }
  for (const id of previewIds) {
    if (!catalog.has(id)) errors.push(`Button Tips preview ${id} is not a TOOLTIP_TARGET_IDS entry`);
  }

  for (const group of TOOLTIP_TARGET_GROUPS) {
    for (const lang of ["en", "zh_CN"]) {
      setLanguage(lang);
      if (t(group.labelKey) === group.labelKey) {
        errors.push(`missing ${lang} label for tooltip group ${group.id} (${group.labelKey})`);
      }
      for (const target of group.targets) {
        if (t(target.labelKey) === target.labelKey) {
          errors.push(`missing ${lang} label for tooltip target ${target.id} (${target.labelKey})`);
        }
      }
    }
  }

  if (errors.length) {
    throw new Error(`Tooltip target catalog check failed:\n${errors.map((error) => `  - ${error}`).join("\n")}`);
  }
  return {
    liveCount: liveIds.size,
    catalogCount: TOOLTIP_TARGET_IDS.length
  };
}

if (require.main === module) {
  verifyTooltipTargets()
    .then((summary) => {
      console.log(`Tooltip target catalog is complete (${summary.liveCount} live ids, ${summary.catalogCount} settings targets).`);
    })
    .catch((error) => {
      console.error(error?.stack || error);
      process.exitCode = 1;
    });
}

module.exports = { verifyTooltipTargets };
