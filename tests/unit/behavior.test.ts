import { it, expect } from "vitest";
import { buildBehavior } from "../../server/behavior";
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
