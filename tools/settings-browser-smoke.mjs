import { SETTINGS_SECTIONS } from "../app/settings/sections.js";

const EXPECTED_SETTINGS_TOOLTIP_IDS = Object.freeze(
  SETTINGS_SECTIONS.map(([id]) => `topbar.settings.${id}`)
);

function assertSettingsMenuItems(ids, browserTarget, assert) {
  assert(Array.isArray(ids), `${browserTarget}: Settings menu item probe did not return an array`);
  assert(ids.length === EXPECTED_SETTINGS_TOOLTIP_IDS.length, `${browserTarget}: Settings menu contains ${ids.length}/${EXPECTED_SETTINGS_TOOLTIP_IDS.length} sections: ${JSON.stringify(ids)}`);
  assert(new Set(ids).size === ids.length, `${browserTarget}: Settings menu contains duplicate sections: ${JSON.stringify(ids)}`);
  for (const id of EXPECTED_SETTINGS_TOOLTIP_IDS) {
    assert(ids.includes(id), `${browserTarget}: Settings menu is missing ${id}`);
  }
}

function assertSettingsFullscreenProbe(probe, browserTarget, assert) {
  assert(probe?.tabIds?.length === SETTINGS_SECTIONS.length, `${browserTarget}: Settings dialog contains ${probe?.tabIds?.length || 0}/${SETTINGS_SECTIONS.length} sections`);
  for (const [id] of SETTINGS_SECTIONS) {
    assert(probe.tabIds.includes(id), `${browserTarget}: Settings dialog is missing section ${id}`);
  }
  assert(probe.activeCount === 1, `${browserTarget}: Settings dialog did not open exactly one active section`);
  assert(probe.buttonCount === 1, `${browserTarget}: Settings fullscreen action is missing or duplicated`);
  assert(probe.entered === true, `${browserTarget}: Settings did not enter fullscreen`);
  assert(probe.activeBefore === probe.activeFullscreen, `${browserTarget}: entering Settings fullscreen changed the active section`);
  assert(probe.fullLabel && probe.fullLabel !== probe.initialLabel, `${browserTarget}: Settings fullscreen action label did not switch to restore`);
  assert(probe.mainStableFullscreen && probe.paneStableFullscreen && probe.draftStableFullscreen, `${browserTarget}: entering Settings fullscreen replaced live Settings content`);
  assert(probe.scrollBefore > 0 && probe.scrollFullscreen === probe.scrollBefore, `${browserTarget}: entering Settings fullscreen changed Settings scroll`);
  assert(Math.abs(probe.fullRect.left) <= 1 && Math.abs(probe.fullRect.top) <= 1, `${browserTarget}: fullscreen Settings did not align to the viewport origin`);
  assert(Math.abs(probe.fullRect.width - probe.viewport.width) <= 1, `${browserTarget}: fullscreen Settings width did not fill the viewport`);
  assert(Math.abs(probe.fullRect.height - probe.viewport.height) <= 1, `${browserTarget}: fullscreen Settings height did not fill the viewport`);
  assert(probe.restored === true, `${browserTarget}: Settings did not restore from fullscreen`);
  assert(probe.activeBefore === probe.activeRestored, `${browserTarget}: restoring Settings changed the active section`);
  assert(probe.restoredLabel === probe.initialLabel, `${browserTarget}: Settings fullscreen label did not restore`);
  assert(probe.mainStableRestored && probe.paneStableRestored && probe.draftStableRestored, `${browserTarget}: restoring Settings replaced live Settings content`);
  assert(probe.scrollRestored === probe.scrollBefore, `${browserTarget}: restoring Settings changed Settings scroll`);
  assert(probe.restoredRect.left > 0 && probe.restoredRect.top > 0, `${browserTarget}: restored Settings did not recover viewport margins`);
  assert(probe.restoredRect.width < probe.viewport.width && probe.restoredRect.height < probe.viewport.height, `${browserTarget}: restored Settings still fills a viewport dimension`);
}

