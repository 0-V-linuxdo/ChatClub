// definePlugin (spec §5): type marker plus minimal field validation. Returns the object unchanged.

export const TAGS = Object.freeze([
  "workspace",
  "composer",
  "messages",
  "chats",
  "capture",
  "navigation",
  "notifications",
  "appearance",
  "data",
  "sites",
  "privacy",
  "developer",
]);

export const START_PHASES = Object.freeze(["init", "domReady", "workspaceReady"]);

const NAME_PATTERN = /^[A-Z][A-Za-z0-9]*$/;

export function definePlugin(def) {
  if (!def || typeof def !== "object") throw new TypeError("definePlugin expects an object");
  if (typeof def.name !== "string" || !NAME_PATTERN.test(def.name)) {
    throw new TypeError(`Plugin name must be PascalCase, got ${JSON.stringify(def.name)}`);
  }
  if (def.description === undefined || def.description === null) throw new TypeError(`${def.name}: description is required`);
  if (!Array.isArray(def.authors)) throw new TypeError(`${def.name}: authors must be an array`);
  if (def.tags) {
    for (const tag of def.tags) if (!TAGS.includes(tag)) throw new TypeError(`${def.name}: unknown tag "${tag}"`);
  }
  if (def.startAt && !START_PHASES.includes(def.startAt)) throw new TypeError(`${def.name}: unknown startAt "${def.startAt}"`);
  if (def.content) {
    if (!Array.isArray(def.content)) throw new TypeError(`${def.name}: content must be an array`);
    for (const cap of def.content) {
      if (!cap.id || !cap.bundle) throw new TypeError(`${def.name}: content capability needs id and bundle`);
    }
  }
  return def;
}
