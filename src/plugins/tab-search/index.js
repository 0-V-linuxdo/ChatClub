import { definePlugin } from "../../kernel/define.js";

export default definePlugin({
  name: "TabSearch",
  description: "plugin.TabSearch.description",
  authors: ["ChatClub"],
  icon: "search",
  tags: ["navigation"],
  enabledByDefault: true,
  startAt: "domReady",
  dependencies: ["WorkspaceTabs", "Composer"],
  usesExtensionPoints: ["composer.searchProvider", "topbar.item", "shortcut.action"],
  managedStyle: String.raw`
.cc-tabsearch { display: grid; grid-template-columns: minmax(260px, 360px) minmax(0, 1fr); height: min(720px, calc(100vh - 160px)); }
.cc-modal.maximized .cc-tabsearch { height: calc(100vh - var(--modal-header-h) - 2px); }
.cc-tabsearch-left { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--line); }
.cc-tabsearch-left .box { padding: 12px; border-bottom: 1px solid var(--line); }
.cc-tabsearch-left .box input { width: 100%; }
.cc-tabsearch-list { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 8px 12px; }
.cc-tabsearch-note { margin: 8px 4px; padding: 8px 10px; border-radius: 8px; background: var(--panel-2); color: var(--muted); font-size: 12px; }
.cc-tabsearch-item { display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left; padding: 8px 10px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: inherit; cursor: pointer; }
.cc-tabsearch-item:hover { background: var(--hover); }
.cc-tabsearch-item[aria-selected="true"] { background: var(--control-selected); border-color: var(--primary); }
.cc-tabsearch-item .row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.cc-tabsearch-item .title { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
.cc-tabsearch-item .badge { font-size: 10px; padding: 1px 6px; border-radius: 999px; background: var(--soft); color: var(--primary); }
.cc-tabsearch-item .snippet { font-size: 12px; color: var(--muted); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.cc-tabsearch-item mark { background: color-mix(in srgb, var(--primary) 22%, transparent); color: inherit; border-radius: 2px; }
.cc-tabsearch-preview { min-height: 0; overflow-y: auto; padding: 16px 20px; }
.cc-tabsearch-preview .empty { color: var(--muted); padding: 40px 0; text-align: center; }
.cc-tabsearch-cluster { margin-bottom: 18px; }
.cc-tabsearch-cluster h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; font-size: 13px; }
.cc-tabsearch-msg { position: relative; margin: 0 0 8px; padding: 10px 36px 10px 12px; border-radius: 10px; border: 1px solid var(--line); white-space: pre-wrap; word-break: break-word; }
.cc-tabsearch-msg.user { background: var(--panel-2); }
.cc-tabsearch-msg .copy { position: absolute; top: 6px; right: 6px; }
`,
  strings: {
    zh: {
      "plugin.TabSearch.description": "搜索 ChatClub 标签页与记忆：输入框搜索模式、搜索窗口（标题和已记录的全文）。",
      "tabSearch.title": "搜索",
      "tabSearch.placeholder": "搜索标题",
      "tabSearch.placeholderFull": "搜索标题或全文",
      "tabSearch.none": "没有匹配的标签页",
      "tabSearch.enableFullText": "在工作区设置中打开「记录全文」后，即可搜索对话内容。",
      "tabSearch.fullTextBadge": "全文",
      "tabSearch.select": "选择一条对话以预览",
      "tabSearch.noRecord": "这个标签页还没有记录的对话内容。",
      "tabSearch.openTab": "打开标签页",
      "tabSearch.user": "用户消息",
      "tabSearch.assistant": "回答",
      "tabSearch.copy": "复制",
      "tabSearch.copied": "已复制",
      "tabSearch.maximize": "全屏",
      "tabSearch.button": "搜索对话",
      "tabSearch.shortcut": "进入搜索模式",
    },
    en: {
      "plugin.TabSearch.description": "Search ChatClub tabs and memories: the composer's search mode and a search window (titles and recorded full text).",
      "tabSearch.title": "Search",
      "tabSearch.placeholder": "Search titles",
      "tabSearch.placeholderFull": "Search titles or full text",
      "tabSearch.none": "No matching tabs",
      "tabSearch.enableFullText": "Turn on “Record full text” in the workspace settings to search conversation content.",
      "tabSearch.fullTextBadge": "Full text",
      "tabSearch.select": "Select a conversation to preview",
      "tabSearch.noRecord": "No conversation content has been recorded for this tab yet.",
      "tabSearch.openTab": "Open tab",
      "tabSearch.user": "User message",
      "tabSearch.assistant": "Answer",
      "tabSearch.copy": "Copy",
      "tabSearch.copied": "Copied",
      "tabSearch.maximize": "Full screen",
      "tabSearch.button": "Search conversations",
      "tabSearch.shortcut": "Enter search mode",
    },
  },
  app: () => import("./app.js"),
});
