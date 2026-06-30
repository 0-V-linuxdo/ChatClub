# ChatClub

多 AI 聊天工作台浏览器扩展。一次输入，多平台发送；同屏比较回答，并把有价值的内容总结、收藏、复用。

## 核心能力

| 场景 | 说明 |
| --- | --- |
| 统一提问 | 顶部输入框可向当前活跃聊天页批量发送消息。 |
| 对比回答 | 多列工作区、分组标签、聊天全屏，适合并排比较模型输出。 |
| Summary | 采集当前聊天页内容，支持预览、总结、基于上下文追问。 |
| Pocket | 保存 Preview 对话，按分组浏览、复制、恢复到工作区。 |
| Prompt | 提示词库、快捷插入、AI 优化提示词、可配置模板。 |
| 平台配置 | 内置常用 AI 平台，也支持自定义 URL、输入框和发送按钮选择器。 |
| 模型偏好 | 支持 Gemini、Grok、DeepSeek、Notion AI 的默认模型偏好。 |
| 个性化 | 布局预设、顶部栏拖拽、快捷键、主题、语言、按钮提示。 |
| 迁移备份 | 导入 / 导出 ChatClub 配置，兼容旧版 Mod 配置。 |

## 内置平台

| 类型 | 平台 |
| --- | --- |
| 国际 AI | ChatGPT、Claude、Gemini、Grok、Kagi Assistant、Perplexity、Poe |
| 中文 AI | DeepSeek、Kimi、DouBao、Qwen |
| 其他工作流 | Notion AI、TypingMind、LobeHub、Grok Mirror |

Summary 内置采集脚本覆盖：ChatGPT、Claude、Gemini、Grok、Grok Mirror、DeepSeek、Kagi Assistant、Notion AI、TypingMind、LobeHub。

## 安装

1. 下载或克隆本仓库。
2. 打开浏览器扩展管理页，启用开发者模式。
3. 选择“加载已解压的扩展程序”。
4. 选择本项目根目录。
5. 打开 ChatClub，并按需登录各 AI 平台。

## 开发

无需构建。修改代码后，在浏览器扩展管理页重新加载扩展即可。

| 目录 | 作用 |
| --- | --- |
| `app/` | 主界面、工作区、Summary、Pocket、设置页逻辑 |
| `background/` | 扩展后台 Service Worker |
| `content/` | 内容脚本、页面桥接、内置 userscript bundle |
| `shared/` | 常量、存储、国际化、快捷键、站点配置 |
| `styles/` | 全局样式 |
| `userscripts/` | Summary 内置站点采集脚本 |
| `ui/` | DOM 和通用 UI 工具 |

## 仓库

https://github.com/0-V-linuxdo/ChatClub
