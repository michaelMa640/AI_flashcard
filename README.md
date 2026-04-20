# FlashCard for Obsidian

一个面向 `Obsidian + Spaced Repetition` 的知识卡片工具原型，当前阶段以 `Windows + macOS` 桌面端优先。

目标不是再做一个“笔记软件”，而是把下面这条链路压缩成接近一键：

1. 输入一句英文、美句、生词、词组，或任何你没理解透的知识内容。
2. 选择直接入库，或者先交给 AI 解释。
3. 让 AI 按知识卡片需要的结构输出。
4. 一键生成适合 Obsidian 的 Markdown。
5. 通过 `Spaced Repetition` 插件格式进入复习流。

## 本地开发资料

以下内容目前保留在本地工作区中，默认不上传到 Git 仓库：

- `docs/`
- `obsidian_docs_staging/`

这些文档继续作为本地开发和 Obsidian 项目管理资料使用。

## 这份项目当前包含什么

- [产品需求文档](./docs/prd.md)
- [技术架构设计](./docs/architecture.md)
- [Obsidian 卡片格式设计](./docs/obsidian-format.md)
- [Prompt 模板设计](./docs/prompt-template.md)
- [前端交互原型](./prototype/index.html)

## 当前结论

第一阶段最重要的不是“平台铺得多全”，而是“桌面端写入 Obsidian vault 的方式必须靠谱”。

目前更稳的路线是：

- `macOS`：优先支持直接写入本地或 iCloud 中的 Obsidian vault
- `Windows`：优先支持直接写入本地 vault，不把 `iCloud Drive` 当作默认前提
- `iOS / Android`：暂时搁置，不纳入当前主开发范围

原因是 Obsidian 官方对 iCloud 的推荐系统主要是 Apple 生态，并提示 `Windows 上的 iCloud Drive` 可能出现重复或损坏风险。

## 建议的 MVP

- 输入知识内容
- 选择“直接加入”或“AI 解释”
- 配置第三方 API Key、Base URL、Model
- 注入固定 Prompt，要求 AI 输出结构化卡片数据
- 生成 Obsidian 笔记 Markdown
- 支持选择或配置本地 Obsidian vault 路径
- 生成 `obsidian://new` URI，方便在支持的平台中直接创建笔记

## 原型怎么用

直接打开 [prototype/index.html](/Users/michael_user/Documents/vibe coding/flashCard/prototype/index.html) 即可查看页面结构。

原型具备：

- API 设置持久化到浏览器 `localStorage`
- 可编辑的系统 Prompt
- 调用 OpenAI 兼容接口的前端请求逻辑
- Markdown 卡片生成
- Obsidian URI 生成
- 无 API 时的本地降级生成

## 工作流验证

桌面端第 7 步联调目前提供了一个可重复执行的验证脚本，用于检查：

- 单词、词组、句子三类示例输入
- Markdown 卡片生成
- Vault 文件写入
- Obsidian URI 生成

可直接运行：

```bash
npm run validate:workflow
```

当前验证会在本机临时目录中创建模拟 vault，验证完成后自动清理。

## V1 演示建议

当前第 8 步已经开始整理 V1 可演示版本，推荐按下面顺序演示：

1. 先在界面中选择一个内置演示样例，快速填充单词、词组或句子内容。
2. 展示“AI 解释并结构化”或“直接生成最小卡片”两种入口。
3. 展示结构化结果、Markdown 预览，以及 `Spaced Repetition` 可用的卡片格式。
4. 选择目标 Vault，演示一键写入。
5. 如果需要演示兜底链路，再展示 Obsidian URI 的复制与打开能力。

当前已知边界：

- `Windows` 实机联调仍待补齐
- 中长内容场景下 URI 可能变长，正式演示时建议优先展示 Vault 直写链路

## 参考资料

- [Obsidian URI 官方文档](https://help.obsidian.md/uri)
- [Obsidian 跨设备同步说明](https://help.obsidian.md/Getting%20started/Sync%20your%20notes%20across%20devices)
- [Spaced Repetition 插件 README](https://github.com/st3v3nmw/obsidian-spaced-repetition)
