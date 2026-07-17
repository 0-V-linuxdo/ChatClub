import {
  cloneText,
  compactText,
  elementOrder,
  inChromeScope,
  pageRoot,
  safeClosest,
  safeQsa,
  usefulTurnText,
  visible
} from "../dom-kernel.js";
import {
  adapterBaseItems,
  candidateTextBlocks,
  conversationLooksUseful,
  dedupeItems,
  genericRole
} from "../collection-kernel.js";
import {
  chatGptAssistantEffectBlock,
  closestEffectMatch,
  effectMatches,
  messageRootForEffect,
  roleRootForEffect
} from "../effect-target.js";

function chatgptFallbackItems(config) {
  const root = pageRoot("main,[role='main']");
  const roleNodes = safeQsa("[data-message-author-role='user'], [data-message-author-role='assistant']", root)
    .filter((element) => visible(element) && !inChromeScope(element))
    .sort(elementOrder);
  const items = roleNodes.map((element) => {
    const role = /user/i.test(element.getAttribute("data-message-author-role") || "") ? "user" : "assistant";
    const target = safeQsa([
      ".user-message-bubble-color",
      ".assistant-message-bubble-color",
      "[class*='message-bubble']",
      ".markdown.prose",
      ".markdown"
    ].join(","), element).find(visible) || element;
    const text = usefulTurnText(cloneText(target, config.textCleanupSelectors) || cloneText(element, config.textCleanupSelectors));
    return { element, target, role, text: compactText(text, config.summaryMaxChars) };
  });
  if (conversationLooksUseful(items)) return dedupeItems(items);
  const blocks = candidateTextBlocks(root, config, [
    "article",
    "[data-testid*='conversation-turn']",
    "[class*='message' i]",
    ".markdown",
    ".prose"
  ].join(","));
  return dedupeItems(blocks.map((item, index) => ({
    ...item,
    role: genericRole(item.element, config) || (index % 2 === 0 ? "user" : "assistant"),
    text: compactText(item.text, config.summaryMaxChars)
  })));
}

export function createChatGptAdapter() {
  const adapter = {
    role(element) {
      const role = element.getAttribute("data-message-author-role")
        || safeQsa("[data-message-author-role]", element)[0]?.getAttribute("data-message-author-role")
        || "";
      if (/user/i.test(role)) return "user";
      if (/assistant|tool/i.test(role)) return "assistant";
      return genericRole(element);
    },
    target(element, config = {}) {
      const role = this.role(element);
      const roleRoot = role === "user" || role === "assistant"
        ? roleRootForEffect(element, element, `[data-message-author-role='${role}']`, config, role)
        : null;
      const root = roleRoot || element;
      return safeQsa([
        ".user-message-bubble-color",
        ".assistant-message-bubble-color",
        "[class*='message-bubble']",
        ".markdown.prose",
        ".markdown",
        "[data-message-author-role]"
      ].join(","), root).find(visible) || root || element;
    },
    effectTarget(element, config, context = {}) {
      const effectRole = context.effectRole || (context.role === "user" ? "user" : "assistant");
      const roleRoot = roleRootForEffect(
        element,
        context.target,
        `[data-message-author-role='${effectRole}']`,
        config,
        effectRole
      );
      const root = roleRoot || messageRootForEffect(
        element,
        context.target,
        config,
        { allowBroad: true, role: effectRole }
      );
      if (effectRole === "user") {
        return effectMatches(root || element, [
          ".user-message-bubble-color",
          "[class*='user-message-bubble' i]",
          "[class*='message-bubble' i]",
          "[class*='bubble-color' i]"
        ].join(","), config, { role: effectRole }) || root || context.target || element;
      }
      const assistantBlock = chatGptAssistantEffectBlock(element, context.target, config);
      return assistantBlock
        || roleRoot
        || closestEffectMatch(context.target || element, [
          "article[data-testid^='conversation-turn-']",
          "article[data-testid*='conversation-turn']",
          "article[data-turn-id]",
          "article[data-turn]",
          "[data-message-author-role='assistant']"
        ].join(","), config, { allowBroad: true, role: effectRole })
        || root
        || effectMatches(element, ".markdown.prose,.markdown", config, { prefer: "largest", role: effectRole })
        || context.target
        || element;
    },
    collect(config) {
      const base = adapterBaseItems(config, this).filter((item) => !safeClosest(item.element, "aside"));
      return conversationLooksUseful(base) ? base : chatgptFallbackItems(config);
    }
  };
  return Object.freeze(adapter);
}
