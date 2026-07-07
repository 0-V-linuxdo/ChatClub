# ChatClub

多 AI 聊天工作台浏览器扩展。把常用 AI 站点放进同一个页面，一次输入，多处发送，并排比较结果。

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
| Gemini | https://gemini.google.com/app | ✓ | ✓ | ✓ |  | ✓ |
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
2. 打开浏览器扩展管理页，启用开发者模式。
3. 选择“加载已解压的扩展程序”，并选择本项目根目录。
4. 打开 ChatClub，按需登录各 AI 平台。

## 开发

无需构建。修改代码后，在扩展管理页重新加载即可。

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

仓库：https://github.com/0-V-linuxdo/ChatClub
