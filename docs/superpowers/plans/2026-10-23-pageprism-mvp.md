# PagePrism MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在本机完成真实网址到证据报告、词典解释、用户选择与 Agent 交接的闭环。

**Architecture:** 浏览器采集、证据归纳、导出生成分离。React 工作台消费同一个 ReportRun；原站媒体、词典知识和用户改造要求分别保存。无云端或模型依赖。

**Tech Stack:** React / TypeScript / Vite；Express / Playwright / Zod；Vitest / Playwright Test；文件存储。

**Spec:** ../specs/2026-10-23-pageprism-mvp-design.md

## Global Constraints

- 本机 127.0.0.1 运行；公开 URL 单页，不复用登录上下文。
- 桌面 1440×900，移动结构采样 390×844；最多 6 个代表条目、3 个悬停目标、90 秒总期限，单个运行任务。
- 允许读取、滚动、移动指针；不自动点击、提交或执行第三方页面指令。
- 参数与事实分别保留 basis、evidence；关键帧真实计时，不伪造完整覆盖。
- 只消费 46 个详细词条，不将原有 synthetic 观察用作真实结果。
- 中文在前英文在后的品牌；视觉基线为 docs/design 中的四张概念图与 design-system.md。
- 原站视频与截图属于本地实际媒体；不把概念图作为参考站采集结果。

## Review Focus

- 输入重定向或子资源指向私网：任务一／二测试在浏览前和每次请求阻断。
- 录制起点与采样不同步：任务二测试片段区间与真实采样时间，而非硬编码总时长。
- 采集中途失败或取消：任务二／三保留部分结果并释放浏览器，不假完成。
- 用户编辑后刷新或返回：任务三／四保存选择和表单，不改写原站证据。
- 无有效动效或超出识别能力：任务二返回静态观察与限制，任务四导出未知项。

## 文件责任

