#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

(async () => {
  const { DEFAULT_OPTIONS } = await import(moduleUrl("shared/constants.js"));
  const { normalizeOptions, normalizeAppIcons, dehydrateOptions } = await import(moduleUrl("shared/storage-schema.js"));
  const { t, setLanguage } = await import(moduleUrl("shared/i18n.js"));
  const settingsState = await import(moduleUrl("app/settings/state-ports.js"));

  assert.deepEqual(DEFAULT_OPTIONS.appIcons, {});
  assert.deepEqual(normalizeOptions({}).appIcons, {});
  assert.deepEqual(
    normalizeAppIcons({
      ChatGPT: { srcType: "url", value: "https://cdn.example.com/chatgpt.png" },
      Gemini: { srcType: "data", value: "data:image/png;base64,AAAA" },
      BadHttp: { srcType: "url", value: "http://insecure.example/icon.png" },
      Creds: { srcType: "url", value: "https://user:secret@cdn.example.com/icon.png" },
      Empty: { srcType: "url", value: "" }
    }),
    {
      ChatGPT: { srcType: "url", value: "https://cdn.example.com/chatgpt.png" },
      Gemini: { srcType: "data", value: "data:image/png;base64,AAAA" }
    }
  );
  const persisted = dehydrateOptions({
    appIcons: { ChatGPT: { srcType: "url", value: "https://cdn.example.com/chatgpt.png" } }
  });
  assert.equal(persisted.appIcons.ChatGPT.value, "https://cdn.example.com/chatgpt.png");
  assert.ok(settingsState.SETTINGS_OPTION_CAPABILITIES.apps.write.includes("appIcons"));
  assert.ok(settingsState.SETTINGS_OPTION_CAPABILITIES.apps.read.includes("appIcons"));

  setLanguage("en");
  assert.equal(t("apps.changeIcon"), "Change icon");
  setLanguage("zh_CN");
  assert.equal(t("apps.changeIcon"), "更换图标");

  const apps = read("app/settings/apps.js");
  const iconEditor = read("app/settings/app-icon.js");
  const history = read("app/history/controller.js");
  const summary = read("app/summary/controller.js");
  const css = read("styles/chatclub.css");
  const budgets = JSON.parse(read("tools/native-entry-budgets.json"));

  assert.match(apps, /createAppIconControls/);
  assert.match(apps, /appIcons\.nameCell/);
  assert.match(apps, /appIcons\.editorField/);
  assert.match(iconEditor, /editorModal/);
  assert.match(iconEditor, /faviconPort\.encodeFile/);
  assert.match(iconEditor, /faviconPort\.refresh/);
  assert.doesNotMatch(history, /googleFaviconUrl/);
  assert.doesNotMatch(summary, /googleFaviconUrl/);
  assert.doesNotMatch(history, /s2\/favicons/);
  assert.doesNotMatch(summary, /s2\/favicons/);
  assert.match(css, /\.settings-site-icon(?![-\w])[^}]*border-radius:\s*var\(--ui-radius-xs\)/s);
  assert.match(css, /\.settings-site-icon-button \{[^}]*width:\s*var\(--target-min\)/s);
  assert.equal(fs.existsSync(path.join(root, "icons/sites")), false, "v1 must not ship packaged site logos");
  assert.equal(budgets.lazyBoundaries["app/settings/controller.js"].maxFiles, 30);

  console.log("settings site icon: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
