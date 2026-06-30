export const TOPBAR_BUILTIN_ITEMS = [
  "brand",
  "settings",
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

const TOPBAR_SETTINGS_SECTION_ITEM_IDS = Object.values(TOPBAR_SETTINGS_SECTION_ITEMS);

export const TOPBAR_REQUIRED_ITEMS = ["settings", "composer", "settingsJumpMenu"];

export const DEFAULT_TOPBAR_LAYOUT = [
  { type: "item", id: "brand" },
  { type: "item", id: "settings" },
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
  settings: { labelKey: "topbar.settings", icon: "settings" },
  promptLibrary: { labelKey: "topbar.promptLibrary", icon: "library" },
  composer: { labelKey: "topbar.item.composer", icon: "edit" },
  send: { labelKey: "topbar.send", icon: "send" },
  newChat: { labelKey: "topbar.newChat", icon: "edit" },
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
    let menuIndex = normalized.findIndex((entry) => entry.type === "item" && entry.id === "settingsJumpMenu");
    if (menuIndex < 0) {
      normalized.push({ type: "item", id: "settingsJumpMenu" });
      seenItems.add("settingsJumpMenu");
      menuIndex = normalized.length - 1;
    }
    const settingsOrder = new Map(TOPBAR_SETTINGS_SECTION_ITEM_IDS.map((id, index) => [id, index]));
    const missing = new Set(missingSettingsIds);
    const mergedFolded = [];
    const appendMissingBefore = (orderLimit) => {
      for (const id of TOPBAR_SETTINGS_SECTION_ITEM_IDS) {
        if (!missing.has(id)) continue;
        if (settingsOrder.get(id) >= orderLimit) continue;
        mergedFolded.push({ type: "item", id });
        missing.delete(id);
        seenItems.add(id);
      }
    };
    for (const item of normalized.slice(menuIndex + 1)) {
      const order = item.type === "item" ? settingsOrder.get(item.id) : undefined;
      if (typeof order === "number") appendMissingBefore(order);
      mergedFolded.push(item);
    }
    appendMissingBefore(Number.POSITIVE_INFINITY);
    normalized.splice(menuIndex + 1, normalized.length - menuIndex - 1, ...mergedFolded);
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
