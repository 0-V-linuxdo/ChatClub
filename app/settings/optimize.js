import { el } from "../../ui/dom.js";
import { createSettingsKit } from "./kit.js";
import { createPromptTemplateSettings } from "./prompt-templates.js";
import { requireSettingsSectionStatePort } from "./section-contract.js";
import {
  requireControllerContext,
  requireControllerFunction,
  validateControllerContract
} from "../controller-contract.js";

export function createOptimizeSettingsSection(ctx) {
  const controllerName = "Optimize settings section";
  ctx = validateControllerContract(ctx, controllerName, {
    state: "object",
    svgIcon: "function",
    notifyConfigReload: "function",
    saveOptionsPatch: "function"
  });
  const state = requireSettingsSectionStatePort(
    requireControllerContext(ctx, controllerName, "state"),
    controllerName,
    ["options", "settingsPromptTemplateDragId"]
  );
  const svgIcon = requireControllerFunction(ctx, controllerName, "svgIcon");
  const notifyConfigReload = requireControllerFunction(ctx, controllerName, "notifyConfigReload");
  const saveOptionsPatch = requireControllerFunction(ctx, controllerName, "saveOptionsPatch");
  const promptTemplates = createPromptTemplateSettings({
    kind: "optimize",
    state,
    notifyConfigReload,
    saveOptionsPatch,
    settingsKit: createSettingsKit({ svgIcon })
  });

  function pane(redraw, goToSection = () => {}) {
    return el("div", { class: "settings-pane" }, promptTemplates.blocks(redraw, goToSection));
  }

  return Object.freeze({
    pane,
    reset: promptTemplates.reset
  });
}
