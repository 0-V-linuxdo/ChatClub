import { definePlugin } from "../../kernel/define.js";
import { definePluginSettings } from "../../kernel/settings.js";
import strings from "./strings.js";

const marker = (key, initial) => ({ optionKey: key, type: "custom", default: initial });

export default definePlugin({
  name: "LegacyMigration",
  description: "plugin.LegacyMigration.description",
  authors: ["ChatClub"],
  icon: "history",
  tags: ["data"],
  enabledByDefault: true,
  startAt: "init",
  strings,
  settings: definePluginSettings({
    topbarDeleteThreadMigrated: marker("topbarDeleteThreadMigrated", false),
    topbarSearchMigrated: marker("topbarSearchMigrated", false),
    topbarShareMigrated: marker("topbarShareMigrated", false),
    topbarHistoryMigrated: marker("topbarHistoryMigrated", false),
    topbarPromptInputFontSizeMigrationVersion: marker("topbarPromptInputFontSizeMigrationVersion", 0),
    tabGroupButtonOrderMigrationVersion: marker("tabGroupButtonOrderMigrationVersion", 0),
    apiProfileDefaultModelMigrationVersion: marker("apiProfileDefaultModelMigrationVersion", 0),
    apiPromotionChannelsVersion: marker("apiPromotionChannelsVersion", 0),
    // Values only old builds wrote: read once by the migrations, then left alone.
    tabGroupButtonsMode: marker("tabGroupButtonsMode", null),
    optimizeEndpoint: marker("optimizeEndpoint", undefined),
    optimizeApiKey: marker("optimizeApiKey", undefined),
    optimizeModel: marker("optimizeModel", undefined),
    summaryEndpoint: marker("summaryEndpoint", undefined),
    summaryApiKey: marker("summaryApiKey", undefined),
    summaryModel: marker("summaryModel", undefined),
  }),
  app: () => import("./app.js"),
});
