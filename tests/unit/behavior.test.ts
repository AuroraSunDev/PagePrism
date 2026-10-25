import { it, expect } from "vitest";
import { buildBehavior } from "../../server/behavior";
import { propertyLabels } from "../../shared/behavior";
import {
  inferChanges,
  removeAutonomousChanges,
  type VisualState,
} from "../../server/motion";
const node = (selector: string, filter = "none", text = "") => ({
  selector,
  tag: "div",
  children: 0,
  text,
  styles: { filter },
  rect: { x: 0, y: 0, width: 30, height: 40 },
});
const snapshot = (
  color: string,
  counter: string,
  hint = false,
): VisualState => ({
  nodes: [node("#subject", color)],
  floating: [
    node("#counter", "none", counter),
    ...(hint ? [node("#hint", "none", "Helpful detail")] : []),
  ],
  animations: [],
});
it("removes autonomous text by participant while retaining a separate real hint", () => {
  const a = snapshot("grayscale(1)", "0"),
    b = snapshot("grayscale(1)", "1"),
    c = snapshot("none", "2", true);
  const change = removeAutonomousChanges(
    inferChanges([b, c]),
    inferChanges([a, b]),
  );
  expect(change.floatingTexts).toEqual(["Helpful detail"]);
  expect(change.properties).toContain("filter");
});
it("links phases and participants to actual frames and leaves unmeasured timing unknown", () => {
  const states = [
    snapshot("grayscale(1)", "0"),
    snapshot("none", "0", true),
    snapshot("grayscale(1)", "0"),
  ];
  const frames = states.map((_, i) => ({
    file: `f-${i}.png`,
    elapsedMs: [20, 320, 850][i],
  }));
  const b = buildBehavior(states, frames, {
    kind: "hover",
    selector: "#subject",
    activeIndex: 1,
    exitIndex: 2,
  });
  expect(b.phases.map((p) => p.frame)).toEqual([
    "f-0.png",
    "f-1.png",
    "f-2.png",
  ]);
  expect(b.restoration).toBe("restored");
  expect(b.participants.map((p) => p.role)).toEqual(["target", "nearby"]);
  expect(b.parameters.find((p) => p.name === "duration")).toMatchObject({
    status: "unknown",
    value: null,
  });
});
const framesFor = (states: VisualState[]) =>
  states.map((_, i) => ({ file: `f-${i}.png`, elapsedMs: i * 180 }));
it("selects a transient active change instead of a later baseline frame", () => {
  const states = ["none", "none", "none", "blur(2px)", "none", "none"].map(
    (filter) => snapshot(filter, "0"),
  );
  const b = buildBehavior(states, framesFor(states), {
    kind: "hover",
    selector: "#subject",
    beforeIndex: 1,
    activeIndex: 4,
    exitIndex: 5,
  });
  expect(b.phases.find((p) => p.name === "active")?.frame).toBe("f-3.png");
});
it("keeps exit-only changes out of the active description", () => {
  const states = ["none", "none", "none", "none", "none", "blur(2px)"].map(
    (filter) => snapshot(filter, "0"),
  );
  const b = buildBehavior(states, framesFor(states), {
    kind: "hover",
    selector: "#subject",
    beforeIndex: 1,
    activeIndex: 4,
    exitIndex: 5,
  });
  expect(b.phases.find((p) => p.name === "active")?.description).not.toContain(
    propertyLabels.filter,
  );
  expect(b.phases.find((p) => p.name === "after")?.description).toContain(
    propertyLabels.filter,
  );
});
it("does not describe changes from different frames as simultaneous", () => {
  const states: VisualState[] = [0, 1, 2, 3, 4, 5].map((i) => ({
    nodes: [
      node("#subject", i === 3 ? "blur(2px)" : "none"),
      node("#child", "none", i === 4 ? "Changed child" : "Child"),
    ],
    floating: [],
    animations: [],
  }));
  const b = buildBehavior(states, framesFor(states), {
    kind: "hover",
    selector: "#subject",
    beforeIndex: 1,
    activeIndex: 4,
    exitIndex: 5,
  });
  const phase = b.phases.find((p) => p.name === "active")!;
  expect(phase.frame).toBe("f-4.png");
  expect(phase.description).not.toContain(propertyLabels.filter);
  expect(phase.description).toContain(propertyLabels["文字变化"]);
});
it("leaves restoration unknown when a changed descendant cannot be compared", () => {
  const state = (active: boolean, child = true): VisualState => ({
    nodes: [
      node("#subject", active ? "blur(2px)" : "none"),
      ...(child ? [node("#child", active ? "blur(2px)" : "none")] : []),
    ],
    floating: [],
    animations: [],
  });
  const states = [state(false), state(true), state(false, false)];
  const b = buildBehavior(states, framesFor(states), {
    kind: "hover",
    selector: "#subject",
    activeIndex: 1,
    exitIndex: 2,
  });
  expect(b.restoration).toBe("unknown");
  expect(b.phases.find((p) => p.name === "after")?.description).not.toContain(
    "回到了默认",
  );
});