| 文件／目录 | 责任 |
| --- | --- |
| shared/types.ts | Run、Finding、Frame、Capture、SelectionInput 的契约。 |
| server/url-policy.ts | URL、IP、DNS、重定向／请求目标验证。 |
| server/store.ts | 任务与媒体文件的本地读写、ID和路径约束。 |
| server/capture.ts | 浏览器生命周期、动作计划、媒体、采样。 |
| server/analyze.ts | 从原始页面信息提取可追溯条目、词典关联。 |
| server/index.ts | 本地 API、并发与取消、静态生产入口。 |
| shared/export.ts | 用证据与用户输入生成 Markdown、JSON；不调用浏览器。 |
| src/features/* | 开始、报告、词典、定制各自组件。 |
| src/components/* | Header、按钮、TermDialog、MediaViewer 等共用控件。 |
| src/styles.css | 统一 tokens、布局、响应式、可见焦点与减动。 |
| public/reference/* | 原创参考夹具；独立于应用工作台。 |
| tests/unit、tests/integration、tests/e2e | 纯逻辑、真实浏览器采集、工作台流程。 |

## Task 1: 契约、边界与项目基础

**Interfaces**

- `validatePublicUrl(input: string, lookup?): Promise<URL>`：返回规范地址或可读错误。
- `ReportRun`：id、url、sourceKind、status、stage、createdAt、findings、warnings、coverage、media、error。
- `Finding`：id、title、category、summary、trigger、changes、implementation、termIds、evidenceStatus、facts、limitations、screenshot、frames、clip。
- `Frame`：file、elapsedMs；`Clip`：file、startSeconds、endSeconds。
- `SelectionInput`：purpose、destination、accent、pace、content、stack、descriptionOverrides。

- [ ] 配置最小 React / Vite / TS 与服务器执行、构建、检查命令。
- [ ] 为协议、凭证、端口、IPv4／IPv6／DNS混合私网编写失败用例：`validatePublicUrl('http://127.0.0.1')` 必须拒绝；`https://example.com` 用固定公网 DNS 替身通过。
- [ ] 实现 URL 策略、Zod 输入校验、文件存储与媒体白名单；补路径穿越测试。
- [ ] `npm run test:unit` 和 `npm run typecheck` 通过后保存此任务结果。

## Task 2: 真实采集、分析与媒体

**Interfaces**

- `captureRun(run: ReportRun, options: { signal: AbortSignal; onUpdate: (patch) => Promise<void>; trustedFixture?: boolean }): Promise<ReportRun>`。
- `analyzePage(raw, context): Finding[]`：最多 6 项，不生成无证据动效结论。
- `runDirectory(id)` 与 `saveRun(run)` 由 store 提供；所有媒体写在该目录。

- [ ] 测试原创夹具：静态布局、hover transform／shadow、scroll reveal；真实采样的 elapsedMs 严格递增。
- [ ] 用 recordVideo 保存原站过程；用统一单调时钟记录动作、采样和 clip 边界；关闭上下文后发布视频路径。
- [ ] 采集布局、颜色、字体、computed style、有限 runtime animations 与前后变化；只把观察到的属性写成事实，名称推测标为候选。
- [ ] 完成两个视口、有限滚动与最多三个悬停目标；对请求、重定向、弹窗和下载施加边界。
- [ ] 测试私网子资源、无动效、部分失败、90 秒期限和取消，检查上下文在所有退出路径关闭。
- [ ] 运行 `npm run test:integration`，实际检查视频文件、图像和真实时间戳。

## Task 3: API 与可用工作台

**Interfaces**

- POST `/api/runs` 接受 `{url}`；POST `/api/runs/demo` 使用固定内置来源；GET `/api/runs/:id` 返回 ReportRun。
- POST `/api/runs/:id/cancel` 发出 AbortSignal；媒体端点只返回 run 内已登记文件。
- `useRun` 轮询活动任务并在终态停止；`ReportView` 消费 Run 与已选 ID。

- [ ] API 测试重复创建、输入错误、取消、读不存在结果、路径和 Origin。
- [ ] 实现开始页、真实阶段反馈、报告列表／详情／媒体、单多全选与用户描述编辑。
- [ ] 关键帧用实际数据显示；视频不能播放时保留关键帧替代。
- [ ] 连接现有词条，补中英／别名／白话搜索、主题筛选和对话框焦点恢复。
- [ ] 将用户选择与描述覆盖保存于以 run ID 为键的本地状态；刷新后从磁盘恢复 Run。
- [ ] 用浏览器检查示例真实采集到报告、播放和术语入口；对照报告概念修正布局。

## Task 4: 定制、导出与关键帧拼图

**Interfaces**

- `buildAgentBrief(run, selectedIds, input): string`：用途为空或未选择时返回验证错误；仅展开存在且已选择的条目。
- `buildDesignMarkdown(run): string`：保留观察、推测、未知与覆盖。
- `composeFrameGrid(frames, count: 4|6|9): Promise<Blob>`：Canvas 完整包含画面，标注实际时间，按实际可用数量绘制。

- [ ] 单元测试 selectedIds 去重／不存在 ID、未选信息不进入 brief、用户参数不覆盖事实、恶意内容安全引用。
- [ ] 实现用途优先表单、参数解释、返回不丢信息、实时预览与复制／下载。
- [ ] 生成 DESIGN.md、AGENT-BRIEF.md、evidence.json 和 PNG，不引入虚构准确率或源码结论。
- [ ] 用 E2E 验证选两项→填用途→复制／下载，导出文件只含选择项；测试 PNG 为可读真实图像。

## Task 5: 完整验证与交付

- [ ] `npm run typecheck`、`npm run build`、单元与采集集成测试通过。
- [ ] 工作台 E2E 在 Chromium 运行；客户端主流程在 Firefox／WebKit 可用时运行，未运行明确记录。
- [ ] 用 Browser/IAB 优先实际操作；验证桌面、当前窗口和 390×844 窄屏，检查键盘、减动、长文本、空状态、失败与取消。
- [ ] 输入一个真实公开 URL 做烟雾检查，真实失败同样记录，不把示例视为外部成功。
- [ ] 用 view_image 对照概念与最终截图，记录文案、布局、字体、颜色、容器、媒体与移动行为至少五项；修复可修复偏差。
- [ ] 更新 README 启动步骤、实现范围与限制；保存测试结果与视觉对照。保留方案／词典来源，排除本地运行采集目录与调试临时文件。

## 自审与 builder check

设计已由独立软件工程审阅完成，结论 `nothing important left`；媒体时钟、编码和具体采样算法留给实现者。上述五项覆盖设计中的主流程、边界、失败、适配与本地交付。按本轮“准备完成后直接搭建”的用户授权，在当前会话执行，不额外创建用户任务。
