# ChatClub 官方增量规则审核说明

## 功能与用户控制

ChatClub 可以从独立仓库 `0-V-linuxdo/ChatClub-rules` 获取官方站点兼容数据。首次使用前，设置页要求用户明确选择“启用自动检查”或“保持内置规则／仅手动检查”；授权前不会发起规则请求。“立即检查”只授权当次请求。自动检查和手动检查都只验证并缓存候选，不能改变当前运行配置。只有用户点击“应用本次全部增量”后，整批变化组件才会作为一个原子事务激活，不提供部分应用。

请求只访问固定 GitHub Pages、GitHub Release 与 GitHub Release CDN 地址，使用 `credentials: "omit"` 和 `referrerPolicy: "no-referrer"`。请求不携带当前页面 URL、对话内容、Cookie、用户标识或遥测。

## 远端内容不是代码

远端文件是具有精确字段白名单的 JSON：

- channel 只描述版本身份和不可变 catalog 指针；
- catalog 只包含完整组件索引和纯文本发布说明；
- 每个组件只包含一个 `站点 + 功能` 的精确 HTTPS host、path prefix、CSS 选择器候选和少量有界整数。

未知字段、未知站点、组件缺失/重复、非法 host/path/selector slot、越界大小或版本不兼容都会使整个候选不可应用。格式不允许 JavaScript、WASM、动态模块、表达式、正则执行、动作 DSL、DNR、iframe、Cookie、Debugger、网络请求、模型配置或 destructive label。实现不使用 `eval`，也不使用 `userScripts` 执行维护者下发的内容。

Summary runner、Message Navigator adapter、Delete runner、角色判断、去重、剪贴板访问、菜单与确认动作、trusted-input 约束和删除完成证明全部在扩展包内。远端 CSS 只能缩小或补充候选集合，不能单独授权点击，也不能把 `{ ok: true }` 当作删除完成。

此边界与 Chrome Web Store 的 [Manifest V3 requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements) 以及 Mozilla 的 [Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/) 保持一致。

## 完整性、事务和回退

- channel、catalog 与每个 component 分别使用离线 ECDSA P-256/SHA-256 签名；私钥不进入源码仓库、Actions、日志或扩展包。
- 插件固定 current 和 recovery 两把公钥，验证原始文件字节、独立签名、SHA-256、大小、key id 及组件 identity。
- 组件 blob 按内容哈希只写缓存；同 sequence 异 hash、同 component revision 异 hash和版本回退永久拒绝。
- 应用前再次验证 catalog 和所有变化组件。任何验证、准备或 content registration 失败都会恢复旧 generation；恢复失败时进入 `recovery-required` 并禁用 Delete。
- 单组件回退通过本地 pin 完成；“回退上次更新”原子恢复上次涉及的全部组件。回退不会降低防回滚水位。

## 审核复现

1. 打开 Settings → About → 官方增量规则。
2. 在未授权状态确认 Network 中没有规则请求。
3. 选择仅手动检查并点击“立即检查”，确认请求只访问固定 channel、catalog 和变化组件。
4. 确认检查完成后现有页面行为未改变，再点击“应用全部更新”。
5. 验证单组件回退、整批回退、离线 LKG，以及 Firefox 在需要 trusted input 时安全失败并交给用户处理。

规则仓库公开地址：<https://github.com/0-V-linuxdo/ChatClub-rules>
