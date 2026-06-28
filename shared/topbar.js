export const TOPBAR_BUILTIN_ITEMS = [
  "brand",
  "promptLibrary",
  "composer",
  "send",
  "newChat",
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
  "settingsOptimize",
  "settingsPrompts",
  "settingsShortcuts",
  "settingsIo"
];

export const TOPBAR_SETTINGS_SECTION_ITEMS = {
  appearance: "settingsAppearance",
  profiles: "settingsProfiles",
  apps: "settingsApps",
  models: "settingsModels",
  summary: "settingsSummary",
  optimize: "settingsOptimize",
  prompts: "settingsPrompts",
  shortcuts: "settingsShortcuts",
  io: "settingsIo"
};

export const TOPBAR_SETTINGS_ITEM_SECTIONS = Object.fromEntries(
  Object.entries(TOPBAR_SETTINGS_SECTION_ITEMS).map(([section, itemId]) => [itemId, section])
);

export const TOPBAR_REQUIRED_ITEMS = ["composer", "settingsJumpMenu"];

export const DEFAULT_TOPBAR_LAYOUT = [
  { type: "item", id: "brand" },
  { type: "item", id: "promptLibrary" },
  { type: "item", id: "composer" },
  { type: "item", id: "send" },
  { type: "item", id: "newChat" },
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
  { type: "item", id: "settingsOptimize" },
  { type: "item", id: "settingsPrompts" },
  { type: "item", id: "settingsShortcuts" },
  { type: "item", id: "settingsIo" }
];

export const TOPBAR_ITEM_META = {
  brand: { labelKey: "topbar.item.brand", icon: "palette" },
  promptLibrary: { labelKey: "topbar.promptLibrary", icon: "library" },
  composer: { labelKey: "topbar.item.composer", icon: "edit" },
  send: { labelKey: "topbar.send", icon: "send" },
  newChat: { labelKey: "topbar.newChat", icon: "edit" },
  summary: { labelKey: "topbar.summary", icon: "summary" },
  pocket: { labelKey: "topbar.pocket", icon: "pocket" },
  addGroup: { labelKey: "topbar.addGroup", icon: "plus" },
  layout: { labelKey: "topbar.switchLayout", icon: "layout" },
  settingsJumpMenu: { labelKey: "topbar.settingsJumpMenu", icon: "menu" },
  settingsAppearance: { labelKey: "settings.appearance.title", icon: "palette" },
  settingsProfiles: { labelKey: "settings.profiles.title", icon: "key" },
  settingsApps: { labelKey: "settings.apps.title", icon: "apps" },
  settingsModels: { labelKey: "settings.models.title", icon: "model" },
  settingsSummary: { labelKey: "settings.summary.title", icon: "summary" },
  settingsOptimize: { labelKey: "settings.optimize.title", icon: "sparkles" },
  settingsPrompts: { labelKey: "settings.prompts.title", icon: "library" },
  settingsShortcuts: { labelKey: "settings.shortcuts.title", icon: "keyboard" },
  settingsIo: { labelKey: "settings.io.title", icon: "transfer" },
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
      weight: Math.max(1, Math.min(6, Number(raw?.weight) || 1))
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

  for (const id of TOPBAR_BUILTIN_ITEMS) {
    if (REQUIRED_SET.has(id) && !seenItems.has(id)) normalized.push({ type: "item", id });
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
