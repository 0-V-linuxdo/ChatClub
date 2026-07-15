# ChatClub

多 AI 聊天工作台浏览器扩展。把常用 AI 站点放进同一个页面，一次输入，多处发送，并排比较结果。

官方链接：[Telegram 频道](https://t.me/chatclub_extension) · [GitHub 仓库](https://github.com/0-V-linuxdo/ChatClub)

## 功能

- 多列工作区：内置分组标签、布局预设、全屏、刷新、新建会话、复制链接、在新标签页打开。
- 工作区记忆：页面刷新或插件重载后恢复各分组、标签页、活动项、页面地址和全屏状态。
- 统一输入：向当前工作区里的聊天页批量发送消息，支持提示词库、发送历史和快捷插入。
- Summary：采集当前页面对话，预览来源、总结上下文、继续追问；预览卡片使用对应 tab 的真实 favicon。
- Pocket：把 Summary Preview 保存为卡片，按批次浏览、复制消息、恢复到临时工作区。
- 消息导航：在支持站点内快速定位 user / assistant 消息，并可配置高亮效果。
- 删除会话：对支持站点触发当前会话删除，带站点 userscript 配置。
- 模型偏好：支持 Gemini、Grok、DeepSeek、Notion AI 的默认模型选择，Gemini 支持 Thinking Level。
- 可配置：自定义平台、API Profile、Summary / Prompt 优化模板、快捷键、主题、语言、顶部栏和分组按钮。
- 备份迁移：导入 / 导出配置、提示词库、发送历史和快捷键。

> **兼容性说明：**“重载插件后恢复工作区”仅支持重载插件后不会关闭 ChatClub 插件标签页的浏览器。实测支持 Arc、Dia；不支持 Tabbit。

## 内置站点

| 站点名 | URL | 工作台 | Summary | 消息导航 | 删除会话 | 模型偏好 |
| --- | --- | --- | --- | --- | --- | --- |
| ChatGPT | https://chatgpt.com/ | ✓ | ✓ | ✓ | ✓ |  |
| Claude | https://claude.ai/new | ✓ | ✓ | ✓ |  |  |
| Gemini | https://gemini.google.com/app | ✓ | ✓ | ✓ | ✓ | ✓ |
| Grok | https://grok.com/ | ✓ | ✓ |  | ✓ | ✓ |
| Grok Mirror | https://gk.dairoot.cn/ | ✓ | ✓ | ✓ | ✓ |  |
| DeepSeek | https://chat.deepseek.com/ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Kagi Assistant | https://assistant.kagi.com/ | ✓ | ✓ | ✓ | ✓ |  |
| Notion AI | https://app.notion.com/ai | ✓ | ✓ | ✓ | ✓ | ✓ |
| Perplexity | https://www.perplexity.ai/ | ✓ |  |  |  |  |
| Poe | https://poe.com/ | ✓ |  | ✓ |  |  |
| Kimi | https://www.kimi.com/ | ✓ |  |  |  |  |
| DouBao | https://www.doubao.com/ | ✓ |  |  |  |  |
| Qwen | https://chat.qwen.ai/ | ✓ |  |  |  |  |
| TypingMind | https://setapp.typingcloud.com/ | ✓ | ✓ |  |  |  |
| LobeHub | https://app.lobehub.com/ | ✓ | ✓ |  |  |  |
| AI Studio | https://aistudio.google.com/ |  |  | ✓ |  |  |
| LeChat | https://chat.mistral.ai/ |  |  | ✓ |  |  |

## 安装

1. 下载或克隆本仓库。
2. Chromium 121+ 浏览器可启用开发者模式后直接选择本项目根目录；根目录保留跨浏览器后台入口，Chrome 120 开发环境应使用 `npm run pack` 生成并解压的 Chromium 专用包。发布包仍支持 Chromium 120+。
3. Firefox / Zen 136+ 使用 `npm run pack:firefox` 生成的 Firefox 专用包，它会从同一份 Manifest 源派生 Gecko 合法权限与后台入口。
4. 打开 ChatClub，按需登录各 AI 平台。

保存或启用自定义 Summary / Delete userscript 时会请求 User Scripts 权限，首次执行时也会再次校验。Chrome 135–137 还需开启 Developer Mode，Chrome 138+ 需开启 Allow User Scripts；Firefox 需 153+。Firefox / Zen 136–152 支持内置 Summary 与内置 Delete 脚本，但不支持自定义 userscript；其内置 Delete 注入会在验证 ChatClub 直系 iframe 后使用安全的 frameId 兼容路径。Firefox 不提供 Chromium Debugger API，需要真实 hover/click 的删除确认应由用户手动完成。

## 开发

插件页与后台直接运行浏览器原生 ESM：修改 `app/`、`background/`、`shared/` 或 `ui/` 后，可直接在扩展管理页重新加载。`content-src/` 是六个 classic content 产物的唯一作者源；修改后必须先执行 `npm run generate`，由锁定的 esbuild 生成 `content/` 下的自包含 IIFE（不拆 chunk、不压缩、无 eval）。仓库要求使用 Node.js 22 或 24 执行生成、校验和发布工具，推荐先运行 `nvm use` 采用仓库固定的 Node 24；正式打包会拒绝其他 Node 主版本。

Chrome 数值版本固定使用 `YYYY.M.D.N` 四段格式：前三段对应本地发布日期，第四段是同日递增的发布序号。任何发布 payload 变化都必须同时提升 `APP_VERSION` 和该数值版本；版本快照会拒绝复用或回退。

| 命令 | 作用 |
| --- | --- |
| `npm run generate` | 从 `content-src/`、协议和 userscript 单一源重建全部 classic content 产物 |
| `npm run verify:generated` | 检查生成物是否需要更新，不写文件 |
| `npm run verify:version` | 检查 APP_VERSION、manifest 与 package-info 一致性 |
| `npm run version:snapshot` | 完成规定的版本提升后，刷新发布 payload / userscript 版本快照 |
| `npm run verify:manifest` | 检查 manifest 引用的文件、通配符与本地化消息 |
| `npm run verify:modules` | 按 ESM、classic、userscript、CJS 和 DevTools probe 的真实语法与分层规则校验模块图，并拒绝原生 ESM 使用需要最低浏览器降级的语法 |
| `npm run check` | 执行 JSON、模块图、生成物、版本和 manifest 静态校验 |
| `npm test` | 运行可在 Node 中执行的回归脚本 |
| `npm run smoke:chromium` | 用 Playwright persistent context 加载 Chromium 扩展并执行运行时 smoke；必须用 `EXPECTED_CHROMIUM_MAJOR` 声明并核对实际主版本，可用 `CHROMIUM_BINARY` 指定目标 |
| `npm run smoke:firefox` | 用 Selenium 临时安装 Firefox 扩展并执行运行时 smoke；可用 `FIREFOX_BINARY` 指定目标 |
| `npm run pack` | 先执行静态校验与 Node 回归测试，再生成确定性的 Chromium 包 `dist/chatclub-<version>.zip` |
| `npm run pack:firefox` | 先执行同一发布门禁，再从 Manifest 源生成确定性的 Firefox 包 `dist/chatclub-<version>-firefox.zip` |
| `npm run ci` | 执行 CI 使用的完整验证链 |

`output/`、开发工具、缓存、`content-src/` 和其他非运行时文件不会进入发布包。`userscripts/` 是按需源码接口的正式运行时资产，会与生成后的 runner registry 一起进入两个目标包；打包、模块闭包校验和浏览器 smoke 共用同一份 package plan。

运行时架构以浏览器原生 ESM 为主：协议常量、Frame command contract 和生成器保持单一来源；Firefox document background 与 Chromium service worker 复用同一个后台 runtime，并将 userscript frame target、content script 注册协调和 tab/action 行为拆为静态依赖，所有监听仍在模块求值阶段同步注册；storage schema 与浏览器 I/O adapter 分层；Settings、Summary、Pocket 按需导入；跨功能状态通过带读写边界的 feature port 访问。六个 classic content 入口由 esbuild 从 `content-src/` clean-room 重建并内嵌协议；应用创建 iframe 前会核对注册，已加载 frame 也具备按 documentId 验证和有界恢复。extension page → iframe 命令统一通过 authenticated Frame RPC；自定义源码只由后台从 storage 读取并注入，不经过远程页面的通用 `postMessage` 通道。

| 目录 | 作用 |
| --- | --- |
| `app/` | 主界面、工作区、Summary、Pocket、设置 |
| `background/` | 扩展后台 Service Worker |
| `content-src/` | 内容脚本 ESM 作者源与共享 runtime |
| `content/` | 由生成器产出的自包含 classic IIFE；不要手工编辑 |
| `shared/` | 常量、存储、站点配置、快捷键、i18n |
| `styles/` | 全局样式 |
| `userscripts/` | Summary 内置采集脚本 |
| `topic-delete-userscripts/` | 删除会话内置脚本 |
| `ui/` | 通用 UI 工具 |
