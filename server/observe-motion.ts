import type { Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import type {
  Finding,
  Frame,
  ReportRun,
  ObservationKind,
} from "../shared/types";
import { MAX_FINDINGS, MAX_HOVER_GROUPS } from "../shared/limits";
import {
  collectPageEvidence,
  sampleElement,
  type ElementSample,
} from "./analyze";
import {
  readVisualState,
  inferChanges,
  removeAutonomousChanges,
  type VisualState,
} from "./motion";
import {
  ObservationPolicy,
  declaredHoldMs,
  type ObservationAction,
} from "./observation-policy";
import { buildBehavior, type BehaviorContext } from "./behavior";
import { behaviorSummary } from "../shared/behavior";
import { pixelDifference, cropPng, type Region } from "./pixels";

type Sequence = {
  states: VisualState[];
  images: Buffer[];
  frames: Frame[];
  start: number;
  end: number;
};
type Options = {
  directory: string;
  signal: AbortSignal;
  seconds: () => number;
  progress: (stage: string) => Promise<void>;
};
const names: Record<string, string> = {
  transform: "位置或形态",
  translate: "位移",
  rotate: "旋转",
  scale: "缩放",
  opacity: "透明度",
  filter: "图像滤镜",
  fill: "填色",
  stroke: "描边",
  color: "文字颜色",
  "background-color": "背景颜色",
  "box-shadow": "阴影",
  "border-color": "边框颜色",
  "clip-path": "裁切",
  "font-size": "字号",
  "letter-spacing": "字距",
};
export async function observeMotion(
  page: Page,
  run: ReportRun,
  options: Options,
) {
  let serial = 0,
    sequenceId = 0;
  const policy = new ObservationPolicy();
  run.coverage.checks = policy.checks;
  const observedRegions = new Set<string>(),
    scrolled = new Set<string>(),
    recorded = new Map<string, string>();
  const checkpoint = () => options.signal.throwIfAborted();
  const save = async (file: string, data: Buffer) => {
    await writeFile(join(options.directory, file), data);
    run.media.files.push(file);
    return file;
  };
  const sample = async (
    count: number,
    interval: number,
    selector?: string,
    action?: (i: number) => Promise<void>,
  ): Promise<Sequence> => {
    checkpoint();
    const start = options.seconds(),
      clock = performance.now(),
      id = sequenceId++,
      states: VisualState[] = [],
      images: Buffer[] = [],
      frames: Frame[] = [];
    for (let i = 0; i < count; i++) {
      checkpoint();
      if (i) await page.waitForTimeout(interval);
      if (action) await action(i);
      states.push(await readVisualState(page, selector));
      const elapsedMs = Math.round(performance.now() - clock),
        image = await page.screenshot({ type: "png", timeout: 5000 });
      images.push(image);
      frames.push({
        file: await save(`motion-${id}-${i}.png`, image),
        elapsedMs,
      });
    }
    return { states, images, frames, start, end: options.seconds() };
  };
  const add = async (
    key: string,
    data: Omit<Finding, "id" | "frames" | "screenshot" | "clip">,
    seq: Sequence,
    poster = seq.frames.length - 1,
    context?: BehaviorContext,
  ) => {
    const oldId = recorded.get(key),
      oldIndex = run.findings.findIndex((f) => f.id === oldId);
    if (
      oldId &&
      (data.evidenceStatus !== "observed" ||
        run.findings[oldIndex].evidenceStatus === "observed")
    )
      return false;
    if (!oldId && run.findings.length >= MAX_FINDINGS - 1) return false;
    const kind: ObservationKind = key.startsWith("hover")
      ? "hover"
      : key.startsWith("entry")
        ? "entry"
        : key.startsWith("container")
          ? "container"
          : key.startsWith("auto") || key.startsWith("canvas")
            ? "automatic"
            : "scroll";
    const behavior = buildBehavior(
      seq.states,
      seq.frames,
      context || { kind, selector: data.selector },
    );
    const finding: Finding = {
      ...data,
      ...(kind === "hover" ? { summary: behaviorSummary(behavior) } : {}),
      behavior,
      id: oldId || `motion-${serial++}`,
      frames: seq.frames,
      screenshot: seq.frames[poster].file,
      clip: {
        file: "recording.webm",
        startSeconds: seq.start,
        endSeconds: seq.end,
      },
    };
    recorded.set(key, finding.id);
    if (oldIndex >= 0) run.findings[oldIndex] = finding;
    else run.findings.push(finding);
    await options.progress("保存视觉变化与原站证据");
    return true;
  };
  const description = (change: ReturnType<typeof inferChanges>) =>
    [
      ...change.properties.map((p) => names[p] || p),
      ...(change.texts.length ? ["文字内容"] : []),
      ...(change.floatingTexts.length ? ["新出现的文字"] : []),
    ].join("、");
  const limits = [
    "记录的是观察过程中的变化，不据此确认原站动画库或完整触发逻辑。",
    "视频定位采用录制页时钟，关键帧标签是实际采样时间。",
  ];
  const visibleRegion = (r: Region): Region => {
    const x = Math.max(0, r.x),
      y = Math.max(0, r.y);
    return {
      x,
      y,
      width: Math.max(1, Math.min(1440, r.x + r.width) - x),
      height: Math.max(1, Math.min(900, r.y + r.height) - y),
    };
  };
  const observeScene = async (label: string, supplied?: Sequence) => {
    if (!supplied) await options.progress("连续观察" + label);
    const seq = supplied || (await sample(8, 420));
    const beforeIds = new Set(run.findings.map((f) => f.id));
    let anyChange = inferChanges(seq.states).events.length > 0;
    const animations = new Set(
      seq.states.flatMap((s) => s.animations.map((a) => a.selector)),
    );
    let count = 0;
    for (const node of seq.states[0].nodes) {
      if (count >= 3) break;
      if (
        node.rect.width * node.rect.height > 1440 * 900 * 0.85 ||
        (!animations.has(node.selector) &&
          node.children !== 0 &&
          node.tag !== "img")
      )
        continue;
      const change = inferChanges(
        seq.states.map((s) => ({
          ...s,
          nodes: s.nodes.filter((n) => n.selector === node.selector),
          floating: [],
        })),
      );
      if (!change.facts.length) continue;
      const animation = seq.states[0].animations.find(
        (a) => a.selector === node.selector,
      );
      const added = await add(
        "auto|" +
          (node.group || node.selector) +
          "|" +
          change.properties.join("|"),
        {
          title:
            "持续变化：" +
            ((node.text ? "文字" : "") ||
              (node.tag === "img" ? "图像" : "视觉区域")),
          category: "motion",
          trigger: supplied
            ? "滚轮后继续观察（关系待确认）"
            : "加载／自动播放（" + label + "）",
          summary:
            "连续采样中观察到" +
            description(change) +
            "随时间变化。右侧为实际过程。",
          changes: description(change),
          implementation:
            "先根据片段确定变化顺序、持续时间和结束状态，再选择关键帧或时间轴实现；原站实现尚未确认。",
          termIds: ["parameter.duration", "parameter.easing"],
          evidenceStatus: supplied ? "candidate" : "observed",
          selector: node.selector,
          facts: [
            ...change.facts,
            ...(animation
              ? [
                  {
                    label: "浏览器动画",
                    value: `${animation.name}；${animation.duration}ms；循环 ${animation.iterations}`,
                    basis: "measured" as const,
                  },
                ]
              : []),
          ],
          limitations: limits,
        },
        seq,
      );
      if (added) count++;
    }
    for (const node of seq.states[0].nodes
      .filter((n) => n.tag === "canvas" && !observedRegions.has(n.selector))
      .slice(0, 2)) {
      observedRegions.add(node.selector);
      const region = visibleRegion(node.rect);
      const change = Math.max(
        ...seq.images
          .slice(1)
          .map((image) =>
            pixelDifference(
              cropPng(seq.images[0], region),
              cropPng(image, region),
            ),
          ),
      );
      if (change > 0.006) anyChange = true;
      if (change > 0.006)
        await add(
          "canvas|" + node.selector,
          {
            title: "画布区域的持续变化",
            category: "motion",
            trigger: supplied
              ? "滚轮后继续观察（关系待确认）"
              : "加载／自动播放（" + label + "）",
            summary:
              "可见画布所在区域在连续采样中发生了画面变化，具体物体和运动含义需结合片段确认。",
            changes: "画布区域的可见像素变化",
            implementation:
              "先确认想保留的画面行为，再选择绘制或3D方案；像素变化无法证明内部使用了哪个工具。",
            termIds: ["parameter.duration", "rule.reduced-motion"],
            evidenceStatus: "candidate",
            selector: node.selector,
            facts: [
              {
                label: "变化像素比例",
                value: (change * 100).toFixed(1) + "%",
                basis: "measured",
              },
            ],
            limitations: [
              ...limits,
              "可能包含画布上方的可见文字或浮层；未理解画布内部语义。",
            ],
          },
          seq,
        );
    }
    if (!supplied) run.coverage.actions.push(label + "：连续观察8帧");
    policy.record({
      kind: supplied ? "scroll" : "automatic",
      label,
      status: "checked",
      outcome: anyChange ? "change" : "no-change",
      observedStates: ["before", "active"],
      findingIds: run.findings
        .filter((f) => !beforeIds.has(f.id))
        .map((f) => f.id),
    });
  };
  const hover = async (action: ObservationAction) => {
    const target = action.target;
    if (run.findings.length >= MAX_FINDINGS - 1) return;
    try {
      const locator = page.locator(target.selector).first();
      if (!(await locator.count())) throw new Error("目标已移除");
      await locator.scrollIntoViewIfNeeded({ timeout: 1500 });
      await page.mouse.move(1, 1);
      await page.waitForTimeout(250);
      const box = await locator.boundingBox();
      if (!box || box.y < 0 || box.y + box.height > 900)
        throw new Error("目标尚不可完整操作");
      const before = await readVisualState(page, target.selector);
      const holdMs = Math.min(
        2000,
        Math.max(
          action.holdMs,
          ...before.nodes.map((n) => declaredHoldMs(n.timing || {})),
        ),
      );
      const key = action.key;
      const seq = await sample(6, 180, target.selector, async (i) => {
        if (i === 2) await locator.hover({ timeout: 1500 });
        if (i === 3)
          await page.mouse.move(
            box.x + box.width * 0.6,
            box.y + box.height * 0.5,
          );
        if (i === 4) await page.waitForTimeout(Math.max(0, holdMs - 360));
        if (i === 5) {
          await page.mouse.move(1, 1);
          await page.waitForTimeout(240);
        }
      });
      if (seq.states.some((s) => s.missingTarget))
        throw new Error("目标结构已变化，局部观察未完成");
      const idle = inferChanges(seq.states.slice(0, 2));
      const rawChange = inferChanges(seq.states.slice(1));
      const change = removeAutonomousChanges(rawChange, idle);
      const foundIds = () =>
        run.findings
          .filter(
            (f) => f.selector === target.selector && f.trigger.includes("悬停"),
          )
          .map((f) => f.id);
      const region = visibleRegion(box),
        baseline = pixelDifference(
          cropPng(seq.images[0], region),
          cropPng(seq.images[1], region),
        ),
        active = pixelDifference(
          cropPng(seq.images[1], region),
          cropPng(seq.images[4], region),
        );
      run.coverage.actions.push("悬停与移开：" + target.label);
      if (!change.facts.length && !(baseline < 0.003 && active > 0.006)) {
        policy.finish(action, {
          outcome: "no-change",
          states: ["before", "active", "after"],
          findings: foundIds(),
          reason: "有限观察窗口内未见有效变化，可在预算内延长驻留补查。",
        });
        return;
      }
      await add(
        "hover|" + key,
        {
          title:
            "悬停变化：" +
            (target.label === "DIV" || target.label === "IMG"
              ? "视觉组件"
              : target.label.slice(0, 24)),
          category: "motion",
          trigger: "鼠标悬停与移开",
          summary:
            "鼠标进入“" +
            target.label +
            "”期间，" +
            (description(change) || "局部画面") +
            "发生变化。移开状态也保留在序列中。",
          changes: description(change) || "局部像素变化",
          implementation:
            "对照默认、移入、持续和移开状态设置变化；同时考虑键盘焦点与触屏的操作方式。",
          termIds: [
            "trigger.hover",
            ...(change.floatingTexts.length ? ["component.tooltip"] : []),
            "parameter.duration",
            "parameter.easing",
          ],
          evidenceStatus: change.facts.length ? "observed" : "candidate",
          selector: target.selector,
          facts: change.facts.length
            ? change.facts
            : [
                {
                  label: "变化像素比例",
                  value: (active * 100).toFixed(1) + "%",
                  basis: "measured",
                },
              ],
          limitations: [
            ...limits,
            "先观察静止状态以减少自动播放干扰；不能保证完全隔离同时发生的动画。",
          ],
        },
        seq,
        4,
        {
          kind: "hover",
          selector: target.selector,
          beforeIndex: 1,
          activeIndex: 4,
          exitIndex: 5,
          events: change.events.map((e) => ({
            ...e,
            sampleIndex: e.sampleIndex + 1,
          })),
        },
      );
      policy.finish(action, {
        outcome: change.facts.length ? "change" : "uncertain",
        states: ["before", "active", "after"],
        findings: foundIds(),
        reason: action.followup
          ? "依据前次结果延长观察，仍保留时间窗口限制。"
          : undefined,
      });
    } catch (error) {
      checkpoint();
      policy.finish(action, {
        outcome: "uncertain",
        states: [],
        findings: [],
        blocked: true,
        reason: "目标被遮挡、已变化或暂不可操作。",
      });
      run.warnings.push(
        "一个交互目标被遮挡或已变化，已跳过并继续检查其他目标。",
      );
    }
  };
  const optional = async (
    kind: ObservationKind,
    label: string,
    selector: string,
    action: () => Promise<void>,
  ) => {
    try {
      await action();
    } catch (error) {
      checkpoint();
      if (
        page.isClosed() ||
        /^(?:chrome-error|about:neterror)/.test(page.url())
      )
        throw error;
      policy.record({
        kind,
        label,
        selector,
        status: "blocked",
        outcome: "uncertain",
        observedStates: [],
        findingIds: [],
        reason: "目标已变化或无法操作。",
      });
      run.warnings.push(label + "已变化或无法操作，已跳过并继续探索。");
    }
  };
  try {
    await observeScene("初始画面");
    let raw = await collectPageEvidence(page);
    const entry = raw.entryTargets[0];
    if (entry)
      await optional("entry", "展示入口", entry.selector, async () => {
        checkpoint();
        await options.progress("探索展示入口");
        const seq = await sample(3, 350, undefined, async (i) => {
          if (i !== 1) return;
          await page.locator(entry.selector).click({ timeout: 3000 });
          await page
            .waitForFunction(
              (selector) => {
                const el = document.querySelector(selector);
                if (!el) return true;
                const s = getComputedStyle(el);
                return (
                  s.display === "none" ||
                  s.visibility === "hidden" ||
                  Number(s.opacity) < 0.05
                );
              },
              entry.selector,
              { timeout: 5000 },
            )
            .catch(() => {});
          await page.waitForTimeout(500);
        });
        run.coverage.actions.push(
          "展示入口点击：" + entry.label + "（独立展示层、非表单、最多一次）",
        );
        await page
          .waitForLoadState("networkidle", { timeout: 5000 })
          .catch(() => {});
        await add(
          "entry",
          {
            title: "入口后的画面变化",
            category: "motion",
            trigger: "展示入口点击",
            summary: "操作独立展示入口后继续观察，前后画面保留为同一组证据。",
            changes: "入口前后可见状态",
            implementation:
              "根据片段确认进入体验的状态切换、加载反馈和内容出现顺序。",
            termIds: ["trigger.state-change"],
            evidenceStatus: "candidate",
            selector: entry.selector,
            facts: [
              { label: "入口操作", value: entry.label, basis: "observed" },
            ],
            limitations: [
              ...limits,
              "仅探索一个明确展示层中的非表单按钮；不代表遍历全部路径。",
            ],
          },
          seq,
        );
        policy.record({
          kind: "entry",
          label: entry.label,
          selector: entry.selector,
          status: "checked",
          outcome: "uncertain",
          observedStates: ["before", "active"],
          findingIds: run.findings
            .filter((f) => f.selector === entry.selector)
            .map((f) => f.id),
        });
        await observeScene("入口后画面");
      });
    const reveal = new Map<string, ElementSample>();
    let previousY = -1,
      unchanged = 0,
      positions = 0;
    for (let step = 0; step < 22; step++) {
      checkpoint();
      if (run.findings.length >= MAX_FINDINGS - 1) break;
      raw = await collectPageEvidence(page);
      const current = await readVisualState(page);
      if (
        current.nodes.some(
          (n) => n.tag === "canvas" && !observedRegions.has(n.selector),
        )
      )
        await observeScene("后续出现的视觉区域");
      for (const target of raw.revealTargets)
        if (!reveal.has(target.selector)) reveal.set(target.selector, target);
      while (run.findings.length < MAX_FINDINGS - 1) {
        const action = policy.next(raw.targets);
        if (!action) break;
        await hover(action);
        checkpoint();
      }
      for (const container of raw.scrollContainers) {
        if (scrolled.has(container.selector)) continue;
        scrolled.add(container.selector);
        await optional(
          "container",
          container.label,
          container.selector,
          async () => {
            const el = page.locator(container.selector).first(),
              box = await el.boundingBox();
            if (!box) return;
            const before = await el.evaluate((e) => e.scrollTop);
            const seq = await sample(4, 250, undefined, async (i) => {
              if (i) {
                await page.mouse.move(
                  box.x + box.width / 2,
                  box.y + Math.min(box.height / 2, 400),
                );
                await page.mouse.wheel(0, box.height * 0.85);
              }
            });
            const after = await el.evaluate((e) => e.scrollTop);
            run.coverage.actions.push(
              `容器滚轮：${Math.round(before)} → ${Math.round(after)}px`,
            );
            policy.record({
              kind: "container",
              label: container.label,
              selector: container.selector,
              status: "checked",
              outcome: after !== before ? "change" : "no-change",
              observedStates: ["before", "active"],
              findingIds: [],
            });
            if (after !== before)
              await add(
                "container|" + container.selector,
                {
                  title: "容器内的内容变化",
                  category: "motion",
                  trigger: "容器内滚轮",
                  summary: "在容器内发送滚轮后，内部位置和可见内容发生变化。",
                  changes: "容器滚动与可见内容",
                  implementation:
                    "明确实际滚动容器，再根据证据决定滚动、吸附或进入动画。",
                  termIds: ["trigger.scroll-linked"],
                  evidenceStatus: "observed",
                  selector: container.selector,
                  facts: [
                    {
                      label: "scrollTop",
                      value: before + " → " + after,
                      basis: "measured",
                    },
                  ],
                  limitations: limits,
                },
                seq,
              );
          },
        );
      }
      const position = await page.evaluate(() => ({
        y: scrollY,
        height: document.documentElement.scrollHeight,
      }));
      positions++;
      if (position.y === previousY) unchanged++;
      else unchanged = 0;
      if (unchanged >= 2) break;
      previousY = position.y;
      await page.mouse.move(720, 450);
      const seq = await sample(4, 250, undefined, async (i) => {
        if (i === 1) await page.mouse.wheel(0, 720);
      });
      await observeScene("后续区域", {
        ...seq,
        states: seq.states.slice(-2),
        images: seq.images.slice(-2),
        frames: seq.frames.slice(-2),
      });
      const next = await page.evaluate(() => scrollY);
      for (const [selector, before] of reveal) {
        const el = page.locator(selector).first();
        if (!(await el.count())) continue;
        const box = await el.boundingBox().catch(() => null);
        if (!box || box.y + box.height < 0 || box.y > 900) continue;
        const after = await sampleElement(page, selector).catch(() => null);
        if (!after) continue;
        const props = [
          "opacity",
          "transform",
          "filter",
          "scale",
          "rotate",
        ].filter(
          (p) =>
            before.styles[p] !== undefined && after[p] !== before.styles[p],
        );
        if (!props.length) continue;
        await add(
          "scroll|" + (before.group || selector),
          {
            title: "滚动期间的视觉变化",
            category: "motion",
            trigger: "滚轮经过区域",
            summary:
              "滚动到这个区域时，" +
              props.map((p) => names[p]).join("、") +
              "与先前状态不同。",
            changes: props.map((p) => names[p]).join("、"),
            implementation:
              "根据片段核对是进入时触发、滚动进度联动还是同时发生的自动动画。",
            termIds: ["trigger.in-view", "trigger.scroll-linked"],
            evidenceStatus: "candidate",
            selector,
            facts: props.map((p) => ({
              label: p,
              value: before.styles[p] + " → " + after[p],
              basis: "measured",
            })),
            limitations: limits,
          },
          seq,
        );
      }
      if (
        next === position.y &&
        position.height <= 900 &&
        pixelDifference(seq.images[0], seq.images.at(-1)!) > 0.006
      )
        await add(
          "wheel-scene",
          {
            title: "滚轮期间的场景变化",
            category: "motion",
            trigger: "滚轮输入（关系待确认）",
            summary: "页面没有普通长页位移，滚轮输入期间仍观察到画面变化。",
            changes: "场景的可见画面",
            implementation:
              "检查内部状态和虚拟滚动，不以文档高度判断是否存在后续内容。",
            termIds: ["trigger.scroll-linked"],
            evidenceStatus: "candidate",
            facts: [
              {
                label: "页面高度",
                value: position.height + "px",
                basis: "measured",
              },
            ],
            limitations: [
              ...limits,
              "自动播放可能同时发生，尚未证明滚轮与变化的因果关系。",
            ],
          },
          seq,
        );
    }
    const final = await page.evaluate(() => ({
      y: scrollY,
      height: document.documentElement.scrollHeight,
    }));
    run.coverage.actions.push(
      `逐区域重新发现与滚轮：${positions}个位置，最终${Math.round(final.y)}px／页面${final.height}px；悬停${policy.groupsAttempted}组，补查${policy.followupsUsed}次`,
    );
    if (final.y + 900 < final.height - 30)
      run.warnings.push("本轮滚动预算未覆盖全部后续内容。");
    if (policy.groupsAttempted >= MAX_HOVER_GROUPS)
      run.warnings.push("已达到8组代表性交互预算，仍可能遗漏其他组件。");
    if (run.findings.length >= MAX_FINDINGS - 1)
      run.warnings.push("已达到12条代表观察预算，报告不包含所有视觉变化。");
  } finally {
    policy.finalize(options.signal.aborted ? "cancelled" : "budget");
  }
}
