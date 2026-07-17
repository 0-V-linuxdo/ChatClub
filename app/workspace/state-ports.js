import { readonlyStateValue } from "../state/port.js";

const OWNER_ACCESS = Object.freeze({
  drag: Object.freeze({ read: ["activeTabs", "groups"], write: ["activeTabs", "groups"] }),
  frame: Object.freeze({
    read: ["activeTabs", "frameLoadingInstanceIds", "fullscreenGroupId", "groups", "options"],
    write: ["activeTabs", "frameLoadingInstanceIds", "fullscreenGroupId", "groups"]
  }),
  layout: Object.freeze({
    read: ["activeTabs", "customConfig", "frameLoadingInstanceIds", "fullscreenGroupId", "groups", "options", "temporaryLayoutPreset"],
    write: ["activeTabs", "frameLoadingInstanceIds", "fullscreenGroupId", "groups", "options", "temporaryLayoutPreset"]
  }),
  messageNavigator: Object.freeze({ read: ["groups", "options"], write: [] }),
  pocket: Object.freeze({
    read: ["activeTabs", "fullscreenGroupId", "groups", "options", "temporaryLayoutPreset"],
    write: ["activeTabs", "fullscreenGroupId", "groups", "temporaryLayoutPreset"]
  }),
  render: Object.freeze({
    read: ["activeTabs", "customConfig", "frameLoadingInstanceIds", "fullscreenGroupId", "groups", "options"],
    write: ["activeTabs"]
  }),
  session: Object.freeze({
    read: ["activeTabs", "fullscreenGroupId", "groups", "options", "temporaryLayoutPreset"],
    write: ["activeTabs", "fullscreenGroupId", "groups", "options", "temporaryLayoutPreset"]
  })
});

function createOwnerPort(state, owner, access) {
  const readable = new Set(access.read);
  const writable = new Set(access.write);
  const readonlyCache = new WeakMap();
  return new Proxy(Object.create(null), {
    get(_target, key) {
      if (!readable.has(key)) throw new TypeError(`workspace.${owner} cannot read workspace state.${String(key)}`);
      const value = state[key];
      return writable.has(key)
        ? value
        : readonlyStateValue(value, `workspace.${owner}`, key, readonlyCache, "workspace state");
    },
    set(_target, key, value) {
      if (!writable.has(key)) throw new TypeError(`workspace.${owner} cannot mutate workspace state.${String(key)}`);
      state[key] = value;
      return true;
    },
    has(_target, key) {
      return readable.has(key);
    },
    ownKeys() {
      return [...readable];
    },
    getOwnPropertyDescriptor(_target, key) {
      return readable.has(key) ? { enumerable: true, configurable: true } : undefined;
    }
  });
}

export function createWorkspaceOwnerStatePorts(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new TypeError("Workspace owner state ports require the Workspace state port.");
  }
  return Object.freeze(Object.fromEntries(Object.entries(OWNER_ACCESS)
    .map(([owner, access]) => [owner, createOwnerPort(state, owner, access)])));
}
