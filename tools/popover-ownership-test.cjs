#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const workspaceFile = path.join(root, "app/workspace/controller.js");
const runtimeFile = path.join(root, "app/runtime.js");
const workspaceSource = fs.readFileSync(workspaceFile, "utf8");
const runtimeSource = fs.readFileSync(runtimeFile, "utf8");
const messageNavigatorSource = fs.readFileSync(path.join(root, "content-src/message-navigator.js"), "utf8");

function functionSource(source, functionName, indent = "") {
  const escapedIndent = indent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startPattern = new RegExp(`^${escapedIndent}(?:async\\s+)?function\\s+${functionName}\\s*\\(`, "m");
  const match = startPattern.exec(source);
  assert.ok(match, `${functionName} must remain discoverable`);
  const remainderStart = match.index + match[0].length;
  const nextPattern = new RegExp(`^${escapedIndent}(?:async\\s+)?function\\s+[A-Za-z_$][\\w$]*\\s*\\(`, "m");
  const nextFunction = nextPattern.exec(source.slice(remainderStart));
  const end = nextFunction ? remainderStart + nextFunction.index : source.length;
  return source.slice(match.index, end);
}

function literalDocumentSelectors(source, allOnly = false) {
  const method = allOnly ? "querySelectorAll" : "querySelector(?:All)?";
  return [...source.matchAll(new RegExp(`document\\.${method}\\(\\s*(["'\x60])([^"'\x60]+)\\1\\s*\\)`, "g"))]
    .flatMap((match) => match[2].split(",").map((selector) => selector.trim()));
}

const genericPopoverSelectors = new Set([".popover-menu", ".popover-backdrop", ".popover-anchor"]);
for (const selector of literalDocumentSelectors(workspaceSource, true)) {
  assert.ok(
    !genericPopoverSelectors.has(selector),
    `workspace DOM queries must not claim the global ${selector} class`
  );
}

