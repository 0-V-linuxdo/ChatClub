#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

(async () => {
  const { DEFAULT_OPTIONS } = await import(moduleUrl("shared/constants.js"));
  const { normalizeOptions, dehydrateOptions } = await import(moduleUrl("shared/storage-schema.js"));
  const { exportConfigBundle, inspectImportedConfig } = await import(moduleUrl("shared/storage-config-bundle.js"));
  const { t, setLanguage } = await import(moduleUrl("shared/i18n.js"));
  const settingsState = await import(moduleUrl("app/settings/state-ports.js"));

  assert.equal(DEFAULT_OPTIONS.settingsClickReorderButtonsEnabled, false);
  assert.equal(normalizeOptions({}).settingsClickReorderButtonsEnabled, false);
  assert.equal(normalizeOptions({ settingsClickReorderButtonsEnabled: true }).settingsClickReorderButtonsEnabled, true);
  assert.equal(normalizeOptions({ settingsClickReorderButtonsEnabled: false }).settingsClickReorderButtonsEnabled, false);
  for (const invalid of [undefined, null, 0, 1, "", "false", "true", {}, []]) {
    assert.equal(
      normalizeOptions({ settingsClickReorderButtonsEnabled: invalid }).settingsClickReorderButtonsEnabled,
      false,
      `${String(invalid)} must stay compact`
    );
  }

  const persisted = dehydrateOptions({ settingsClickReorderButtonsEnabled: true });
  assert.equal(persisted.settingsClickReorderButtonsEnabled, true);
  assert.equal(normalizeOptions(JSON.parse(JSON.stringify(persisted))).settingsClickReorderButtonsEnabled, true);

  const exportedBundle = exportConfigBundle({
    options: {
      ...DEFAULT_OPTIONS,
      settingsClickReorderButtonsEnabled: true
    }
  }, ["options"]);
  const inspectedBundle = inspectImportedConfig(JSON.parse(JSON.stringify(exportedBundle)));
  assert.equal(inspectedBundle.data.options.settingsClickReorderButtonsEnabled, true);

  assert.ok(settingsState.SETTINGS_OPTION_CAPABILITIES.appearance.write.includes("settingsClickReorderButtonsEnabled"));
  assert.ok(settingsState.SETTINGS_OPTION_CAPABILITIES.appearance.read.includes("settingsClickReorderButtonsEnabled"));

  setLanguage("en");
  assert.equal(t("appearance.clickReorderButtons"), "Always show Move up / Move down");
  assert.match(t("appearance.clickReorderButtonsHelp"), /click alternative/i);
  setLanguage("zh_CN");
  assert.equal(t("appearance.clickReorderButtons"), "始终显示上移/下移按钮");
  assert.match(t("appearance.clickReorderButtonsHelp"), /单击替代/);

  const kit = read("app/settings/kit.js");
  assert.match(kit, /function settingsReorderHandle/);
  assert.match(kit, /createReorderButtons/);
  assert.match(kit, /function bindSettingsClickReorderPath/);
  assert.match(kit, /closest\?\.\("\.settings-reorder"\)/);
  assert.doesNotMatch(kit, /closest\?\.\("\.settings-list-row"\)/);

  const appearance = read("app/settings/appearance.js");
  assert.match(appearance, /settingsClickReorderButtonsEnabled: nextEnabled/);
  assert.match(appearance, /dataset\.settingsClickReorder = nextEnabled \? "always" : "compact"/);
  assert.match(appearance, /clickReorderControl/);

  const runtime = read("app/runtime.js");
  assert.match(runtime, /dataset\.settingsClickReorder = state\.options\?\.settingsClickReorderButtonsEnabled === true/);

  const css = read("styles/chatclub.css");
  assert.match(css, /html:not\(\[data-settings-click-reorder="always"\]\) \{\s*--ui-reorder-cluster: var\(--settings-control-height\);/s);
  assert.match(css, /settings-list:has\(\.settings-reorder:focus-within\)/);
  assert.match(css, /settings-list:has\(\.settings-reorder-click-path\)/);
  assert.match(css, /settings-reorder:focus-within \.ui-reorder/);
  assert.match(css, /settings-reorder\.settings-reorder-click-path \.ui-reorder/);
  assert.doesNotMatch(css, /settings-list-row:focus-within \.settings-reorder \.ui-reorder/);
  assert.doesNotMatch(
    css,
    /html:not\(\[data-settings-click-reorder="always"\]\)[^{]*\.settings-list-row \.settings-reorder \.ui-reorder \{[^}]*position:\s*absolute/s
  );
  assert.match(
    css,
    /\.appearance-toggle-control \{[^}]*display: grid;[^}]*grid-template-columns: minmax\(0, 52ch\) auto;[^}]*width: fit-content;/s,
    "click-reorder switch must hug copy instead of stretching the General well"
  );
  assert.doesNotMatch(
    css,
    /\.appearance-toggle-control \{[^}]*justify-content: space-between;[^}]*border: 1px solid/s,
    "click-reorder switch must not keep nested well chrome"
  );

  console.log("settings click reorder: ok");
})().catch((event) => {
  console.error(event);
  process.exit(1);
});
