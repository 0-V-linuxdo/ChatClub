#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const constantsSource = fs.readFileSync(path.join(root, "shared/constants.js"), "utf8");
const shortcutsSource = fs.readFileSync(path.join(root, "shared/shortcuts.js"), "utf8");
const storageSource = fs.readFileSync(path.join(root, "shared/storage.js"), "utf8");
const postMessageSource = fs.readFileSync(path.join(root, "shared/post-message.js"), "utf8");
const mainSource = fs.readFileSync(path.join(root, "app/main.js"), "utf8");
const contentSource = fs.readFileSync(path.join(root, "content/content.js"), "utf8");
const summaryRuntimeSource = fs.readFileSync(path.join(root, "content/summary-userscripts-main.js"), "utf8");

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function balancedLiteral(source, name, openingCharacter) {
  const declaration = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*`, "g");
  const match = declaration.exec(source);
  assert.ok(match, `${name} must exist`);
  const start = match.index + match[0].length;
  const closingCharacter = openingCharacter === "{" ? "}" : "]";
  assert.equal(source[start], openingCharacter, `${name} must be an inline ${openingCharacter}${closingCharacter} literal`);

  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === openingCharacter) depth += 1;
    else if (character === closingCharacter) {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`${name} literal did not close`);
}

function evaluateLiteral(source, name, openingCharacter, context = {}) {
  return vm.runInNewContext(`(${balancedLiteral(source, name, openingCharacter)})`, context);
}

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const signatureEnd = source.indexOf(") {", start);
  const bodyStart = signatureEnd < 0 ? -1 : signatureEnd + 2;
  assert.notEqual(bodyStart, -1, `${name} must have a body`);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`${name} body did not close`);
}

function loadShortcutModule(defaultConfig) {
  const exportNames = Array.from(
    shortcutsSource.matchAll(/export\s+(?:const|function)\s+([A-Za-z_$][\w$]*)/g),
    (match) => match[1]
  );
  assert.ok(exportNames.length > 0, "shared/shortcuts.js must expose its public API");
  const transformed = shortcutsSource
    .replace(
      /^import\s+\{\s*DEFAULT_SHORTCUT_CONFIG\s*\}\s+from\s+"\.\/constants\.js";\s*/,
      "const DEFAULT_SHORTCUT_CONFIG = globalThis.__DEFAULT_SHORTCUT_CONFIG;\n"
    )
    .replace(/\bexport\s+(?=(?:const|function)\b)/g, "");
  const context = vm.createContext({ __DEFAULT_SHORTCUT_CONFIG: plain(defaultConfig) });
  vm.runInContext(
    `${transformed}\n;globalThis.__shortcutExports = { ${exportNames.join(", ")} };`,
    context,
    { filename: "shared/shortcuts.js" }
  );
  return context.__shortcutExports;
}

function event(overrides = {}) {
  return {
    key: "",
    code: "",
    keyCode: 0,
    isComposing: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides
  };
}

function isolatedShortcutConfig(shortcuts, platform) {
  const config = shortcuts.defaultShortcutConfig();
  const profile = shortcuts.defaultShortcutProfile(platform);
  for (const action of shortcuts.ALL_SHORTCUT_ACTIONS) {
    profile.shortcuts[action] = { ...profile.shortcuts[action], disabled: true };
  }
  return {
    config,
    profile,
    set(action, value) {
      profile.shortcuts[action] = {
        ...profile.shortcuts[action],
        ...value,
        disabled: Boolean(value.disabled)
      };
      return this;
    },
    build() {
      return shortcuts.replaceShortcutProfile(config, platform, profile);
    }
  };
}

function assertNoProperty(value, forbidden, label) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.notEqual(key, forbidden, `${label} must not contain canonical ${forbidden} fields`);
    assertNoProperty(child, forbidden, label);
  }
}

const sharedDefault = evaluateLiteral(constantsSource, "DEFAULT_SHORTCUT_CONFIG", "{");
const shortcuts = loadShortcutModule(sharedDefault);

// Legacy storage must migrate once into independent canonical profiles without
// losing customized keys, disabled states, digit shortcuts, or send behavior.
const legacy = {
  sendKeyMode: "mod-enter",
  shortcuts: {
    focusInput: { disabled: true, alt: false, shift: true, cmdOrCtrl: true, code: "KeyJ" },
    newChat: { disabled: false, alt: true, shift: false, cmdOrCtrl: false, code: "KeyN" },
    deleteThread: { disabled: false, alt: false, shift: true, cmdOrCtrl: true, code: "Backspace" },
    reloadChat: { disabled: false, alt: false, shift: false, cmdOrCtrl: true, code: "KeyR" },
    openSummary: { disabled: false, alt: true, shift: true, cmdOrCtrl: false, code: "KeyY" },
    insertPrompt: { disabled: true, alt: false, shift: true, cmdOrCtrl: true, codePattern: "Digit" }
  }
};
const legacySnapshot = plain(legacy);
const migrated = shortcuts.normalizeShortcutConfig(legacy);
assert.deepEqual(legacy, legacySnapshot, "migration must not mutate stored v1 input");
assert.equal(migrated.schemaVersion, 2);
assert.equal(migrated.profiles.mac.sendKeyMode, "mod-enter");
assert.equal(migrated.profiles.windows.sendKeyMode, "mod-enter");
assert.deepEqual(plain(migrated.profiles.mac.shortcuts.focusInput), {
  disabled: true,
  command: true,
  control: false,
  option: false,
  shift: true,
  code: "KeyJ"
});
assert.deepEqual(plain(migrated.profiles.windows.shortcuts.focusInput), {
  disabled: true,
  control: true,
  alt: false,
  shift: true,
  code: "KeyJ"
});
assert.equal(migrated.profiles.mac.shortcuts.openSummaryPanel.code, "KeyY", "legacy Summary alias must survive");
assert.equal(migrated.profiles.windows.shortcuts.openSummaryPanel.shift, true);
assert.equal(migrated.profiles.mac.shortcuts.insertPrompt.disabled, true);
assert.equal(migrated.profiles.mac.shortcuts.insertPrompt.command, true);
assert.equal(migrated.profiles.windows.shortcuts.insertPrompt.control, true);
assert.equal(migrated.profiles.mac.shortcuts.insertPrompt.codePattern, "Digit");
assert.deepEqual(
  plain(migrated.profiles.mac.shortcuts.newChat),
  { disabled: false, command: true, control: false, option: false, shift: false, code: "KeyN" },
  "the historical Option+N default must migrate before v2 conversion"
);
assert.deepEqual(
  plain(migrated.profiles.mac.shortcuts.deleteThread),
  { disabled: false, command: false, control: false, option: true, shift: true, code: "KeyD" },
  "the historical Kagi-conflicting delete shortcut must migrate before v2 conversion"
);
assert.equal(migrated.profiles.mac.shortcuts.reloadChat.code, "KeyH", "historical home defaults must migrate to H");
assert.deepEqual(
  plain(shortcuts.normalizeShortcutConfig(migrated)),
  plain(migrated),
  "v2 normalization must be idempotent"
);
assertNoProperty(migrated, "cmdOrCtrl", "migrated v2 config");

const canonicalWithLegacyNoise = shortcuts.normalizeShortcutConfig({
  schemaVersion: 2,
  profiles: {
    mac: {
      sendKeyMode: "enter",
      shortcuts: { focusInput: { command: false, control: true, option: false, shift: false, cmdOrCtrl: true, code: "KeyQ" } }
    },
    windows: {
      sendKeyMode: "enter",
      shortcuts: { focusInput: { control: false, alt: true, shift: false, cmdOrCtrl: true, code: "KeyW" } }
    }
  }
});
assert.equal(canonicalWithLegacyNoise.profiles.mac.shortcuts.focusInput.command, false);
assert.equal(canonicalWithLegacyNoise.profiles.mac.shortcuts.focusInput.control, true);
assert.equal(canonicalWithLegacyNoise.profiles.windows.shortcuts.focusInput.control, false);
assertNoProperty(canonicalWithLegacyNoise, "cmdOrCtrl", "normalized v2 config");

// Replacing or resetting one platform profile must preserve the other profile.
const baseConfig = shortcuts.defaultShortcutConfig();
const windowsBefore = plain(shortcuts.shortcutProfile(baseConfig, "windows"));
const changedMac = shortcuts.defaultShortcutProfile("mac");
changedMac.sendKeyMode = "mod-enter";
changedMac.shortcuts.focusInput = {
  ...changedMac.shortcuts.focusInput,
  command: false,
  control: true,
  option: false,
  code: "KeyQ"
};
const withChangedMac = shortcuts.replaceShortcutProfile(baseConfig, "mac", changedMac);
assert.deepEqual(plain(shortcuts.shortcutProfile(withChangedMac, "windows")), windowsBefore);
assert.equal(shortcuts.shortcutProfile(withChangedMac, "mac").sendKeyMode, "mod-enter");
assert.equal(shortcuts.shortcutProfile(withChangedMac, "mac").shortcuts.focusInput.code, "KeyQ");
const resetMac = shortcuts.replaceShortcutProfile(withChangedMac, "mac", shortcuts.defaultShortcutProfile("mac"));
assert.deepEqual(plain(shortcuts.shortcutProfile(resetMac, "windows")), windowsBefore);
assert.deepEqual(plain(shortcuts.shortcutProfile(resetMac, "mac")), plain(shortcuts.defaultShortcutProfile("mac")));

assert.equal(shortcuts.detectKeyboardPlatform({ platform: "MacIntel" }), "mac");
assert.equal(shortcuts.detectKeyboardPlatform({ userAgentData: { platform: "Windows" } }), "windows");
assert.equal(shortcuts.detectKeyboardPlatform({ platform: "Linux x86_64" }), "windows");

// Matching is exact: Command and Control are distinct on Mac, Meta is never a
// Windows shortcut, and unexpected modifiers cannot partially match.
assert.deepEqual(
  plain(shortcuts.matchShortcut(event({ code: "KeyN", metaKey: true }), baseConfig, "mac")),
  { action: "newChat", matchObj: {} }
);
assert.equal(shortcuts.matchShortcut(event({ code: "KeyN", ctrlKey: true }), baseConfig, "mac"), null);
const macControlConfig = isolatedShortcutConfig(shortcuts, "mac")
  .set("focusInput", { command: false, control: true, option: false, shift: false, code: "KeyK" })
  .build();
assert.equal(shortcuts.matchShortcut(event({ code: "KeyK", ctrlKey: true }), macControlConfig, "mac").action, "focusInput");
assert.equal(shortcuts.matchShortcut(event({ code: "KeyK", metaKey: true }), macControlConfig, "mac"), null);
assert.equal(shortcuts.matchShortcut(event({ code: "KeyK", ctrlKey: true, altKey: true }), macControlConfig, "mac"), null);

assert.deepEqual(
  plain(shortcuts.matchShortcut(event({ code: "KeyN", ctrlKey: true }), baseConfig, "windows")),
  { action: "newChat", matchObj: {} }
);
assert.equal(shortcuts.matchShortcut(event({ code: "KeyN", metaKey: true }), baseConfig, "windows"), null);
assert.equal(shortcuts.matchShortcut(event({ code: "KeyN", ctrlKey: true, altKey: true }), baseConfig, "windows"), null);

assert.deepEqual(
  plain(shortcuts.shortcutFromKeyboardEvent(event({ code: "KeyK", metaKey: true, ctrlKey: true, altKey: true, shiftKey: true }), "focusInput", "mac")),
  { disabled: false, command: true, control: true, option: true, shift: true, code: "KeyK" }
);
assert.deepEqual(
  plain(shortcuts.shortcutFromKeyboardEvent(event({ code: "KeyK", ctrlKey: true, altKey: true, shiftKey: true }), "focusInput", "windows")),
  { disabled: false, control: true, alt: true, shift: true, code: "KeyK" }
);
assert.equal(
  shortcuts.shortcutFromKeyboardEvent(event({ code: "KeyK", metaKey: true }), "focusInput", "windows"),
  null,
  "Windows-key chords must be rejected during recording"
);
assert.equal(shortcuts.shortcutFromKeyboardEvent(event({ code: "ControlLeft", ctrlKey: true }), "focusInput", "windows"), null);

// Fixed shortcuts retain their exact physical code; digit patterns accept both
// number rows and the numpad, but only slots 1-9.
const fixedNumpadConfig = isolatedShortcutConfig(shortcuts, "windows")
  .set("focusInput", { control: false, alt: false, shift: false, code: "Numpad5" })
  .build();
assert.equal(shortcuts.matchShortcut(event({ code: "Numpad5" }), fixedNumpadConfig, "windows").action, "focusInput");
assert.equal(shortcuts.matchShortcut(event({ code: "Digit5" }), fixedNumpadConfig, "windows"), null);

const digitConfig = isolatedShortcutConfig(shortcuts, "mac")
  .set("insertPrompt", { command: false, control: false, option: true, shift: false, codePattern: "Digit" })
  .build();
assert.deepEqual(
  plain(shortcuts.matchShortcut(event({ code: "Digit8", altKey: true }), digitConfig, "mac")),
  { action: "insertPrompt", matchObj: { digit: "8" } }
);
assert.deepEqual(
  plain(shortcuts.matchShortcut(event({ code: "Numpad3", altKey: true }), digitConfig, "mac")),
  { action: "insertPrompt", matchObj: { digit: "3" } }
);
assert.equal(shortcuts.matchShortcut(event({ code: "Digit0", altKey: true }), digitConfig, "mac"), null);
assert.equal(shortcuts.shortcutFromKeyboardEvent(event({ code: "Numpad6", altKey: true }), "insertPrompt", "windows").codePattern, "Digit");
assert.equal(shortcuts.shortcutFromKeyboardEvent(event({ code: "Digit0", altKey: true }), "insertPrompt", "windows"), null);

// Conflict detection is platform-scoped and accounts for both physical digit
// locations covered by a pattern shortcut.
const macConflict = isolatedShortcutConfig(shortcuts, "mac")
  .set("focusInput", { command: true, control: false, option: false, shift: false, code: "KeyK" })
  .set("optimizePrompt", { command: true, control: false, option: false, shift: false, code: "KeyK" })
  .build();
assert.deepEqual(
  Array.from(shortcuts.shortcutConflictActions(macConflict, "mac")).sort(),
  ["focusInput", "optimizePrompt"]
);
const macNoConflict = isolatedShortcutConfig(shortcuts, "mac")
  .set("focusInput", { command: true, control: false, option: false, shift: false, code: "KeyK" })
  .set("optimizePrompt", { command: false, control: true, option: false, shift: false, code: "KeyK" })
  .build();
assert.deepEqual(Array.from(shortcuts.shortcutConflictActions(macNoConflict, "mac")), []);

for (const physicalCode of ["Digit5", "Numpad5"]) {
  const numericConflict = isolatedShortcutConfig(shortcuts, "windows")
    .set("focusInput", { control: false, alt: true, shift: false, code: physicalCode })
    .set("insertPrompt", { control: false, alt: true, shift: false, codePattern: "Digit" })
    .build();
  assert.deepEqual(
    Array.from(shortcuts.shortcutConflictActions(numericConflict, "windows")).sort(),
    ["focusInput", "insertPrompt"],
    `${physicalCode} must conflict with the matching digit pattern`
  );
}
assert.deepEqual(
  Array.from(shortcuts.shortcutConflictActions(macConflict, "windows")),
  [],
  "conflicts from the inactive profile must not leak across platforms"
);

assert.equal(
  shortcuts.formatShortcut("focusInput", { command: true, control: true, option: true, shift: true, code: "KeyK" }, "", "mac"),
  "⌘⌃⌥⇧K"
);
assert.equal(
  shortcuts.formatShortcut("focusInput", { control: true, alt: true, shift: true, code: "KeyK" }, "", "windows"),
  "Ctrl+Alt+Shift+K"
);
assert.equal(
  shortcuts.formatShortcut("switchPlatformTab", { command: true, control: false, option: false, shift: false, codePattern: "Digit" }, "7", "mac"),
  "⌘7"
);
assert.equal(
  shortcuts.formatShortcut("focusInput", { control: false, alt: false, shift: false, code: "Numpad5" }, "", "windows"),
  "Num 5"
);
assert.equal(shortcuts.formatShortcut("focusInput", { disabled: true }, "", "mac"), "Disabled");

// Enter sends only with the selected platform's exact mode and never while an
// IME is composing.
assert.equal(shortcuts.matchesSendShortcut(event({ key: "Enter", code: "Enter" }), "enter", "mac"), true);
for (const modifier of ["metaKey", "ctrlKey", "altKey", "shiftKey"]) {
  assert.equal(shortcuts.matchesSendShortcut(event({ key: "Enter", code: "Enter", [modifier]: true }), "enter", "mac"), false);
}
assert.equal(shortcuts.matchesSendShortcut(event({ key: "Enter", code: "Enter", metaKey: true }), "mod-enter", "mac"), true);
assert.equal(shortcuts.matchesSendShortcut(event({ key: "Enter", code: "Enter", ctrlKey: true }), "mod-enter", "mac"), false);
assert.equal(shortcuts.matchesSendShortcut(event({ key: "Enter", code: "Enter", ctrlKey: true }), "mod-enter", "windows"), true);
assert.equal(shortcuts.matchesSendShortcut(event({ key: "Enter", code: "Enter", metaKey: true }), "mod-enter", "windows"), false);
assert.equal(shortcuts.matchesSendShortcut(event({ key: "Enter", code: "Enter", ctrlKey: true, shiftKey: true }), "mod-enter", "windows"), false);
assert.equal(shortcuts.matchesSendShortcut(event({ key: "Enter", code: "Enter", isComposing: true }), "enter", "windows"), false);
assert.equal(shortcuts.matchesSendShortcut(event({ key: "Enter", code: "Enter", keyCode: 229 }), "enter", "windows"), false);

// Exercise the real storage bundle functions with only their unrelated fields
// stubbed out. The outer backup schema remains v1 while its shortcut payload is
// canonical v2, and JSON serialization must retain both platform profiles.
const bundleContext = vm.createContext({
  __normalizeShortcutConfig: (raw) => shortcuts.normalizeShortcutConfig(raw)
});
vm.runInContext(`
  const CONFIG_BUNDLE_KEYS = [
    "options",
    "customConfig",
    "promptLibrary",
    "promptSendHistory",
    "shortcutConfig",
    "pocketHistory"
  ];
  const CONFIG_BUNDLE_KEY_SET = new Set(CONFIG_BUNDLE_KEYS);
  function normalizeShortcutConfig(raw) { return globalThis.__normalizeShortcutConfig(raw); }
  ${functionSource(storageSource, "plainObject")}
  ${functionSource(storageSource, "hasBundleField")}
  ${functionSource(storageSource, "hasBundleObjectField")}
  ${functionSource(storageSource, "hasBundleArrayField")}
  ${functionSource(storageSource, "hasBundleNonEmptyObjectField")}
  ${functionSource(storageSource, "normalizeConfigBundleKeys")}
  ${functionSource(storageSource, "exportConfigBundle")}
  ${functionSource(storageSource, "inspectImportedConfig")}
  globalThis.__exportConfigBundle = exportConfigBundle;
  globalThis.__inspectImportedConfig = inspectImportedConfig;
`, bundleContext, { filename: "shared/storage.js" });

let ioConfig = shortcuts.defaultShortcutConfig();
const ioMac = shortcuts.defaultShortcutProfile("mac");
ioMac.sendKeyMode = "mod-enter";
ioMac.shortcuts.focusInput = {
  ...ioMac.shortcuts.focusInput,
  command: false,
  control: true,
  option: false,
  shift: true,
  code: "KeyQ"
};
ioConfig = shortcuts.replaceShortcutProfile(ioConfig, "mac", ioMac);
const ioWindows = shortcuts.defaultShortcutProfile("windows");
ioWindows.sendKeyMode = "enter";
ioWindows.shortcuts.newChat = {
  ...ioWindows.shortcuts.newChat,
  control: false,
  alt: true,
  shift: true,
  code: "KeyB"
};
ioConfig = shortcuts.replaceShortcutProfile(ioConfig, "windows", ioWindows);

const exportedBundle = bundleContext.__exportConfigBundle({ shortcutConfig: ioConfig }, ["shortcutConfig"]);
assert.equal(exportedBundle.schema, "chatclub.config.v1", "the public backup envelope must remain compatible");
assert.deepEqual(Object.keys(exportedBundle).sort(), ["exportedAt", "schema", "shortcutConfig"]);
assert.equal(exportedBundle.shortcutConfig.schemaVersion, 2);
assertNoProperty(exportedBundle.shortcutConfig, "cmdOrCtrl", "exported shortcut config");
const serializedBundle = JSON.parse(JSON.stringify(exportedBundle));
const importedBundle = bundleContext.__inspectImportedConfig(serializedBundle).data.shortcutConfig;
assert.deepEqual(plain(importedBundle), plain(ioConfig), "export/import must preserve both platform profiles");
assert.equal(importedBundle.profiles.mac.sendKeyMode, "mod-enter");
assert.equal(importedBundle.profiles.mac.shortcuts.focusInput.control, true);
assert.equal(importedBundle.profiles.mac.shortcuts.focusInput.code, "KeyQ");
assert.equal(importedBundle.profiles.windows.sendKeyMode, "enter");
assert.equal(importedBundle.profiles.windows.shortcuts.newChat.control, false);
assert.equal(importedBundle.profiles.windows.shortcuts.newChat.alt, true);
assert.equal(importedBundle.profiles.windows.shortcuts.newChat.code, "KeyB");
const importedLegacyBundle = bundleContext.__inspectImportedConfig({
  schema: "chatclub.config.v1",
  shortcutConfig: legacy
}).data.shortcutConfig;
assert.deepEqual(plain(importedLegacyBundle), plain(migrated), "old shortcut backups must remain importable");

// The shared module and both self-contained content runtimes must ship the same
// raw v2 defaults and action inventory. Legacy cmdOrCtrl may remain only inside
// migration code, never in a canonical default profile.
const expectedDefaults = plain(shortcuts.normalizeShortcutConfig(sharedDefault));
const expectedActions = plain(shortcuts.ALL_SHORTCUT_ACTIONS);
for (const [label, source] of [
  ["shared/constants.js", constantsSource],
  ["content/content.js", contentSource],
  ["content/summary-userscripts-main.js", summaryRuntimeSource]
]) {
  const runtimeDefault = evaluateLiteral(
    source,
    "DEFAULT_SHORTCUT_CONFIG",
    "{",
    { SHORTCUT_CONFIG_SCHEMA_VERSION: 2 }
  );
  assert.equal(runtimeDefault.schemaVersion, 2, `${label} must expose raw v2 shortcut defaults`);
  assert.ok(runtimeDefault.profiles?.mac, `${label} must contain a Mac profile`);
  assert.ok(runtimeDefault.profiles?.windows, `${label} must contain a Windows profile`);
  assertNoProperty(runtimeDefault, "cmdOrCtrl", `${label} DEFAULT_SHORTCUT_CONFIG`);
  assert.deepEqual(
    plain(runtimeDefault),
    plain(sharedDefault),
    `${label} raw shortcut defaults must stay synchronized`
  );
  assert.deepEqual(
    plain(shortcuts.normalizeShortcutConfig(runtimeDefault)),
    expectedDefaults,
    `${label} shortcut defaults must stay synchronized`
  );
}
for (const [label, source, declaration] of [
  ["shared/shortcuts.js", shortcutsSource, "ALL_SHORTCUT_ACTIONS"],
  ["content/content.js", contentSource, "SHORTCUT_ACTIONS"],
  ["content/summary-userscripts-main.js", summaryRuntimeSource, "SHORTCUT_ACTIONS"]
]) {
  assert.deepEqual(
    plain(evaluateLiteral(source, declaration, "[")),
    expectedActions,
    `${label} shortcut action order must stay synchronized`
  );
}
for (const [label, source] of [
  ["content/content.js", contentSource],
  ["content/summary-userscripts-main.js", summaryRuntimeSource]
]) {
  const context = vm.createContext({});
  vm.runInContext(
    `${functionSource(source, "digitMatch")}; globalThis.__digitMatch = digitMatch;`,
    context,
    { filename: label }
  );
  assert.equal(context.__digitMatch("Digit0"), null, `${label} must reject slot 0`);
  assert.equal(context.__digitMatch("Numpad0"), null, `${label} must reject numpad slot 0`);
  assert.equal(context.__digitMatch("Digit9")?.[1], "9", `${label} must accept number-row slots 1-9`);
  assert.equal(context.__digitMatch("Numpad1")?.[1], "1", `${label} must accept numpad slots 1-9`);
}

assert.match(
  contentSource,
  /window\.addEventListener\("keydown", \(event\) => \{\s*if \(!contentBridgeIsCurrent\(\)\) return;/,
  "stale reinjected content bridges must not keep handling shortcut keydown events"
);
assert.match(
  contentSource,
  /__CHATCLUB_SHORTCUT_BRIDGE_CLEANUP__/,
  "shortcut listeners must expose reinjection cleanup"
);
const shortcutTriggerSource = postMessageSource.match(/SHORTCUT_TRIGGER_POST_MESSAGE_SOURCE = "([^"]+)"/)?.[1];
assert.ok(shortcutTriggerSource, "shared shortcut trigger source must be versioned");
assert.equal(
  contentSource.match(/SHORTCUT_TRIGGER_POST_MESSAGE_SOURCE = "([^"]+)"/)?.[1],
  shortcutTriggerSource,
  "isolated content shortcut events must use the shared versioned source"
);
assert.equal(
  summaryRuntimeSource.match(/SHORTCUT_TRIGGER_POST_MESSAGE_SOURCE = "([^"]+)"/)?.[1],
  shortcutTriggerSource,
  "main-world shortcut events must use the shared versioned source"
);
assert.match(
  mainSource,
  /genericRequest && message\.action === "shortcutTriggered"\) return;/,
  "the parent must ignore shortcut events from stale unversioned content listeners"
);

console.log("shortcut platform regression: ok");
