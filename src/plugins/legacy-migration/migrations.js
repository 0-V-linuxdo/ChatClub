// Every one-off fix-up of data saved by older builds (v2 07 §2), in one place. Each entry owns a
// marker and runs while that marker is below `version`; `fn` gets the owning plugin's settings.

import { GROUP_BUTTON_ORDER, CONTEXT_MENU_ORDER } from "../workspace/index.js";
import { parseStoredLayout, serializeLayout } from "../topbar-api/layout.js";
import {
  DEFAULT_MODEL, DEFAULT_PROFILE_ID, PROMOTION_CHANNELS, PROMOTION_CHANNELS_VERSION,
  normalizeProfiles, isUntouchedDefault, legacyProfiles,
} from "../api-profiles/model.js";

// The two default placements shipped by older builds.
const LEGACY_FULLSCREEN_PINNED = { addApp: "pinned", reload: "pinned", messageNavigator: "pinned", deleteThread: "pinned", fullscreen: "pinned", openInNewTab: "menu", copyLink: "menu", removeGroup: "menu", more: "pinned" };
const LEGACY_HOME_PINNED = { addApp: "pinned", newChat: "pinned", refreshPage: "pinned", reload: "pinned", messageNavigator: "pinned", deleteThread: "pinned", fullscreen: "menu", openInNewTab: "menu", copyLink: "menu", removeGroup: "menu", more: "pinned" };

const topbarInsert = (marker, id, after) => ({
  marker, version: true, owner: "TopbarAPI",
  // Older saved layouts lack some buttons; add each once, next to its default neighbour.
  fn(s) {
    const stored = parseStoredLayout(s.topbarLayout);
    if (!stored || !stored.length || stored.includes(id)) return;
    const at = stored.indexOf(after);
    stored.splice(at < 0 ? stored.length : at + 1, 0, id);
    s.topbarLayout = serializeLayout(stored);
  },
});

export const MIGRATIONS = [
  topbarInsert("topbarDeleteThreadMigrated", "deleteThread", "newChat"),
  topbarInsert("topbarSearchMigrated", "search", "settings"),
  topbarInsert("topbarShareMigrated", "share", "summary"),
  topbarInsert("topbarHistoryMigrated", "history", "pocket"),
  {
    // The old default was 15 px.
    marker: "topbarPromptInputFontSizeMigrationVersion", version: 1, owner: "Composer",
    fn(s) {
      if (Number(s.topbarPromptInputFontSize) === 15) s.topbarPromptInputFontSize = 16;
    },
  },
  {
    marker: "tabGroupButtonOrderMigrationVersion", version: 1, owner: "Workspace",
    fn(s, { stored, own }) {
      const savedPlacement = stored("tabGroupButtonPlacement");
      const saved = savedPlacement && typeof savedPlacement === "object" ? { ...savedPlacement } : null;
      if (own.tabGroupButtonsMode === "hidden") {
        const placement = { ...(s.tabGroupButtonPlacement ?? {}) };
        for (const id of GROUP_BUTTON_ORDER) if (!(id in placement)) placement[id] = "menu";
        s.tabGroupButtonPlacement = placement;
      }
      // A placement equal to one of the two old default sets moves reload (and fullscreen) into More.
      if (saved) {
        const matches = (set) => Object.entries(set).every(([id, value]) => id === "more" || saved[id] === value);
        const next = { ...(s.tabGroupButtonPlacement ?? {}) };
        if (matches(LEGACY_FULLSCREEN_PINNED)) {
          next.fullscreen = "menu";
          next.reload = "menu";
          s.tabGroupButtonPlacement = next;
        } else if (matches(LEGACY_HOME_PINNED)) {
          next.reload = "menu";
          s.tabGroupButtonPlacement = next;
        }
      }
      if (stored("tabContextMenuOrder") === undefined && Array.isArray(stored("tabGroupButtonOrder"))) {
        const fromGroup = stored("tabGroupButtonOrder").filter((id) => id !== "removeGroup" && id !== "more" && CONTEXT_MENU_ORDER.includes(id));
        s.tabContextMenuOrder = [...fromGroup, ...CONTEXT_MENU_ORDER.filter((id) => !fromGroup.includes(id))];
      }
    },
  },
  {
    marker: "apiProfileDefaultModelMigrationVersion", version: 1, owner: "ApiProfiles",
    fn(s) {
      const list = normalizeProfiles(s.apiProfiles);
      const def = list.find((p) => p.id === DEFAULT_PROFILE_ID);
      if (def && isUntouchedDefault(def) && def.model === "gpt-3.5-turbo") {
        s.apiProfiles = normalizeProfiles(list.map((p) => (p === def ? { ...p, model: DEFAULT_MODEL, models: [DEFAULT_MODEL, ...p.models.filter((m) => m !== "gpt-3.5-turbo" && m !== DEFAULT_MODEL)] } : p)));
      }
    },
  },
  {
    // Old builds kept one endpoint per feature at the top level; turn them into profiles once.
    marker: null, owner: "ApiProfiles",
    fn(s, { stored, own }) {
      if (Array.isArray(stored("apiProfiles"))) return;
      const legacy = legacyProfiles(own);
      if (!legacy.length) return;
      const list = normalizeProfiles(s.apiProfiles);
      const assignments = { ...(s.legacyAssignments ?? {}) };
      for (const { feature, profile } of legacy) {
        if (!list.some((p) => p.id === profile.id)) list.push(profile);
        assignments[feature] = profile.id;
      }
      s.apiProfiles = normalizeProfiles(list);
      s.legacyAssignments = assignments;
    },
  },
  {
    marker: "apiPromotionChannelsVersion", version: PROMOTION_CHANNELS_VERSION, owner: "ApiProfiles",
    fn(s) {
      const list = normalizeProfiles(s.apiProfiles);
      for (const channel of PROMOTION_CHANNELS) if (!list.some((p) => p.id === channel.id)) list.push(channel);
      s.apiProfiles = normalizeProfiles(list);
    },
  },
];
