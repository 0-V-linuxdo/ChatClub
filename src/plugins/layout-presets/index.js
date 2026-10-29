import { definePlugin } from "../../kernel/define.js";
import { definePluginSettings } from "../../kernel/settings.js";
import { DEFAULT_LAYOUT_APPS } from "../apps/catalog.js";

export const DEFAULT_PRESETS = [{ id: "default", name: "Default", chatAppIdGroups: DEFAULT_LAYOUT_APPS }];

export default definePlugin({
  name: "LayoutPresets",
  description: "plugin.LayoutPresets.description",
  authors: ["ChatClub"],
  icon: "layout",
  tags: ["workspace"],
  shortcutActions: [{ id: "switchLayout", labelKey: "layout.shortcut.switch" }],
  enabledByDefault: true,
  startAt: "domReady",
  dependencies: ["Workspace", "TopbarAPI"],
  usesExtensionPoints: ["topbar.item", "shortcut.action"],
  settings: definePluginSettings({
    layoutPresets: { optionKey: "layoutPresets", type: "custom", default: DEFAULT_PRESETS },
    activeLayoutPresetId: { optionKey: "activeLayoutPresetId", type: "custom", default: "default" },
  }),
  managedStyle: String.raw`
.cc-layout-menu { width: 282px; padding: 7px; background: color-mix(in srgb, var(--panel) 92%, #222); }
.cc-layout-row { display: flex; align-items: center; gap: 4px; border: 1px solid transparent; border-radius: var(--radius-nested); }
.cc-layout-row.current { background: var(--control-selected); border-color: var(--primary); }
.cc-layout-row .cc-menu-item { flex: 1; min-width: 0; }
.cc-layout-row .cc-menu-item:hover { background: transparent; }
.cc-layout-row:hover:not(.current) { background: var(--hover); }
.cc-layout-row .tools { display: flex; gap: 1px; padding-right: 3px; }
`,
  strings: {
    zh: {
      "plugin.LayoutPresets.description": "布局预设：保存多套“每列放哪些应用”的模板并快速切换。",
      "layout.button": "布局",
      "layout.empty": "空布局",
      "layout.add": "添加布局",
      "layout.delete": "删除布局",
      "layout.moveUp": "上移",
      "layout.moveDown": "下移",
      "layout.temporary": "临时布局",
      "layout.shortcut.switch": "切换布局",
      "layout.name": "Layout {n}",
    },
    en: {
      "plugin.LayoutPresets.description": "Layout presets: save several “which apps go in which column” templates and switch quickly.",
      "layout.button": "Layout",
      "layout.empty": "Empty layout",
      "layout.add": "Add layout",
      "layout.delete": "Delete layout",
      "layout.moveUp": "Move up",
      "layout.moveDown": "Move down",
      "layout.temporary": "Temporary layout",
      "layout.shortcut.switch": "Switch layout",
      "layout.name": "Layout {n}",
    },
  },
  app: () => import("./app.js"),
});
