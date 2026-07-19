# ChatClub 2026.7.19.3 交付说明

发布时间：2026-07-19 01:55:36（Asia/Shanghai）

显示版本：`「2026-07-19｜01:55:36」`

发布分支：`codex/esm-audit-release-2026-07-19`

回滚基线：`80f73d5`

## 本次交付

- 将应用、后台和 content 作者源继续拆成职责更窄的原生 ESM 模块，删除已确认无调用者的导出、包装层和重复实现。
- 新增 ESM 与 CommonJS 导出活性门禁、浏览器模块图校验、原生入口体积预算、content factory 精确契约和 controller port 回归测试。
- 拆分 content-script 注册职责，收紧 background request、Frame RPC、runtime readiness、trusted-input 与 Delete Site 的精确结果契约；不确定是否已送达的破坏性命令仍然禁止自动重试。
- Settings 新增按应用配置 iframe `allow`、`sandbox`、Referrer Policy 与扩展属性的管理界面；配置会先规范化和校验，高风险授权要求显式确认，并可恢复安全默认值。
- 保留工作区 iframe 的恢复语义，并补充拖拽、弹层关闭策略、存储迁移、Summary 配置镜像和跨浏览器构建的回归覆盖。

## 架构结论

源码的 ESM 架构已具备可持续演进所需的主要约束：作者源与生成物边界明确，后台与插件页使用原生 ESM，classic content 由 `content-src/` 单向生成；模块图、realm、入口预算、跨层依赖、未使用导出和生成物新鲜度均由自动门禁验证。

这不等于“仓库中永远不存在冗余”。动态注册、事件入口、浏览器回调和站点适配器无法只靠静态引用证明活性，因此保留了小而显式的 allowlist，并要求每项有可审计理由。今后新增例外应当先证明运行时入口，再扩充 allowlist。

## 安全复核

独立复核未发现 P0、P1 或 P2 阻断项。重点覆盖：authenticated Frame RPC、frame/document 绑定、content bridge 恢复、background runtime 编排、Grok 分区 Cookie 镜像、Delete Site 完成证明以及 trusted-input 的 fail-closed 路径。

仍需视为运行时风险而非静态结论的部分：第三方站点 DOM 漂移与竞态、自定义 userscript 的显式受信能力、旧浏览器的能力降级，以及 Firefox 缺少 Chromium Debugger API 时需要用户完成的真实输入动作。

## 验证记录

| 范围 | 结果 | 说明 |
| --- | --- | --- |
| Node.js 24 本地 CI | 通过 | 静态校验、生成物、版本、Node 回归与 package plan |
| Playwright Chromium 149 | 通过 | 本地扩展 runtime smoke |
| Firefox Nightly 154 | 通过 | 本地临时扩展 runtime smoke |
| Arc | 通过（非破坏性） | 重载 unpacked extension 后重新加载保留的 ChatClub 页；版本、主壳、frame 与 fatal 状态正常 |
| Tabbit | 通过（非破坏性） | 扩展重载会关闭 ChatClub 页；重新打开后版本、主壳、frame 与 fatal 状态正常 |
| Zen | 有限通过 | 临时扩展主壳与 Settings 可加载；自动 smoke 无法从该临时扩展页取得 current tab，因此不记作完整通过 |
| Dia | 通过（非破坏性） | 确认安装版本为 `2026.7.19.3`；主壳、Kagi/ChatGPT/Claude iframe 与 iframe 权限管理页正常渲染 |
| GitHub 四引擎基线与双目标打包 | 通过 | [CI run 29690128798](https://github.com/0-V-linuxdo/ChatClub/actions/runs/29690128798)：Chromium 149、Chrome for Testing 120、Firefox 136、Firefox Nightly、Node 22/24 与 package job 均为 success |

以下操作会改变外部账号或远端数据，本次未在用户账号中代为执行，因此不宣称已完成实站端到端验收：发送消息、应用模型偏好、Summary 读取剪贴板、Grok Cookie 登录/退出迁移、Delete Site 打开并确认最终删除。合并前如需发布级实站证明，应使用专用测试账号和可删除的测试会话，并记录浏览器版本与结果。

## 发布包

| 目标 | 文件 | SHA-256 |
| --- | --- | --- |
| Chromium | `dist/chatclub-2026.7.19.3.zip` | `f72c1c0d2b805b04b079d2a0afc02f10dd164b33d0097a663c29abe120f31c31` |
| Firefox | `dist/chatclub-2026.7.19.3-firefox.zip` | `cdba1395d5bb28503838bbad7a32363d245baa839bd4bda804e2073cea1a43ca` |

发布包必须从本分支最新 HEAD 重新运行 `npm run pack` 与 `npm run pack:firefox` 生成；上述摘要用于核对本次本地确定性构建。

## 提交与回滚

本次变更按依赖顺序拆分：

1. `dc1eab7` — 应用 controller、UI、storage 与 iframe policy。
2. `753aef2` — content/background runtime、安全契约与生成物。
3. `1d58fda` — ESM/CJS 活性分析、架构门禁与回归测试。
4. `03af890` — 版本快照、README 与初始交付记录。
5. 本说明的验收更新提交 — GitHub 四基线终态与 Dia 非破坏性人工验收。

优先按相反顺序逐提交回滚。若整批撤销，可在独立修复分支上审阅 `git diff 80f73d5..HEAD` 后使用 `git revert` 生成反向提交；不要重写已共享分支历史。涉及发布 payload 的回滚必须使用一个新的、单调递增的版本号，不能复用 `2026.7.19.3`。
