export const GEMINI_DELETE_USERSCRIPT_HELPERS = String.raw`
  const GEMINI_CONVERSATION_ACTION_SELECTOR = [
    "top-bar-actions conversation-actions-icon button[data-test-id='conversation-actions-menu-icon-button']",
    "top-bar-actions button[data-test-id='conversation-actions-menu-icon-button']",
    "top-bar-actions button.conversation-actions-menu-button",
    "top-bar-actions button[aria-label*='conversation actions' i]",
    "top-bar-actions button[aria-label*='open menu' i]",
    "button[data-test-id='conversation-actions-menu-icon-button']",
    "button.conversation-actions-menu-button",
    "button[aria-label*='Open menu for conversation actions' i]",
    "button[aria-label*='conversation actions' i]",
    "button[aria-label*='more options' i]",
    "button[data-test-id='actions-menu-button']"
  ].join(", ");
  const GEMINI_CONVERSATION_MENU_ROOT_SELECTOR = [
    ".cdk-overlay-pane .mat-mdc-menu-panel[role='menu']",
    ".cdk-overlay-pane .mat-menu-panel[role='menu']",
    ".cdk-overlay-pane [role='menu']",
    ".cdk-overlay-pane .mat-mdc-menu-panel",
    ".cdk-overlay-pane .mat-menu-panel",
    ".mat-mdc-menu-panel[role='menu']",
    ".mat-menu-panel[role='menu']",
    ".cdk-overlay-pane"
  ].join(", ");
  const GEMINI_CONVERSATION_MENU_ITEM_SELECTOR = [
    "button[mat-menu-item]",
    "button.mat-mdc-menu-item",
    "button[aria-label]",
    "button[jslog]",
    "button[data-test-id]",
    "[role='menuitem']",
    "[role='menuitemradio']",
    "[role='menuitemcheckbox']",
    "[role='button']",
    "[aria-label]",
    "[title]",
    "[jslog]",
    "[data-test-id]",
    "[tabindex]",
    "mat-icon",
    "span",
    "div"
  ].join(", ");
  const GEMINI_CONVERSATION_MENU_MARKERS = ["Delete", "Rename", "Pin", "Share", "Unpin", "删除", "重命名", "固定", "取消固定", "分享"];
  const GEMINI_SIDEBAR_TOGGLE_SELECTOR = [
    "top-bar-actions button:not([aria-haspopup='menu'])[aria-label*='sidebar' i]",
    "top-bar-actions button:not([aria-haspopup='menu'])[aria-label*='side bar' i]",
    "top-bar-actions button:not([aria-haspopup='menu'])[aria-label*='navigation' i]",
    "top-bar-actions button:not([aria-haspopup='menu'])[aria-label*='侧栏']",
    "top-bar-actions button:not([aria-haspopup='menu'])[aria-label*='侧边栏']",
    "top-bar-actions button:not([aria-haspopup='menu'])[aria-label*='导航']",
    "top-bar-actions button:has(mat-icon[fonticon='menu'])",
    "top-bar-actions button:has(mat-icon[data-mat-icon-name='menu'])",
    "top-bar-actions button:has(mat-icon[fonticon='menu_open'])",
    "top-bar-actions button:has(mat-icon[data-mat-icon-name='menu_open'])",
    "bard-sidenav button:not([aria-haspopup='menu'])[aria-label*='menu' i]",
    "side-navigation-content button:not([aria-haspopup='menu'])[aria-label*='menu' i]",
    "bard-sidenav button:not([aria-haspopup='menu'])[aria-label*='sidebar' i]",
    "side-navigation-content button:not([aria-haspopup='menu'])[aria-label*='sidebar' i]",
    "bard-sidenav button:not([aria-haspopup='menu'])[aria-label*='navigation' i]",
    "side-navigation-content button:not([aria-haspopup='menu'])[aria-label*='navigation' i]",
    "bard-sidenav button:has(mat-icon[fonticon='menu'])",
    "side-navigation-content button:has(mat-icon[fonticon='menu'])",
    "bard-sidenav button:has(mat-icon[data-mat-icon-name='menu'])",
    "side-navigation-content button:has(mat-icon[data-mat-icon-name='menu'])",
    "button[aria-label='Open sidebar']",
    "button[aria-label='Close sidebar']",
    "button[aria-label='Expand sidebar']",
    "button[aria-label='Collapse sidebar']",
    "button:not([aria-haspopup='menu'])[aria-label='Open navigation menu']",
    "button:not([aria-haspopup='menu'])[aria-label='Close navigation menu']"
  ].join(", ");
  const GEMINI_SIDEBAR_ROOT_SELECTOR = "bard-sidenav, side-navigation-content, .sidenav-with-history-container";
  const GEMINI_SIDEBAR_OPEN_SELECTOR = [
    ".sidenav-with-history-container.expanded",
    ".conversation-items-container.side-nav-opened",
    ".conversation-actions-container.side-nav-opened",
    "bard-sidenav[style*='--bard-sidenav-open-width']",
    "bard-sidenav.side-nav-expanded",
    "side-navigation-content.side-nav-expanded",
    "top-bar-actions.side-nav-expanded",
    "side-navigation-content side-nav-action-button.is-expanded",
    "side-navigation-content [data-test-id='new-chat-button'].is-expanded"
  ].join(", ");
  const GEMINI_SIDEBAR_CLOSED_SELECTOR = [
    ".sidenav-with-history-container:not(.expanded)",
    "bard-sidenav[style*='--bard-sidenav-closed-width']"
  ].join(", ");
  const GEMINI_CONVERSATION_LINK_SELECTOR = [
    "a[data-test-id='conversation']",
    "gem-nav-list-item[data-test-id='conversation'] a[href*='/app/']",
    "a[href*='/app/']"
  ].join(", ");
  const GEMINI_CONVERSATION_SEARCH_ROOT_SELECTOR = [
    "conversations-list",
    ".chat-history-list",
    ".chat-history",
    "mat-nav-list[role='navigation']",
    "mat-nav-list.gds-sidenav-list",
    "bard-sidenav",
    "side-navigation-content",
    ".sidenav-with-history-container"
  ].join(", ");
  const GEMINI_CONVERSATION_ROW_CANDIDATE_SELECTOR = [
    "gem-nav-list-item[data-test-id='conversation']",
    "gem-nav-list-item",
    ".conversation-item",
    ".conversation-list-item",
    ".conversation-row",
    ".gem-nav-list-item",
    "[data-test-id='conversation-container']",
    "[data-test-id='conversation-row']",
    "[role='listitem']",
    ".mat-mdc-list-item",
    ".mat-list-item",
    "li"
  ].join(", ");
  const GEMINI_CONVERSATION_ACTION_BUTTON_FAST_SELECTOR = [
    ".hovered-trailing-content gem-icon-button[data-test-id='actions-menu-button'] button",
    ".hovered-trailing-content gem-icon-button[data-test-id='actions-menu-button']",
    "gem-icon-button[data-test-id='actions-menu-button'] button",
    "gem-icon-button[data-test-id='actions-menu-button']",
    "gem-icon-button.gem-conversation-actions-menu-button button",
    "gem-icon-button.gem-conversation-actions-menu-button",
    "button[data-test-id='actions-menu-button']",
    "button[data-test-id='conversation-actions-menu-icon-button']"
  ].join(", ");
  const GEMINI_CONVERSATION_ACTION_BUTTON_SELECTOR = [
    GEMINI_CONVERSATION_ACTION_BUTTON_FAST_SELECTOR,
    "gem-icon-button[data-test-id='conversation-actions-menu-icon-button']",
    "gem-icon-button[data-test-id='conversation-actions-menu-icon-button'] button",
    ".hovered-trailing-content gem-icon-button[data-test-id='actions-menu-button']",
    ".hovered-trailing-content gem-icon-button[data-test-id='actions-menu-button'] button",
    "button[aria-label*='More options' i]",
    "button[aria-label*='更多选项' i]",
    "[role='button'][aria-label*='More options' i]",
    "[role='button'][aria-label*='更多选项' i]",
    "button[aria-haspopup='menu']",
    "[role='button'][aria-haspopup='menu']",
    "button[aria-label*='menu' i]",
    "[role='button'][aria-label*='menu' i]",
    "button:has(mat-icon[fonticon='more_vert'])",
    "button:has(mat-icon[data-mat-icon-name='more_vert'])",
    "button:has(mat-icon[fonticon='more_horiz'])",
    "button:has(mat-icon[data-mat-icon-name='more_horiz'])",
    "button.conversation-actions-menu-button"
  ].join(", ");

  function geminiCollectTextExcludingIcons(node, parts = []) {
    if (!node) return parts;
    if (node.nodeType === 3) {
      parts.push(node.nodeValue || "");
      return parts;
    }
    if (node.nodeType !== 1) return parts;
    const tagName = String(node.tagName || "").toLowerCase();
    if (tagName === "mat-icon") return parts;
    if (String(node.getAttribute?.("aria-hidden") || "").trim().toLowerCase() === "true") return parts;
    if (node.hasAttribute?.("fonticon") || node.hasAttribute?.("data-mat-icon-name")) return parts;
    try {
      for (const child of Array.from(node.childNodes || [])) geminiCollectTextExcludingIcons(child, parts);
    } catch {}
    return parts;
  }

  function geminiUiText(node) {
    if (!node) return "";
    const ariaLabel = node.getAttribute?.("aria-label");
    if (ariaLabel && String(ariaLabel).trim()) return normalize(ariaLabel);
    const title = node.getAttribute?.("title");
    if (title && String(title).trim()) return normalize(title);
    const withoutIcons = normalize(geminiCollectTextExcludingIcons(node, []).join(" "));
    if (withoutIcons) return withoutIcons;
    return normalize(node.textContent || "");
  }

  function geminiJslogId(node) {
    for (let current = node, depth = 0; current && depth < 5; current = current.parentElement, depth += 1) {
      const match = String(current.getAttribute?.("jslog") || "").match(/^\s*([0-9]+)/);
      if (match) return match[1];
    }
    return "";
  }

  function geminiDataTestIds(node) {
    const ids = [];
    const add = (item) => {
      const id = String(item?.getAttribute?.("data-test-id") || "").trim().toLowerCase();
      if (id && !ids.includes(id)) ids.push(id);
    };
    add(node);
    qsa("[data-test-id]", node).forEach(add);
    return ids;
  }

  function geminiMenuItemLooksLikeNotebook(node) {
    const value = normalize([geminiUiText(node), elementText(node), geminiDataTestIds(node).join(" ")].join(" "));
    return /\bnotebook\b/i.test(value) || value.includes("笔记本");
  }

  function geminiMenuMarkerCount(node) {
    const value = normalize([geminiUiText(node), node?.textContent].filter(Boolean).join(" ")).toLowerCase();
    const matched = [];
    for (const marker of GEMINI_CONVERSATION_MENU_MARKERS.map((item) => item.toLowerCase()).sort((a, b) => b.length - a.length)) {
      if (!value.includes(marker) || matched.some((existing) => existing.includes(marker))) continue;
      matched.push(marker);
    }
    return matched.length;
  }

  function geminiConversationMenuRoot(node) {
    if (!node || !visible(node)) return false;
    const tagName = String(node.tagName || "").toLowerCase();
    const role = String(node.getAttribute?.("role") || "").toLowerCase();
    if (tagName === "mat-dialog-container" || role === "dialog") return false;
    const isOverlay = Boolean(node.matches?.(".cdk-overlay-pane"));
    const panel = node.matches?.(".mat-mdc-menu-panel, .mat-menu-panel, [role='menu']")
      ? node
      : node.querySelector?.(".mat-mdc-menu-panel, .mat-menu-panel, [role='menu']");
    if (!panel && !isOverlay) return false;
    if (node.querySelector?.("mat-dialog-container, [role='dialog']")) return false;
    if (node.querySelector?.("button[data-test-id='delete-button'],button[data-test-id='pin-button'],button[data-test-id='rename-button'],button[aria-label*='Delete' i],button[aria-label*='Rename' i],button[aria-label*='Pin' i],button[aria-label*='Share' i]")) return true;
    return geminiMenuMarkerCount(node) > 0;
  }

  function geminiConversationActionButtonExcluded(button) {
    if (!button || !visible(button)) return true;
    if (button.closest?.("bard-sidenav, side-navigation-content, .sidenav-with-history-container, .conversation-items-container, side-nav-action-button")) return true;
    if (button.closest?.("input-area-v2, [data-node-type='input-area'], [contenteditable='true'], .prompt-input, .composer, .prompt-composer")) return true;
    if (button.closest?.("user-query,user-query-content,model-response,message-content,message-actions,response-actions,.message-actions,.response-actions,[data-test-id*='user-query' i],[data-test-id*='model-response' i],[data-test-id*='response' i],[data-test-id*='message' i],[data-test-id*='query' i]")) return true;
    if (button.closest?.(".cdk-overlay-pane .mat-mdc-menu-panel,.cdk-overlay-pane .mat-menu-panel,.cdk-overlay-pane [role='menu'],mat-dialog-container,[role='dialog']")) return true;
    return false;
  }

  function geminiConversationActionButton() {
    const candidates = [];
    for (const button of qsa(GEMINI_CONVERSATION_ACTION_SELECTOR, document)) {
      if (geminiConversationActionButtonExcluded(button)) continue;
      const dataTestId = String(button.getAttribute?.("data-test-id") || "").trim().toLowerCase();
      const ariaLabel = normalize(button.getAttribute?.("aria-label") || "").toLowerCase();
      const title = normalize(button.getAttribute?.("title") || "").toLowerCase();
      const text = geminiUiText(button).toLowerCase();
      const className = String(button.className || "").toLowerCase();
      const inTopBar = Boolean(button.closest?.("top-bar-actions"));
      const explicitlyConversationAction = inTopBar
        || dataTestId === "conversation-actions-menu-icon-button"
        || className.includes("conversation-actions-menu-button")
        || ariaLabel.includes("conversation actions")
        || ariaLabel.includes("open menu for conversation actions")
        || title.includes("conversation actions")
        || text.includes("conversation actions");
      if (!explicitlyConversationAction) continue;
      const box = rect(button);
      let score = 0;
      if (dataTestId === "conversation-actions-menu-icon-button") score += 160;
      if (dataTestId === "actions-menu-button") score += 70;
      if (className.includes("conversation-actions-menu-button")) score += 130;
      if (inTopBar) score += 120;
      if (ariaLabel.includes("conversation actions")) score += 100;
      if (ariaLabel.includes("open menu for conversation actions")) score += 140;
      if (inTopBar && ariaLabel.includes("more options")) score += 40;
      if (title.includes("conversation actions")) score += 60;
      if (text.includes("conversation actions")) score += 70;
      if (inTopBar && /more_vert/i.test(elementText(button))) score += 35;
      if (box && box.top <= Math.max(220, (window.innerHeight || 1) * 0.32)) score += 20;
      if (box && box.left >= (window.innerWidth || 1) * 0.42) score += 20;
      candidates.push({ node: button, score });
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.node || null;
  }

  function geminiSimulateMenuClick(node) {
    const target = clickable(node) || node;
    if (!target || disabled(target)) return false;
    reveal(target);
    try { target.focus?.({ preventScroll: true }); } catch {
      try { target.focus?.(); } catch {}
    }
    const coords = pointFor(target);
    const plans = [
      ["pointerdown", "PointerEvent", { buttons: 1 }],
      ["mousedown", "MouseEvent", { buttons: 1 }],
      ["pointerup", "PointerEvent", { buttons: 0 }],
      ["mouseup", "MouseEvent", { buttons: 0 }],
      ["click", "MouseEvent", { buttons: 0, detail: 1 }]
    ];
    let dispatched = false;
    for (const [type, ctorName, extra] of plans) {
      try {
        const Ctor = eventCtor(ctorName, target);
        target.dispatchEvent(new Ctor(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
          ...coords,
          ...extra
        }));
        dispatched = true;
      } catch {}
    }
    if (!dispatched) {
      try { target.click?.(); dispatched = true; } catch {}
    }
    return dispatched;
  }

  function geminiFirstVisible(selector, fallbackToFirst = false) {
    const candidates = qsa(selector, document);
    return candidates.find(visible) || (fallbackToFirst ? candidates[0] || null : null);
  }

  function geminiStringAttr(node, name) {
    try { return String(node?.getAttribute?.(name) || "").trim(); } catch { return ""; }
  }

  function geminiNormalizeConversationPathname(value) {
    try {
      const pathname = new URL(String(value || ""), location.origin).pathname.replace(/\/+$/, "");
      const match = pathname.match(/^\/app\/([^/?#]+)/);
      return match ? "/app/" + match[1] : "";
    } catch { return ""; }
  }

  function geminiCurrentConversationPathname() {
    return geminiNormalizeConversationPathname(location.href);
  }

  function geminiSidebarOpen() {
    const explicitlyOpen = qsa(GEMINI_SIDEBAR_OPEN_SELECTOR, document).some((node) => {
      const box = rect(node);
      return visible(node) || Boolean(box && box.width >= 160);
    });
    if (explicitlyOpen) return true;
    for (const root of qsa(GEMINI_SIDEBAR_ROOT_SELECTOR, document)) {
      const className = String(root.className || "").toLowerCase();
      const state = geminiStringAttr(root, "data-state").toLowerCase();
      const expanded = geminiStringAttr(root, "aria-expanded").toLowerCase();
      if (expanded === "true" || state === "expanded" || state === "open" || /(?:expanded|side-nav-opened|side-nav-expanded)/.test(className)) return true;
      if (expanded === "false" || state === "collapsed" || state === "closed" || /(?:collapsed|side-nav-closed)/.test(className)) return false;
      const box = rect(root);
      if (box && box.width >= 160 && box.right > 0) return true;
      if (box && box.width > 0 && box.width <= 96) return false;
    }
    if (qsa(GEMINI_SIDEBAR_CLOSED_SELECTOR, document).length) return false;
    const toggle = geminiFirstVisible(GEMINI_SIDEBAR_TOGGLE_SELECTOR, true);
    const label = normalize([geminiStringAttr(toggle, "aria-label"), geminiStringAttr(toggle, "title")].join(" ")).toLowerCase();
    if (/(open|expand|show).*(sidebar|side bar|navigation|menu)/.test(label)) return false;
    if (/(close|collapse|hide).*(sidebar|side bar|navigation|menu)/.test(label)) return true;
    if (/(打开|展开|显示).*(侧栏|侧边栏|导航|菜单)/.test(label)) return false;
    if (/(关闭|收起|隐藏).*(侧栏|侧边栏|导航|菜单)/.test(label)) return true;
    return null;
  }

  async function geminiEnsureSidebarOpen() {
    if (geminiSidebarOpen() === true) return true;
    const toggle = geminiFirstVisible(GEMINI_SIDEBAR_TOGGLE_SELECTOR, true);
    if (!toggle || !visible(toggle) || disabled(toggle)) return false;
    geminiSimulateMenuClick(toggle);
    let opened = await waitFor(() => geminiSidebarOpen() === true ? true : null, 1300, 90);
    if (opened) return true;
    if (geminiSidebarOpen() !== true) clickAt(toggle);
    opened = await waitFor(() => geminiSidebarOpen() === true ? true : null, 1300, 90);
    return Boolean(opened || geminiSidebarOpen() === true);
  }

  function geminiMatchesSelector(node, selector) {
    try { return Boolean(node?.matches?.(selector)); } catch { return false; }
  }

  function geminiConversationLinkCount(node) {
    if (!node) return 0;
    try {
      return (node.matches?.(GEMINI_CONVERSATION_LINK_SELECTOR) ? 1 : 0)
        + node.querySelectorAll(GEMINI_CONVERSATION_LINK_SELECTOR).length;
    } catch { return 0; }
  }

  function geminiConversationEntryContainer(link) {
    if (!link) return null;
    const preferred = [
      "gem-nav-list-item[data-test-id='conversation']",
      "gem-nav-list-item",
      ".conversation-item",
      ".conversation-list-item",
      ".conversation-row",
      ".mat-mdc-list-item",
      ".mat-list-item",
      "[role='listitem']"
    ];
    for (const selector of preferred) {
      let candidate = null;
      try { candidate = link.closest?.(selector) || null; } catch {}
      if (!candidate || geminiMatchesSelector(candidate, GEMINI_SIDEBAR_ROOT_SELECTOR)) continue;
      if (geminiConversationLinkCount(candidate) === 1) return candidate;
    }
    let best = null;
    let bestScore = -Infinity;
    for (let node = link, depth = 0; node && node.nodeType === 1 && depth < 12; node = node.parentElement, depth += 1) {
      if (geminiMatchesSelector(node, GEMINI_SIDEBAR_ROOT_SELECTOR)) break;
      const linkCount = geminiConversationLinkCount(node);
      if (!linkCount) continue;
      const box = rect(node);
      let score = linkCount === 1 ? 120 : -Math.min(120, linkCount * 16);
      if (node === link.parentElement) score += 30;
      if (geminiMatchesSelector(node, GEMINI_CONVERSATION_ROW_CANDIDATE_SELECTOR)) score += 45;
      if (box && box.width > 0 && box.height > 0) {
        score += 8;
        if (box.height <= 72) score += 28;
        else if (box.height <= 112) score += 12;
        else score -= 25;
      }
      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    }
    return best || link.parentElement || null;
  }

  function geminiConversationActionHost(node) {
    if (!node || node.nodeType !== 1) return null;
    const selector = [
      "gem-icon-button[data-test-id='actions-menu-button']",
      "gem-icon-button[data-test-id='conversation-actions-menu-icon-button']",
      "gem-icon-button.gem-conversation-actions-menu-button",
      ".gem-conversation-actions-menu-button"
    ].join(", ");
    try {
      if (node.matches?.(selector)) return node;
      return node.closest?.(selector) || null;
    } catch { return null; }
  }

  function geminiConversationMenuClickTarget(node) {
    if (!node || node.nodeType !== 1) return null;
    const role = geminiStringAttr(node, "role").toLowerCase();
    if (String(node.tagName || "").toLowerCase() === "button" || role === "button") return node;
    const host = geminiConversationActionHost(node) || node;
    try { return host.querySelector?.("button, [role='button']") || host; } catch { return host; }
  }

  function geminiConversationMenuButtonScore(button) {
    if (!button || disabled(button) || button.closest?.("mat-dialog-container, [role='dialog'], .cdk-overlay-pane")) return -Infinity;
    const host = geminiConversationActionHost(button);
    if (host && disabled(host)) return -Infinity;
    const value = normalize([
      geminiStringAttr(button, "data-test-id"),
      geminiStringAttr(host, "data-test-id"),
      geminiStringAttr(button, "aria-label"),
      geminiStringAttr(host, "aria-label"),
      geminiStringAttr(button, "title"),
      geminiStringAttr(host, "title"),
      String(button.className || ""),
      String(host?.className || ""),
      elementText(button),
      svgText(button)
    ].filter(Boolean).join(" ")).toLowerCase();
    let score = 0;
    if (value.includes("actions-menu-button")) score += 170;
    if (value.includes("conversation-actions-menu-icon-button")) score += 170;
    if (value.includes("conversation-actions-menu-button")) score += 130;
    if (value.includes("open menu for conversation actions")) score += 150;
    if (value.includes("conversation actions")) score += 120;
    if (value.includes("more options for")) score += 140;
    if (value.includes("more options") || value.includes("更多选项")) score += 115;
    if (value.includes("aria-haspopup menu") || geminiStringAttr(button, "aria-haspopup").toLowerCase() === "menu") score += 80;
    if (/more[_ -]?(vert|horiz)/.test(value)) score += 100;
    if (/\b(delete|rename|pin)\b|删除|重命名|置顶|固定/.test(value)) score -= 80;
    const box = rect(button);
    if (box && box.width > 0 && box.height > 0) {
      score += 8;
      if (box.width <= 64 && box.height <= 64) score += 18;
    }
    return score;
  }

  function geminiConversationMenuButton(container) {
    if (!container) return null;
    const collect = (selector) => {
      const seen = new Set();
      return qsa(selector, container)
        .map(geminiConversationMenuClickTarget)
        .filter((node) => node && !seen.has(node) && seen.add(node))
        .map((node) => ({ node, score: geminiConversationMenuButtonScore(node), shown: visible(node) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => Number(b.shown) - Number(a.shown) || b.score - a.score)[0]?.node || null;
    };
    return collect(GEMINI_CONVERSATION_ACTION_BUTTON_FAST_SELECTOR)
      || collect(GEMINI_CONVERSATION_ACTION_BUTTON_SELECTOR);
  }

  function geminiConversationActionContainers(entry) {
    const containers = [];
    const add = (node) => {
      if (node && !containers.includes(node)) containers.push(node);
    };
    add(entry?.container);
    add(entry?.link);
    const linkBox = rect(entry?.link);
    const linkMidY = linkBox ? linkBox.top + linkBox.height / 2 : null;
    for (let node = entry?.link?.parentElement || null, depth = 0; node && depth < 5; node = node.parentElement, depth += 1) {
      if (geminiMatchesSelector(node, GEMINI_SIDEBAR_ROOT_SELECTOR)) break;
      if (geminiConversationLinkCount(node) !== 1) break;
      const box = rect(node);
      if (box && linkBox) {
        const maxHeight = Math.max(128, linkBox.height * 2.5);
        if (box.height > maxHeight || linkMidY < box.top - 2 || linkMidY > box.bottom + 2) break;
      }
      add(node);
    }
    return containers;
  }

  function geminiRefreshConversationEntryButton(entry) {
    if (!entry) return entry;
    for (const container of geminiConversationActionContainers(entry)) {
      const button = geminiConversationMenuButton(container);
      if (button) return { ...entry, container, button };
    }
    return { ...entry, button: null };
  }

  function geminiRevealConversationEntryActions(entry) {
    if (!entry?.container) return entry;
    let next = geminiRefreshConversationEntryButton(entry);
    if (next.button && visible(next.button)) return next;
    const targets = [];
    const add = (node) => {
      if (node && !targets.includes(node)) targets.push(node);
    };
    geminiConversationActionContainers(next).forEach(add);
    for (const target of targets) {
      try { target.scrollIntoView?.({ block: "nearest", inline: "nearest" }); } catch {}
      const box = rect(target);
      const coords = box ? {
        clientX: Math.max(1, box.right - Math.min(12, Math.max(4, box.width / 6))),
        clientY: Math.max(1, box.top + Math.min(box.height - 4, Math.max(4, box.height / 2)))
      } : { clientX: 1, clientY: 1 };
      for (const type of ["mousemove", "mouseover", "mouseenter", "pointermove", "pointerover", "pointerenter"]) {
        try {
          const Ctor = type.startsWith("pointer") ? eventCtor("PointerEvent", target) : eventCtor("MouseEvent", target);
          target.dispatchEvent(new Ctor(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
            ...coords
          }));
        } catch {}
      }
      try { target.focus?.({ preventScroll: true }); } catch {}
    }
    next = geminiRefreshConversationEntryButton(next);
    return next;
  }

  function geminiConversationLinks() {
    const roots = [];
    const seenRoots = new Set();
    const addRoot = (node) => {
      if (!node || seenRoots.has(node)) return;
      seenRoots.add(node);
      roots.push(node);
    };
    qsa(GEMINI_CONVERSATION_SEARCH_ROOT_SELECTOR, document).forEach(addRoot);
    qsa(GEMINI_SIDEBAR_ROOT_SELECTOR, document).forEach(addRoot);
    const links = [];
    const seen = new Set();
    const collect = (root) => {
      for (const link of qsa(GEMINI_CONVERSATION_LINK_SELECTOR, root)) {
        if (!link || seen.has(link) || !link.closest?.(GEMINI_SIDEBAR_ROOT_SELECTOR)) continue;
        seen.add(link);
        links.push(link);
      }
    };
    roots.forEach(collect);
    if (!links.length) collect(document);
    return links;
  }

  function geminiCurrentConversationEntry() {
    const currentPathname = geminiCurrentConversationPathname();
    if (!currentPathname) return { entry: null, reason: "current page is not a saved Gemini conversation", currentPathname };
    const matches = geminiConversationLinks().filter((link) => {
      return geminiNormalizeConversationPathname(link.getAttribute?.("href") || link.href || "") === currentPathname;
    });
    if (!matches.length) return { entry: null, reason: "current conversation row not found", currentPathname };
    const visibleMatches = matches.filter((link) => {
      const container = geminiConversationEntryContainer(link);
      return visible(link) || visible(container);
    });
    const pool = visibleMatches.length ? visibleMatches : matches;
    if (pool.length !== 1) return { entry: null, reason: "current conversation row matched more than once", currentPathname };
    const link = pool[0];
    const container = geminiConversationEntryContainer(link);
    if (!container) return { entry: null, reason: "current conversation row container not found", currentPathname };
    return {
      entry: geminiRefreshConversationEntryButton({ link, container, button: null }),
      reason: "",
      currentPathname
    };
  }

  async function geminiCurrentConversationMenuTarget(timeoutMs = 3600) {
    if (!await geminiEnsureSidebarOpen()) {
      return { entry: null, reason: "Gemini sidebar could not be opened", currentPathname: geminiCurrentConversationPathname() };
    }
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    let last = geminiCurrentConversationEntry();
    let revealedContainer = null;
    let historyReloaded = false;
    while (Date.now() <= deadline) {
      const current = geminiCurrentConversationEntry();
      if (current.entry?.button && visible(current.entry.button)) return current;
      if (current.entry) {
        const next = current.entry.container !== revealedContainer
          ? geminiRevealConversationEntryActions(current.entry)
          : geminiRefreshConversationEntryButton(current.entry);
        revealedContainer = current.entry.container;
        if (next.button && visible(next.button)) return { ...current, entry: next, reason: "" };
      } else if (!historyReloaded) {
        const reload = geminiFirstVisible("[data-test-id='sidenav-error-action-link']");
        if (reload) {
          historyReloaded = true;
          geminiSimulateMenuClick(reload);
        }
      }
      last = current;
      await sleep(180);
    }
    const finalValue = geminiCurrentConversationEntry();
    if (finalValue.entry) {
      const next = geminiRevealConversationEntryActions(finalValue.entry);
      if (next.button && visible(next.button)) return { ...finalValue, entry: next, reason: "" };
    }
    return finalValue.reason ? finalValue : last;
  }

  function geminiConversationMenuRoots(trigger = null) {
    const roots = [];
    const add = (node) => {
      if (node && geminiConversationMenuRoot(node) && !roots.includes(node)) roots.push(node);
    };
    const controlsId = String(trigger?.getAttribute?.("aria-controls") || "").trim();
    if (controlsId) {
      try { add(document.getElementById(controlsId)); } catch {}
    }
    qsa(GEMINI_CONVERSATION_MENU_ROOT_SELECTOR, document).forEach(add);
    return roots;
  }

  function geminiDeleteMenuItemMatches(node) {
    if (!node || !visible(node) || disabled(node) || geminiMenuItemLooksLikeNotebook(node)) return false;
    const uiText = geminiUiText(node);
    if (/\bdelete\b/i.test(uiText) || uiText.includes("删除")) return true;
    if (uiText) return false;
    if (geminiDataTestIds(node).includes("delete-button")) return true;
    return geminiJslogId(node) === "186000";
  }

  function findGeminiDeleteMenuItem(trigger = null) {
    const candidates = [];
    const seen = new Set();
    const roots = geminiConversationMenuRoots(trigger);
    const add = (node, root, extraScore = 0) => {
      if (!node || seen.has(node) || !geminiDeleteMenuItemMatches(node)) return;
      let target = clickable(node) || node;
      if (target === root || geminiMenuMarkerCount(target) > 1) {
        target = closest(node, "button,[role='menuitem'],[role='button'],[mat-menu-item],[data-test-id],[jslog],[tabindex]") || node;
      }
      if (!target || target === root || seen.has(target) || !visible(target) || disabled(target) || geminiMenuMarkerCount(target) > 1 || geminiMenuItemLooksLikeNotebook(target)) return;
      const box = rect(target);
      if (!box || box.width < 8 || box.height < 8 || box.width > 520 || box.height > 140) return;
      const ids = geminiDataTestIds(target);
      const uiText = geminiUiText(target);
      seen.add(node);
      seen.add(target);
      candidates.push({
        node: target,
        score: extraScore
          + (ids.includes("delete-button") ? 1000 : 0)
          + (geminiJslogId(target) === "186000" ? 800 : 0)
          + (/^(delete|删除)$/i.test(uiText) ? 650 : 0)
          + (target.matches?.("button,[role='menuitem'],[role='button']") ? 180 : 0),
        top: box.top,
        right: box.right
      });
    };
    for (let index = roots.length - 1; index >= 0; index -= 1) {
      const root = roots[index];
      qsa(GEMINI_CONVERSATION_MENU_ITEM_SELECTOR, root).forEach((node) => add(node, root, 240 + index));
    }
    candidates.sort((a, b) => b.score - a.score || b.right - a.right || a.top - b.top);
    return candidates[0]?.node || null;
  }

  function resultWithGeminiTrustedMenuClick(reason, node) {
    const value = result(false, reason);
    const trustedMenuClick = trustedMenuClickForElement(node, reason);
    return trustedMenuClick ? { ...value, needsTrustedMenuClick: true, trustedMenuClick } : value;
  }

  async function clickGeminiDeleteMenuItem(trigger) {
    const menuReady = () => findGeminiDeleteMenuItem(trigger);
    let item = menuReady();
    if (!item && trigger) {
      const attempts = [
        () => geminiSimulateMenuClick(trigger),
        () => clickAt(trigger),
        () => invokeDirectFrameworkActivation(trigger, pointFor(trigger)),
        () => invokeFrameworkActivation(trigger, pointFor(trigger))
      ];
      for (const attempt of attempts) {
        try { attempt(); } catch {}
        item = await waitFor(menuReady, 520, 65);
        if (item) break;
      }
    }
    if (!item) return null;
    await sleep(120);
    item = findGeminiDeleteMenuItem(trigger) || item;
    return (geminiSimulateMenuClick(item) || clickAt(item)) ? item : null;
  }

  async function tryGeminiDeleteFromTrigger(trigger) {
    if (!trigger) return null;
    const clickedItem = await clickGeminiDeleteMenuItem(trigger);
    if (!clickedItem) return null;
    const confirmed = await clickDeleteConfirmIfPresent(6500);
    if (confirmed) return result(true);
    if (deleteDialogRoots().length) return resultWithTrustedDeleteConfirm("delete confirmation did not close");
    const stillOpenItem = findGeminiDeleteMenuItem(trigger) || findGeminiDeleteMenuItem();
    if (stillOpenItem) return resultWithGeminiTrustedMenuClick("delete menu item did not open confirmation", stillOpenItem);
    return result(false, "delete confirmation button not found");
  }

  async function deleteGemini(payload = {}) {
    if (findDeleteConfirmButton()) {
      const confirmedExisting = await clickDeleteConfirmIfPresent(6500);
      return confirmedExisting ? result(true) : resultWithTrustedDeleteConfirm("delete confirmation did not close");
    }
    if (payload?.trustedMenuClickRetried) {
      const openItem = await waitFor(() => findGeminiDeleteMenuItem(), 3000, 90);
      if (openItem) {
        geminiSimulateMenuClick(openItem) || clickAt(openItem);
        const confirmedAfterTrustedMenu = await clickDeleteConfirmIfPresent(6500);
        if (confirmedAfterTrustedMenu) return result(true);
        if (deleteDialogRoots().length) return resultWithTrustedDeleteConfirm("delete confirmation did not close");
        const stillOpenItem = findGeminiDeleteMenuItem();
        if (stillOpenItem) return result(false, "trusted delete menu click did not open confirmation");
      }
    }
    const topTrigger = geminiConversationActionButton();
    if (!payload?.trustedMenuClickRetried && topTrigger) {
      const topResult = await tryGeminiDeleteFromTrigger(topTrigger);
      if (topResult) return topResult;
    }

    const sidebarTarget = await geminiCurrentConversationMenuTarget(3600);
    const sidebarTrigger = sidebarTarget?.entry?.button || null;
    if (sidebarTrigger) {
      const sidebarResult = await tryGeminiDeleteFromTrigger(sidebarTrigger);
      if (sidebarResult) return sidebarResult;
      if (!payload?.trustedMenuClickRetried) {
        return resultWithGeminiTrustedMenuClick("sidebar conversation menu did not open", sidebarTrigger);
      }
      return result(false, "trusted sidebar conversation menu click did not open delete menu");
    }
    if (sidebarTarget?.entry && !payload?.trustedHoverRetried) {
      return resultWithTrustedHover(
        "sidebar conversation menu requires trusted hover",
        sidebarTarget.entry.container || sidebarTarget.entry.link
      );
    }

    if (payload?.trustedMenuClickRetried) {
      return result(false, sidebarTarget?.reason || "trusted conversation menu click did not open delete menu");
    }
    if (topTrigger) {
      return resultWithGeminiTrustedMenuClick(sidebarTarget?.reason || "delete menu item not found", topTrigger);
    }
    return result(false, sidebarTarget?.reason || "conversation menu trigger not found");
  }
`;
