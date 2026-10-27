// Minimal DOM helpers shared by UI plugins. No business logic here.

import { ICON_PATHS } from "./icons.generated.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * h("button.cc-btn.primary", { onclick, title, dataset: {...}, attrs: {...} }, ...children)
 * Class names may be given in the tag ("div.a.b") and/or as `class`.
 */
export function h(tag, props, ...children) {
  if (props === null || typeof props !== "object" || props instanceof Node || Array.isArray(props)) {
    if (props !== undefined && props !== null) children.unshift(props);
    props = {};
  }
  const [name, ...classes] = tag.split(".");
  const el = document.createElement(name || "div");
  if (classes.length) el.classList.add(...classes);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class" || key === "className") {
      for (const c of String(value).split(/\s+/)) if (c) el.classList.add(c);
    } else if (key === "dataset") {
      Object.assign(el.dataset, value);
    } else if (key === "style" && typeof value === "object") {
      for (const [prop, v] of Object.entries(value)) {
        if (v === undefined || v === null) continue;
        if (prop.startsWith("--")) el.style.setProperty(prop, v);
        else el.style[prop] = v;
      }
    } else if (key === "attrs") {
      for (const [a, v] of Object.entries(value)) if (v !== undefined && v !== null && v !== false) el.setAttribute(a, v === true ? "" : v);
    } else if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in el && !key.includes("-")) {
      el[key] = value;
    } else {
      el.setAttribute(key, value === true ? "" : value);
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === true) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

/** Inline SVG icon by ChatClub icon name; unknown names fall back to a plug icon. */
export function icon(name, { size = 16, className = "" } = {}) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("cc-icon");
  if (className) svg.classList.add(...className.split(/\s+/).filter(Boolean));
  if (name === "pocket") {
    // Simplified pocket shape drawn for ChatClub.
    svg.setAttribute("stroke", "none");
    svg.innerHTML =
      '<path fill="#ef4056" d="M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5V11a9 9 0 0 1-18 0Z"/>' +
      '<path fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="m7.5 9.5 4.5 4.3 4.5-4.3"/>';
    return svg;
  }
  if (name === "starFilled") {
    svg.innerHTML = ICON_PATHS.star.replace("<path", '<path fill="currentColor"');
    return svg;
  }
  svg.innerHTML = ICON_PATHS[name] ?? ICON_PATHS.plug;
  return svg;
}

export function hasIcon(name) {
  return name === "pocket" || name === "starFilled" || Object.prototype.hasOwnProperty.call(ICON_PATHS, name);
}

/** Keeps a function from running more often than every `ms`, trailing call wins. */
export function debounce(fn, ms) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

export function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

/** Auto-generated readable title from a camelCase key: "promptTemplateId" → "Prompt Template Id". */
export function humanizeKey(key) {
  const words = String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
