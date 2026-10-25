import type { Behavior, ObservationKind, CoverageCheck } from "./types";
export const propertyLabels: Record<string, string> = {
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
  文字变化: "文字内容",
  出现的文字: "提示文字",
};
export const roleLabels = {
  target: "主体",
  child: "子元素",
  pseudo: "装饰层",
  nearby: "邻近提示",
};
export const phaseLabels = {
  before: "操作前",
  active: "动作中",
  after: "动作后",
};
export const kindLabels: Record<ObservationKind, string> = {
  hover: "悬停",
  automatic: "持续观察",
  scroll: "页面滚动",
  entry: "展示入口",
  container: "容器滚动",
};
export const parameterLabels: Record<string, string> = {
  duration: "时长",
  delay: "延迟",
  easing: "缓动",
  repeat: "循环",
  "reduced-motion": "减少动态支持",
};
export function behaviorSummary(b: Behavior) {
  return b.participants.length
    ? b.participants
        .map(
          (p) =>
            `${roleLabels[p.role]}的${p.properties.map((x) => propertyLabels[x] || x).join("、")}发生变化`,
        )
        .join("；") + "。这些变化出现在同一次观察中，完整配合关系仍需核对。"
    : "保留了同一次动作的原站过程，具体参与者关系尚未确认。";
}
export function behaviorAcceptance(b: Behavior): string[] {
  return [
    `按“${kindLabels[b.kind]}”执行，分别对照${b.phases.map((p) => `${phaseLabels[p.name]}（${p.frame}）`).join("、")}。`,
    ...b.participants.map(
      (p) =>
        `核对${roleLabels[p.role]}“${p.label}”的${p.properties.map((x) => propertyLabels[x] || x).join("、")}，保留各参与者的独立状态。`,
    ),
    ...(b.restoration === "restored"
      ? ["移开后核对参与者回到默认状态，提示内容按原片段结束。"]
      : b.restoration === "changed"
        ? ["动作后的采样仍有变化，继续确认结束与恢复过程，不强行设为立即还原。"]
        : ["结束或恢复状态尚未确认，实现前对照片段或向用户确认。"]),
    "阶段时间是采样位置，不作为动画的精确延迟或时长。",
  ];
}
export function coverageText(c: CoverageCheck) {
  const status = {
    pending: "待补查",
    checked: "已检查",
    blocked: "受阻",
    limited: "尚未完成",
  }[c.status];
  const outcome = c.outcome
    ? {
        change: "发现变化",
        "no-change": "本轮未见变化",
        uncertain: "关系待确认",
      }[c.outcome]
    : "";
  return `${kindLabels[c.kind]} · ${c.label}：${status}${outcome ? "，" + outcome : ""}${c.attempts > 1 ? "（已补查）" : ""}`;
}
