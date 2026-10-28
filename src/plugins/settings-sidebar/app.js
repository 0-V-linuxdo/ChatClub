// SettingsSidebar: reorders and hides settings sidebar entries through `settings.navLayout`.

import { applyLayout } from "./layout.js";
import { setEditorContext } from "./editor.js";

export default {
  start(ctx) {
    setEditorContext(ctx);
    ctx.onDispose(() => setEditorContext(null));
    // Re-contributing under the same id replaces the entry and makes SettingsUI redraw its sidebar.
    const contribute = () => ctx.contribute("settings.navLayout", {
      id: "SettingsSidebar",
      apply: (entries) => applyLayout(entries, ctx.settings.navLayout),
    });
    contribute();
    ctx.onDispose(ctx.plugin.settings.use(["navLayout"], contribute));
  },
};
