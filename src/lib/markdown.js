// Safe Markdown subset renderer (v2 04 §2.6). Builds DOM nodes only; content is never parsed as HTML.

const SAFE_LINK = /^(https?:|mailto:)/i;

/** Renders inline code, bold, italic and links into `parent`. */
function renderInline(doc, parent, text) {
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|(\[[^\]\n]+\]\([^)\s]+\))|(\*[^*\n]+?\*)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) parent.append(doc.createTextNode(text.slice(last, m.index)));
    const token = m[0];
    if (m[1]) {
      const code = doc.createElement("code");
      code.textContent = token.slice(1, -1);
      parent.append(code);
    } else if (m[2]) {
      const strong = doc.createElement("strong");
      renderInline(doc, strong, token.slice(2, -2));
      parent.append(strong);
    } else if (m[3]) {
      const close = token.indexOf("](");
      const label = token.slice(1, close);
      const href = token.slice(close + 2, -1);
      if (SAFE_LINK.test(href)) {
        const a = doc.createElement("a");
        a.href = href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        renderInline(doc, a, label);
        parent.append(a);
      } else {
        renderInline(doc, parent, label);
      }
    } else if (m[4]) {
      const em = doc.createElement("em");
      renderInline(doc, em, token.slice(1, -1));
      parent.append(em);
    }
    last = m.index + token.length;
  }
  if (last < text.length) parent.append(doc.createTextNode(text.slice(last)));
}

const isTableSep = (line) => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line) && line.includes("-");
const splitRow = (line) => {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
};

/**
 * @param {string} text
 * @param {Document} [doc]
 * @returns {HTMLElement} a div.cc-md holding the rendered blocks
 */
export function renderMarkdown(text, doc = globalThis.document) {
  const root = doc.createElement("div");
  root.className = "cc-md";
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const el = (tag, parent = root) => {
    const node = doc.createElement(tag);
    parent.append(node);
    return node;
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const fence = line.match(/^\s*```\s*([\w+#.-]*)\s*$/);
    if (fence) {
      const body = [];
      i += 1;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++]);
      i += 1;
      const pre = el("pre");
      const code = el("code", pre);
      if (fence[1]) code.dataset.lang = fence[1];
      code.textContent = body.join("\n");
      continue;
    }
    const heading = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (heading) {
      renderInline(doc, el(`h${heading[1].length}`), heading[2].replace(/\s+#+\s*$/, ""));
      i += 1;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      el("hr");
      i += 1;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ""));
      renderInline(doc, el("p", el("blockquote")), body.join(" ").trim());
      continue;
    }
    const bullet = /^\s*[-*+]\s+/;
    const ordered = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || ordered.test(line)) {
      const re = bullet.test(line) ? bullet : ordered;
      const list = el(re === bullet ? "ul" : "ol");
      while (i < lines.length && re.test(lines[i])) {
        const item = [lines[i].replace(re, "")];
        i += 1;
        while (i < lines.length && lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && !bullet.test(lines[i]) && !ordered.test(lines[i])) item.push(lines[i++].trim());
        renderInline(doc, el("li", list), item.join(" "));
      }
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : ""));
      i += 2;
      const wrap = el("div");
      wrap.className = "cc-md-table";
      const table = el("table", wrap);
      const tr = el("tr", el("thead", table));
      head.forEach((cell, c) => {
        const th = el("th", tr);
        if (aligns[c]) th.style.textAlign = aligns[c];
        renderInline(doc, th, cell);
      });
      const tbody = el("tbody", table);
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        const row = el("tr", tbody);
        splitRow(lines[i]).forEach((cell, c) => {
          const td = el("td", row);
          if (aligns[c]) td.style.textAlign = aligns[c];
          renderInline(doc, td, cell);
        });
        i += 1;
      }
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^\s*(```|#{1,6}\s|>|[-*+]\s|\d+[.)]\s)/.test(lines[i]) && !/^\s*([-*_])(\s*\1){2,}\s*$/.test(lines[i])) {
      if (lines[i].includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) break;
      para.push(lines[i++].trim());
    }
    if (!para.length) {
      // A line that looked like a block start but was not one: emit it as text.
      para.push(lines[i++].trim());
    }
    renderInline(doc, el("p"), para.join(" "));
  }
  if (!root.childNodes.length) el("p");
  return root;
}

export const MARKDOWN_STYLE = String.raw`
.cc-md { font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; }
.cc-md > :first-child { margin-top: 0; }
.cc-md > :last-child { margin-bottom: 0; }
.cc-md p, .cc-md ul, .cc-md ol, .cc-md blockquote, .cc-md pre, .cc-md .cc-md-table { margin: 0 0 10px; }
.cc-md h1, .cc-md h2, .cc-md h3, .cc-md h4, .cc-md h5, .cc-md h6 { margin: 14px 0 8px; line-height: 1.3; }
.cc-md h1 { font-size: 20px; } .cc-md h2 { font-size: 18px; } .cc-md h3 { font-size: 16px; } .cc-md h4, .cc-md h5, .cc-md h6 { font-size: 14px; }
.cc-md ul, .cc-md ol { padding-left: 22px; }
.cc-md blockquote { padding: 2px 12px; border-left: 3px solid var(--line-strong); color: var(--muted); }
.cc-md code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; padding: 1px 4px; border-radius: 4px; background: var(--hover); }
.cc-md pre { padding: 10px 12px; border-radius: 8px; background: var(--hover); overflow: auto; }
.cc-md pre code { padding: 0; background: none; white-space: pre; }
.cc-md hr { border: 0; border-top: 1px solid var(--line); margin: 12px 0; }
.cc-md a { color: var(--primary); }
.cc-md .cc-md-table { overflow-x: auto; }
.cc-md table { border-collapse: collapse; font-size: 13px; }
.cc-md th, .cc-md td { border: 1px solid var(--line); padding: 4px 8px; text-align: left; vertical-align: top; }
.cc-md th { background: var(--hover); }
`;
