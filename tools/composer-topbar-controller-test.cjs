#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const runtime = read("app/runtime.js");
const composer = read("app/composer/controller.js");
const topbar = read("app/topbar/controller.js");
const topbarView = read("app/topbar/view.js");
const preferredModel = read("app/preferred-model/controller.js");
const chatclubCss = read("styles/chatclub.css");

const { functionSource } = require("./function-source.cjs");

function cssBlockBody(source, openingBraceIndex) {
  let depth = 0;
  for (let index = openingBraceIndex; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] !== "}") continue;
    depth -= 1;
    if (depth === 0) return source.slice(openingBraceIndex + 1, index);
  }
  throw new Error("unterminated CSS block in topbar boundary test");
}

function cssRuleBody(source, header, label) {
  const match = header.exec(source);
  assert.ok(match, `${label} CSS rule must exist`);
  return cssBlockBody(source, source.indexOf("{", match.index));
}

function responsiveBrandRules(kind) {
  const header = kind === "viewport"
    ? /@media\s*\(max-width:\s*(\d+)px\)\s*\{/g
    : /@container\s+chatclub-topbar\s*\(max-width:\s*(\d+)px\)\s*\{/g;
  const rules = [];
  for (let match = header.exec(chatclubCss); match; match = header.exec(chatclubCss)) {
    const body = cssBlockBody(chatclubCss, header.lastIndex - 1);
    if (/(?:^|\n)\s*\.brand(?:\s*>|\s*\{)/.test(body)) {
      rules.push({ maxWidth: Number(match[1]), body });
    }
  }
  return rules;
}

(async () => {
  const portModule = await import(pathToFileURL(path.join(root, "app/controller-port.js")).href);
  const binding = portModule.createBindOnceControllerPort("Boundary Test", ["read", "write"]);
  assert.throws(() => binding.port.read(), /not bound/, "a stable port must fail closed before bootstrap binding");
  assert.throws(
    () => binding.bind({ read() {} }),
    /requires write\(\)/,
    "binding must reject an incomplete capability target"
  );
  const target = { read: () => 7, write: (value) => value + 1 };
  const stablePort = binding.port;
  assert.equal(binding.bind(target), stablePort, "binding must retain the stable port identity");
  assert.equal(stablePort.read(), 7);
  assert.equal(stablePort.write(4), 5);
  assert.throws(() => binding.bind(target), /already bound/, "a port must never be rebound to a later controller");

  assert.match(runtime, /createComposerController\(/, "runtime must compose the extracted Composer owner");
  assert.match(runtime, /createTopbarController\(/, "runtime must compose the extracted Topbar owner");
  assert.match(topbarView, /workspace-tabs-sidebar-toggle/, "the topbar must keep a fixed ChatClub-tab sidebar toggle");
  assert.match(topbarView, /aria-controls/, "the sidebar toggle must point at the live tab list");
  assert.match(
    topbarView,
    /formatShortcutTooltip\(label,\s*"toggleWorkspaceTabsSidebar"\)/,
    "the ChatClub Tabs toggle must expose the configured sidebar shortcut"
  );
  assert.match(runtime, /action === "toggleWorkspaceTabsSidebar"/, "Ctrl/Cmd+B must toggle the ChatClub Tabs sidebar");
  assert.match(runtime, /openWorkspaceTabsSearch/, "runtime must expose the topbar Search action");
  assert.match(topbarView, /item\.id === "search"/, "the topbar must render a dedicated Search control");
  assert.match(topbarView, /actions\.openWorkspaceTabsSearch\(\)/, "Search must open the ChatClub Tabs search field");
  assert.match(topbarView, /createSvgIcon\("search"\)/, "Search must use the Lucide search glyph");
  assert.match(topbarView, /className: topbarItemClass\("search"\)/, "Search must keep a stable topbar item class");
  assert.match(functionSource(topbar, "runMenuItem"), /item\.id === "search"[\s\S]*actions\.openWorkspaceTabsSearch\(\)/, "a folded Search item must still open tab search");
  assert.match(runtime, /workspaceBinding\.bind\(workspaceController\)/, "runtime must bind the stable workspace port once");
  assert.match(runtime, /topbarBinding\.bind\(topbarController\)/, "runtime must bind the stable topbar port once");
  assert.doesNotMatch(runtime, /workspace:\s*\(\)\s*=>\s*workspaceController/, "runtime must not expose an uninitialized workspace controller through a provider thunk");
  assert.doesNotMatch(runtime, /=>\s*preferredModelController\./, "runtime must not expose an uninitialized Preferred Model controller through provider thunks");
  assert.ok(runtime.split(/\r?\n/).length < 1290, "runtime must stay an assembly root after Composer/Topbar extraction");

  assert.match(
    composer,
    /import\s*\{\s*createFrameSendQueue\s*\}\s*from\s*"\.\/frame-send-queue\.js"/,
    "Composer must use the independently tested per-frame queue coordinator"
  );
  assert.match(
    composer,
    /const frameSendQueue = createFrameSendQueue\(\{[\s\S]*execute:\s*executeQueuedFrameSend[\s\S]*isUncertainError:\s*frameSendDeliveryIsUncertain/,
    "Composer must bind dequeued sends and uncertain-delivery handling to the per-frame queue"
  );
  const sendText = functionSource(composer, "sendTextToFrame");
  assert.equal((sendText.match(/framePort\.request\(/g) || []).length, 1, "one dequeued Composer send must map to at most one Frame RPC request");
  assert.match(sendText, /expectedDocumentId:\s*readiness\.documentId/, "a dequeued send must remain bound to its readiness document");
  assert.doesNotMatch(sendText, /scheduleContentFrameRepair|prepareContentFrameRuntime/, "Composer must not repair and replay an ambiguously delivered send");
  const executeQueuedSend = functionSource(composer, "executeQueuedFrameSend");
  assert.equal((executeQueuedSend.match(/sendTextToFrame\(/g) || []).length, 1, "each queue execution must invoke the single-attempt sender once");
  assert.match(executeQueuedSend, /waitForPreferredModelSubmissionBarrier\(/, "same-frame FIFO must include the submission navigation barrier");
  const admitSnapshot = functionSource(composer, "admitSnapshot");
  assert.match(admitSnapshot, /frameSendQueue\.enqueue\(iframe,\s*\{/, "each admitted iframe must receive its own frozen queue job");
  assert.match(admitSnapshot, /const admittedCount = entries\.filter\(\(entry\) => entry\.admitted\)\.length/, "snapshot admission must expose its admitted target count synchronously");
  assert.match(admitSnapshot, /if \(admittedCount > 0\)[\s\S]*recordSendHistory\(text, images\)/, "one admitted snapshot must record history once rather than once per frame");
  const sendAll = functionSource(composer, "sendPromptToFrames");
  assert.match(sendAll, /captureDraftSnapshot\(\)[\s\S]*admitSnapshot\(snapshot\)/, "ordinary send must reuse immutable snapshot admission");
  assert.match(sendAll, /admission\.admittedCount > 0[\s\S]*clearDraftIfSnapshotCurrent\(snapshot\)/, "an admitted send must clear only the exact draft revision it captured");
  assert.match(sendAll, /return admission\.settlement/, "ordinary send must retain its asynchronous settlement result");
  assert.doesNotMatch(composer, /promptSendInFlight/, "Composer must allow repeated submissions while earlier jobs remain queued");
  assert.doesNotMatch(
    composer,
    /ensurePreferredModelInputReady|preferredModelInputGateIsLocked|handleBeforeInput|\.readOnly\b|["']aria-busy["']/,
    "model preparation must never gate Composer editing, IME, paste, attachments, or submit admission"
  );
  assert.match(functionSource(composer, "handleInputKeydown"), /promptHistoryNavigate\(/, "Composer must own prompt-history navigation");
  assert.match(
    functionSource(composer, "handleInputBlur"),
    /focusRemainsInPromptShell\(shell, event\.relatedTarget\)[\s\S]*return;[\s\S]*collapseInput\(inputNode\)/,
    "focusing a control inside Composer must not collapse multiline or image input"
  );
  assert.match(
    functionSource(composer, "handlePromptShellFocusOut"),
    /focusRemainsInPromptShell\(shell, event\.relatedTarget\)[\s\S]*prompt-input-expanded[\s\S]*collapseInput\(inputNode\)/,
    "expanded input must collapse only after focus leaves the entire Composer shell"
  );
  assert.match(composer, /if\(n\.value!==state\.promptText\)n\.value=state\.promptText/, "placeholder refresh must not rewrite a focused input with the same draft value");
  assert.match(composer, /if\s*\(\s*!value\s*&&\s*!state\.promptImages\.length\s*\)[\s\S]*leftoverImages[\s\S]*text\.textContent\s*!==\s*collapsed\.text[\s\S]*classList\.add\("prompt-collapsed-preview-empty"\)/, "placeholder refresh must update the empty preview text without rebuilding its DOM subtree");
  assert.match(composer, /leftoverImages = preview\.querySelector\("\.prompt-collapsed-preview-images"\)[\s\S]*if\s*\(\s*text\s*&&\s*!leftoverImages\s*\)/, "an empty preview refresh must rebuild when a prior send left image thumbs behind");
  const promptMenu = functionSource(composer, "openActionsMenu");
  assert.match(promptMenu, /topbar\.closeSettingsMenu\(\)/, "Prompt Actions must dismiss only the Topbar menu owner");
  assert.match(promptMenu, /workspace\.closePopovers\(\)/, "Prompt Actions must dismiss the workspace popover owner through its port");
  assert.match(functionSource(composer, "closeActionsMenuOnKeydown"), /claimTopmostPopoverEscape\(event,\s*"\.prompt-actions-popover"\)/, "Prompt Actions must claim only its topmost Escape");

  const topbarSync = functionSource(topbar, "sync");
  assert.match(topbarSync, /composer\.closeActionsMenu\(\)/, "Topbar redraw must close the Composer-owned popover before anchor replacement");
  assert.match(topbarSync, /workspace\.closePopoversAnchoredWithin\(node\)/, "Topbar redraw must close only workspace popovers anchored in the replaced node");
  assert.match(topbarSync, /preferredModel\.syncPreferredModelInputGate\(\)/, "Topbar redraw must preserve the Preferred Model gate state");
  assert.match(functionSource(topbar, "saveEditLayout"), /editSavePending = true[\s\S]*finally[\s\S]*editSavePending = false/, "Topbar must guard every edit-save close path while persistence is pending");
  assert.match(functionSource(topbar, "closeSettingsMenuOnKeydown"), /claimTopmostPopoverEscape\(event,\s*"\.topbar-settings-popover"\)/, "Topbar Settings must claim only its topmost Escape");
  const brandMenuAction = functionSource(topbar, "runMenuItem");
  assert.match(brandMenuAction, /item\.id === "brand"[\s\S]*actions\.openNewWorkspaceTab\(\)/, "a folded Logo item must open a fresh ChatClub tab");
  assert.doesNotMatch(brandMenuAction, /item\.id === "brand"[\s\S]{0,160}openSettings\("about"\)/, "a folded Logo item must no longer open About");
  assert.match(topbarView, /function render\(/, "Topbar view must own normal and edit-mode rendering");
  assert.match(topbarView, /function renderSettingsMenu\(/, "Topbar view must own Settings menu rendering");
  assert.doesNotMatch(topbarView, /addEventListener\("keydown"/, "the view must not own dismissal listeners");
  const brandLabel = functionSource(topbarView, "brandActionLabel");
  assert.match(brandLabel, /composer\.hasDraft\(\)[\s\S]*topbar\.sendInNewTab[\s\S]*common\.openInNewTab/, "the Logo label must switch between opening and sending from the current draft state");
  assert.match(brandLabel, /actions\.formatShortcutTooltip\(label,\s*"openNewWorkspaceTab"\)/, "the Logo label must expose the configured new-tab shortcut");
  assert.match(topbarView, /function formatTopbarShortcut[\s\S]*TOPBAR_SHORTCUT_ACTIONS/, "topbar controls must share the canonical shortcut action mapping");
  assert.match(functionSource(topbarView, "renderSettingsButton"), /formatTopbarShortcut\(t\("topbar\.settings"\),\s*"settings"\)/, "Settings must expose its configured shortcut");
  assert.match(functionSource(topbarView, "renderSettingsMenuButton"), /formatTopbarShortcut\(t\("topbar\.settingsJumpMenu"\),\s*"settingsJumpMenu"\)/, "the tools menu must expose its configured shortcut");
  assert.match(topbarView, /formatTopbarShortcut\(t\("topbar\.addGroup"\),\s*"addGroup"\)/, "Add Group must expose its configured shortcut");
  const brandView = functionSource(topbarView, "renderBrand");
  assert.match(brandView, /const label = brandActionLabel\(\)/, "the Logo must use the dynamic new-tab action label");
  assert.match(brandView, /"aria-label": label[\s\S]*"data-tooltip": label[\s\S]*"data-tooltip-id": "topbar\.brand"/, "the Logo must retain its accessible name and tooltip contract");
  assert.match(brandView, /onclick: runBrandAction/, "the visible Logo must use the guarded new-tab action");
  assert.match(brandView, /el\("div", \{\}, APP_NAME\)/, "the wide Logo must retain the complete ChatClub title");
  assert.doesNotMatch(brandView, /openSettings\("about"\)/, "the visible Logo must no longer open About");
  const guardedBrandAction = functionSource(topbarView, "runBrandAction");
  assert.match(guardedBrandAction, /buttonNode\.disabled = true[\s\S]*aria-busy[\s\S]*await actions\.openNewWorkspaceTab\(\)[\s\S]*finally/, "the visible Logo must suppress repeated activation until the new-tab request settles");
  const foldedBrand = functionSource(topbarView, "renderFoldedMenuButton");
  assert.match(foldedBrand, /item\.id === "brand" \? brandActionLabel\(\)/, "the folded Logo menu must expose the same dynamic send/open label");
  assert.match(topbar, /composer\.subscribeDraftChanges\(\(\) => view\.syncBrandState\(\)\)/, "Topbar must update mounted Logo labels as the Composer draft changes");

  const appShellCss = cssRuleBody(chatclubCss, /(?:^|\n)\.app-shell\s*\{/, "App shell");
  const topbarCss = cssRuleBody(chatclubCss, /(?:^|\n)\.topbar\s*\{/, "Topbar");
  assert.match(appShellCss, /container:\s*chatclub-topbar \/ inline-size;/, "the viewport-sized app shell must own the named topbar container");
  assert.doesNotMatch(appShellCss, /\b(?:padding|border)(?:-(?:inline|left|right|width)[\w-]*)?\s*:/, "the container owner must not subtract inline padding or borders from the viewport breakpoint");
  assert.doesNotMatch(topbarCss, /container(?:-name|-type)?:\s*chatclub-topbar\b/, "the padded Topbar must not own its responsive inline-size container");
  assert.match(topbarCss, /padding:\s*6px 8px;/, "Topbar padding must remain independent from the viewport-aligned container boundary");
  assert.equal((chatclubCss.match(/container:\s*chatclub-topbar \/ inline-size;/g) || []).length, 1, "the topbar container must have one viewport-aligned owner");

  assert.match(
    chatclubCss,
    /\.brand\s*\{[^}]*flex:\s*0 0 clamp\(126px, 12vw, 180px\);[^}]*width:\s*clamp\(126px, 12vw, 180px\);[^}]*min-width:\s*126px;/,
    "the wide brand must reserve its full title width and never flex-shrink"
  );
  assert.doesNotMatch(chatclubCss, /\.brand > div\s*\{[^}]*text-overflow:\s*ellipsis;/, "the wide ChatClub title must never enter an ellipsis state");
  assert.match(chatclubCss, /\.brand-logo\s*\{[^}]*width:\s*28px;[^}]*height:\s*28px;[^}]*flex:\s*0 0 auto;/, "the brand logo must remain a complete 28px square");
  for (const kind of ["viewport", "container"]) {
    const rules = responsiveBrandRules(kind);
    assert.equal(rules.length, 1, `${kind} sizing must have one authoritative brand breakpoint`);
    const [{ maxWidth, body }] = rules;
    assert.equal(maxWidth, 1280, `${kind} sizing must collapse the brand at the inclusive 1280px boundary`);
    assert.match(body, /\.brand\s*\{[^}]*flex:\s*0 0 40px;[^}]*width:\s*40px;[^}]*min-width:\s*40px;/, `${kind} collapse must reserve the logo's complete 40px button box`);
    assert.match(body, /\.brand > div\s*\{[^}]*display:\s*none;/, `${kind} collapse must hide the title instead of truncating it`);
    for (const [width, expectedCollapsed] of [[1279, true], [1280, true], [1281, false]]) {
      assert.equal(width <= maxWidth, expectedCollapsed, `${kind} width ${width}px must ${expectedCollapsed ? "hide" : "show"} the complete ChatClub title`);
    }
  }

  assert.match(preferredModel, /workspace:\s*"object"/, "Preferred Model must consume a stable workspace port");
  assert.doesNotMatch(preferredModel, /\bcomposer\s*:\s*"object"/, "Preferred Model readiness must not depend on the Composer controller");
  assert.doesNotMatch(preferredModel, /const controller = workspace\(\)/, "Preferred Model must not dereference a provider thunk");
  const readinessSource = functionSource(preferredModel, "preferredModelFrameReadiness");
  assert.ok(
    readinessSource.indexOf("preferredModelFrameIsLoading(iframe)") < readinessSource.indexOf("if (!payload)"),
    "iframe loading must take precedence over an unconfigured model preference"
  );
  assert.ok(
    readinessSource.indexOf("record?.key === frameKey && record.terminal") < readinessSource.indexOf("preferredModelFrameIsLoading(iframe)"),
    "a terminal current model run must not remain masked by a stale loading marker"
  );
  const readinessIframe = {
    isConnected: true,
    dataset: {
      instanceId: "notion-frame",
      preferredModelDocumentId: "document-current",
      preferredModelContentBridgeVersion: "bridge-current"
    }
  };
  const readinessRecord = {
    key: "NotionAI:gemini31pro:document-current",
    runId: "run-terminal",
    terminal: true,
    success: false,
    cancelled: false,
    failureReason: "bridge unavailable"
  };
  const readinessContext = vm.createContext({ readinessIframe, readinessRecord });
  vm.runInContext(`
    const preferredModelApplyRuns = new Map([[readinessIframe, readinessRecord]]);
    function activeWorkspace() { return { frameApp: () => ({ id: "NotionAI" }) }; }
    function preferredModelPayloadForApp() { return { appId: "NotionAI", modelId: "gemini31pro" }; }
    function preferredModelAppId() { return "NotionAI"; }
    function preferredModelFrameKey() { return readinessRecord.key; }
    function preferredModelFrameIsLoading() { return true; }
    function t() { return "fallback"; }
    ${readinessSource}
    globalThis.readinessResult = preferredModelFrameReadiness(readinessIframe);
  `, readinessContext);
  assert.equal(
    readinessContext.readinessResult.state,
    "failed",
    "a terminal current model failure must wake queued sends even if loading cleanup was missed"
  );
  const gateSource = functionSource(preferredModel, "preferredModelGateStatus");
  assert.doesNotMatch(
    gateSource,
    /preferredModelFrameIsLoading/,
    "the global model status must share per-frame readiness precedence"
  );
  const gateContext = vm.createContext({});
  vm.runInContext(`
    let preferredModelGateBootstrapping = false;
    function preferredModelConfiguredActiveFrames() {
      return [{ iframe: {}, payload: { appId: "NotionAI" } }];
    }
    function preferredModelFrameReadiness() {
      return { state: "failed", reason: "bridge unavailable" };
    }
    function t() { return "fallback"; }
    ${gateSource}
    globalThis.gateResult = preferredModelGateStatus();
  `, gateContext);
  assert.deepEqual(
    JSON.parse(JSON.stringify(gateContext.gateResult)),
    {
      state: "failed",
      reason: "bridge unavailable",
      pendingCount: 0,
      failedCount: 1,
      failedAppIds: ["NotionAI"]
    },
    "global Composer status must expose the same terminal frame failure"
  );
  const gateVisualSource = functionSource(preferredModel, "syncPreferredModelGateVisual");
  assert.match(gateVisualSource, /removeAttribute\("aria-live"\)/, "the visual model badge must not duplicate live announcements");
  assert.match(gateVisualSource, /setAttribute\("role", "note"\)/, "the focusable visual badge must expose named non-live semantics");
  assert.match(gateVisualSource, /document\.activeElement === statusNode[\s\S]*prompt-input[\s\S]*preventScroll: true/, "hiding a focused badge must return focus to Composer before it can collapse");
  assert.match(gateVisualSource, /data-tooltip[\s\S]*data-tooltip-wrap[\s\S]*tabindex/, "the full model status must be available on hover and focus");
  assert.match(gateVisualSource, /preferredModelGateStatusIcon\(applying\)/, "the visual badge must retain an icon in every unsettled state");
  const gateLiveSource = functionSource(preferredModel, "syncPreferredModelGateLive");
  assert.match(gateLiveSource, /hidden = false/, "the model live region must remain mounted and exposed to assistive technology");
  assert.match(gateLiveSource, /modelGateAnnouncementKey/, "duplicate model-state notifications must not be re-announced");
  assert.match(gateLiveSource, /liveNode\.textContent = statusText/, "the dedicated model live region must own status announcements");
  const syncGateSource = functionSource(preferredModel, "syncPreferredModelInputGate");
  assert.match(syncGateSource, /querySelectorAll\("\.prompt-model-gate-status"\)[\s\S]*statusNodes\.forEach\(\(node\) => node\.remove\(\)\)/, "Preferred Model sync must keep exactly one visual badge");
  assert.match(syncGateSource, /querySelectorAll\("\.prompt-model-gate-live"\)[\s\S]*liveNodes\.forEach\(\(node\) => node\.remove\(\)\)/, "Preferred Model sync must keep exactly one live region");
  assert.match(
    chatclubCss,
    /\.composer\s*\{[\s\S]*?container-name:\s*chatclub-composer;[\s\S]*?container-type:\s*inline-size;/,
    "the 420px badge breakpoint must use the Composer's own inline size"
  );
  assert.match(
    chatclubCss,
    /@container chatclub-composer \(max-width:\s*420px\)\s*\{[\s\S]*?--prompt-model-gate-width:\s*28px;[\s\S]*?\.prompt-model-gate-status-text\s*\{[\s\S]*?display:\s*none;/,
    "Composer widths up to and including 420px must expose an icon-only model badge"
  );
  assert.match(
    chatclubCss,
    /--prompt-model-gate-width:\s*clamp\([^)]+\);[\s\S]*?\.prompt-model-gate-status-text\s*\{[\s\S]*?display:\s*block;/,
    "Composer widths above 420px must expose an icon plus status text"
  );
  assert.match(
    chatclubCss,
    /padding-right:\s*calc\(var\(--prompt-model-gate-control-right\) \+ var\(--prompt-model-gate-reserve\)\);/,
    "textarea and collapsed preview content must reserve the model badge width"
  );
  assert.match(
    chatclubCss,
    /prompt-image-preview-list\s*\{[\s\S]*?right:\s*calc\(var\(--prompt-model-gate-control-right\) \+ var\(--prompt-model-gate-reserve\)\);/,
    "expanded image previews must reserve the model badge width"
  );
  assert.match(chatclubCss, /\.prompt-model-gate-status\.tooltip-trigger\s*\{[\s\S]*?top:\s*5px;[\s\S]*?pointer-events:\s*auto;/, "the visual model status must stay in the top control row and remain interactive");
  assert.match(chatclubCss, /prompt-shell-expanded\.prompt-shell-has-images \.prompt-model-gate-status\s*\{[\s\S]*?top:\s*12px;/, "image mode must keep the model status in its top control row");
  assert.match(chatclubCss, /\.prompt-shell\.prompt-shell-expanded\.prompt-shell-has-images\s*\{[\s\S]*?max-height:\s*360px;/, "image mode must allow the prompt shell to grow with multiline text");
  assert.match(chatclubCss, /\.prompt-shell-has-images \.textarea\.prompt-input-expanded\s*\{[\s\S]*?max-height:\s*360px;[\s\S]*?overflow-y:\s*auto;/, "image mode must allow a capped textarea to scroll instead of clipping text");
  assert.doesNotMatch(chatclubCss, /\.prompt-shell-has-images \.textarea\.prompt-input-expanded\s*\{[^}]*!important/, "image mode height must remain overridable by measured inline sizing");
  assert.doesNotMatch(chatclubCss, /\.prompt-model-gate-status[^\{]*\{[^}]*top:\s*calc\(100%/, "the model status must never float below Composer over an iframe");
  assert.match(chatclubCss, /\.prompt-model-gate-live\s*\{[\s\S]*?clip-path:\s*inset\(50%\);/, "the dedicated model live region must be visually hidden without the hidden attribute");
  for (const method of [
    "preferredModelFrameReadiness",
    "preferredModelFrameReadinessIsCurrent",
    "waitForPreferredModelFrame",
    "waitForPreferredModelSubmissionBarrier"
  ]) {
    assert.match(preferredModel, new RegExp(`function ${method}\\(`), `Preferred Model must implement ${method}()`);
    assert.match(
      preferredModel,
      new RegExp(`return Object\\.freeze\\(\\{[\\s\\S]*\\b${method}\\b[\\s\\S]*\\}\\);`),
      `Preferred Model must export ${method}() through its controller port`
    );
  }

  console.log("Composer/Topbar controller boundaries: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
