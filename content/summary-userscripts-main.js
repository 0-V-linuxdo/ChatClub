(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // shared/protocol.js
  var GENERIC_POST_MESSAGE_SOURCE = "chatclub";
  var NATIVE_COPY_SOURCE = "chatclub-native-copy:2026.07.08.13";
  var GEMINI_MODEL_PICKER_SOURCE = "chatclub-gemini-model-picker:2026.07.13.3";
  var MAIN_WORLD_LOCATION_SOURCE = "chatclub:main-world-location:2026.07.13.3";
  var NOTION_SEND_TEXT_SOURCE = "chatclub-notion-send-text:2026.07.13.13";
  var NOTION_SEND_PROMPT_SOURCE = "chatclub-notion-send-prompt:2026.07.13.13";
  var NOTION_SEND_ACTIVATED_EVENT = "chatclub:notion-send-activated:2026.07.13.1";
  var SEND_TEXT_POST_MESSAGE_SOURCE = "chatclub:send-text:2026.07.13.7";
  var DELETE_THREAD_POST_MESSAGE_SOURCE = "chatclub:delete-thread:2026.07.10.2";
  var MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE = "chatclub:message-navigator:2026.07.08.12";
  var SUMMARY_POST_MESSAGE_SOURCE = "chatclub:summary:2026.07.08.13";
  var PREFERRED_MODEL_POST_MESSAGE_SOURCE = "chatclub:preferred-model:2026.07.13.2";
  var CONTENT_BRIDGE_VERSION = "2026.07.15.7";
  var EXTENSION_RUNTIME_RELAY_SOURCE = "chatclub:runtime-relay:2026.07.15.7";
  var SECURE_FRAME_COMMAND_SOURCE = "chatclub:frame-command:2026.07.15.7";
  var DEEPSEEK_DELETE_SOURCE = "chatclub-deepseek-delete-thread:2026.07.03.30";
  var PAGE_SUMMARY_SOURCE = "chatclub-summary-userscript:2026.07.15.7";
  var RUNTIME_REGISTRY_KEY = "__CHATCLUB_RUNTIME_REGISTRY_V1__";
  var RUNTIME_REGISTRY_ABI_VERSION = 1;
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
    NOTION_SEND_ACTIVATED_EVENT,
    SEND_TEXT_POST_MESSAGE_SOURCE,
    DELETE_THREAD_POST_MESSAGE_SOURCE,
    MESSAGE_NAVIGATOR_POST_MESSAGE_SOURCE,
    SUMMARY_POST_MESSAGE_SOURCE,
    PREFERRED_MODEL_POST_MESSAGE_SOURCE,
    CONTENT_BRIDGE_VERSION,
    EXTENSION_RUNTIME_RELAY_SOURCE,
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
      const closest2 = (node, selector) => {
        try {
          return api.closest(node, selector);
        } catch (error) {
          return null;
        }
      };
      const turnScope = (node) => closest2(node, 'article,[data-testid^="conversation-turn"],[data-testid*="conversation-turn"]') || node;
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
          const text2 = api.normalize(copied);
          if (text2) return text2;
          await api.sleep(80);
        }
        return "";
      };
      const turns = api.qsa("[data-message-author-role]", document, { all: true }).filter(api.visible).map((node) => ({ node, role: String(node.getAttribute("data-message-author-role") || "").toLowerCase() })).filter((turn) => turn.role === "user" || turn.role === "assistant").filter((turn, index, list) => !list.some((other, otherIndex) => otherIndex !== index && other.role === turn.role && other.node !== turn.node && other.node.contains && other.node.contains(turn.node)));
      const out = [];
      for (const turn of turns) {
        const scope = turnScope(turn.node);
        const text2 = await copyForTurn(scope, turn.role);
        if (text2) out.push({ role: turn.role, text: text2 });
        await api.sleep(120);
      }
      const merged = api.merge(out);
      return merged.some((message) => message.role === "user") && merged.some((message) => message.role === "assistant") ? merged : [];
    };
    scripts["chatgpt.js"] = scripts["chatgpt"];
    scripts["claude"] = async function(api) {
      const normalize2 = (value) => api.normalize(String(value || ""));
      const qsa2 = (selector, root2 = document) => {
        try {
          return api.qsa(selector, root2, { all: true });
        } catch (error) {
          return [];
        }
      };
      const closest2 = (element, selector) => {
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
      const meta = (element) => normalize2([
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
      const roots = qsa2("main,[role=main]", document).filter(layoutVisible);
      const root = roots.find((element) => !closest2(element, "nav,aside,header,footer")) || roots[0] || document;
      const roleFromHeading = (text2) => {
        if (/^\s*(?:You said|你说|您说)\s*[:：]/i.test(text2)) return "user";
        if (/^\s*(?:Claude responded|Claude replied|Claude said|Claude\s*(?:回复|回答))\s*[:：]/i.test(text2)) return "assistant";
        return "";
      };
      const structured = (messages) => Array.isArray(messages) && messages.some((item) => item && item.role === "user") && messages.some((item) => item && item.role === "assistant");
      const cleanLine = (value) => normalize2(value).replace(/^[-•]\s*/, "").replace(/(?:\s*[\u25a0-\u25ff]){2,}\s*$/g, "").replace(/\s+/g, " ").trim();
      const compact = (value) => normalize2(value).toLowerCase().replace(/\s+/g, " ").trim();
      const useful = (value) => {
        const text2 = normalize2(value).replace(/^Copied to clipboard\.?$/i, "").replace(/(?:\s*[\u25a0-\u25ff]){2,}\s*$/g, "").trim();
        if (!text2 || /^(?:copy|copied|复制|已复制)$/i.test(text2)) return "";
        if (/^(?:https?:\/\/|mailto:|#)\S{1,240}$/i.test(text2)) return "";
        return text2;
      };
      const hasUsefulLength = (role, text2) => role === "user" ? text2.length >= 2 : text2.length >= 8;
      const mergeIfStructured = (messages) => {
        const merged = api.merge(messages || []);
        return structured(merged) ? merged : [];
      };
      const headings = qsa2("h1,h2,h3,h4,[role=heading]", root).filter(layoutVisible).map((element) => ({ element, role: roleFromHeading(normalize2(element.innerText || element.textContent || "")) })).filter((item) => item.role).sort((a, b) => order(a.element, b.element));
      const copyPattern = /^\s*(?:copy|copied|复制|已复制)\s*$/i;
      const copyWordPattern = /(?:^|\b)(?:copy|copied)(?:\b|$)|复制|已复制/i;
      const excludePattern = /copy\s*(?:code|table|link|conversation|source|sources)|copy[-_ ]?(?:code|table|link|conversation|source|sources)|(?:link|share|history|source|sources|citation|citations|feedback|thumb|like|dislike|positive|negative|settings|export|docs|menu|more|retry|edit|regenerate|sidebar)|链接|分享|代码|表格|会话|历史|来源|引用|赞|踩|设置|导出|更多|菜单|重试|编辑/i;
      const isInternalTool = (button) => {
        if (closest2(button, "nav,aside,header,footer,form,input,textarea,select,[contenteditable=true],pre,code,table,kbd,samp,[data-language]")) return true;
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
        const buttons = qsa2("button,[role=button]", root).filter(isCopyButton).sort(order).slice(0, 48);
        for (const button of buttons) {
          const role = roleForButton(button);
          if (role !== "user" && role !== "assistant") continue;
          api.reveal(button);
          await api.sleep(120);
          const text2 = useful(await api.copy(button, {
            resetClipboardBeforeCopy: true,
            acceptUnchangedClipboard: false,
            copyTimeoutMs: 2400,
            copyPollMs: 50,
            copyCaptureGraceMs: 220
          }));
          if (text2) {
            const key = role + "\n" + compact(text2);
            if (!seen.has(key)) {
              seen.add(key);
              turns.push({ role, text: text2 });
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
        return normalize2(lines.join("\n"));
      };
      const claudeArticleSelector = '[role="article"][aria-label^="Message "]';
      const claudeActionCopySelector = 'button[data-testid="action-bar-copy"][aria-label="Copy"],button[data-testid="action-bar-copy"][title="Copy"]';
      const cleanCopiedText = (raw, role) => {
        let text2 = useful(raw);
        if (!text2) return "";
        text2 = stripRolePrefix(text2, role).replace(/[\ue000-\uf8ff]+/g, "").trim();
        return useful(text2);
      };
      const roleFromArticle = (article) => {
        const text2 = normalize2(article && (article.innerText || article.textContent) || "");
        const explicit = roleFromHeading(text2);
        if (explicit) return explicit;
        return "";
      };
      const claudeArticles = () => qsa2(claudeArticleSelector, root).filter(layoutVisible).filter((article, index, list) => !list.some((other, otherIndex) => otherIndex !== index && other.contains(article))).sort(order);
      const claudeArticleCopyButtons = (article) => qsa2(claudeActionCopySelector, article).filter(layoutVisible).sort(order);
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
            debug.push({ reason: "role not recognized", label: article.getAttribute("aria-label") || "", text: normalize2(article.innerText || article.textContent || "").slice(0, 80) });
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
        const label = normalize2([
          element.getAttribute && element.getAttribute("aria-label"),
          element.getAttribute && element.getAttribute("data-testid"),
          element.getAttribute && element.getAttribute("data-test-id"),
          element.getAttribute && element.getAttribute("role"),
          typeof element.className === "string" ? element.className : ""
        ].filter(Boolean).join(" "));
        if (/\bmessage\s+\d+\s+of\s+\d+\b/i.test(label)) return true;
        if (/message|conversation-turn|chat-message|chat_message/i.test(label) && qsa2("button,[role=button],[role=toolbar],toolbar", element).length) return true;
        return false;
      };
      const messageRootFor = (element) => {
        let best = null;
        for (let node = element && element.parentElement, depth = 0; node && node !== root && depth < 10; node = node.parentElement, depth += 1) {
          if (messageWrapperCandidate(node)) {
            best = node;
            break;
          }
          const text2 = normalize2(node.innerText || node.textContent || "");
          if (!best && text2.length >= 8 && text2.length <= 2e4 && qsa2("button,[role=button],[role=toolbar],toolbar", node).length) best = node;
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
        if (closest2(button, '[role=toolbar],toolbar,[class*="action" i],[class*="toolbar" i]')) score -= 250;
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
        qsa2("button,[role=button]", wrapper).forEach(add);
        qsa2("button,[role=button]", root).forEach((button) => {
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
          const text2 = cleanDomText(api.text(wrapper) || wrapper.innerText || wrapper.textContent || "", heading.role);
          if (hasUsefulLength(heading.role, text2)) turns.push({ role: heading.role, text: text2 });
        }
        return mergeIfStructured(turns);
      };
      const splitTextByRoleLabels = () => {
        const raw = normalize2(api.text(root) || root.innerText || root.textContent || "");
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
      const normalize2 = (value) => api.normalize(String(value || ""));
      const chromeLinePattern = /^(?:Copy prompt|Copy|Copied|Edit|Good response|Bad response|Redo|Show more options|Share|Export|Open menu for conversation actions\.?|Ask Gemini|Microphone|Upload & tools|Send message|Flash(?:[-\s]?Lite)?|Flash|Pro|Experimental|Deep Research|Canvas|Search|Explain|Translate|翻译|搜索|复制|已复制|编辑|重新生成|更多|分享|导出|点赞|点踩)$/i;
      const stripLabels = (value) => String(value || "").replace(/(^|\n)\s*(?:You said|Gemini said)\s+(?=\S)/gi, "$1").replace(/(^|\n)\s*(?:You said|Gemini said)\s*(?=\n|$)/gi, "\n").replace(/(^|\n)\s*(?:Copy prompt|Copy|Copied|Edit|Good response|Bad response|Redo|Show more options)\s*(?=\n|$)/gi, "\n");
      const cleanCopiedText = (value) => normalize2(stripLabels(value)).split(/\n+/).map((line) => line.trim().replace(/^(?:You said|Gemini said)\s+/i, "").trim()).filter((line) => line && !chromeLinePattern.test(line)).join("\n");
      const useful = (value) => {
        const text2 = cleanCopiedText(value);
        if (!text2 || text2.length < 2 || text2.length > 5e4) return "";
        if (/^(?:https?:\/\/|mailto:|#)\S{1,240}$/i.test(text2)) return "";
        return text2;
      };
      const compact = (value) => String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
      const labelOf = (node) => normalize2([
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
      const elementOrder2 = (a, b) => {
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
      const closest2 = (node, selector) => {
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
        const text2 = normalize2(node && node.textContent);
        if (/^you said(?:\b|\s|$)/i.test(text2)) return "user";
        if (/^gemini said(?:\b|\s|$)/i.test(text2)) return "assistant";
        return "";
      };
      const canonicalTurn = (node, role) => {
        const selector = role === "user" ? 'user-query,.user-query,[data-test-id*="user-query"],[data-testid*="user-query"],[data-message-author-role="user"]' : 'model-response,.model-response,[data-test-id*="model-response"],[data-testid*="model-response"],[data-message-author-role="assistant"]';
        return closest2(node, selector) || node;
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
      const turns = Array.from(turnMap.values()).filter((item, index, list) => !list.some((other, otherIndex) => otherIndex !== index && other.node !== item.node && other.node.contains && other.node.contains(item.node) && other.role === item.role)).sort((a, b) => elementOrder2(a.node, b.node));
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
          const scored = candidates.map((button) => ({ button, score: candidateScore(button, turn) })).filter((item) => Number.isFinite(item.score)).sort((a, b) => a.score - b.score || elementOrder2(a.button, b.button));
          if (scored.length) return scored.slice(0, 3).map((item) => item.button);
        }
        return [];
      };
      const copyFromButtons = async (buttons) => {
        for (const button of buttons) {
          const text2 = useful(await api.copy(button, { copyTimeoutMs, copyPollMs: 40 }));
          if (text2) return text2;
        }
        if (buttons[0]) {
          await api.sleep(180);
          return useful(await api.copy(buttons[0], { copyTimeoutMs: retryCopyTimeoutMs, copyPollMs: 40 }));
        }
        return "";
      };
      const push = (out2, role, value) => {
        const text2 = useful(value);
        if (role !== "user" && role !== "assistant" || !text2) return false;
        const key = role + "|" + compact(text2);
        for (let index = 0; index < out2.length; index += 1) {
          const existing = out2[index];
          if (existing.role !== role) continue;
          const existingKey = role + "|" + compact(existing.text);
          if (existingKey === key || existingKey.includes(key)) return true;
          if (key.includes(existingKey)) {
            out2[index] = { role, text: text2 };
            return true;
          }
        }
        out2.push({ role, text: text2 });
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
      const normalize2 = (value) => api.normalize(String(value || ""));
      const isCopyProbe = (value) => /_?sch[\s_-]*copy[\s_-]*probe[\s_-]*[a-z0-9-]+_?/i.test(String(value || "")) || /_?sch[\s_-]*copy[\s_-]*probe[\s_-]*[a-z0-9-]+_?/i.test(normalize2(value));
      const qsa2 = (selector, scope = document) => {
        try {
          return api.qsa(selector, scope || document, { all: true });
        } catch (error) {
          return [];
        }
      };
      const closest2 = (node, selector) => {
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
      const visible2 = (node) => {
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
      const classText2 = (node) => {
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
      const meta = (node) => normalize2([
        node && node.tagName,
        classText2(node),
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
      const svgSignature2 = (node) => normalize2([node, ...qsa2("svg,path,rect,line,polyline,polygon,use,img,[data-icon],[class]", node).slice(0, 80)].map((el) => [
        classText2(el),
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
        const text2 = svgSignature2(button);
        if (!text2) return false;
        if (/copy|clipboard|content_copy|copy_all|file_copy|lucide-copy|tabler-icon-copy|copy[-_ ]?(?:icon|line|fill)|heroicons.*clipboard|mingcute.*copy|carbon.*copy/.test(text2)) return true;
        if (/64 64 896 896/.test(text2) && /m832\s*64h296|m704\s*192h-?512|v688|v704|h512|h496/.test(text2) && /v624|h432|h496/.test(text2)) return true;
        if (/0 0 (16|18|20) (16|18|20)/.test(text2) && /(m12\.668\s*10\.667c|m12\.66810\.667c|m13\.998\s*12\.665c|m13\.99812\.665c|m6\.14929\s*4\.02032c|m6\.149294\.02032c|m9\.80164\s*0\.367975c|m9\.801640\.367975c)/.test(text2)) return true;
        if (/0 0 24 24/.test(text2) && (/\bm\s*(4|6|7|8|9)\s*(4|6|7|8|9)\b/.test(text2) || /\bx\s*=\s*(4|6|7|8|9)\b/.test(text2)) && /\bh\s*(8|9|10|12|14)\b|\bv\s*(8|9|10|12|14)\b|width=(8|9|10|12|14)|height=(8|9|10|12|14)/.test(text2)) return true;
        const rects = qsa2("rect", button).filter((rect) => Number(rect.getAttribute("width") || 0) >= 7 && Number(rect.getAttribute("height") || 0) >= 7);
        return rects.length >= 2;
      };
      const isSmallIconButton = (button) => {
        const rect = rectOf(button);
        if (!rect || rect.width < 12 || rect.height < 12 || rect.width > 76 || rect.height > 76) return false;
        const label = normalize2(meta(button)).toLowerCase();
        const textOnly = normalize2(button && (button.innerText || button.textContent) || "");
        return !!qsa2("svg,img,[data-icon]", button).length && textOnly.length <= 32 && !/(send|ask anything|message|search|deepthink|model|attach|upload|voice|home|new chat|sidebar|fullscreen|reload|menu|more)/i.test(label);
      };
      const hoverCopyVisible = (button) => {
        if (visible2(button)) return true;
        try {
          const style = getComputedStyle(button);
          if (style.display === "none" || style.visibility === "hidden") return false;
          return explicitCopy(button) || looksCopyIcon(button) || !!qsa2("svg,img,[data-icon]", button).length;
        } catch (error) {
          return false;
        }
      };
      const badButton = (button, role = "") => {
        if (!button || !visible2(button)) return true;
        if (closest2(button, "nav,header,footer,aside,form,input,textarea,select,[contenteditable=true],pre,code,table,kbd,samp,[data-language]")) return true;
        const label = meta(button).toLowerCase();
        const blockedAction = /(?:link|share|history|source|sources|citation|feedback|thumb|like|dislike|settings|export|docs|menu|more|notification|sidebar|regenerate|retry|upload|voice|submit|send|model|attach|new chat|home page|fullscreen|reload|close|edit|delete|search|deepthink|imagine|project|pfp|profile|upgrade)|链接|分享|历史|来源|引用|赞|踩|设置|导出|更多|菜单|通知|侧边栏|重新生成|上传|语音|提交|发送|编辑|删除|搜索/.test(label);
        if (blockedAction && !explicitCopy(button)) return true;
        if (codeOrLinkCopy(button)) return true;
        if (explicitCopy(button) || looksCopyIcon(button)) return false;
        return blockedAction;
      };
      const textOf = (node) => {
        try {
          return normalize2(api.text ? api.text(node) : node && (node.innerText || node.textContent));
        } catch (error) {
          return normalize2(node && (node.innerText || node.textContent));
        }
      };
      const uiLine = /^(?:Copy|Copied|Copy prompt|Copy message|Copy response|Create share link|Like|Dislike|Regenerate|More actions|More options|Share|Edit|Search|DeepThink|Ask anything|Upgrade to SuperGrok|New conversation - Grok|AI-generated, for reference only|This response is AI-generated, for reference only|Necessary cookies only|Accept all cookies|Cookie Settings|\d+ sources?|\d+ web pages|Thought for .*|复制|已复制|点赞|点踩|更多|分享|编辑|搜索)$/i;
      const cleanCopied = (value, role) => {
        let text2 = normalize2(value).replace(/\r\n?/g, "\n").replace(/Show more\s*Show less/gi, "");
        const lines = text2.split("\n").map((line) => line.trim()).filter((line) => line && !uiLine.test(line));
        text2 = normalize2(lines.join("\n"));
        if (site === "deepseek" && role === "user") {
          const title = normalize2((document.title || "").replace(/\s*[-–—|].*$/, ""));
          if (title && text2.startsWith(title)) text2 = normalize2(text2.slice(title.length));
          text2 = normalize2(text2.replace(/^\s*(?:DeepSeek|DSeek|Instant)\b\s*/i, ""));
        }
        return text2;
      };
      const useful = (value, role) => {
        const text2 = cleanCopied(value, role);
        if (isCopyProbe(value) || isCopyProbe(text2)) return "";
        if (!text2 || text2.length < 2 || text2.length > 5e4) return "";
        if (/^(?:copy|copied|复制|已复制|share|link)$/i.test(text2)) return "";
        if (/^(?:https?:\/\/|mailto:|#)\S{1,240}$/i.test(text2)) return "";
        if (/Simple Chat Hub|Summary Panel|pages checked,|No userscript messages found/i.test(text2)) return "";
        if (!/[A-Za-z0-9\u4e00-\u9fff]/.test(text2)) return "";
        return text2;
      };
      const compact = (value) => normalize2(value).toLowerCase().replace(/\[[^\]]+\]\([^)]*\)/g, "$1").replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
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
      const hasVisibleAction = (node) => qsa2(buttonSelector, node).some(visible2);
      const deepSeekActionScope = (node) => {
        if (!node || site !== "deepseek") return node;
        const direct = closest2(node, ".ds-message,[class*=ds-message],[data-message-author-role],article,[data-testid*=message],[class*=message],[class*=Message]") || node;
        for (let current = direct, depth = 0; current && current !== root && current !== document.body && depth < 8; current = current.parentElement, depth += 1) {
          if (closest2(current, "nav,header,footer,aside,form,input,textarea,select,[contenteditable=true]")) continue;
          if (looksMessageText(textOf(current)) && hasVisibleAction(current)) return current;
        }
        return direct;
      };
      const actionScopes = (anchor) => {
        const scopes = [];
        const add = (node) => {
          if (!node || node.nodeType !== 1 || node === document.documentElement || node === document.body) return;
          if (closest2(node, "nav,header,footer,aside,form,input,textarea,select,[contenteditable=true]")) return;
          addUnique(scopes, node);
        };
        const base = anchor && (closest2(anchor, "[data-message-author-role],article,[data-testid*=message],[data-testid*=conversation],[class*=message],[class*=Message],[class*=response],[class*=Response],.ds-message") || anchor);
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
          for (const button of qsa2(buttonSelector, scope)) add(button, index++);
        }
        if (anchorRect) {
          for (const button of qsa2(buttonSelector, document)) add(button, 9e4 + index++);
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
            const text2 = useful(raw, turn.role);
            if (text2) {
              const matchesExpected = turn.expected && roughMatch(text2, turn.expected);
              if (turn.role === "user") {
                if (matchesExpected && text2.length >= 2 && text2.length <= 12e3) return text2;
              } else {
                if (matchesExpected) return text2;
                if (text2.length >= 12) return text2;
              }
            }
            await escapeMenus();
          }
        }
        return "";
      };
      const looksMessageText = (value) => {
        const text2 = normalize2(value);
        if (!text2 || text2.length < 2 || text2.length > 45e3) return false;
        if (/^(?:Copy|Copied|Share|Like|Dislike|Search|DeepThink|Ask anything|Upgrade to SuperGrok|Cookie Settings)$/i.test(text2)) return false;
        if (/Summary Panel|Simple Chat Hub|pages checked/i.test(text2)) return false;
        return /[A-Za-z0-9\u4e00-\u9fff]/.test(text2);
      };
      const pushTurn = (turns2, role, node, expected = "", actionNode = node) => {
        if (role !== "user" && role !== "assistant" || !node) return;
        const text2 = normalize2(expected || textOf(node));
        if (!looksMessageText(text2)) return;
        if (turns2.some((item) => item.role === role && item.node === node)) return;
        turns2.push({ role, node, actionNode: actionNode || node, expected: text2 });
      };
      const previousTextBlock = (anchor, marker) => {
        const markerRect = rectOf(marker || anchor);
        const candidates = [];
        for (const node of qsa2("article,section,div,[role]", root)) {
          if (!visible2(node) || node === anchor || node.contains(anchor) || closest2(node, "nav,header,footer,aside,form,input,textarea,select,[contenteditable=true]")) continue;
          if (order(node, marker || anchor) >= 0) continue;
          const text2 = textOf(node);
          if (!looksMessageText(text2) || /Thought for|Upgrade to SuperGrok|Ask anything/i.test(text2)) continue;
          const rect = rectOf(node);
          if (markerRect && rect && rect.bottom > markerRect.top + 80) continue;
          const tooBroad = qsa2("article,section,div,[role]", node).some((child) => child !== node && looksMessageText(textOf(child)) && textOf(child).length >= Math.min(text2.length * 0.65, text2.length - 8));
          if (tooBroad && text2.length > 300) continue;
          candidates.push({ node, rect, text: text2 });
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
        const assistants = qsa2(".ds-assistant-message-main-content", root).filter(visible2).sort(order);
        for (const assistant of assistants) {
          const assistantScope = closest2(assistant, ".ds-message") || assistant;
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
        const thoughtNodes = qsa2("button,div,span,[role=button]", root).filter((node) => visible2(node) && /^\s*Thought for\b/i.test(normalize2(node.innerText || node.textContent || ""))).sort(order);
        const markers = thoughtNodes.length ? thoughtNodes : qsa2("article,section,div,[role]", root).filter((node) => visible2(node) && /\bThought for\b/i.test(textOf(node))).sort(order).slice(0, 3);
        for (const marker of markers.slice(0, 3)) {
          let assistantNode = marker;
          for (let node = marker; node && node !== root && node !== document.body; node = node.parentElement) {
            const text2 = textOf(node);
            if (text2.length > 120 && /\bThought for\b/i.test(text2) && !/Ask anything|Upgrade to SuperGrok|Home page|Notifications/i.test(text2)) {
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
          const nodes = qsa2("[data-message-author-role],article,[data-testid*=message],[data-testid*=conversation],[class*=message],[class*=Message],[class*=response],[class*=Response]", root).filter(visible2).sort(order);
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
          const text2 = useful(raw, role);
          if (!text2) continue;
          const key = role + "\n" + compact(text2);
          if (seen2.has(key)) continue;
          seen2.add(key);
          out2.push({ role, text: text2 });
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
        const text2 = await copyTurn(turn);
        if (!text2) continue;
        const key = turn.role + "\n" + compact(text2);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ role: turn.role, text: text2 });
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
      const normalize2 = (value) => api.normalize(String(value || ""));
      const qsa2 = (selector, scope = document) => {
        try {
          return api.qsa(selector, scope || document, { all: true });
        } catch (error) {
          return [];
        }
      };
      const closest2 = (node, selector) => {
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
      const visible2 = (node) => {
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
      const classText2 = (node) => {
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
      const meta = (node) => normalize2([
        node && node.tagName,
        classText2(node),
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
      const svgSignature2 = (node) => normalize2([node, ...qsa2("svg,title,desc,path,rect,line,polyline,polygon,use,img,[data-icon],[class]", node).slice(0, 80)].map((el) => [
        classText2(el),
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
      const actionSignature = (node) => normalize2(meta(node) + " " + svgSignature2(node)).toLowerCase();
      const explicitCopy = (button) => /(?:^|\b)(copy|copied|clipboard)(?:\b|$)|复制|已复制|拷贝|content[_-]?copy|copy[_-]?all|file[_-]?copy/i.test(meta(button));
      const nestedCopy = (button) => /copy\s*(?:code|table|link|conversation|source|sources|citation|citations|url)|copy[-_ ]?(?:code|table|link|conversation|source|sources|citation|citations|url)|复制(?:代码|表格|链接|会话|来源|引用)/i.test(meta(button));
      const looksCopyIcon = (button) => {
        const text2 = svgSignature2(button);
        if (!text2) return false;
        if (/copy|clipboard|content[_-]?copy|copy[_-]?all|file[_-]?copy|lucide-copy|tabler-icon-copy|heroicons.*clipboard|mingcute.*copy|carbon.*copy/.test(text2)) return true;
        if (/0 0 (16|18|20|24) (16|18|20|24)/.test(text2) && /(m12\.668\s*10\.667c|m12\.66810\.667c|m13\.998\s*12\.665c|m13\.99812\.665c|m6\.14929\s*4\.02032c|m6\.149294\.02032c|m9\.80164\s*0\.367975c|m9\.801640\.367975c)/.test(text2)) return true;
        const rects = qsa2("rect", button).filter((rect) => Number(rect.getAttribute("width") || 0) >= 7 && Number(rect.getAttribute("height") || 0) >= 7);
        return rects.length >= 2;
      };
      const editAction = (control) => /(?:^|[^a-z])(?:edit|edited|pencil|compose|modify|revise|square[-_ ]?pen|pen[-_ ]?line)(?:[^a-z]|$)|编辑|修改/.test(actionSignature(control));
      const likeAction = (control) => {
        const signature = actionSignature(control);
        if (/(?:^|[^a-z])(?:dislike|disliked|thumbs?[-_ ]?down|downvote|negative)(?:[^a-z]|$)|点踩|踩|不喜欢/.test(signature)) return false;
        return /(?:^|[^a-z])(?:like|liked|unlike|thumbs?[-_ ]?up|upvote|positive)(?:[^a-z]|$)|点赞|取消点赞|赞/.test(signature);
      };
      const canonicalControl = (control) => {
        if (!control || !visible2(control)) return false;
        return !qsa2(controlSelector, control).some((child) => child !== control && visible2(child));
      };
      const pageChromeControl = (control) => Boolean(closest2(control, "nav,aside,form,input,textarea,select,[contenteditable=true],pre,code,table,kbd,samp,[data-language],[data-code-block],[data-codeblock]"));
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
      const classifiedActionContext = (bar, copy2, controls) => {
        if (!bar || controls.length < 2 || controls.length > 12) return null;
        const hasEdit = controls.some((control) => control !== copy2 && editAction(control));
        const hasLike = controls.some((control) => control !== copy2 && likeAction(control));
        if (hasEdit === hasLike) return null;
        return { bar, copy: copy2, controls, role: hasEdit ? "user" : "assistant" };
      };
      const actionContext = (copy2) => {
        const exactBar = closest2(copy2, ".action-buttons,[data-testid*=action-buttons],[data-test-id*=action-buttons]");
        if (exactBar) {
          const exact = classifiedActionContext(exactBar, copy2, qsa2(controlSelector, exactBar).filter(canonicalControl));
          if (exact) return exact;
        }
        for (let scope = copy2 && copy2.parentElement, depth = 0; scope && depth < 10; scope = scope.parentElement, depth += 1) {
          const controls = qsa2(controlSelector, scope).filter(canonicalControl).filter((control) => control === copy2 || sameActionRow(copy2, control));
          const classified = classifiedActionContext(scope, copy2, controls);
          if (classified) return classified;
          if (scope === root || scope === document.body || scope === document.documentElement) break;
        }
        return null;
      };
      const compact = (value) => normalize2(value).toLowerCase().replace(/\[[^\]]+\]\([^)]*\)/g, "$1").replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
      const isCopyProbe = (value) => /_?sch[\s_-]*copy[\s_-]*probe[\s_-]*[a-z0-9-]+_?/i.test(String(value || "")) || /_?sch[\s_-]*copy[\s_-]*probe[\s_-]*[a-z0-9-]+_?/i.test(normalize2(value));
      const uiLine = /^(?:Copy|Copied|Copy prompt|Copy message|Copy response|Create share link|Like|Dislike|Regenerate|More actions|More options|Share|Edit|Search|DeepThink|Ask anything|Upgrade to SuperGrok|New conversation - Grok|AI-generated, for reference only|This response is AI-generated, for reference only|Necessary cookies only|Accept all cookies|Cookie Settings|\d+ sources?|\d+ web pages|Thought for .*|Worked for .*|思考了.*|工作了.*|复制|已复制|点赞|点踩|更多|分享|编辑|搜索)$/i;
      const cleanCopied = (value) => {
        const lines = normalize2(value).replace(/\r\n?/g, "\n").replace(/Show more\s*Show less/gi, "").split("\n").map((line) => line.trim()).filter((line) => line && !uiLine.test(line));
        return normalize2(lines.join("\n"));
      };
      const useful = (value) => {
        const text2 = cleanCopied(value);
        if (isCopyProbe(value) || isCopyProbe(text2)) return "";
        if (!text2 || text2.length < 2 || text2.length > 5e4) return "";
        if (/^(?:copy|copied|复制|已复制|share|link)$/i.test(text2)) return "";
        if (/^(?:https?:\/\/|mailto:|#)\S{1,240}$/i.test(text2)) return "";
        if (/Simple Chat Hub|Summary Panel|pages checked,|No userscript messages found/i.test(text2)) return "";
        return /[A-Za-z0-9\u4e00-\u9fff]/.test(text2) ? text2 : "";
      };
      const stripUserPromptPrefix = (value, expected) => {
        const text2 = cleanCopied(value);
        const prompt = cleanCopied(expected);
        const promptKey = compact(prompt);
        if (!text2 || !promptKey) return text2;
        if (compact(text2) === promptKey) return "";
        if (text2.toLowerCase().startsWith(prompt.toLowerCase())) {
          const stripped = cleanCopied(text2.slice(prompt.length));
          if (stripped && compact(stripped) !== promptKey) return stripped;
        }
        const lines = text2.split("\n").map((line) => line.trim()).filter(Boolean);
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
        return text2;
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
        for (const copy2 of qsa2(controlSelector, root).filter(messageCopyControl).sort(order)) {
          const action = actionContext(copy2);
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
          let text2 = useful(raw);
          if (action.role === "assistant") {
            text2 = stripUserPromptPrefix(text2, lastUser2);
            if (lastUser2 && compact(text2) === compact(lastUser2)) text2 = "";
          }
          if (text2 && (action.role === "user" ? text2.length <= 12e3 : text2.length >= 2)) return text2;
          await escapeMenus();
        }
        return "";
      };
      const out = [];
      let lastUser = "";
      for (const action of messageActions().slice(-24)) {
        const text2 = await copyActionText(action, action.role === "assistant" ? lastUser : "");
        if (!text2) continue;
        out.push({ role: action.role, text: text2 });
        if (action.role === "user") lastUser = text2;
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
      const normalize2 = (value) => api.normalize(String(value || ""));
      const qsa2 = (selector, scope = document) => {
        try {
          return api.qsa(selector, scope || document, { all: true });
        } catch (error) {
          return [];
        }
      };
      const closest2 = (node, selector) => {
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
      const visible2 = (node) => {
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
      const classText2 = (node) => {
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
      const meta = (node) => normalize2([
        node && node.tagName,
        classText2(node),
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
      const svgSignature2 = (node) => normalize2([node, ...qsa2("svg,title,desc,path,rect,line,polyline,polygon,use,img,[data-icon],[class]", node).slice(0, 80)].map((el) => [
        classText2(el),
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
      const actionSignature = (node) => normalize2(meta(node) + " " + svgSignature2(node)).toLowerCase();
      const explicitCopy = (button) => /(?:^|\b)(copy|copied|clipboard)(?:\b|$)|复制|已复制|拷贝|content[_-]?copy|copy[_-]?all|file[_-]?copy/i.test(meta(button));
      const nestedCopy = (button) => /copy\s*(?:code|table|link|conversation|source|sources|citation|citations|url)|copy[-_ ]?(?:code|table|link|conversation|source|sources|citation|citations|url)|复制(?:代码|表格|链接|会话|来源|引用)/i.test(meta(button));
      const looksCopyIcon = (button) => {
        const text2 = svgSignature2(button);
        if (!text2) return false;
        if (/copy|clipboard|content[_-]?copy|copy[_-]?all|file[_-]?copy|lucide-copy|tabler-icon-copy|heroicons.*clipboard|mingcute.*copy|carbon.*copy/.test(text2)) return true;
        if (/0 0 (16|18|20|24) (16|18|20|24)/.test(text2) && /(m12\.668\s*10\.667c|m12\.66810\.667c|m13\.998\s*12\.665c|m13\.99812\.665c|m6\.14929\s*4\.02032c|m6\.149294\.02032c|m9\.80164\s*0\.367975c|m9\.801640\.367975c)/.test(text2)) return true;
        const rects = qsa2("rect", button).filter((rect) => Number(rect.getAttribute("width") || 0) >= 7 && Number(rect.getAttribute("height") || 0) >= 7);
        return rects.length >= 2;
      };
      const editAction = (control) => /(?:^|[^a-z])(?:edit|edited|pencil|compose|modify|revise|square[-_ ]?pen|pen[-_ ]?line)(?:[^a-z]|$)|编辑|修改/.test(actionSignature(control));
      const likeAction = (control) => {
        const signature = actionSignature(control);
        if (/(?:^|[^a-z])(?:dislike|disliked|thumbs?[-_ ]?down|downvote|negative)(?:[^a-z]|$)|点踩|踩|不喜欢/.test(signature)) return false;
        return /(?:^|[^a-z])(?:like|liked|unlike|thumbs?[-_ ]?up|upvote|positive)(?:[^a-z]|$)|点赞|取消点赞|赞/.test(signature);
      };
      const canonicalControl = (control) => {
        if (!control || !visible2(control)) return false;
        return !qsa2(controlSelector, control).some((child) => child !== control && visible2(child));
      };
      const pageChromeControl = (control) => Boolean(closest2(control, "nav,aside,form,input,textarea,select,[contenteditable=true],pre,code,table,kbd,samp,[data-language],[data-code-block],[data-codeblock]"));
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
      const classifiedActionContext = (bar, copy2, controls) => {
        if (!bar || controls.length < 2 || controls.length > 12) return null;
        const hasEdit = controls.some((control) => control !== copy2 && editAction(control));
        const hasLike = controls.some((control) => control !== copy2 && likeAction(control));
        if (hasEdit === hasLike) return null;
        return { bar, copy: copy2, controls, role: hasEdit ? "user" : "assistant" };
      };
      const actionContext = (copy2) => {
        const exactBar = closest2(copy2, ".action-buttons,[data-testid*=action-buttons],[data-test-id*=action-buttons]");
        if (exactBar) {
          const exact = classifiedActionContext(exactBar, copy2, qsa2(controlSelector, exactBar).filter(canonicalControl));
          if (exact) return exact;
        }
        for (let scope = copy2 && copy2.parentElement, depth = 0; scope && depth < 10; scope = scope.parentElement, depth += 1) {
          const controls = qsa2(controlSelector, scope).filter(canonicalControl).filter((control) => control === copy2 || sameActionRow(copy2, control));
          const classified = classifiedActionContext(scope, copy2, controls);
          if (classified) return classified;
          if (scope === root || scope === document.body || scope === document.documentElement) break;
        }
        return null;
      };
      const compact = (value) => normalize2(value).toLowerCase().replace(/\[[^\]]+\]\([^)]*\)/g, "$1").replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
      const isCopyProbe = (value) => /_?sch[\s_-]*copy[\s_-]*probe[\s_-]*[a-z0-9-]+_?/i.test(String(value || "")) || /_?sch[\s_-]*copy[\s_-]*probe[\s_-]*[a-z0-9-]+_?/i.test(normalize2(value));
      const uiLine = /^(?:Copy|Copied|Copy prompt|Copy message|Copy response|Create share link|Like|Dislike|Regenerate|More actions|More options|Share|Edit|Search|DeepThink|Ask anything|Upgrade to SuperGrok|New conversation - Grok|AI-generated, for reference only|This response is AI-generated, for reference only|Necessary cookies only|Accept all cookies|Cookie Settings|\d+ sources?|\d+ web pages|Thought for .*|Worked for .*|思考了.*|工作了.*|复制|已复制|点赞|点踩|更多|分享|编辑|搜索)$/i;
      const cleanCopied = (value) => {
        const lines = normalize2(value).replace(/\r\n?/g, "\n").replace(/Show more\s*Show less/gi, "").split("\n").map((line) => line.trim()).filter((line) => line && !uiLine.test(line));
        return normalize2(lines.join("\n"));
      };
      const useful = (value) => {
        const text2 = cleanCopied(value);
        if (isCopyProbe(value) || isCopyProbe(text2)) return "";
        if (!text2 || text2.length < 2 || text2.length > 5e4) return "";
        if (/^(?:copy|copied|复制|已复制|share|link)$/i.test(text2)) return "";
        if (/^(?:https?:\/\/|mailto:|#)\S{1,240}$/i.test(text2)) return "";
        if (/Simple Chat Hub|Summary Panel|pages checked,|No userscript messages found/i.test(text2)) return "";
        return /[A-Za-z0-9\u4e00-\u9fff]/.test(text2) ? text2 : "";
      };
      const stripUserPromptPrefix = (value, expected) => {
        const text2 = cleanCopied(value);
        const prompt = cleanCopied(expected);
        const promptKey = compact(prompt);
        if (!text2 || !promptKey) return text2;
        if (compact(text2) === promptKey) return "";
        if (text2.toLowerCase().startsWith(prompt.toLowerCase())) {
          const stripped = cleanCopied(text2.slice(prompt.length));
          if (stripped && compact(stripped) !== promptKey) return stripped;
        }
        const lines = text2.split("\n").map((line) => line.trim()).filter(Boolean);
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
        return text2;
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
        for (const copy2 of qsa2(controlSelector, root).filter(messageCopyControl).sort(order)) {
          const action = actionContext(copy2);
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
          let text2 = useful(raw);
          if (action.role === "assistant") {
            text2 = stripUserPromptPrefix(text2, lastUser2);
            if (lastUser2 && compact(text2) === compact(lastUser2)) text2 = "";
          }
          if (text2 && (action.role === "user" ? text2.length <= 12e3 : text2.length >= 2)) return text2;
          await escapeMenus();
        }
        return "";
      };
      const out = [];
      let lastUser = "";
      for (const action of messageActions().slice(-24)) {
        const text2 = await copyActionText(action, action.role === "assistant" ? lastUser : "");
        if (!text2) continue;
        out.push({ role: action.role, text: text2 });
        if (action.role === "user") lastUser = text2;
        if (out.length >= 12) break;
        await api.sleep(80);
      }
      const merged = api.merge(out);
      return merged.some((item) => item.role === "user") && merged.some((item) => item.role === "assistant") ? merged : [];
    };
    scripts["grok-dairoot.js"] = scripts["grok-dairoot"];
    scripts["kagi"] = async function(api) {
      const normalize2 = (value) => api.normalize(String(value || ""));
      const root = api.qs('main,[role="main"]') || document.body || document.documentElement;
      const qsa2 = (selector, scope = document) => {
        try {
          return api.qsa(selector, scope || document, { all: true });
        } catch (error) {
          return [];
        }
      };
      const visible2 = (node) => {
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
      const meta = (node) => normalize2([
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
      const internalTool2 = (button) => {
        try {
          return !!api.closest(button, "nav,aside,header,footer,form,input,textarea,select,[contenteditable=true],pre,code,table,kbd,samp,[data-language]");
        } catch (error) {
          return false;
        }
      };
      const referenceOnly = (value) => {
        const text2 = normalize2(value);
        if (/^\s*(?:References|Sources|Citations|引用|来源|参考)\b/i.test(text2)) return true;
        if (/^\s*\(?\d+\s+total\)?\s*$/i.test(text2)) return true;
        if (/^\s*(?:https?:\/\/|[\w.-]+\.[a-z]{2,})(?:\s+\d+%)?\s*$/i.test(text2)) return true;
        return false;
      };
      const useful = (value) => {
        const text2 = normalize2(value);
        if (!text2 || text2.length < 2 || text2.length > 5e4) return "";
        if (/^(?:copy|copied|copy message|复制|已复制|拷贝)$/i.test(text2)) return "";
        if (referenceOnly(text2)) return "";
        return text2;
      };
      const buttons = qsa2("button,[role=button]", root).filter((button) => visible2(button) && !internalTool2(button) && messageCopyButton(button) && !referenceCopyButton(button)).sort(order);
      const out = [];
      const seen = /* @__PURE__ */ new Set();
      for (const button of buttons.slice(0, 24)) {
        const role = out.length % 2 === 0 ? "user" : "assistant";
        const text2 = useful(await api.copy(button, {
          resetClipboardBeforeCopy: true,
          acceptUnchangedClipboard: false,
          copyTimeoutMs: 3600,
          copyPollMs: 50,
          copyCaptureGraceMs: 320
        }));
        if (!text2) continue;
        const key = role + "\n" + text2.toLowerCase().replace(/\s+/g, "");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ role, text: text2 });
        await api.sleep(80);
      }
      const merged = api.merge(out);
      return merged.some((item) => item.role === "user") && merged.some((item) => item.role === "assistant") ? merged : [];
    };
    scripts["kagi.js"] = scripts["kagi"];
    scripts["notion"] = async function(api) {
      const normalize2 = (value) => api.normalize(String(value || ""));
      const qsa2 = (selector, root2 = document) => {
        try {
          return api.qsa(selector, root2, { all: true });
        } catch (error) {
          return [];
        }
      };
      const closest2 = (element, selector) => {
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
      const meta = (element) => normalize2([
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
      const roots = qsa2("#notion-app,main,[role=main]", document).filter(layoutVisible);
      const root = roots.find((element) => !closest2(element, "nav,aside,header,footer")) || roots[0] || document;
      const roleOfButton = (button) => {
        const label = meta(button);
        if (/\bcopy\s+(?:response|answer)\b|复制(?:回复|回答|响应)/i.test(label)) return "assistant";
        if (/\bcopy\s+(?:text|message|prompt)\b|复制(?:文本|消息|提示词|问题)/i.test(label)) return "user";
        return "";
      };
      const isCopyTurnButton = (button) => layoutVisible(button) && roleOfButton(button) && !closest2(button, "nav,aside,header,footer,form,input,textarea,select,[contenteditable=true],pre,code,table,kbd,samp,[data-language]");
      const useful = (value) => {
        const text2 = normalize2(value).replace(/^(?:Copied to clipboard|Response copied to clipboard|Right click and copy the link above)\.?$/i, "").trim();
        if (!text2 || /^(?:copy|copied|copy text|copy response|复制|已复制)$/i.test(text2)) return "";
        if (/^(?:https?:\/\/|mailto:|#)\S{1,240}$/i.test(text2)) return "";
        return text2;
      };
      const structured = (messages) => Array.isArray(messages) && messages.some((item) => item.role === "user") && messages.some((item) => item.role === "assistant");
      const cleanLine = (value) => normalize2(value).replace(/^[-•]\s*/, "").replace(/\s+/g, " ").trim();
      const isChromeLine = (line) => /^(?:Notion AI|\/|history|Delete, rename, and more…?|Give context|Settings|Gemini\s+\d|Do anything with AI\.{0,3}|Ask anything|Response copied to clipboard|Copied to clipboard|Loading\.?)$/i.test(line);
      const isComposerLine = (line) => /^(?:Do anything with AI\.{0,3}|Ask anything|Give context|Settings|Gemini\s+\d|Start voice recording|Submit AI message|Response copied to clipboard|Copied to clipboard)$/i.test(line);
      const isMetaLine = (line) => /^(?:\d+\s*steps?|Today|Yesterday|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2}(?:,\s*\d{4})?)$/i.test(line);
      const trimPromptMeta = (line) => cleanLine(line).replace(/\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2}(?:,\s*\d{4})?$/i, "").replace(/\s+(?:Today|Yesterday)$/i, "").trim();
      const likelyPrompt = (line) => /[?？]$|^(?:介绍|搜索|请|帮|写|总结|解释|翻译|生成|分析|列出|查找|Tell|What|How|Why|Please|Search|Summarize|Explain|Write)\b/i.test(line);
      const notionDomTextFallback = () => {
        const raw = normalize2(api.text(root) || root.innerText || root.textContent || "");
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
        const assistant = normalize2(lines.slice(answerStart).filter((line) => line !== lines[promptIndex] && line !== user && !isChromeLine(line)).join("\n"));
        if (user.length < 2 || assistant.length < 20) return [];
        return [
          { role: "user", content: user },
          { role: "assistant", content: assistant }
        ];
      };
      const turns = [];
      const seen = /* @__PURE__ */ new Set();
      const buttons = qsa2("button,[role=button]", root).filter(isCopyTurnButton).sort(order).slice(0, 48);
      for (const button of buttons) {
        const role = roleOfButton(button);
        if (role !== "user" && role !== "assistant") continue;
        api.reveal(button);
        await api.sleep(120);
        const text2 = useful(await api.copy(button, {
          resetClipboardBeforeCopy: true,
          acceptUnchangedClipboard: false,
          copyTimeoutMs: 6e3,
          copyPollMs: 40,
          copyCaptureGraceMs: 300
        }));
        if (text2) {
          const key = role + "\n" + text2.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            turns.push({ role, content: text2 });
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
      const qsa2 = (selector, root = document) => {
        try {
          return api.qsa(selector, root, { all: true });
        } catch (error) {
          return [];
        }
      };
      const closest2 = (element, selector) => {
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
      const iconMeta = (element) => normalizeMeta([element, ...qsa2("svg,use,path,rect,[data-icon],[class]", element).slice(0, 40)].map((node) => [
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
        const text2 = normalizeMeta(wrapper.innerText || wrapper.textContent || "");
        return /^Lobe AI\b/i.test(text2) ? "assistant" : "user";
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
        const owner = closest2(button, wrapperSelector);
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
        if (closest2(button, 'pre,code,table,kbd,samp,a[href],[class*="code" i],[class*="table" i],[data-code-block]')) return false;
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
        if (closest2(button, '[role=toolbar],.message-actions,[class*="action" i],[class*="toolbar" i]')) score -= 80;
        if (!isLaidOut(button)) score += 120;
        const text2 = normalizeMeta(button.innerText || button.textContent || "");
        if (text2.length > 28) score += 120;
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
            for (const button of qsa2(selector, scope)) {
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
        const text2 = cleanCopied(value);
        if (!text2 || /^(?:copy|copied|copy text|copy response|复制|已复制|拷贝)$/i.test(text2)) return "";
        if (/^(?:https?:\/\/|mailto:|#)\S{1,240}$/i.test(text2)) return "";
        return text2;
      };
      const collectWrappers = () => qsa2(wrapperSelector, document).filter(isLaidOut).filter((element, index, list) => !list.some((other, otherIndex) => otherIndex !== index && other.contains(element))).sort(order);
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
      const qsa2 = (sel, root = document) => {
        try {
          return api.qsa(sel, root, { all: true });
        } catch {
          return [];
        }
      };
      const qs2 = (sel, root = document) => {
        try {
          return api.qs(sel, root);
        } catch {
          return null;
        }
      };
      const closest2 = (el, sel) => {
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
        const root = closest2(node, wrapperSelector) || node;
        if (root && !roots.includes(root)) roots.push(root);
      };
      qsa2('[data-element-id="user-message"],[data-element-id="response-block"]', document).forEach(addRoot);
      qsa2(wrapperSelector, document).forEach((root) => {
        if (qs2('[data-element-id="user-message"],[data-element-id="response-block"]', root) && !roots.includes(root)) roots.push(root);
      });
      const opts = { copyButtonSelector: '[data-element-id="copy-message-button"]', copyButtonPattern: "copy-message-button|clipboard|copy", copyButtonIconFallback: false, copyButtonExcludePattern: "Copy code|Open in CodePen|Regenerate|List some more", copyTextExcludePattern: "^(Copy code|Open in CodePen|Regenerate|List some more)$", copyMenu: false, resetClipboardBeforeCopy: true, acceptUnchangedClipboard: false, copyTimeoutMs: 7e3, copyPollMs: 40, copyCaptureGraceMs: 260, matchMode: "anyUseful" };
      const sameTurn = (button, turn) => {
        const owner = closest2(button, wrapperSelector);
        if (owner) return owner === turn || turn.contains(owner) || owner.contains(turn);
        if (turn.contains(button)) return true;
        try {
          const br = button.getBoundingClientRect(), tr = turn.getBoundingClientRect();
          return br.width >= 0 && br.height >= 0 && tr.width && tr.height && br.bottom >= tr.top - 48 && br.top <= tr.bottom + 96 && br.right >= tr.left - 160 && br.left <= tr.right + 160;
        } catch {
          return false;
        }
      };
      const isBadButton = (button) => closest2(button, "pre,code,[data-language],table,kbd,samp") || /Copy code|Open in CodePen|Regenerate|List some more/i.test(norm(button.innerText || button.textContent || ""));
      const findButtons = async (turn) => {
        api.reveal(turn);
        await api.sleep(220);
        let buttons = qsa2('[data-element-id="copy-message-button"]', turn).filter(laidOut);
        if (!buttons.length) buttons = qsa2('[data-element-id="copy-message-button"]', document).filter((button) => sameTurn(button, turn) && laidOut(button));
        return buttons.filter((button) => !isBadButton(button)).sort(order);
      };
      for (const turn of roots.sort(order)) {
        const user = qs2('[data-element-id="user-message"]', turn);
        const assistant = qs2('[data-element-id="response-block"]', turn);
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
    Object.defineProperty(scripts, "runtimeVersion", { value: "2026.07.15.7" });
    return scripts;
  }

  // content-src/shared/summary-runtime.js
  var summary_runtime_exports = {};
  __export(summary_runtime_exports, {
    activateElement: () => activateElement,
    buttonText: () => buttonText,
    classText: () => classText,
    cleanCaptured: () => cleanCaptured,
    closest: () => closest,
    compareText: () => compareText,
    conversationCopyButtons: () => conversationCopyButtons,
    copy: () => copy,
    copyBridgeRequest: () => copyBridgeRequest,
    copyButtonRole: () => copyButtonRole,
    copyFirst: () => copyFirst,
    copyId: () => copyId,
    copyLooksUseful: () => copyLooksUseful,
    copyMatches: () => copyMatches,
    elementOrder: () => elementOrder,
    extractCopySequence: () => extractCopySequence,
    extractHoverNativeCopyConversation: () => extractHoverNativeCopyConversation,
    extractNativeCopyConversation: () => extractNativeCopyConversation,
    extractTurns: () => extractTurns,
    fallbackRole: () => fallbackRole,
    hasUserAndAssistant: () => hasUserAndAssistant,
    hoverCopyAddAnchor: () => hoverCopyAddAnchor,
    hoverCopyAnchorRole: () => hoverCopyAnchorRole,
    hoverCopyBadButton: () => hoverCopyBadButton,
    hoverCopyCandidateButtons: () => hoverCopyCandidateButtons,
    hoverCopyMessageAnchors: () => hoverCopyMessageAnchors,
    hoverCopyRect: () => hoverCopyRect,
    hoverCopySmallIconButton: () => hoverCopySmallIconButton,
    internalCopyScope: () => internalCopyScope,
    internalTool: () => internalTool,
    isCopyProbeText: () => isCopyProbeText,
    isNativeCopyButton: () => isNativeCopyButton,
    matches: () => matches,
    merge: () => merge,
    nativeCopyDedup: () => nativeCopyDedup,
    nodeTextForCopy: () => nodeTextForCopy,
    normalize: () => normalize,
    pageLogoUrl: () => pageLogoUrl,
    pageMeta: () => pageMeta,
    pageSummaryRequest: () => pageSummaryRequest,
    pageSummaryRuntimeState: () => pageSummaryRuntimeState,
    pushMessage: () => pushMessage,
    qs: () => qs,
    qsa: () => qsa,
    reveal: () => reveal,
    sleep: () => sleep,
    svgSignature: () => svgSignature,
    text: () => text,
    toRegex: () => toRegex,
    userscriptButtonOk: () => userscriptButtonOk,
    userscriptCloseMenus: () => userscriptCloseMenus,
    userscriptCopyAccepted: () => userscriptCopyAccepted,
    userscriptCopyRoots: () => userscriptCopyRoots,
    userscriptFindCopyButtons: () => userscriptFindCopyButtons,
    userscriptFindMenuButtons: () => userscriptFindMenuButtons,
    userscriptLooksLikeCopyIcon: () => userscriptLooksLikeCopyIcon,
    userscriptMeta: () => userscriptMeta,
    userscriptOpenCopyButtons: () => userscriptOpenCopyButtons,
    userscriptRole: () => userscriptRole,
    visible: () => visible
  });
  var COPY_SOURCE = NATIVE_COPY_SOURCE;
  var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  var normalize = (value) => String(value || "").replace(/\u00a0/g, " ").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  function visible(el) {
    if (!el?.getBoundingClientRect) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
  }
  function qsa(selector, root = document, options = {}) {
    try {
      const result = Array.from(root.querySelectorAll(selector));
      return options.all === false ? result.slice(0, 1) : result;
    } catch {
      return [];
    }
  }
  function qs(selector, root = document) {
    try {
      return root.querySelector(selector);
    } catch {
      return null;
    }
  }
  function closest(el, selector) {
    try {
      return el?.closest?.(selector) || null;
    } catch {
      return null;
    }
  }
  function text(el) {
    if (!el) return "";
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value || "";
    return el.innerText || el.textContent || "";
  }
  function reveal(el) {
    if (!el) return;
    try {
      el.scrollIntoView({ block: "center", inline: "nearest" });
      for (const type of ["pointerover", "pointermove", "mouseover", "mousemove"]) {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      }
    } catch {
    }
  }
  function merge(messages) {
    const out = [];
    for (const message of messages || []) {
      const role = String(message?.role || "assistant").toLowerCase();
      const value = cleanCaptured(message?.text || message?.content || "");
      if (!value) continue;
      const previous = out[out.length - 1];
      if (previous && previous.role === role) previous.text = normalize(`${previous.text}

${value}`);
      else out.push({ role, text: value });
    }
    return out;
  }
  function toRegex(value) {
    if (!value) return null;
    if (value instanceof RegExp) return value;
    try {
      return new RegExp(String(value), "i");
    } catch {
      return null;
    }
  }
  function compareText(value) {
    return normalize(value).toLowerCase().replace(/\s+/g, "");
  }
  function cleanCaptured(value) {
    return normalize(String(value || "").replace(/Show more\s*Show less/gi, "").replace(/^\s*(Show more|Show less|显示更多|收起)\s*$/gim, ""));
  }
  function pageLogoUrl() {
    const candidates = qsa("link[rel][href]", document).map((link, index) => {
      const rel = normalize(link.getAttribute?.("rel") || "").toLowerCase();
      if (!/(^|\s)(icon|shortcut icon|apple-touch-icon|mask-icon)(\s|$)/.test(rel)) return null;
      const href = link.getAttribute?.("href") || "";
      let url = "";
      try {
        url = href ? new URL(href, location.href).href : "";
      } catch {
        return null;
      }
      if (!/^https?:\/\//i.test(url)) return null;
      const sizes = normalize(link.getAttribute?.("sizes") || "");
      const sizeScore = sizes.includes("32") ? 0 : sizes.includes("16") ? 1 : sizes.includes("180") ? 2 : 3;
      const type = normalize(link.getAttribute?.("type") || "").toLowerCase();
      const relScore = rel.includes("apple-touch-icon") ? 4 : rel.includes("mask-icon") ? 5 : rel.includes("icon") ? 0 : 3;
      const typeScore = type.includes("png") || type.includes("x-icon") || type.includes("icon") ? 0 : 1;
      return { url, score: relScore * 100 + sizeScore * 10 + typeScore, index };
    }).filter(Boolean).sort((a, b) => a.score - b.score || a.index - b.index);
    return candidates[0]?.url || "";
  }
  function pageMeta() {
    return {
      href: location.href,
      title: normalize(document.title || ""),
      logoUrl: pageLogoUrl()
    };
  }
  function copyLooksUseful(value) {
    const next = cleanCaptured(value);
    return Boolean(next && next.length >= 2 && next.length <= 5e4 && !/^(copy|copied|复制|已复制|share|link)$/i.test(next) && !/^(https?:\/\/|mailto:|#)[^\s]{1,240}$/i.test(next));
  }
  function hasUserAndAssistant(messages) {
    return Array.isArray(messages) && messages.some((item) => item?.role === "user") && messages.some((item) => item?.role === "assistant");
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
  function classText(el) {
    const value = el?.getAttribute?.("class") || el?.className || "";
    return typeof value === "string" ? value : value?.baseVal || "";
  }
  function buttonText(el) {
    if (!el) return "";
    const labelledBy = String(el.getAttribute?.("aria-labelledby") || "").split(/\s+/).map((id) => id && document.getElementById(id)).filter(Boolean).map((node) => node.innerText || node.textContent || "").join(" ");
    return normalize([
      el.getAttribute?.("aria-label"),
      labelledBy,
      el.getAttribute?.("aria-description"),
      el.getAttribute?.("title"),
      el.getAttribute?.("data-tooltip"),
      el.getAttribute?.("data-testid"),
      el.getAttribute?.("data-test-id"),
      el.innerText || el.textContent || ""
    ].filter(Boolean).join(" "));
  }
  function userscriptMeta(el) {
    if (!el) return "";
    return normalize([
      el.tagName,
      classText(el),
      el.getAttribute?.("role"),
      buttonText(el),
      el.getAttribute?.("data-message-author-role")
    ].filter(Boolean).join(" "));
  }
  function matches(el, selector) {
    try {
      return Boolean(el?.matches?.(selector));
    } catch {
      return false;
    }
  }
  function isNativeCopyButton(el) {
    return /(?:^|\b)(copy|copied|clipboard)(?:\b|$)|复制|已复制|拷贝|content_copy|copy_all|file_copy/i.test(userscriptMeta(el));
  }
  function svgSignature(el) {
    return normalize([el, ...qsa("svg,path,rect,line,polyline,polygon,use,img,[data-icon],[class]", el).slice(0, 80)].map((node) => [
      classText(node),
      node.getAttribute?.("data-icon"),
      node.getAttribute?.("aria-label"),
      node.getAttribute?.("title"),
      node.getAttribute?.("alt"),
      node.getAttribute?.("src"),
      node.getAttribute?.("href"),
      node.getAttribute?.("xlink:href"),
      node.getAttribute?.("viewBox"),
      node.getAttribute?.("d"),
      node.getAttribute?.("width"),
      node.getAttribute?.("height")
    ].filter(Boolean).join(" ")).join(" ")).toLowerCase();
  }
  function userscriptLooksLikeCopyIcon(el) {
    const signature = svgSignature(el);
    if (!signature) return false;
    if (/copy|clipboard|content_copy|copy_all|file_copy|lucide-copy|tabler-icon-copy|copy[-_ ]?(icon|line|fill)/i.test(signature)) return true;
    const rects = qsa("rect", el).filter((rect) => Number(rect.getAttribute("width") || 0) >= 7 && Number(rect.getAttribute("height") || 0) >= 7);
    return rects.length >= 2;
  }
  function internalTool(el) {
    return Boolean(closest(el, "nav,header,footer,aside,form,input,textarea,select,[contenteditable=true],pre,code,table,kbd,samp,[data-language]"));
  }
  function userscriptButtonOk(el, options = {}) {
    if (!el || internalTool(el)) return false;
    const meta = userscriptMeta(el);
    const exclude = toRegex(options.copyButtonExcludePattern);
    if (exclude?.test(meta)) return false;
    const include = toRegex(options.copyButtonPattern);
    if (include) return include.test(meta) || options.copyButtonIconFallback !== false && userscriptLooksLikeCopyIcon(el);
    return isNativeCopyButton(el) || options.copyButtonIconFallback !== false && userscriptLooksLikeCopyIcon(el);
  }
  function userscriptCopyRoots(el, options = {}) {
    const roots = [];
    const add = (node) => {
      if (node?.nodeType === 1 && node !== document.documentElement && !roots.includes(node)) roots.push(node);
    };
    add(el);
    if (options.expanded !== false) {
      for (let node = el, depth = 0; node && node !== document.body && depth < 6; node = node.parentElement, depth += 1) {
        add(node);
        add(node.previousElementSibling);
        add(node.nextElementSibling);
      }
    }
    return roots;
  }
  function userscriptFindCopyButtons(root = document.body, options = {}) {
    let rootRect = null;
    try {
      rootRect = root?.getBoundingClientRect?.();
    } catch {
    }
    const selector = String(options.copyButtonSelector || "button,[role=button],[role=menuitem]").trim();
    const seen = /* @__PURE__ */ new Set();
    const scored = [];
    const distanceScore = (candidate) => {
      if (!rootRect?.width || !rootRect?.height || !candidate?.getBoundingClientRect) return 0;
      let rect = null;
      try {
        rect = candidate.getBoundingClientRect();
      } catch {
      }
      return rect?.width && rect?.height ? Math.abs(rect.top - rootRect.bottom) * 20 + Math.abs(rect.left - rootRect.left) : 0;
    };
    let order = 0;
    const add = (candidate, score) => {
      if (!candidate || seen.has(candidate)) return;
      if (!matches(candidate, selector) && candidate !== root) return;
      seen.add(candidate);
      if (userscriptButtonOk(candidate, options)) scored.push({ button: candidate, score: score + distanceScore(candidate) });
    };
    for (const copyRoot of userscriptCopyRoots(root, options)) {
      for (const candidate of [copyRoot, ...qsa(selector, copyRoot, { all: true })]) add(candidate, order++);
    }
    if (!scored.length && options.expanded !== false && rootRect?.width && rootRect?.height) {
      for (const candidate of qsa(selector, document, { all: true })) {
        if (seen.has(candidate) || internalTool(candidate)) continue;
        let rect = null;
        try {
          rect = candidate.getBoundingClientRect();
        } catch {
        }
        if (!rect?.width || !rect?.height || rect.bottom < rootRect.top - 260 || rect.top > rootRect.bottom + 520) continue;
        add(candidate, 1e6 + order++);
      }
    }
    return scored.sort((a, b) => a.score - b.score || elementOrder(a.button, b.button)).map((item) => item.button);
  }
  function userscriptFindMenuButtons(root = document.body, options = {}) {
    const selector = String(options.copyMenuButtonSelector || "button[aria-haspopup],button[aria-expanded],[role=button][aria-haspopup],button,[role=button]").trim();
    const include = toRegex(options.copyMenuButtonPattern) || /(more|menu|actions|options|overflow|ellipsis|kebab|three dots|更多|操作|菜单|选项|•••|\.\.\.)/i;
    return qsa(selector, root, { all: true }).filter((button) => visible(button) && !internalTool(button) && include.test(userscriptMeta(button))).sort(elementOrder);
  }
  function userscriptOpenCopyButtons(options = {}) {
    const selector = String(options.copyButtonSelector || "button,[role=button],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio]").trim();
    return qsa(selector, document, { all: true }).filter((button) => visible(button) && userscriptButtonOk(button, options)).sort(elementOrder);
  }
  function userscriptCloseMenus() {
    try {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
    } catch {
    }
  }
  function copyMatches(copied, expected) {
    const copiedText = compareText(copied);
    const expectedText = compareText(expected);
    if (!expectedText) return true;
    if (!copiedText) return false;
    if (copiedText === expectedText || copiedText.includes(expectedText)) return true;
    if (expectedText.includes(copiedText) && copiedText.length >= Math.min(expectedText.length * 0.75, 240)) return true;
    return false;
  }
  function userscriptCopyAccepted(copied, expected, role, options = {}) {
    const value = cleanCaptured(copied);
    if (!copyLooksUseful(value)) return "";
    const exclude = toRegex(options.copyTextExcludePattern);
    if (exclude?.test(value)) return "";
    if (options.matchMode === "anyUseful" || !expected) return value;
    return copyMatches(value, expected) ? value : "";
  }
  function copyBridgeRequest(action, id, data = {}, timeout = 1e3) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMessage, true);
        resolve(null);
      }, timeout);
      const onMessage = (event) => {
        const message = event.data;
        if (message?.source === COPY_SOURCE && message.id === id && message.type === "response" && message.action === action) {
          clearTimeout(timer);
          window.removeEventListener("message", onMessage, true);
          resolve(message.data || null);
        }
      };
      window.addEventListener("message", onMessage, true);
      window.postMessage({ source: COPY_SOURCE, type: "request", id, action, data }, "*");
    });
  }
  function pageSummaryRequest(config = {}) {
    return new Promise((resolve) => {
      const id = copyId();
      const ackTimeoutMs = Math.max(350, Math.min(1800, Number(config.userscriptFallbackDelayMs) || 900));
      const totalTimeoutMs = Math.max(5e3, Math.min(45e3, Number(config.userscriptTimeoutMs) || 15e3));
      let acked = false;
      let done = false;
      const cleanup = () => {
        clearTimeout(ackTimer);
        clearTimeout(totalTimer);
        window.removeEventListener("message", onMessage, true);
      };
      const finish = (result) => {
        if (done) return;
        done = true;
        cleanup();
        resolve(result);
      };
      const ackTimer = setTimeout(() => {
        if (!acked) finish({ ok: false, missing: true, messages: [], error: "Summary page-world runtime did not acknowledge the request." });
      }, ackTimeoutMs);
      const totalTimer = setTimeout(() => {
        finish({ ok: false, timeout: true, messages: [], error: "Summary page-world runtime timed out." });
      }, totalTimeoutMs);
      const onMessage = (event) => {
        const message = event.data;
        if (event.source !== window || message?.source !== PAGE_SUMMARY_SOURCE || message.id !== id || message.action !== "extract") return;
        if (message.type === "ack") {
          acked = true;
          clearTimeout(ackTimer);
          return;
        }
        if (message.type !== "response") return;
        const data = message.data || {};
        finish({
          ok: Boolean(message.ok),
          messages: Array.isArray(message.messages) ? message.messages : Array.isArray(data.messages) ? data.messages : [],
          rawMessageCount: data.rawMessageCount,
          hasUserAndAssistant: data.hasUserAndAssistant,
          error: message.error || data.error || ""
        });
      };
      window.addEventListener("message", onMessage, true);
      window.postMessage({ source: PAGE_SUMMARY_SOURCE, type: "request", action: "extract", id, data: { config } }, "*");
    });
  }
  function pageSummaryRuntimeState(timeoutMs = 900) {
    return new Promise((resolve) => {
      const id = copyId();
      let settled = false;
      const finish = (state = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage, true);
        resolve(state);
      };
      const onMessage = (event) => {
        const message = event.data;
        if (event.source !== window || message?.source !== PAGE_SUMMARY_SOURCE || message.type !== "response" || message.action !== "runtimeState" || message.id !== id) return;
        finish(message.data && typeof message.data === "object" ? message.data : null);
      };
      const timer = setTimeout(() => finish(null), Math.max(250, Math.min(1800, Number(timeoutMs) || 900)));
      window.addEventListener("message", onMessage, true);
      window.postMessage({
        source: PAGE_SUMMARY_SOURCE,
        type: "request",
        action: "runtimeState",
        id
      }, "*");
    });
  }
  function copyId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  function isCopyProbeText(value) {
    return /_?sch[\s_-]*copy[\s_-]*probe[\s_-]*[a-z0-9-]+_?/i.test(String(value || ""));
  }
  function activateElement(button) {
    button.focus?.();
    reveal(button);
    const init = { bubbles: true, cancelable: true, view: window };
    try {
      if (window.PointerEvent) {
        button.dispatchEvent(new PointerEvent("pointerdown", { ...init, pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 1 }));
        button.dispatchEvent(new PointerEvent("pointerup", { ...init, pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 0 }));
      }
    } catch {
    }
    button.dispatchEvent(new MouseEvent("mousedown", init));
    button.dispatchEvent(new MouseEvent("mouseup", init));
    button.dispatchEvent(new MouseEvent("click", init));
    button.click?.();
  }
  async function copy(button, options = {}) {
    if (!button) return "";
    const copyTimeoutMs = Math.max(300, Math.min(1e4, Number(options.copyTimeoutMs || options.timeoutMs) || 2600));
    const copyPollMs = Math.max(20, Math.min(150, Number(options.copyPollMs) || 50));
    const copyCaptureGraceMs = Math.max(80, Math.min(800, Number(options.copyCaptureGraceMs) || 240));
    const acceptUnchangedClipboard = Boolean(options.acceptUnchangedClipboard);
    const resetClipboardBeforeCopy = Boolean(options.resetClipboardBeforeCopy);
    const allowUnchangedClipboard = acceptUnchangedClipboard && !resetClipboardBeforeCopy;
    const id = copyId();
    let before = "";
    let captured = "";
    let capturedPriority = 0;
    let capturedAt = 0;
    try {
      before = normalize(await navigator.clipboard.readText());
    } catch {
    }
    const acceptsClipboardValue = (value) => value && !isCopyProbeText(value) && (value !== before || allowUnchangedClipboard);
    const onCapture = (event) => {
      const message = event.data;
      if (message?.source !== COPY_SOURCE || message.type !== "capture" || message.id !== id) return;
      const value = normalize(message.data?.text || "");
      const priority = Number(message.data?.priority) || 1;
      if (value && !isCopyProbeText(value) && priority >= capturedPriority) {
        captured = value;
        capturedPriority = priority;
        capturedAt = Date.now();
      }
    };
    window.addEventListener("message", onCapture, true);
    try {
      const bridge = await copyBridgeRequest("install", id, { timeoutMs: copyTimeoutMs }, 900);
      if (!bridge?.installed || !bridge?.hooks) return "";
      try {
        activateElement(button);
      } catch {
        try {
          button.click?.();
        } catch {
        }
      }
      for (let index = 0, max = Math.ceil(copyTimeoutMs / copyPollMs); index < max; index += 1) {
        await sleep(copyPollMs);
        if (captured && (capturedPriority >= 5 || Date.now() - capturedAt >= copyCaptureGraceMs)) break;
        try {
          const current = normalize(await navigator.clipboard.readText());
          if (acceptsClipboardValue(current)) {
            captured = current;
            capturedPriority = Math.max(capturedPriority, 6);
            break;
          }
        } catch {
        }
      }
      if (captured && !isCopyProbeText(captured)) return cleanCaptured(captured);
      try {
        const after = normalize(await navigator.clipboard.readText());
        if (acceptsClipboardValue(after)) return cleanCaptured(after);
      } catch {
      }
      return "";
    } finally {
      window.removeEventListener("message", onCapture, true);
      await copyBridgeRequest("restore", id, {}, 900);
    }
  }
  async function copyFirst(buttons, params = {}) {
    const details = params || {};
    const options = details.options || details;
    for (const button of (buttons || []).slice(0, 12)) {
      const value = userscriptCopyAccepted(await copy(button, options), details.expected, details.role, options);
      if (value) return value;
    }
    if (details.scope && options.copyMenu !== false) {
      for (const menuButton of userscriptFindMenuButtons(details.scope, options).slice(0, 8)) {
        userscriptCloseMenus();
        reveal(menuButton);
        try {
          activateElement(menuButton);
        } catch {
        }
        await sleep(180);
        const value = await copyFirst(userscriptOpenCopyButtons(options).filter((button) => button !== menuButton && !menuButton.contains(button)), details);
        userscriptCloseMenus();
        if (value) return value;
      }
    }
    return "";
  }
  function userscriptRole(el, options = {}) {
    const nodes = [el, closest(el, "[data-message-author-role]")].filter(Boolean);
    let value = "";
    const attr = String(options.roleAttribute || "").trim();
    if (attr) {
      for (const node of nodes) value += `${node.getAttribute?.(attr) || ""} `;
    }
    value += nodes.map(userscriptMeta).join(" ");
    const userPattern = toRegex(options.userRolePattern);
    const assistantPattern = toRegex(options.assistantRolePattern);
    if (userPattern?.test(value)) return "user";
    if (assistantPattern?.test(value)) return "assistant";
    const role = String(closest(el, "[data-message-author-role]")?.getAttribute?.("data-message-author-role") || "").toLowerCase();
    return role === "user" || role === "assistant" ? role : null;
  }
  function fallbackRole(index, options = {}) {
    const sequence = options.roleFallbackSequence;
    if (sequence === "userFirst") return index % 2 === 0 ? "user" : "assistant";
    if (sequence === "assistantFirst") return index % 2 === 0 ? "assistant" : "user";
    if (sequence === "userThenAssistant") return index === 0 ? "user" : "assistant";
    if (sequence === "assistantOnly") return "assistant";
    if (sequence === "userOnly") return "user";
    if (Array.isArray(sequence)) return sequence[index % sequence.length] || null;
    return null;
  }
  function pushMessage(out, role, value, seen) {
    const text2 = cleanCaptured(value);
    if (role !== "user" && role !== "assistant" || !text2) return;
    const compact = compareText(text2);
    const key = `${role}|${compact}`;
    if (seen.has(key)) return;
    const existing = out.find((item) => item.role === role && compareText(item.text) && (compareText(item.text).includes(compact) || compact.includes(compareText(item.text))));
    if (existing) {
      if (compact.length > compareText(existing.text).length) existing.text = text2;
      seen.add(key);
      return;
    }
    seen.add(key);
    out.push({ role, text: text2 });
  }
  async function extractTurns(options = {}) {
    const rootSelector = String(options.rootSelector || "body").trim() || "body";
    const messageSelector = String(options.messageSelector || "").trim();
    if (!messageSelector) return [];
    const roots = qsa(rootSelector, document, { all: true }).filter(visible);
    const searchRoots = roots.length ? roots : [document.body || document.documentElement];
    const turns = [];
    for (const root of searchRoots) {
      for (const turn of qsa(messageSelector, root, { all: true }).filter(visible)) if (!turns.includes(turn)) turns.push(turn);
    }
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    let roleIndex = 0;
    for (const turn of turns.sort(elementOrder)) {
      let role = userscriptRole(turn, options) || fallbackRole(roleIndex, options);
      if (role !== "user" && role !== "assistant") continue;
      reveal(turn);
      await sleep(80);
      const expected = text(turn);
      const copied = await copyFirst(userscriptFindCopyButtons(turn, options), { expected, role, options, scope: turn });
      if (copied) {
        pushMessage(out, role, copied, seen);
        roleIndex += 1;
      }
    }
    return merge(out);
  }
  async function extractCopySequence(options = {}) {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    const rootSelector = String(options.rootSelector || "body").trim() || "body";
    const roots = qsa(rootSelector, document, { all: true }).filter(visible);
    const searchRoots = roots.length ? roots : [document.body || document.documentElement];
    const buttons = [];
    const buttonSet = /* @__PURE__ */ new Set();
    for (const root of searchRoots) {
      for (const button of userscriptFindCopyButtons(root, { ...options, expanded: false })) {
        if (!buttonSet.has(button)) {
          buttonSet.add(button);
          buttons.push(button);
        }
      }
    }
    buttons.sort(elementOrder);
    let roleIndex = 0;
    const maxButtons = Number(options.maxButtons) || 40;
    const accept = async (button, roleHint) => {
      const role = roleHint || userscriptRole(button, options) || fallbackRole(roleIndex, options);
      if (role !== "user" && role !== "assistant") return false;
      const value = userscriptCopyAccepted(await copy(button, options), "", role, { ...options, matchMode: "anyUseful" });
      if (!value) return false;
      pushMessage(out, role, value, seen);
      roleIndex += 1;
      return true;
    };
    for (const button of buttons.slice(0, maxButtons)) await accept(button);
    if (out.length < 2 && options.copyMenu !== false) {
      for (const root of searchRoots) {
        for (const menuButton of userscriptFindMenuButtons(root, options).slice(0, Math.min(maxButtons, 16))) {
          userscriptCloseMenus();
          reveal(menuButton);
          try {
            activateElement(menuButton);
          } catch {
          }
          await sleep(180);
          const roleHint = userscriptRole(menuButton, options) || fallbackRole(roleIndex, options);
          for (const button of userscriptOpenCopyButtons(options).filter((item) => item !== menuButton && !menuButton.contains(item)).slice(0, 8)) {
            if (await accept(button, roleHint)) break;
          }
          userscriptCloseMenus();
          if (out.length >= 2) break;
        }
      }
    }
    return merge(out);
  }
  function nodeTextForCopy(node) {
    if (!node?.cloneNode) return text(node);
    try {
      const clone = node.cloneNode(true);
      clone.querySelectorAll?.("button,svg,script,style,noscript,input,textarea,select,option,form,nav,aside,footer,header").forEach((el) => el.remove());
      return normalize(clone.innerText || clone.textContent || "");
    } catch {
      return text(node);
    }
  }
  function internalCopyScope(el) {
    return Boolean(closest(el, "nav,header,footer,aside,form,input,textarea,select,[contenteditable=true],pre,code,table,kbd,samp,[data-language]"));
  }
  function copyButtonRole(button, options = {}) {
    const roleNode = closest(button, "[data-message-author-role]");
    const role = String(roleNode?.getAttribute?.("data-message-author-role") || "").toLowerCase();
    if (role === "user" || role === "assistant") return role;
    const label = buttonText(button);
    if (/(response|answer|assistant|回答|答复|回复)/i.test(label)) return "assistant";
    if (/(message|prompt|question|user|提问|消息|问题)/i.test(label)) return "user";
    const userRe = toRegex(options.copyUserContextPattern) || /(you\s+said|user\s+said|human|prompt|question|用户|你说|提问)/i;
    const assistantRe = toRegex(options.copyAssistantContextPattern) || /(assistant\s+said|assistant|answer|response|回答|回复|助手)/i;
    for (let node = button, depth = 0; node && node !== document.body && depth < 7; node = node.parentElement, depth += 1) {
      const context = normalize([
        node.getAttribute?.("aria-label"),
        node.getAttribute?.("title"),
        node.innerText || node.textContent || ""
      ].filter(Boolean).join(" "));
      if (!context || context.length > 3500) continue;
      const hasUser = userRe.test(context);
      const hasAssistant = assistantRe.test(context);
      if (hasUser && !hasAssistant) return "user";
      if (hasAssistant && !hasUser) return "assistant";
    }
    return null;
  }
  function conversationCopyButtons(root = document.body) {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    const selector = "button,[role=button],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],div[tabindex],span[role=button]";
    for (const button of qsa(selector, root || document, { all: true })) {
      if (seen.has(button) || closest(button, "nav,header,footer,form") || internalCopyScope(button)) continue;
      const meta = userscriptMeta(button);
      if (/(?:copy\s*(?:code|table|link|conversation|source|sources)|copy[-_ ]?(?:code|table|link|conversation|source|sources)|(?:link|share|history|source|sources|citation|citations|feedback|thumb|like|dislike|settings|export|docs|menu|more|notification|sidebar|regenerate|upload|voice|submit|model)|链接|分享|代码|表格|会话|历史|来源|引用|赞|踩|设置|导出|更多|菜单|通知|上传|语音|提交)/i.test(meta)) continue;
      if (!(isNativeCopyButton(button) || userscriptLooksLikeCopyIcon(button))) continue;
      seen.add(button);
      out.push(button);
    }
    return out.sort(elementOrder);
  }
  function nativeCopyDedup(a, b) {
    const left = compareText(a);
    const right = compareText(b);
    return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
  }
  function hoverCopyBadButton(button) {
    const meta = userscriptMeta(button);
    return /(?:copy\s*(?:code|table|link|conversation|source|sources)|copy[-_ ]?(?:code|table|link|conversation|source|sources)|(?:new chat|new conversation|history|sidebar|toggle sidebar|home page|open notifications|link|share|search|deepthink|send|ask|feedback|thumb|like|dislike|settings|export|docs|menu|more|notification|regenerate|upload|voice|submit|model|fullscreen|reload|close)|链接|分享|搜索|深度思考|发送|新聊天|新对话|历史|侧边栏|赞|踩|设置|导出|更多|菜单|通知|上传|语音|提交|全屏|刷新|关闭)/i.test(meta);
  }
  function hoverCopyRect(node) {
    try {
      const rect = node?.getBoundingClientRect?.();
      return rect?.width && rect?.height ? rect : null;
    } catch {
      return null;
    }
  }
  function hoverCopySmallIconButton(button) {
    const rect = hoverCopyRect(button);
    if (!rect || rect.width > 72 || rect.height > 72) return false;
    const label = buttonText(button);
    if (label && label.length > 24) return false;
    return Boolean(button.querySelector?.("svg,path,rect,use,img,i,[class]"));
  }
  function hoverCopyCandidateButtons(anchor, options = {}) {
    const found = [];
    const seen = /* @__PURE__ */ new Set();
    const rootRect = hoverCopyRect(anchor);
    const selector = "button,[role=button],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],div[tabindex],span[role=button]";
    const add = (button, base) => {
      if (!button || seen.has(button) || internalCopyScope(button) || closest(button, "nav,header,footer,form,input,textarea,select,[contenteditable=true]")) return;
      seen.add(button);
      if (hoverCopyBadButton(button)) return;
      const rect = hoverCopyRect(button);
      if (!rect) return;
      let score = base;
      const copyish = isNativeCopyButton(button) || userscriptLooksLikeCopyIcon(button);
      if (!copyish && !hoverCopySmallIconButton(button)) return;
      if (rootRect) {
        if (rect.bottom < rootRect.top - 220 || rect.top > rootRect.bottom + 420) return;
        score += Math.abs(rect.top - rootRect.bottom) * 12 + Math.abs(rect.left - rootRect.left);
      }
      score += copyish ? 0 : 12e3;
      found.push({ button, score });
    };
    for (const button of userscriptFindCopyButtons(anchor, { ...options, expanded: true })) add(button, -2e4);
    let order = 0;
    for (const scope of userscriptCopyRoots(anchor, { expanded: true })) {
      for (const button of qsa(selector, scope, { all: true })) add(button, order++);
    }
    if (rootRect) {
      for (const button of qsa(selector, document, { all: true })) {
        const rect = hoverCopyRect(button);
        if (!rect || rect.bottom < rootRect.top - 220 || rect.top > rootRect.bottom + 420) continue;
        add(button, 5e4 + order++);
      }
    }
    return found.sort((a, b) => a.score - b.score || elementOrder(a.button, b.button)).map((item) => item.button);
  }
  function hoverCopyAnchorRole(anchor, index) {
    const roleNode = closest(anchor, "[data-message-author-role]");
    const role = String(roleNode?.getAttribute?.("data-message-author-role") || anchor?.getAttribute?.("data-message-author-role") || "").toLowerCase();
    if (role === "user" || role === "assistant") return role;
    const meta = normalize([
      classText(anchor),
      anchor?.getAttribute?.("data-testid"),
      anchor?.getAttribute?.("aria-label")
    ].filter(Boolean).join(" "));
    if (/assistant|answer|response|bot|ai|model|ds-assistant/i.test(meta)) return "assistant";
    if (/user|human|question|query|ds-user/i.test(meta)) return "user";
    return index % 2 === 0 ? "user" : "assistant";
  }
  function hoverCopyAddAnchor(list, node) {
    if (!node || node.nodeType !== 1 || list.includes(node) || closest(node, "nav,header,footer,form,input,textarea,select,[contenteditable=true]")) return;
    const rect = hoverCopyRect(node);
    if (!rect || rect.width < 20 || rect.height < 8) return;
    const value = nodeTextForCopy(node);
    if (!value || value.length < 2 || value.length > 6e4) return;
    if (/^(?:copy|copied|edit|share|like|dislike|ask anything|message|send|search)$/i.test(value)) return;
    list.push(node);
  }
  function hoverCopyMessageAnchors(root = document.body) {
    const anchors = [];
    for (const assistant of qsa(".ds-assistant-message-main-content", root || document, { all: true })) {
      const box = closest(assistant, ".ds-message") || assistant;
      let prev = box?.previousElementSibling;
      for (let index = 0; prev && index < 5; prev = prev.previousElementSibling, index += 1) {
        if (nodeTextForCopy(prev)) {
          hoverCopyAddAnchor(anchors, prev);
          break;
        }
      }
      hoverCopyAddAnchor(anchors, assistant);
    }
    for (const selector of ["[data-message-author-role]", "article", "[data-testid*=message]", "[data-testid*=conversation]", "[class*=message]", "[class*=Message]", "[class*=response]", "[class*=Response]", "[class*=prose]", "main section", "main div"]) {
      for (const node of qsa(selector, root || document, { all: true })) hoverCopyAddAnchor(anchors, node);
      if (anchors.length > 120) break;
    }
    const textCache = /* @__PURE__ */ new Map();
    const cachedText = (node) => {
      if (!textCache.has(node)) textCache.set(node, nodeTextForCopy(node));
      return textCache.get(node) || "";
    };
    const specific = anchors.filter((node) => {
      const value = cachedText(node);
      if (!value) return false;
      return !anchors.some((other) => other !== node && node.contains?.(other) && cachedText(other).length >= Math.min(value.length * 0.55, 500) && hoverCopyRect(other));
    });
    return specific.sort((a, b) => {
      const ar = hoverCopyRect(a);
      const br = hoverCopyRect(b);
      return ar && br ? ar.top - br.top || ar.left - br.left : elementOrder(a, b);
    }).filter((node, index, list) => !list.slice(0, index).some((prev) => nativeCopyDedup(cachedText(prev), cachedText(node))));
  }
  async function extractHoverNativeCopyConversation(root = document.body) {
    const options = {
      copyButtonSelector: "button,[role=button],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],div[tabindex],span[role=button]",
      copyButtonPattern: "copy|copied|clipboard|复制|已复制|拷贝",
      copyButtonExcludePattern: "copy\\s*(?:code|table|link|conversation|source|sources)|copy[-_ ]?(?:code|table|link|conversation|source|sources)|(?:link|share|history|source|sources|citation|citations|feedback|thumb|like|dislike|settings|export|docs|menu|more|notification|sidebar|regenerate|upload|voice|submit|model)|链接|分享|代码|表格|会话|历史|来源|引用|赞|踩|设置|导出|更多|菜单|通知|上传|语音|提交",
      copyButtonIconFallback: true,
      expanded: true,
      roleFallbackSequence: "userFirst",
      matchMode: "anyUseful",
      resetClipboardBeforeCopy: true,
      acceptUnchangedClipboard: false,
      copyTimeoutMs: 6500,
      copyPollMs: 40,
      copyCaptureGraceMs: 380
    };
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    let roleIndex = 0;
    for (const anchor of hoverCopyMessageAnchors(root).slice(0, 60)) {
      const role = hoverCopyAnchorRole(anchor, roleIndex);
      const expected = nodeTextForCopy(anchor);
      if (role !== "user" && role !== "assistant") continue;
      reveal(anchor);
      await sleep(180);
      for (const button of hoverCopyCandidateButtons(anchor, options).slice(0, 14)) {
        const copied = await copy(button, options);
        const value = userscriptCopyAccepted(copied, expected, role, options);
        if (value) {
          pushMessage(out, role, value, seen);
          roleIndex += 1;
          break;
        }
        userscriptCloseMenus();
        await sleep(80);
      }
      if (hasUserAndAssistant(out)) break;
    }
    const messages = merge(out);
    return hasUserAndAssistant(messages) ? messages : null;
  }
  async function extractNativeCopyConversation(root = document.body) {
    let buttons = conversationCopyButtons(root || document.body);
    if (buttons.length < 2) {
      const hovered = await extractHoverNativeCopyConversation(root || document.body);
      if (hovered) return hovered;
      buttons = conversationCopyButtons(root || document.body);
    }
    if (buttons.length < 2) return null;
    const seenText = [];
    const items = [];
    const copyOptions = {
      resetClipboardBeforeCopy: true,
      acceptUnchangedClipboard: false,
      copyTimeoutMs: 6e3,
      copyPollMs: 40,
      copyCaptureGraceMs: 300
    };
    for (const button of buttons.slice(0, 16)) {
      try {
        button.scrollIntoView?.({ block: "center", inline: "nearest" });
      } catch {
      }
      reveal(button);
      const copied = cleanCaptured(await copy(button, copyOptions));
      if (!copyLooksUseful(copied) || seenText.some((item) => nativeCopyDedup(item, copied))) continue;
      seenText.push(copied);
      items.push({ role: copyButtonRole(button), text: copied });
    }
    if (items.length < 2) {
      const hovered = await extractHoverNativeCopyConversation(root || document.body);
      return hovered || null;
    }
    let fallback = "user";
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const item of items) {
      let role = item.role;
      if (role !== "user" && role !== "assistant") role = fallback;
      fallback = role === "user" ? "assistant" : "user";
      pushMessage(out, role, item.text, seen);
    }
    const firstUser = out.findIndex((item) => item.role === "user");
    const messages = merge(firstUser > 0 ? out.slice(firstUser) : out);
    return hasUserAndAssistant(messages) ? messages : null;
  }

  // content-src/shared/runtime-registry.js
  function validName(name) {
    const value = String(name || "").trim();
    if (!value) throw new TypeError("Runtime name is required");
    return value;
  }
  function runtimeRegistry(target = globalThis) {
    const current = target[RUNTIME_REGISTRY_KEY];
    if (current?.abiVersion === RUNTIME_REGISTRY_ABI_VERSION && typeof current.register === "function") return current;
    const entries = /* @__PURE__ */ new Map();
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
        const entry = entries.get(key);
        if (!entry) return false;
        entries.delete(key);
        try {
          entry.dispose?.(String(reason || "invalidated"));
        } catch {
        }
        return true;
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

  // content-src/summary-userscripts-main.js
  function installSummaryMainRuntime() {
    const PROTOCOL = CONTENT_PROTOCOL;
    const runtimes = runtimeRegistry(window);
    const summaryRunners = runtimes.register("summary-runners", {
      version: PROTOCOL.CONTENT_BRIDGE_VERSION,
      api: Object.freeze({ scripts: createSummaryRunnerRegistry() })
    });
    const PAGE_SUMMARY_SOURCE2 = PROTOCOL.PAGE_SUMMARY_SOURCE;
    const {
      sleep: sleep2,
      normalize: normalize2,
      qsa: qsa2,
      qs: qs2,
      closest: closest2,
      visible: visible2,
      text: text2,
      buttonText: buttonText2,
      reveal: reveal2,
      merge: merge2,
      hasUserAndAssistant: hasUserAndAssistant2,
      copy: copy2,
      copyFirst: copyFirst2,
      extractCopySequence: extractCopySequence2,
      extractNativeCopyConversation: extractNativeCopyConversation2,
      extractTurns: extractTurns2,
      userscriptFindCopyButtons: userscriptFindCopyButtons2
    } = summary_runtime_exports;
    try {
      runtimes.require("summary-page", PROTOCOL.CONTENT_BRIDGE_VERSION);
      return;
    } catch {
    }
    const CUSTOM_SUMMARY_EXECUTOR2 = PROTOCOL.CUSTOM_SUMMARY_EXECUTOR;
    const SUMMARY_RESULT_MAX_TURNS = 200;
    const SUMMARY_RESULT_MAX_TURN_CHARS = 50 * 1024;
    const SUMMARY_RESULT_MAX_TOTAL_CHARS = 1024 * 1024;
    function boundedSummaryRunnerMessages(value) {
      const source = Array.isArray(value) ? value : [];
      const bounded = [];
      let totalChars = 0;
      for (const item of source.slice(0, SUMMARY_RESULT_MAX_TURNS)) {
        if (!item || typeof item !== "object") continue;
        const role = item.role === "assistant" ? "assistant" : item.role === "user" ? "user" : "";
        if (!role) continue;
        const remaining = SUMMARY_RESULT_MAX_TOTAL_CHARS - totalChars;
        if (remaining <= 0) break;
        const textValue = String(item.text ?? item.content ?? "").slice(0, Math.min(SUMMARY_RESULT_MAX_TURN_CHARS, remaining));
        totalChars += textValue.length;
        if (textValue) bounded.push({ role, text: textValue });
      }
      return bounded;
    }
    function summaryRuntimeApi(config = {}) {
      return {
        config,
        sleep: sleep2,
        normalize: normalize2,
        qsa: qsa2,
        qs: qs2,
        closest: closest2,
        visible: visible2,
        text: text2,
        buttonText: buttonText2,
        reveal: reveal2,
        merge: merge2,
        copy: copy2,
        copyFirst: copyFirst2,
        extractCopySequence: extractCopySequence2,
        extractNativeCopyConversation: extractNativeCopyConversation2,
        extractDeepSeekNativeCopyMessages: extractNativeCopyConversation2,
        extractGrokNativeCopyMessages: extractNativeCopyConversation2,
        extractTurns: extractTurns2,
        findCopyButtons: userscriptFindCopyButtons2
      };
    }
    async function runSummaryRunner(config, runner) {
      if (typeof runner !== "function") throw new Error("Summary userscript runner is unavailable");
      const result = await runner(summaryRuntimeApi(config));
      const messages = merge2(boundedSummaryRunnerMessages(Array.isArray(result) ? result : result?.messages || [])).slice(0, SUMMARY_RESULT_MAX_TURNS);
      return {
        messages: hasUserAndAssistant2(messages) ? messages : [],
        rawMessageCount: messages.length,
        hasUserAndAssistant: hasUserAndAssistant2(messages)
      };
    }
    window[CUSTOM_SUMMARY_EXECUTOR2] = (config, runner) => runSummaryRunner(config || {}, runner);
    async function collectSummary(data) {
      const config = data?.config || {};
      const registry = summaryRunners.scripts;
      const runner = registry[config.id] || registry[config.userscriptFile];
      if (!runner) return { messages: [] };
      return runSummaryRunner(config, runner);
    }
    {
      const onSummaryPageMessage = async (event) => {
        const message = event.data;
        if (event.source !== window || message?.source !== PAGE_SUMMARY_SOURCE2 || message.type !== "request" || !message.id) return;
        if (message.action === "runtimeState") {
          const registry = runtimes.registration("summary-runners");
          const registryVersion = String(registry?.version || "");
          const ready = Boolean(
            registry?.api?.scripts && Object.keys(registry.api.scripts).length && registryVersion === PROTOCOL.CONTENT_BRIDGE_VERSION
          );
          window.postMessage({
            source: PAGE_SUMMARY_SOURCE2,
            type: "response",
            action: "runtimeState",
            id: message.id,
            ok: true,
            data: {
              ready,
              bridgeVersion: PROTOCOL.CONTENT_BRIDGE_VERSION,
              registryVersion
            }
          }, "*");
          return;
        }
        if (message.action !== "extract") return;
        window.postMessage({ source: PAGE_SUMMARY_SOURCE2, type: "ack", action: "extract", id: message.id }, "*");
        try {
          const data = await collectSummary(message.data || {});
          window.postMessage({ source: PAGE_SUMMARY_SOURCE2, type: "response", action: "extract", id: message.id, ok: true, data, messages: data?.messages || [] }, "*");
        } catch (error) {
          window.postMessage({ source: PAGE_SUMMARY_SOURCE2, type: "response", action: "extract", id: message.id, ok: false, error: error?.message || String(error), data: { messages: [] }, messages: [] }, "*");
        }
      };
      window.addEventListener("message", onSummaryPageMessage, true);
      const customExecutor = window[CUSTOM_SUMMARY_EXECUTOR2];
      runtimes.register("summary-page", {
        version: PROTOCOL.CONTENT_BRIDGE_VERSION,
        api: Object.freeze({ source: PAGE_SUMMARY_SOURCE2 }),
        dispose() {
          window.removeEventListener("message", onSummaryPageMessage, true);
          if (window[CUSTOM_SUMMARY_EXECUTOR2] === customExecutor) delete window[CUSTOM_SUMMARY_EXECUTOR2];
        }
      });
    }
  }
  installSummaryMainRuntime();
})();
