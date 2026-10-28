// SettingsShortcuts: one top bar item per settings section, so a section opens in one click.

const sectionItemId = (id) => `settings${id.charAt(0).toUpperCase()}${id.slice(1)}`;

export default {
  start(ctx) {
    const sections = ctx.extensionPoint("settings.section");
    const sectionItems = new Map();
    const syncSectionItems = () => {
      const ids = new Set();
      for (const entry of sections.sorted()) {
        if (entry.topbarItem === false) continue;
        const itemId = sectionItemId(entry.id);
        ids.add(itemId);
        if (sectionItems.get(itemId)?.entry === entry) continue;
        sectionItems.get(itemId)?.off();
        const off = ctx.contribute("topbar.item", {
          id: itemId,
          labelKey: entry.titleKey,
          icon: entry.icon ?? "settings",
          tipId: `topbar.settings.${entry.id}`,
          onClick: () => ctx.services.get("settingsUI")?.open(entry.id),
        });
        sectionItems.set(itemId, { entry, off });
      }
      for (const [itemId, rec] of sectionItems) {
        if (ids.has(itemId)) continue;
        rec.off();
        sectionItems.delete(itemId);
      }
    };
    ctx.onDispose(sections.subscribe(syncSectionItems));
    syncSectionItems();
  },
};
