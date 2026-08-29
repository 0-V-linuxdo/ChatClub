import { t } from "../../shared/i18n.js";
import {
  APP_PICKER_AGGREGATOR_IDS,
  APP_PICKER_CHINESE_IDS,
  APP_PICKER_INTERNATIONAL_IDS,
  APP_PICKER_SECTION_IDS,
  applyStoredOrder,
  moveOrderedIds,
  moveOrderedIdsByDelta,
  normalizeAppPickerAppOrders,
  normalizeAppPickerSectionOrder
} from "../../shared/app-picker-order.js";
import { createReorderButtons } from "../../ui/components.js";
import { el } from "../../ui/dom.js";
import { appPickerHostKeys } from "./app-hosts.js";

const PICKER_DRAG_DISTANCE = 6;
const INTERNATIONAL_ID_SET = new Set(APP_PICKER_INTERNATIONAL_IDS);
const AGGREGATOR_ID_SET = new Set(APP_PICKER_AGGREGATOR_IDS);
const CHINESE_ID_SET = new Set(APP_PICKER_CHINESE_IDS);

function customAppIds(customConfig) {
  return new Set((customConfig || []).map((app) => app?.id).filter(Boolean));
}

function hasCustomAppEquivalent(app, customHostKeys) {
  for (const key of appPickerHostKeys(app)) {
    if (customHostKeys.has(key)) return true;
  }
  return false;
}

function appPickerProvider(app) {
  const provider = String(app?.provider || "").trim();
  if (!provider || /^custom$/i.test(provider)) return "";
  return provider;
}

export function buildAppPickerSections({ apps = [], customConfig = [], options = {} } = {}) {
  const customIds = customAppIds(customConfig);
  const customApps = apps.filter((app) => !INTERNATIONAL_ID_SET.has(app.id)
    && !AGGREGATOR_ID_SET.has(app.id)
    && !CHINESE_ID_SET.has(app.id)
    && (customIds.has(app.id) || /^custom$/i.test(app.provider || "")));
  const customSet = new Set(customApps.map((app) => app.id));
  const customHostKeys = new Set(customApps.flatMap((app) => Array.from(appPickerHostKeys(app))));
  const byKnownOrder = (ids) => {
    const idSet = new Set(ids);
    return apps.filter((app) => idSet.has(app.id) && !customSet.has(app.id) && !hasCustomAppEquivalent(app, customHostKeys));
  };
  const classified = {
    custom: customApps,
    international: byKnownOrder(APP_PICKER_INTERNATIONAL_IDS),
    aggregator: byKnownOrder(APP_PICKER_AGGREGATOR_IDS),
    chinese: byKnownOrder(APP_PICKER_CHINESE_IDS)
  };
  const assigned = new Set(Object.values(classified).flatMap((list) => list.map((app) => app.id)));
  classified.aggregator = [
    ...classified.aggregator,
    ...apps.filter((app) => !assigned.has(app.id)
      && !CHINESE_ID_SET.has(app.id)
      && !hasCustomAppEquivalent(app, customHostKeys))
  ];
  const appOrders = normalizeAppPickerAppOrders(options.appPickerAppOrders);
  return normalizeAppPickerSectionOrder(options.appPickerSectionOrder).map((id) => ({
    id,
    title: t(`appPicker.${id}`),
    apps: applyStoredOrder(classified[id] || [], appOrders[id]),
    custom: id === "custom"
  }));
}

function nodeIds(root, selector, key) {
  return Array.from(root?.querySelectorAll(selector) || []).map((node) => node.dataset[key]).filter(Boolean);
}

function applyNodeOrder(parent, selector, key, order) {
  const nodes = new Map(Array.from(parent.querySelectorAll(selector)).map((node) => [node.dataset[key], node]));
  for (const id of order) {
    const node = nodes.get(id);
    if (node) parent.append(node);
  }
}

function dropPlacement(rect, clientX, clientY, axis) {
  if (!rect) return "before";
  return axis === "x"
    ? (clientX > rect.left + rect.width / 2 ? "after" : "before")
    : (clientY > rect.top + rect.height / 2 ? "after" : "before");
}

function clearPickerDropState(root) {
  root?.querySelectorAll(".dragging, .drop-before, .drop-after").forEach((node) => {
    node.classList.remove("dragging", "drop-before", "drop-after");
  });
}

