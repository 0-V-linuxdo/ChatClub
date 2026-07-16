#!/usr/bin/env node

const assert = require("node:assert/strict");

(async () => {
  const {
    DEFAULT_TAB_GROUP_BUTTON_ORDER,
    TAB_GROUP_BUTTON_ORDER_MIGRATION_VERSION
  } = await import("../shared/constants.js");
  const {
    dehydrateOptions,
    normalizeOptions,
    normalizeTabGroupButtonOrder
  } = await import("../shared/storage-schema.js");

  const legacyDefault = [
    "addApp",
    "newChat",
    "refreshPage",
    "reload",
    "messageNavigator",
    "deleteThread",
    "fullscreen",
    "openInNewTab",
    "copyLink",
    "removeGroup"
  ];

  const normalizedSavedOrder = normalizeOptions({ tabGroupButtonOrder: legacyDefault });
  assert.deepEqual(normalizedSavedOrder.tabGroupButtonOrder, [...legacyDefault, "goToUrl"]);
  assert.notDeepEqual(normalizedSavedOrder.tabGroupButtonOrder, [...DEFAULT_TAB_GROUP_BUTTON_ORDER]);
  assert.equal(
    normalizedSavedOrder.tabGroupButtonOrderMigrationVersion,
    TAB_GROUP_BUTTON_ORDER_MIGRATION_VERSION
  );

  const persisted = dehydrateOptions(normalizedSavedOrder);
  assert.equal(persisted.tabGroupButtonOrderMigrationVersion, TAB_GROUP_BUTTON_ORDER_MIGRATION_VERSION);
  assert.deepEqual(normalizeOptions(persisted).tabGroupButtonOrder, [...legacyDefault, "goToUrl"]);

  assert.deepEqual(normalizeOptions({}).tabGroupButtonOrder, [...DEFAULT_TAB_GROUP_BUTTON_ORDER]);
  assert.deepEqual(normalizeOptions({ tabGroupButtonOrder: "invalid" }).tabGroupButtonOrder, [
    ...DEFAULT_TAB_GROUP_BUTTON_ORDER
  ]);

  const alreadyMigrated = normalizeOptions({
    tabGroupButtonOrder: legacyDefault,
    tabGroupButtonOrderMigrationVersion: TAB_GROUP_BUTTON_ORDER_MIGRATION_VERSION
  });
  assert.deepEqual(alreadyMigrated.tabGroupButtonOrder, [...legacyDefault, "goToUrl"]);
  assert.notDeepEqual(alreadyMigrated.tabGroupButtonOrder, [...DEFAULT_TAB_GROUP_BUTTON_ORDER]);

  const customWithUnknownItem = normalizeOptions({
    tabGroupButtonOrder: [...legacyDefault, "custom-button"],
    tabGroupButtonOrderMigrationVersion: 0
  });
  assert.deepEqual(customWithUnknownItem.tabGroupButtonOrder, [...legacyDefault, "goToUrl"]);
  assert.notDeepEqual(customWithUnknownItem.tabGroupButtonOrder, [...DEFAULT_TAB_GROUP_BUTTON_ORDER]);

  const futureMigrationVersion = normalizeOptions({
    tabGroupButtonOrder: legacyDefault,
    tabGroupButtonOrderMigrationVersion: TAB_GROUP_BUTTON_ORDER_MIGRATION_VERSION + 1
  });
  assert.deepEqual(futureMigrationVersion.tabGroupButtonOrder, [...legacyDefault, "goToUrl"]);
  assert.equal(
    futureMigrationVersion.tabGroupButtonOrderMigrationVersion,
    TAB_GROUP_BUTTON_ORDER_MIGRATION_VERSION + 1
  );

  assert.deepEqual(normalizeTabGroupButtonOrder(legacyDefault), [...legacyDefault, "goToUrl"]);

  console.log("tab group button order migration v1: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
