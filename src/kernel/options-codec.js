// Stored shape of `options` (v2 07 §1.5, optionsSchemaVersion 4) and the site-script migration (07 §2).
// In memory each site-config list is one array: custom entries plus sparse overrides of built-ins
// (`{ id, builtIn: true, ...changed }`) in the user's order. On disk the array keeps only custom entries;
// built-in overrides go to `officialOverrides["<feature>/<id>"]` and the mixed order to `officialOrders`.

export const OPTIONS_SCHEMA_VERSION = 4;
export const SCRIPT_CONFIG_SCHEMA_VERSION = 3;

export const SITE_CONFIG_FEATURES = {
  summary: { key: "summarySiteConfigs", scriptType: "summary", scriptField: "customUserscript" },
  messageNavigator: { key: "messageNavigatorSiteConfigs" },
  delete: { key: "topicDeleteSiteConfigs", scriptType: "topic-delete", scriptField: "script" },
};

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const isCustom = (c, spec) => c.builtIn === false || c.sourceMode === "custom" || !!c.customUserscript || !!c.userscriptOverride || (spec.scriptField === "script" && !!c.script);

/** Old entries carried `userscript` inline (scriptConfigSchemaVersion < 3). */
function migrateScript(c, spec) {
  if (typeof c.userscript !== "string") return c;
  const { userscript, ...rest } = c;
  const marked = rest.builtIn === false || rest.sourceMode === "custom" || !!rest.userscriptOverride;
  // Unmarked built-in entries held a copy of the bundled script: the bundled one wins, the copy goes.
  if (!marked || !userscript.trim() || !spec.scriptField) return rest.builtIn === false ? rest : { ...rest, sourceMode: rest.sourceMode === "custom" ? "custom" : "builtIn" };
  const out = { ...rest, sourceMode: "custom" };
  if (spec.scriptField === "script") out.script = userscript;
  else {
    out.customUserscript = userscript;
    if (out.builtIn !== false) out.userscriptOverride = true;
  }
  return out;
}

/** Disk → memory. Accepts v4 data, older inline lists, and old inline scripts. */
export function decodeOptions(stored) {
  if (!isObj(stored)) return stored;
  const data = { ...stored };
  const v4 = data.optionsSchemaVersion === OPTIONS_SCHEMA_VERSION || isObj(data.officialOrders) || isObj(data.officialOverrides);
  const scriptsOld = !(Number(data.scriptConfigSchemaVersion) >= SCRIPT_CONFIG_SCHEMA_VERSION);
  const orders = isObj(data.officialOrders) ? data.officialOrders : {};
  const overrides = isObj(data.officialOverrides) ? data.officialOverrides : {};
  for (const [feature, spec] of Object.entries(SITE_CONFIG_FEATURES)) {
    let list = Array.isArray(data[spec.key]) ? data[spec.key].filter((c) => isObj(c) && c.id) : null;
    if (list && scriptsOld) list = list.map((c) => migrateScript(c, spec));
    if (list && spec.scriptField === "script") {
      // On disk a delete script lives in customUserscript (07 §1.5); in memory it is `script`.
      list = list.map(({ customUserscript, scriptType, ...c }) => (void scriptType, customUserscript && !c.script ? { ...c, script: customUserscript } : c));
    }
    if (!v4) {
      if (list) data[spec.key] = list;
      continue;
    }
    const customs = new Map((list ?? []).map((c) => [c.id, c]));
    const out = [];
    const seen = new Set();
    const addBuiltin = (id) => {
      if (seen.has(`b:${id}`)) return;
      seen.add(`b:${id}`);
      if (customs.has(id)) return; // a custom entry with this id replaces the built-in
      const o = overrides[`${feature}/${id}`];
      out.push({ ...(isObj(o) ? o : {}), id, builtIn: true });
    };
    const addCustom = (id) => {
      if (seen.has(`c:${id}`) || !customs.has(id)) return;
      seen.add(`c:${id}`);
      out.push(customs.get(id));
    };
    for (const key of Array.isArray(orders[feature]) ? orders[feature] : []) {
      if (typeof key !== "string") continue;
      if (key.startsWith(`custom/${feature}/`)) addCustom(key.slice(`custom/${feature}/`.length));
      else if (key.startsWith(`${feature}/`)) addBuiltin(key.slice(feature.length + 1));
    }
    for (const id of customs.keys()) addCustom(id);
    for (const key of Object.keys(overrides)) if (key.startsWith(`${feature}/`)) addBuiltin(key.slice(feature.length + 1));
    if (out.length || list) data[spec.key] = out;
  }
  delete data.optionsSchemaVersion;
  delete data.scriptConfigSchemaVersion;
  delete data.officialOrders;
  delete data.officialOverrides;
  return data;
}

/** Memory → disk (v4). */
export function encodeOptions(data) {
  if (!isObj(data)) return data;
  const out = { ...data, optionsSchemaVersion: OPTIONS_SCHEMA_VERSION, scriptConfigSchemaVersion: SCRIPT_CONFIG_SCHEMA_VERSION };
  const orders = {};
  const overrides = {};
  for (const [feature, spec] of Object.entries(SITE_CONFIG_FEATURES)) {
    if (!Array.isArray(data[spec.key])) continue;
    const customs = [];
    const order = [];
    for (const c of data[spec.key]) {
      if (!isObj(c) || !c.id) continue;
      if (isCustom(c, spec)) {
        const entry = { ...c, sourceMode: "custom" };
        if (spec.scriptField === "script") {
          delete entry.script;
          if (c.script) entry.customUserscript = c.script;
        }
        if (spec.scriptType && entry.customUserscript) entry.scriptType = spec.scriptType;
        customs.push(entry);
        order.push(`custom/${feature}/${c.id}`);
      } else {
        const { id, builtIn, ...diff } = c;
        void builtIn;
        if (Object.keys(diff).length) overrides[`${feature}/${id}`] = diff;
        order.push(`${feature}/${id}`);
      }
    }
    out[spec.key] = customs;
    if (order.length) orders[feature] = order;
  }
  out.officialOrders = orders;
  out.officialOverrides = overrides;
  return out;
}