export function renderAppPickerColumns({
  sections,
  onSelect,
  persistOrder,
  openCustomAppEditor,
  closePopovers,
  inferAppName,
  appFaviconUrl,
  browserFaviconUrl,
  fallbackFaviconUrl,
  svgIcon
}) {
  let activeDrag = null;

  function renderFavicon(app) {
    const image = el("img", {
      class: "app-picker-favicon",
      src: appFaviconUrl(app) || fallbackFaviconUrl(app),
      alt: "",
      draggable: "false",
      loading: "lazy",
      decoding: "async",
      referrerpolicy: "no-referrer",
      onerror: (event) => {
        const icon = event.currentTarget;
        if (icon.dataset.browserFallback !== "1") {
          const browserUrl = browserFaviconUrl(app.url);
          icon.dataset.browserFallback = "1";
          if (browserUrl && icon.src !== browserUrl) {
            icon.src = browserUrl;
            return;
          }
        }
        if (icon.dataset.fallback === "1") return;
        icon.dataset.fallback = "1";
        icon.src = fallbackFaviconUrl(app);
      }
    });
    image.title = inferAppName(app);
    return image;
  }

  async function selectApp(event, app) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const target = event?.currentTarget;
    if (target?.dataset?.selecting === "true") return;
    if (target?.dataset) target.dataset.selecting = "true";
    await onSelect(app);
  }

  function openCustomEditor(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const target = event?.currentTarget;
    if (target?.dataset?.opening === "true") return;
    if (target?.dataset) target.dataset.opening = "true";
    closePopovers();
    openCustomAppEditor?.();
  }

  function stopDrag() {
    if (!activeDrag) return;
    document.removeEventListener("pointermove", onDragMove, true);
    document.removeEventListener("pointerup", onDragUp, true);
    document.removeEventListener("pointercancel", onDragUp, true);
    document.body.classList.remove("app-picker-dragging");
    clearPickerDropState(columns);
    activeDrag = null;
  }

  function dragTarget(clientX, clientY) {
    const hover = document.elementFromPoint(clientX, clientY);
    if (activeDrag.kind === "section") {
      return hover?.closest?.(".app-picker-column") || null;
    }
    const item = hover?.closest?.(".app-picker-item-row");
    if (!item || item.closest(".app-picker-column") !== activeDrag.source.closest(".app-picker-column")) return null;
    return item;
  }

  function onDragMove(event) {
    if (!activeDrag) return;
    const dx = event.clientX - activeDrag.startX;
    const dy = event.clientY - activeDrag.startY;
    if (!activeDrag.started && (dx * dx + dy * dy) < PICKER_DRAG_DISTANCE ** 2) return;
    if (!activeDrag.started) {
      activeDrag.started = true;
      document.body.classList.add("app-picker-dragging");
      activeDrag.source.classList.add("dragging");
    }
    event.preventDefault();
    const target = dragTarget(event.clientX, event.clientY);
    clearPickerDropState(columns);
    activeDrag.source.classList.add("dragging");
    if (!target || target === activeDrag.source) return;
    const placement = dropPlacement(
      target.getBoundingClientRect(),
      event.clientX,
      event.clientY,
      activeDrag.kind === "section" ? "x" : "y"
    );
    target.classList.toggle("drop-after", placement === "after");
    target.classList.toggle("drop-before", placement !== "after");
    const sourceId = activeDrag.sourceId;
    const targetId = target.dataset[activeDrag.idKey];
    const next = moveOrderedIds(activeDrag.ids(), sourceId, targetId, placement);
    applyNodeOrder(activeDrag.parent, activeDrag.selector, activeDrag.idKey, next);
    activeDrag.source.classList.add("dragging");
  }

  async function onDragUp(_event) {
    const drag = activeDrag;
    if (!drag) return;
    const started = drag.started;
    const app = drag.app;
    const source = drag.source;
    stopDrag();
    if (started) {
      source.dataset.pickerDragged = "true";
      await persistCurrentOrder();
      return;
    }
    if (drag.kind === "app" && app) {
      const trigger = source.matches?.(".app-picker-item")
        ? source
        : (source.querySelector?.(".app-picker-item") || source);
      await selectApp({ currentTarget: trigger, preventDefault() {}, stopPropagation() {} }, app);
    }
  }

  function startDrag(event, kind, source, extra = {}) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    stopDrag();
    const parent = kind === "section" ? columns : source.closest(".app-picker-list");
    if (!parent) return;
    source.setPointerCapture?.(event.pointerId);
    activeDrag = {
      kind,
      source,
      sourceId: source.dataset[kind === "section" ? "pickerSection" : "appId"],
      idKey: kind === "section" ? "pickerSection" : "appId",
      selector: kind === "section" ? ".app-picker-column" : ".app-picker-item-row",
      parent,
      ids: () => nodeIds(parent, kind === "section" ? ".app-picker-column" : ".app-picker-item-row", kind === "section" ? "pickerSection" : "appId"),
      startX: event.clientX,
      startY: event.clientY,
      started: false,
      ...extra
    };
    document.addEventListener("pointermove", onDragMove, true);
    document.addEventListener("pointerup", onDragUp, true);
    document.addEventListener("pointercancel", onDragUp, true);
  }

  async function persistCurrentOrder() {
    await persistOrder?.({
      appPickerSectionOrder: nodeIds(columns, ".app-picker-column", "pickerSection"),
      appPickerAppOrders: Object.fromEntries(APP_PICKER_SECTION_IDS.map((id) => {
        const column = Array.from(columns.querySelectorAll(".app-picker-column"))
          .find((node) => node.dataset.pickerSection === id);
        return [id, nodeIds(column, ".app-picker-item-row", "appId")];
      }))
    });
  }

  async function moveByDelta(kind, source, delta) {
    const parent = kind === "section" ? columns : source.closest(".app-picker-list");
    if (!parent) return;
    const selector = kind === "section" ? ".app-picker-column" : ".app-picker-item-row";
    const idKey = kind === "section" ? "pickerSection" : "appId";
    const next = moveOrderedIdsByDelta(nodeIds(parent, selector, idKey), source.dataset[idKey], delta);
    applyNodeOrder(parent, selector, idKey, next);
    const ids = nodeIds(parent, selector, idKey);
    for (const node of parent.querySelectorAll(selector)) {
      const index = ids.indexOf(node.dataset[idKey]);
      const cluster = kind === "section"
        ? node.querySelector(".app-picker-heading-row")
        : node;
      const buttons = cluster?.querySelectorAll(".ui-reorder-button") || [];
      if (buttons[0]) buttons[0].disabled = index <= 0;
      if (buttons[1]) buttons[1].disabled = index < 0 || index >= ids.length - 1;
    }
    await persistCurrentOrder();
  }

  function pickerReorder(sourceNode, kind, ids) {
    const key = kind === "section" ? "pickerSection" : "appId";
    const index = ids.indexOf(sourceNode.dataset[key]);
    return createReorderButtons({
      upLabel: t("common.moveUp"),
      downLabel: t("common.moveDown"),
      upIcon: svgIcon("chevronUp"),
      downIcon: svgIcon("chevronDown"),
      canMoveUp: index > 0,
      canMoveDown: index >= 0 && index < ids.length - 1,
      onMoveUp: () => moveByDelta(kind, sourceNode, -1),
      onMoveDown: () => moveByDelta(kind, sourceNode, 1)
    });
  }

  function renderItem(app, custom, sectionApps = []) {
    const provider = appPickerProvider(app);
    const ids = sectionApps.map((item) => item.id);
    const row = el("div", {
      class: "app-picker-item-row",
      dataset: { appId: app.id },
      onpointerdown: (event) => {
        if (event.target?.closest?.(".ui-reorder")) return;
        startDrag(event, "app", event.currentTarget, { app });
      }
    });
    row.append(
      el("button", {
        class: "app-picker-item",
        type: "button",
        title: inferAppName(app),
        draggable: "false",
        dataset: { appId: app.id },
        onclick: (event) => {
          if (row.dataset.pickerDragged === "true") {
            delete row.dataset.pickerDragged;
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          selectApp(event, app);
        },
        onkeydown: (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          selectApp(event, app);
        }
      },
        renderFavicon(app),
        el("span", { class: "app-picker-name" }, inferAppName(app)),
        !custom && provider ? el("span", { class: "app-picker-provider" }, provider) : null
      ),
      pickerReorder(row, "app", ids)
    );
    return row;
  }

  function renderHeading(section) {
    const columnIds = sections.map((item) => item.id);
    const title = el("h3", {
      class: "app-picker-heading",
      onpointerdown: (event) => {
        startDrag(event, "section", event.currentTarget.closest(".app-picker-column"));
      }
    }, section.title);
    const heading = el("div", {
      class: "app-picker-heading-row",
      dataset: { pickerSection: section.id }
    }, title);
    heading.append(pickerReorder(heading, "section", columnIds));
    if (section.custom && openCustomAppEditor) {
      heading.append(el("button", {
        class: "app-picker-add-button tooltip-trigger",
        type: "button",
        "aria-label": t("appPicker.addCustom"),
        "data-tooltip": t("appPicker.addCustom"),
        "data-tooltip-id": "appPicker.addCustom",
        onpointerdown: openCustomEditor,
        onclick: openCustomEditor
      },
        svgIcon("plus")
      ));
    }
    return heading;
  }

  function renderColumn(section) {
    return el("section", {
      class: `app-picker-column app-picker-${section.id}`,
      dataset: { pickerSection: section.id }
    },
      renderHeading(section),
      el("div", { class: "app-picker-list" },
        section.apps.map((app) => renderItem(app, section.custom, section.apps))
      )
    );
  }

  const columns = el("div", { class: "app-picker-columns" },
    sections.map((section) => renderColumn(section))
  );
  return columns;
}
