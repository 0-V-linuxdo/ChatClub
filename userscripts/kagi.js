// Built-in Summary userscript: Kagi Assistant (kagi)
// Source: Mod/assets/chunk-7dbf4e81.js :: SUMMARY_SITE_CONFIG_DEFAULTS
// Config version: 61; global config version: 61
// Hosts: assistant.kagi.com
// Path prefixes: (none)
// Run mode: serial; timeout: 32000
// This is a Simple Chat Hub Summary bridge body, not a standalone browser userscript.

return await api.extractCopySequence({
  "rootSelector": "main,[role=main],body",
  "copyButtonSelector": "button,[role=button],[role=menuitem],div[tabindex],span[role=button]",
  "copyButtonPattern": "copy|copied|clipboard|复制|已复制|拷贝",
  "copyButtonExcludePattern": "copy\\s*(?:code|table|link|conversation|source|sources)|copy[-_ ]?(?:code|table|link|conversation|source|sources)|(?:link|share|history|source|sources|citation|citations|feedback|thumb|like|dislike|settings|export|docs|menu|more|notification|sidebar|regenerate|upload|voice|submit|model)|链接|分享|代码|表格|会话|历史|来源|引用|赞|踩|设置|导出|更多|菜单|通知|上传|语音|提交",
  "copyTextExcludePattern": "^\\s*(?:References|Sources|Citations|引用|来源)\\b|^\\s*(?:(?:\\^?\\[?\\^?\\d+\\]?[:.)]?|\\[\\d+\\]|\\d+[.)])\\s*\\[[^\\n]+\\]\\([^\\n]+\\)\\s*(?:\\([^)]*%\\))?\\s*){2,}\\s*$",
  "copyUserContextPattern": "you\\s+said|user\\s+said|human|prompt|question|用户|你说|提问",
  "copyAssistantContextPattern": "assistant\\s+said|assistant|answer|response|回答|回复|助手",
  "copyMenu": false,
  "expanded": false,
  "copyButtonIconFallback": true,
  "roleFallbackSequence": "userFirst",
  "maxButtons": 18,
  "matchMode": "anyUseful",
  "resetClipboardBeforeCopy": true,
  "acceptUnchangedClipboard": false,
  "copyTimeoutMs": 3600,
  "copyPollMs": 50,
  "copyCaptureGraceMs": 320,
  "domTextFallback": false
});
