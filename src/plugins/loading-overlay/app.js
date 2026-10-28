// LoadingOverlay: tints loading chat columns in the dark theme; the opacity is a CSS variable.

import { renderSettingsFields } from "../../lib/settings-form.js";

export default {
  start(ctx) {
    const root = document.documentElement;
    const apply = () => root.style.setProperty("--overlay-opacity", `${Number(ctx.settings.frameLoadingOverlayOpacity ?? 82)}%`);
    apply();
    ctx.onDispose(ctx.plugin.settings.use(["frameLoadingOverlayOpacity"], apply));
    ctx.onDispose(() => root.style.removeProperty("--overlay-opacity"));

    ctx.contribute("appearance.field", {
      id: "LoadingOverlay:opacity",
      group: "Appearance:overlay",
      order: 0,
      render(container, gctx) {
        const rows = renderSettingsFields(ctx.host, ctx.plugin, { keys: ["frameLoadingOverlayOpacity"] });
        if (rows.dispose) gctx.onDispose(rows.dispose);
        container.append(...rows);
      },
    });
  },
};
