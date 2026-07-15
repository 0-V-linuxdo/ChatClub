(() => {
  // shared/protocol.js
  var GENERIC_POST_MESSAGE_SOURCE = "chatclub";
  var NATIVE_COPY_SOURCE = "chatclub-native-copy:2026.07.15.1";
  var GEMINI_MODEL_PICKER_SOURCE = "chatclub-gemini-model-picker:2026.07.13.3";
  var MAIN_WORLD_LOCATION_SOURCE = "chatclub:main-world-location:2026.07.13.3";
  var NOTION_SEND_TEXT_SOURCE = "chatclub-notion-send-text:2026.07.15.2";
  var NOTION_SEND_PROMPT_SOURCE = "chatclub-notion-send-prompt:2026.07.15.2";
  var NOTION_SEND_TEXT_EVENT = "chatclub:notion-send-text:2026.07.15.2";
  var NOTION_SEND_PROMPT_EVENT = "chatclub:notion-send-prompt:2026.07.15.2";
  var NOTION_SEND_ACTIVATED_EVENT = "chatclub:notion-send-activated:2026.07.15.2";
  var SEND_TEXT_POST_MESSAGE_SOURCE = "chatclub:send-text:2026.07.16.1";
  var DELETE_THREAD_POST_MESSAGE_SOURCE = "chatclub:delete-thread:2026.07.16.1";
  var MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE = "chatclub:message-navigator:2026.07.16.1";
  var SUMMARY_POST_MESSAGE_SOURCE = "chatclub:summary:2026.07.16.1";
  var PREFERRED_MODEL_POST_MESSAGE_SOURCE = "chatclub:preferred-model:2026.07.16.1";
  var CONTENT_BRIDGE_VERSION = "2026.07.16.1";
  var EXTENSION_RUNTIME_RELAY_SOURCE = "chatclub:runtime-relay:2026.07.16.1";
  var FRAME_BINDING_POST_MESSAGE_SOURCE = `chatclub:frame-binding:${CONTENT_BRIDGE_VERSION}`;
  var SECURE_FRAME_COMMAND_SOURCE = "chatclub:frame-command:2026.07.16.1";
  var DEEPSEEK_DELETE_SOURCE = "chatclub-deepseek-delete-thread:2026.07.15.1";
  var PAGE_SUMMARY_SOURCE = "chatclub-summary-userscript:2026.07.16.1";
  var RUNTIME_REGISTRY_ABI_VERSION = 1;
  var RUNTIME_REGISTRY_KEY = `__CHATCLUB_RUNTIME_REGISTRY_V${RUNTIME_REGISTRY_ABI_VERSION}__`;
  var NAVIGATION_FOCUS_GUARD_RUNTIME = "navigation-focus-guard";
  var NAVIGATION_FOCUS_GUARD_RUNTIME_VERSION = "2026.07.15.2";
  var FRAME_TOAST_POSITION_EVENT = "chatclub:frame-toast-position:2026.07.13.1";
  var CUSTOM_SUMMARY_EXECUTOR = "__CHATCLUB_SUMMARY_CUSTOM_EXECUTOR_2026_07_14__";
  var TOPIC_DELETE_REQUEST_EVENT = "chatclub:delete-site:request";
  var TOPIC_DELETE_MENU_COMMAND_EVENT = "chatclub:delete-site:menu-command";
  var TOPIC_DELETE_RESULT_EVENT = "chatclub:delete-site:result";
  var TOPIC_DELETE_PING_EVENT = "chatclub:delete-site:ping";
  var TOPIC_DELETE_READY_EVENT = "chatclub:delete-site:ready";
  var TOPIC_DELETE_BRIDGE_SOURCE = "chatclub-delete-sites";
  var CONTENT_PROTOCOL = Object.freeze({
    GENERIC_POST_MESSAGE_SOURCE,
    NATIVE_COPY_SOURCE,
    GEMINI_MODEL_PICKER_SOURCE,
    MAIN_WORLD_LOCATION_SOURCE,
    NOTION_SEND_TEXT_SOURCE,
    NOTION_SEND_PROMPT_SOURCE,
    NOTION_SEND_TEXT_EVENT,
    NOTION_SEND_PROMPT_EVENT,
    NOTION_SEND_ACTIVATED_EVENT,
    SEND_TEXT_POST_MESSAGE_SOURCE,
    DELETE_THREAD_POST_MESSAGE_SOURCE,
    MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE,
    SUMMARY_POST_MESSAGE_SOURCE,
    PREFERRED_MODEL_POST_MESSAGE_SOURCE,
    CONTENT_BRIDGE_VERSION,
    EXTENSION_RUNTIME_RELAY_SOURCE,
    FRAME_BINDING_POST_MESSAGE_SOURCE,
    SECURE_FRAME_COMMAND_SOURCE,
    DEEPSEEK_DELETE_SOURCE,
    PAGE_SUMMARY_SOURCE,
    NAVIGATION_FOCUS_GUARD_RUNTIME,
    NAVIGATION_FOCUS_GUARD_RUNTIME_VERSION,
    FRAME_TOAST_POSITION_EVENT,
    CUSTOM_SUMMARY_EXECUTOR,
    TOPIC_DELETE_REQUEST_EVENT,
    TOPIC_DELETE_MENU_COMMAND_EVENT,
    TOPIC_DELETE_RESULT_EVENT,
    TOPIC_DELETE_PING_EVENT,
    TOPIC_DELETE_READY_EVENT,
    TOPIC_DELETE_BRIDGE_SOURCE
  });

  // chatclub-generated:summary-registry
  function createSummaryRunnerRegistry() {
    const scripts = /* @__PURE__ */ Object.create(null);
    scripts["chatgpt"] = async function(api) {
      const opts = {
        copyButtonSelector: 'button[data-testid="copy-turn-action-button"],button[aria-label="Copy message"],button[aria-label="Copy response"]',
        maxButtons: 80
      };
      const closest = (node, selector) => {
        try {
          return api.closest(node, selector);
        } catch (error) {
          return null;
        }
      };
      const turnScope = (node) => closest(node, 'article,[data-testid^="conversation-turn"],[data-testid*="conversation-turn"]') || node;
      const centerY = (rect) => (rect.top + rect.bottom) / 2;
      const visibleRect = (node) => {
        try {
          const rect = node && node.getBoundingClientRect && node.getBoundingClientRect();
          return rect && rect.width > 0 && rect.height > 0 ? rect : null;
        } catch (error) {
          return null;
        }
      };
      const roleLabel = (role) => role === "user" ? /^copy message$/i : /^copy response$/i;
      const candidateScore = (button, scope, role) => {
        const buttonRect = visibleRect(button);
        const scopeRect = visibleRect(scope);
        if (!buttonRect || !scopeRect) return Number.POSITIVE_INFINITY;
        const aria = String(button.getAttribute("aria-label") || "").trim();
        const testId = String(button.getAttribute("data-testid") || "").trim();
        const correctLabel = roleLabel(role).test(aria);
        const copyTurnButton = testId === "copy-turn-action-button";
        if (!correctLabel && !copyTurnButton) return Number.POSITIVE_INFINITY;
        const verticalOverlap = buttonRect.bottom >= scopeRect.top - 32 && buttonRect.top <= scopeRect.bottom + 120;
        const horizontalDistance = buttonRect.left < scopeRect.left - 120 || buttonRect.left > scopeRect.right + 180 ? 5e3 : 0;
        return (correctLabel ? 0 : 1e3) + (verticalOverlap ? 0 : 1e4) + horizontalDistance + Math.abs(centerY(buttonRect) - centerY(scopeRect)) + Math.abs(buttonRect.left - scopeRect.left) / 20;
      };
      const copyForTurn = async (scope, role) => {
        api.reveal(scope);
        await api.sleep(160);
        const buttons = api.qsa(opts.copyButtonSelector, document, { all: true }).filter(api.visible).map((button) => ({ button, score: candidateScore(button, scope, role) })).filter((item) => Number.isFinite(item.score)).sort((a, b) => a.score - b.score).slice(0, opts.maxButtons);
        for (const item of buttons) {
          const copied = await api.copy(item.button);
          const text = api.normalize(copied);
          if (text) return text;
          await api.sleep(80);
        }
        return "";
      };
      const turns = api.qsa("[data-message-author-role]", document, { all: true }).filter(api.visible).map((node) => ({ node, role: String(node.getAttribute("data-message-author-role") || "").toLowerCase() })).filter((turn) => turn.role === "user" || turn.role === "assistant").filter((turn, index, list) => !list.some((other, otherIndex) => otherIndex !== index && other.role === turn.role && other.node !== turn.node && other.node.contains && other.node.contains(turn.node)));
      const out = [];
      for (const turn of turns) {
        const scope = turnScope(turn.node);
        const text = await copyForTurn(scope, turn.role);
        if (text) out.push({ role: turn.role, text });
        await api.sleep(120);
      }
      const merged = api.merge(out);
      return merged.some((message) => message.role === "user") && merged.some((message) => message.role === "assistant") ? merged : [];
    };
    scripts["chatgpt.js"] = scripts["chatgpt"];
    scripts["claude"] = async function(api) {
      const normalize = (value) => api.normalize(String(value || ""));
      const qsa = (selector, root2 = document) => {
        try {
          return api.qsa(selector, root2, { all: true });
        } catch (error) {
          return [];
        }
      };
      const closest = (element, selector) => {
        try {
          return api.closest(element, selector);
        } catch (error) {
          return null;
        }
      };
      const layoutVisible = (element) => {
        if (!element) return false;
        try {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 4 && rect.height > 4 && style.display !== "none" && style.visibility !== "hidden";
        } catch (error) {
          return false;
        }
      };
      const meta = (element) => normalize([
        element && element.tagName,
        element && element.getAttribute && element.getAttribute("aria-label"),
        element && element.getAttribute && element.getAttribute("title"),
        element && element.getAttribute && element.getAttribute("data-testid"),
        element && element.getAttribute && element.getAttribute("data-test-id"),
        element && typeof element.className === "string" ? element.className : "",
        element && element.textContent
      ].filter(Boolean).join(" "));
      const order = (a, b) => {
        try {
          if (a === b) return 0;
          const pos = a.compareDocumentPosition(b);
          return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : pos & Node.DOCUMENT_POSITION_PRECEDING ? 1 : 0;
        } catch (error) {
          return 0;
        }
      };
      const roots = qsa("main,[role=main]", document).filter(layoutVisible);
      const root = roots.find((element) => !closest(element, "nav,aside,header,footer")) || roots[0] || document;
      const roleFromHeading = (text) => {
        if (/^\s*(?:You said|你说|您说)\s*[:：]/i.test(text)) return "user";
        if (/^\s*(?:Claude responded|Claude replied|Claude said|Claude\s*(?:回复|回答))\s*[:：]/i.test(text)) return "assistant";
        return "";
      };
      const structured = (messages) => Array.isArray(messages) && messages.some((item) => item && item.role === "user") && messages.some((item) => item && item.role === "assistant");
      const cleanLine = (value) => normalize(value).replace(/^[-•]\s*/, "").replace(/(?:\s*[\u25a0-\u25ff]){2,}\s*$/g, "").replace(/\s+/g, " ").trim();
      const compact = (value) => normalize(value).toLowerCase().replace(/\s+/g, " ").trim();
      const useful = (value) => {
        const text = normalize(value).replace(/^Copied to clipboard\.?$/i, "").replace(/(?:\s*[\u25a0-\u25ff]){2,}\s*$/g, "").trim();
        if (!text || /^(?:copy|copied|复制|已复制)$/i.test(text)) return "";
        if (/^(?:https?:\/\/|mailto:|#)\S{1,240}$/i.test(text)) return "";
        return text;
      };
      const hasUsefulLength = (role, text) => role === "user" ? text.length >= 2 : text.length >= 8;
      const mergeIfStructured = (messages) => {
        const merged = api.merge(messages || []);
        return structured(merged) ? merged : [];
      };
      const headings = qsa("h1,h2,h3,h4,[role=heading]", root).filter(layoutVisible).map((element) => ({ element, role: roleFromHeading(normalize(element.innerText || element.textContent || "")) })).filter((item) => item.role).sort((a, b) => order(a.element, b.element));
      const copyPattern = /^\s*(?:copy|copied|复制|已复制)\s*$/i;
      const copyWordPattern = /(?:^|\b)(?:copy|copied)(?:\b|$)|复制|已复制/i;
      const excludePattern = /copy\s*(?:code|table|link|conversation|source|sources)|copy[-_ ]?(?:code|table|link|conversation|source|sources)|(?:link|share|history|source|sources|citation|citations|feedback|thumb|like|dislike|positive|negative|settings|export|docs|menu|more|retry|edit|regenerate|sidebar)|链接|分享|代码|表格|会话|历史|来源|引用|赞|踩|设置|导出|更多|菜单|重试|编辑/i;
      const isInternalTool = (button) => {
        if (closest(button, "nav,aside,header,footer,form,input,textarea,select,[contenteditable=true],pre,code,table,kbd,samp,[data-language]")) return true;
        return false;
      };
      const isCopyButton = (button) => {
        const label = meta(button);
        return layoutVisible(button) && (copyPattern.test(label) || copyWordPattern.test(label)) && !excludePattern.test(label) && !isInternalTool(button);
      };
      const roleForButton = (button) => {
        let found = null;
        for (const heading of headings) {
          if (order(heading.element, button) <= 0) found = heading;
          else break;
        }
        return found && found.role || "";
      };
      const legacyHeadingCopy = async () => {
        if (!headings.length) return [];
        const turns = [];
        const seen = /* @__PURE__ */ new Set();
        const buttons = qsa("button,[role=button]", root).filter(isCopyButton).sort(order).slice(0, 48);
        for (const button of buttons) {
          const role = roleForButton(button);
          if (role !== "user" && role !== "assistant") continue;
          api.reveal(button);
          await api.sleep(120);
          const text = useful(await api.copy(button, {
            resetClipboardBeforeCopy: true,
            acceptUnchangedClipboard: false,
            copyTimeoutMs: 2400,
            copyPollMs: 50,
            copyCaptureGraceMs: 220
          }));
          if (text) {
            const key = role + "\n" + compact(text);
            if (!seen.has(key)) {
              seen.add(key);
              turns.push({ role, text });
            }
          }
          await api.sleep(80);
        }
        return mergeIfStructured(turns);
      };
      const stripRolePrefix = (line, role) => {
        if (role === "user") return line.replace(/^\s*(?:You said|你说|您说)\s*[:：]\s*/i, "").trim();
        return line.replace(/^\s*(?:Claude responded|Claude replied|Claude said|Claude\s*(?:回复|回答))\s*[:：]\s*/i, "").trim();
      };
      const chromeLinePattern = /^(?:Message\s+\d+\s+of\s+\d+|Use the up and down arrow keys to move between messages\.?|Message actions|Claude finished the response|\d{1,2}:\d{2}\s*(?:AM|PM)?|Scroll to bottom|Share|Copy|Copied|Retry|Edit|Read aloud|Give positive feedback|Give negative feedback|Press and hold to record|Use voice mode|Write a message|Model:.*|Sonnet\s+\d+.*|Add files, connectors, and more|Settings|Free plan|Upgrade|Claude can make mistakes.*|搜索|Explain|翻译|\/skill|```code|油猴脚本|Prompt|助手|其他|复制|已复制|重试|编辑|分享|朗读|点赞|点踩)$/i;
      const cleanDomText = (raw, role) => {
        const lines = [];
        const seen = /* @__PURE__ */ new Set();
        for (const rawLine of String(raw || "").split(/\n+/)) {
          let line = cleanLine(rawLine);
          if (!line) continue;
          const markerRole = roleFromHeading(line);
          if (markerRole && markerRole !== role) {
            if (lines.length) break;
            continue;
          }
          if (markerRole === role) line = stripRolePrefix(line, role);
          line = line.replace(/\s*(?:Copy|Retry|Edit|Read aloud|Give positive feedback|Give negative feedback)\s*$/i, "").trim();
          if (!line || chromeLinePattern.test(line)) continue;
          const key = compact(line);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          lines.push(line);
        }
        return normalize(lines.join("\n"));
      };
      const claudeArticleSelector = '[role="article"][aria-label^="Message "]';
      const claudeActionCopySelector = 'button[data-testid="action-bar-copy"][aria-label="Copy"],button[data-testid="action-bar-copy"][title="Copy"]';
      const cleanCopiedText = (raw, role) => {
        let text = useful(raw);
        if (!text) return "";
        text = stripRolePrefix(text, role).replace(/[\ue000-\uf8ff]+/g, "").trim();
        return useful(text);
      };
      const roleFromArticle = (article) => {
        const text = normalize(article && (article.innerText || article.textContent) || "");
        const explicit = roleFromHeading(text);
        if (explicit) return explicit;
        return "";
      };
      const claudeArticles = () => qsa(claudeArticleSelector, root).filter(layoutVisible).filter((article, index, list) => !list.some((other, otherIndex) => otherIndex !== index && other.contains(article))).sort(order);
      const claudeArticleCopyButtons = (article) => qsa(claudeActionCopySelector, article).filter(layoutVisible).sort(order);
      const hasClaudeArticleCopyButtons = () => claudeArticles().some((article) => claudeArticleCopyButtons(article).length > 0);
      const articleCopyOptions = {
        copyButtonSelector: claudeActionCopySelector,
        copyButtonPattern: "action-bar-copy|copy|copied|clipboard|复制|已复制",
        copyButtonIconFallback: false,
        copyButtonExcludePattern: "copy\\s*(?:code|table|link|conversation|source|sources)|copy[-_ ]?(?:code|table|link|conversation|source|sources)|(?:link|share|history|source|sources|citation|citations|feedback|thumb|like|dislike|positive|negative|settings|export|docs|menu|more|retry|edit|regenerate|sidebar|read aloud|model)|链接|分享|代码|表格|会话|历史|来源|引用|赞|踩|设置|导出|更多|菜单|重试|编辑|朗读|模型",
        copyTextExcludePattern: "^(?:Copy|Copied|复制|已复制)$",
        copyMenu: false,
        resetClipboardBeforeCopy: true,
        acceptUnchangedClipboard: false,
        copyTimeoutMs: 7e3,
        copyPollMs: 40,
        copyCaptureGraceMs: 340,
        matchMode: "anyUseful"
      };
      const messageCopyFromArticles = async () => {
        const articles = claudeArticles();
        if (!articles.length) return [];
        const turns = [];
        const seenText = /* @__PURE__ */ new Set();
        const debug = [];
        for (const article of articles) {
          const role = roleFromArticle(article);
          if (role !== "user" && role !== "assistant") {
            debug.push({ reason: "role not recognized", label: article.getAttribute("aria-label") || "", text: normalize(article.innerText || article.textContent || "").slice(0, 80) });
            continue;
          }
          const buttons = claudeArticleCopyButtons(article).slice(0, 4);
          if (!buttons.length) {
            debug.push({ role, reason: "copy button not found", label: article.getAttribute("aria-label") || "" });
            continue;
          }
          try {
            api.reveal(article);
          } catch (error) {
          }
          await api.sleep(160);
          for (const button of buttons) {
            try {
              api.reveal(button);
            } catch (error) {
            }
          }
          const copied = cleanCopiedText(await api.copyFirst(buttons, {
            expected: "",
            role,
            scope: article,
            options: articleCopyOptions
          }), role);
          if (!hasUsefulLength(role, copied)) {
            debug.push({ role, reason: "empty copy result", buttonCount: buttons.length, label: article.getAttribute("aria-label") || "" });
            continue;
          }
          const key = role + "\n" + compact(copied);
          if (!seenText.has(key)) {
            seenText.add(key);
            turns.push({ role, text: copied });
          }
          await api.sleep(90);
        }
        const merged = mergeIfStructured(turns);
        if (!structured(merged) && debug.length) console.debug("[Simple Chat Hub] Claude article copy extraction", debug);
        return merged;
      };
      const messageWrapperCandidate = (element) => {
        if (!element || element === document || element === document.documentElement || element === document.body) return false;
        const label = normalize([
          element.getAttribute && element.getAttribute("aria-label"),
          element.getAttribute && element.getAttribute("data-testid"),
          element.getAttribute && element.getAttribute("data-test-id"),
          element.getAttribute && element.getAttribute("role"),
          typeof element.className === "string" ? element.className : ""
        ].filter(Boolean).join(" "));
        if (/\bmessage\s+\d+\s+of\s+\d+\b/i.test(label)) return true;
        if (/message|conversation-turn|chat-message|chat_message/i.test(label) && qsa("button,[role=button],[role=toolbar],toolbar", element).length) return true;
        return false;
      };
      const messageRootFor = (element) => {
        let best = null;
        for (let node = element && element.parentElement, depth = 0; node && node !== root && depth < 10; node = node.parentElement, depth += 1) {
          if (messageWrapperCandidate(node)) {
            best = node;
            break;
          }
          const text = normalize(node.innerText || node.textContent || "");
          if (!best && text.length >= 8 && text.length <= 2e4 && qsa("button,[role=button],[role=toolbar],toolbar", node).length) best = node;
        }
        return best || element.parentElement || element;
      };
      const rectOf = (element) => {
        try {
          const rect = element && element.getBoundingClientRect && element.getBoundingClientRect();
          return rect && rect.width > 0 && rect.height > 0 ? rect : null;
        } catch (error) {
          return null;
        }
      };
      const centerY = (rect) => rect ? (rect.top + rect.bottom) / 2 : 0;
      const messageCopyButtonScore = (button, wrapper) => {
        if (!button || !wrapper || !isCopyButton(button)) return Number.POSITIVE_INFINITY;
        const buttonRoot = messageRootFor(button);
        if (buttonRoot && buttonRoot !== wrapper && !wrapper.contains(buttonRoot) && !buttonRoot.contains(wrapper)) return Number.POSITIVE_INFINITY;
        const buttonRect = rectOf(button);
        const wrapperRect = rectOf(wrapper);
        let score = wrapper.contains(button) ? 0 : 5e3;
        const label = meta(button);
        if (/^(?:button\s+)?copy$/i.test(label) || /\bcopy\b/i.test(label)) score -= 700;
        if (closest(button, '[role=toolbar],toolbar,[class*="action" i],[class*="toolbar" i]')) score -= 250;
        if (!buttonRect || !wrapperRect) return score + 2e3;
        const verticalOverlap = buttonRect.bottom >= wrapperRect.top - 16 && buttonRect.top <= wrapperRect.bottom + 96;
        if (!verticalOverlap) score += 1e4;
        score += Math.abs(centerY(buttonRect) - centerY(wrapperRect));
        score += Math.max(0, buttonRect.top - wrapperRect.bottom) / 2;
        score += Math.max(0, wrapperRect.left - buttonRect.right) / 4;
        score += Math.max(0, buttonRect.left - wrapperRect.right) / 4;
        return score;
      };
      const messageCopyButtonsFor = (wrapper) => {
        const seen = /* @__PURE__ */ new Set();
        const buttons = [];
        const add = (button) => {
          if (!button || seen.has(button)) return;
          seen.add(button);
          const score = messageCopyButtonScore(button, wrapper);
          if (Number.isFinite(score)) buttons.push({ button, score });
        };
        qsa("button,[role=button]", wrapper).forEach(add);
        qsa("button,[role=button]", root).forEach((button) => {
          const rect = rectOf(button);
          const wrapperRect = rectOf(wrapper);
          if (!rect || !wrapperRect) return;
          if (rect.bottom < wrapperRect.top - 24 || rect.top > wrapperRect.bottom + 120) return;
          add(button);
        });
        return buttons.sort((a, b) => a.score - b.score || order(a.button, b.button)).map((item) => item.button);
      };
      const hasClaudeMessageCopyButtons = () => headings.some((heading) => {
        const wrapper = messageRootFor(heading.element);
        return messageCopyButtonsFor(wrapper).length > 0;
      });
      const messageCopyFromHeadings = async () => {
        if (!headings.length) return [];
        const turns = [];
        const seenRoots = /* @__PURE__ */ new Set();
        const seenText = /* @__PURE__ */ new Set();
        const copyOptions = {
          resetClipboardBeforeCopy: true,
          acceptUnchangedClipboard: false,
          copyTimeoutMs: 6500,
          copyPollMs: 40,
          copyCaptureGraceMs: 320,
          copyMenu: false,
          matchMode: "anyUseful"
        };
        const debug = [];
        for (const heading of headings) {
          const wrapper = messageRootFor(heading.element);
          if (!wrapper || seenRoots.has(wrapper)) continue;
          seenRoots.add(wrapper);
          const expected = cleanDomText(api.text(wrapper) || wrapper.innerText || wrapper.textContent || "", heading.role);
          const buttons = messageCopyButtonsFor(wrapper).slice(0, 8);
          if (!buttons.length) {
            debug.push({ role: heading.role, reason: "copy button not found", expected: expected.slice(0, 80) });
            continue;
          }
          try {
            api.reveal(wrapper);
          } catch (error) {
          }
          await api.sleep(140);
          for (const button of buttons) {
            try {
              api.reveal(button);
            } catch (error) {
            }
          }
          const copied = useful(await api.copyFirst(buttons, {
            expected,
            role: heading.role,
            scope: wrapper,
            options: copyOptions
          }));
          if (!hasUsefulLength(heading.role, copied)) {
            debug.push({ role: heading.role, reason: "empty copy result", buttonCount: buttons.length, expected: expected.slice(0, 80) });
            continue;
          }
          const key = heading.role + "\n" + compact(copied);
          if (!seenText.has(key)) {
            seenText.add(key);
            turns.push({ role: heading.role, text: copied });
          }
          await api.sleep(90);
        }
        const merged = mergeIfStructured(turns);
        if (!structured(merged) && debug.length) console.debug("[Simple Chat Hub] Claude message copy extraction", debug);
        return merged;
      };
      const domFromHeadings = () => {
        if (!headings.length) return [];
        const turns = [];
        const seenRoots = /* @__PURE__ */ new Set();
        for (const heading of headings) {
          const wrapper = messageRootFor(heading.element);
          if (!wrapper || seenRoots.has(wrapper)) continue;
          seenRoots.add(wrapper);
          const text = cleanDomText(api.text(wrapper) || wrapper.innerText || wrapper.textContent || "", heading.role);
          if (hasUsefulLength(heading.role, text)) turns.push({ role: heading.role, text });
        }
        return mergeIfStructured(turns);
      };
      const splitTextByRoleLabels = () => {
        const raw = normalize(api.text(root) || root.innerText || root.textContent || "");
        if (!raw) return [];
        const blocks = [];
        let current = null;
        for (const rawLine of raw.split(/\n+/)) {
          const line = cleanLine(rawLine);
          if (!line) continue;
          const role = roleFromHeading(line);
          if (role) {
            if (current) blocks.push(current);
            current = { role, lines: [stripRolePrefix(line, role)] };
            continue;
          }
          if (!current) continue;
          if (chromeLinePattern.test(line)) continue;
          current.lines.push(line);
        }
        if (current) blocks.push(current);
        const turns = blocks.map((block) => ({ role: block.role, text: cleanDomText(block.lines.join("\n"), block.role) })).filter((item) => hasUsefulLength(item.role, item.text));
        return mergeIfStructured(turns);
      };
      const articleCopy = await messageCopyFromArticles();
      if (structured(articleCopy)) return articleCopy;
      const messageCopy = await messageCopyFromHeadings();
      if (structured(messageCopy)) return messageCopy;
      const legacy = await legacyHeadingCopy();
      if (structured(legacy)) return legacy;
      if (typeof api.extractNativeCopyConversation === "function") {
        const copied = await api.extractNativeCopyConversation(root);
        if (structured(copied)) return copied;
      }
      if (hasClaudeArticleCopyButtons() || hasClaudeMessageCopyButtons()) {
        console.debug("[Simple Chat Hub] Claude copy buttons were present, so DOM text fallback was not accepted.");
        return [];
      }
      const headingDom = domFromHeadings();
      if (structured(headingDom)) return headingDom;
      return splitTextByRoleLabels();
    };
    scripts["claude.js"] = scripts["claude"];
    scripts["gemini"] = async function(api) {
      const copyTimeoutMs = Math.max(500, Math.min(3e3, Number(api.config && api.config.copyTimeoutMs) || 1400));
      const retryCopyTimeoutMs = Math.max(copyTimeoutMs + 400, 1800);
      const root = api.qs('main,[role="main"]') || document.body;
      const normalize = (value) => api.normalize(String(value || ""));
      const chromeLinePattern = /^(?:Copy prompt|Copy|Copied|Edit|Good response|Bad response|Redo|Show more options|Share|Export|Open menu for conversation actions\.?|Ask Gemini|Microphone|Upload & tools|Send message|Flash(?:[-\s]?Lite)?|Flash|Pro|Experimental|Deep Research|Canvas|Search|Explain|Translate|翻译|搜索|复制|已复制|编辑|重新生成|更多|分享|导出|点赞|点踩)$/i;
      const stripLabels = (value) => String(value || "").replace(/(^|\n)\s*(?:You said|Gemini said)\s+(?=\S)/gi, "$1").replace(/(^|\n)\s*(?:You said|Gemini said)\s*(?=\n|$)/gi, "\n").replace(/(^|\n)\s*(?:Copy prompt|Copy|Copied|Edit|Good response|Bad response|Redo|Show more options)\s*(?=\n|$)/gi, "\n");
      const cleanCopiedText = (value) => normalize(stripLabels(value)).split(/\n+/).map((line) => line.trim().replace(/^(?:You said|Gemini said)\s+/i, "").trim()).filter((line) => line && !chromeLinePattern.test(line)).join("\n");
      const useful = (value) => {
        const text = cleanCopiedText(value);
        if (!text || text.length < 2 || text.length > 5e4) return "";
        if (/^(?:https?:\/\/|mailto:|#)\S{1,240}$/i.test(text)) return "";
        return text;
      };
      const compact = (value) => String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
      const labelOf = (node) => normalize([
        node && node.getAttribute && node.getAttribute("aria-label"),
        node && node.getAttribute && node.getAttribute("aria-labelledby"),
        node && node.getAttribute && node.getAttribute("data-tooltip"),
        node && node.getAttribute && node.getAttribute("title"),
        node && node.getAttribute && node.getAttribute("data-testid"),
        node && node.textContent,
        node && node.innerText
      ].filter(Boolean).join(" "));
      const rectOf = (node) => {
        try {
          const rect = node && node.getBoundingClientRect && node.getBoundingClientRect();
          return rect && rect.width > 0 && rect.height > 0 ? rect : null;
        } catch (error) {
          return null;
        }
      };
      const centerY = (rect) => (rect.top + rect.bottom) / 2;
      const elementOrder = (a, b) => {
        try {
          if (a === b) return 0;
          return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1;
        } catch (error) {
          return 0;
        }
      };
      const addUnique = (items, item) => {
        if (item && !items.includes(item)) items.push(item);
      };
      const closest = (node, selector) => {
        try {
          return api.closest ? api.closest(node, selector) : node && node.closest && node.closest(selector);
        } catch (error) {
          return null;
        }
      };
      const roleFor = (node) => {
        const meta = [
          node && node.tagName,
          node && node.getAttribute && node.getAttribute("data-message-author-role"),
          node && node.getAttribute && node.getAttribute("data-test-id"),
          node && node.getAttribute && node.getAttribute("data-testid"),
          node && node.getAttribute && node.getAttribute("class")
        ].filter(Boolean).join(" ").toLowerCase();
        if (/user|query/.test(meta)) return "user";
        if (/assistant|model|response/.test(meta)) return "assistant";
        return "";
      };
      const roleFromHeading = (node) => {
        const text = normalize(node && node.textContent);
        if (/^you said(?:\b|\s|$)/i.test(text)) return "user";
        if (/^gemini said(?:\b|\s|$)/i.test(text)) return "assistant";
        return "";
      };
      const canonicalTurn = (node, role) => {
        const selector = role === "user" ? 'user-query,.user-query,[data-test-id*="user-query"],[data-testid*="user-query"],[data-message-author-role="user"]' : 'model-response,.model-response,[data-test-id*="model-response"],[data-testid*="model-response"],[data-message-author-role="assistant"]';
        return closest(node, selector) || node;
      };
      const turnSelector = [
        "user-query",
        ".user-query",
        '[data-test-id*="user-query"]',
        '[data-testid*="user-query"]',
        '[data-message-author-role="user"]',
        "model-response",
        ".model-response",
        '[data-test-id*="model-response"]',
        '[data-testid*="model-response"]',
        '[data-message-author-role="assistant"]'
      ].join(",");
      const turnMap = /* @__PURE__ */ new Map();
      for (const node of api.qsa(turnSelector, root, { all: true }).filter(api.visible)) {
        const role = roleFor(node);
        if (role === "user" || role === "assistant") turnMap.set(node, { node, role });
      }
      for (const heading of api.qsa('h1,h2,h3,[role="heading"]', root, { all: true }).filter(api.visible)) {
        const role = roleFromHeading(heading);
        if (role !== "user" && role !== "assistant") continue;
        const node = canonicalTurn(heading, role);
        if (!turnMap.has(node)) turnMap.set(node, { node, role });
      }
      const turns = Array.from(turnMap.values()).filter((item, index, list) => !list.some((other, otherIndex) => otherIndex !== index && other.node !== item.node && other.node.contains && other.node.contains(item.node) && other.role === item.role)).sort((a, b) => elementOrder(a.node, b.node));
      const buttonSelector = 'button,[role="button"],[role="menuitem"],[mat-icon-button]';
      const userButtonLabel = (label) => /copy\s*prompt|copy[-_ ]?prompt|复制(?:提示|提问|问题)/i.test(label);
      const assistantExcludedLabel = (label) => /copy\s*(?:prompt|code|table|link|conversation|image|source|sources)|copy[-_ ]?(?:prompt|code|table|link|conversation|image|source|sources)|prompt|code|table|link|conversation|history|image|source|sources|citation|citations|feedback|thumb|like|dislike|settings|export|download|提示|提问|问题|代码|表格|链接|会话|历史|图片|下载|来源|引用/i.test(label);
      const assistantButtonLabel = (label) => !assistantExcludedLabel(label) && (/^(?:copy|copied|复制|已复制|content_copy|copy_all|file_copy)$/i.test(label) || /\b(?:content_copy|copy_all|file_copy)\b/i.test(label));
      const roleButtonMatch = (button, role) => {
        const label = labelOf(button);
        return role === "user" ? userButtonLabel(label) : assistantButtonLabel(label);
      };
      const turnScopes = (turn) => {
        const scopes = [];
        addUnique(scopes, turn.node);
        for (let node = turn.node, depth = 0; node && node !== document.body && depth < 5; node = node.parentElement, depth += 1) {
          addUnique(scopes, node);
          addUnique(scopes, node.previousElementSibling);
          addUnique(scopes, node.nextElementSibling);
        }
        return scopes;
      };
      const revealTurn = async (turn, delay) => {
        for (const scope of turnScopes(turn)) api.reveal(scope);
        await api.sleep(delay);
      };
      const candidateScore = (button, turn) => {
        const buttonRect = rectOf(button);
        const turnRect = rectOf(turn.node);
        if (!buttonRect || !turnRect || !roleButtonMatch(button, turn.role)) return Number.POSITIVE_INFINITY;
        const verticalOverlap = buttonRect.bottom >= turnRect.top - 96 && buttonRect.top <= turnRect.bottom + 220;
        const horizontalPenalty = buttonRect.left < turnRect.left - 220 || buttonRect.left > turnRect.right + 260 ? 5e3 : 0;
        return (verticalOverlap ? 0 : 1e4) + horizontalPenalty + Math.abs(centerY(buttonRect) - centerY(turnRect)) + Math.max(0, buttonRect.top - turnRect.bottom) / 2;
      };
      const collectButtons = async (turn) => {
        const candidates = [];
        const scan = () => {
          for (const button of api.qsa(buttonSelector, root, { all: true }).filter(api.visible)) {
            if (roleButtonMatch(button, turn.role)) addUnique(candidates, button);
          }
        };
        for (const delay of [80, 180, 280]) {
          await revealTurn(turn, delay);
          scan();
          const scored = candidates.map((button) => ({ button, score: candidateScore(button, turn) })).filter((item) => Number.isFinite(item.score)).sort((a, b) => a.score - b.score || elementOrder(a.button, b.button));
          if (scored.length) return scored.slice(0, 3).map((item) => item.button);
        }
        return [];
      };
      const copyFromButtons = async (buttons) => {
        for (const button of buttons) {
          const text = useful(await api.copy(button, { copyTimeoutMs, copyPollMs: 40 }));
          if (text) return text;
        }
        if (buttons[0]) {
          await api.sleep(180);
          return useful(await api.copy(buttons[0], { copyTimeoutMs: retryCopyTimeoutMs, copyPollMs: 40 }));
        }
        return "";
      };
      const push = (out2, role, value) => {
        const text = useful(value);
        if (role !== "user" && role !== "assistant" || !text) return false;
        const key = role + "|" + compact(text);
        for (let index = 0; index < out2.length; index += 1) {
          const existing = out2[index];
          if (existing.role !== role) continue;
          const existingKey = role + "|" + compact(existing.text);
          if (existingKey === key || existingKey.includes(key)) return true;
          if (key.includes(existingKey)) {
            out2[index] = { role, text };
            return true;
          }
        }
        out2.push({ role, text });
        return true;
      };
      for (const turn of turns) await revealTurn(turn, 40);
      await api.sleep(120);
      const out = [];
      for (const turn of turns) {
        const buttons = await collectButtons(turn);
        push(out, turn.role, await copyFromButtons(buttons));
      }
      const merged = api.merge(out);
      return merged.some((message) => message.role === "user") && merged.some((message) => message.role === "assistant") ? merged : [];
    };
    scripts["gemini.js"] = scripts["gemini"];
    scripts["deepseek"] = async function(api) {
      const site = "deepseek";
      const root = api.qs('main,[role="main"]') || document.body || document.documentElement;
      const copyOptions = {
        resetClipboardBeforeCopy: true,
        acceptUnchangedClipboard: false,
        copyTimeoutMs: 2200,
        copyPollMs: 40,
        copyCaptureGraceMs: 260
      };
      const normalize = (value) => api.normalize(String(value || ""));
      const isCopyProbe = (value) => /_?sch[\s_-]*copy[\s_-]*probe[\s_-]*[a-z0-9-]+_?/i.test(String(value || "")) || /_?sch[\s_-]*copy[\s_-]*probe[\s_-]*[a-z0-9-]+_?/i.test(normalize(value));
      const qsa = (selector, scope = document) => {
        try {
          return api.qsa(selector, scope || document, { all: true });
        } catch (error) {
          return [];
        }
      };
      const closest = (node, selector) => {
        try {
          return api.closest ? api.closest(node, selector) : node && node.closest && node.closest(selector);
        } catch (error) {
          return null;
        }
      };
      const rectOf = (node) => {
        try {
          const rect = node && node.getBoundingClientRect && node.getBoundingClientRect();
          return rect && rect.width > 0 && rect.height > 0 ? rect : null;
        } catch (error) {
          return null;
        }
      };
      const visible = (node) => {
        try {
          const rect = rectOf(node);
          if (!rect) return false;
          const style = getComputedStyle(node);
          return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) !== 0;
        } catch (error) {
          return !!(api.visible && api.visible(node));
        }
      };
      const order = (a, b) => {
        try {
          if (a === b) return 0;
          return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1;
        } catch (error) {
          return 0;
        }
      };
      const classText = (node) => {
        const value = node && node.getAttribute && node.getAttribute("class") || node && node.className;
        return typeof value === "string" ? value : value && value.baseVal || "";
      };
      const attrRefText = (node, attr) => {
        try {
          return String(node && node.getAttribute && node.getAttribute(attr) || "").split(/\s+/).map((id) => id && node.ownerDocument && node.ownerDocument.getElementById(id)).filter(Boolean).map((el) => el.innerText || el.textContent || "").join(" ");
        } catch (error) {
          return "";
        }
      };
      const meta = (node) => normalize([
        node && node.tagName,
        classText(node),
        node && node.getAttribute && node.getAttribute("role"),
        node && node.getAttribute && node.getAttribute("aria-label"),
        attrRefText(node, "aria-labelledby"),
        attrRefText(node, "aria-describedby"),
        node && node.getAttribute && node.getAttribute("aria-description"),
        node && node.getAttribute && node.getAttribute("title"),
        node && node.getAttribute && node.getAttribute("data-tooltip"),
        node && node.getAttribute && node.getAttribute("data-testid"),
        node && node.getAttribute && node.getAttribute("data-test-id"),
        node && node.textContent,
        node && node.innerText
      ].filter(Boolean).join(" "));
      const svgSignature = (node) => normalize([node, ...qsa("svg,path,rect,line,polyline,polygon,use,img,[data-icon],[class]", node).slice(0, 80)].map((el) => [
        classText(el),
        el && el.getAttribute && el.getAttribute("data-icon"),
        el && el.getAttribute && el.getAttribute("aria-label"),
        el && el.getAttribute && el.getAttribute("title"),
        el && el.getAttribute && el.getAttribute("alt"),
        el && el.getAttribute && el.getAttribute("src"),
        el && el.getAttribute && el.getAttribute("href"),
        el && el.getAttribute && el.getAttribute("xlink:href"),
        el && el.getAttribute && el.getAttribute("viewBox"),
        el && el.getAttribute && el.getAttribute("d"),
        el && el.getAttribute && el.getAttribute("x"),
        el && el.getAttribute && el.getAttribute("y"),
        el && el.getAttribute && el.getAttribute("width"),
        el && el.getAttribute && el.getAttribute("height")
      ].filter(Boolean).join(" ")).join(" ")).toLowerCase();
      const explicitCopy = (button) => /(?:^|\b)(copy|copied|clipboard)(?:\b|$)|复制|已复制|拷贝|content_copy|copy_all|file_copy/i.test(meta(button));
      const codeOrLinkCopy = (button) => /copy\s*(?:code|table|link|conversation|source|sources|url)|copy[-_ ]?(?:code|table|link|conversation|source|sources|url)|复制(?:代码|表格|链接|会话|来源|引用)/i.test(meta(button));
      const looksCopyIcon = (button) => {
        const text = svgSignature(button);
        if (!text) return false;
        if (/copy|clipboard|content_copy|copy_all|file_copy|lucide-copy|tabler-icon-copy|copy[-_ ]?(?:icon|line|fill)|heroicons.*clipboard|mingcute.*copy|carbon.*copy/.test(text)) return true;
        if (/64 64 896 896/.test(text) && /m832\s*64h296|m704\s*192h-?512|v688|v704|h512|h496/.test(text) && /v624|h432|h496/.test(text)) return true;
        if (/0 0 (16|18|20) (16|18|20)/.test(text) && /(m12\.668\s*10\.667c|m12\.66810\.667c|m13\.998\s*12\.665c|m13\.99812\.665c|m6\.14929\s*4\.02032c|m6\.149294\.02032c|m9\.80164\s*0\.367975c|m9\.801640\.367975c)/.test(text)) return true;
        if (/0 0 24 24/.test(text) && (/\bm\s*(4|6|7|8|9)\s*(4|6|7|8|9)\b/.test(text) || /\bx\s*=\s*(4|6|7|8|9)\b/.test(text)) && /\bh\s*(8|9|10|12|14)\b|\bv\s*(8|9|10|12|14)\b|width=(8|9|10|12|14)|height=(8|9|10|12|14)/.test(text)) return true;
        const rects = qsa("rect", button).filter((rect) => Number(rect.getAttribute("width") || 0) >= 7 && Number(rect.getAttribute("height") || 0) >= 7);
        return rects.length >= 2;
      };
      const isSmallIconButton = (button) => {
        const rect = rectOf(button);
        if (!rect || rect.width < 12 || rect.height < 12 || rect.width > 76 || rect.height > 76) return false;
        const label = normalize(meta(button)).toLowerCase();
        const textOnly = normalize(button && (button.innerText || button.textContent) || "");
        return !!qsa("svg,img,[data-icon]", button).length && textOnly.length <= 32 && !/(send|ask anything|message|search|deepthink|model|attach|upload|voice|home|new chat|sidebar|fullscreen|reload|menu|more)/i.test(label);
      };
      const hoverCopyVisible = (button) => {
        if (visible(button)) return true;
        try {
          const style = getComputedStyle(button);
          if (style.display === "none" || style.visibility === "hidden") return false;
          return explicitCopy(button) || looksCopyIcon(button) || !!qsa("svg,img,[data-icon]", button).length;
        } catch (error) {
          return false;
        }
      };
      const badButton = (button, role = "") => {
        if (!button || !visible(button)) return true;
        if (closest(button, "nav,header,footer,aside,form,input,textarea,select,[contenteditable=true],pre,code,table,kbd,samp,[data-language]")) return true;
        const label = meta(button).toLowerCase();
        const blockedAction = /(?:link|share|history|source|sources|citation|feedback|thumb|like|dislike|settings|export|docs|menu|more|notification|sidebar|regenerate|retry|upload|voice|submit|send|model|attach|new chat|home page|fullscreen|reload|close|edit|delete|search|deepthink|imagine|project|pfp|profile|upgrade)|链接|分享|历史|来源|引用|赞|踩|设置|导出|更多|菜单|通知|侧边栏|重新生成|上传|语音|提交|发送|编辑|删除|搜索/.test(label);
        if (blockedAction && !explicitCopy(button)) return true;
        if (codeOrLinkCopy(button)) return true;
        if (explicitCopy(button) || looksCopyIcon(button)) return false;
        return blockedAction;
      };
      const textOf = (node) => {
        try {
          return normalize(api.text ? api.text(node) : node && (node.innerText || node.textContent));
        } catch (error) {
          return normalize(node && (node.innerText || node.textContent));
        }
      };
      const uiLine = /^(?:Copy|Copied|Copy prompt|Copy message|Copy response|Create share link|Like|Dislike|Regenerate|More actions|More options|Share|Edit|Search|DeepThink|Ask anything|Upgrade to SuperGrok|New conversation - Grok|AI-generated, for reference only|This response is AI-generated, for reference only|Necessary cookies only|Accept all cookies|Cookie Settings|\d+ sources?|\d+ web pages|Thought for .*|复制|已复制|点赞|点踩|更多|分享|编辑|搜索)$/i;
      const cleanCopied = (value, role) => {
        let text = normalize(value).replace(/\r\n?/g, "\n").replace(/Show more\s*Show less/gi, "");
        const lines = text.split("\n").map((line) => line.trim()).filter((line) => line && !uiLine.test(line));
        text = normalize(lines.join("\n"));
        if (site === "deepseek" && role === "user") {
          const title = normalize((document.title || "").replace(/\s*[-–—|].*$/, ""));
          if (title && text.startsWith(title)) text = normalize(text.slice(title.length));
          text = normalize(text.replace(/^\s*(?:DeepSeek|DSeek|Instant)\b\s*/i, ""));
        }
        return text;
      };
      const useful = (value, role) => {
        const text = cleanCopied(value, role);
        if (isCopyProbe(value) || isCopyProbe(text)) return "";
        if (!text || text.length < 2 || text.length > 5e4) return "";
        if (/^(?:copy|copied|复制|已复制|share|link)$/i.test(text)) return "";
        if (/^(?:https?:\/\/|mailto:|#)\S{1,240}$/i.test(text)) return "";
        if (/Simple Chat Hub|Summary Panel|pages checked,|No userscript messages found/i.test(text)) return "";
        if (!/[A-Za-z0-9\u4e00-\u9fff]/.test(text)) return "";
        return text;
      };
      const compact = (value) => normalize(value).toLowerCase().replace(/\[[^\]]+\]\([^)]*\)/g, "$1").replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
      const roughMatch = (copied, expected) => {
        const a = compact(copied);
        const b = compact(expected);
        if (!a || !b) return false;
        if (a.includes(b) || b.includes(a)) return true;
        const size = Math.min(90, b.length);
        const parts = [b.slice(0, size), b.slice(Math.max(0, Math.floor(b.length / 2) - Math.floor(size / 2)), Math.floor(b.length / 2) + Math.floor(size / 2)), b.slice(-size)].filter((part) => part.length >= 12);
        return parts.filter((part) => a.includes(part)).length >= (b.length > 180 ? 2 : 1);
      };
      const addUnique = (list, item) => {
        if (item && item.nodeType === 1 && !list.includes(item)) list.push(item);
      };
      const buttonSelector = "button,[role=button],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],div[tabindex],span[role=button]";
      const hasVisibleAction = (node) => qsa(buttonSelector, node).some(visible);
      const deepSeekActionScope = (node) => {
        if (!node || site !== "deepseek") return node;
        const direct = closest(node, ".ds-message,[class*=ds-message],[data-message-author-role],article,[data-testid*=message],[class*=message],[class*=Message]") || node;
        for (let current = direct, depth = 0; current && current !== root && current !== document.body && depth < 8; current = current.parentElement, depth += 1) {
          if (closest(current, "nav,header,footer,aside,form,input,textarea,select,[contenteditable=true]")) continue;
          if (looksMessageText(textOf(current)) && hasVisibleAction(current)) return current;
        }
        return direct;
      };
      const actionScopes = (anchor) => {
        const scopes = [];
        const add = (node) => {
          if (!node || node.nodeType !== 1 || node === document.documentElement || node === document.body) return;
          if (closest(node, "nav,header,footer,aside,form,input,textarea,select,[contenteditable=true]")) return;
          addUnique(scopes, node);
        };
        const base = anchor && (closest(anchor, "[data-message-author-role],article,[data-testid*=message],[data-testid*=conversation],[class*=message],[class*=Message],[class*=response],[class*=Response],.ds-message") || anchor);
        for (let node = base || anchor, depth = 0; node && depth < 9; node = node.parentElement, depth += 1) {
          add(node);
          add(node.previousElementSibling);
          add(node.nextElementSibling);
          const parent = node.parentElement;
          add(parent);
          if (parent) {
            add(parent.previousElementSibling);
            add(parent.nextElementSibling);
          }
        }
        add(anchor);
        return scopes;
      };
      const candidateButtons = (anchor, role = "") => {
        const anchorRect = rectOf(anchor);
        const items = [];
        const seen2 = /* @__PURE__ */ new Set();
        const add = (button, baseScore) => {
          if (!button || seen2.has(button) || badButton(button, role)) return;
          if (!button.matches || !button.matches(buttonSelector)) return;
          const rect = rectOf(button);
          if (!rect && role !== "user") return;
          const copyish = explicitCopy(button) || looksCopyIcon(button);
          const allowSmallIcon = site === "deepseek" ? !!rect : role !== "user";
          const smallIcon = allowSmallIcon && isSmallIconButton(button);
          if (!copyish && !smallIcon) return;
          let score = baseScore + (copyish ? 0 : 45e3);
          if (!rect) score += 25e3;
          if (anchorRect && rect) {
            const far = rect.bottom < anchorRect.top - 260 || rect.top > anchorRect.bottom + 520 || rect.right < anchorRect.left - 220 || rect.left > anchorRect.right + 260;
            if (far) return;
            const vertical = Math.min(Math.abs(rect.top - anchorRect.bottom), Math.abs(rect.bottom - anchorRect.top), Math.abs(rect.top - anchorRect.top));
            score += vertical * 18 + Math.abs(rect.left - anchorRect.left);
            if (rect.top >= anchorRect.top - 24 && rect.top <= anchorRect.bottom + 180) score -= 1200;
          }
          if (explicitCopy(button)) score -= 1e4;
          if (looksCopyIcon(button)) score -= 5e3;
          seen2.add(button);
          items.push({ button, score });
        };
        let index = 0;
        for (const scope of actionScopes(anchor)) {
          if (scope.matches && scope.matches(buttonSelector)) add(scope, index++);
          for (const button of qsa(buttonSelector, scope)) add(button, index++);
        }
        if (anchorRect) {
          for (const button of qsa(buttonSelector, document)) add(button, 9e4 + index++);
        }
        return items.sort((a, b) => a.score - b.score || order(a.button, b.button)).map((item) => item.button);
      };
      const escapeMenus = async () => {
        try {
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
        } catch (error) {
        }
        await api.sleep(40);
      };
      const hoverElement = (node) => {
        if (!node || node.nodeType !== 1) return;
        let rect = rectOf(node);
        const x = rect ? Math.max(rect.left + 4, Math.min(rect.right - 4, rect.left + rect.width / 2)) : 0;
        const y = rect ? Math.max(rect.top + 4, Math.min(rect.bottom - 4, rect.top + rect.height / 2)) : 0;
        const mouse = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
        try {
          if (window.PointerEvent) {
            const pointer = { ...mouse, pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 0 };
            node.dispatchEvent(new PointerEvent("pointerover", pointer));
            node.dispatchEvent(new PointerEvent("pointerenter", pointer));
            node.dispatchEvent(new PointerEvent("pointermove", pointer));
          }
          node.dispatchEvent(new MouseEvent("mouseenter", mouse));
          node.dispatchEvent(new MouseEvent("mouseover", mouse));
          node.dispatchEvent(new MouseEvent("mousemove", mouse));
        } catch (error) {
        }
      };
      const hoverTurn = async (anchor) => {
        try {
          api.reveal(anchor);
        } catch (error) {
        }
        const scopes = actionScopes(anchor).slice(0, 10);
        for (const scope of [anchor, ...scopes]) hoverElement(scope);
        await api.sleep(180);
        for (const scope of [anchor, ...scopes.slice(0, 5)]) hoverElement(scope);
        await api.sleep(120);
      };
      const copyTurn = async (turn) => {
        const anchor = turn.actionNode || turn.node;
        try {
          api.reveal(turn.node);
          api.reveal(anchor);
        } catch (error) {
        }
        if (site === "deepseek") await api.sleep(80);
        else await hoverTurn(anchor);
        const buttonLimit = site === "deepseek" ? turn.role === "user" ? 6 : 8 : turn.role === "user" ? 12 : 10;
        let buttons = candidateButtons(anchor, turn.role).slice(0, buttonLimit);
        if (turn.role === "user" && !buttons.length && site !== "deepseek") {
          await hoverTurn(anchor);
          buttons = candidateButtons(anchor, turn.role).slice(0, 12);
        }
        const maxAttempts = site === "deepseek" ? 1 : turn.role === "user" ? 1 : 2;
        const perRoleCopyOptions = site === "deepseek" ? { ...copyOptions, copyTimeoutMs: turn.role === "user" ? 1e3 : 1800, copyCaptureGraceMs: 220 } : turn.role === "user" ? { ...copyOptions, copyTimeoutMs: 1200, copyCaptureGraceMs: 180 } : { ...copyOptions, copyTimeoutMs: 3200, copyCaptureGraceMs: 260 };
        for (const button of buttons) {
          for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            if (attempt) await api.sleep(120);
            try {
              api.reveal(turn.node);
              api.reveal(anchor);
              if (site !== "deepseek") {
                hoverElement(anchor);
                hoverElement(button);
              }
              api.reveal(button);
            } catch (error) {
            }
            const raw = await api.copy(button, perRoleCopyOptions);
            const text = useful(raw, turn.role);
            if (text) {
              const matchesExpected = turn.expected && roughMatch(text, turn.expected);
              if (turn.role === "user") {
                if (matchesExpected && text.length >= 2 && text.length <= 12e3) return text;
              } else {
                if (matchesExpected) return text;
                if (text.length >= 12) return text;
              }
            }
            await escapeMenus();
          }
        }
        return "";
      };
      const looksMessageText = (value) => {
        const text = normalize(value);
        if (!text || text.length < 2 || text.length > 45e3) return false;
        if (/^(?:Copy|Copied|Share|Like|Dislike|Search|DeepThink|Ask anything|Upgrade to SuperGrok|Cookie Settings)$/i.test(text)) return false;
        if (/Summary Panel|Simple Chat Hub|pages checked/i.test(text)) return false;
        return /[A-Za-z0-9\u4e00-\u9fff]/.test(text);
      };
      const pushTurn = (turns2, role, node, expected = "", actionNode = node) => {
        if (role !== "user" && role !== "assistant" || !node) return;
        const text = normalize(expected || textOf(node));
        if (!looksMessageText(text)) return;
        if (turns2.some((item) => item.role === role && item.node === node)) return;
        turns2.push({ role, node, actionNode: actionNode || node, expected: text });
      };
      const previousTextBlock = (anchor, marker) => {
        const markerRect = rectOf(marker || anchor);
        const candidates = [];
        for (const node of qsa("article,section,div,[role]", root)) {
          if (!visible(node) || node === anchor || node.contains(anchor) || closest(node, "nav,header,footer,aside,form,input,textarea,select,[contenteditable=true]")) continue;
          if (order(node, marker || anchor) >= 0) continue;
          const text = textOf(node);
          if (!looksMessageText(text) || /Thought for|Upgrade to SuperGrok|Ask anything/i.test(text)) continue;
          const rect = rectOf(node);
          if (markerRect && rect && rect.bottom > markerRect.top + 80) continue;
          const tooBroad = qsa("article,section,div,[role]", node).some((child) => child !== node && looksMessageText(textOf(child)) && textOf(child).length >= Math.min(text.length * 0.65, text.length - 8));
          if (tooBroad && text.length > 300) continue;
          candidates.push({ node, rect, text });
        }
        candidates.sort((a, b) => {
          const ar = a.rect, br = b.rect;
          if (ar && br && Math.abs(ar.bottom - br.bottom) > 4) return br.bottom - ar.bottom;
          return order(a.node, b.node);
        });
        return candidates[0] || null;
      };
      const findDeepSeekTurns = () => {
        const turns2 = [];
        const assistants = qsa(".ds-assistant-message-main-content", root).filter(visible).sort(order);
        for (const assistant of assistants) {
          const assistantScope = closest(assistant, ".ds-message") || assistant;
          const container = assistantScope && assistantScope.parentElement || assistantScope;
          let userNode = null;
          for (let prev = container && container.previousElementSibling, count = 0; prev && count < 7; prev = prev.previousElementSibling, count += 1) {
            if (looksMessageText(textOf(prev))) {
              userNode = prev;
              break;
            }
          }
          if (!userNode) {
            const found = previousTextBlock(assistantScope, assistantScope);
            userNode = found && found.node;
          }
          if (userNode) pushTurn(turns2, "user", userNode, "", deepSeekActionScope(userNode));
          pushTurn(turns2, "assistant", assistantScope, textOf(assistant), deepSeekActionScope(assistantScope));
        }
        return turns2;
      };
      const findGrokTurns = () => {
        const turns2 = [];
        const thoughtNodes = qsa("button,div,span,[role=button]", root).filter((node) => visible(node) && /^\s*Thought for\b/i.test(normalize(node.innerText || node.textContent || ""))).sort(order);
        const markers = thoughtNodes.length ? thoughtNodes : qsa("article,section,div,[role]", root).filter((node) => visible(node) && /\bThought for\b/i.test(textOf(node))).sort(order).slice(0, 3);
        for (const marker of markers.slice(0, 3)) {
          let assistantNode = marker;
          for (let node = marker; node && node !== root && node !== document.body; node = node.parentElement) {
            const text = textOf(node);
            if (text.length > 120 && /\bThought for\b/i.test(text) && !/Ask anything|Upgrade to SuperGrok|Home page|Notifications/i.test(text)) {
              assistantNode = node;
              break;
            }
          }
          let userNode = null;
          for (let prev = assistantNode && assistantNode.previousElementSibling, count = 0; prev && count < 6; prev = prev.previousElementSibling, count += 1) {
            if (looksMessageText(textOf(prev)) && !/Thought for|Upgrade to SuperGrok|Ask anything/i.test(textOf(prev))) {
              userNode = prev;
              break;
            }
          }
          if (!userNode) {
            const found = previousTextBlock(assistantNode, marker);
            userNode = found && found.node;
          }
          if (userNode) pushTurn(turns2, "user", userNode);
          pushTurn(turns2, "assistant", assistantNode);
        }
        if (!turns2.length) {
          const nodes = qsa("[data-message-author-role],article,[data-testid*=message],[data-testid*=conversation],[class*=message],[class*=Message],[class*=response],[class*=Response]", root).filter(visible).sort(order);
          for (const node of nodes) {
            const label = meta(node).toLowerCase();
            const role = /assistant|response|answer|bot|grok/.test(label) ? "assistant" : /user|human|prompt|query|question/.test(label) ? "user" : "";
            if (role) pushTurn(turns2, role, node);
          }
        }
        return turns2;
      };
      const looseCopySequence = async () => {
        const out2 = [];
        const seen2 = /* @__PURE__ */ new Set();
        const buttons = candidateButtons(root).slice(0, 28);
        let index = 0;
        for (const button of buttons) {
          const roleText = meta(button);
          const role = /(assistant|response|answer|回答|回复)/i.test(roleText) ? "assistant" : /(prompt|question|user|message|提问|用户)/i.test(roleText) ? "user" : index % 2 === 0 ? "user" : "assistant";
          const raw = await api.copy(button, copyOptions);
          const text = useful(raw, role);
          if (!text) continue;
          const key = role + "\n" + compact(text);
          if (seen2.has(key)) continue;
          seen2.add(key);
          out2.push({ role, text });
          index += 1;
          if (out2.some((item) => item.role === "user") && out2.some((item) => item.role === "assistant")) break;
        }
        return api.merge(out2);
      };
      let turns = site === "deepseek" ? findDeepSeekTurns() : findGrokTurns();
      turns = turns.filter((turn, index, list) => !list.some((other, otherIndex) => otherIndex !== index && other.role === turn.role && other.node !== turn.node && other.node.contains && other.node.contains(turn.node))).sort((a, b) => order(a.node, b.node));
      const turnSeen = /* @__PURE__ */ new Set();
      turns = turns.filter((turn) => {
        const key = turn.role + "\n" + compact(turn.expected || textOf(turn.node));
        if (!key.trim() || turnSeen.has(key)) return false;
        turnSeen.add(key);
        return true;
      });
      const out = [];
      const seen = /* @__PURE__ */ new Set();
      for (const turn of turns.slice(-8)) {
        const text = await copyTurn(turn);
        if (!text) continue;
        const key = turn.role + "\n" + compact(text);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ role: turn.role, text });
        await api.sleep(100);
      }
      const merged = api.merge(out);
      return merged.some((item) => item.role === "user") && merged.some((item) => item.role === "assistant") ? merged : [];
    };
    scripts["deepseek.js"] = scripts["deepseek"];
    scripts["grok"] = async function(api) {
      const root = api.qs('main,[role="main"]') || document.body || document.documentElement;
      const controlSelector = "button,[role=button]";
      const copyOptions = {
        resetClipboardBeforeCopy: true,
        acceptUnchangedClipboard: false,
        copyTimeoutMs: 3600,
        copyPollMs: 40,
        copyCaptureGraceMs: 320
      };
      const normalize = (value) => api.normalize(String(value || ""));
      const qsa = (selector, scope = document) => {
        try {
          return api.qsa(selector, scope || document, { all: true });
        } catch (error) {
          return [];
        }
      };
      const closest = (node, selector) => {
        try {
          return api.closest ? api.closest(node, selector) : node && node.closest && node.closest(selector);
        } catch (error) {
          return null;
        }
      };
      const rectOf = (node) => {
        try {
          const rect = node && node.getBoundingClientRect && node.getBoundingClientRect();
          return rect && rect.width > 0 && rect.height > 0 ? rect : null;
        } catch (error) {
          return null;
        }
      };
      const visible = (node) => {
        try {
          const rect = rectOf(node);
          if (!rect) return false;
          const style = getComputedStyle(node);
          return style.display !== "none" && style.visibility !== "hidden";
        } catch (error) {
          try {
            return Boolean(api.visible && api.visible(node));
          } catch {
            return false;
          }
        }
      };
      const order = (a, b) => {
        try {
          if (a === b) return 0;
          return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1;
        } catch (error) {
          return 0;
        }
      };
      const classText = (node) => {
        const value = node && node.getAttribute && node.getAttribute("class") || node && node.className;
        return typeof value === "string" ? value : value && value.baseVal || "";
      };
      const attrRefText = (node, attr) => {
        try {
          return String(node && node.getAttribute && node.getAttribute(attr) || "").split(/\s+/).map((id) => id && node.ownerDocument && node.ownerDocument.getElementById(id)).filter(Boolean).map((el) => el.innerText || el.textContent || "").join(" ");
        } catch (error) {
          return "";
        }
      };
      const meta = (node) => normalize([
        node && node.tagName,
        classText(node),
        node && node.getAttribute && node.getAttribute("role"),
        node && node.getAttribute && node.getAttribute("aria-label"),
        attrRefText(node, "aria-labelledby"),
        attrRefText(node, "aria-describedby"),
        node && node.getAttribute && node.getAttribute("aria-description"),
        node && node.getAttribute && node.getAttribute("title"),
        node && node.getAttribute && node.getAttribute("data-tooltip"),
        node && node.getAttribute && node.getAttribute("data-testid"),
        node && node.getAttribute && node.getAttribute("data-test-id"),
        node && node.textContent,
        node && node.innerText
      ].filter(Boolean).join(" "));
      const svgSignature = (node) => normalize([node, ...qsa("svg,title,desc,path,rect,line,polyline,polygon,use,img,[data-icon],[class]", node).slice(0, 80)].map((el) => [
        classText(el),
        el && el.getAttribute && el.getAttribute("data-icon"),
        el && el.getAttribute && el.getAttribute("aria-label"),
        el && el.getAttribute && el.getAttribute("title"),
        el && el.getAttribute && el.getAttribute("alt"),
        el && el.getAttribute && el.getAttribute("src"),
        el && el.getAttribute && el.getAttribute("href"),
        el && el.getAttribute && el.getAttribute("xlink:href"),
        el && el.getAttribute && el.getAttribute("viewBox"),
        el && el.getAttribute && el.getAttribute("d"),
        el && el.textContent
      ].filter(Boolean).join(" ")).join(" ")).toLowerCase();
      const actionSignature = (node) => normalize(meta(node) + " " + svgSignature(node)).toLowerCase();
      const explicitCopy = (button) => /(?:^|\b)(copy|copied|clipboard)(?:\b|$)|复制|已复制|拷贝|content[_-]?copy|copy[_-]?all|file[_-]?copy/i.test(meta(button));
      const nestedCopy = (button) => /copy\s*(?:code|table|link|conversation|source|sources|citation|citations|url)|copy[-_ ]?(?:code|table|link|conversation|source|sources|citation|citations|url)|复制(?:代码|表格|链接|会话|来源|引用)/i.test(meta(button));
      const looksCopyIcon = (button) => {
        const text = svgSignature(button);
        if (!text) return false;
        if (/copy|clipboard|content[_-]?copy|copy[_-]?all|file[_-]?copy|lucide-copy|tabler-icon-copy|heroicons.*clipboard|mingcute.*copy|carbon.*copy/.test(text)) return true;
        if (/0 0 (16|18|20|24) (16|18|20|24)/.test(text) && /(m12\.668\s*10\.667c|m12\.66810\.667c|m13\.998\s*12\.665c|m13\.99812\.665c|m6\.14929\s*4\.02032c|m6\.149294\.02032c|m9\.80164\s*0\.367975c|m9\.801640\.367975c)/.test(text)) return true;
        const rects = qsa("rect", button).filter((rect) => Number(rect.getAttribute("width") || 0) >= 7 && Number(rect.getAttribute("height") || 0) >= 7);
        return rects.length >= 2;
      };
      const editAction = (control) => /(?:^|[^a-z])(?:edit|edited|pencil|compose|modify|revise|square[-_ ]?pen|pen[-_ ]?line)(?:[^a-z]|$)|编辑|修改/.test(actionSignature(control));
      const likeAction = (control) => {
        const signature = actionSignature(control);
        if (/(?:^|[^a-z])(?:dislike|disliked|thumbs?[-_ ]?down|downvote|negative)(?:[^a-z]|$)|点踩|踩|不喜欢/.test(signature)) return false;
        return /(?:^|[^a-z])(?:like|liked|unlike|thumbs?[-_ ]?up|upvote|positive)(?:[^a-z]|$)|点赞|取消点赞|赞/.test(signature);
      };
      const canonicalControl = (control) => {
        if (!control || !visible(control)) return false;
        return !qsa(controlSelector, control).some((child) => child !== control && visible(child));
      };
      const pageChromeControl = (control) => Boolean(closest(control, "nav,aside,form,input,textarea,select,[contenteditable=true],pre,code,table,kbd,samp,[data-language],[data-code-block],[data-codeblock]"));
      const messageCopyControl = (control) => {
        if (!canonicalControl(control) || pageChromeControl(control) || nestedCopy(control)) return false;
        return explicitCopy(control) || looksCopyIcon(control);
      };
      const sameActionRow = (left, right) => {
        const a = rectOf(left);
        const b = rectOf(right);
        if (!a || !b) return false;
        const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        const minHeight = Math.max(1, Math.min(a.height, b.height));
        const centerGap = Math.abs(a.top + a.height / 2 - b.top - b.height / 2);
        return overlap >= minHeight * 0.45 || centerGap <= Math.max(12, minHeight * 0.45);
      };
      const classifiedActionContext = (bar, copy, controls) => {
        if (!bar || controls.length < 2 || controls.length > 12) return null;
        const hasEdit = controls.some((control) => control !== copy && editAction(control));
        const hasLike = controls.some((control) => control !== copy && likeAction(control));
        if (hasEdit === hasLike) return null;
        return { bar, copy, controls, role: hasEdit ? "user" : "assistant" };
      };
      const actionContext = (copy) => {
        const exactBar = closest(copy, ".action-buttons,[data-testid*=action-buttons],[data-test-id*=action-buttons]");
        if (exactBar) {
          const exact = classifiedActionContext(exactBar, copy, qsa(controlSelector, exactBar).filter(canonicalControl));
          if (exact) return exact;
        }
        for (let scope = copy && copy.parentElement, depth = 0; scope && depth < 10; scope = scope.parentElement, depth += 1) {
          const controls = qsa(controlSelector, scope).filter(canonicalControl).filter((control) => control === copy || sameActionRow(copy, control));
          const classified = classifiedActionContext(scope, copy, controls);
          if (classified) return classified;
          if (scope === root || scope === document.body || scope === document.documentElement) break;
        }
        return null;
      };
      const compact = (value) => normalize(value).toLowerCase().replace(/\[[^\]]+\]\([^)]*\)/g, "$1").replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
      const isCopyProbe = (value) => /_?sch[\s_-]*copy[\s_-]*probe[\s_-]*[a-z0-9-]+_?/i.test(String(value || "")) || /_?sch[\s_-]*copy[\s_-]*probe[\s_-]*[a-z0-9-]+_?/i.test(normalize(value));
      const uiLine = /^(?:Copy|Copied|Copy prompt|Copy message|Copy response|Create share link|Like|Dislike|Regenerate|More actions|More options|Share|Edit|Search|DeepThink|Ask anything|Upgrade to SuperGrok|New conversation - Grok|AI-generated, for reference only|This response is AI-generated, for reference only|Necessary cookies only|Accept all cookies|Cookie Settings|\d+ sources?|\d+ web pages|Thought for .*|Worked for .*|思考了.*|工作了.*|复制|已复制|点赞|点踩|更多|分享|编辑|搜索)$/i;
      const cleanCopied = (value) => {
        const lines = normalize(value).replace(/\r\n?/g, "\n").replace(/Show more\s*Show less/gi, "").split("\n").map((line) => line.trim()).filter((line) => line && !uiLine.test(line));
        return normalize(lines.join("\n"));
      };
      const useful = (value) => {
        const text = cleanCopied(value);
        if (isCopyProbe(value) || isCopyProbe(text)) return "";
        if (!text || text.length < 2 || text.length > 5e4) return "";
        if (/^(?:copy|copied|复制|已复制|share|link)$/i.test(text)) return "";
        if (/^(?:https?:\/\/|mailto:|#)\S{1,240}$/i.test(text)) return "";
        if (/Simple Chat Hub|Summary Panel|pages checked,|No userscript messages found/i.test(text)) return "";
        return /[A-Za-z0-9\u4e00-\u9fff]/.test(text) ? text : "";
      };
      const stripUserPromptPrefix = (value, expected) => {
        const text = cleanCopied(value);
        const prompt = cleanCopied(expected);
        const promptKey = compact(prompt);
        if (!text || !promptKey) return text;
        if (compact(text) === promptKey) return "";
        if (text.toLowerCase().startsWith(prompt.toLowerCase())) {
          const stripped = cleanCopied(text.slice(prompt.length));
          if (stripped && compact(stripped) !== promptKey) return stripped;
        }
        const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
        let consumed = "";
        let index = 0;
        while (index < Math.min(lines.length, 4)) {
          consumed = cleanCopied([consumed, lines[index]].filter(Boolean).join("\n"));
          const consumedKey = compact(consumed);
          if (consumedKey && (consumedKey === promptKey || promptKey.includes(consumedKey) || consumedKey.includes(promptKey))) {
            index += 1;
            if (consumedKey === promptKey || consumedKey.includes(promptKey)) break;
            continue;
          }
          break;
        }
        if (index > 0) {
          const stripped = cleanCopied(lines.slice(index).join("\n"));
          if (stripped && compact(stripped) !== promptKey) return stripped;
          if (!stripped) return "";
        }
        return text;
      };
      const escapeMenus = async () => {
        try {
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
        } catch (error) {
        }
        await api.sleep(40);
      };
      const hoverElement = (node) => {
        if (!node || node.nodeType !== 1) return;
        const rect = rectOf(node);
        const x = rect ? Math.max(rect.left + 4, Math.min(rect.right - 4, rect.left + rect.width / 2)) : 0;
        const y = rect ? Math.max(rect.top + 4, Math.min(rect.bottom - 4, rect.top + rect.height / 2)) : 0;
        const mouse = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
        try {
          if (window.PointerEvent) {
            const pointer = { ...mouse, pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 0 };
            node.dispatchEvent(new PointerEvent("pointerover", pointer));
            node.dispatchEvent(new PointerEvent("pointerenter", pointer));
            node.dispatchEvent(new PointerEvent("pointermove", pointer));
          }
          node.dispatchEvent(new MouseEvent("mouseenter", mouse));
          node.dispatchEvent(new MouseEvent("mouseover", mouse));
          node.dispatchEvent(new MouseEvent("mousemove", mouse));
        } catch (error) {
        }
      };
      const revealForCopy = async (action) => {
        try {
          api.reveal(action.bar);
        } catch (error) {
        }
        for (let node = action.copy; node && node !== root && node !== document.body; node = node.parentElement) hoverElement(node);
        hoverElement(action.copy);
        await api.sleep(140);
        try {
          api.reveal(action.copy);
        } catch (error) {
        }
        hoverElement(action.copy);
      };
      const messageActions = () => {
        const actions = [];
        const seenBars = /* @__PURE__ */ new Set();
        for (const copy of qsa(controlSelector, root).filter(messageCopyControl).sort(order)) {
          const action = actionContext(copy);
          if (!action || seenBars.has(action.bar)) continue;
          seenBars.add(action.bar);
          actions.push(action);
        }
        return actions.sort((a, b) => order(a.copy, b.copy));
      };
      const copyActionText = async (action, lastUser2 = "") => {
        const attempts = action.role === "assistant" ? 2 : 1;
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          if (attempt) await api.sleep(140);
          await revealForCopy(action);
          const raw = await api.copy(action.copy, action.role === "assistant" ? copyOptions : { ...copyOptions, copyTimeoutMs: 2200, copyCaptureGraceMs: 220 });
          let text = useful(raw);
          if (action.role === "assistant") {
            text = stripUserPromptPrefix(text, lastUser2);
            if (lastUser2 && compact(text) === compact(lastUser2)) text = "";
          }
          if (text && (action.role === "user" ? text.length <= 12e3 : text.length >= 2)) return text;
          await escapeMenus();
        }
        return "";
      };
      const out = [];
      let lastUser = "";
      for (const action of messageActions().slice(-24)) {
        const text = await copyActionText(action, action.role === "assistant" ? lastUser : "");
        if (!text) continue;
        out.push({ role: action.role, text });
        if (action.role === "user") lastUser = text;
        if (out.length >= 12) break;
        await api.sleep(80);
      }
      const merged = api.merge(out);
      return merged.some((item) => item.role === "user") && merged.some((item) => item.role === "assistant") ? merged : [];
    };
    scripts["grok.js"] = scripts["grok"];
    scripts["grok-dairoot"] = async function(api) {
      const root = api.qs('main,[role="main"]') || document.body || document.documentElement;
      const controlSelector = "button,[role=button]";
      const copyOptions = {
        resetClipboardBeforeCopy: true,
        acceptUnchangedClipboard: false,
        copyTimeoutMs: 3600,
        copyPollMs: 40,
        copyCaptureGraceMs: 320
      };
      const normalize = (value) => api.normalize(String(value || ""));
      const qsa = (selector, scope = document) => {
        try {
          return api.qsa(selector, scope || document, { all: true });
        } catch (error) {
          return [];
        }
      };
      const closest = (node, selector) => {
        try {
          return api.closest ? api.closest(node, selector) : node && node.closest && node.closest(selector);
        } catch (error) {
          return null;
        }
      };
      const rectOf = (node) => {
        try {
          const rect = node && node.getBoundingClientRect && node.getBoundingClientRect();
          return rect && rect.width > 0 && rect.height > 0 ? rect : null;
        } catch (error) {
          return null;
        }
      };
      const visible = (node) => {
        try {
          const rect = rectOf(node);
          if (!rect) return false;
          const style = getComputedStyle(node);
          return style.display !== "none" && style.visibility !== "hidden";
        } catch (error) {
          try {
            return Boolean(api.visible && api.visible(node));
          } catch {
            return false;
          }
        }
      };
      const order = (a, b) => {
        try {
          if (a === b) return 0;
          return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1;
        } catch (error) {
          return 0;
        }
      };
      const classText = (node) => {
        const value = node && node.getAttribute && node.getAttribute("class") || node && node.className;
        return typeof value === "string" ? value : value && value.baseVal || "";
      };
      const attrRefText = (node, attr) => {
        try {
          return String(node && node.getAttribute && node.getAttribute(attr) || "").split(/\s+/).map((id) => id && node.ownerDocument && node.ownerDocument.getElementById(id)).filter(Boolean).map((el) => el.innerText || el.textContent || "").join(" ");
        } catch (error) {
          return "";
        }
      };
      const meta = (node) => normalize([
        node && node.tagName,
        classText(node),
        node && node.getAttribute && node.getAttribute("role"),
        node && node.getAttribute && node.getAttribute("aria-label"),
        attrRefText(node, "aria-labelledby"),
        attrRefText(node, "aria-describedby"),
        node && node.getAttribute && node.getAttribute("aria-description"),
        node && node.getAttribute && node.getAttribute("title"),
        node && node.getAttribute && node.getAttribute("data-tooltip"),
        node && node.getAttribute && node.getAttribute("data-testid"),
        node && node.getAttribute && node.getAttribute("data-test-id"),
        node && node.textContent,
        node && node.innerText
      ].filter(Boolean).join(" "));
      const svgSignature = (node) => normalize([node, ...qsa("svg,title,desc,path,rect,line,polyline,polygon,use,img,[data-icon],[class]", node).slice(0, 80)].map((el) => [
        classText(el),
        el && el.getAttribute && el.getAttribute("data-icon"),
        el && el.getAttribute && el.getAttribute("aria-label"),
        el && el.getAttribute && el.getAttribute("title"),
        el && el.getAttribute && el.getAttribute("alt"),
        el && el.getAttribute && el.getAttribute("src"),
        el && el.getAttribute && el.getAttribute("href"),
        el && el.getAttribute && el.getAttribute("xlink:href"),
        el && el.getAttribute && el.getAttribute("viewBox"),
        el && el.getAttribute && el.getAttribute("d"),
        el && el.textContent
      ].filter(Boolean).join(" ")).join(" ")).toLowerCase();
      const actionSignature = (node) => normalize(meta(node) + " " + svgSignature(node)).toLowerCase();
      const explicitCopy = (button) => /(?:^|\b)(copy|copied|clipboard)(?:\b|$)|复制|已复制|拷贝|content[_-]?copy|copy[_-]?all|file[_-]?copy/i.test(meta(button));
      const nestedCopy = (button) => /copy\s*(?:code|table|link|conversation|source|sources|citation|citations|url)|copy[-_ ]?(?:code|table|link|conversation|source|sources|citation|citations|url)|复制(?:代码|表格|链接|会话|来源|引用)/i.test(meta(button));
      const looksCopyIcon = (button) => {
        const text = svgSignature(button);
        if (!text) return false;
        if (/copy|clipboard|content[_-]?copy|copy[_-]?all|file[_-]?copy|lucide-copy|tabler-icon-copy|heroicons.*clipboard|mingcute.*copy|carbon.*copy/.test(text)) return true;
        if (/0 0 (16|18|20|24) (16|18|20|24)/.test(text) && /(m12\.668\s*10\.667c|m12\.66810\.667c|m13\.998\s*12\.665c|m13\.99812\.665c|m6\.14929\s*4\.02032c|m6\.149294\.02032c|m9\.80164\s*0\.367975c|m9\.801640\.367975c)/.test(text)) return true;
        const rects = qsa("rect", button).filter((rect) => Number(rect.getAttribute("width") || 0) >= 7 && Number(rect.getAttribute("height") || 0) >= 7);
        return rects.length >= 2;
      };
      const editAction = (control) => /(?:^|[^a-z])(?:edit|edited|pencil|compose|modify|revise|square[-_ ]?pen|pen[-_ ]?line)(?:[^a-z]|$)|编辑|修改/.test(actionSignature(control));
      const likeAction = (control) => {
        const signature = actionSignature(control);
        if (/(?:^|[^a-z])(?:dislike|disliked|thumbs?[-_ ]?down|downvote|negative)(?:[^a-z]|$)|点踩|踩|不喜欢/.test(signature)) return false;
        return /(?:^|[^a-z])(?:like|liked|unlike|thumbs?[-_ ]?up|upvote|positive)(?:[^a-z]|$)|点赞|取消点赞|赞/.test(signature);
      };
      const canonicalControl = (control) => {
        if (!control || !visible(control)) return false;
        return !qsa(controlSelector, control).some((child) => child !== control && visible(child));
      };
      const pageChromeControl = (control) => Boolean(closest(control, "nav,aside,form,input,textarea,select,[contenteditable=true],pre,code,table,kbd,samp,[data-language],[data-code-block],[data-codeblock]"));
      const messageCopyControl = (control) => {
        if (!canonicalControl(control) || pageChromeControl(control) || nestedCopy(control)) return false;
        return explicitCopy(control) || looksCopyIcon(control);
      };
      const sameActionRow = (left, right) => {
        const a = rectOf(left);
        const b = rectOf(right);
        if (!a || !b) return false;
        const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        const minHeight = Math.max(1, Math.min(a.height, b.height));
        const centerGap = Math.abs(a.top + a.height / 2 - b.top - b.height / 2);
        return overlap >= minHeight * 0.45 || centerGap <= Math.max(12, minHeight * 0.45);
      };
      const classifiedActionContext = (bar, copy, controls) => {
        if (!bar || controls.length < 2 || controls.length > 12) return null;
        const hasEdit = controls.some((control) => control !== copy && editAction(control));
        const hasLike = controls.some((control) => control !== copy && likeAction(control));
        if (hasEdit === hasLike) return null;
        return { bar, copy, controls, role: hasEdit ? "user" : "assistant" };
      };
      const actionContext = (copy) => {
        const exactBar = closest(copy, ".action-buttons,[data-testid*=action-buttons],[data-test-id*=action-buttons]");
        if (exactBar) {
          const exact = classifiedActionContext(exactBar, copy, qsa(controlSelector, exactBar).filter(canonicalControl));
          if (exact) return exact;
        }
        for (let scope = copy && copy.parentElement, depth = 0; scope && depth < 10; scope = scope.parentElement, depth += 1) {
          const controls = qsa(controlSelector, scope).filter(canonicalControl).filter((control) => control === copy || sameActionRow(copy, control));
          const classified = classifiedActionContext(scope, copy, controls);
          if (classified) return classified;
          if (scope === root || scope === document.body || scope === document.documentElement) break;
        }
        return null;
      };
      const compact = (value) => normalize(value).toLowerCase().replace(/\[[^\]]+\]\([^)]*\)/g, "$1").replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
      const isCopyProbe = (value) => /_?sch[\s_-]*copy[\s_-]*probe[\s_-]*[a-z0-9-]+_?/i.test(String(value || "")) || /_?sch[\s_-]*copy[\s_-]*probe[\s_-]*[a-z0-9-]+_?/i.test(normalize(value));
      const uiLine = /^(?:Copy|Copied|Copy prompt|Copy message|Copy response|Create share link|Like|Dislike|Regenerate|More actions|More options|Share|Edit|Search|DeepThink|Ask anything|Upgrade to SuperGrok|New conversation - Grok|AI-generated, for reference only|This response is AI-generated, for reference only|Necessary cookies only|Accept all cookies|Cookie Settings|\d+ sources?|\d+ web pages|Thought for .*|Worked for .*|思考了.*|工作了.*|复制|已复制|点赞|点踩|更多|分享|编辑|搜索)$/i;
      const cleanCopied = (value) => {
        const lines = normalize(value).replace(/\r\n?/g, "\n").replace(/Show more\s*Show less/gi, "").split("\n").map((line) => line.trim()).filter((line) => line && !uiLine.test(line));
        return normalize(lines.join("\n"));
      };
      const useful = (value) => {
        const text = cleanCopied(value);
        if (isCopyProbe(value) || isCopyProbe(text)) return "";
        if (!text || text.length < 2 || text.length > 5e4) return "";
        if (/^(?:copy|copied|复制|已复制|share|link)$/i.test(text)) return "";
        if (/^(?:https?:\/\/|mailto:|#)\S{1,240}$/i.test(text)) return "";
        if (/Simple Chat Hub|Summary Panel|pages checked,|No userscript messages found/i.test(text)) return "";
        return /[A-Za-z0-9\u4e00-\u9fff]/.test(text) ? text : "";
      };
      const stripUserPromptPrefix = (value, expected) => {
        const text = cleanCopied(value);
        const prompt = cleanCopied(expected);
        const promptKey = compact(prompt);
        if (!text || !promptKey) return text;
        if (compact(text) === promptKey) return "";
        if (text.toLowerCase().startsWith(prompt.toLowerCase())) {
          const stripped = cleanCopied(text.slice(prompt.length));
          if (stripped && compact(stripped) !== promptKey) return stripped;
        }
        const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
        let consumed = "";
        let index = 0;
        while (index < Math.min(lines.length, 4)) {
          consumed = cleanCopied([consumed, lines[index]].filter(Boolean).join("\n"));
          const consumedKey = compact(consumed);
          if (consumedKey && (consumedKey === promptKey || promptKey.includes(consumedKey) || consumedKey.includes(promptKey))) {
            index += 1;
            if (consumedKey === promptKey || consumedKey.includes(promptKey)) break;
            continue;
          }
          break;
        }
        if (index > 0) {
          const stripped = cleanCopied(lines.slice(index).join("\n"));
          if (stripped && compact(stripped) !== promptKey) return stripped;
          if (!stripped) return "";
        }
        return text;
      };
      const escapeMenus = async () => {
        try {
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
        } catch (error) {
        }
        await api.sleep(40);
      };
      const hoverElement = (node) => {
        if (!node || node.nodeType !== 1) return;
        const rect = rectOf(node);
        const x = rect ? Math.max(rect.left + 4, Math.min(rect.right - 4, rect.left + rect.width / 2)) : 0;
        const y = rect ? Math.max(rect.top + 4, Math.min(rect.bottom - 4, rect.top + rect.height / 2)) : 0;
        const mouse = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
        try {
          if (window.PointerEvent) {
            const pointer = { ...mouse, pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 0 };
            node.dispatchEvent(new PointerEvent("pointerover", pointer));
            node.dispatchEvent(new PointerEvent("pointerenter", pointer));
            node.dispatchEvent(new PointerEvent("pointermove", pointer));
          }
          node.dispatchEvent(new MouseEvent("mouseenter", mouse));
          node.dispatchEvent(new MouseEvent("mouseover", mouse));
          node.dispatchEvent(new MouseEvent("mousemove", mouse));
        } catch (error) {
        }
      };
      const revealForCopy = async (action) => {
        try {
          api.reveal(action.bar);
        } catch (error) {
        }
        for (let node = action.copy; node && node !== root && node !== document.body; node = node.parentElement) hoverElement(node);
        hoverElement(action.copy);
        await api.sleep(140);
        try {
          api.reveal(action.copy);
        } catch (error) {
        }
        hoverElement(action.copy);
      };
      const messageActions = () => {
        const actions = [];
        const seenBars = /* @__PURE__ */ new Set();
        for (const copy of qsa(controlSelector, root).filter(messageCopyControl).sort(order)) {
          const action = actionContext(copy);
          if (!action || seenBars.has(action.bar)) continue;
          seenBars.add(action.bar);
          actions.push(action);
        }
        return actions.sort((a, b) => order(a.copy, b.copy));
      };
      const copyActionText = async (action, lastUser2 = "") => {
        const attempts = action.role === "assistant" ? 2 : 1;
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          if (attempt) await api.sleep(140);
          await revealForCopy(action);
          const raw = await api.copy(action.copy, action.role === "assistant" ? copyOptions : { ...copyOptions, copyTimeoutMs: 2200, copyCaptureGraceMs: 220 });
          let text = useful(raw);
          if (action.role === "assistant") {
            text = stripUserPromptPrefix(text, lastUser2);
            if (lastUser2 && compact(text) === compact(lastUser2)) text = "";
          }
          if (text && (action.role === "user" ? text.length <= 12e3 : text.length >= 2)) return text;
          await escapeMenus();
        }
        return "";
      };
      const out = [];
      let lastUser = "";
      for (const action of messageActions().slice(-24)) {
        const text = await copyActionText(action, action.role === "assistant" ? lastUser : "");
        if (!text) continue;
        out.push({ role: action.role, text });
        if (action.role === "user") lastUser = text;
        if (out.length >= 12) break;
        await api.sleep(80);
      }
      const merged = api.merge(out);
      return merged.some((item) => item.role === "user") && merged.some((item) => item.role === "assistant") ? merged : [];
    };
    scripts["grok-dairoot.js"] = scripts["grok-dairoot"];
    scripts["kagi"] = async function(api) {
      const normalize = (value) => api.normalize(String(value || ""));
      const root = api.qs('main,[role="main"]') || document.body || document.documentElement;
      const qsa = (selector, scope = document) => {
        try {
          return api.qsa(selector, scope || document, { all: true });
        } catch (error) {
          return [];
        }
      };
      const visible = (node) => {
        try {
          if (api.visible && !api.visible(node)) return false;
          const rect = node && node.getBoundingClientRect && node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return !!(rect && rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden");
        } catch (error) {
          return false;
        }
      };
      const order = (a, b) => {
        try {
          if (a === b) return 0;
          return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1;
        } catch (error) {
          return 0;
        }
      };
      const meta = (node) => normalize([
        node && node.tagName,
        node && node.getAttribute && node.getAttribute("aria-label"),
        node && node.getAttribute && node.getAttribute("title"),
        node && node.getAttribute && node.getAttribute("data-testid"),
        node && node.getAttribute && node.getAttribute("data-test-id"),
        node && node.textContent,
        node && node.innerText
      ].filter(Boolean).join(" "));
      const messageCopyButton = (button) => /\bcopy\s+message\b|复制(?:消息|讯息)|拷贝(?:消息|讯息)/i.test(meta(button));
      const referenceCopyButton = (button) => /\bcopy\s+(?:references?|sources?|citations?)\b|引用|来源|参考|citation|source/i.test(meta(button));
      const internalTool = (button) => {
        try {
          return !!api.closest(button, "nav,aside,header,footer,form,input,textarea,select,[contenteditable=true],pre,code,table,kbd,samp,[data-language]");
        } catch (error) {
          return false;
        }
      };
      const referenceOnly = (value) => {
        const text = normalize(value);
        if (/^\s*(?:References|Sources|Citations|引用|来源|参考)\b/i.test(text)) return true;
        if (/^\s*\(?\d+\s+total\)?\s*$/i.test(text)) return true;
        if (/^\s*(?:https?:\/\/|[\w.-]+\.[a-z]{2,})(?:\s+\d+%)?\s*$/i.test(text)) return true;
        return false;
      };
      const useful = (value) => {
        const text = normalize(value);
        if (!text || text.length < 2 || text.length > 5e4) return "";
        if (/^(?:copy|copied|copy message|复制|已复制|拷贝)$/i.test(text)) return "";
        if (referenceOnly(text)) return "";
        return text;
      };
      const buttons = qsa("button,[role=button]", root).filter((button) => visible(button) && !internalTool(button) && messageCopyButton(button) && !referenceCopyButton(button)).sort(order);
      const out = [];
      const seen = /* @__PURE__ */ new Set();
      for (const button of buttons.slice(0, 24)) {
        const role = out.length % 2 === 0 ? "user" : "assistant";
        const text = useful(await api.copy(button, {
          resetClipboardBeforeCopy: true,
          acceptUnchangedClipboard: false,
          copyTimeoutMs: 3600,
          copyPollMs: 50,
          copyCaptureGraceMs: 320
        }));
        if (!text) continue;
        const key = role + "\n" + text.toLowerCase().replace(/\s+/g, "");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ role, text });
        await api.sleep(80);
      }
      const merged = api.merge(out);
      return merged.some((item) => item.role === "user") && merged.some((item) => item.role === "assistant") ? merged : [];
    };
    scripts["kagi.js"] = scripts["kagi"];
    scripts["notion"] = async function(api) {
      const normalize = (value) => api.normalize(String(value || ""));
      const qsa = (selector, root2 = document) => {
        try {
          return api.qsa(selector, root2, { all: true });
        } catch (error) {
          return [];
        }
      };
      const closest = (element, selector) => {
        try {
          return api.closest(element, selector);
        } catch (error) {
          return null;
        }
      };
      const layoutVisible = (element) => {
        if (!element) return false;
        try {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 4 && rect.height > 4 && style.display !== "none" && style.visibility !== "hidden";
        } catch (error) {
          return false;
        }
      };
      const meta = (element) => normalize([
        element && element.tagName,
        element && element.getAttribute && element.getAttribute("aria-label"),
        element && element.getAttribute && element.getAttribute("title"),
        element && element.getAttribute && element.getAttribute("data-testid"),
        element && element.getAttribute && element.getAttribute("data-test-id"),
        element && typeof element.className === "string" ? element.className : "",
        element && element.textContent
      ].filter(Boolean).join(" "));
      const order = (a, b) => {
        try {
          if (a === b) return 0;
          const pos = a.compareDocumentPosition(b);
          return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : pos & Node.DOCUMENT_POSITION_PRECEDING ? 1 : 0;
        } catch (error) {
          return 0;
        }
      };
      const roots = qsa("#notion-app,main,[role=main]", document).filter(layoutVisible);
      const root = roots.find((element) => !closest(element, "nav,aside,header,footer")) || roots[0] || document;
      const roleOfButton = (button) => {
        const label = meta(button);
        if (/\bcopy\s+(?:response|answer)\b|复制(?:回复|回答|响应)/i.test(label)) return "assistant";
        if (/\bcopy\s+(?:text|message|prompt)\b|复制(?:文本|消息|提示词|问题)/i.test(label)) return "user";
        return "";
      };
      const isCopyTurnButton = (button) => layoutVisible(button) && roleOfButton(button) && !closest(button, "nav,aside,header,footer,form,input,textarea,select,[contenteditable=true],pre,code,table,kbd,samp,[data-language]");
      const useful = (value) => {
        const text = normalize(value).replace(/^(?:Copied to clipboard|Response copied to clipboard|Right click and copy the link above)\.?$/i, "").trim();
        if (!text || /^(?:copy|copied|copy text|copy response|复制|已复制)$/i.test(text)) return "";
        if (/^(?:https?:\/\/|mailto:|#)\S{1,240}$/i.test(text)) return "";
        return text;
      };
      const structured = (messages) => Array.isArray(messages) && messages.some((item) => item.role === "user") && messages.some((item) => item.role === "assistant");
      const cleanLine = (value) => normalize(value).replace(/^[-•]\s*/, "").replace(/\s+/g, " ").trim();
      const isChromeLine = (line) => /^(?:Notion AI|\/|history|Delete, rename, and more…?|Give context|Settings|Gemini\s+\d|Do anything with AI\.{0,3}|Ask anything|Response copied to clipboard|Copied to clipboard|Loading\.?)$/i.test(line);
      const isComposerLine = (line) => /^(?:Do anything with AI\.{0,3}|Ask anything|Give context|Settings|Gemini\s+\d|Start voice recording|Submit AI message|Response copied to clipboard|Copied to clipboard)$/i.test(line);
      const isMetaLine = (line) => /^(?:\d+\s*steps?|Today|Yesterday|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2}(?:,\s*\d{4})?)$/i.test(line);
      const trimPromptMeta = (line) => cleanLine(line).replace(/\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2}(?:,\s*\d{4})?$/i, "").replace(/\s+(?:Today|Yesterday)$/i, "").trim();
      const likelyPrompt = (line) => /[?？]$|^(?:介绍|搜索|请|帮|写|总结|解释|翻译|生成|分析|列出|查找|Tell|What|How|Why|Please|Search|Summarize|Explain|Write)\b/i.test(line);
      const notionDomTextFallback = () => {
        const raw = normalize(api.text(root) || root.innerText || root.textContent || "");
        if (!raw) return [];
        const lines = [];
        for (const rawLine of raw.split(/\n+/)) {
          const line = cleanLine(rawLine);
          if (!line || line.length < 2) continue;
          if (isComposerLine(line) && lines.length) break;
          if (isChromeLine(line)) continue;
          if (!lines.includes(line)) lines.push(line);
        }
        const stepIndex = lines.findIndex((line) => /^\d+\s*steps?$/i.test(line));
        let promptIndex = -1;
        if (stepIndex > 0) {
          for (let index = stepIndex - 1; index >= 0; index -= 1) {
            if (!isMetaLine(lines[index]) && !isChromeLine(lines[index])) {
              promptIndex = index;
              break;
            }
          }
        }
        if (promptIndex < 0) {
          promptIndex = lines.findIndex((line, index) => index < lines.length - 1 && likelyPrompt(line));
        }
        if (promptIndex < 0 || promptIndex >= lines.length - 1) return [];
        const user = trimPromptMeta(lines[promptIndex]);
        let answerStart = stepIndex >= 0 ? stepIndex + 1 : promptIndex + 1;
        while (answerStart < lines.length && isChromeLine(lines[answerStart])) answerStart += 1;
        const assistant = normalize(lines.slice(answerStart).filter((line) => line !== lines[promptIndex] && line !== user && !isChromeLine(line)).join("\n"));
        if (user.length < 2 || assistant.length < 20) return [];
        return [
          { role: "user", content: user },
          { role: "assistant", content: assistant }
        ];
      };
      const turns = [];
      const seen = /* @__PURE__ */ new Set();
      const buttons = qsa("button,[role=button]", root).filter(isCopyTurnButton).sort(order).slice(0, 48);
      for (const button of buttons) {
        const role = roleOfButton(button);
        if (role !== "user" && role !== "assistant") continue;
        api.reveal(button);
        await api.sleep(120);
        const text = useful(await api.copy(button, {
          resetClipboardBeforeCopy: true,
          acceptUnchangedClipboard: false,
          copyTimeoutMs: 6e3,
          copyPollMs: 40,
          copyCaptureGraceMs: 300
        }));
        if (text) {
          const key = role + "\n" + text.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            turns.push({ role, content: text });
          }
        }
        await api.sleep(80);
      }
      const merged = api.merge(turns);
      if (structured(merged)) return merged;
      if (typeof api.extractNativeCopyConversation === "function") {
        const copied = await api.extractNativeCopyConversation(root);
        if (structured(copied)) return copied;
      }
      return notionDomTextFallback();
    };
    scripts["notion.js"] = scripts["notion"];
    scripts["lobehub"] = async function(api) {
      const normalizeMeta = (value) => api.normalize(String(value || ""));
      const cleanCopied = (value) => String(value || "").replace(/\r\n/g, "\n").replace(/\u00a0/g, " ").replace(/[\t ]+\n/g, "\n").replace(/\n[\t ]+/g, "\n").trim();
      const qsa = (selector, root = document) => {
        try {
          return api.qsa(selector, root, { all: true });
        } catch (error) {
          return [];
        }
      };
      const closest = (element, selector) => {
        try {
          return api.closest(element, selector);
        } catch (error) {
          return null;
        }
      };
      const wrapperSelector = ".message-wrapper[data-message-id],[data-message-id].message-wrapper,[data-message-id]";
      const hasAnyWrapper = () => !!document.querySelector(wrapperSelector);
      const isBlankNewChatPage = () => {
        if (hasAnyWrapper()) return false;
        let pathname = "/";
        try {
          pathname = (new URL(location.href).pathname || "/").replace(/\/+$/, "") || "/";
        } catch (error) {
        }
        const homeLike = pathname === "/" || pathname === "/chat" || pathname === "/agent" || /^\/agent\/[^/]+$/.test(pathname);
        const hasComposer = !!document.querySelector('textarea,[contenteditable="true"],[role="textbox"],input[type="text"]');
        const bodyText = normalizeMeta((document.title || "") + "\n" + String(document.body && document.body.innerText || "").slice(0, 2200));
        const blankSignals = /(?:Let.s get started|Start New Topic|Ask, search, or brainstorm|Create your own Bot Channel|Recents|Agents|Home\s*·\s*LobeHub)/i.test(bodyText);
        return hasComposer && (homeLike || blankSignals);
      };
      for (let wait = 0; wait < 6 && !hasAnyWrapper(); wait += 1) await api.sleep(120);
      if (!hasAnyWrapper() && isBlankNewChatPage()) {
        console.debug("[Simple Chat Hub] LobeHub blank new chat page");
        return [];
      }
      const order = (a, b) => {
        try {
          if (a === b) return 0;
          const pos = a.compareDocumentPosition(b);
          return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : pos & Node.DOCUMENT_POSITION_PRECEDING ? 1 : 0;
        } catch (error) {
          return 0;
        }
      };
      const layoutBox = (element) => {
        try {
          return element && element.getBoundingClientRect ? element.getBoundingClientRect() : null;
        } catch (error) {
          return null;
        }
      };
      const isLaidOut = (element) => {
        if (!element) return false;
        try {
          const rect = layoutBox(element);
          const style = getComputedStyle(element);
          return !!(rect && rect.width > 2 && rect.height > 2 && style.display !== "none" && style.visibility !== "hidden");
        } catch (error) {
          return false;
        }
      };
      const actionExists = (element) => {
        if (!element) return false;
        try {
          if (element.disabled || element.getAttribute("aria-disabled") === "true") return false;
          const style = getComputedStyle(element);
          return style.display !== "none" && style.visibility !== "hidden";
        } catch (error) {
          return true;
        }
      };
      const compact = (value) => cleanCopied(value).toLowerCase().replace(/\s+/g, " ").slice(0, 1600);
      const meta = (element) => normalizeMeta([
        element && element.tagName,
        element && element.getAttribute && element.getAttribute("aria-label"),
        element && element.getAttribute && element.getAttribute("title"),
        element && element.getAttribute && element.getAttribute("data-testid"),
        element && element.getAttribute && element.getAttribute("data-test-id"),
        element && element.getAttribute && element.getAttribute("data-copy"),
        element && element.getAttribute && element.getAttribute("class"),
        element && element.textContent
      ].filter(Boolean).join(" "));
      const iconMeta = (element) => normalizeMeta([element, ...qsa("svg,use,path,rect,[data-icon],[class]", element).slice(0, 40)].map((node) => [
        node && node.getAttribute && node.getAttribute("class"),
        node && node.getAttribute && node.getAttribute("data-icon"),
        node && node.getAttribute && node.getAttribute("aria-label"),
        node && node.getAttribute && node.getAttribute("href"),
        node && node.getAttribute && node.getAttribute("xlink:href"),
        node && node.getAttribute && node.getAttribute("viewBox"),
        node && node.getAttribute && node.getAttribute("d")
      ].filter(Boolean).join(" ")).join(" "));
      const roleOf = (wrapper) => {
        const attrs = ["data-message-role", "data-role", "data-author", "data-from", "data-sender"].map((name) => wrapper.getAttribute && wrapper.getAttribute(name)).filter(Boolean).join(" ");
        if (/assistant|bot|model|lobe/i.test(attrs)) return "assistant";
        if (/user|human|me/i.test(attrs)) return "user";
        const className = String(wrapper.getAttribute && wrapper.getAttribute("class") || "");
        if (/(^|[-_\s])(assistant|bot|model)([-_\s]|$)/i.test(className)) return "assistant";
        if (/(^|[-_\s])(user|human)([-_\s]|$)/i.test(className)) return "user";
        if (wrapper.querySelector('img[alt*="Lobe" i],img[alt*="assistant" i],[class*="avatar" i] img[alt*="AI" i]')) return "assistant";
        const text = normalizeMeta(wrapper.innerText || wrapper.textContent || "");
        return /^Lobe AI\b/i.test(text) ? "assistant" : "user";
      };
      const hover = async (element) => {
        if (!element) return;
        try {
          element.scrollIntoView({ block: "center", inline: "nearest" });
        } catch (error) {
          try {
            api.reveal(element);
          } catch (ignored) {
          }
        }
        try {
          api.reveal(element);
        } catch (error) {
        }
        try {
          const rect = layoutBox(element) || { left: 0, top: 0, width: 0, height: 0 };
          const eventBase = { bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, view: window };
          for (const target of [element, element.parentElement].filter(Boolean)) {
            if (window.PointerEvent) {
              target.dispatchEvent(new PointerEvent("pointerover", { ...eventBase, pointerId: 1, pointerType: "mouse", isPrimary: true }));
              target.dispatchEvent(new PointerEvent("pointerenter", { ...eventBase, pointerId: 1, pointerType: "mouse", isPrimary: true }));
              target.dispatchEvent(new PointerEvent("pointermove", { ...eventBase, pointerId: 1, pointerType: "mouse", isPrimary: true }));
            }
            for (const type of ["mouseover", "mouseenter", "mousemove"]) target.dispatchEvent(new MouseEvent(type, eventBase));
          }
        } catch (error) {
        }
        await api.sleep(90);
      };
      const sameWrapper = (button, wrapper) => {
        const owner = closest(button, wrapperSelector);
        return !owner || owner === wrapper || wrapper.contains(button);
      };
      const nearWrapper = (button, wrapper) => {
        if (wrapper.contains(button)) return true;
        if (!sameWrapper(button, wrapper)) return false;
        const br = layoutBox(button);
        const wr = layoutBox(wrapper);
        if (!br || !wr || !br.width || !br.height || !wr.width || !wr.height) return false;
        const verticalOverlap = br.bottom >= wr.top - 24 && br.top <= wr.bottom + 60;
        const horizontalNear = br.right >= wr.left - 160 && br.left <= wr.right + 160;
        return verticalOverlap && horizontalNear;
      };
      const isCopyButton = (button, wrapper) => {
        if (!button || !sameWrapper(button, wrapper) || !actionExists(button)) return false;
        if (closest(button, 'pre,code,table,kbd,samp,a[href],[class*="code" i],[class*="table" i],[data-code-block]')) return false;
        const bits = meta(button) + " " + iconMeta(button);
        if (!/(?:^|\b)(copy|clipboard|content_copy|copy_all|file_copy|lucide-copy|复制|拷贝)(?:\b|$)/i.test(bits)) return false;
        if (/copy-link|copy url|copy source|copy table|copy code|copy permalink|复制链接|复制网址|复制来源|复制表格|复制代码/i.test(bits)) return false;
        return true;
      };
      const scoreCopyButton = (button, wrapper, role) => {
        if (!nearWrapper(button, wrapper) || !isCopyButton(button, wrapper)) return Infinity;
        let score = wrapper.contains(button) ? 0 : 900;
        const bits = meta(button) + " " + iconMeta(button);
        if (/lucide-copy|content_copy|copy_all|clipboard/i.test(bits)) score -= 160;
        if (closest(button, '[role=toolbar],.message-actions,[class*="action" i],[class*="toolbar" i]')) score -= 80;
        if (!isLaidOut(button)) score += 120;
        const text = normalizeMeta(button.innerText || button.textContent || "");
        if (text.length > 28) score += 120;
        try {
          const br = layoutBox(button);
          const wr = layoutBox(wrapper);
          if (br && wr && br.width && br.height) {
            score += Math.max(0, br.top - wr.bottom) / 4;
            score += Math.abs((br.top + br.bottom) / 2 - (wr.top + wr.bottom) / 2) / 18;
            if (role === "user") score += Math.max(0, wr.right - br.right) / 18;
            else score += Math.max(0, br.left - wr.right) / 24;
          }
        } catch (error) {
        }
        return score;
      };
      const candidateScopes = (wrapper) => {
        const scopes = [];
        const add = (node2) => {
          if (node2 && node2.nodeType === 1 && !scopes.includes(node2)) scopes.push(node2);
        };
        add(wrapper);
        let node = wrapper;
        for (let depth = 0; node && node !== document.body && depth < 3; depth += 1, node = node.parentElement) {
          add(node.parentElement);
          add(node.previousElementSibling);
          add(node.nextElementSibling);
        }
        return scopes.filter(Boolean).slice(0, 8);
      };
      const findCopyButton = async (wrapper, role) => {
        const selector = "button,[role=button],[role=menuitem],div[tabindex],span[role=button]";
        for (let attempt = 0; attempt < 6; attempt += 1) {
          await hover(wrapper);
          const seenButtons = /* @__PURE__ */ new Set();
          const buttons = [];
          for (const scope of candidateScopes(wrapper)) {
            for (const button of qsa(selector, scope)) {
              if (seenButtons.has(button)) continue;
              seenButtons.add(button);
              const score = scoreCopyButton(button, wrapper, role);
              if (Number.isFinite(score)) buttons.push({ button, score });
            }
          }
          buttons.sort((a, b) => a.score - b.score || order(a.button, b.button));
          if (buttons[0]) return buttons[0].button;
          await api.sleep(90);
        }
        return null;
      };
      const useful = (value) => {
        const text = cleanCopied(value);
        if (!text || /^(?:copy|copied|copy text|copy response|复制|已复制|拷贝)$/i.test(text)) return "";
        if (/^(?:https?:\/\/|mailto:|#)\S{1,240}$/i.test(text)) return "";
        return text;
      };
      const collectWrappers = () => qsa(wrapperSelector, document).filter(isLaidOut).filter((element, index, list) => !list.some((other, otherIndex) => otherIndex !== index && other.contains(element))).sort(order);
      const scrollParent = (element) => {
        for (let node = element && element.parentElement; node && node !== document.body; node = node.parentElement) {
          try {
            const style = getComputedStyle(node);
            if (/(auto|scroll|overlay)/i.test(style.overflowY || style.overflow || "") && node.scrollHeight > node.clientHeight + 80) return node;
          } catch (error) {
          }
        }
        return document.scrollingElement || document.documentElement;
      };
      const getScrollTop = (node) => node === document.scrollingElement || node === document.documentElement || node === document.body ? window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0 : node.scrollTop;
      const getClientHeight = (node) => node === document.scrollingElement || node === document.documentElement || node === document.body ? window.innerHeight : node.clientHeight;
      const getScrollHeight = (node) => node === document.scrollingElement || node === document.documentElement || node === document.body ? Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) : node.scrollHeight;
      const setScrollTop = async (node, top) => {
        try {
          if (node === document.scrollingElement || node === document.documentElement || node === document.body) window.scrollTo(0, top);
          else node.scrollTop = top;
        } catch (error) {
        }
        await api.sleep(170);
      };
      const turns = [];
      const seen = /* @__PURE__ */ new Set();
      const processed = /* @__PURE__ */ new Set();
      const debug = [];
      const pushCopied = (role, content) => {
        const key = role + "\n" + compact(content);
        if (!seen.has(key)) {
          seen.add(key);
          turns.push({ role, content });
        }
      };
      const processWrapper = async (wrapper) => {
        const id = wrapper.getAttribute("data-message-id") || "element-" + processed.size;
        if (processed.has(id)) return;
        processed.add(id);
        const role = roleOf(wrapper);
        if (role !== "user" && role !== "assistant") {
          debug.push({ id, role, reason: "role not recognized" });
          return;
        }
        const button = await findCopyButton(wrapper, role);
        if (!button) {
          debug.push({ id, role, reason: "copy button not found" });
          return;
        }
        let copied = "";
        try {
          await hover(wrapper);
          copied = await api.copy(button, { copyTimeoutMs: 6e3, copyPollMs: 40, copyCaptureGraceMs: 260, resetClipboardBeforeCopy: true });
        } catch (error) {
          debug.push({ id, role, reason: String(error && error.message || error) });
          return;
        }
        const content = useful(copied);
        if (!content) {
          debug.push({ id, role, reason: "empty copy result" });
          return;
        }
        pushCopied(role, content);
        await api.sleep(60);
      };
      const processCurrentDom = async () => {
        for (const wrapper of collectWrappers()) await processWrapper(wrapper);
      };
      const firstWrappers = collectWrappers();
      const scroller = scrollParent(firstWrappers[0]);
      const savedTop = scroller ? getScrollTop(scroller) : 0;
      try {
        if (scroller && getScrollHeight(scroller) > getClientHeight(scroller) + 120) {
          await setScrollTop(scroller, 0);
          let lastTop = -1;
          for (let step = 0; step < 34; step += 1) {
            await processCurrentDom();
            const top = getScrollTop(scroller);
            const maxTop = Math.max(0, getScrollHeight(scroller) - getClientHeight(scroller));
            if (top >= maxTop - 4) break;
            const nextTop = Math.min(maxTop, top + Math.max(320, Math.floor(getClientHeight(scroller) * 0.78)));
            if (Math.abs(nextTop - lastTop) < 3) break;
            lastTop = nextTop;
            await setScrollTop(scroller, nextTop);
          }
          await processCurrentDom();
        } else {
          await processCurrentDom();
        }
      } finally {
        if (scroller) await setScrollTop(scroller, savedTop);
      }
      if (debug.length) console.debug("[Simple Chat Hub] LobeHub copy extraction", debug);
      const merged = api.merge(turns);
      if (merged.some((item) => item.role === "user") && merged.some((item) => item.role === "assistant")) return merged;
      const nativeConversation = await api.extractNativeCopyConversation(document.body);
      return nativeConversation && nativeConversation.length ? nativeConversation : [];
    };
    scripts["lobehub.js"] = scripts["lobehub"];
    scripts["typingmind"] = async function(api) {
      const out = [];
      const seen = /* @__PURE__ */ new Set();
      const norm = (v) => api.normalize(String(v || ""));
      const qsa = (sel, root = document) => {
        try {
          return api.qsa(sel, root, { all: true });
        } catch {
          return [];
        }
      };
      const qs = (sel, root = document) => {
        try {
          return api.qs(sel, root);
        } catch {
          return null;
        }
      };
      const closest = (el, sel) => {
        try {
          return api.closest(el, sel);
        } catch {
          return null;
        }
      };
      const laidOut = (el) => {
        if (!el) return false;
        try {
          const style = getComputedStyle(el);
          return style.display !== "none" && style.visibility !== "hidden";
        } catch {
          return true;
        }
      };
      const order = (a, b) => {
        try {
          if (a === b) return 0;
          const pos = a.compareDocumentPosition(b);
          return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : pos & Node.DOCUMENT_POSITION_PRECEDING ? 1 : 0;
        } catch {
          return 0;
        }
      };
      const wrapperSelector = 'div[class*="message-index-"][class*="message-id-"]';
      const roots = [];
      const addRoot = (node) => {
        const root = closest(node, wrapperSelector) || node;
        if (root && !roots.includes(root)) roots.push(root);
      };
      qsa('[data-element-id="user-message"],[data-element-id="response-block"]', document).forEach(addRoot);
      qsa(wrapperSelector, document).forEach((root) => {
        if (qs('[data-element-id="user-message"],[data-element-id="response-block"]', root) && !roots.includes(root)) roots.push(root);
      });
      const opts = { copyButtonSelector: '[data-element-id="copy-message-button"]', copyButtonPattern: "copy-message-button|clipboard|copy", copyButtonIconFallback: false, copyButtonExcludePattern: "Copy code|Open in CodePen|Regenerate|List some more", copyTextExcludePattern: "^(Copy code|Open in CodePen|Regenerate|List some more)$", copyMenu: false, resetClipboardBeforeCopy: true, acceptUnchangedClipboard: false, copyTimeoutMs: 7e3, copyPollMs: 40, copyCaptureGraceMs: 260, matchMode: "anyUseful" };
      const sameTurn = (button, turn) => {
        const owner = closest(button, wrapperSelector);
        if (owner) return owner === turn || turn.contains(owner) || owner.contains(turn);
        if (turn.contains(button)) return true;
        try {
          const br = button.getBoundingClientRect(), tr = turn.getBoundingClientRect();
          return br.width >= 0 && br.height >= 0 && tr.width && tr.height && br.bottom >= tr.top - 48 && br.top <= tr.bottom + 96 && br.right >= tr.left - 160 && br.left <= tr.right + 160;
        } catch {
          return false;
        }
      };
      const isBadButton = (button) => closest(button, "pre,code,[data-language],table,kbd,samp") || /Copy code|Open in CodePen|Regenerate|List some more/i.test(norm(button.innerText || button.textContent || ""));
      const findButtons = async (turn) => {
        api.reveal(turn);
        await api.sleep(220);
        let buttons = qsa('[data-element-id="copy-message-button"]', turn).filter(laidOut);
        if (!buttons.length) buttons = qsa('[data-element-id="copy-message-button"]', document).filter((button) => sameTurn(button, turn) && laidOut(button));
        return buttons.filter((button) => !isBadButton(button)).sort(order);
      };
      for (const turn of roots.sort(order)) {
        const user = qs('[data-element-id="user-message"]', turn);
        const assistant = qs('[data-element-id="response-block"]', turn);
        const role = user ? "user" : assistant ? "assistant" : "";
        if (!role) continue;
        const source = user || assistant;
        const expected = norm(source.innerText || source.textContent);
        const buttons = await findButtons(turn);
        if (!buttons.length) continue;
        const copied = await api.copyFirst(buttons, { expected, role, scope: turn, options: opts });
        const clean = norm(copied);
        if (clean) {
          const key = role + "|" + clean.toLowerCase().replace(/\s+/g, "");
          if (!seen.has(key)) {
            seen.add(key);
            out.push({ role, text: clean });
          }
        }
        await api.sleep(80);
      }
      return api.merge(out);
    };
    scripts["typingmind.js"] = scripts["typingmind"];
    Object.defineProperty(scripts, "runtimeVersion", { value: "2026.07.16.1" });
    return scripts;
  }

  // content-src/shared/runtime-registry.js
  function validName(name) {
    const value = String(name || "").trim();
    if (!value) throw new TypeError("Runtime name is required");
    return value;
  }
  function disposeSupersededRegistries(target) {
    let keys = [];
    try {
      keys = Object.getOwnPropertyNames(target);
    } catch {
    }
    for (const key of keys) {
      if (key === RUNTIME_REGISTRY_KEY || !/^__CHATCLUB_RUNTIME_REGISTRY_V\d+__$/.test(key)) continue;
      let registry = null;
      try {
        registry = target[key];
      } catch {
      }
      if (!registry || registry.abiVersion === RUNTIME_REGISTRY_ABI_VERSION || typeof registry.dispose !== "function") continue;
      try {
        registry.dispose(`superseded by runtime registry ABI ${RUNTIME_REGISTRY_ABI_VERSION}`);
      } catch {
      }
    }
  }
  function runtimeRegistry(target = globalThis) {
    const current = target[RUNTIME_REGISTRY_KEY];
    if (current?.abiVersion === RUNTIME_REGISTRY_ABI_VERSION && typeof current.register === "function") return current;
    if (current != null) {
      throw new Error(
        `Runtime registry key ${RUNTIME_REGISTRY_KEY} is occupied by ABI ${String(current?.abiVersion ?? "unknown")}; incrementing RUNTIME_REGISTRY_ABI_VERSION must also produce a new registry key`
      );
    }
    disposeSupersededRegistries(target);
    const entries = /* @__PURE__ */ new Map();
    const disposeEntry = (key, reason) => {
      const entry = entries.get(key);
      if (!entry) return false;
      entries.delete(key);
      try {
        entry.dispose?.(String(reason || "invalidated"));
      } catch {
      }
      return true;
    };
    const registry = Object.freeze({
      abiVersion: RUNTIME_REGISTRY_ABI_VERSION,
      register(name, descriptor = {}) {
        const key = validName(name);
        const version = String(descriptor.version || "");
        if (!version) throw new TypeError(`Runtime ${key} requires a version`);
        if (!("api" in descriptor)) throw new TypeError(`Runtime ${key} requires an api`);
        const previous = entries.get(key);
        if (previous?.version === version) return previous.api;
        if (previous) {
          try {
            previous.dispose?.(`replaced by ${version}`);
          } catch {
          }
        }
        entries.set(key, {
          version,
          api: descriptor.api,
          dispose: typeof descriptor.dispose === "function" ? descriptor.dispose : null
        });
        return descriptor.api;
      },
      install(name, version, factory) {
        const key = validName(name);
        const expectedVersion = String(version || "");
        if (!expectedVersion) throw new TypeError(`Runtime ${key} requires a version`);
        const previous = entries.get(key);
        if (previous?.version === expectedVersion) return previous.api;
        if (previous) disposeEntry(key, `replaced by ${expectedVersion}`);
        if (typeof factory !== "function") throw new TypeError(`Runtime ${key} requires an installer`);
        const descriptor = factory();
        if (!descriptor || typeof descriptor !== "object" || !("api" in descriptor)) {
          throw new TypeError(`Runtime ${key} installer must return an api descriptor`);
        }
        entries.set(key, {
          version: expectedVersion,
          api: descriptor.api,
          dispose: typeof descriptor.dispose === "function" ? descriptor.dispose : null
        });
        return descriptor.api;
      },
      require(name, version) {
        const key = validName(name);
        const entry = entries.get(key);
        if (!entry) throw new Error(`Runtime ${key} is not registered`);
        if (version != null && entry.version !== String(version)) {
          throw new Error(`Runtime ${key} version ${entry.version} does not satisfy ${String(version)}`);
        }
        return entry.api;
      },
      registration(name) {
        const entry = entries.get(validName(name));
        return entry ? Object.freeze({ version: entry.version, api: entry.api }) : null;
      },
      invalidate(name, reason = "invalidated") {
        const key = validName(name);
        return disposeEntry(key, reason);
      },
      dispose(reason = "registry disposed") {
        for (const key of [...entries.keys()]) disposeEntry(key, reason);
      }
    });
    Object.defineProperty(target, RUNTIME_REGISTRY_KEY, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: registry
    });
    return registry;
  }

  // content-src/summary-userscripts.js
  function installSummaryIsolatedRuntime() {
    runtimeRegistry(window).register("summary-runners", {
      version: CONTENT_BRIDGE_VERSION,
      api: Object.freeze({ scripts: createSummaryRunnerRegistry() })
    });
  }
  installSummaryIsolatedRuntime();
})();
