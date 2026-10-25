# Evidence-Guided Observation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline, task-by-task. Use checkbox steps.

**Goal:** 让覆盖缺口影响下一步观察，并产生可核对的组合说明与质量对照。
**Architecture:** 纯策略模块管理覆盖与补查，纯behavior模块归纳参与者与阶段；原观察器执行受控动作，原工作台和导出消费可选新字段；独立评测器比较冻结基线。
**Tech Stack:** 现有TS/React/Express/Playwright，无新依赖。
**Spec:** ../specs/2026-10-25-evidence-guided-observation-design.md

## Global Constraints
12条／8组悬停／最多2次补查／每组最多2次／120秒；驻留最多2000ms；旧报告兼容；无站点专用规则、模型服务、新页面或点击范围扩大。

## Review Focus
- 同一属性在不同元素上的自主／交互变化不能互相吞掉；以参与者身份控制干扰。
- 检查状态、变化结果和因果判断保持独立；无证据不得补出阶段或精确时长。
- 预算与取消后仍保留待查／受阻原因，安全边界不因补查放宽。
- 组合阶段须对应真实采样帧，选中条目之外的数据不得混入交接。
- 对照样例、真实网站和用户重要性评测分开，不以格式或测试数量冒充识别率。

## Task 1 — 策略、证据与交互模型
Files: shared/types.ts, shared/behavior.ts, server/observation-policy.ts, server/motion.ts, server/visual-state.js; tests/unit/policy.test.ts, tests/unit/behavior.test.ts, tests/unit/motion.test.ts.
Interfaces: optional CoverageCheck[]/Behavior; ObservationPolicy discover/next/finish/finalize; change events indexed by selector/property; buildBehavior(states,frames,context).
- [x] 先写延迟时长、预算／补查顺序、中间状态与邻近自主文字反例，确认RED。
- [x] 实现有界策略、按参与者过滤变化和状态／参数来源，运行单元与类型检查GREEN，保存。

## Task 2 — 接入采集、报告与交接
Files: server/observe-motion.ts, server/browser-collector.js, server/analyze.ts, server/capture.ts, shared/export.ts, src/features/ReportView.tsx, src/styles.css; tests/integration/evidence.test.ts, tests/unit/export.test.ts, tests/e2e/workbench.spec.ts.
Interfaces: capture emits unchanged Finding plus optional behavior and checks; shared behavior text/acceptance helpers used by report and export.
- [x] 先复现声明／脚本延迟、复合反馈与自主文字干扰，导出选中项和旧记录兼容；确认RED。
- [x] 接入补查、驻留提示、覆盖状态与组合说明；所有原有安全／取消用例保持GREEN。
- [x] 浏览器检查报告、覆盖折叠区、移动端与导出，保存。

## Task 3 — 质量对照与交付
Files: evaluation/cases.ts, evaluation/run.ts, evaluation/README.md, package.json, README.md, docs/testing/2026-10-25-evidence-guided.md.
Interfaces: gold expectations match observed trigger/target/property; JSON records scope/version/results/duration/false positives/structural completeness; runner accepts baseline source directory and candidate root.
- [x] 用独立8样例与冻结基线0b2480d对照，保留真实结果；金标由样例行为定义。
- [x] 公网参考复核并说明范围；完整单元／集成／E2E、构建、格式、diff验证。
- [x] 一次新上下文最终审查，重要项一次RED→GREEN修正；更新验证记录和交付。
