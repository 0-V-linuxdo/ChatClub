#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;
const controlsSource = read("app/settings/appearance-model-selection-overlay.js");

assert.match(controlsSource, /"aria-describedby": TOGGLE_HELP_ID/);
assert.match(controlsSource, /"aria-describedby": OPACITY_HELP_ID/);
assert.match(controlsSource, /"aria-valuetext": `\$\{opacityDraft\}%`/);
assert.match(controlsSource, /setAttribute\("aria-valuetext", `\$\{nextOpacity\}%`\)/);

async function drain(autosave) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (!autosave.busy()) return;
    await new Promise((resolve) => { setImmediate(resolve); });
  }
  assert.fail("appearance autosave did not settle");
}

function autosaveFixture(createAppearanceAutosave, initialOptions = {}, options = {}) {
  const calls = {
    applyTheme: 0,
    overlay: 0,
    summary: 0,
    topbar: 0,
    workspace: 0
  };
  const state = { options: { ...initialOptions } };
  const autosave = createAppearanceAutosave({
    state,
    saveOptionsPatch: options.saveOptionsPatch
      ? (patch) => options.saveOptionsPatch(patch, state)
      : async (patch) => ({ ...state.options, ...patch }),
    applyTheme() { calls.applyTheme += 1; },
    syncI18nLanguage() {},
    syncTopbar() { calls.topbar += 1; },
    syncWorkspaceDom() { calls.workspace += 1; },
    syncSummaryPanel() { calls.summary += 1; },
    syncPreferredModelSelectionOverlays() { calls.overlay += 1; }
  });
  return { autosave, calls, state };
}

