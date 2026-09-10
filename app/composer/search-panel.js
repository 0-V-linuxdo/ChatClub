import { t } from "../../shared/i18n.js";
import { el } from "../../ui/dom.js";

const SEARCH_RESULTS_LIMIT = 12;

function highlightQuery(text, query) {
  const value = String(text || "");
  const needle = String(query || "").trim();
  if (!needle) return [value];
  const lower = value.toLowerCase();
  const match = needle.toLowerCase();
  const nodes = [];
  let from = 0;
  let index = lower.indexOf(match, from);
  while (index >= 0) {
    if (index > from) nodes.push(value.slice(from, index));
    nodes.push(el("mark", { class: "workspace-tabs-search-mark" }, value.slice(index, index + needle.length)));
    from = index + needle.length;
    index = lower.indexOf(match, from);
  }
  if (from < value.length) nodes.push(value.slice(from));
  return nodes.length ? nodes : [value];
}

function recordTitle(record, index) {
  const title = String(record?.title || "").trim();
  if (title) return title;
  const names = (Array.isArray(record?.appIds) ? record.appIds : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  return names.join(" · ") || t("workspace.tabs.untitled", { index: index + 1 });
}

function composeEmptyHint(placeholder) {
  const value = String(placeholder || "");
  if (!value || value === t("topbar.promptPlaceholder")) return t("composer.mode.tabToSearch");
  return value;
}

export function createComposerSearchPanel(options = {}) {
  const workspaceSearch = options.workspaceSearch && typeof options.workspaceSearch === "object"
    ? options.workspaceSearch
    : {};
  const listRecords = typeof workspaceSearch.listRecords === "function"
    ? workspaceSearch.listRecords
    : async () => [];
  const openRecord = typeof workspaceSearch.openRecord === "function"
    ? workspaceSearch.openRecord
    : async () => {};
  const openViewer = typeof workspaceSearch.openViewer === "function"
    ? workspaceSearch.openViewer
    : () => {};
  const highlight = typeof workspaceSearch.highlight === "function"
    ? workspaceSearch.highlight
    : highlightQuery;
  const renderFavicons = typeof workspaceSearch.renderFavicons === "function"
    ? workspaceSearch.renderFavicons
    : () => null;

  let active = false;
  let query = "";
  let selectedIndex = 0;
  let records = [];
  let loading = false;
  let requestSerial = 0;
  let opening = false;
  let shell = null;
  let listNode = null;
  let hintNode = null;
  let emptyNode = null;
  let switchNode = null;
  let composeChip = null;
  let searchChip = null;

  function liveShell() {
    return shell?.isConnected ? shell : document.querySelector(".prompt-shell");
  }

  function liveField() {
    return liveShell()?.querySelector?.(".prompt-input") || document.querySelector(".prompt-input");
  }

  function composeSource(inputNode) {
    if (typeof options.composePlaceholder === "function") return String(options.composePlaceholder() || "");
    const value = String(inputNode?.placeholder || "");
    if (
      !value
      || value === t("topbar.promptPlaceholder")
      || value === t("composer.mode.tabToSearch")
      || value === t("composer.mode.tabToCompose")
      || value === t("composer.search.placeholder")
    ) return "";
    return value;
  }

  function searchPlaceholder() {
    return t("composer.mode.tabToCompose");
  }

  function syncToggle() {
    if (composeChip) composeChip.setAttribute("aria-pressed", active ? "false" : "true");
    if (searchChip) searchChip.setAttribute("aria-pressed", active ? "true" : "false");
  }

  function syncEmptyPreview(inputNode) {
    if (active || inputNode?.value) return;
    const preview = liveShell()?.querySelector?.(".prompt-collapsed-preview");
    const text = preview?.querySelector?.(".prompt-collapsed-preview-text");
    if (!text) return;
    if (text.textContent !== inputNode.placeholder) text.textContent = inputNode.placeholder;
    preview.title = inputNode.placeholder;
    preview.classList.add("prompt-collapsed-preview-empty");
  }

  function syncShell() {
    const node = liveShell();
    if (!node) return;
    node.classList.toggle("prompt-shell-search", active);
    node.dataset.promptMode = active ? "search" : "compose";
    syncToggle();
    const results = node.querySelector(".prompt-search-results");
    if (results && !active) results.hidden = true;
  }

  function syncField(inputNode = liveField()) {
    if (!inputNode) return;
    const canMark = typeof inputNode.setAttribute === "function";
    if (active) {
      if (inputNode.value !== query) inputNode.value = query;
      inputNode.placeholder = searchPlaceholder();
      if (!canMark) return;
      inputNode.setAttribute("aria-label", t("composer.search.placeholder"));
      inputNode.setAttribute("role", "combobox");
      inputNode.setAttribute("aria-expanded", records.length ? "true" : "false");
      inputNode.setAttribute("aria-autocomplete", "list");
      inputNode.setAttribute("aria-controls", "prompt-search-results");
      const selected = records[selectedIndex];
      if (selected) inputNode.setAttribute("aria-activedescendant", `prompt-search-option-${selected.workspaceId}`);
      else inputNode.removeAttribute("aria-activedescendant");
      return;
    }
    const original = composeSource(inputNode);
    inputNode.placeholder = composeEmptyHint(original);
    if (!canMark) return;
    inputNode.setAttribute("aria-label", original || t("topbar.promptPlaceholder"));
    inputNode.removeAttribute("role");
    inputNode.removeAttribute("aria-expanded");
    inputNode.removeAttribute("aria-autocomplete");
    inputNode.removeAttribute("aria-controls");
    inputNode.removeAttribute("aria-activedescendant");
    syncEmptyPreview(inputNode);
  }

  function syncClearButton() {
    const clearButton = liveShell()?.querySelector?.(".prompt-clear-button");
    if (!clearButton || !active) return;
    clearButton.hidden = !String(query || "").trim();
  }

  function visibleRecords() {
    return records.slice(0, SEARCH_RESULTS_LIMIT);
  }

  function selectedRecord() {
    return visibleRecords()[selectedIndex] || null;
  }

  function paintResults() {
    const node = liveShell()?.querySelector?.(".prompt-search-results");
    if (!node) return;
    const items = visibleRecords();
    const searching = Boolean(String(query || "").trim());
    const showEmpty = searching && !loading && !items.length;
    if (listNode) {
      listNode.replaceChildren(...items.map((record, index) => {
        const title = recordTitle(record, index);
        const liveLabel = record.live ? t("composer.search.live") : t("composer.search.closed");
        const option = el("button", {
          class: `prompt-search-option${index === selectedIndex ? " is-active" : ""}`,
          type: "button",
          id: `prompt-search-option-${record.workspaceId}`,
          role: "option",
          "aria-selected": index === selectedIndex ? "true" : "false",
          "aria-label": `${title}, ${liveLabel}`,
          onclick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            selectedIndex = index;
            activateSelected();
          }
        },
          renderFavicons(record),
          el("span", { class: "prompt-search-option-title" }, ...highlight(title, query))
        );
        return option;
      }));
      listNode.hidden = !items.length;
    }
    if (emptyNode) {
      emptyNode.hidden = !showEmpty;
      emptyNode.textContent = t("composer.search.empty");
    }
    if (hintNode) {
      hintNode.hidden = !items.length;
    }
    node.hidden = !active || (!items.length && !showEmpty);
    syncField();
    syncClearButton();
  }

  async function refresh() {
    const serial = ++requestSerial;
    loading = true;
    try {
      const next = await listRecords(query);
      if (serial !== requestSerial) return;
      records = Array.isArray(next) ? next : [];
      if (selectedIndex >= records.length) selectedIndex = Math.max(0, records.length - 1);
      loading = false;
      paintResults();
    } catch {
      if (serial !== requestSerial) return;
      records = [];
      loading = false;
      paintResults();
    }
  }

  async function activateSelected() {
    const record = selectedRecord();
    if (!record || opening) return false;
    if (record.current) {
      exit({ restoreField: true });
      return true;
    }
    opening = true;
    try {
      await openRecord(record);
      exit({ restoreField: true });
      return true;
    } catch {
      return false;
    } finally {
      opening = false;
    }
  }

  function moveSelection(delta) {
    const items = visibleRecords();
    if (!items.length) return;
    selectedIndex = (selectedIndex + delta + items.length) % items.length;
    paintResults();
  }

  function enter() {
    if (active) {
      syncShell();
      syncField();
      refresh();
      return;
    }
    active = true;
    query = "";
    selectedIndex = 0;
    records = [];
    syncShell();
    syncField();
    paintResults();
    refresh();
  }

  function exit({ restoreField = true } = {}) {
    if (!active) return;
    active = false;
    query = "";
    selectedIndex = 0;
    records = [];
    requestSerial += 1;
    syncShell();
    if (restoreField) options.onRestoreField?.(liveField());
    else syncField();
    paintResults();
  }

  function clearQuery() {
    if (!active) return;
    query = "";
    selectedIndex = 0;
    const inputNode = liveField();
    if (inputNode) inputNode.value = "";
    syncField(inputNode);
    refresh();
  }

  function handleInput(event) {
    if (!active) return false;
    query = String(event?.target?.value || "");
    selectedIndex = 0;
    refresh();
    return true;
  }

  function handleKeydown(event) {
    if (!active) return false;
    if (event.isComposing || event.keyCode === 229) return true;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      moveSelection(1);
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      moveSelection(-1);
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (String(query || "").trim()) clearQuery();
      else exit({ restoreField: true });
      return true;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      activateSelected();
      return true;
    }
    return false;
  }

  function handleTab(event) {
    if (event?.key !== "Tab") return false;
    if (event.altKey || event.ctrlKey || event.metaKey) return false;
    if (event.isComposing || event.keyCode === 229) return false;
    event.preventDefault();
    event.stopPropagation();
    if (active) exit({ restoreField: true });
    else options.onEnter?.();
    return true;
  }

  function openViewerFromResults(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const record = selectedRecord();
    openViewer({
      query,
      workspaceId: record?.workspaceId || ""
    });
  }

  function enterFromChip(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!active) options.onEnter?.();
  }

  function exitFromChip(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (active) exit({ restoreField: true });
  }

  function attach(nextShell) {
    shell = nextShell;
    if (!shell) return;
    const row = shell.querySelector(".prompt-input-row");
    const existingSwitch = row?.querySelector?.(".prompt-mode-switch");
    if (row && !existingSwitch) {
      composeChip = el("button", {
        class: "prompt-mode-chip prompt-mode-chip-compose",
        type: "button",
        tabindex: "-1",
        "aria-pressed": active ? "false" : "true",
        onclick: exitFromChip,
        onpointerdown: (event) => {
          event.preventDefault();
          event.stopPropagation();
        },
        onkeydown: (event) => event.stopPropagation()
      }, t("composer.mode.compose"));
      searchChip = el("button", {
        class: "prompt-mode-chip prompt-mode-chip-search",
        type: "button",
        tabindex: "-1",
        "aria-pressed": active ? "true" : "false",
        onclick: enterFromChip,
        onpointerdown: (event) => {
          event.preventDefault();
          event.stopPropagation();
        },
        onkeydown: (event) => event.stopPropagation()
      }, t("composer.mode.search"));
      switchNode = el("div", {
        class: "prompt-mode-switch",
        role: "group"
      }, composeChip, searchChip);
      const field = row.querySelector(".prompt-input");
      if (typeof field?.before === "function") field.before(switchNode);
      else row.append(switchNode);
    } else {
      switchNode = existingSwitch || switchNode;
      composeChip = switchNode?.querySelector?.(".prompt-mode-chip-compose") || composeChip;
      searchChip = switchNode?.querySelector?.(".prompt-mode-chip-search") || searchChip;
    }
    if (!shell.querySelector(".prompt-search-results")) {
      listNode = el("div", {
        class: "prompt-search-list",
        id: "prompt-search-results",
        role: "listbox",
        "aria-label": t("workspace.tabs.searchSidebar")
      });
      emptyNode = el("div", { class: "prompt-search-empty ui-empty-state", hidden: true }, t("composer.search.empty"));
      hintNode = el("div", { class: "prompt-search-footer" },
        el("span", { class: "prompt-search-hint" }, t("composer.search.hint")),
        el("button", {
          class: "prompt-search-viewer-button",
          type: "button",
          onclick: openViewerFromResults,
          onpointerdown: (event) => event.stopPropagation()
        }, t("composer.search.openInViewer"))
      );
      const results = el("div", {
        class: "prompt-search-results overlay-surface",
        hidden: !active
      }, listNode, emptyNode, hintNode);
      const rowNode = shell.querySelector(".prompt-input-row");
      if (typeof rowNode?.after === "function") rowNode.after(results);
      else shell.append(results);
    } else {
      listNode = shell.querySelector(".prompt-search-list");
      emptyNode = shell.querySelector(".prompt-search-empty");
      hintNode = shell.querySelector(".prompt-search-footer");
    }
    syncShell();
    paintResults();
  }

  return Object.freeze({
    attach,
    enter,
    exit,
    isActive: () => active,
    handleInput,
    handleKeydown,
    handleTab,
    syncField,
    clearQuery,
    query: () => query,
    selectedRecord
  });
}
