import { definePlugin } from "../../kernel/define.js";
import { definePluginSettings } from "../../kernel/settings.js";

export const SECTION_IDS = ["custom", "international", "aggregator", "chinese"];

export default definePlugin({
  name: "AppPicker",
  description: "plugin.AppPicker.description",
  authors: ["ChatClub"],
  icon: "apps",
  tags: ["workspace"],
  enabledByDefault: true,
  startAt: "domReady",
  dependencies: ["Apps", "Workspace", "TopbarAPI"],
  usesExtensionPoints: ["topbar.item", "tabGroup.button", "shortcut.action"],
  settings: definePluginSettings({
    appPickerSectionOrder: { optionKey: "appPickerSectionOrder", type: "custom", default: SECTION_IDS },
    appPickerAppOrders: { optionKey: "appPickerAppOrders", type: "custom", default: {} },
  }),
  managedStyle: String.raw`
.cc-app-picker { padding: 24px 30px 26px; border-radius: var(--radius); background: color-mix(in srgb, var(--panel) 92%, #222); box-shadow: 0 22px 58px rgba(0,0,0,.38); overflow: auto; }
.cc-app-picker-grid { display: grid; grid-template-columns: .72fr 1.05fr 1fr .95fr; gap: 22px; }
@media (max-width: 760px) { .cc-app-picker-grid { grid-template-columns: 1fr 1fr; } }
.cc-app-section { min-width: 0; }
.cc-app-section.dragging { opacity: .5; }
.cc-app-section.drop-before { box-shadow: -3px 0 0 var(--drop-indicator); }
.cc-app-section.drop-after { box-shadow: 3px 0 0 var(--drop-indicator); }
.cc-app-section-head { display: flex; align-items: center; gap: 6px; min-height: 30px; margin-bottom: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); cursor: grab; user-select: none; }
.cc-app-section-head .grow { flex: 1; }
.cc-app-row { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 36px; padding: 6px 8px; border: 1px solid transparent; border-radius: var(--radius-nested); background: transparent; color: var(--text); text-align: left; user-select: none; }
.cc-app-row:hover, .cc-app-row:focus-visible { background: var(--hover); outline: none; }
.cc-app-row img, .cc-app-row .fallback { width: 18px; height: 18px; border-radius: var(--radius-icon); flex: none; }
.cc-app-row .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: var(--fw-medium); }
.cc-app-row .provider { color: var(--muted); font-size: var(--fs-small); flex: none; }
.cc-app-row.dragging { opacity: .5; }
.cc-app-row.drop-before { box-shadow: inset 0 2px 0 var(--drop-indicator); }
.cc-app-row.drop-after { box-shadow: inset 0 -2px 0 var(--drop-indicator); }
.cc-app-row .moves { display: flex; gap: 1px; }
[data-ws-drop="new-group"].drop-hover { background: var(--hover); box-shadow: inset 0 0 0 1px var(--primary); }
`,
  strings: {
    zh: {
      "plugin.AppPicker.description": "应用选择器：添加分组、给分组添加应用，分区和应用可拖动排序。",
      "picker.addGroup": "添加分组",
      "picker.addApp": "添加应用",
      "picker.section.custom": "自定义 AI",
      "picker.section.international": "国际 AI",
      "picker.section.aggregator": "聚合 AI",
      "picker.section.chinese": "中文 AI",
      "picker.addCustom": "添加",
      "picker.moveUp": "上移",
      "picker.moveDown": "下移",
      "picker.moveLeft": "左移",
      "picker.moveRight": "右移",
      "picker.emptyCustom": "还没有自定义应用",
      "picker.shortcut": "打开应用选择器",
    },
    en: {
      "plugin.AppPicker.description": "App picker: add groups and add apps to a group; sections and apps can be reordered by dragging.",
      "picker.addGroup": "Add group",
      "picker.addApp": "Add app",
      "picker.section.custom": "Custom AI",
      "picker.section.international": "International AI",
      "picker.section.aggregator": "Aggregators",
      "picker.section.chinese": "Chinese AI",
      "picker.addCustom": "Add",
      "picker.moveUp": "Move up",
      "picker.moveDown": "Move down",
      "picker.moveLeft": "Move left",
      "picker.moveRight": "Move right",
      "picker.emptyCustom": "No custom apps yet",
      "picker.shortcut": "Open app picker",
    },
  },
  app: () => import("./app.js"),
});