(async () => {
  const { DEFAULT_OPTIONS } = await import(moduleUrl("shared/constants.js"));
  const {
    dehydrateOptions,
    normalizeModelPreferenceSelectionOverlayOpacity,
    normalizeOptions
  } = await import(moduleUrl("shared/storage-schema.js"));
  const { setLanguage, t } = await import(moduleUrl("shared/i18n.js"));
  const {
    exportConfigBundle,
    inspectImportedConfig
  } = await import(moduleUrl("shared/storage-config-bundle.js"));
  const { createAppearanceAutosave } = await import(moduleUrl("app/settings/appearance-autosave.js"));

  assert.equal(DEFAULT_OPTIONS.modelPreferenceSelectionOverlayEnabled, true);
  assert.equal(DEFAULT_OPTIONS.modelPreferenceSelectionOverlayOpacity, 70);
  assert.equal(normalizeOptions({}).modelPreferenceSelectionOverlayEnabled, true);
  assert.equal(normalizeOptions({}).modelPreferenceSelectionOverlayOpacity, 70);

  assert.equal(normalizeOptions({ modelPreferenceSelectionOverlayEnabled: false }).modelPreferenceSelectionOverlayEnabled, false);
  assert.equal(normalizeOptions({ modelPreferenceSelectionOverlayEnabled: true }).modelPreferenceSelectionOverlayEnabled, true);
  for (const invalid of [undefined, null, 0, 1, "", "false", "true", {}, []]) {
    assert.equal(
      normalizeOptions({ modelPreferenceSelectionOverlayEnabled: invalid }).modelPreferenceSelectionOverlayEnabled,
      true,
      `${String(invalid)} must not be coerced into an overlay toggle`
    );
  }

  for (const invalid of [undefined, null, true, false, "", "invalid", NaN, Infinity, {}, []]) {
    assert.equal(
      normalizeModelPreferenceSelectionOverlayOpacity(invalid),
      70,
      `${String(invalid)} must fall back to the default overlay opacity`
    );
  }
  assert.equal(normalizeModelPreferenceSelectionOverlayOpacity(-1), 0);
  assert.equal(normalizeModelPreferenceSelectionOverlayOpacity("24.6"), 25);
  assert.equal(normalizeModelPreferenceSelectionOverlayOpacity(70), 70);
  assert.equal(normalizeModelPreferenceSelectionOverlayOpacity(101), 100);

  const persisted = dehydrateOptions({
    modelPreferenceSelectionOverlayEnabled: false,
    modelPreferenceSelectionOverlayOpacity: 33.6
  });
  assert.equal(persisted.modelPreferenceSelectionOverlayEnabled, false);
  assert.equal(persisted.modelPreferenceSelectionOverlayOpacity, 34);
  const restored = normalizeOptions(JSON.parse(JSON.stringify(persisted)));
  assert.equal(restored.modelPreferenceSelectionOverlayEnabled, false);
  assert.equal(restored.modelPreferenceSelectionOverlayOpacity, 34);

  const exportedBundle = exportConfigBundle({
    options: {
      ...DEFAULT_OPTIONS,
      modelPreferenceSelectionOverlayEnabled: false,
      modelPreferenceSelectionOverlayOpacity: 34
    }
  }, ["options"]);
  const inspectedBundle = inspectImportedConfig(JSON.parse(JSON.stringify(exportedBundle)));
  assert.equal(inspectedBundle.data.options.modelPreferenceSelectionOverlayEnabled, false);
  assert.equal(inspectedBundle.data.options.modelPreferenceSelectionOverlayOpacity, 34);

  setLanguage("en");
  assert.equal(t("chat.preferredModelSelectingStatus"), "Automatically selecting");
  assert.equal(t("chat.preferredModelTargetDetail", { target: "Gemini 3.1 Pro" }), "Gemini 3.1 Pro…");
  assert.equal(t("chat.preferredModelSelectingTargetAccessible", { target: "Gemini 3.1 Pro" }), "Automatically selecting Gemini 3.1 Pro");
  assert.equal(t("chat.preferredModelAccessibleSeparator"), ". ");
  assert.equal(t("chat.preferredModelApplyingAllSources", { state: "On" }), "Applying ‘All sources: On’…");
  assert.equal(t("chat.preferredModelThinkingDetail", { level: "Extended" }), "Thinking: Extended");
  assert.equal(t("chat.preferredModelAllSourcesDetail", { state: "Off" }), "All sources: Off");
  assert.equal(t("chat.preferredModelEffortDetail", { effort: "Max" }), "Effort: Max");
  setLanguage("zh_CN");
  assert.equal(t("chat.preferredModelSelectingStatus"), "正在自动选择");
  assert.equal(t("chat.preferredModelTargetDetail", { target: "Gemini 3.1 Pro" }), "Gemini 3.1 Pro…");
  assert.equal(t("chat.preferredModelSelectingTargetAccessible", { target: "Gemini 3.1 Pro" }), "正在自动选择 Gemini 3.1 Pro");
  assert.equal(t("chat.preferredModelAccessibleSeparator"), "；");
  assert.equal(t("chat.preferredModelApplyingAllSources", { state: "开启" }), "正在应用“全部来源：开启”设置…");
  assert.equal(t("chat.preferredModelThinkingDetail", { level: "扩展" }), "思考等级：扩展");
  assert.equal(t("chat.preferredModelAllSourcesDetail", { state: "关闭" }), "全部来源：关闭");
  assert.equal(t("chat.preferredModelEffortDetail", { effort: "Max" }), "Effort：Max");

  const overlayOnly = autosaveFixture(createAppearanceAutosave, {
    modelPreferenceSelectionOverlayEnabled: true,
    modelPreferenceSelectionOverlayOpacity: 70
  });
  overlayOnly.autosave.queue({
    modelPreferenceSelectionOverlayEnabled: false,
    modelPreferenceSelectionOverlayOpacity: 45
  });
  await drain(overlayOnly.autosave);
  assert.equal(overlayOnly.state.options.modelPreferenceSelectionOverlayEnabled, false);
  assert.equal(overlayOnly.state.options.modelPreferenceSelectionOverlayOpacity, 45);
  assert.deepEqual(overlayOnly.calls, {
    applyTheme: 1,
    overlay: 1,
    summary: 0,
    topbar: 0,
    workspace: 0
  });

  const mixed = autosaveFixture(createAppearanceAutosave, {
    colMaxCount: 0,
    modelPreferenceSelectionOverlayOpacity: 70
  });
  mixed.autosave.queue({ colMaxCount: 3, modelPreferenceSelectionOverlayOpacity: 20 });
  await drain(mixed.autosave);
  assert.deepEqual(mixed.calls, {
    applyTheme: 1,
    overlay: 1,
    summary: 1,
    topbar: 1,
    workspace: 1
  });

  const languageOnly = autosaveFixture(createAppearanceAutosave, {
    language: "en"
  });
  languageOnly.autosave.queue({ language: "zh_CN" });
  await drain(languageOnly.autosave);
  assert.equal(
    languageOnly.calls.overlay,
    1,
    "a language change must immediately refresh every visible dynamic overlay row"
  );

  let resolveDelayedSave;
  const delayed = autosaveFixture(createAppearanceAutosave, {
    modelPreferenceSelectionOverlayEnabled: true,
    modelPreferenceSelectionOverlayOpacity: 70
  }, {
    saveOptionsPatch: (patch, state) => new Promise((resolve) => {
      resolveDelayedSave = () => resolve({ ...state.options, ...patch });
    })
  });
  delayed.autosave.queue({ modelPreferenceSelectionOverlayEnabled: false }, {
    optimistic: true,
    onPreview() { delayed.calls.overlay += 1; }
  });
  assert.equal(delayed.state.options.modelPreferenceSelectionOverlayEnabled, false);
  assert.equal(delayed.calls.overlay, 1, "the overlay toggle must preview before storage settles");
  assert.equal(delayed.calls.workspace, 0);
  resolveDelayedSave();
  await drain(delayed.autosave);
  assert.equal(delayed.calls.overlay, 2);
  assert.equal(delayed.calls.workspace, 0);

  let rejectDelayedSave;
  let redrawAfterFailure = 0;
  const failed = autosaveFixture(createAppearanceAutosave, {
    modelPreferenceSelectionOverlayEnabled: true,
    modelPreferenceSelectionOverlayOpacity: 70
  }, {
    saveOptionsPatch: (_patch, state) => new Promise((_resolve, reject) => {
      rejectDelayedSave = () => {
        state.options = {
          modelPreferenceSelectionOverlayEnabled: true,
          modelPreferenceSelectionOverlayOpacity: 70
        };
        reject(new Error("expected save failure"));
      };
    })
  });
  failed.autosave.queue({ modelPreferenceSelectionOverlayOpacity: 20 }, {
    optimistic: true,
    onPreview() { failed.calls.overlay += 1; },
    redrawOnError() { redrawAfterFailure += 1; }
  });
  assert.equal(failed.state.options.modelPreferenceSelectionOverlayOpacity, 20);
  assert.equal(failed.calls.overlay, 1, "opacity must preview before storage settles");

  const previousDocument = globalThis.document;
  const previousNode = globalThis.Node;
  const previousSetTimeout = globalThis.setTimeout;
  const previousWarn = console.warn;
  class FakeNode {
    constructor() {
      this.classList = { add() {}, remove() {} };
      this.dataset = {};
      this.style = { setProperty() {} };
    }
    addEventListener() {}
    append() {}
    remove() {}
    setAttribute() {}
  }
  const toastHost = new FakeNode();
  globalThis.Node = FakeNode;
  globalThis.document = {
    body: toastHost,
    createElement: () => new FakeNode(),
    createTextNode: () => new FakeNode(),
    querySelector: () => toastHost
  };
  globalThis.setTimeout = () => 0;
  console.warn = () => {};
  try {
    rejectDelayedSave();
    await drain(failed.autosave);
  } finally {
    console.warn = previousWarn;
    globalThis.setTimeout = previousSetTimeout;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousNode === undefined) delete globalThis.Node;
    else globalThis.Node = previousNode;
  }
  assert.equal(failed.state.options.modelPreferenceSelectionOverlayOpacity, 70);
  assert.equal(failed.calls.applyTheme, 1, "failed opacity preview must restore the root theme variables");
  assert.equal(failed.calls.overlay, 2, "failed opacity preview must resync the persisted overlay state");
  assert.equal(redrawAfterFailure, 1, "failed preview must redraw controls from persisted state");
  assert.equal(failed.calls.workspace, 0);

  const appearanceSource = read("app/settings/appearance.js");
  const overlayControlsSource = read("app/settings/appearance-model-selection-overlay.js");
  const statePortsSource = read("app/settings/state-ports.js");
  assert.match(appearanceSource, /createModelSelectionOverlayAppearanceControls\(\{/);
  assert.match(overlayControlsSource, /class: "appearance-toggle-control"/);
  assert.match(overlayControlsSource, /class: "appearance-toggle-copy"/);
  assert.match(overlayControlsSource, /role: "switch"[\s\S]*checked: enabled/);
  assert.match(overlayControlsSource, /disabled: !enabled/);
  assert.match(overlayControlsSource, /opacitySlider\.disabled = !nextEnabled/);
  assert.match(
    overlayControlsSource,
    /style\.setProperty\(\s*"--preferred-model-selection-overlay-opacity",\s*String\(nextOpacity \/ 100\)/
  );
  assert.match(
    overlayControlsSource,
    /queueAppearanceAutoSave\(\{ modelPreferenceSelectionOverlayEnabled: nextEnabled \}, \{[\s\S]*?optimistic: true,[\s\S]*?onPreview: syncPreferredModelSelectionOverlays,[\s\S]*?redrawOnError: redraw/
  );
  assert.match(
    overlayControlsSource,
    /queueAppearanceAutoSave\(\{ modelPreferenceSelectionOverlayOpacity: nextOpacity \}, \{[\s\S]*?optimistic: true,[\s\S]*?--preferred-model-selection-overlay-opacity[\s\S]*?syncPreferredModelSelectionOverlays\(\)[\s\S]*?redrawOnError: redraw/
  );
  assert.match(statePortsSource, /"modelPreferenceSelectionOverlayEnabled", "modelPreferenceSelectionOverlayOpacity"/);

  console.log("preferred-model selection overlay settings: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
