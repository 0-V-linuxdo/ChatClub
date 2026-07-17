import {
  cloneText,
  metaText,
  normalize,
  safeQsa,
  usefulTurnText,
  visible
} from "../dom-kernel.js";
import { adapterBaseItems, genericRole } from "../collection-kernel.js";
import { effectMatches, messageRootForEffect } from "../effect-target.js";

const geminiChromeLinePattern = /^(?:Copy prompt|Copy|Copied|Edit|Good response|Bad response|Redo|Show more options|Share|Export|Open menu for conversation actions\.?|Ask Gemini|Microphone|Upload & tools|Send message|Flash(?:[-\s]?Lite)?|Flash|Pro|Experimental|Deep Research|Canvas|Search|Explain|Translate|翻译|搜索|复制|已复制|编辑|重新生成|更多|分享|导出|点赞|点踩)$/i;
const geminiAnnouncementPattern = /(?:You said|You asked|You wrote|Gemini said|Gemini answered|你说|您说|Gemini\s*说|Gemini\s*回答)/i;
function stripGeminiAnnouncements(value) {
  return String(value || "")
    .replace(new RegExp(`(^|\\n)\\s*(?:${geminiAnnouncementPattern.source})(?:\\s*[:：]\\s*|\\s+)(?=\\S)`, "gi"), "$1")
    .replace(new RegExp(`(^|\\n)\\s*(?:${geminiAnnouncementPattern.source})\\s*(?=\\n|$)`, "gi"), "\n")
    .replace(/(^|\n)\s*(?:Copy prompt|Copy|Copied|Edit|Good response|Bad response|Redo|Show more options)\s*(?=\n|$)/gi, "\n");
}

function cleanGeminiText(value) {
  const text = normalize(stripGeminiAnnouncements(value))
    .split(/\n+/)
    .map((line) => line.trim().replace(new RegExp(`^(?:${geminiAnnouncementPattern.source})(?:\\s*[:：]\\s*|\\s+)`, "i"), "").trim())
    .filter((line) => line && !geminiChromeLinePattern.test(line))
    .join("\n");
  return usefulTurnText(text);
}

export function createGeminiAdapter() {
  const adapter = {
    role(element) {
      const meta = metaText(element);
      if (/user-query|query|user/.test(meta)) return "user";
      if (/model-response|model|assistant|response/.test(meta)) return "assistant";
      return genericRole(element);
    },
    target(element) {
      return safeQsa(
        ".model-response-text .markdown, message-content .markdown, .markdown, .query-text, .query-content, .user-query-bubble-with-background",
        element
      ).find(visible) || element;
    },
    effectTarget(element, config, context = {}) {
      const root = messageRootForEffect(element, context.target, config, { allowBroad: true });
      if (context.role === "user") {
        return effectMatches(
          root || element,
          ".user-query-bubble-with-background,.query-text,.query-content,.user-query-container",
          config
        ) || context.target || root || element;
      }
      return effectMatches(
        root || element,
        ".model-response-text .markdown,message-content .markdown,.model-response-text,message-content,.response-container-content,.response-container,structured-content-container",
        config,
        { prefer: "largest" }
      ) || root || context.target || element;
    },
    text(element, config, context = {}) {
      const cleanupSelectors = Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : [];
      return cleanGeminiText(
        cloneText(context.textSource || context.target || element, cleanupSelectors)
        || cloneText(element, cleanupSelectors)
      );
    },
    collect(config) {
      return adapterBaseItems(config, this);
    }
  };
  return Object.freeze(adapter);
}
