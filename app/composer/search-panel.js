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
  let chipNode = null;

  function liveShell() {
    return shell?.isConnected ? shell : document.querySelector(".prompt-shell");
  }

  function liveField() {
    return liveShell()?.querySelector?.(".prompt-input") || document.querySelector(".prompt-input");
  }

  function searchPlaceholder() {
    return t("composer.search.placeholder");
  }

  function syncShell() {
    const node = liveShell();
    if (!node) return;
    node.classList.toggle("prompt-shell-search", active);
    node.dataset.promptMode = active ? "search" : "compose";
    if (chipNode) {
      chipNode.hidden = !active;
      chipNode.setAttribute("aria-pressed", active ? "true" : "false");
    }
    const results = node.querySelector(".prompt-search-results");
    if (results) results.hidden = !active;
  }

  function syncField(inputNode = liveField()) {
    if (!inputNode) return;
    if (active) {
      if (inputNode.value !== query) inputNode.value = query;
      inputNode.placeholder = searchPlaceholder();
      inputNode.setAttribute("aria-label", searchPlaceholder());
      inputNode.setAttribute("role", "combobox");
      inputNode.setAttribute("aria-expanded", records.length ? "true" : "false");
      inputNode.setAttribute("aria-autocomplete", "list");
      inputNode.setAttribute("aria-controls", "prompt-search-results");
      const selected = records[selectedIndex];
      if (selected) inputNode.setAttribute("aria-activedescendant", `prompt-search-option-${selected.workspaceId}`);
      else inputNode.removeAttribute("aria-activedescendant");
      return;
    }
    inputNode.removeAttribute("role");
    inputNode.removeAttribute("aria-expanded");
    inputNode.removeAttribute("aria-autocomplete");
    inputNode.removeAttribute("aria-controls");
    inputNode.removeAttribute("aria-activedescendant");
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
    if (listNode) {
      listNode.replaceChildren(...items.map((record, index) => {
        const title = recordTitle(record, index);
        const option = el("button", {
          class: `prompt-search-option${index === selectedIndex ? " is-active" : ""}`,
          type: "button",
          id: `prompt-search-option-${record.workspaceId}`,
          role: "option",
          "aria-selected": index === selectedIndex ? "true" : "false",
          onclick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            selectedIndex = index;
            activateSelected();
          }
        },
          el("span", { class: "prompt-search-option-title" }, ...highlight(title, query)),
          el("span", { class: "prompt-search-option-meta" },
            record.live ? t("composer.search.live") : t("composer.search.closed"),
            Array.isArray(record.appIds) && record.appIds.length
              ? el("span", { class: "prompt-search-option-apps" }, record.appIds.filter(Boolean).join(" · "))
              : null
          )
        );
        return option;
      }));
      listNode.hidden = !items.length;
    }
    if (emptyNode) {
      emptyNode.hidden = Boolean(items.length) || loading;
      emptyNode.textContent = t(searching ? "composer.search.empty" : "workspace.tabs.empty");
    }
    if (hintNode) {
      hintNode.hidden = !items.length;
    }
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

  function openViewerFromResults(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const record = selectedRecord();
    openViewer({
      query,
      workspaceId: record?.workspaceId || ""
    });
  }

  function attach(nextShell) {
    shell = nextShell;
    if (!shell) return;
    const row = shell.querySelector(".prompt-input-row");
    if (row && !row.querySelector(".prompt-mode-chip")) {
      chipNode = el("button", {
        class: "prompt-mode-chip tooltip-trigger",
        type: "button",
        hidden: !active,
        "aria-pressed": active ? "true" : "false",
        "aria-label": t("composer.mode.search"),
        "data-tooltip": t("composer.mode.search"),
        "data-tooltip-id": "composer.mode.search",
        onclick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (active) exit({ restoreField: true });
          else options.onEnter?.();
        },
        onpointerdown: (event) => event.stopPropagation(),
        onkeydown: (event) => event.stopPropagation()
      }, t("composer.mode.search"));
      const send = row.querySelector(".prompt-send-button");
      if (typeof send?.before === "function") send.before(chipNode);
      else row.append(chipNode);
    } else {
      chipNode = row?.querySelector?.(".prompt-mode-chip") || chipNode;
    }
    if (!shell.querySelector(".prompt-search-results")) {
      listNode = el("div", {
        class: "prompt-search-list",
        id: "prompt-search-results",
        role: "listbox",
        "aria-label": t("workspace.tabs.searchSidebar")
      });
      emptyNode = el("div", { class: "prompt-search-empty ui-empty-state" }, t("workspace.tabs.empty"));
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
    syncField,
    clearQuery,
    query: () => query,
    selectedRecord
  });
}
