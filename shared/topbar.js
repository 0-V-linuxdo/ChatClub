export const TOPBAR_BUILTIN_ITEMS = [
  "brand",
  "settings",
  "composer",
  "newChat",
  "deleteThread",
  "summary",
  "pocket",
  "addGroup",
  "layout",
  "settingsJumpMenu",
  "settingsAppearance",
  "settingsProfiles",
  "settingsApps",
  "settingsModels",
  "settingsSummary",
  "settingsMessageNavigation",
  "settingsTopicDeletion",
  "settingsRules",
  "settingsOptimize",
  "settingsPrompts",
  "settingsPromptHistory",
  "settingsShortcuts",
  "settingsIo",
  "settingsFunctionalAnomalies",
  "settingsAbout"
];

const TOPBAR_SETTINGS_SECTION_ITEMS = {
  appearance: "settingsAppearance",
  profiles: "settingsProfiles",
  apps: "settingsApps",
  models: "settingsModels",
  summary: "settingsSummary",
  messageNavigation: "settingsMessageNavigation",
  topicDeletion: "settingsTopicDeletion",
  rules: "settingsRules",
  optimize: "settingsOptimize",
  prompts: "settingsPrompts",
  promptHistory: "settingsPromptHistory",
  shortcuts: "settingsShortcuts",
  io: "settingsIo",
  functionalAnomalies: "settingsFunctionalAnomalies",
  about: "settingsAbout"
};

const TOPBAR_SETTINGS_ITEM_SECTIONS = Object.fromEntries(
  Object.entries(TOPBAR_SETTINGS_SECTION_ITEMS).map(([section, itemId]) => [itemId, section])
);

const TOPBAR_SETTINGS_SECTION_ITEM_IDS = Object.values(TOPBAR_SETTINGS_SECTION_ITEMS);

export const TOPBAR_REQUIRED_ITEMS = ["settings", "composer", "settingsJumpMenu"];

export const DEFAULT_TOPBAR_LAYOUT = [
  { type: "item", id: "brand" },
  { type: "item", id: "settings" },
  { type: "item", id: "composer" },
  { type: "item", id: "newChat" },
  { type: "item", id: "deleteThread" },
  { type: "item", id: "summary" },
  { type: "item", id: "pocket" },
  { type: "flex", id: "flex-default", weight: 1 },
  { type: "item", id: "addGroup" },
  { type: "item", id: "layout" },
  { type: "item", id: "settingsJumpMenu" },
  { type: "item", id: "settingsAppearance" },
  { type: "item", id: "settingsProfiles" },
  { type: "item", id: "settingsApps" },
  { type: "item", id: "settingsModels" },
  { type: "item", id: "settingsSummary" },
  { type: "item", id: "settingsMessageNavigation" },
  { type: "item", id: "settingsTopicDeletion" },
  { type: "item", id: "settingsRules" },
  { type: "item", id: "settingsOptimize" },
  { type: "item", id: "settingsPrompts" },
  { type: "item", id: "settingsPromptHistory" },
  { type: "item", id: "settingsShortcuts" },
  { type: "item", id: "settingsIo" },
  { type: "item", id: "settingsFunctionalAnomalies" },
  { type: "item", id: "settingsAbout" }
];

const TOPBAR_ITEM_META = {
  brand: { labelKey: "common.openInNewTab", icon: "plus" },
  settings: { labelKey: "topbar.settings", icon: "settings" },
  composer: { labelKey: "topbar.item.composer", icon: "edit" },
  newChat: { labelKey: "topbar.newChat", icon: "edit" },
  deleteThread: { labelKey: "topbar.deleteThread", icon: "trash" },
  summary: { labelKey: "topbar.summary", icon: "summary" },
  pocket: { labelKey: "topbar.pocket", icon: "pocket" },
  addGroup: { labelKey: "topbar.addGroup", icon: "plus" },
  layout: { labelKey: "topbar.switchLayout", icon: "layout" },
  settingsJumpMenu: { labelKey: "topbar.settingsJumpMenu", icon: "moreTools" },
  settingsAppearance: { labelKey: "settings.appearance.title", icon: "palette" },
  settingsProfiles: { labelKey: "settings.profiles.title", icon: "key" },
  settingsApps: { labelKey: "settings.apps.title", icon: "apps" },
  settingsModels: { labelKey: "settings.models.title", icon: "model" },
  settingsSummary: { labelKey: "settings.summary.title", icon: "summary" },
  settingsMessageNavigation: { labelKey: "settings.messageNavigation.title", icon: "navigator" },
  settingsTopicDeletion: { labelKey: "settings.topicDeletion.title", icon: "trash" },
  settingsRules: { labelKey: "settings.rules.title", icon: "fileCog" },
  settingsOptimize: { labelKey: "settings.optimize.title", icon: "sparkles" },
  settingsPrompts: { labelKey: "settings.prompts.title", icon: "library" },
  settingsPromptHistory: { labelKey: "settings.promptHistory.title", icon: "history" },
  settingsShortcuts: { labelKey: "settings.shortcuts.title", icon: "keyboard" },
  settingsIo: { labelKey: "settings.io.title", icon: "transfer" },
  settingsFunctionalAnomalies: { labelKey: "settings.functionalAnomalies.title", icon: "alert" },
  settingsAbout: { labelKey: "settings.about.title", icon: "info" },
  flex: { labelKey: "topbar.flexSpace", icon: "grip" }
};