function settingsFullscreenProbe() {
  const panel = document.querySelector(".settings-modal");
  const button = document.querySelector('[data-tooltip-id="settings.modal.fullscreen"]');
  document.querySelector('[data-settings-section-id="shortcuts"]')?.click();
  const settingsMain = document.querySelector(".settings-main");
  const settingsPane = settingsMain?.firstElementChild || null;
  const draftProbe = document.createElement("input");
  draftProbe.hidden = true;
  draftProbe.value = "settings-fullscreen-draft";
  settingsPane?.append(draftProbe);
  if (settingsMain) settingsMain.scrollTop = 8;
  const scrollBefore = settingsMain?.scrollTop || 0;
  const rect = (element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width, height: box.height };
  };
  const activeSection = () => document.querySelector(".settings-main")?.dataset.settingsSectionId || "";
  const initialLabel = button?.getAttribute("aria-label") || "";
  const activeBefore = activeSection();
  button?.click();
  const entered = Boolean(panel?.classList.contains("settings-modal-fullscreen"));
  const fullLabel = button?.getAttribute("aria-label") || "";
  const fullRect = panel ? rect(panel) : {};
  const activeFullscreen = activeSection();
  const mainStableFullscreen = document.querySelector(".settings-main") === settingsMain;
  const paneStableFullscreen = settingsMain?.firstElementChild === settingsPane;
  const draftStableFullscreen = draftProbe.isConnected && draftProbe.value === "settings-fullscreen-draft";
  const scrollFullscreen = settingsMain?.scrollTop || 0;
  button?.click();
  const result = {
    tabIds: Array.from(document.querySelectorAll(".settings-tab[data-settings-section-id]"), (tab) => tab.dataset.settingsSectionId),
    activeCount: document.querySelectorAll(".settings-modal .settings-tab.active").length,
    buttonCount: document.querySelectorAll('[data-tooltip-id="settings.modal.fullscreen"]').length,
    initialLabel,
    activeBefore,
    entered,
    fullLabel,
    fullRect,
    activeFullscreen,
    mainStableFullscreen,
    paneStableFullscreen,
    draftStableFullscreen,
    scrollBefore,
    scrollFullscreen,
    restored: Boolean(panel && !panel.classList.contains("settings-modal-fullscreen")),
    restoredLabel: button?.getAttribute("aria-label") || "",
    restoredRect: panel ? rect(panel) : {},
    activeRestored: activeSection(),
    mainStableRestored: document.querySelector(".settings-main") === settingsMain,
    paneStableRestored: settingsMain?.firstElementChild === settingsPane,
    draftStableRestored: draftProbe.isConnected && draftProbe.value === "settings-fullscreen-draft",
    scrollRestored: settingsMain?.scrollTop || 0,
    viewport: { width: window.innerWidth, height: window.innerHeight }
  };
  draftProbe.remove();
  return result;
}

export async function verifyChromiumSettingsDialog(page, assert) {
  const probe = await page.evaluate(settingsFullscreenProbe);
  assertSettingsFullscreenProbe(probe, "chromium", assert);
}

export async function verifyChromiumSettingsMenu(page, assert) {
  const settingsMenuButton = page.locator('[data-tooltip-id="topbar.settingsJumpMenu"]');
  await settingsMenuButton.click();
  const settingsMenu = page.locator(".topbar-settings-popover");
  await settingsMenu.waitFor({ state: "attached", timeout: 5000 });
  const ids = await settingsMenu.locator('[data-tooltip-id^="topbar.settings."]').evaluateAll(
    (items) => items.map((item) => item.dataset.tooltipId)
  );
  assertSettingsMenuItems(ids, "chromium", assert);
  await page.keyboard.press("Escape");
  await settingsMenu.waitFor({ state: "detached", timeout: 5000 });
}

export async function verifyFirefoxSettingsDialog(driver, assert) {
  const probe = await driver.executeScript(`return (${settingsFullscreenProbe})();`);
  assertSettingsFullscreenProbe(probe, "firefox", assert);
}

export async function verifyFirefoxSettingsMenu(driver, By, assert) {
  await driver.wait(async () => driver.findElements(By.css('[data-tooltip-id="topbar.settingsJumpMenu"]')).then((items) => items.length > 0), 25000);
  const ids = await driver.executeScript(`
    document.querySelector('[data-tooltip-id="topbar.settingsJumpMenu"]')?.click();
    return Array.from(document.querySelectorAll('.topbar-settings-popover [data-tooltip-id^="topbar.settings."]'), (item) => item.dataset.tooltipId);
  `);
  assertSettingsMenuItems(ids, "firefox", assert);
  await driver.executeScript(`document.querySelector('[data-tooltip-id="topbar.settingsJumpMenu"]')?.click();`);
}
