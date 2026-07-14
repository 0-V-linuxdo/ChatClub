# ChatClub

多 AI 聊天工作台浏览器扩展。把常用 AI 站点放进同一个页面，一次输入，多处发送，并排比较结果。

官方链接：[Telegram 频道](https://t.me/chatclub_extension) · [GitHub 仓库](https://github.com/0-V-linuxdo/ChatClub)

## 功能

- 多列工作区：内置分组标签、布局预设、全屏、刷新、新建会话、复制链接、在新标签页打开。
- 统一输入：向当前工作区里的聊天页批量发送消息，支持提示词库、发送历史和快捷插入。
- Summary：采集当前页面对话，预览来源、总结上下文、继续追问；预览卡片使用对应 tab 的真实 favicon。
- Pocket：把 Summary Preview 保存为卡片，按批次浏览、复制消息、恢复到临时工作区。
- 消息导航：在支持站点内快速定位 user / assistant 消息，并可配置高亮效果。
- 删除会话：对支持站点触发当前会话删除，带站点 userscript 配置。
- 模型偏好：支持 Gemini、Grok、DeepSeek、Notion AI 的默认模型选择，Gemini 支持 Thinking Level。
- 可配置：自定义平台、API Profile、Summary / Prompt 优化模板、快捷键、主题、语言、顶部栏和分组按钮。
- 备份迁移：导入 / 导出配置、提示词库、发送历史和快捷键。

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
2. Chromium 系浏览器可启用开发者模式后直接选择本项目根目录；发布包使用 `npm run pack` 生成。
3. Firefox Nightly / Zen 使用 `npm run pack:firefox` 生成的 Firefox 专用包，它会从同一份 Manifest 源派生 Gecko 合法权限与后台入口。
4. 打开 ChatClub，按需登录各 AI 平台。

保存或启用自定义 Summary / Delete userscript 时会请求 User Scripts 权限，首次执行时也会再次校验。Chrome 135–137 还需开启 Developer Mode，Chrome 138+ 需开启 Allow User Scripts；Firefox 需 153+，因此较旧的 Zen 版本仅支持内置脚本路径。Firefox 不提供 Chromium Debugger API，需要真实 hover/click 的删除确认应由用户手动完成。

## 开发

扩展运行时无需 bundler；修改普通源码后，可直接在扩展管理页重新加载。仓库要求使用当前 Node.js LTS（22 或 24）执行生成、校验和发布工具。

| 命令 | 作用 |
| --- | --- |
| `npm run generate` | 从 `userscripts/` 与 Delete Sites 单一源重建同步产物 |
| `npm run verify:generated` | 检查生成物是否需要更新，不写文件 |
| `npm run verify:version` | 检查 APP_VERSION、manifest 与 package-info 一致性 |
| `npm run verify:manifest` | 检查 manifest 引用的文件、通配符与本地化消息 |
| `npm run check` | 执行语法、JSON、import、生成物、版本和 manifest 静态校验 |
| `npm test` | 运行可在 Node 中执行的回归脚本 |
| `npm run pack` | 生成确定性的 Chromium 包 `dist/chatclub-<version>.zip` |
| `npm run pack:firefox` | 从同一 Manifest 源生成确定性的 Firefox 包 `dist/chatclub-<version>-firefox.zip` |
| `npm run ci` | 执行 CI 使用的完整验证链 |

`output/`、开发工具、缓存、Summary 源 userscript 和其他非运行时文件不会进入发布包；生成后的运行时 registry 才会随扩展发布。

运行时架构以浏览器原生 ESM 为主：协议常量和生成器保持单一来源；Firefox document background 与 Chromium service worker 复用同一个后台模块；storage schema 与浏览器 I/O adapter 分层；Settings、Summary、Pocket 按需导入；跨功能状态通过带读写边界的 feature port 访问。三个稳定的 classic content 入口会由生成器内嵌只读协议快照，使浏览器中残留的旧动态注册仍可独立启动；应用创建 iframe 前会核对注册，已加载 frame 也具备按文档验证和有界恢复。Summary / Delete 的控制面使用按文档注册的扩展内部 RPC，自定义源码只由后台从 storage 读取并注入，不经过远程页面的 `postMessage` 通道。

| 目录 | 作用 |
| --- | --- |
| `app/` | 主界面、工作区、Summary、Pocket、设置 |
| `background/` | 扩展后台 Service Worker |
| `content/` | 内容脚本、iframe 桥接、Summary bundle |
| `shared/` | 常量、存储、站点配置、快捷键、i18n |
| `styles/` | 全局样式 |
| `userscripts/` | Summary 内置采集脚本 |
| `topic-delete-userscripts/` | 删除会话内置脚本 |
| `ui/` | 通用 UI 工具 |
