# 参考项目核对

核对日期：2026-10-23。使用 GitHub 插件读取 README、结构与下列源码；未安装或运行参考项目。README 中的功能陈述不能直接当作本项目已验证能力。

## 项目身份与职责

| 参考 | 本次使用的上游 | 固定快照 | 借鉴职责 |
| --- | --- | --- | --- |
| designlang | [Manavarya09/design-extract](https://github.com/Manavarya09/design-extract) | a1805d13e21126da958d2b9cdf33a75c0a5435e7 | 网址到设计语言、交互与 Agent 输出的产品路径。搜索结果 tobiags/designlang 的 README 指向此上游，采用原上游。 |
| Design MD Extractor | [jpoindexter/design-md-extractor](https://github.com/jpoindexter/design-md-extractor) | 6cb4230b41f0687bce0caccbe4d33f796e28e30e | 采集、规范化证据、生成输出与存储分层。另有同名 kim-wing 项目；本次选择具有证据模型和本地 GUI 的这一实现，属于实现方选择。 |
| Motion Capture | [namearth5005/motion-capture](https://github.com/namearth5005/motion-capture) | 9a24168996eb057dc689bd41225bce0747c5e3ff | 原始片段、带时间戳关键帧、4／6／9 格表达。借鉴表达方式，不引入 Tauri 或桌面录屏依赖。 |

三个仓库 LICENSE 均已读取，均为 MIT。本项目采用独立实现；若后续直接复制实质代码，应保留相应版权和许可。词典的第三方内容仍保留既有来源与权限状态。

## 读取的实现与结论

### designlang

- [src/api.js](https://github.com/Manavarya09/design-extract/blob/a1805d13e21126da958d2b9cdf33a75c0a5435e7/src/api.js)：extract 与 render 分开；同一设计数据支持多种输出。
- [src/extractors/motion-runtime.js](https://github.com/Manavarya09/design-extract/blob/a1805d13e21126da958d2b9cdf33a75c0a5435e7/src/extractors/motion-runtime.js)：按触发整理 runtime observations，包含时长、延迟、属性、目标。
- 限制：示例中由 transform／opacity 等属性推断滚动配方，不能单凭 transform 确认视差。本项目只将这类结果作为候选，保留观测数据。
- 不照搬多平台导出、评分、克隆、品牌融合、MCP 等广泛功能，避免第一版失焦。

### Design MD Extractor

- [system-design.md](https://github.com/jpoindexter/design-md-extractor/blob/6cb4230b41f0687bce0caccbe4d33f796e28e30e/docs/architecture/system-design.md)：采集与叙述生成分离，证据是输出来源。
- [evidenceSchema.ts](https://github.com/jpoindexter/design-md-extractor/blob/6cb4230b41f0687bce0caccbe4d33f796e28e30e/src/evidence/evidenceSchema.ts)：Zod 验证来源、视口、截图、样式、组件和警告。
- [runExtraction.ts](https://github.com/jpoindexter/design-md-extractor/blob/6cb4230b41f0687bce0caccbe4d33f796e28e30e/src/crawl/runExtraction.ts)：浏览器采集后规范化，最后生成、写出；部分失败保留结果。
- 本项目沿用职责分离与 schema 校验，不把频率高低当成“描述真实性”的置信度。

### Motion Capture

- [src/lib/grid.ts](https://github.com/namearth5005/motion-capture/blob/9a24168996eb057dc689bd41225bce0747c5e3ff/src/lib/grid.ts)：Canvas 合成多格并标注时间。
- 限制：该快照中 totalDuration 固定 1.0 秒，且以 cover 裁切。本项目以实际采样时间标注，默认完整包含原画面，避免裁掉动作目标。
- README 演示图与下载链接仍有占位内容，不以其成熟度或可运行性背书。

## 本项目采用的组合

网址输入与自动分析 → 有证据的区域／效果报告 → 原片段与关键帧 → 关联既有词典 → 选择与改造 → DESIGN.md／AGENT-BRIEF.md／evidence.json。

第一版采用规则与模板生成解释，不要求模型 API。未覆盖复杂效果时明确说明，不能用假数据代替真实采集。后续如加入多模态分析，仍需引用同一证据模型。
