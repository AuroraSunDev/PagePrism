import type { Behavior, Frame, ObservationKind } from "../shared/types";
import {
  inferChanges,
  sameVisualValue,
  type VisualState,
  type ChangeEvent,
} from "./motion";
import { propertyLabels, roleLabels } from "../shared/behavior";
export interface BehaviorContext {
  kind: ObservationKind;
  selector?: string;
  beforeIndex?: number;
  activeIndex?: number;
  exitIndex?: number;
  events?: ChangeEvent[];
}
export function buildBehavior(
  states: VisualState[],
  frames: Frame[],
  ctx: BehaviorContext,
): Behavior {
  const beforeIndex = ctx.beforeIndex || 0,
    baseline = states[beforeIndex] || {
      nodes: [],
      floating: [],
      animations: [],
    };
  const events = (ctx.events || inferChanges(states).events).filter(
    (e) => ctx.kind === "hover" || !ctx.selector || e.selector === ctx.selector,
  );
  const participants: Behavior["participants"] = [];
  for (const event of events) {
    let participant = participants.find((p) => p.selector === event.selector);
    if (!participant) {
      const node = states
        .flatMap((s) => [...s.nodes, ...s.floating])
        .find((n) => n.selector === event.selector);
      const role = event.selector.includes("::")
        ? "pseudo"
        : states.some((s) =>
              s.floating.some((n) => n.selector === event.selector),
            )
          ? "nearby"
          : event.selector === ctx.selector
            ? "target"
            : ctx.kind === "hover"
              ? "child"
              : "target";
      participant = {
        selector: event.selector,
        role,
        label:
          role === "nearby"
            ? event.after.slice(0, 80)
            : node?.tag === "img" || node?.tag === "svg"
              ? "图像"
              : node?.text?.slice(0, 40) || roleLabels[role],
        properties: [],
        firstSeenMs: frames[event.sampleIndex]?.elapsedMs || 0,
      };
      participants.push(participant);
    }
    if (!participant.properties.includes(event.property))
      participant.properties.push(event.property);
  }
  const phases: Behavior["phases"] = [];
  const addPhase = (
    name: "before" | "active" | "after",
    index: number,
    description: string,
  ) => {
    const f = frames[index];
    if (f)
      phases.push({ name, frame: f.file, elapsedMs: f.elapsedMs, description });
  };
  addPhase("before", beforeIndex, "已记录操作前的原站画面。");
  addPhase(
    "active",
    ctx.activeIndex ?? frames.length - 1,
    participants.length
      ? participants
          .map(
            (p) =>
              `${roleLabels[p.role]}：${p.properties.map((k) => propertyLabels[k] || k).join("、")}`,
          )
          .join("；")
      : "动作中的可见画面已保存，具体变化需结合片段核对。",
  );
  let restoration: Behavior["restoration"] = "unknown";
  if (ctx.exitIndex !== undefined) {
    const end = states[ctx.exitIndex];
    if (end && events.length) {
      let comparable = 0,
        changed = false;
      for (const event of events) {
        if (event.kind === "floating") {
          const original = baseline.floating.find(
              (n) => n.selector === event.selector,
            )?.text,
            after = end.floating.find(
              (n) => n.selector === event.selector,
            )?.text;
          comparable++;
          if (original !== after) changed = true;
          continue;
        }
        const original = baseline.nodes.find(
            (n) => n.selector === event.selector,
          ),
          after = end.nodes.find((n) => n.selector === event.selector);
        if (!original || !after) continue;
        comparable++;
        if (
          event.kind === "style"
            ? !sameVisualValue(
                event.property,
                original.styles[event.property],
                after.styles[event.property],
              )
            : original.text !== after.text
        )
          changed = true;
      }
      if (comparable) restoration = changed ? "changed" : "restored";
    }
    addPhase(
      "after",
      ctx.exitIndex,
      restoration === "restored"
        ? "移开后的采样回到了默认属性／文字状态。"
        : restoration === "changed"
          ? "动作后仍有状态变化，后续恢复过程未验证。"
          : "已记录动作后画面，结束与恢复关系尚未确认。",
    );
  }
  const relevant = states
    .flatMap((s) => s.nodes)
    .filter((n) => participants.some((p) => p.selector === n.selector));
  const timing = relevant
    .map((n) => n.timing)
    .filter((t): t is Record<string, string> => !!t);
  const positive = (value = "") =>
    value.split(",").some((x) => parseFloat(x) > 0);
  const transitions = timing.filter((t) => positive(t["transition-duration"]));
  const animations = timing.filter(
    (t) =>
      t["animation-name"] &&
      t["animation-name"] !== "none" &&
      positive(t["animation-duration"]),
  );
  const declared = (field: string) =>
    [
      ...new Set(
        [
          ...transitions.map((t) => t["transition-" + field]),
          ...animations.map((t) => t["animation-" + field]),
        ].filter(Boolean),
      ),
    ].join(" / ");
  const parameters: Behavior["parameters"] = [
    "duration",
    "delay",
    "easing",
    "repeat",
  ].map((name) => {
    const value =
      name === "easing"
        ? declared("timing-function")
        : name === "repeat"
          ? [
              ...new Set(
                animations
                  .map((t) => t["animation-iteration-count"])
                  .filter(Boolean),
              ),
            ].join(" / ")
          : declared(name);
    return {
      name,
      value: value || null,
      status: value ? "observed" : "unknown",
      source: value ? "computed-style" : "not-inspected",
      reason: value
        ? "读取到的CSS声明；不等于整段交互的实测时长或完整时序。"
        : "没有足够声明证据；默认0s不用于推断脚本动画。",
    };
  });
  parameters.push({
    name: "reduced-motion",
    value: null,
    status: "unknown",
    source: "not-inspected",
    reason: "尚未切换原站的减少动态设置进行对照。",
  });
  return {
    kind: ctx.kind,
    participants: participants.slice(0, 12),
    phases,
    restoration,
    parameters,
    interpretation: {
      status: "inferred",
      summary:
        participants.length > 1
          ? "同一次操作中多个参与者出现反馈，可按阶段组织复现。"
          : "根据采样中的状态变化提出复现说明。",
      limitation:
        "参与者关系与采样先后是解释线索，未证明完整编排、设计意图或具体动画库。",
    },
  };
}
