# General Motion Observation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task. Steps use checkbox syntax.

**Goal:** 通过通用动作和状态比较提升视觉变化覆盖，不增加网站专用适配。
**Architecture:** browser-collector 负责重新发现；visual-state/motion/pixels 负责状态与变化；observe-motion 编排并输出原 Finding；capture 保留原安全生命周期。
**Tech Stack:** 现有 React/TS/Express/Playwright，加 pngjs。
**Spec:** ../specs/2026-10-23-general-motion-observation.md

## Global Constraints

12条观察／8组悬停／120秒／最多1次明确非表单入口；无站点词和域名分支；继续本地规则分析；旧报告和原界面兼容。

## Review Focus

- 自动播放混入悬停：静止对照，无法证明的像素变化为候选。
- 重绘导致定位失效：稳定属性／祖先ID；跳过失效目标。
- 重复组件消耗预算：组件模式去重，并保留后续区域覆盖。
- 画布被遮挡：命中检测后才比较；静态画布无动效结论。
- 入口含副作用：非表单、展示入口层、排除敏感文案，最多一次；原网络防护回归。

## Task 1 — 发现与差异基础

Files: server/browser-collector.js, server/analyze.ts, server/visual-state.js, server/motion.ts, server/pixels.ts; tests/unit/motion.test.ts, tests/integration/motion.test.ts, tests/fixtures/motion.html.
Interfaces: PageEvidence.targets/entryTargets/scrollContainers; VisualState; inferChanges(states); pixelDifference/cropPng.

- [x] 写小组件、子元素／滤镜／新增文字、瞬时文字和静态对照失败测试，运行确认RED。
- [x] 实现通用发现和状态比较；变换标签／类名的独立结构仍通过；单元和发现集成GREEN。
- [x] 类型检查，保存提交。

## Task 2 — 通用探索与回归

Files: server/observe-motion.ts, server/capture.ts, server/store.ts, shared/limits.ts, src/core.ts, tests/e2e/workbench.spec.ts, README.md.
Interfaces: observeMotion(page,run,options) 输出原 Finding 和真实媒体，不新增UI或数据格式。

- [x] 验证自动变化→当前区域悬停→可识别入口→容器／页面滚轮→重新发现的链路；安全入口与静态反例先RED。
- [x] 实现采样、差异归纳和重复模式去重；动态画布明确候选；旧选择可保存12条。
- [x] 单元、集成、跨浏览器E2E、构建与格式检查通过；原站验证和结果说明。
- [x] 按 executing-plans 做一次独立最终审查；重要项一次RED→GREEN修复；保存和交付。
