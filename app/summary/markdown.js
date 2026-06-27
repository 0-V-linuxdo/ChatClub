import { el } from "../../ui/dom.js";

function safeLinkHref(value = "") {
  try {
    const url = new URL(String(value || ""), location.href);
    return /^(https?:|mailto:)/i.test(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function renderInlineMarkdown(text = "") {
  const nodes = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(([^)]+)\))/g;
  let last = 0;
  for (const match of String(text).matchAll(pattern)) {
    if (match.index > last) nodes.push(document.createTextNode(text.slice(last, match.index)));
    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(el("code", {}, token.slice(1, -1)));
    } else if (token.startsWith("**")) {
      nodes.push(el("strong", {}, ...renderInlineMarkdown(token.slice(2, -2))));
    } else if (token.startsWith("*")) {
      nodes.push(el("em", {}, ...renderInlineMarkdown(token.slice(1, -1))));
    } else {
      const label = token.slice(1, token.indexOf("]("));
      const href = safeLinkHref(match[2]);
      nodes.push(href
        ? el("a", { href, target: "_blank", rel: "noopener noreferrer" }, ...renderInlineMarkdown(label))
        : document.createTextNode(label));
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(document.createTextNode(text.slice(last)));
  return nodes;
}

function isMarkdownTableStart(lines, index) {
  const header = lines[index] || "";
  const divider = lines[index + 1] || "";
  return header.includes("|") && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(divider);
}

function splitMarkdownRow(row) {
  return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function renderMarkdownTable(lines, start) {
  const header = splitMarkdownRow(lines[start]);
  let index = start + 2;
  const body = [];
  while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
    body.push(splitMarkdownRow(lines[index]));
    index += 1;
  }
  return {
    node: el("div", { class: "summary-markdown-table-wrap" },
      el("table", {},
        el("thead", {}, el("tr", {}, header.map((cell) => el("th", {}, ...renderInlineMarkdown(cell))))),
        el("tbody", {}, body.map((row) => el("tr", {}, row.map((cell) => el("td", {}, ...renderInlineMarkdown(cell))))))
      )
    ),
    next: index
  };
}

export function renderMarkdown(markdown = "") {
  const text = String(markdown || "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const nodes = [];
  let index = 0;
  const flushParagraph = (buffer) => {
    if (buffer.length) nodes.push(el("p", {}, ...renderInlineMarkdown(buffer.join(" "))));
    buffer.length = 0;
  };
  const paragraph = [];
  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph(paragraph);
      index += 1;
      continue;
    }
    if (/^```/.test(trimmed)) {
      flushParagraph(paragraph);
      const lang = trimmed.replace(/^```/, "").trim();
      const code = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      nodes.push(el("pre", {}, el("code", lang ? { "data-lang": lang } : {}, code.join("\n"))));
      continue;
    }
    if (isMarkdownTableStart(lines, index)) {
      flushParagraph(paragraph);
      const table = renderMarkdownTable(lines, index);
      nodes.push(table.node);
      index = table.next;
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph(paragraph);
      nodes.push(el(`h${heading[1].length}`, {}, ...renderInlineMarkdown(heading[2])));
      index += 1;
      continue;
    }
    if (/^---+$/.test(trimmed)) {
      flushParagraph(paragraph);
      nodes.push(el("hr"));
      index += 1;
      continue;
    }
    if (/^>\s?/.test(trimmed)) {
      flushParagraph(paragraph);
      const quotes = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quotes.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      nodes.push(el("blockquote", {}, ...renderInlineMarkdown(quotes.join(" "))));
      continue;
    }
    const listMatch = /^(\s*)([-*]|\d+\.)\s+(.+)$/.exec(line);
    if (listMatch) {
      flushParagraph(paragraph);
      const ordered = /\d+\./.test(listMatch[2]);
      const items = [];
      while (index < lines.length) {
        const itemMatch = /^(\s*)([-*]|\d+\.)\s+(.+)$/.exec(lines[index]);
        if (!itemMatch || /\d+\./.test(itemMatch[2]) !== ordered) break;
        items.push(el("li", {}, ...renderInlineMarkdown(itemMatch[3])));
        index += 1;
      }
      nodes.push(el(ordered ? "ol" : "ul", {}, items));
      continue;
    }
    paragraph.push(trimmed);
    index += 1;
  }
  flushParagraph(paragraph);
  return el("div", { class: "summary-panel-markdown" }, nodes.length ? nodes : [el("p", {}, "")]);
}
