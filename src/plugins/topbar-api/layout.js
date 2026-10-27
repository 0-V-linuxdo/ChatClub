// Top bar layout model (spec v2 01 §6.2).

export const SETTINGS_SECTION_IDS = [
  "appearance", "profiles", "apps", "models", "summary", "messageNavigation", "topicDeletion",
  "rules", "optimize", "prompts", "promptHistory", "shortcuts", "io", "functionalAnomalies", "about",
];

export const sectionItemId = (sectionId) => `settings${sectionId.charAt(0).toUpperCase()}${sectionId.slice(1)}`;
export const SETTINGS_ITEM_IDS = SETTINGS_SECTION_IDS.map(sectionItemId);

export const REQUIRED_ITEMS = ["settings", "composer", "settingsJumpMenu"];

// Internally a layout is an array of strings: item ids, and "flex:<id>" for flexible spaces.
export const DEFAULT_LAYOUT = [
  "brand", "settings", "search", "composer", "newChat", "deleteThread", "summary", "share", "pocket", "history",
  "flex:flex-default", "addGroup", "layout", "settingsJumpMenu", ...SETTINGS_ITEM_IDS,
];

/** Stored form (07 §1.6): [{type:"item", id} | {type:"flex", id, weight:1}]; legacy plain strings allowed. */
export function parseStoredLayout(raw) {
  if (!Array.isArray(raw)) return null;
  return raw.map((entry) => {
    if (typeof entry === "string") return entry === "flex" ? "flex" : entry;
    if (entry && typeof entry === "object") {
      if (entry.type === "flex") return `flex:${typeof entry.id === "string" && entry.id ? entry.id : "flex"}`;
      if (entry.type === "item" && typeof entry.id === "string") return entry.id;
    }
    return null;
  }).filter(Boolean);
}

export function serializeLayout(layout) {
  return layout.map((id) => (isFlex(id) ? { type: "flex", id: id === "flex" ? "flex" : id.slice(5), weight: 1 } : { type: "item", id }));
}

export const BASE_CATALOG = new Set([...DEFAULT_LAYOUT.filter((id) => !id.startsWith("flex"))]);

export const isFlex = (id) => id === "flex" || id.startsWith("flex:");

/**
 * Normalizes a stored layout: drops unknown ids and duplicates, gives every flexible space a
 * unique id, re-inserts required items and missing settings shortcuts.
 */
export function normalizeLayout(raw, catalog = BASE_CATALOG) {
  const parsed = parseStoredLayout(raw);
  const source = parsed && parsed.length ? parsed : DEFAULT_LAYOUT;
  const out = [];
  const seen = new Set();
  let flexCount = 0;
  for (const value of source) {
    if (typeof value !== "string") continue;
    if (isFlex(value)) {
      let id = value === "flex" ? `flex:${++flexCount}` : value;
      while (seen.has(id)) id = `flex:${++flexCount}`;
      seen.add(id);
      out.push(id);
      continue;
    }
    if (!catalog.has(value) || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  if (!seen.has("settings")) {
    const at = out.indexOf("brand");
    out.splice(at >= 0 ? at + 1 : 0, 0, "settings");
    seen.add("settings");
  }
  for (const id of REQUIRED_ITEMS) {
    if (seen.has(id)) continue;
    out.push(id);
    seen.add(id);
  }
  const missingSettings = SETTINGS_ITEM_IDS.filter((id) => catalog.has(id) && !seen.has(id));
  if (missingSettings.length) {
    const jump = out.indexOf("settingsJumpMenu");
    out.splice(jump + 1, 0, ...missingSettings);
  }
  return out;
}

/** Splits a layout at settingsJumpMenu: visible items (incl. the menu) and collapsed items. */
export function splitLayout(layout) {
  const at = layout.indexOf("settingsJumpMenu");
  if (at < 0) return { visible: layout, collapsed: [] };
  return { visible: layout.slice(0, at + 1), collapsed: layout.slice(at + 1) };
}
