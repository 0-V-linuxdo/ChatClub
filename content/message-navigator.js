(() => {
  /*
   * ChatClub Message Navigator.
   * Adapted from Notion-style-AI-Navigator-main by 0-V-linuxdo under the MIT License.
   */
  const GLOBAL_NAME = "__CHATCLUB_MESSAGE_NAVIGATOR__";
  const VERSION = "2026.07.08.5";
  if (window[GLOBAL_NAME]?.version === VERSION) return;
  try { window[GLOBAL_NAME]?.destroy?.(); } catch {}

  const ROOT_ID = "chatclub-message-nav-root";
  const STYLE_ID = "chatclub-message-nav-style";
  const EFFECT_MODES = new Set(["none", "border", "pulse", "fade", "jiggle"]);
  const ADAPTERS = Object.create(null);

  const normalize = (value) => String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  function safeQsa(selector, root = document) {
    try {
      return selector ? Array.from((root || document).querySelectorAll(selector)) : [];
    } catch {
      return [];
    }
  }

  function safeClosest(element, selector) {
    try {
      return element?.closest?.(selector) || null;
    } catch {
      return null;
    }
  }

  function safeMatches(element, selector) {
    try {
      return Boolean(element?.matches?.(selector));
    } catch {
      return false;
    }
  }

  function visible(element) {
    if (!element || element.nodeType !== 1) return false;
    try {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 2 && rect.height > 2 && style.display !== "none" && style.visibility !== "hidden";
    } catch {
      return false;
    }
  }

  function elementOrder(a, b) {
    try {
      if (a === b) return 0;
      const pos = a.compareDocumentPosition(b);
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : pos & Node.DOCUMENT_POSITION_PRECEDING ? 1 : 0;
    } catch {
      return 0;
    }
  }

  function uniqueElements(elements) {
    const out = [];
    for (const element of elements || []) {
      if (!element || out.includes(element)) continue;
      if (out.some((other) => other !== element && other.contains?.(element))) continue;
      for (let index = out.length - 1; index >= 0; index -= 1) {
        if (element.contains?.(out[index])) out.splice(index, 1);
      }
      out.push(element);
    }
    return out.sort(elementOrder);
  }

  function cloneText(element, cleanupSelectors = []) {
    if (!element) return "";
    let clone;
    try {
      clone = element.cloneNode(true);
    } catch {
      return normalize(element.innerText || element.textContent || "");
    }
    const noisy = [
      "button",
      "svg",
      "header",
      "footer",
      "nav",
      "menu",
      "form",
      "input",
      "textarea",
      "select",
      "[aria-hidden='true']",
      "[hidden]",
      "[role='toolbar']",
      "[data-files]",
      "[data-edit]",
      ".sr-only",
      ".visually-hidden",
      ".selector",
      ".code-buttons",
      ...cleanupSelectors
    ];
    for (const selector of noisy) {
      for (const node of safeQsa(selector, clone)) node.remove();
    }
    return normalize(clone.innerText || clone.textContent || "");
  }

  function compactText(value, limit = 60) {
    const text = normalize(value).replace(/\s+/g, " ");
    if (!text) return "";
    const max = Math.max(20, Math.min(180, Number(limit) || 60));
    return text.length > max ? `${text.slice(0, Math.max(0, max - 1)).trim()}...` : text;
  }

  function rawText(element) {
    return normalize(element?.innerText || element?.textContent || "");
  }

  function metaText(element) {
    return normalize([
      element?.tagName,
      element?.getAttribute?.("id"),
      element?.getAttribute?.("role"),
      element?.getAttribute?.("aria-label"),
      element?.getAttribute?.("title"),
      element?.getAttribute?.("data-testid"),
      element?.getAttribute?.("data-test-id"),
      element?.getAttribute?.("data-message-author-role"),
      element?.getAttribute?.("data-author"),
      element?.getAttribute?.("data-turn-role"),
      element?.getAttribute?.("data-message-role"),
      element?.getAttribute?.("class")
    ].filter(Boolean).join(" ")).toLowerCase();
  }

  function fullMetaText(element) {
    return normalize([
      metaText(element),
      element?.getAttribute?.("name"),
      element?.getAttribute?.("value"),
      element?.textContent,
      element?.innerText
    ].filter(Boolean).join(" "));
  }

  function pageRoot(selector = "main,[role='main']") {
    return safeQsa(selector).filter(visible).find((element) => !safeClosest(element, "nav,aside,header,footer"))
      || safeQsa("main,[role='main']").filter(visible).find((element) => !safeClosest(element, "nav,aside,header,footer"))
      || document.body
      || document.documentElement;
  }

  function inChromeScope(element) {
    return Boolean(safeClosest(element, [
      `#${ROOT_ID}`,
      "nav",
      "aside",
      "header",
      "footer",
      "form",
      "input",
      "textarea",
      "select",
      "[contenteditable='true']"
    ].join(",")));
  }

  function cleanLine(value) {
    return normalize(value)
      .replace(/^[-•]\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function referenceOnlyText(value) {
    const text = normalize(value).replace(/\s+/g, " ");
    if (!text) return true;
    if (/^(?:References|Sources|Citations|引用|来源|参考)\b/i.test(text)) return true;
    if (/^\(?\d+\s+total\)?$/i.test(text)) return true;
    if (/^(?:https?:\/\/|[\w.-]+\.[a-z]{2,})(?:\s+\d+%)?$/i.test(text)) return true;
    return false;
  }

  function controlOnlyText(value) {
    const text = normalize(value).replace(/\s+/g, " ");
    return /^(?:copy|copied|copy message|copy response|copy text|复制|已复制|拷贝|Quick|Default|Prompt|助手|其他|High|Send|Ask anything|Message)$/i.test(text);
  }

  function usefulTurnText(value, maxLength = 50000) {
    const text = normalize(value);
    if (!text || text.length < 2 || text.length > maxLength) return "";
    if (!/[\w\u4e00-\u9fff]/.test(text)) return "";
    if (controlOnlyText(text) || referenceOnlyText(text)) return "";
    return text;
  }

  function conversationLooksUseful(items = []) {
    const useful = items.filter((item) => item?.element && item?.text);
    return useful.length >= 2 && useful.some((item) => item.role === "user") && useful.some((item) => item.role === "assistant");
  }

  function nearestTextAncestor(seed, cleanupSelectors = [], options = {}) {
    const root = options.root || pageRoot();
    const maxDepth = Math.max(3, Math.min(16, Number(options.maxDepth) || 10));
    const maxLength = Math.max(500, Math.min(80000, Number(options.maxLength) || 50000));
    let node = seed;
    for (let depth = 0; node && node !== document.documentElement && depth < maxDepth; depth += 1, node = node.parentElement) {
      if (!visible(node)) continue;
      if (node !== seed && inChromeScope(node)) continue;
      const text = usefulTurnText(cloneText(node, cleanupSelectors), maxLength);
      if (text && node !== seed) return { element: node, text };
      if (node === root || safeMatches(node, "main,[role='main'],body")) break;
    }
    return null;
  }

  function messageCopyButton(button) {
    const meta = fullMetaText(button);
    return /\bcopy\s+message\b|复制(?:消息|讯息)|拷贝(?:消息|讯息)/i.test(meta);
  }

  function referenceCopyButton(button) {
    const meta = fullMetaText(button);
    return /\bcopy\s+(?:references?|sources?|citations?)\b|引用|来源|参考|citation|source/i.test(meta);
  }

  function collectFromCopyButtons(config, options = {}) {
    const cleanupSelectors = Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : [];
    const root = pageRoot(options.rootSelector || "main,[role='main']");
    const buttons = safeQsa("button,[role='button']", root)
      .filter((button) => visible(button) && !inChromeScope(button) && messageCopyButton(button) && !referenceCopyButton(button))
      .sort(elementOrder)
      .slice(0, Math.max(4, Math.min(80, Number(options.limit) || 48)));
    const items = [];
    const seen = new Set();
    for (const button of buttons) {
      const ancestor = nearestTextAncestor(button, cleanupSelectors, { root, maxDepth: options.maxDepth || 10 });
      if (!ancestor) continue;
      const role = genericRole(ancestor.element, config) || (items.length % 2 === 0 ? "user" : "assistant");
      const key = `${role}\n${ancestor.text.toLowerCase().replace(/\s+/g, " ").slice(0, 500)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        element: ancestor.element,
        target: ancestor.element,
        role,
        text: compactText(ancestor.text, config.summaryMaxChars)
      });
    }
    return dedupeItems(items);
  }

  function candidateTextBlocks(root, config, selector, options = {}) {
    const cleanupSelectors = Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : [];
    const nodes = uniqueElements(safeQsa(selector, root)
      .filter((element) => visible(element) && !inChromeScope(element))
      .filter((element) => !options.reject?.(element)));
    const items = [];
    const seen = new Set();
    for (const element of nodes) {
      const text = usefulTurnText(cloneText(element, cleanupSelectors), options.maxLength || 50000);
      if (!text) continue;
      const key = text.toLowerCase().replace(/\s+/g, " ").slice(0, 500);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ element, target: element, text });
    }
    return items.sort((a, b) => elementOrder(a.element, b.element));
  }

  function elementArea(element) {
    try {
      const rect = element.getBoundingClientRect();
      return Math.max(1, rect.width * rect.height);
    } catch {
      return Number.MAX_SAFE_INTEGER;
    }
  }

  function textMatchesNeedle(text, needle) {
    const haystack = cleanLine(text).toLowerCase();
    const rawNeedle = cleanLine(needle).toLowerCase();
    if (!haystack || !rawNeedle) return false;
    const compactNeedle = rawNeedle.length > 96 ? rawNeedle.slice(0, 96).trim() : rawNeedle;
    return haystack.includes(compactNeedle)
      || (haystack.length >= 12 && rawNeedle.includes(haystack));
  }

  function targetForText(root, config, needles, options = {}) {
    const cleanupSelectors = Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : [];
    const selector = options.selector || "article,section,div,p,[role='article'],[data-message-author-role],[data-testid*='message'],[class*='message' i],[class*='bubble' i],[class*='response' i]";
    const wanted = (Array.isArray(needles) ? needles : [needles]).map(cleanLine).filter(Boolean);
    if (!wanted.length) return root;
    const candidates = safeQsa(selector, root)
      .filter((element) => element !== root && visible(element) && !inChromeScope(element))
      .filter((element) => !options.reject?.(element))
      .map((element) => ({ element, text: cloneText(element, cleanupSelectors) }))
      .filter((item) => usefulTurnText(item.text, options.maxLength || 60000))
      .filter((item) => wanted.some((needle) => textMatchesNeedle(item.text, needle)));
    candidates.sort((a, b) => {
      const area = elementArea(a.element) - elementArea(b.element);
      return area || a.text.length - b.text.length || elementOrder(a.element, b.element);
    });
    return candidates[0]?.element || root;
  }

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

  const notionChromeLinePattern = /^(?:Notion AI|\/|history|Delete, rename, and more…?|Give context|Settings|Gemini\s+\d|Do anything with AI\.{0,3}|Ask anything|Response copied to clipboard|Copied to clipboard|Loading\.?|Start voice recording|Submit AI message)$/i;
  const notionMetaLinePattern = /^(?:\d+\s*steps?|\d{1,2}:\d{2}\s*(?:AM|PM)?|Today|Yesterday|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2}(?:,\s*\d{4})?)$/i;
  const geminiChromeLinePattern = /^(?:Copy prompt|Copy|Copied|Edit|Good response|Bad response|Redo|Show more options|Share|Export|Open menu for conversation actions\.?|Ask Gemini|Microphone|Upload & tools|Send message|Flash(?:[-\s]?Lite)?|Flash|Pro|Experimental|Deep Research|Canvas|Search|Explain|Translate|翻译|搜索|复制|已复制|编辑|重新生成|更多|分享|导出|点赞|点踩)$/i;
  const geminiAnnouncementPattern = /(?:You said|You asked|You wrote|Gemini said|Gemini answered|你说|您说|Gemini\s*说|Gemini\s*回答)/i;
  const grokUiLinePattern = /^(?:Copy|Copied|Copy message|Copy response|Create share link|Like|Dislike|Regenerate|More actions|More options|Share|Edit|Search|DeepThink|Ask anything|Upgrade to SuperGrok|New conversation - Grok|AI-generated, for reference only|This response is AI-generated, for reference only|Necessary cookies only|Accept all cookies|Cookie Settings|\d+ sources?|\d+ web pages|Thought for .*|思考了.*|复制|已复制|点赞|点踩|更多|分享|编辑|搜索)$/i;
  const kagiModeLinePattern = /^(?:Quick|Expert|Research|Fast|Deep|Creative|Balanced|Precise|Custom|快速|专家|研究)$/i;
  const kagiMetaLinePattern = /^(?:\d{1,2}:\d{2}\s*(?:AM|PM)?|Today|Yesterday)$/i;
  const kagiChromeLinePattern = /^(?:Kagi Assistant|Kagi products|Settings|Search threads|Thread navigation|Folders|Threads|Add folder|Start organizing your threads\.?|Ask anything\.{0,3}|Message|View message statistics|Copy message|Copied|Send)$/i;

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

  function cleanGrokText(value) {
    const lines = normalize(String(value || "").replace(/\r\n?/g, "\n").replace(/Show more\s*Show less/gi, ""))
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line && !grokUiLinePattern.test(line));
    const text = trimGrokSourceLead(lines).join("\n");
    return usefulTurnText(text);
  }

  function grokSourceCardLine(line) {
    const text = cleanLine(line);
    if (!text) return true;
    if (/^(?:https?:\/\/)?(?:www\.)?[\w-]+(?:\.[\w-]+)+(?:\/\S*)?$/i.test(text)) return true;
    if (/^(?:https?:\/\/)?(?:www\.)?[\w-]+(?:\.[\w-]+)+[^\u4e00-\u9fff]{0,160}$/i.test(text)) return true;
    if (/^(?:How to|What is|What are|Why|Chrome|Google|Wikipedia|YouTube|GitHub|Stack Overflow)\b/i.test(text) && !/[\u4e00-\u9fff。！？]/.test(text) && text.length <= 160) return true;
    if (/^(?:[\w.-]+\.)+[a-z]{2,}\S+/i.test(text) && !/[\u4e00-\u9fff]/.test(text)) return true;
    return false;
  }

  function grokAnswerStartLine(line) {
    const text = cleanLine(line);
    if (!text) return false;
    if (/^(?:你好|您好|当然|可以|这个|这里|这是|我(?:是|会|可以|来)|以下|简单来说|总之|结论|Sure\b|Here\b|Absolutely\b|In short\b|The short answer\b|To\b)/i.test(text)) return true;
    if (/[\u4e00-\u9fff]/.test(text) && text.length >= 14 && /[。！？!?.，,]/.test(text)) return true;
    return text.length >= 140 && /[.!?。！？]/.test(text);
  }

  function trimGrokEmbeddedSourcePrefix(line) {
    return cleanLine(line).replace(/^(?:https?:\/\/)?(?:www\.)?[\w-]+(?:\.[\w-]+)+(?:[^\u4e00-\u9fff\n]{0,220}?)(?=(?:你好|您好|当然|可以|这个|这里|这是|我是|我会|以下|简单来说|总之|结论))/i, "");
  }

  function trimGrokSourceLead(lines = []) {
    const normalizedLines = lines.map(trimGrokEmbeddedSourcePrefix).map(cleanLine).filter(Boolean);
    const answerIndex = normalizedLines.findIndex(grokAnswerStartLine);
    if (answerIndex > 0 && normalizedLines.slice(0, answerIndex).some(grokSourceCardLine)) {
      return normalizedLines.slice(answerIndex);
    }
    let start = 0;
    while (start < normalizedLines.length - 1 && grokSourceCardLine(normalizedLines[start])) start += 1;
    return normalizedLines.slice(start);
  }

  function grokTextOf(element, config = {}) {
    const cleanupSelectors = Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : [];
    return cleanGrokText(cloneText(element, cleanupSelectors));
  }

  function grokThoughtLabel(value) {
    const match = normalize(value).match(/(?:\bThought for\s+[^,。\n]{1,32}|思考了\s*[^,。\n]{1,32})/i);
    return match ? normalize(match[0]) : "";
  }

  function grokLooksMessageText(value) {
    const text = cleanGrokText(value);
    if (!text || text.length < 2 || text.length > 45000) return false;
    if (/Simple Chat Hub|Summary Panel|pages checked/i.test(text)) return false;
    return /[A-Za-z0-9\u4e00-\u9fff]/.test(text);
  }

  function grokCompactKey(value) {
    return normalize(value).toLowerCase()
      .replace(/\[[^\]]+\]\([^)]*\)/g, "$1")
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
  }

  function grokStripUserPromptPrefix(value, expected) {
    const text = cleanGrokText(value);
    const prompt = cleanGrokText(expected);
    const promptKey = grokCompactKey(prompt);
    if (!text || !promptKey) return text;
    if (grokCompactKey(text) === promptKey) return "";
    if (text.toLowerCase().startsWith(prompt.toLowerCase())) {
      const stripped = cleanGrokText(text.slice(prompt.length));
      if (stripped && grokCompactKey(stripped) !== promptKey) return stripped;
    }
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    let index = 0;
    let consumed = "";
    while (index < Math.min(lines.length, 4)) {
      consumed = cleanGrokText([consumed, lines[index]].filter(Boolean).join("\n"));
      const consumedKey = grokCompactKey(consumed);
      if (consumedKey && (consumedKey === promptKey || promptKey.includes(consumedKey) || consumedKey.includes(promptKey))) {
        index += 1;
        if (consumedKey === promptKey || consumedKey.includes(promptKey)) break;
        continue;
      }
      break;
    }
    if (index > 0) {
      const stripped = cleanGrokText(lines.slice(index).join("\n"));
      if (stripped && grokCompactKey(stripped) !== promptKey) return stripped;
      if (!stripped) return "";
    }
    return text;
  }

  function grokLooksLeadingUserPrompt(line, expected = "") {
    const text = normalize(line);
    if (!text || text.length > 280) return false;
    const textKey = grokCompactKey(text);
    const promptKey = grokCompactKey(expected);
    if (promptKey && textKey && (textKey === promptKey || promptKey.includes(textKey) || textKey.includes(promptKey))) return true;
    if (/[?？]\s*$/.test(text)) return true;
    return /^(?:请|帮|为什么|为何|怎么|如何|能否|可以|what|why|how|please|tell|explain|summari[sz]e|can you|could you)\b/i.test(text);
  }

  function grokStripLeadingUserPromptLine(value, expected = "") {
    const text = cleanGrokText(value);
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) return text;
    const rest = cleanGrokText(lines.slice(1).join("\n"));
    if (!rest || rest.length < 12 || !grokLooksLeadingUserPrompt(lines[0], expected)) return text;
    return rest;
  }

  function grokPreviousTextBlock(root, marker, config) {
    const markerRect = (() => {
      try { return marker?.getBoundingClientRect?.() || null; } catch { return null; }
    })();
    const candidates = [];
    for (const node of safeQsa("article,section,div,[role]", root)) {
      if (!visible(node) || node === marker || node.contains?.(marker) || inChromeScope(node)) continue;
      if (elementOrder(node, marker) >= 0) continue;
      const text = grokTextOf(node, config);
      if (!grokLooksMessageText(text) || /Thought for|思考了|Upgrade to SuperGrok|Ask anything/i.test(text)) continue;
      const rect = (() => {
        try { return node.getBoundingClientRect(); } catch { return null; }
      })();
      if (markerRect && rect && rect.bottom > markerRect.top + 80) continue;
      const tooBroad = safeQsa("article,section,div,[role]", node).some((child) => {
        if (child === node || !visible(child)) return false;
        const childText = grokTextOf(child, config);
        return grokLooksMessageText(childText) && childText.length >= Math.min(text.length * 0.65, text.length - 8);
      });
      if (tooBroad && text.length > 300) continue;
      candidates.push({ node, rect, text });
    }
    candidates.sort((a, b) => {
      if (a.rect && b.rect && Math.abs(a.rect.bottom - b.rect.bottom) > 4) return b.rect.bottom - a.rect.bottom;
      return elementArea(a.node) - elementArea(b.node) || elementOrder(a.node, b.node);
    });
    return candidates[0] || null;
  }

  function grokAssistantNodeForMarker(root, marker, config) {
    let best = marker;
    for (let node = marker; node && node !== root && node !== document.body; node = node.parentElement) {
      if (inChromeScope(node)) continue;
      const raw = rawText(node);
      const text = grokTextOf(node, config);
      if (text.length > 40 && /Thought for|思考了/i.test(raw) && !/Ask anything|Upgrade to SuperGrok|Home page|Notifications/i.test(raw)) {
        best = node;
        if (text.length > 120) break;
      }
    }
    return best;
  }

  function grokDomItems(config) {
    const root = pageRoot("main,[role='main']");
    const markerSelectors = ["button,[role='button']", "button,div,span,[role='button']", "article,section,div,[role]"];
    let markers = [];
    for (const selector of markerSelectors) {
      const seen = new Set();
      markers = safeQsa(selector, root)
        .filter((node) => visible(node) && !inChromeScope(node) && grokThoughtLabel(rawText(node)))
        .sort(elementOrder)
        .filter((node) => {
          const rect = (() => {
            try { return node.getBoundingClientRect(); } catch { return null; }
          })();
          const key = `${grokThoughtLabel(rawText(node)).toLowerCase()}|${Math.round((rect?.top || 0) / 8)}`;
          if (!key.trim() || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      if (markers.length) break;
    }
    const items = [];
    const assistantSeen = new Set();
    for (const marker of markers.slice(0, 10)) {
      const assistantNode = grokAssistantNodeForMarker(root, marker, config);
      const user = grokPreviousTextBlock(root, assistantNode, config) || grokPreviousTextBlock(root, marker, config);
      const assistantText = grokStripLeadingUserPromptLine(grokStripUserPromptPrefix(grokTextOf(assistantNode, config), user?.text || ""), user?.text || "");
      const assistantKey = assistantText.toLowerCase().replace(/\s+/g, " ").slice(0, 500);
      if (!assistantText || assistantSeen.has(assistantKey)) continue;
      assistantSeen.add(assistantKey);
      if (user?.node) {
        items.push({
          element: user.node,
          target: user.node,
          role: "user",
          text: compactText(user.text, config.summaryMaxChars)
        });
      }
      items.push({
        element: assistantNode,
        target: assistantNode,
        role: "assistant",
        text: compactText(assistantText, config.summaryMaxChars)
      });
    }
    return dedupeItems(items);
  }

  function notionLikelyPrompt(line) {
    return /[?？]$|^(?:介绍|搜索|请|帮|写|总结|解释|翻译|生成|分析|列出|查找|Tell|What|How|Why|Please|Search|Summarize|Explain|Write)\b/i.test(line);
  }

  function trimNotionPromptMeta(line) {
    return cleanLine(line)
      .replace(/\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2}(?:,\s*\d{4})?$/i, "")
      .replace(/\s+(?:Today|Yesterday)$/i, "")
      .trim();
  }

  function notionLines(root) {
    const lines = [];
    for (const rawLine of rawText(root).split(/\n+/)) {
      const line = cleanLine(rawLine);
      if (!line || line.length < 2) continue;
      if (notionChromeLinePattern.test(line)) continue;
      if (!lines.includes(line)) lines.push(line);
    }
    return lines;
  }

  function notionPromptFromIndex(lines, index) {
    const seed = trimNotionPromptMeta(lines[index]);
    if (!seed) return null;
    const parts = [seed];
    let startIndex = index;
    for (let previous = index - 1; previous >= Math.max(0, index - 3); previous -= 1) {
      const line = trimNotionPromptMeta(lines[previous]);
      if (!line || notionMetaLinePattern.test(line) || notionChromeLinePattern.test(line)) break;
      if (/^(?:搜索|Search)\s*[:：]/i.test(line)) {
        parts.unshift(line);
        startIndex = previous;
        break;
      }
      if (line.length <= 48 && !/[。.!！?？]$/.test(line) && /[?？]$/.test(seed)) {
        parts.unshift(line);
        startIndex = previous;
        continue;
      }
      break;
    }
    const text = usefulTurnText(parts.join("\n"));
    return text ? { text, parts, startIndex, endIndex: index } : null;
  }

  function kagiLines(root) {
    const lines = [];
    for (const rawLine of rawText(root).split(/\n+/)) {
      const line = cleanLine(rawLine);
      if (!line || line.length < 2) continue;
      if (kagiChromeLinePattern.test(line) || kagiMetaLinePattern.test(line)) continue;
      if (referenceOnlyText(line)) continue;
      if (!lines.includes(line)) lines.push(line);
    }
    return lines;
  }

  function kagiPromptFromLines(lines) {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!/^(?:搜索|Search)\s*[:：]/i.test(line)) continue;
      const parts = [line];
      let endIndex = index;
      for (let next = index + 1; next < Math.min(lines.length, index + 5); next += 1) {
        const nextLine = lines[next];
        if (kagiModeLinePattern.test(nextLine) || kagiChromeLinePattern.test(nextLine)) break;
        if (/^(?:Searched with Kagi|Using full content from|Gathered details on)\b/i.test(nextLine)) break;
        parts.push(nextLine);
        endIndex = next;
        if (/[?？]$/.test(nextLine)) break;
      }
      const text = usefulTurnText(parts.join("\n"));
      if (text) return { text, index, endIndex, parts };
    }
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!notionLikelyPrompt(line)) continue;
      const previous = lines[index - 1];
      const parts = previous && !kagiModeLinePattern.test(previous) && !kagiChromeLinePattern.test(previous) && previous.length < 80
        ? [previous, line]
        : [line];
      const text = usefulTurnText(parts.join("\n"));
      if (text) return { text, index: Math.max(0, index - (parts.length - 1)), endIndex: index, parts };
    }
    return null;
  }

  function kagiDomFallbackItems(config) {
    const root = pageRoot("main,[role='main']");
    const lines = kagiLines(root);
    const prompt = kagiPromptFromLines(lines);
    if (!prompt) return [];
    let answerStart = prompt.endIndex + 1;
    while (answerStart < lines.length && (kagiModeLinePattern.test(lines[answerStart]) || kagiChromeLinePattern.test(lines[answerStart]) || kagiMetaLinePattern.test(lines[answerStart]))) {
      answerStart += 1;
    }
    const assistantLines = [];
    for (let index = answerStart; index < lines.length; index += 1) {
      const line = lines[index];
      if (/^References\b/i.test(line) && assistantLines.length) break;
      if (kagiChromeLinePattern.test(line) || kagiMetaLinePattern.test(line)) continue;
      if (kagiModeLinePattern.test(line) && !assistantLines.length) continue;
      if (line === prompt.text || prompt.parts.includes(line)) continue;
      assistantLines.push(line);
      if (assistantLines.length >= 120) break;
    }
    const assistant = usefulTurnText(assistantLines.join("\n"), 60000);
    if (assistant.length < 20) return [];
    const userTarget = targetForText(root, config, [prompt.text, ...prompt.parts], {
      selector: "article,section,div,p,[class*='message' i],[class*='bubble' i],[class*='chat' i]"
    });
    const assistantTarget = targetForText(root, config, assistantLines.slice(0, 3), {
      selector: "article,section,div,p,[role='article'],[class*='message' i],[class*='response' i],[class*='markdown' i]"
    });
    return dedupeItems([
      {
        element: userTarget,
        target: userTarget,
        role: "user",
        text: compactText(prompt.text, config.summaryMaxChars)
      },
      {
        element: assistantTarget,
        target: assistantTarget,
        role: "assistant",
        text: compactText(assistant, config.summaryMaxChars)
      }
    ]);
  }

  function notionPairFromLines(root) {
    const lines = notionLines(root);
    const stepIndex = lines.findIndex((line) => /^\d+\s*steps?$/i.test(line));
    let promptIndex = -1;
    if (stepIndex > 0) {
      for (let index = stepIndex - 1; index >= 0; index -= 1) {
        if (!notionMetaLinePattern.test(lines[index]) && !notionChromeLinePattern.test(lines[index])) {
          promptIndex = index;
          break;
        }
      }
    }
    if (promptIndex < 0) {
      promptIndex = lines.findIndex((line, index) => index < lines.length - 1 && notionLikelyPrompt(line));
    }
    if (promptIndex < 0 || promptIndex >= lines.length - 1) return null;
    const prompt = notionPromptFromIndex(lines, promptIndex);
    if (!prompt) return null;
    let answerStart = stepIndex >= 0 ? stepIndex + 1 : promptIndex + 1;
    while (answerStart < lines.length && (notionChromeLinePattern.test(lines[answerStart]) || notionMetaLinePattern.test(lines[answerStart]))) answerStart += 1;
    const assistant = usefulTurnText(lines.slice(answerStart)
      .filter((line) => line !== lines[promptIndex] && line !== prompt.text && !prompt.parts.includes(line) && !notionChromeLinePattern.test(line))
      .join("\n"));
    return prompt.text.length >= 2 && assistant.length >= 20 ? { user: prompt.text, userParts: prompt.parts, assistant } : null;
  }

  function notionDomFallbackItems(config) {
    const root = pageRoot("#notion-app,main,[role='main']");
    const pair = notionPairFromLines(root);
    if (!pair) return [];
    const cleanupSelectors = Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : [];
    const steps = safeQsa("button,[role='button']", root)
      .filter((button) => visible(button) && /^\d+\s*steps?$/i.test(cleanLine(rawText(button))))
      .sort(elementOrder);
    const stepButton = steps[0] || null;
    const candidates = candidateTextBlocks(root, config, "article,section,div,p,[role='article'],[data-testid*='message']", {
      reject: (element) => stepButton && element.contains?.(stepButton),
      maxLength: 60000
    });
    const beforeStep = stepButton
      ? candidates.filter((item) => elementOrder(item.element, stepButton) < 0)
      : candidates;
    const afterStep = stepButton
      ? candidates.filter((item) => elementOrder(stepButton, item.element) < 0)
      : candidates;
    const promptTarget = beforeStep.reverse().find((item) => {
      const text = trimNotionPromptMeta(item.text);
      return text && (text.includes(pair.user) || pair.user.includes(text) || notionLikelyPrompt(text));
    })?.element || targetForText(root, config, [pair.user, ...(pair.userParts || [])], {
      reject: (element) => stepButton && element.contains?.(stepButton)
    });
    const assistantTarget = afterStep.find((item) => {
      const text = cleanLine(item.text);
      return text.length >= 20 && (pair.assistant.includes(text) || text.includes(pair.assistant.slice(0, 60)));
    })?.element || targetForText(root, config, pair.assistant.slice(0, 120), {
      reject: (element) => stepButton && element.contains?.(stepButton)
    });
    return dedupeItems([
      {
        element: promptTarget,
        target: promptTarget,
        role: "user",
        text: compactText(pair.user, config.summaryMaxChars)
      },
      {
        element: assistantTarget,
        target: assistantTarget,
        role: "assistant",
        text: compactText(pair.assistant, config.summaryMaxChars)
      }
    ]);
  }

  function genericRole(element, config = {}) {
    if (config.userSelector && (safeMatches(element, config.userSelector) || safeQsa(config.userSelector, element).length)) return "user";
    if (config.assistantSelector && (safeMatches(element, config.assistantSelector) || safeQsa(config.assistantSelector, element).length)) return "assistant";
    const meta = metaText(element);
    if (/\b(user|human|query|prompt)\b|data-message-author-role=.user/.test(meta)) return "user";
    if (/\b(assistant|bot|model|response|answer)\b|data-message-author-role=.assistant/.test(meta)) return "assistant";
    const label = normalize(element?.innerText || element?.textContent || "").slice(0, 80);
    if (/^(you|you said|你|你说|用户)[:：\s]/i.test(label)) return "user";
    if (/^(assistant|claude|gemini|chatgpt|kagi|poe|助手)[:：\s]/i.test(label)) return "assistant";
    return "";
  }

  function genericTarget(element) {
    return safeQsa([
      ".markdown",
      ".prose",
      "[class*='markdown' i]",
      "[class*='message' i]",
      "[class*='bubble' i]",
      "[data-message-author-role]",
      "[role='article']"
    ].join(","), element).find(visible) || element;
  }

  const STRICT_MESSAGE_ROOT_SELECTOR = [
    "[data-nsan-owner='nsan']",
    "[data-nsan-article='1']",
    "article[data-testid^='conversation-turn-']",
    "article[data-testid*='conversation-turn']",
    "article[data-turn-id]",
    "article[data-turn]",
    "[data-message-author-role]",
    "ms-chat-turn[id^='turn-']",
    "ms-chat-turn",
    "user-query",
    "model-response",
    ".user-query",
    ".model-response",
    ".chat_bubble[role='article']",
    ".chat_bubble",
    ".ds-message",
    "[data-testid='user-message']",
    "[data-testid='assistant-message']",
    "[class*='ChatMessage_chatMessage']",
    "[data-turn-role]",
    ".chat-turn-container",
    "[role='article']",
    "[role='user']",
    "[role='assistant']"
  ].join(",");

  const LOOSE_MESSAGE_ROOT_SELECTOR = [
    STRICT_MESSAGE_ROOT_SELECTOR,
    "[class*='message' i]",
    "[class*='response' i]",
    "[class*='turn' i]",
    "[class*='bubble' i]"
  ].join(",");

  const USER_EFFECT_BODY_SELECTOR = [
    ".user-message-bubble-color",
    "[class*='user-message-bubble' i]",
    "[class*='rightSideMessageBubble']",
    "[class*='Message_rightSideMessageBubble']",
    "[class*='bubble-color' i]",
    ".user-query-bubble-with-background",
    ".query-text",
    ".query-content",
    ".fbb737a4",
    ".rounded-3xl",
    ".chat_bubble_content",
    "[data-testid='user-message']"
  ].join(",");

  const ASSISTANT_EFFECT_BODY_SELECTOR = [
    "[data-message-part-type='answer'].markdown-container-style",
    ".markdown-container-style",
    ".font-claude-response",
    ".font-claude-response-body",
    ".model-response-text .markdown",
    "message-content .markdown",
    ".turn-content",
    "[class*='turn-content']",
    ".ds-markdown:not(.ds-think-content)",
    ".chat_bubble_content",
    "[class*='Message_messageTextContainer']",
    "[class*='Message_leftSideMessageBubble']",
    ".assistant-message-bubble-color",
    ".markdown.prose",
    ".markdown",
    ".prose"
  ].join(",");

  const MESSAGE_ROLE_MARKER_SELECTOR = [
    "[data-message-author-role]",
    "[data-author]",
    "[data-role]",
    "[data-turn-role]",
    "[data-testid='user-message']",
    "[data-testid='assistant-message']",
    "[role='user']",
    "[role='assistant']",
    "user-query",
    "model-response",
    ".user-query",
    ".model-response",
    ".user-message-bubble-color",
    ".assistant-message-bubble-color",
    "[class*='rightSideMessageBubble']",
    "[class*='leftSideMessageBubble']",
    ".fbb737a4",
    ".ds-markdown"
  ].join(",");

  const COMPOSER_CHROME_SELECTOR = [
    "form",
    "textarea",
    "input:not([type='hidden'])",
    "[contenteditable='true']",
    "[role='textbox']",
    "[aria-label*='Chat with' i]",
    "[aria-label*='Ask anything' i]",
    "textarea[aria-label*='Message' i]",
    "input[aria-label*='Message' i]",
    "[contenteditable='true'][aria-label*='Message' i]",
    "[role='textbox'][aria-label*='Message' i]",
    "[placeholder*='Ask' i]",
    "[placeholder*='Message' i]",
    "[class*='composer' i]",
    "[data-testid*='composer' i]"
  ].join(",");

  function normalizeRoleName(value) {
    const text = String(value || "").toLowerCase();
    if (/\b(user|human|you|query|prompt)\b/.test(text)) return "user";
    if (/\b(assistant|bot|model|response|answer|tool)\b/.test(text)) return "assistant";
    return "";
  }

  function directMessageRole(element) {
    if (!element || element.nodeType !== 1) return "";
    const attrs = [
      "data-message-author-role",
      "data-author",
      "data-role",
      "data-turn-role",
      "data-testid",
      "aria-label"
    ];
    for (const attr of attrs) {
      const role = normalizeRoleName(element.getAttribute?.(attr));
      if (role) return role;
    }
    const tag = String(element.tagName || "").toLowerCase();
    if (tag === "user-query") return "user";
    if (tag === "model-response") return "assistant";
    const classText = String(element.className || "");
    if (/(^|\s)(user-query|user-message-bubble-color|fbb737a4)(\s|$)|rightSideMessageBubble/i.test(classText)) return "user";
    if (/(^|\s)(model-response|assistant-message-bubble-color|ds-markdown)(\s|$)|leftSideMessageBubble|font-claude-response/i.test(classText)) return "assistant";
    return "";
  }

  function roleMarkersWithin(element) {
    if (!element || element.nodeType !== 1) return [];
    const markers = [];
    if (safeMatches(element, MESSAGE_ROLE_MARKER_SELECTOR)) markers.push(element);
    markers.push(...safeQsa(MESSAGE_ROLE_MARKER_SELECTOR, element));
    return uniqueElements(markers).filter((node) => visible(node) && !safeClosest(node, `#${ROOT_ID}`));
  }

  function containsConflictingRole(element, role) {
    const wanted = role === "user" ? "user" : role ? "assistant" : "";
    if (!wanted) return false;
    return roleMarkersWithin(element).some((node) => {
      const markerRole = directMessageRole(node);
      return markerRole && markerRole !== wanted;
    });
  }

  function containsComposerChrome(element) {
    if (!element || element.nodeType !== 1) return false;
    const controls = safeQsa(COMPOSER_CHROME_SELECTOR, element)
      .filter((node) => node !== element && visible(node) && !safeClosest(node, `#${ROOT_ID}`));
    return controls.length > 0;
  }

  function effectRect(element) {
    try {
      const rect = element?.getBoundingClientRect?.();
      return rect && rect.width > 0 && rect.height > 0 ? rect : null;
    } catch {
      return null;
    }
  }

  function invalidEffectTarget(element, config = {}) {
    if (!element || element.nodeType !== 1 || !visible(element)) return true;
    if (safeClosest(element, `#${ROOT_ID}`)) return true;
    if (safeMatches(element, [
      "html",
      "body",
      "main",
      "nav",
      "aside",
      "header",
      "footer",
      "form",
      "button",
      "input",
      "textarea",
      "select",
      "svg",
      "img",
      "canvas",
      "video",
      "menu",
      "[role='toolbar']",
      "[role='menu']",
      "[aria-hidden='true']",
      "[hidden]"
    ].join(","))) return true;
    if (safeClosest(element, [
      "nav",
      "aside",
      "header",
      "footer",
      "form",
      "[role='toolbar']",
      "[role='menu']",
      "[class*='toolbar' i]",
      "[class*='action' i]",
      "[class*='actions' i]",
      "[class*='copy' i]",
      "[data-testid*='action' i]"
    ].join(","))) return true;
    const cleanupSelectors = Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : [];
    const hasText = usefulTurnText(cloneText(element, cleanupSelectors), 80000);
    const hasMedia = Boolean(safeQsa("pre,code,blockquote,ul,ol,table,img,video,canvas,svg", element).find(visible));
    return !hasText && !hasMedia;
  }

  function containsMultipleMessageRoots(element) {
    const roots = safeQsa(STRICT_MESSAGE_ROOT_SELECTOR, element)
      .filter((node) => node !== element && visible(node) && !safeClosest(node, `#${ROOT_ID}`));
    const directRoots = uniqueElements(roots).filter((node) => !safeQsa(STRICT_MESSAGE_ROOT_SELECTOR, node)
      .some((child) => child !== node && roots.includes(child)));
    return directRoots.length > 1;
  }

  function blockedEffectBoundary(element, role = "") {
    if (!element || element.nodeType !== 1) return true;
    if (containsConflictingRole(element, role)) return true;
    if (containsMultipleMessageRoots(element)) return true;
    if (containsComposerChrome(element)) return true;
    return false;
  }

  function effectTargetTooBroad(element) {
    if (!element || safeMatches(element, STRICT_MESSAGE_ROOT_SELECTOR)) return false;
    if (containsMultipleMessageRoots(element)) return true;
    const rect = effectRect(element);
    const root = pageRoot();
    const rootRect = effectRect(root);
    if (!rect || !rootRect) return false;
    return rect.width >= rootRect.width * 0.92 && rect.height >= Math.max(500, rootRect.height * 0.72);
  }

  function usableEffectTarget(element, config = {}, options = {}) {
    if (invalidEffectTarget(element, config)) return false;
    if (!options.allowBoundaryCrossing && blockedEffectBoundary(element, options.role || "")) return false;
    if (!options.allowBroad && effectTargetTooBroad(element)) return false;
    return true;
  }

  function effectMatches(root, selector, config = {}, options = {}) {
    const candidates = [];
    if (safeMatches(root, selector)) candidates.push(root);
    candidates.push(...safeQsa(selector, root));
    const seen = new Set();
    const filtered = [];
    for (const element of candidates) {
      if (!element || seen.has(element) || !usableEffectTarget(element, config, options)) continue;
      seen.add(element);
      filtered.push(element);
    }
    if (options.prefer === "last") return filtered[filtered.length - 1] || null;
    filtered.sort((a, b) => {
      const area = elementArea(a) - elementArea(b);
      return options.prefer === "largest" ? -area || elementOrder(a, b) : area || elementOrder(a, b);
    });
    return filtered[0] || null;
  }

  function closestEffectMatch(seed, selector, config = {}, options = {}) {
    for (let node = seed; node && node !== document.documentElement; node = node.parentElement) {
      if (safeMatches(node, selector) && usableEffectTarget(node, config, options)) return node;
      if (safeMatches(node, "main,body")) break;
    }
    return null;
  }

  function messageRootForEffect(element, target, config = {}, options = {}) {
    const seeds = [target, element].filter(Boolean);
    for (const seed of seeds) {
      const strict = closestEffectMatch(seed, STRICT_MESSAGE_ROOT_SELECTOR, config, { ...options, allowBroad: true });
      if (strict && !blockedEffectBoundary(strict, options.role || "")) return strict;
    }
    for (const seed of seeds) {
      const loose = closestEffectMatch(seed, LOOSE_MESSAGE_ROOT_SELECTOR, config, options);
      if (loose && !blockedEffectBoundary(loose, options.role || "")) return loose;
    }
    return seeds.find((seed) => usableEffectTarget(seed, config, options)) || element || target || null;
  }

  function roleRootForEffect(element, target, selector, config = {}, role = "") {
    const options = { allowBroad: true, role };
    for (const seed of [target, element].filter(Boolean)) {
      const closest = closestEffectMatch(seed, selector, config, options);
      if (closest) return closest;
    }
    for (const seed of [element, target].filter(Boolean)) {
      const match = effectMatches(seed, selector, config, { ...options, prefer: "largest" });
      if (match) return match;
    }
    return null;
  }

  function fallbackEffectTarget(element, target, config = {}, role = "assistant") {
    const selector = role === "user" ? USER_EFFECT_BODY_SELECTOR : ASSISTANT_EFFECT_BODY_SELECTOR;
    const prefer = role === "user" ? "" : "largest";
    for (const seed of [target, element].filter(Boolean)) {
      const match = effectMatches(seed, selector, config, { role, prefer });
      if (match) return match;
    }
    return [target, element].filter(Boolean)
      .find((seed) => usableEffectTarget(seed, config, { role, allowBroad: false })) || null;
  }

  function resolveEffectTarget(item = {}, config = {}, adapter = null) {
    const role = item.role === "user" || item.role === "thinking" ? item.role : "assistant";
    const effectRole = role === "user" ? "user" : "assistant";
    const element = item.element || item.target;
    const target = item.target || element;
    const explicit = item.effectTarget
      || adapter?.effectTarget?.(element, config, { ...item, role, target, effectRole })
      || null;
    if (usableEffectTarget(explicit, config, { allowBroad: true, role: effectRole })) return explicit;
    const root = messageRootForEffect(element, target, config, { allowBroad: role !== "user", role: effectRole });
    if (role === "user") {
      return effectMatches(root || element || target, USER_EFFECT_BODY_SELECTOR, config, { role: effectRole })
        || (usableEffectTarget(target, config, { role: effectRole }) ? target : null)
        || (usableEffectTarget(root, config, { role: effectRole }) ? root : null)
        || fallbackEffectTarget(element, target, config, effectRole);
    }
    const rootUsable = usableEffectTarget(root, config, { allowBroad: true, role: effectRole }) && !effectTargetTooBroad(root);
    return (rootUsable ? root : null)
      || effectMatches(root || element || target, ASSISTANT_EFFECT_BODY_SELECTOR, config, { prefer: "largest", role: effectRole })
      || (usableEffectTarget(target, config, { allowBroad: true, role: effectRole }) ? target : null)
      || fallbackEffectTarget(element, target, config, effectRole);
  }

  function cleanKey(item) {
    return `${item.role}\n${normalize(item.text).toLowerCase().slice(0, 260)}`;
  }

  function dedupeItems(items) {
    const seen = new Set();
    const out = [];
    for (const item of items) {
      if (!item?.element || !item.text) continue;
      const key = cleanKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }

  function scrollParent(element) {
    for (let node = element?.parentElement; node && node !== document.body; node = node.parentElement) {
      try {
        const style = getComputedStyle(node);
        if (/(auto|scroll|overlay)/i.test(`${style.overflowY} ${style.overflow}`) && node.scrollHeight > node.clientHeight + 24) return node;
      } catch {}
    }
    return document.scrollingElement || document.documentElement;
  }

  function scrollerRect(scroller) {
    if (!scroller || scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body) {
      return { top: 0, height: window.innerHeight };
    }
    try {
      const rect = scroller.getBoundingClientRect();
      return { top: rect.top, height: rect.height };
    } catch {
      return { top: 0, height: window.innerHeight };
    }
  }

  function scrollerTop(scroller) {
    if (!scroller || scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body) {
      return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    }
    return scroller.scrollTop;
  }

  function scrollToTop(scroller, top) {
    if (!scroller || scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body) {
      window.scrollTo({ top, behavior: "smooth" });
      return;
    }
    try {
      scroller.scrollTo({ top, behavior: "smooth" });
    } catch {
      scroller.scrollTop = top;
    }
  }

  function rolePrefix(role) {
    if (role === "user") return "Q";
    if (role === "thinking") return "T";
    return "A";
  }

  function adapterBaseQuery(config) {
    return uniqueElements(safeQsa(config.messageSelector).filter(visible));
  }

  function adapterBaseItems(config, adapter = {}) {
    const cleanupSelectors = Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : [];
    return dedupeItems(adapterBaseQuery(config).map((element) => {
      const role = adapter.role?.(element, config) || genericRole(element, config) || "assistant";
      const target = adapter.target?.(element, config) || genericTarget(element);
      const textSource = adapter.summaryElement?.(element, config) || target || element;
      const rawText = adapter.text?.(element, config, { role, target, textSource }) || cloneText(textSource, cleanupSelectors) || cloneText(element, cleanupSelectors);
      const effectTarget = resolveEffectTarget({ element, target, role, textSource }, config, adapter);
      return {
        element,
        target,
        effectTarget,
        role,
        text: compactText(rawText, config.summaryMaxChars)
      };
    }));
  }

  ADAPTERS.generic = {
    collect: (config) => adapterBaseItems(config)
  };

  ADAPTERS.chatgpt = {
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
      const root = roleRoot || messageRootForEffect(element, context.target, config, { allowBroad: true, role: effectRole });
      if (effectRole === "user") {
        return effectMatches(root || element, [
          ".user-message-bubble-color",
          "[class*='user-message-bubble' i]",
          "[class*='message-bubble' i]",
          "[class*='bubble-color' i]"
        ].join(","), config, { role: effectRole }) || root || context.target || element;
      }
      return roleRoot
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

  ADAPTERS.claude = {
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

  ADAPTERS.notion = {
    role(element) {
      const meta = metaText(element);
      if (/\buser\b|human|prompt|query/.test(meta)) return "user";
      if (/\bassistant\b|answer|response|notion-ai/.test(meta)) return "assistant";
      return genericRole(element);
    },
    target(element) {
      return safeQsa(".markdown, [class*='message' i], [role='article']", element).find(visible) || element;
    },
    effectTarget(element, config, context = {}) {
      const root = messageRootForEffect(element, context.target, config, { allowBroad: true });
      if (context.role === "user") {
        return effectMatches(root || element, USER_EFFECT_BODY_SELECTOR, config)
          || context.target
          || root
          || element;
      }
      return effectMatches(root || element, ".markdown,[class*='message' i],[role='article']", config, { prefer: "largest" })
        || root
        || context.target
        || element;
    },
    collect(config) {
      const fallback = notionDomFallbackItems(config);
      if (conversationLooksUseful(fallback)) return fallback;
      const base = adapterBaseItems(config, this);
      return conversationLooksUseful(base) ? base : fallback;
    }
  };

  ADAPTERS.gemini = {
    role(element) {
      const meta = metaText(element);
      if (/user-query|query|user/.test(meta)) return "user";
      if (/model-response|model|assistant|response/.test(meta)) return "assistant";
      return genericRole(element);
    },
    target(element) {
      return safeQsa(".model-response-text .markdown, message-content .markdown, .markdown, .query-text, .query-content, .user-query-bubble-with-background", element).find(visible) || element;
    },
    effectTarget(element, config, context = {}) {
      const root = messageRootForEffect(element, context.target, config, { allowBroad: true });
      if (context.role === "user") {
        return effectMatches(root || element, ".user-query-bubble-with-background,.query-text,.query-content,.user-query-container", config)
          || context.target
          || root
          || element;
      }
      return effectMatches(root || element, ".model-response-text .markdown,message-content .markdown,.model-response-text,message-content,.response-container-content,.response-container,structured-content-container", config, { prefer: "largest" })
        || root
        || context.target
        || element;
    },
    text(element, config, context = {}) {
      const cleanupSelectors = Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : [];
      return cleanGeminiText(cloneText(context.textSource || context.target || element, cleanupSelectors) || cloneText(element, cleanupSelectors));
    },
    collect(config) {
      return adapterBaseItems(config, this);
    }
  };

  ADAPTERS.deepseek = {
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

  ADAPTERS.kagi = {
    role(element) {
      const meta = metaText(element);
      if (/\buser\b|human|query/.test(meta)) return "user";
      if (/\bassistant\b|bot|answer/.test(meta)) return "assistant";
      return genericRole(element) || (safeQsa(".assistant, [data-role='assistant']", element).length ? "assistant" : "");
    },
    target(element) {
      return safeQsa(".chat_bubble_content, .markdown, [class*='message' i], [role='article']", element).find(visible) || element;
    },
    effectTarget(element, config, context = {}) {
      const root = messageRootForEffect(element, context.target, config, { allowBroad: true });
      return effectMatches(root || element, ".chat_bubble_content,.markdown", config, { prefer: "largest" })
        || closestEffectMatch(context.target || element, ".chat_bubble[role='article'],.chat_bubble,[role='article']", config, { allowBroad: true })
        || context.target
        || root
        || element;
    },
    collect(config) {
      const fromDom = kagiDomFallbackItems(config);
      if (conversationLooksUseful(fromDom)) return fromDom;
      const fromCopies = collectFromCopyButtons(config, {
        rootSelector: "main,[role='main']",
        maxDepth: 12
      });
      if (conversationLooksUseful(fromCopies)) return fromCopies;
      const base = adapterBaseItems(config, this);
      if (conversationLooksUseful(base)) return base;
      const root = pageRoot("main,[role='main']");
      const blocks = candidateTextBlocks(root, config, [
        ".chat_bubble",
        "[role='article']",
        "[data-message-author-role]",
        "[data-testid*='message']",
        "[class*='message' i]",
        "[class*='response' i]",
        ".markdown"
      ].join(","), { maxLength: 60000 });
      return dedupeItems(blocks.slice(0, 24).map((item, index) => ({
        ...item,
        role: genericRole(item.element, config) || (index % 2 === 0 ? "user" : "assistant"),
        text: compactText(item.text, config.summaryMaxChars)
      })));
    }
  };

  ADAPTERS.grok = {
    role(element) {
      const meta = metaText(element);
      if (/user|human|prompt|query|question/.test(meta)) return "user";
      if (/assistant|response|answer|bot|grok/.test(meta)) return "assistant";
      return genericRole(element);
    },
    target(element) {
      return safeQsa(".markdown, [class*='message' i], [class*='Message'], [class*='response' i], article, [role='article']", element).find(visible) || element;
    },
    effectTarget(element, config, context = {}) {
      const root = messageRootForEffect(element, context.target, config, { allowBroad: true });
      if (context.role === "user") {
        return effectMatches(root || element, USER_EFFECT_BODY_SELECTOR, config)
          || root
          || context.target
          || element;
      }
      return root
        || effectMatches(element, ".markdown,[class*='message' i],[class*='response' i],article,[role='article']", config, { prefer: "largest" })
        || context.target
        || element;
    },
    text(element, config, context = {}) {
      return grokTextOf(context.textSource || context.target || element, config) || grokTextOf(element, config);
    },
    collect(config) {
      const fromDom = grokDomItems(config);
      if (conversationLooksUseful(fromDom)) return fromDom;
      const base = adapterBaseItems(config, this);
      return conversationLooksUseful(base) ? base : fromDom;
    }
  };

  ADAPTERS.poe = {
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

  ADAPTERS.aiStudio = {
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

  ADAPTERS.lechat = {
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

  function css(primaryColor = "#1f7a5f") {
    return `
      :root {
        --cc-message-nav-accent: ${primaryColor};
      }
      #${ROOT_ID} {
        --cc-message-nav-accent: ${primaryColor};
        --cc-message-nav-bg: color-mix(in srgb, Canvas 92%, transparent);
        --cc-message-nav-text: CanvasText;
        --cc-message-nav-muted: color-mix(in srgb, CanvasText 54%, transparent);
        --cc-message-nav-border: color-mix(in srgb, CanvasText 16%, transparent);
        position: fixed;
        top: 50%;
        right: 14px;
        z-index: 2147483200;
        transform: translateY(-50%);
        display: flex;
        align-items: center;
        gap: 8px;
        font: 12px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: var(--cc-message-nav-text);
        pointer-events: none;
      }
      #${ROOT_ID} * { box-sizing: border-box; }
      .chatclub-message-nav-indicator {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 5px;
        padding: 8px 2px;
        pointer-events: auto;
      }
      .chatclub-message-nav-line {
        width: 38px;
        height: 12px;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        border: 0;
        background: transparent;
        cursor: pointer;
        transition: opacity 160ms ease;
        opacity: .72;
        padding: 0;
      }
      .chatclub-message-nav-line::before {
        content: "";
        width: 18px;
        height: 3px;
        border-radius: 999px;
        background: color-mix(in srgb, CanvasText 28%, transparent);
        transition: width 160ms ease, background 160ms ease, box-shadow 160ms ease;
      }
      .chatclub-message-nav-line:hover {
        opacity: .92;
      }
      .chatclub-message-nav-line:hover::before {
        background: color-mix(in srgb, CanvasText 42%, transparent);
      }
      .chatclub-message-nav-line.active {
        opacity: 1;
      }
      .chatclub-message-nav-line.active::before {
        width: 34px;
        background: var(--cc-message-nav-accent);
        box-shadow: 0 0 0 1px color-mix(in srgb, var(--cc-message-nav-accent) 24%, transparent);
      }
      .chatclub-message-nav-menu {
        width: min(18rem, calc(100vw - 68px));
        max-height: min(72vh, 34rem);
        overflow: auto;
        padding: 6px;
        border: 1px solid var(--cc-message-nav-border);
        border-radius: 8px;
        background: var(--cc-message-nav-bg);
        color: var(--cc-message-nav-text);
        box-shadow: 0 18px 48px rgba(0, 0, 0, .18);
        backdrop-filter: blur(18px);
        visibility: hidden;
        opacity: 0;
        transform: translateX(8px) scale(.98);
        pointer-events: none;
        transition: opacity 140ms ease, transform 140ms ease, visibility 0s linear 140ms;
      }
      #${ROOT_ID}.chatclub-message-nav-open .chatclub-message-nav-menu,
      #${ROOT_ID}:focus-within .chatclub-message-nav-menu {
        visibility: visible;
        opacity: 1;
        transform: translateX(0) scale(1);
        pointer-events: auto;
        transition-delay: 0s;
      }
      .chatclub-message-nav-item {
        width: 100%;
        display: grid;
        grid-template-columns: 22px minmax(0, 1fr);
        gap: 8px;
        align-items: center;
        min-height: 30px;
        padding: 6px 8px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: inherit;
        text-align: left;
        cursor: pointer;
      }
      .chatclub-message-nav-item:hover,
      .chatclub-message-nav-item.active {
        background: color-mix(in srgb, var(--cc-message-nav-accent) 13%, transparent);
      }
      .chatclub-message-nav-role {
        display: inline-grid;
        place-items: center;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: color-mix(in srgb, CanvasText 8%, transparent);
        color: var(--cc-message-nav-muted);
        font-size: 11px;
        font-weight: 700;
      }
      .chatclub-message-nav-item.active .chatclub-message-nav-role {
        background: var(--cc-message-nav-accent);
        color: white;
      }
      .chatclub-message-nav-text {
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .chatclub-message-nav-empty {
        padding: 10px 12px;
        color: var(--cc-message-nav-muted);
      }
      .chatclub-message-nav-effect-border {
        outline: 2px solid var(--cc-message-nav-accent, ${primaryColor}) !important;
        outline-offset: 4px !important;
        border-radius: 8px !important;
        box-shadow: 0 0 0 4px color-mix(in srgb, var(--cc-message-nav-accent, ${primaryColor}) 16%, transparent) !important;
      }
      .chatclub-message-nav-effect-pulse {
        animation: chatclub-message-nav-pulse 1.35s ease-out 1;
      }
      .chatclub-message-nav-effect-fade {
        animation: chatclub-message-nav-fade 1.35s ease-out 1;
      }
      .chatclub-message-nav-effect-jiggle {
        animation: chatclub-message-nav-jiggle .56s ease-in-out 1;
      }
      @keyframes chatclub-message-nav-pulse {
        0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--cc-message-nav-accent, ${primaryColor}) 42%, transparent); }
        70% { box-shadow: 0 0 0 16px color-mix(in srgb, var(--cc-message-nav-accent, ${primaryColor}) 0%, transparent); }
        100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--cc-message-nav-accent, ${primaryColor}) 0%, transparent); }
      }
      @keyframes chatclub-message-nav-fade {
        0%, 100% { opacity: 1; }
        22% { opacity: .42; }
        44% { opacity: 1; }
        66% { opacity: .58; }
      }
      @keyframes chatclub-message-nav-jiggle {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-5px); }
        40% { transform: translateX(5px); }
        60% { transform: translateX(-3px); }
        80% { transform: translateX(3px); }
      }
      @media (prefers-color-scheme: dark) {
        #${ROOT_ID} {
          --cc-message-nav-bg: color-mix(in srgb, #1b1d20 88%, transparent);
          --cc-message-nav-text: #f2f4f5;
          --cc-message-nav-muted: rgba(242, 244, 245, .62);
          --cc-message-nav-border: rgba(255, 255, 255, .14);
        }
      }
    `;
  }

  class MessageNavigator {
    constructor() {
      this.version = VERSION;
      this.enabled = false;
      this.config = null;
      this.options = {};
      this.messages = [];
      this.idToMessage = new Map();
      this.root = null;
      this.indicator = null;
      this.menu = null;
      this.observer = null;
      this.buildTimer = 0;
      this.scrollTimer = 0;
      this.effectTimer = 0;
      this.menuCloseTimer = 0;
      this.menuFocusTimer = 0;
      this.jumpToken = 0;
      this.activeId = "";
      this.effectTarget = null;
      this.boundScroll = () => this.onScroll();
      this.boundResize = () => this.scheduleBuild(160);
      this.boundOpenMenu = () => this.openMenu();
      this.boundScheduleCloseMenu = () => this.scheduleCloseMenu();
      this.boundRootFocusIn = () => this.openMenu();
      this.boundRootFocusOut = () => {
        clearTimeout(this.menuFocusTimer);
        this.menuFocusTimer = setTimeout(() => {
          if (!this.enabled) return;
          if (this.root?.contains?.(document.activeElement)) return;
          this.scheduleCloseMenu();
        }, 0);
      };
    }

    setEnabled(data = {}) {
      if (data.enabled === false) {
        this.destroy();
        return this.state();
      }
      return this.enable(data.config || {}, data.options || {});
    }

    enable(config = {}, options = {}) {
      this.destroy();
      this.enabled = true;
      this.config = {
        ...config,
        adapter: String(config.adapter || "generic").trim() || "generic",
        messageSelector: String(config.messageSelector || "").trim(),
        textCleanupSelectors: Array.isArray(config.textCleanupSelectors) ? config.textCleanupSelectors : [],
        summaryMaxChars: Math.max(20, Math.min(180, Number(config.summaryMaxChars) || 60))
      };
      this.options = {
        effectMode: EFFECT_MODES.has(options.effectMode) ? options.effectMode : "border",
        primaryColor: /^#[0-9a-f]{6}$/i.test(String(options.primaryColor || "")) ? options.primaryColor : "#1f7a5f"
      };
      if (!this.config.messageSelector) throw new Error("Message navigator selector is empty");
      this.injectStyle();
      this.createRoot();
      this.observe();
      this.build();
      this.scheduleBuild(600);
      return this.state();
    }

    injectStyle() {
      document.getElementById(STYLE_ID)?.remove();
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = css(this.options.primaryColor);
      (document.head || document.documentElement).append(style);
    }

    createRoot() {
      document.getElementById(ROOT_ID)?.remove();
      this.root = document.createElement("aside");
      this.root.id = ROOT_ID;
      this.root.setAttribute("aria-label", "ChatClub message navigator");
      this.indicator = document.createElement("div");
      this.indicator.className = "chatclub-message-nav-indicator";
      this.menu = document.createElement("div");
      this.menu.className = "chatclub-message-nav-menu";
      this.menu.setAttribute("role", "menu");
      this.root.append(this.menu, this.indicator);
      document.documentElement.append(this.root);
      this.bindMenuHover();
    }

    bindMenuHover() {
      this.indicator?.addEventListener?.("pointerenter", this.boundOpenMenu);
      this.indicator?.addEventListener?.("pointerleave", this.boundScheduleCloseMenu);
      this.menu?.addEventListener?.("pointerenter", this.boundOpenMenu);
      this.menu?.addEventListener?.("pointerleave", this.boundScheduleCloseMenu);
      this.root?.addEventListener?.("focusin", this.boundRootFocusIn);
      this.root?.addEventListener?.("focusout", this.boundRootFocusOut);
    }

    openMenu() {
      clearTimeout(this.menuCloseTimer);
      this.root?.classList?.add("chatclub-message-nav-open");
    }

    scheduleCloseMenu(delay = 180) {
      clearTimeout(this.menuCloseTimer);
      this.menuCloseTimer = setTimeout(() => {
        if (this.root?.contains?.(document.activeElement)) return;
        this.root?.classList?.remove("chatclub-message-nav-open");
      }, delay);
    }

    observe() {
      this.observer = new MutationObserver(() => this.scheduleBuild(360));
      try { this.observer.observe(document.body || document.documentElement, { childList: true, subtree: true }); } catch {}
      window.addEventListener("scroll", this.boundScroll, true);
      window.addEventListener("resize", this.boundResize, true);
    }

    scheduleBuild(delay = 250) {
      if (!this.enabled) return;
      clearTimeout(this.buildTimer);
      this.buildTimer = setTimeout(() => this.build(), delay);
    }

    collect() {
      const adapter = ADAPTERS[this.config.adapter] || ADAPTERS.generic;
      const items = adapter.collect?.(this.config) || ADAPTERS.generic.collect(this.config);
      return dedupeItems(items)
        .map((item) => {
          const role = item.role === "user" || item.role === "thinking" ? item.role : "assistant";
          const target = item.target || item.element;
          return {
            ...item,
            target,
            effectTarget: resolveEffectTarget({ ...item, target, role }, this.config, adapter),
            role
          };
        })
        .filter((item) => item.text && visible(item.target || item.element))
        .map((item, index) => ({
          ...item,
          id: `message-${index + 1}`,
          role: item.role
        }));
    }

    build() {
      if (!this.enabled || !this.root?.isConnected) return;
      this.messages = this.collect();
      this.idToMessage = new Map(this.messages.map((item) => [item.id, item]));
      this.render();
      this.updateActive();
    }

    render() {
      this.indicator.replaceChildren();
      this.menu.replaceChildren();
      if (!this.messages.length) {
        const empty = document.createElement("div");
        empty.className = "chatclub-message-nav-empty";
        empty.textContent = "No messages";
        this.menu.append(empty);
        return;
      }
      for (const message of this.messages) {
        const line = document.createElement("button");
        line.className = "chatclub-message-nav-line";
        line.type = "button";
        line.title = `${rolePrefix(message.role)} ${message.text}`;
        line.dataset.targetId = message.id;
        line.setAttribute("aria-label", message.text);
        line.addEventListener("click", () => this.jumpTo(message.id));
        this.indicator.append(line);

        const item = document.createElement("button");
        item.className = "chatclub-message-nav-item";
        item.type = "button";
        item.dataset.targetId = message.id;
        item.setAttribute("role", "menuitem");
        item.addEventListener("click", () => this.jumpTo(message.id));
        const role = document.createElement("span");
        role.className = "chatclub-message-nav-role";
        role.textContent = rolePrefix(message.role);
        const text = document.createElement("span");
        text.className = "chatclub-message-nav-text";
        text.textContent = message.text;
        item.append(role, text);
        this.menu.append(item);
      }
    }

    onScroll() {
      if (!this.enabled) return;
      clearTimeout(this.scrollTimer);
      this.scrollTimer = setTimeout(() => this.updateActive(), 80);
    }

    setActive(id) {
      const targetId = this.idToMessage.has(id) ? id : "";
      this.activeId = targetId;
      const elements = [
        ...Array.from(this.indicator?.querySelectorAll?.(".chatclub-message-nav-line") || []),
        ...Array.from(this.menu?.querySelectorAll?.(".chatclub-message-nav-item") || [])
      ];
      for (const element of elements) {
        element.classList.toggle("active", Boolean(targetId) && element.dataset.targetId === targetId);
      }
    }

    updateActive() {
      if (!this.messages.length) return;
      const viewportY = Math.max(80, Math.min(window.innerHeight - 80, window.innerHeight * 0.42));
      let active = this.messages[0];
      for (const message of this.messages) {
        try {
          const rect = (message.target || message.element).getBoundingClientRect();
          if (rect.top <= viewportY) active = message;
          if (rect.top > viewportY) break;
        } catch {}
      }
      this.setActive(active?.id || "");
    }

    async jumpTo(id) {
      const message = this.idToMessage.get(id);
      const target = message?.target || message?.element;
      if (!target) return;
      const effectRole = message.role === "user" ? "user" : "assistant";
      const effectTarget = message.effectTarget
        || fallbackEffectTarget(message.element, target, this.config, effectRole);
      const token = this.jumpToken + 1;
      this.jumpToken = token;
      this.setActive(id);
      const scroller = scrollParent(target);
      const rect = target.getBoundingClientRect();
      const base = scrollerRect(scroller);
      const offset = Math.max(30, Math.min(140, Number(this.config.scrollOffsetPx) || 64));
      const top = scrollerTop(scroller) + rect.top - base.top - offset;
      scrollToTop(scroller, Math.max(0, top));
      await this.waitForScrollIdle(scroller, token);
      if (this.jumpToken !== token) return;
      if (effectTarget) this.applyEffect(effectTarget);
      this.updateActive();
    }

    waitForScrollIdle(scroller, token) {
      return new Promise((resolve) => {
        const eventTarget = (!scroller || scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body)
          ? window
          : scroller;
        let done = false;
        let idleTimer = 0;
        let fallbackTimer = 0;
        const cleanup = () => {
          clearTimeout(idleTimer);
          clearTimeout(fallbackTimer);
          try { eventTarget?.removeEventListener?.("scroll", onScroll); } catch {}
        };
        const finish = () => {
          if (done) return;
          done = true;
          cleanup();
          resolve();
        };
        const onScroll = () => {
          if (this.jumpToken !== token) return finish();
          clearTimeout(idleTimer);
          idleTimer = setTimeout(finish, 150);
        };
        try { eventTarget?.addEventListener?.("scroll", onScroll, { passive: true }); } catch {}
        idleTimer = setTimeout(finish, 260);
        fallbackTimer = setTimeout(finish, 900);
      });
    }

    clearEffect() {
      clearTimeout(this.effectTimer);
      if (!this.effectTarget) return;
      this.effectTarget.classList.remove(
        "chatclub-message-nav-effect-border",
        "chatclub-message-nav-effect-pulse",
        "chatclub-message-nav-effect-fade",
        "chatclub-message-nav-effect-jiggle"
      );
      this.effectTarget.style.removeProperty("--cc-message-nav-accent");
      this.effectTarget = null;
    }

    applyEffect(target) {
      this.clearEffect();
      const mode = EFFECT_MODES.has(this.options.effectMode) ? this.options.effectMode : "border";
      if (mode === "none" || !target?.classList) return;
      this.effectTarget = target;
      const effectClass = `chatclub-message-nav-effect-${mode}`;
      target.classList.remove(effectClass);
      target.style.setProperty("--cc-message-nav-accent", this.options.primaryColor);
      try { void target.offsetWidth; } catch {}
      target.classList.add(effectClass);
      this.effectTimer = setTimeout(() => this.clearEffect(), mode === "border" ? 1800 : 1500);
    }

    state() {
      return {
        ok: true,
        enabled: this.enabled,
        siteId: this.config?.id || "",
        adapter: this.config?.adapter || "",
        messageCount: this.messages.length,
        activeId: this.activeId,
        version: VERSION
      };
    }

    destroy() {
      this.enabled = false;
      clearTimeout(this.buildTimer);
      clearTimeout(this.scrollTimer);
      clearTimeout(this.menuCloseTimer);
      clearTimeout(this.menuFocusTimer);
      this.clearEffect();
      try { this.observer?.disconnect?.(); } catch {}
      this.observer = null;
      window.removeEventListener("scroll", this.boundScroll, true);
      window.removeEventListener("resize", this.boundResize, true);
      this.indicator?.removeEventListener?.("pointerenter", this.boundOpenMenu);
      this.indicator?.removeEventListener?.("pointerleave", this.boundScheduleCloseMenu);
      this.menu?.removeEventListener?.("pointerenter", this.boundOpenMenu);
      this.menu?.removeEventListener?.("pointerleave", this.boundScheduleCloseMenu);
      this.root?.removeEventListener?.("focusin", this.boundRootFocusIn);
      this.root?.removeEventListener?.("focusout", this.boundRootFocusOut);
      this.root?.classList?.remove("chatclub-message-nav-open");
      this.root?.remove();
      this.root = null;
      this.indicator = null;
      this.menu = null;
      this.messages = [];
      this.jumpToken += 1;
      this.idToMessage.clear();
      document.getElementById(STYLE_ID)?.remove();
    }
  }

  window[GLOBAL_NAME] = new MessageNavigator();
})();
