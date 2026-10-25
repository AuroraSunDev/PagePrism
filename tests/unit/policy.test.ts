import { it, expect } from "vitest";
import {
  ObservationPolicy,
  declaredHoldMs,
} from "../../server/observation-policy";
const target = (id: string) => ({
  selector: "#" + id,
  group: id,
  label: id,
  tag: "div",
  styles: { filter: "none" },
});
it("serves unseen families before follow-ups and extends an unresolved observation", () => {
  const p = new ObservationPolicy(2, 1),
    a = target("a"),
    b = target("b");
  const first = p.next([a, b])!;
  expect(first.target.selector).toBe("#a");
  p.finish(first, {
    outcome: "no-change",
    states: ["before", "active", "after"],
    findings: [],
  });
  expect(p.next([a, b])!.target.selector).toBe("#b");
  const action = p.next([a])!;
  expect(action.followup).toBe(true);
  expect(action.holdMs).toBeGreaterThanOrEqual(1500);
  p.finish(action, {
    outcome: "change",
    states: ["before", "active", "after"],
    findings: ["finding-1"],
  });
  expect(p.next([a])).toBeUndefined();
  expect(p.checks[0]).toMatchObject({
    status: "checked",
    attempts: 2,
    findingIds: ["finding-1"],
  });
});
it("bounds follow-ups and labels remaining gaps instead of claiming no effects", () => {
  const p = new ObservationPolicy(1, 0),
    a = target("a"),
    b = target("b");
  const action = p.next([a, b])!;
  p.finish(action, {
    outcome: "no-change",
    states: ["before", "active", "after"],
    findings: [],
  });
  expect(p.next([b])).toBeUndefined();
  p.finalize("budget");
  expect(p.checks.find((x) => x.selector === "#b")).toMatchObject({
    status: "limited",
    attempts: 0,
  });
});
it("uses declared delay plus duration with a hard observation cap", () => {
  expect(
    declaredHoldMs({
      "transition-duration": ".15s",
      "transition-delay": "1.1s",
    }),
  ).toBeGreaterThanOrEqual(1250);
  expect(
    declaredHoldMs({ "transition-duration": "12s", "transition-delay": "5s" }),
  ).toBe(2000);
});
it("can inspect another representative after the first instance is blocked", () => {
  const p = new ObservationPolicy(2, 2),
    a = target("a"),
    b = { ...target("a"), selector: "#replacement" };
  const action = p.next([a])!;
  p.finish(action, {
    outcome: "uncertain",
    states: [],
    findings: [],
    blocked: true,
  });
  expect(p.next([b])?.target.selector).toBe("#replacement");
});
