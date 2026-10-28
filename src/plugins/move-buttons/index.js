import { definePlugin } from "../../kernel/define.js";

// No code of its own: sortable lists check whether this plugin is on (lib/settings-table.js).
export default definePlugin({
  name: "MoveButtons",
  description: "plugin.MoveButtons.description",
  authors: ["ChatClub"],
  icon: "arrowUpDown",
  tags: ["appearance"],
  // On for people who had switched on the old "Show move up / down" setting.
  optionKeys: ["settingsClickReorderButtonsEnabled"],
  enabledByDefault: (options) => options.settingsClickReorderButtonsEnabled === true,
  strings: {
    zh: { "plugin.MoveButtons.description": "在所有可排序列表里显示上移 / 下移按钮。关掉后用拖动排序。" },
    en: { "plugin.MoveButtons.description": "Shows move up / down buttons in every sortable list. When off, drag to reorder." },
  },
});
