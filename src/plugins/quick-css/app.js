// QuickCSS: one live-updating style backed by Settings.customCSS (spec v1.2 §12.4).

import { h } from "../../lib/dom.js";
import * as ui from "../../lib/ui.js";

export default {
  start(ctx) {
    const meta = ctx.host.meta;
    const t = ctx.t;
    const apply = () => {
      ctx.styles.register("custom", meta.customCSS ?? "");
      if (meta.customCSSEnabled === false) ctx.styles.disable("custom");
    };
    apply();
    ctx.onDispose(ctx.host.plugins.Settings.settings.use(["customCSS", "customCSSEnabled"], apply));

    // Its own section next to Plugins, like the Quick CSS tab of Void++.
    ctx.contribute("settings.section", {
      id: "quickCss",
      titleKey: "quickcss.card",
      descKey: "plugin.QuickCSS.description",
      icon: "code",
      order: -980,
      group: "plugins",
      topbarItem: false,
      render(container) {
        const area = ui.textArea({ value: meta.customCSS ?? "", mono: true, rows: 12, placeholder: t("quickcss.placeholder"), onInput: (v) => (meta.customCSS = v) });
        area.disabled = meta.customCSSEnabled === false;
        const toggle = ui.toggleSwitch({ checked: meta.customCSSEnabled !== false, onChange: (on) => {
          meta.customCSSEnabled = on;
          area.disabled = !on;
        } });
        container.append(ui.field({ label: t("quickcss.enabled"), desc: t("quickcss.enabled.desc"), control: toggle }), h("div", { style: { paddingTop: "16px" } }, area));
      },
    });
  },
};