for (const functionName of ["openAppPicker", "openLayoutMenu", "openChatMenu"]) {
  const source = functionSource(workspaceSource, functionName, "  ");
  assert.match(
    source,
    /classList\.add\([^)]*["']workspace-popover-anchor["'][^)]*\)/,
    `${functionName} must mark its anchor as workspace-owned`
  );
  assert.match(source, /workspacePopoverAnchor\s*=\s*anchor/, `${functionName} must track its exact owner anchor across DOM replacement`);
  assert.match(
    source,
    /class\s*:\s*["'][^"']*\bworkspace-popover-backdrop\b[^"']*["']/,
    `${functionName} must mark its backdrop as workspace-owned`
  );
  assert.match(
    source,
    /class\s*:\s*["'][^"']*\bworkspace-popover-menu\b[^"']*["']/,
    `${functionName} must mark its menu as workspace-owned`
  );
}

const outsideInteractionSource = functionSource(workspaceSource, "closePopoverOnOutsideInteraction", "  ");
assert.match(
  outsideInteractionSource,
  /document\.querySelector\(\s*["']\.workspace-popover-menu["']\s*\)/,
  "outside-interaction handling must inspect only the workspace-owned menu"
);
assert.match(
  outsideInteractionSource,
  /document\.querySelector\(\s*["']\.workspace-popover-anchor["']\s*\)/,
  "outside-interaction handling must inspect only the workspace-owned anchor"
);

const closePopoversSource = functionSource(workspaceSource, "closePopovers", "  ");
assert.match(
  closePopoversSource,
  /querySelectorAll\(\s*["']\.workspace-popover-menu,\s*\.workspace-popover-backdrop["']\s*\)/,
  "closePopovers must remove only workspace-owned menus and backdrops"
);
assert.match(
  closePopoversSource,
  /querySelectorAll\(\s*["']\.workspace-popover-anchor["']\s*\)/,
  "closePopovers must clear only workspace-owned anchors"
);
for (const selector of literalDocumentSelectors(closePopoversSource)) {
  assert.match(selector, /^\.workspace-popover-/, "closePopovers selectors must remain workspace-owned");
}

const closeAnchoredPopoverSource = functionSource(workspaceSource, "closePopoversAnchoredWithin", "  ");
assert.match(
  closeAnchoredPopoverSource,
  /!workspacePopoverAnchor\.isConnected\s*\|\|\s*root\?\.contains\?\.\(workspacePopoverAnchor\)/,
  "anchor replacement cleanup must cover both detached and root-owned workspace anchors"
);

const foregroundOverlaySource = functionSource(runtimeSource, "hasForegroundOverlay");
assert.match(
  foregroundOverlaySource,
  /document\.querySelector\(\s*["']\.modal-backdrop,\s*\.popover-menu,\s*\.popover-backdrop["']\s*\)/,
  "the Summary foreground guard must include parent-document modals and popovers"
);

const closeSummarySource = functionSource(runtimeSource, "closeSummaryFromEscape");
assert.match(closeSummarySource, /if\s*\(!state\.summaryOpen\s*\|\|\s*hasForegroundOverlay\(\)\)\s*return/, "deferred Summary close must revalidate foreground state");
assert.match(closeSummarySource, /state\.summaryOpen\s*=\s*false/, "the guarded Summary dismissal helper must close Summary");

const shortcutsSource = functionSource(runtimeSource, "installShortcuts");
const summaryBranchIndex = shortcutsSource.search(/if\s*\(\s*state\.summaryOpen\s*&&\s*event\.key\s*===\s*["']Escape["']\s*\)/);
const matchedShortcutIndex = shortcutsSource.indexOf("const matched", summaryBranchIndex);
const globalCompositionGuardIndex = shortcutsSource.search(/if\s*\(event\.isComposing\s*\|\|\s*event\.keyCode\s*===\s*229\)\s*return/);
assert.ok(summaryBranchIndex >= 0, "Summary Escape handling must remain discoverable");
assert.ok(matchedShortcutIndex > summaryBranchIndex, "the Summary Escape branch must remain independently testable");
assert.ok(
  globalCompositionGuardIndex >= 0 && globalCompositionGuardIndex < summaryBranchIndex,
  "composition events must be rejected before any global overlay or shortcut dismissal"
);
const summaryEscapeSource = shortcutsSource.slice(summaryBranchIndex, matchedShortcutIndex);
const dismissalGuardIndex = summaryEscapeSource.indexOf("isDismissalEscape(event)");
const foregroundIndex = summaryEscapeSource.indexOf("hasForegroundOverlay()");
const preventDefaultIndex = summaryEscapeSource.indexOf("event.preventDefault()");
const stopPropagationIndex = summaryEscapeSource.indexOf("event.stopPropagation()");
const closeSummaryIndex = summaryEscapeSource.indexOf("closeSummaryFromEscape()");
assert.ok(dismissalGuardIndex >= 0, "Summary Escape must use the shared IME-safe dismissal guard");
assert.ok(foregroundIndex >= 0, "Summary Escape must respect a foreground modal or popover");
assert.ok(closeSummaryIndex > dismissalGuardIndex, "the IME-safe dismissal guard must run before Summary dismissal");
assert.ok(closeSummaryIndex > foregroundIndex, "the foreground-overlay guard must run before Summary dismissal");
assert.ok(preventDefaultIndex > foregroundIndex && preventDefaultIndex < closeSummaryIndex, "handled Summary Escape must prevent its browser default");
assert.ok(stopPropagationIndex > foregroundIndex && stopPropagationIndex < closeSummaryIndex, "handled Summary Escape must stop propagation");
assert.match(summaryEscapeSource, /workspaceController\.hasTrackedMessageNavigatorMenu\(\)/, "Summary Escape must detect a tracked iframe menu");
assert.match(summaryEscapeSource, /workspaceController\.dismissTrackedMessageNavigatorMenu\(\)/, "Summary Escape must query and dismiss the iframe menu");
assert.match(summaryEscapeSource, /if\s*\(!consumed\)\s*closeSummaryFromEscape\(\)/, "a false-positive iframe tracker must allow the same Escape to close Summary");

for (const [functionName, selector] of [
  ["closePromptActionsMenuOnKeydown", ".prompt-actions-popover"],
  ["closeSettingsJumpMenuOnKeydown", ".topbar-settings-popover"]
]) {
  const source = functionSource(runtimeSource, functionName);
  assert.match(
    source,
    new RegExp(`claimTopmostPopoverEscape\\(event,\\s*["']${selector.replaceAll(".", "\\.")}["']\\)`),
    `${functionName} must claim only its topmost, IME-safe Escape`
  );
}

const workspaceEscapeSource = functionSource(workspaceSource, "closePopoverOnKeydown", "  ");
assert.match(
  workspaceEscapeSource,
  /claimTopmostPopoverEscape\(event,\s*["']\.workspace-popover-menu["']\)/,
  "workspace popovers must claim only their topmost, IME-safe Escape"
);

const messageNavigatorEscapeSource = functionSource(workspaceSource, "closeMessageNavigatorMenuOnParentKeydown", "  ");
assert.match(messageNavigatorEscapeSource, /if\s*\(!isDismissalEscape\(event\)\)\s*return/, "Message Navigator Escape must be IME-safe");
assert.match(
  messageNavigatorEscapeSource,
  /document\.querySelector\(\s*["']\.modal-backdrop,\s*\.popover-menu["']\s*\)/,
  "Message Navigator must not consume Escape behind a parent modal or popover"
);
assert.match(messageNavigatorEscapeSource, /event\.stopImmediatePropagation\(\)/, "Message Navigator must stop sibling Escape owners after claiming");
assert.match(messageNavigatorEscapeSource, /dismissTrackedMessageNavigatorMenu\(\)/, "Message Navigator Escape must query its live menu state");

const dismissTrackedNavigatorSource = functionSource(workspaceSource, "dismissTrackedMessageNavigatorMenu", "  ");
assert.match(
  dismissTrackedNavigatorSource,
  /sendToContentFrame\(iframe,\s*["']getMessageNavigatorState["']/,
  "tracked Message Navigator dismissal must query the live iframe state"
);
assert.match(
  dismissTrackedNavigatorSource,
  /if\s*\(result\?\.menuOpen\s*===\s*false\)\s*\{[\s\S]*?clearMessageNavigatorMenuOutsideClose\(\)[\s\S]*?return\s+false/,
  "a closed iframe menu must clear the false-positive tracker without consuming Summary dismissal"
);
assert.match(
  dismissTrackedNavigatorSource,
  /if\s*\(messageNavigatorMenuIframe\s*!==\s*iframe\)\s*return\s+true/,
  "a tracker changed during the live-state query must consume the original Escape"
);
assert.match(dismissTrackedNavigatorSource, /await\s+hideMessageNavigatorMenuForFrame\(iframe\)/, "a live iframe menu must be hidden before reporting Escape consumed");
assert.match(
  messageNavigatorSource,
  /event\.key\s*===\s*["']Escape["']\s*&&\s*!event\.isComposing\s*&&\s*event\.keyCode\s*!==\s*229/,
  "the in-frame Message Navigator Escape handler must ignore IME composition"
);

const syncTopbarSource = functionSource(runtimeSource, "syncTopbar");
const replaceTopbarIndex = syncTopbarSource.indexOf("topbarNode.replaceWith");
assert.ok(syncTopbarSource.indexOf("closePromptActionsMenu()") < replaceTopbarIndex, "topbar redraw must close its Prompt Actions owner before replacing anchors");
assert.ok(syncTopbarSource.indexOf("closeSettingsJumpMenu()") < replaceTopbarIndex, "topbar redraw must close its Settings owner before replacing anchors");
assert.ok(syncTopbarSource.indexOf("workspaceController.closePopoversAnchoredWithin(topbarNode)") < replaceTopbarIndex, "topbar redraw must close workspace popovers whose anchor will be replaced");
assert.match(syncTopbarSource, /restorePersistentSettingsMenu[\s\S]*requestAnimationFrame\([\s\S]*openTopbarEditSettingsMenu\(\)/, "topbar redraw must restore an editing-mode persistent Settings menu");

const closeTransientSource = functionSource(runtimeSource, "closeTransientOverlays");
for (const closeCall of [
  "closePromptActionsMenu()",
  "closeSettingsJumpMenu()",
  "workspaceController.closeTransientOverlays()"
]) {
  assert.ok(closeTransientSource.includes(closeCall), `runtime transient cleanup must call ${closeCall}`);
}
assert.match(functionSource(runtimeSource, "render"), /closeTransientOverlays\(\)/, "full render must clean every transient owner");

const modalShortcutGuardIndex = shortcutsSource.indexOf('document.querySelector(".modal-backdrop")');
assert.ok(
  modalShortcutGuardIndex > closeSummaryIndex && modalShortcutGuardIndex < matchedShortcutIndex,
  "global shortcuts must not run through a foreground modal"
);
const popoverShortcutGuardIndex = shortcutsSource.indexOf("isDismissalEscape(event) && (hasForegroundOverlay()", modalShortcutGuardIndex);
assert.ok(
  popoverShortcutGuardIndex > modalShortcutGuardIndex && popoverShortcutGuardIndex < matchedShortcutIndex,
  "Escape must be left to the foreground popover owner instead of also running a shortcut"
);
const transientShortcutCloseIndex = shortcutsSource.indexOf("closeTransientOverlays()", matchedShortcutIndex);
const shortcutActionIndex = shortcutsSource.indexOf("handleShortcutAction", matchedShortcutIndex);
assert.ok(
  transientShortcutCloseIndex > matchedShortcutIndex && transientShortcutCloseIndex < shortcutActionIndex,
  "a matched global shortcut must close transient owners before running its action"
);

const topbarMenuItemSource = functionSource(runtimeSource, "runTopbarMenuItem");
for (const methodName of ["openAppPicker", "openLayoutMenu"]) {
  const callPattern = new RegExp(`workspaceController\\.${methodName}\\s*\\(`, "g");
  const call = callPattern.exec(topbarMenuItemSource);
  assert.ok(call, `the folded topbar menu must retain its ${methodName} entry point`);
  const branchStart = topbarMenuItemSource.lastIndexOf('if (item.id ===', call.index);
  const nextBranch = topbarMenuItemSource.indexOf('if (item.id ===', call.index + call[0].length);
  const branchEnd = nextBranch >= 0 ? nextBranch : topbarMenuItemSource.length;
  const ownerClose = topbarMenuItemSource.indexOf("closeSettingsJumpMenu();", call.index + call[0].length);
  assert.ok(
    branchStart >= 0 && ownerClose > call.index && ownerClose < branchEnd,
    `${methodName} must open from its live folded-menu anchor, then explicitly close that topbar menu`
  );
}

const chatMenuSource = functionSource(workspaceSource, "openChatMenu", "  ");
const goToUrlEntry = chatMenuSource.indexOf("goToUrl:");
const nextChatMenuEntry = chatMenuSource.indexOf("newChat:", goToUrlEntry);
assert.ok(goToUrlEntry >= 0 && nextChatMenuEntry > goToUrlEntry, "the chat-menu Go To URL entry must remain discoverable");
const goToUrlSource = chatMenuSource.slice(goToUrlEntry, nextChatMenuEntry);
const closeWorkspaceMenuIndex = goToUrlSource.indexOf("closePopovers()");
const openGoToUrlIndex = goToUrlSource.indexOf("openGoToUrlDialog(group)");
assert.ok(
  closeWorkspaceMenuIndex >= 0 && openGoToUrlIndex > closeWorkspaceMenuIndex,
  "Go To URL must close its workspace menu before opening the editor modal"
);

console.log("Popover ownership and Summary Escape regression checks passed.");