const BUILTIN_SET = new Set(TOPBAR_BUILTIN_ITEMS);
const REQUIRED_SET = new Set(TOPBAR_REQUIRED_ITEMS);

function cleanId(value) {
  return String(value || "").trim();
}

function normalizeItem(raw, index) {
  if (typeof raw === "string") raw = { type: "item", id: raw };
  const type = raw?.type === "flex" ? "flex" : "item";
  if (type === "flex") {
    return {
      type: "flex",
      id: cleanId(raw?.id) || `flex-${index}`,
      weight: 1
    };
  }
  const id = cleanId(raw?.id);
  if (!BUILTIN_SET.has(id)) return null;
  return { type: "item", id };
}

export function normalizeTopbarLayout(raw = DEFAULT_TOPBAR_LAYOUT) {
  const source = Array.isArray(raw) && raw.length ? raw : DEFAULT_TOPBAR_LAYOUT;
  const seenItems = new Set();
  const seenFlex = new Set();
  const normalized = [];
  source.forEach((entry, index) => {
    const item = normalizeItem(entry, index);
    if (!item) return;
    if (item.type === "item") {
      if (seenItems.has(item.id)) return;
      seenItems.add(item.id);
      normalized.push(item);
      return;
    }
    const id = seenFlex.has(item.id) ? `${item.id}-${index}` : item.id;
    seenFlex.add(id);
    normalized.push({ ...item, id });
  });

  if (!seenItems.has("settings")) {
    const brandIndex = normalized.findIndex((entry) => entry.type === "item" && entry.id === "brand");
    normalized.splice(brandIndex >= 0 ? brandIndex + 1 : 0, 0, { type: "item", id: "settings" });
    seenItems.add("settings");
  }

  for (const id of TOPBAR_BUILTIN_ITEMS) {
    if (REQUIRED_SET.has(id) && !seenItems.has(id)) normalized.push({ type: "item", id });
  }
  const missingSettingsIds = TOPBAR_SETTINGS_SECTION_ITEM_IDS.filter((id) => !seenItems.has(id));
  if (missingSettingsIds.length) {
    const hasSettingsMenu = normalized.some((entry) => entry.type === "item" && entry.id === "settingsJumpMenu");
    if (!hasSettingsMenu) {
      normalized.push({ type: "item", id: "settingsJumpMenu" });
      seenItems.add("settingsJumpMenu");
    }
    normalized.push(...missingSettingsIds.map((id) => ({ type: "item", id })));
  }
  return normalized.length ? normalized : JSON.parse(JSON.stringify(DEFAULT_TOPBAR_LAYOUT));
}

export function topbarItemLabelKey(item) {
  return TOPBAR_ITEM_META[item?.type === "flex" ? "flex" : item?.id]?.labelKey || "topbar.item.unknown";
}

export function topbarItemIcon(item) {
  return TOPBAR_ITEM_META[item?.type === "flex" ? "flex" : item?.id]?.icon || "menu";
}

export function topbarSettingsItemForSection(sectionId) {
  return TOPBAR_SETTINGS_SECTION_ITEMS[sectionId] || "";
}

export function topbarSettingsSectionForItem(itemId) {
  return TOPBAR_SETTINGS_ITEM_SECTIONS[itemId] || "";
}
