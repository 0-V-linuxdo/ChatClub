// LegacyMigration: runs MIGRATIONS once at startup, before the plugins that own the data start.

import { MIGRATIONS } from "./migrations.js";

export default {
  start(ctx) {
    const settings = ctx.host.settings;
    const stored = (key) => settings.optionsBag?.data?.[key];
    for (const { marker, version, owner, fn } of MIGRATIONS) {
      const target = settings.defined.get(owner)?.store;
      if (!target) continue;
      if (marker) {
        const current = ctx.settings[marker];
        if (version === true ? current === true : Number(current) >= version) continue;
      }
      try {
        fn(target, { stored, own: ctx.settings });
      } catch (error) {
        ctx.logger.error(`Legacy migration "${marker ?? owner}" failed:`, error);
        continue;
      }
      if (marker) ctx.settings[marker] = version;
    }
  },
};
