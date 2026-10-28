import * as ui from "../../lib/ui.js";
// Translation service: merges every registered plugin's `strings` and resolves the active language.

/** Stored values are system / en / zh_CN (06 §1.5); "auto" and "zh" from early 2.0 builds are aliases. */
export const LANGUAGE_ALIASES = { auto: "system", zh: "zh_CN" };

export function resolveLanguage(setting, browserLang = globalThis.navigator?.language || "en") {
  const value = LANGUAGE_ALIASES[setting] ?? setting;
  if (value === "zh_CN") return "zh";
  if (value === "en") return "en";
  return String(browserLang).toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function formatTemplate(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (vars[name] === undefined ? match : String(vars[name])));
}

export default {
  start(ctx) {
    ctx.contribute("appearance.field", {
      id: "I18n:language",
      group: "Appearance:general",
      order: 40,
      render(container) {
        container.append(ui.field({
          label: ctx.t("appearance.language"),
          control: ui.select({
            value: ctx.settings.language,
            options: ["system", "zh_CN", "en"].map((v) => ({ value: v, label: ctx.t(`i18n.language.${v}`) })),
            onChange: (v) => (ctx.settings.language = v),
          }),
        }));
      },
    });
    const host = ctx.host;
    if (LANGUAGE_ALIASES[ctx.settings.language]) ctx.settings.language = LANGUAGE_ALIASES[ctx.settings.language];
    let tables = null;
    const build = () => {
      tables = { zh: {}, en: {} };
      for (const name of host.order) {
        const strings = host.plugins[name].strings;
        if (!strings) continue;
        Object.assign(tables.zh, strings.zh);
        Object.assign(tables.en, strings.en);
      }
    };
    let lang = resolveLanguage(ctx.settings.language);
    const apply = () => {
      document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    };
    const service = {
      get lang() {
        return lang;
      },
      t(key, vars) {
        if (!tables) build();
        const k = String(key);
        const text = tables[lang][k] ?? tables[lang === "zh" ? "en" : "zh"][k] ?? k;
        return formatTemplate(text, vars);
      },
      has(key) {
        if (!tables) build();
        return key in tables[lang] || key in tables[lang === "zh" ? "en" : "zh"];
      },
      formatDate(value, options = { dateStyle: "medium", timeStyle: "short" }) {
        try {
          return new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en", options).format(new Date(value));
        } catch {
          return String(value);
        }
      },
      formatNumber(value, options) {
        return new Intl.NumberFormat(lang === "zh" ? "zh-CN" : "en", options).format(value);
      },
      invalidate() {
        tables = null;
      },
    };
    ctx.services.provide("i18n", service);
    apply();
    const off = ctx.plugin.settings.use(["language"], () => {
      const next = resolveLanguage(ctx.settings.language);
      if (next === lang) return;
      lang = next;
      apply();
      ctx.events.emit("I18n:languageChanged", { lang });
    });
    ctx.onDispose(off);
  },
};
