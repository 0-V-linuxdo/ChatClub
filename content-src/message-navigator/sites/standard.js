import { metaText, safeQsa, visible } from "../dom-kernel.js";
import {
  adapterBaseItems,
  genericRole
} from "../collection-kernel.js";
import {
  effectMatches,
  messageRootForEffect,
  closestEffectMatch
} from "../effect-target.js";

export function createStandardAdapters() {
  const adapters = Object.create(null);

  adapters.generic = {
    collect: (config) => adapterBaseItems(config)
  };
  adapters.claude = {
    role(element) {
      const meta = metaText(element);
      if (/user-message|data-author=.user|human/.test(meta)) return "user";
      if (/assistant|claude|response|font-claude-response/.test(meta)) return "assistant";
      return genericRole(element);
    },
    target(element) {
      return safeQsa(".font-claude-response-body, .font-claude-response, [data-testid='user-message'], .standard-markdown", element).find(visible) || element;
    },
    effectTarget(element, config, context = {}) {
      if (context.role === "user") {
        return closestEffectMatch(context.target || element, ".bg-bg-300,.group.relative.inline-flex,[data-testid='user-message']", config)
          || effectMatches(element, "[data-testid='user-message']", config)
          || context.target
          || element;
      }
      return closestEffectMatch(context.target || element, ".font-claude-response,.font-claude-response-body,[data-testid='assistant-message']", config, { allowBroad: true })
        || effectMatches(element, ".font-claude-response,.font-claude-response-body,.standard-markdown", config, { prefer: "largest" })
        || context.target
        || element;
    },
    collect(config) {
      return adapterBaseItems(config, this);
    }
  };
  adapters.deepseek = {
    role(element) {
      const meta = metaText(element);
      if (/\brole=.user\b|\buser\b|fbb737a4/.test(meta)) return "user";
      if (/\brole=.assistant\b|\bassistant\b|ds-markdown/.test(meta)) return "assistant";
      return genericRole(element);
    },
    target(element) {
      return safeQsa(".ds-markdown:not(.ds-think-content), .fbb737a4, [class*='markdown']", element).find(visible) || element;
    },
    effectTarget(element, config, context = {}) {
      const root = messageRootForEffect(element, context.target, config, { allowBroad: true });
      if (context.role === "user") {
        return effectMatches(root || element, ".fbb737a4", config, { prefer: "largest" })
          || context.target
          || root
          || element;
      }
      return effectMatches(root || element, ".ds-markdown:not(.ds-think-content)", config, { prefer: "last" })
        || effectMatches(root || element, ".ds-markdown,[class*='markdown']", config, { prefer: "largest" })
        || context.target
        || root
        || element;
    },
    summaryElement(element) {
      return safeQsa(".ds-markdown:not(.ds-think-content), .fbb737a4", element).find(visible) || element;
    },
    collect(config) {
      return adapterBaseItems(config, this);
    }
  };
  adapters.poe = {
    role(element) {
      const meta = metaText(element);
      if (/rightside|right-side|human|user/.test(meta)) return "user";
      if (/leftside|left-side|assistant|bot|message/.test(meta)) return "assistant";
      return genericRole(element);
    },
    target(element) {
      return safeQsa("[class*='Message_messageTextContainer'], [class*='Message_leftSideMessageBubble'], [class*='Message_rightSideMessageBubble'], [class*='messageText']", element).find(visible) || element;
    },
    effectTarget(element, config, context = {}) {
      const root = messageRootForEffect(element, context.target, config, { allowBroad: true });
      if (context.role === "user") {
        return effectMatches(root || element, "[class*='Message_rightSideMessageBubble'],[class*='rightSideMessageBubble'],[class*='messageText']", config)
          || context.target
          || root
          || element;
      }
      return effectMatches(root || element, "[class*='Message_leftSideMessageBubble'],[class*='Message_messageTextContainer'],[class*='messageText']", config, { prefer: "largest" })
        || root
        || context.target
        || element;
    },
    collect(config) {
      return adapterBaseItems(config, this);
    }
  };

  adapters.aiStudio = {
    role(element) {
      const role = element.getAttribute("data-turn-role") || element.getAttribute("role") || "";
      if (/user/i.test(role)) return "user";
      if (/assistant|model/i.test(role)) return "assistant";
      if (safeQsa("ms-thought-chunk, [class*='thought' i]", element).length) return "thinking";
      return genericRole(element);
    },
    target(element) {
      return safeQsa(".turn-content, [class*='turn-content'], .markdown, [class*='markdown']", element).find(visible) || element;
    },
    effectTarget(element, config, context = {}) {
      const root = messageRootForEffect(element, context.target, config, { allowBroad: true });
      return effectMatches(root || element, ".turn-content,[class*='turn-content'],.markdown,[class*='markdown']", config, { prefer: context.role === "user" ? "" : "largest" })
        || root
        || context.target
        || element;
    },
    collect(config) {
      return adapterBaseItems(config, this);
    }
  };

  adapters.lechat = {
    role(element) {
      const role = element.getAttribute("data-message-author-role") || "";
      if (/user/i.test(role)) return "user";
      if (/assistant/i.test(role)) return "assistant";
      if (element.getAttribute("data-message-part-type") === "answer") return "assistant";
      return genericRole(element);
    },
    target(element) {
      return safeQsa("[data-message-part-type='answer'].markdown-container-style, .markdown-container-style, .rounded-3xl, .break-words", element).find(visible) || element;
    },
    effectTarget(element, config, context = {}) {
      const root = messageRootForEffect(element, context.target, config, { allowBroad: true });
      if (context.role === "user") {
        return effectMatches(root || element, ".rounded-3xl,.break-words", config)
          || context.target
          || root
          || element;
      }
      return effectMatches(root || element, "[data-message-part-type='answer'].markdown-container-style,.markdown-container-style,.break-words", config, { prefer: "largest" })
        || context.target
        || root
        || element;
    },
    collect(config) {
      return adapterBaseItems(config, this);
    }
  };

  return Object.freeze(adapters);
}
