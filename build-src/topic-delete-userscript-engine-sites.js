const DELETE_USERSCRIPT_ENGINE_SITES_RAW = String.raw`
  async function clickDeleteConfirmIfAppears(appearTimeoutMs = 1200, closeTimeoutMs = 4200) {
    const deadline = Date.now() + Math.max(0, Number(appearTimeoutMs) || 0);
    while (Date.now() <= deadline) {
      if (findDeleteConfirmButton()) {
        return { appeared: true, confirmed: await clickDeleteConfirmIfPresent(closeTimeoutMs) };
      }
      await sleep(80);
    }
    return { appeared: false, confirmed: false };
  }

  function dispatchDeleteKeyboardShortcut() {
    const mac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");
    const init = {
      key: "Backspace",
      code: "Backspace",
      keyCode: 8,
      which: 8,
      bubbles: true,
      cancelable: true,
      composed: true,
      shiftKey: true,
      metaKey: mac,
      ctrlKey: !mac,
      altKey: false
    };
    let dispatched = false;
    const targets = [document.activeElement, document.body, document.documentElement, document, window].filter(Boolean);
    const seen = new Set();
    for (const target of targets) {
      if (seen.has(target)) continue;
      seen.add(target);
      for (const type of ["keydown", "keyup"]) {
        try {
          target.dispatchEvent(new KeyboardEvent(type, init));
          dispatched = true;
        } catch {}
      }
    }
    return dispatched;
  }

  function kagiChatIdFromHref(value) {
    const match = String(value || "").match(/\/chat\/([^/?#]+)/i);
    return match ? match[1] : "";
  }

  function kagiCurrentThreadLink(payload = {}) {
    const ids = new Set([
      location.href,
      payload.currentThreadHref,
      payload.currentHref,
      payload.cachedHref,
      payload.href,
      payload.url
    ].map(kagiChatIdFromHref).filter(Boolean));
    const links = qsa("a[href*='/chat/']", document)
      .filter((link) => visible(link) && rect(link));
    if (ids.size) {
      const exact = links.find((link) => ids.has(kagiChatIdFromHref(link.href || link.getAttribute("href"))));
      if (exact) return exact;
    }
    return links
      .filter((link) => {
        const box = rect(link);
        return box && box.left <= 520 && box.width >= 80 && box.height >= 16;
      })
      .sort((a, b) => (rect(a)?.top || 0) - (rect(b)?.top || 0))[0] || links[0] || null;
  }

  function kagiSidebarToggle() {
    return qsa("button,[role='button']", document)
      .filter((node) => {
        if (!visible(node)) return false;
        const box = rect(node);
        if (!box || box.top > 120 || box.left > 120 || box.width > 96 || box.height > 96) return false;
        const bits = elementText(node) + " " + svgText(node);
        return /show sidebar|sidebar|menu|侧边栏|菜单/i.test(bits) || !compact(bits);
      })
      .sort((a, b) => (rect(a)?.left || 0) - (rect(b)?.left || 0))[0] || null;
  }

  async function ensureKagiSidebarOpen(payload = {}) {
    if (kagiCurrentThreadLink(payload)) return true;
    const toggle = kagiSidebarToggle();
    if (toggle && clickAt(toggle)) {
      const link = await waitFor(() => kagiCurrentThreadLink(payload), 1600, 100);
      if (link) return true;
    }
    return Boolean(kagiCurrentThreadLink(payload));
  }

  function kagiCurrentTitleToken() {
    return compact((document.title || "").replace(/\s+-\s*Kagi Assistant\s*$/i, ""));
  }

  function kagiTitleButtons() {
    const titleToken = kagiCurrentTitleToken();
    return qsa("button,[role='button']", document)
      .filter((button) => {
        if (!visible(button)) return false;
        const box = rect(button);
        if (!box || box.top > 130 || box.width < 32 || box.height < 12 || box.height > 72) return false;
        const token = compact(elementText(button));
        if (/newthread|showsidebar|markaspermanent|permanent|kagiproducts|settings|searchthreads|folders|newfolder|copy|edit|regenerate|scroll|发送|设置|新建|搜索/.test(token)) return false;
        return /clicktorename|rename|重命名/.test(token) || (titleToken.length >= 4 && token.includes(titleToken));
      })
      .sort((a, b) => {
        const ar = rect(a);
        const br = rect(b);
        return (ar?.top || 0) - (br?.top || 0) || (ar?.left || 0) - (br?.left || 0);
      });
  }

  function kagiTopThreadMenuTrigger() {
    const titleButtons = kagiTitleButtons();
    const candidates = [];
    const seen = new Set();
    const selector = "button,[role='button'],[aria-haspopup],[aria-expanded],[tabindex]:not([tabindex='-1'])";
    const add = (node, titleButton, score = 0) => {
      const target = clickable(node);
      if (!target || seen.has(target) || target === titleButton || disabled(target) || !visible(target)) return;
      const box = rect(target);
      const titleBox = rect(titleButton);
      if (!box || !titleBox || box.top > 130 || box.width < 8 || box.height < 8 || box.width > 96 || box.height > 76) return;
      if (box.top > titleBox.bottom + 14 || box.bottom < titleBox.top - 14) return;
      if (box.left < titleBox.left - 16 || box.left > titleBox.right + 120) return;
      const value = elementText(target);
      const token = compact(value);
      if (/newthread|showsidebar|markaspermanent|permanent|kagiproducts|settings|searchthreads|folders|newfolder|copy|edit|regenerate|scroll|发送|设置|新建|搜索/.test(token)) return;
      const popup = String(target.getAttribute("aria-haspopup") || "").toLowerCase();
      const expanded = target.hasAttribute("aria-expanded");
      const signature = svgText(target).toLowerCase();
      const immediateTitleNeighbor = box.left >= titleBox.right - 8 && box.left <= titleBox.right + 44 && box.width <= 56 && box.height <= 56;
      const menuLike = popup === "menu"
        || popup === "true"
        || expanded
        || /more|menu|options|ellipsis|dots|dropdown|chevron|caret|arrow|down|triangle|更多|菜单|选项/.test(token)
        || /more|ellipsis|dots|dropdown|chevron|caret|arrow|down|triangle/.test(signature)
        || (!token && box.width <= 48)
        || immediateTitleNeighbor;
      if (!menuLike) return;
      seen.add(target);
      candidates.push({
        node: target,
        score: score
          + (popup === "menu" || popup === "true" ? 360 : 0)
          + (expanded ? 120 : 0)
          + (/dropdown|chevron|caret|arrow|down|triangle/.test(signature) ? 260 : 0)
          + (/more|menu|options|更多|菜单|选项/.test(token) ? 180 : 0)
          + (!token && box.width <= 48 ? 180 : 0)
          + Math.max(0, 280 - Math.abs(box.left - titleBox.right) * 4),
        top: box.top,
        left: box.left
      });
    };
    for (const titleButton of titleButtons) {
      for (let scope = titleButton.parentElement, depth = 0; scope && scope !== document.body && depth < 5; scope = scope.parentElement, depth += 1) {
        qsa(selector, scope).forEach((node) => add(node, titleButton, 180 - depth * 12));
      }
    }
    candidates.sort((a, b) => b.score - a.score || a.top - b.top || a.left - b.left);
    return candidates[0]?.node || null;
  }

  function kagiThreadRowFromLink(link) {
    if (!link) return null;
    const linkBox = rect(link);
    let best = link;
    for (let node = link.parentElement, depth = 0; node && node !== document.body && depth < 7; node = node.parentElement, depth += 1) {
      const box = rect(node);
      if (!box || box.width < 120 || box.height < 20 || box.height > 120) continue;
      if (linkBox && (box.top > linkBox.top + 10 || box.bottom < linkBox.bottom - 10)) continue;
      best = node;
      const hasMore = qsa("button,[role='button'],[aria-haspopup],[tabindex]:not([tabindex='-1'])", node)
        .some((item) => item !== link && rect(item));
      if (hasMore) break;
    }
    return best;
  }

  function hoverKagiThreadRow(row) {
    const box = rect(row);
    if (!box) return;
    const point = { clientX: Math.max(box.left + 16, box.right - 28), clientY: box.top + box.height / 2 };
    for (let node = row, depth = 0; node && node !== document.body && depth < 5; node = node.parentElement, depth += 1) {
      for (const type of ["pointerover", "mouseover", "mouseenter", "mousemove", "pointermove"]) {
        try {
          const Ctor = type.startsWith("pointer") ? eventCtor("PointerEvent", node) : eventCtor("MouseEvent", node);
          node.dispatchEvent(new Ctor(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
            ...point
          }));
        } catch {}
      }
    }
  }

  function kagiThreadMoreButton(link) {
    const row = kagiThreadRowFromLink(link);
    if (!row) return null;
    reveal(row);
    hoverKagiThreadRow(row);
    const rowBox = rect(row);
    if (!rowBox) return null;
    const candidates = [];
    const seen = new Set();
    const add = (node, score = 0) => {
      const target = clickable(node);
      if (!target || seen.has(target) || target === link || disabled(target)) return;
      const box = rect(target);
      if (!box || box.width < 8 || box.height < 8 || box.width > 88 || box.height > 88) return;
      if (box.top > rowBox.bottom + 12 || box.bottom < rowBox.top - 12) return;
      const bits = elementText(target) + " " + svgText(target);
      const token = compact(bits);
      const popup = String(target.getAttribute("aria-haspopup") || "").toLowerCase();
      const moreLike = /moreoptions|more|options|menu|ellipsis|dots|更多|菜单|选项/.test(token)
        || /more|ellipsis|dots|circle/.test(bits.toLowerCase())
        || popup === "menu"
        || qsa("circle", target).length >= 2
        || (!token && box.width <= 48);
      if (!moreLike) return;
      seen.add(target);
      candidates.push({
        node: target,
        score: score
          + (/moreoptions|more|options|menu|更多|菜单|选项/.test(token) ? 300 : 0)
          + (popup === "menu" ? 180 : 0)
          + Math.max(0, 120 - Math.abs(box.right - rowBox.right)),
        right: box.right
      });
    };
    for (let scope = row, depth = 0; scope && scope !== document.body && depth < 5; scope = scope.parentElement, depth += 1) {
      qsa("button,[role='button'],[aria-haspopup],[tabindex]:not([tabindex='-1'])", scope).forEach((node) => add(node, 90 - depth * 8));
    }
    for (const offset of [10, 22, 36, 54]) {
      const point = { clientX: Math.max(rowBox.left + 16, rowBox.right - offset), clientY: rowBox.top + rowBox.height / 2 };
      const node = document.elementFromPoint(point.clientX, point.clientY);
      add(node, 170 - offset);
      const pointButton = closest(node, "button,[role='button'],[aria-haspopup],[tabindex]:not([tabindex='-1'])");
      add(pointButton, 190 - offset);
    }
    candidates.sort((a, b) => b.score - a.score || b.right - a.right);
    return candidates[0]?.node || null;
  }

  async function deleteKagi(payload = {}) {
    if (findDeleteConfirmButton()) {
      const confirmedExisting = await clickDeleteConfirmIfPresent(6200);
      return confirmedExisting ? result(true) : result(false, "delete confirmation did not close");
    }
    if (!dispatchDeleteKeyboardShortcut()) return result(false, "delete shortcut dispatch failed");
    const shortcutConfirm = await clickDeleteConfirmIfAppears(2600, 4200);
    if (shortcutConfirm.confirmed) return result(true);
    if (shortcutConfirm.appeared || deleteDialogRoots().length) {
      return result(false, "delete shortcut opened confirmation but it did not close");
    }
    return result(false, "delete shortcut did not open confirmation");
  }

  async function deleteChatGpt(payload = {}) {
    if (findDeleteConfirmButton()) {
      const confirmedExisting = await clickDeleteConfirmIfPresent(6200);
      return confirmedExisting ? result(true) : resultWithTrustedDeleteConfirm("delete confirmation did not close");
    }
    if (!dispatchDeleteKeyboardShortcut()) {
      return payload?.trustedKeySequenceRetried
        ? result(false, "delete shortcut dispatch failed")
        : resultWithTrustedDeleteShortcut("delete shortcut dispatch failed");
    }
    const shortcutConfirm = await clickDeleteConfirmIfAppears(2600, 4200);
    if (shortcutConfirm.confirmed) return result(true);
    if (shortcutConfirm.appeared || deleteDialogRoots().length) {
      return resultWithTrustedDeleteConfirm("delete shortcut opened confirmation but it did not close");
    }
    return payload?.trustedKeySequenceRetried
      ? result(false, "delete shortcut did not open confirmation")
      : resultWithTrustedDeleteShortcut("delete shortcut did not open confirmation");
  }
__CHATCLUB_DELETE_SITE_HELPERS__

  async function deleteTopRight(site, deleteLabels, menuLabels, selectors = []) {
    const trigger = topRightMenuTrigger(menuLabels, selectors);
    if (!trigger) return result(false, "conversation menu trigger not found");
    if (!await openTriggerAndClickDelete(trigger, deleteLabels)) return result(false, "delete menu item not found");
    const confirmed = await clickDeleteConfirmIfPresent(5200);
    if (!confirmed) return { ...result(false, "delete confirmation button not found"), site };
    return { ...result(true), site };
  }

  const NOTION_DELETE_MENU_ROOT_SELECTOR = [
    "[role='menu']",
    "[role='listbox']",
    "[role='dialog']",
    "[data-radix-menu-content]",
    "[data-radix-popper-content-wrapper]",
    "[data-floating-ui-portal]",
    "[data-slot='dropdown-menu-content']",
    "[class*='dropdown' i]",
    "[class*='popover' i]",
    "[class*='popper' i]"
  ].join(",");
  const NOTION_DELETE_LABELS = ["Delete", "Delete topic", "删除", "删除话题"];

  function notionDeleteLabelMatchesExact(value) {
    let token = compact(value);
    if (!token) return false;
    const allowed = NOTION_DELETE_LABELS
      .map(compact)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    let parts = 0;
    while (token && parts < 8) {
      const next = allowed.find((label) => token.startsWith(label));
      if (!next) return false;
      token = token.slice(next.length);
      parts += 1;
    }
    return parts > 0 && !token;
  }

  function notionDeleteTargetLabelMatchesExact(target) {
    if (!target) return false;
    const semanticValues = [
      target.getAttribute?.("aria-label"),
      target.getAttribute?.("title"),
      target.innerText,
      target.textContent
    ].map((value) => String(value || "").trim()).filter(Boolean);
    if (semanticValues.length) return semanticValues.every(notionDeleteLabelMatchesExact);
    return notionDeleteLabelMatchesExact(elementText(target));
  }

  function notionDeleteLinkedMenuRoot(trigger = null) {
    const controlsId = String(trigger?.getAttribute?.("aria-controls") || "").trim();
    if (!controlsId) return null;
    try { return document.getElementById(controlsId) || null; } catch { return null; }
  }

  function notionDeleteMenuRoots(trigger = null) {
    const roots = [];
    const seen = new Set();
    const confirmationRoots = deleteDialogRoots();
    const add = (root) => {
      if (!root || root === trigger || seen.has(root) || !root.isConnected || !visible(root)) return;
      if (trigger && (root.contains?.(trigger) || trigger.contains?.(root))) return;
      if (confirmationRoots.some((dialog) => dialog === root || dialog.contains(root) || root.contains(dialog))) return;
      const box = rect(root);
      if (!box || box.width < 48 || box.height < 20 || box.width > 640 || box.height > 720) return;
      seen.add(root);
      roots.push(root);
    };
    add(notionDeleteLinkedMenuRoot(trigger));
    qsa(NOTION_DELETE_MENU_ROOT_SELECTOR, document).forEach(add);
    return roots.sort((a, b) => elementArea(a) - elementArea(b));
  }

  function notionDeleteItemCenterIsTopmost(node) {
    const box = rect(node);
    if (!node || !box) return false;
    let pointTarget = null;
    try { pointTarget = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2); } catch {}
    return Boolean(pointTarget && (pointTarget === node || node.contains?.(pointTarget)));
  }

  function findNotionDeleteMenuItem(root, trigger = null) {
    if (!root || !root.isConnected || !visible(root)) return null;
    const candidates = [];
    const seen = new Set();
    const add = (node, extraScore = 0) => {
      if (!node || node === trigger || seen.has(node) || !visible(node) || disabled(node)) return;
      const target = clickable(node);
      if (!target || target === trigger || target === root || seen.has(target) || !root?.contains?.(target)) return;
      if (!visible(target) || disabled(target)) return;
      if (!notionDeleteTargetLabelMatchesExact(target)) return;
      const box = rect(target);
      if (!box || box.width < 8 || box.height < 8 || box.width > 520 || box.height > 120) return;
      if (!notionDeleteItemCenterIsTopmost(target)) return;
      seen.add(node);
      seen.add(target);
      candidates.push({
        node: target,
        score: extraScore + (target.matches?.("[role='menuitem'],[role='option'],button,[role='button']") ? 240 : 0),
        top: box.top,
        area: box.width * box.height
      });
    };
    for (const node of qsa("[role='menuitem'],[role='option'],button,[role='button'],[tabindex]:not([tabindex='-1']),li,div,span", root)) {
      add(node, 320);
    }
    candidates.sort((a, b) => b.score - a.score || a.top - b.top || a.area - b.area);
    return candidates[0]?.node || null;
  }

  function notionDeleteMenuSession(trigger, baselineRoots = new Set()) {
    const linkedRoot = notionDeleteLinkedMenuRoot(trigger);
    for (const root of notionDeleteMenuRoots(trigger)) {
      if (root !== linkedRoot && baselineRoots.has(root)) continue;
      const item = findNotionDeleteMenuItem(root, trigger);
      if (item) return { root, item };
    }
    return null;
  }

  function refreshNotionDeleteMenuSession(session, trigger) {
    const root = session?.root || null;
    if (!root || !root.isConnected || !visible(root)) return null;
    if (!notionDeleteMenuRoots(trigger).includes(root)) return null;
    const item = findNotionDeleteMenuItem(root, trigger);
    return item ? { root, item } : null;
  }

  function notionDeleteConversationId() {
    try {
      const url = new URL(String(location.href || ""));
      const host = url.hostname.toLowerCase();
      if (!(host === "app.notion.com" || host === "notion.so" || host.endsWith(".notion.so"))) return "";
      return /^\/chat\/?$/i.test(url.pathname || "/") ? String(url.searchParams.get("t") || "") : "";
    } catch {
      return "";
    }
  }

  function notionDeleteRouteGuard(payload = {}) {
    const expected = payload?.expectedDeleteIdentity;
    const expectedId = expected
      ? (expected.provider === "notion" ? String(expected.id || "").trim() : "")
      : notionDeleteConversationId();
    return () => Boolean(expectedId) && notionDeleteConversationId() === expectedId;
  }

  async function openNotionDeleteMenu(trigger, routeStillCurrent) {
    const baselineRoots = new Set(notionDeleteMenuRoots(trigger));
    if (!routeStillCurrent()) return null;
    const session = await clickUntil(
      trigger,
      () => routeStillCurrent() && notionDeleteMenuSession(trigger, baselineRoots),
      { settleMs: 220 }
    );
    if (!session || !routeStillCurrent()) return null;
    await sleep(120);
    return waitFor(() => routeStillCurrent() && refreshNotionDeleteMenuSession(session, trigger), 1800, 80);
  }

  function notionDeleteConfirmationOwnership(baselineRoots = null) {
    const button = findDeleteConfirmButton();
    if (!button || !button.isConnected || !visible(button)) return null;
    const root = deleteDialogRoots().find((candidate) => candidate === button || candidate.contains(button)) || null;
    if (!root || !root.isConnected || !visible(root) || baselineRoots?.has(root)) return null;
    return { root, button };
  }

  function notionDeleteConfirmationOwnershipIsCurrent(ownership, routeStillCurrent) {
    const root = ownership?.root || null;
    const button = ownership?.button || null;
    if (!root || !button || !routeStillCurrent()) return false;
    if (!root.isConnected || !button.isConnected || !visible(root) || !visible(button) || !root.contains(button)) return false;
    if (findDeleteConfirmButton() !== button) return false;
    return deleteDialogRoots().some((candidate) => candidate === root);
  }

  async function waitForNotionDeleteMenuOutcome(session, trigger, routeStillCurrent, confirmationBaseline, timeoutMs = 1800) {
    const confirmation = await waitFor(() => {
      if (!routeStillCurrent()) return null;
      return notionDeleteConfirmationOwnership(confirmationBaseline);
    }, timeoutMs, 90);
    if (!routeStillCurrent()) return { state: "route-changed", item: null };
    if (confirmation) return { state: "confirmation", confirmation };
    const currentSession = refreshNotionDeleteMenuSession(session, trigger);
    return currentSession ? { state: "menu-open", session: currentSession } : { state: "uncertain" };
  }

  function resultWithNotionTrustedMenuClick(reason, node) {
    const value = result(false, reason);
    const trustedMenuClick = trustedMenuClickForElement(node, reason);
    return trustedMenuClick ? { ...value, needsTrustedMenuClick: true, trustedMenuClick } : value;
  }

  async function finishNotionDeleteConfirmation(ownership, routeStillCurrent) {
    const ownershipGuard = () => notionDeleteConfirmationOwnershipIsCurrent(ownership, routeStillCurrent);
    if (!ownershipGuard()) return result(false, "delete confirmation ownership is uncertain");
    const confirmed = await clickDeleteConfirmIfPresent(6500, ownershipGuard);
    if (confirmed) return result(true);
    if (!routeStillCurrent()) return result(false, "current conversation changed during delete confirmation");
    if (!ownershipGuard()) return result(false, "delete confirmation ownership changed");
    return resultWithTrustedDeleteConfirm("delete confirmation did not close");
  }

  async function deleteNotion(payload = {}) {
    const routeStillCurrent = notionDeleteRouteGuard(payload);
    if (!routeStillCurrent()) return result(false, "stable current conversation identity not found");
    if (payload?.trustedMenuClickRetried) {
      const confirmation = notionDeleteConfirmationOwnership()
        || await waitFor(() => routeStillCurrent() && notionDeleteConfirmationOwnership(), 3000, 90);
      if (!routeStillCurrent()) return result(false, "current conversation changed during trusted delete menu click");
      if (confirmation) return finishNotionDeleteConfirmation(confirmation, routeStillCurrent);
      return result(false, "trusted delete menu click did not open an owned confirmation");
    }
    if (findDeleteConfirmButton() || deleteDialogRoots().length) {
      return result(false, "unverified delete confirmation is already open");
    }
    const selectors = [
      "button[aria-label*='Delete, rename, and more' i]",
      "[role='button'][aria-label*='Delete, rename, and more' i]",
      "button[aria-label*='delete, rename' i]",
      "[role='button'][aria-label*='delete, rename' i]",
      "button[aria-label*='删除'][aria-label*='重命名']",
      "[role='button'][aria-label*='删除'][aria-label*='重命名']",
      "button[aria-label*='more' i][aria-haspopup='menu']",
      "[role='button'][aria-label*='more' i][aria-haspopup='menu']"
    ];
    const trigger = topRightMenuTrigger(["Delete, rename, and more", "More", "更多", "删除", "重命名"], selectors);
    if (!trigger) return result(false, "conversation menu trigger not found");
    let session = await openNotionDeleteMenu(trigger, routeStillCurrent);
    if (!session) return result(false, routeStillCurrent() ? "owned delete menu item not found" : "current conversation changed before delete menu opened");
    await sleep(120);
    session = refreshNotionDeleteMenuSession(session, trigger);
    if (!session || !routeStillCurrent()) {
      return result(false, routeStillCurrent() ? "owned delete menu item changed before activation" : "current conversation changed before delete activation");
    }
    if (findDeleteConfirmButton() || deleteDialogRoots().length) {
      return result(false, "unverified delete confirmation appeared before delete activation");
    }
    const confirmationBaseline = new Set(deleteDialogRoots());
    clickAt(session.item);
    const outcome = await waitForNotionDeleteMenuOutcome(session, trigger, routeStillCurrent, confirmationBaseline);
    if (outcome.state === "confirmation") return finishNotionDeleteConfirmation(outcome.confirmation, routeStillCurrent);
    if (outcome.state === "menu-open") return resultWithNotionTrustedMenuClick("delete menu item did not open confirmation", outcome.session.item);
    if (outcome.state === "route-changed") return result(false, "current conversation changed after delete activation");
    return result(false, "delete menu item outcome is uncertain");
  }

  function deepSeekChatId(value) {
    const match = String(value || "").match(/\/(?:a\/)?chat\/s\/([^/?#]+)/i);
    return match ? match[1] : "";
  }
  function deepSeekTitleToken(value) {
    const raw = normalize(value).replace(/\s*[-|–]\s*DeepSeek.*$/i, "").replace(/\s*-\s*深度求索.*$/i, "");
    const token = compact(raw);
    return /^(deepseek|deepseekintotheunknown|intotheunknown|newchat|新聊天)$/.test(token) ? "" : token;
  }
  function deepSeekLinks(root = document) {
    return qsa("a[href*='/chat/s/'],a[href*='/a/chat/s/']", root).filter((link) => visible(link) && rect(link));
  }
  function deepSeekSidebarRoot() {
    const links = deepSeekLinks(document).filter((link) => {
      const box = rect(link);
      return box && box.left <= 480 && box.width >= 80 && box.height >= 18 && box.height <= 110;
    });
    if (links.length) {
      const roots = [];
      const add = (node) => {
        if (!node || roots.includes(node)) return;
        const box = rect(node);
        if (!box || box.left > 560 || box.width < 100 || box.width > 620 || box.height < 40) return;
        if (deepSeekLinks(node).length >= 1) roots.push(node);
      };
      for (const link of links.slice(0, 6)) {
        for (let node = link; node && node !== document.body; node = node.parentElement) add(node);
      }
      roots.sort((a, b) => deepSeekLinks(b).length - deepSeekLinks(a).length || (rect(b)?.height || 0) - (rect(a)?.height || 0));
      if (roots[0]) return roots[0];
    }
    return null;
  }
  async function ensureDeepSeekSidebarOpen() {
    if (deepSeekSidebarRoot()) return true;
    const toggles = qsa("button,[role='button']", document)
      .filter((node) => {
        const box = rect(node);
        if (!box || box.top > 96 || box.left > 140 || box.width > 80 || box.height > 80) return false;
        const bits = elementText(node) + " " + svgText(node);
        return /sidebar|menu|panel|sider|侧边栏|菜单|M9\.67269/i.test(bits) || !compact(bits);
      })
      .sort((a, b) => (rect(a)?.left || 0) - (rect(b)?.left || 0));
    for (const toggle of toggles.slice(0, 4)) {
      clickAt(toggle);
      if (await waitFor(deepSeekSidebarRoot, 1800, 120)) return true;
    }
    for (const point of [{ clientX: 22, clientY: 28 }, { clientX: 22, clientY: 48 }, { clientX: 46, clientY: 28 }, { clientX: 46, clientY: 48 }]) {
      const target = document.elementFromPoint(point.clientX, point.clientY);
      if (target && clickAt(target, point) && await waitFor(deepSeekSidebarRoot, 1600, 120)) return true;
    }
    return Boolean(deepSeekSidebarRoot());
  }
  function deepSeekHints(payload = {}) {
    const hrefs = [location.href, payload.currentThreadHref, payload.currentHref, payload.cachedHref, payload.href, payload.url].filter(Boolean);
    return {
      ids: hrefs.map(deepSeekChatId).filter(Boolean),
      titleTokens: [document.title, payload.currentTitle, payload.title].map(deepSeekTitleToken).filter(Boolean)
    };
  }
  function deepSeekCurrentRow(root) {
    if (!root) return null;
    const links = deepSeekLinks(root);
    const currentId = deepSeekChatId(location.href);
    if (!currentId) return null;
    return links.find((link) => deepSeekChatId(link.href || link.getAttribute?.("href")) === currentId) || null;
  }
  function deepSeekVisualRow(row) {
    const rowBox = rect(row);
    if (!row || !rowBox) return row;
    const rowText = compact(elementText(row));
    let best = { node: row, score: 0 };
    for (let node = row, depth = 0; node && node !== document.body && depth < 8; node = node.parentElement, depth += 1) {
      const box = rect(node);
      if (!box || box.left > 560 || box.width < 110 || box.width > 620 || box.height < 28 || box.height > 110) continue;
      if (box.top > rowBox.top + 10 || box.bottom < rowBox.bottom - 10) continue;
      const token = compact(elementText(node));
      if (rowText && token && !token.includes(rowText) && !rowText.includes(token)) continue;
      const className = String(node.className || "");
      const active = /\b(active|selected|current)\b/i.test(className) || String(node.getAttribute?.("aria-current") || "").toLowerCase() === "page";
      const buttons = qsa("button,[role='button'],[aria-haspopup],[aria-expanded],[tabindex]:not([tabindex='-1'])", node).length;
      const score = box.width + (active ? 420 : 0) + Math.min(buttons, 3) * 90 - depth * 12;
      if (score > best.score) best = { node, score };
    }
    return best.node || row;
  }
  function deepSeekRowMenuRightEdge(row, visualRow = row) {
    const rowBox = rect(visualRow) || rect(row);
    if (!rowBox) return 0;
    const roots = [];
    const sidebar = deepSeekSidebarRoot();
    if (sidebar) roots.push(sidebar);
    for (let node = visualRow || row; node && node !== document.body && roots.length < 8; node = node.parentElement) roots.push(node);
    const rights = roots
      .map((node) => rect(node))
      .filter((box) => box
        && box.left <= 560
        && box.width >= 140
        && box.width <= 620
        && box.top <= rowBox.top + 8
        && box.bottom >= rowBox.bottom - 8)
      .map((box) => box.right);
    return Math.max(rowBox.right, ...rights);
  }
  function deepSeekTopicMenuRect(row) {
    const visualRow = deepSeekVisualRow(row);
    const rowBox = rect(visualRow) || rect(row);
    if (!rowBox) return null;
    const right = Math.max(rowBox.right, deepSeekRowMenuRightEdge(row, visualRow));
    return {
      left: rowBox.left,
      top: rowBox.top,
      right,
      bottom: rowBox.bottom,
      width: right - rowBox.left,
      height: rowBox.height
    };
  }
  function deepSeekTrustedMenuClick(row, trigger = null, reason = "topic menu trigger requires trusted browser input") {
    const rowBox = deepSeekTopicMenuRect(row);
    const triggerClick = trustedMenuClickForElement(trigger, reason);
    if (!rowBox) return triggerClick;
    const y = rowBox.top + rowBox.height / 2;
    const points = [18, 28, 38, 48, 60, 76, 96, 118, 142]
      .map((offset) => ({
        x: Math.max(rowBox.left + 16, rowBox.right - offset),
        y
      }));
    if (triggerClick?.framePoint) points.push(triggerClick.framePoint);
    const seen = new Set();
    const framePoints = points
      .map((point) => ({
        x: Math.round(Number(point.x) * 100) / 100,
        y: Math.round(Number(point.y) * 100) / 100
      }))
      .filter((point) => {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
        const key = String(point.x) + "," + String(point.y);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    const primary = framePoints[0];
    const trustedMenuClick = primary
      ? trustedMenuClickPoint(reason, primary, serializableRect(rowBox))
      : triggerClick;
    return trustedMenuClick ? { ...trustedMenuClick, framePoints, hoverSettleMs: 360 } : null;
  }
  function resultWithDeepSeekTrustedMenuClick(reason, row, trigger = null) {
    const value = result(false, reason);
    const trustedMenuClick = deepSeekTrustedMenuClick(row, trigger, reason);
    return trustedMenuClick ? { ...value, needsTrustedMenuClick: true, trustedMenuClick } : value;
  }
  function deepSeekTrustedKeySequence(row, reason = "topic menu trigger requires keyboard focus") {
    const rowBox = deepSeekTopicMenuRect(row);
    const visualBox = rect(deepSeekVisualRow(row)) || rect(row) || rowBox;
    if (!rowBox || !visualBox) return null;
    const focusX = Math.min(
      rowBox.right - 104,
      Math.max(rowBox.left + 24, visualBox.left + Math.min(180, visualBox.width * 0.42))
    );
    return {
      kind: "topic-menu-keyboard",
      site: SITE_ID,
      reason: String(reason || ""),
      framePoint: {
        x: Math.round(focusX * 100) / 100,
        y: Math.round((rowBox.top + rowBox.height / 2) * 100) / 100
      },
      frameRect: serializableRect(rowBox),
      keys: [
        { key: "Tab", settleMs: 140 },
        { key: "Enter", settleMs: 260 }
      ],
      clickSettleMs: 160,
      keySettleMs: 140,
      settleMs: 460
    };
  }
  function resultWithDeepSeekTrustedKeySequence(reason, row) {
    const value = result(false, reason);
    const trustedKeySequence = deepSeekTrustedKeySequence(row, reason);
    const trustedMenuClick = deepSeekTrustedMenuClick(row, null, reason);
    return {
      ...value,
      ...(trustedKeySequence ? { needsTrustedKeySequence: true, trustedKeySequence } : {}),
      ...(trustedMenuClick ? { needsTrustedMenuClick: true, trustedMenuClick } : {})
    };
  }
  function resultWithDeepSeekTrustedHover(reason, row) {
    const value = result(false, reason);
    const rowBox = deepSeekTopicMenuRect(row);
    const trustedHover = rowBox
      ? {
        kind: "topic-menu-hover",
        site: SITE_ID,
        reason: String(reason || ""),
        framePoint: {
          x: Math.round(Math.max(rowBox.left + 16, rowBox.right - 28) * 100) / 100,
          y: Math.round((rowBox.top + rowBox.height / 2) * 100) / 100
        },
        frameRect: serializableRect(rowBox),
        hoverSettleMs: 520
      }
      : trustedHoverRightEdge(deepSeekVisualRow(row) || row, reason);
    return trustedHover ? { ...value, needsTrustedHover: true, trustedHover } : value;
  }
  function closeDeepSeekTransientMenus() {
    try {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true, composed: true }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true, composed: true }));
    } catch {}
  }
  function deepSeekHeaderMenuButton(hints = deepSeekHints()) {
    const titleTokens = (hints.titleTokens || []).filter(Boolean);
    if (!titleTokens.length) return null;
    const titleNodes = [];
    const seenTitles = new Set();
    for (const node of qsa("h1,h2,h3,button,[role='button'],div,span", document)) {
      if (!node || seenTitles.has(node) || !visible(node)) continue;
      const box = rect(node);
      if (!box || box.top < 0 || box.top > 190 || box.left < 120 || box.width < 20 || box.height < 14 || box.height > 92) continue;
      if (String(node.href || node.getAttribute?.("href") || "").match(/\/(?:a\/)?chat\/s\//i)) continue;
      if (node.closest?.("a[href*='/chat/s/'],a[href*='/a/chat/s/']") || qsa("a[href*='/chat/s/'],a[href*='/a/chat/s/']", node).length) continue;
      const token = compact(elementText(node));
      if (!token || !titleTokens.some((item) => token.includes(item) || item.includes(token))) continue;
      seenTitles.add(node);
      titleNodes.push({ node, box });
    }
    const candidates = [];
    const seenButtons = new Set();
    const addButton = (button, titleBox, extraScore = 0) => {
      const target = clickable(button);
      if (!target || seenButtons.has(target) || disabled(target)) return;
      const box = rect(target);
      if (!box || box.width < 10 || box.height < 10 || box.width > 76 || box.height > 76) return;
      if (box.top > titleBox.bottom + 34 || box.bottom < titleBox.top - 34) return;
      if (box.left < titleBox.left - 72 || box.left > titleBox.right + 260) return;
      if (String(target.href || target.getAttribute?.("href") || "").match(/\/(?:a\/)?chat\/s\//i)) return;
      const value = elementText(target);
      const token = compact(value);
      if (/newchat|sidebar|back|close|search|send|deepthink|model|expert|share|copy|新聊天|侧边栏|返回|关闭|搜索|发送|分享|复制/.test(token)) return;
      const signature = compact(svgText(target));
      const iconish = !token || /more|menu|options|ellipsis|dots|circle|kebab|更多|菜单|选项/.test(token + signature) || qsa("circle", target).length >= 2 || box.width <= 44;
      if (!iconish) return;
      seenButtons.add(target);
      candidates.push({
        node: target,
        score: extraScore
          + (box.left >= titleBox.right - 8 ? 520 : 0)
          + (!token ? 180 : 0)
          + (/more|menu|options|ellipsis|dots|更多|菜单|选项/.test(token + signature) ? 360 : 0)
          + (/circle|dots|ellipsis|kebab/.test(signature) ? 180 : 0)
          + Math.max(0, 160 - Math.abs(box.left - titleBox.right)),
        right: box.right,
        left: box.left
      });
    };
    for (const { node, box: titleBox } of titleNodes.slice(0, 8)) {
      for (let scope = node, depth = 0; scope && scope !== document.body && depth < 5; scope = scope.parentElement, depth += 1) {
        const scopeBox = rect(scope);
        if (!scopeBox || scopeBox.top > 210 || scopeBox.height > 180 || scopeBox.width > 900) continue;
        qsa("button,[role='button'],[aria-haspopup],[aria-expanded],[tabindex]:not([tabindex='-1'])", scope).forEach((button) => addButton(button, titleBox, 120 - depth * 12));
      }
      qsa("button,[role='button'],[aria-haspopup],[aria-expanded],[tabindex]:not([tabindex='-1'])", document)
        .forEach((button) => addButton(button, titleBox, 0));
    }
    candidates.sort((a, b) => b.score - a.score || b.right - a.right || b.left - a.left);
    return candidates[0]?.node || null;
  }
  function hoverRow(row) {
    const box = rect(row);
    if (!box) return;
    const point = { clientX: Math.max(box.left + 16, box.right - 28), clientY: box.top + box.height / 2 };
    for (let node = row, depth = 0; node && node !== document.body && depth < 5; node = node.parentElement, depth += 1) {
      for (const type of ["pointerover", "mouseover", "mouseenter", "mousemove", "pointermove"]) {
        try {
          const Ctor = type.startsWith("pointer") ? PointerEvent : MouseEvent;
          node.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, composed: true, view: window, pointerId: 1, pointerType: "mouse", isPrimary: true, ...point }));
        } catch {}
      }
    }
  }
  function deepSeekMoreButton(row) {
    reveal(row);
    const visualRow = deepSeekVisualRow(row);
    hoverRow(visualRow || row);
    const rowBox = deepSeekTopicMenuRect(row);
    if (!rowBox) return null;
    const candidates = [];
    const seen = new Set();
    const add = (node, score = 0) => {
      const target = clickable(node);
      if (!target || seen.has(target) || target === row || disabled(target)) return;
      const box = rect(target);
      if (!box || box.width < 8 || box.height < 8 || box.width > 84 || box.height > 84) return;
      if (box.top > rowBox.bottom + 12 || box.bottom < rowBox.top - 12 || box.left < rowBox.right - 120 || box.left > rowBox.right + 80) return;
      const bits = elementText(target) + " " + svgText(target);
      const token = compact(bits);
      if (token && !/more|options|menu|ellipsis|dots|circle|更多|菜单|选项/.test(token)) return;
      if (String(target.href || target.getAttribute?.("href") || "").match(/\/(?:a\/)?chat\/s\//i)) return;
      seen.add(target);
      candidates.push({ node: target, score: score + (!token ? 180 : 0) + (/more|options|menu|更多|菜单|选项/.test(token) ? 220 : 0) + Math.max(0, 90 - Math.abs((box.left + box.right) / 2 - (rowBox.right - 28))), right: box.right });
    };
    const iconSelector = "button,[role='button'],[aria-haspopup],[tabindex]:not([tabindex='-1']),[class*='button' i],[class*='btn' i],svg,[class*='more' i],[class*='menu' i],[class*='option' i],[class*='action' i],[class*='ellipsis' i]";
    const scopes = [];
    for (const seed of [visualRow, row]) {
      for (let scope = seed, depth = 0; scope && scope !== document.body && depth < 5; scope = scope.parentElement, depth += 1) {
        if (!scopes.includes(scope)) scopes.push(scope);
      }
    }
    for (let index = 0; index < scopes.length; index += 1) {
      qsa(iconSelector, scopes[index]).forEach((node) => add(node, 120 - index * 8));
    }
    for (const offset of [18, 28, 38, 48, 60, 76, 96, 118, 142]) {
      const point = { clientX: Math.max(rowBox.left + 16, rowBox.right - offset), clientY: rowBox.top + rowBox.height / 2 };
      const node = document.elementFromPoint(point.clientX, point.clientY);
      add(node, 180 - offset);
    }
    qsa(iconSelector, document).forEach((node) => add(node, 0));
    candidates.sort((a, b) => b.score - a.score || b.right - a.right);
    return candidates[0]?.node || null;
  }
  let deepSeekPendingTrustedAttempt = null;
  function deepSeekTrustedRetryRequested(payload = {}) {
    return Boolean(payload?.trustedMenuClickRetried || payload?.trustedKeySequenceRetried);
  }
  function deepSeekAttemptIdentity(payload = {}) {
    return { attemptId: normalize(payload?.deleteAttemptId), routeId: deepSeekChatId(location.href) };
  }
  function deepSeekTrustedRetryOwned(payload = {}) {
    const identity = deepSeekAttemptIdentity(payload);
    return Boolean(
      identity.attemptId
      && identity.routeId
      && deepSeekPendingTrustedAttempt?.attemptId === identity.attemptId
      && deepSeekPendingTrustedAttempt?.routeId === identity.routeId
      && deepSeekPendingTrustedAttempt?.phase === "awaiting-menu-trigger"
      && deepSeekPendingTrustedAttempt?.baseline === "no-delete-ui"
      && Number(deepSeekPendingTrustedAttempt?.expiresAt) >= Date.now()
    );
  }
  function armDeepSeekTrustedRetry(payload = {}, value = {}) {
    const identity = deepSeekAttemptIdentity(payload);
    if (!identity.attemptId || !identity.routeId) {
      deepSeekPendingTrustedAttempt = null;
      return result(false, (value.reason || "trusted retry required") + "; trusted retry ownership unavailable");
    }
    deepSeekPendingTrustedAttempt = { ...identity, phase: "awaiting-menu-trigger", baseline: "no-delete-ui", expiresAt: Date.now() + 20000 };
    return value;
  }
  async function deleteDeepSeek(payload = {}) {
    const currentRouteId = deepSeekChatId(location.href);
    if (!currentRouteId) return result(false, "stable current conversation route is required");
    const retryRequested = deepSeekTrustedRetryRequested(payload);
    const retryOwned = retryRequested && deepSeekTrustedRetryOwned(payload);
    if (retryRequested && !retryOwned) return result(false, "trusted delete retry does not match the pending attempt and route");
    deepSeekPendingTrustedAttempt = null;
    await ensureDeepSeekSidebarOpen();
    const routeStillCurrent = () => deepSeekChatId(location.href) === currentRouteId;
    if (!routeStillCurrent()) return result(false, "current conversation changed while preparing deletion");
    const hints = deepSeekHints(payload);
    const labels = ["Delete", "删除"];
    if (findDeleteConfirmButton()) return result(false, "unverified delete confirmation is already open");
    if (retryOwned) {
      const deleteItem = await waitFor(() => findOpenDeleteMenuItem(labels), 3200, 90);
      if (deleteItem) {
        if (!routeStillCurrent()) return result(false, "current conversation changed during trusted menu retry");
        if (!clickAt(deleteItem)) return result(false, "explicit Delete action could not be safely activated");
        const confirmedAfterTrustedMenu = await clickDeleteConfirmIfPresent(6500, routeStillCurrent);
        if (!confirmedAfterTrustedMenu) return result(false, "delete confirmation button not found");
        return result(true);
      }
      if (payload?.trustedMenuClickRetried) {
        if (!routeStillCurrent()) return result(false, "current conversation changed during trusted menu retry");
        if (findOpenDeleteMenuItem(labels) || findDeleteConfirmButton()) {
          return result(false, "delete menu state is not clean; trusted retry was not renewed");
        }
        return armDeepSeekTrustedRetry(payload, result(false, "trusted topic menu click did not open"));
      }
    }
    const root = deepSeekSidebarRoot();
    const row = deepSeekCurrentRow(root);
    let rowFailureReason = "current topic row not found";
    let moreButton = null;
    if (row) {
      moreButton = await waitFor(() => deepSeekMoreButton(row), 1800, 100);
      if (moreButton) {
        if (await openTriggerAndClickDelete(moreButton, labels, { timeoutMs: 2800, allowHiddenTrigger: true, requireFreshMenu: true, guard: routeStillCurrent })) {
          const confirmed = await clickDeleteConfirmIfPresent(6500, routeStillCurrent);
          if (!confirmed) return result(false, "delete confirmation button not found");
          return result(true);
        }
        rowFailureReason = "delete menu item not found";
      } else {
        rowFailureReason = "topic menu trigger not found";
      }
      closeDeepSeekTransientMenus();
    }
    if (!routeStillCurrent()) return result(false, "current conversation changed before delete activation");
    const headerButton = deepSeekHeaderMenuButton(hints);
    if (headerButton && await openTriggerAndClickDelete(headerButton, labels, { timeoutMs: 2600, allowHiddenTrigger: true, requireFreshMenu: true, guard: routeStillCurrent })) {
      const confirmedFromHeader = await clickDeleteConfirmIfPresent(6500, routeStillCurrent);
      if (!confirmedFromHeader) return result(false, "delete confirmation button not found");
      return result(true);
    }
    if (headerButton) closeDeepSeekTransientMenus();
    if (!row) return result(false, rowFailureReason);
    const cleanBaseline = await waitFor(() => !findOpenDeleteMenuItem(labels) && !findDeleteConfirmButton(), 700, 70);
    if (!cleanBaseline) return result(false, "delete menu state remained open; trusted retry was not leased");
    return armDeepSeekTrustedRetry(
      payload,
      payload?.trustedKeySequenceRetried
        ? resultWithDeepSeekTrustedMenuClick(rowFailureReason, row, moreButton)
        : resultWithDeepSeekTrustedKeySequence(rowFailureReason, row)
    );
  }

  const runners = {
__CHATCLUB_DELETE_SITE_RUNNER__    chatgpt: deleteChatGpt,
    kagi: deleteKagi,
    grok: () => deleteTopRight("grok", ["Delete Chat", "Delete chat", "Delete", "删除聊天", "删除"], ["More", "More actions", "Menu", "Options", "更多", "菜单"]),
    grokMirror: () => deleteTopRight("grokMirror", ["Delete Chat", "Delete chat", "Delete", "删除聊天", "删除"], ["More", "More actions", "Menu", "Options", "更多", "菜单"]),
    notion: deleteNotion,
    deepseek: deleteDeepSeek
  };

  async function run(payload = {}) {
    const runner = runners[SITE_ID];
    if (!runner) return result(false, "unsupported site");
    try {
      const value = await runner(payload || {});
      return value && typeof value === "object" ? value : result(Boolean(value));
    } catch (error) {
      return result(false, error && error.message ? error.message : String(error));
    }
  }

  async function menuCommand(payload = {}) {
    return run(payload || {});
  }

  function matchesRequestSite(value) {
    const incoming = compact(value);
    return !incoming || SITE_KEYS.some((item) => compact(item) === incoming);
  }

  function matchesRequestScript(detail = {}) {
    const requested = compact(detail.scriptId || detail.script || "");
    return !requested || requested === compact(SITE_ID);
  }

  function matchesRequestedVersion(detail = {}) {
    const requested = String(detail.version || detail.expectedVersion || "").trim();
    return !requested || requested === VERSION;
  }

  function matchesRequestMessageType(type) {
    return type === "request" || type === "request:" + VERSION;
  }

  function matchesMenuCommandMessageType(type) {
    return type === "menu-command" || type === "menu-command:" + VERSION;
  }

  function dispatchResult(id, value) {
    const detail = { id, ...(value && typeof value === "object" ? value : result(Boolean(value))) };
    window.dispatchEvent(new CustomEvent(RESULT_EVENT, { detail }));
    window.postMessage({ source: BRIDGE_SOURCE, type: "result", detail }, "*");
  }

  function dispatchReady(id) {
    const detail = {
      id,
      site: SITE_ID,
      siteId: SITE_ID,
      scriptId: SITE_ID,
      name: SITE_NAME,
      version: VERSION,
      menuCommand: true,
      menuCommandEvent: MENU_COMMAND_EVENT,
      versionedMenuCommandEvent: VERSIONED_MENU_COMMAND_EVENT
    };
    window.dispatchEvent(new CustomEvent(READY_EVENT, { detail }));
    window.postMessage({ source: BRIDGE_SOURCE, type: "ready", detail }, "*");
  }

  function handlePingDetail(detail = {}) {
    if (!active) return;
    if (!matchesRequestSite(detail.site || detail.siteId || detail.name)) return;
    if (!matchesRequestScript(detail)) return;
    if (!matchesRequestedVersion(detail)) return;
    dispatchReady(detail.id || SITE_ID + "-" + Date.now());
  }

  function onPing(event) {
    handlePingDetail(event && event.detail || {});
  }

  async function handleRequestDetail(detail = {}) {
    if (!active) return;
    if (!matchesRequestSite(detail.site || detail.siteId || detail.name)) return;
    if (!matchesRequestScript(detail)) return;
    if (!matchesRequestedVersion(detail)) return;
    const id = detail.id || SITE_ID + "-" + Date.now();
    if (handledRequestIds.has(id)) return;
    handledRequestIds.add(id);
    setTimeout(() => handledRequestIds.delete(id), 60000);
    dispatchResult(id, await run(detail.payload || detail.data || {}));
  }

  async function handleMenuCommandDetail(detail = {}) {
    if (!active) return;
    if (!matchesRequestSite(detail.site || detail.siteId || detail.name)) return;
    if (!matchesRequestScript(detail)) return;
    if (!matchesRequestedVersion(detail)) return;
    const id = detail.id || SITE_ID + "-" + Date.now();
    if (handledRequestIds.has(id)) return;
    handledRequestIds.add(id);
    setTimeout(() => handledRequestIds.delete(id), 60000);
    dispatchResult(id, await menuCommand(detail.payload || detail.data || {}));
  }

  function onRequest(event) {
    handleRequestDetail(event && event.detail || {});
  }

  function onMenuCommand(event) {
    handleMenuCommandDetail(event && event.detail || {});
  }

  function onMessage(event) {
    const message = event.data || {};
    if (message.source !== BRIDGE_SOURCE) return;
    if (message.type === "ping") handlePingDetail(message.detail || {});
    else if (matchesMenuCommandMessageType(message.type)) handleMenuCommandDetail(message.detail || {});
    else if (matchesRequestMessageType(message.type)) handleRequestDetail(message.detail || {});
  }

  function dispose() {
    active = false;
    window.removeEventListener(PING_EVENT, onPing);
    window.removeEventListener(REQUEST_EVENT, onRequest);
    window.removeEventListener(VERSIONED_REQUEST_EVENT, onRequest);
    window.removeEventListener(MENU_COMMAND_EVENT, onMenuCommand);
    window.removeEventListener(VERSIONED_MENU_COMMAND_EVENT, onMenuCommand);
    window.removeEventListener("message", onMessage);
  }

  const registry = rootWindow[GLOBAL_NAME] || {};
  try { registry[SITE_ID] && typeof registry[SITE_ID].dispose === "function" && registry[SITE_ID].dispose(); } catch {}
  registry[SITE_ID] = { run, menuCommand, dispose, id: SITE_ID, site: SITE_ID, siteId: SITE_ID, scriptId: SITE_ID, name: SITE_NAME, version: VERSION, menuCommandSupported: true, pingEvent: PING_EVENT, readyEvent: READY_EVENT, requestEvent: REQUEST_EVENT, versionedRequestEvent: VERSIONED_REQUEST_EVENT, menuCommandEvent: MENU_COMMAND_EVENT, versionedMenuCommandEvent: VERSIONED_MENU_COMMAND_EVENT, resultEvent: RESULT_EVENT };
  rootWindow[GLOBAL_NAME] = registry;
  window.addEventListener(PING_EVENT, onPing);
  window.addEventListener(REQUEST_EVENT, onRequest);
  window.addEventListener(VERSIONED_REQUEST_EVENT, onRequest);
  window.addEventListener(MENU_COMMAND_EVENT, onMenuCommand);
  window.addEventListener(VERSIONED_MENU_COMMAND_EVENT, onMenuCommand);
  window.addEventListener("message", onMessage);

  if (typeof GM_registerMenuCommand === "function") {
    GM_registerMenuCommand("ChatClub Delete: " + SITE_NAME, async () => {
      const value = await menuCommand({});
      console.log("[ChatClub Delete] " + SITE_NAME, value);
    });
  }
})();
`;

export const DELETE_USERSCRIPT_ENGINE_SITES = DELETE_USERSCRIPT_ENGINE_SITES_RAW.slice(1);
