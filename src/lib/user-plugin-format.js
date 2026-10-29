// User plugin files: a plain script with a metadata header, run in the sandbox page (UserPlugins).
//
//   // ==ChatClubPlugin==
//   // @name         WordCount
//   // @description  Shows the length of the draft.
//   // @version      1.0.0
//   // @author       Someone
//   // @icon         hash
//   // @grant        composer
//   // @grant        ui
//   // ==/ChatClubPlugin==

/** Abilities a plugin can ask for; storage, logging and toasts are always available. */
export const GRANTS = Object.freeze(["css", "ui", "composer", "workspace", "events", "network"]);

const NAME_PATTERN = /^[A-Z][A-Za-z0-9]{1,47}$/;
const MAX_CODE_BYTES = 512 * 1024;

/**
 * Parses the header. Returns { meta, errors }: meta holds name, description ({zh, en}), version,
 * author, icon, homepage and grants; errors is a list of { key, value } for the UI to translate.
 */
export function parsePluginFile(code) {
  const errors = [];
  const text = String(code ?? "");
  if (new Blob([text]).size > MAX_CODE_BYTES) errors.push({ key: "userPlugins.err.tooBig", value: "512 KB" });
  const block = /\/\/\s*==ChatClubPlugin==([\s\S]*?)\/\/\s*==\/ChatClubPlugin==/.exec(text);
  if (!block) return { meta: null, errors: [...errors, { key: "userPlugins.err.noHeader" }] };
  const meta = { name: "", description: { zh: "", en: "" }, version: "", author: "", icon: "", homepage: "", grants: [] };
  for (const line of block[1].split(/\r?\n/)) {
    const m = /^\s*\/\/\s*@([\w:-]+)\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    const [, rawKey, value] = m;
    const [key, lang] = rawKey.split(":");
    if (key === "name") meta.name = value;
    else if (key === "description") {
      if (lang === "zh" || lang === "zh-CN" || lang === "zh_CN") meta.description.zh = value;
      else if (lang === "en") meta.description.en = value;
      else {
        meta.description.zh ||= value;
        meta.description.en ||= value;
      }
    } else if (key === "version") meta.version = value;
    else if (key === "author") meta.author = value;
    else if (key === "icon") meta.icon = value;
    else if (key === "homepage") meta.homepage = value;
    else if (key === "grant") {
      for (const g of value.split(/[\s,]+/).filter(Boolean)) {
        if (!GRANTS.includes(g)) errors.push({ key: "userPlugins.err.badGrant", value: g });
        else if (!meta.grants.includes(g)) meta.grants.push(g);
      }
    }
  }
  if (!meta.name) errors.push({ key: "userPlugins.err.noName" });
  else if (!NAME_PATTERN.test(meta.name)) errors.push({ key: "userPlugins.err.badName", value: meta.name });
  if (!meta.description.zh && !meta.description.en) errors.push({ key: "userPlugins.err.noDescription" });
  return { meta, errors };
}
