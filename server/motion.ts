import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Fact } from "../shared/types";
import type { Region } from "./pixels";
const script = readFile(new URL("./visual-state.js", import.meta.url), "utf8");
export interface VisualNode {
  selector: string;
  tag: string;
  children?: number;
  group?: string;
  text: string;
  styles: Record<string, string>;
  rect: Region;
  timing?: Record<string, string>;
}
export interface VisualState {
  missingTarget?: boolean;
  nodes: VisualNode[];
  floating: VisualNode[];
  animations: {
    selector: string;
    properties: string[];
    duration: number;
    iterations: number | string;
    name: string;
    transformFrames?: string[];
  }[];
}
export async function readVisualState(
  page: Page,
  selector?: string,
): Promise<VisualState> {
  return page.evaluate(
    (await script).replace(
      "__TARGET_SELECTOR__",
      JSON.stringify(selector || null),
    ),
  );
}
export interface ChangeEvent {
  selector: string;
  property: string;
  kind: "style" | "text" | "floating" | "appearance";
  before: string;
  after: string;
  sampleIndex: number;
}
export interface VisualChange {
  facts: Fact[];
  properties: string[];
  texts: string[];
  floatingTexts: string[];
  events: ChangeEvent[];
}
export const changeIdentity = (e: ChangeEvent) =>
  e.selector + "|" + e.kind + "|" + e.property;
export function sameVisualValue(property: string, a: string, b: string) {
  if (a === b) return true;
  if (property !== "transform") return false;
  const identity = (v: string) =>
    v === "none" || /^matrix\(1,\s*0,\s*0,\s*1,\s*0,\s*0\)$/.test(v);
  return identity(a) && identity(b);
}
export function summarizeChanges(events: ChangeEvent[]): VisualChange {
  const groups = new Map<string, ChangeEvent[]>();
  for (const event of events) {
    const list = groups.get(event.property) || [];
    list.push(event);
    groups.set(event.property, list);
  }
  const facts = [...groups].map(([label, list]) => {
    const values = [
      ...new Set([list[0].before, ...list.map((e) => e.after)]),
    ].filter(Boolean);
    const shown =
      values.length > 4 ? [...values.slice(0, 2), ...values.slice(-2)] : values;
    return {
      label,
      value: shown.join(" → "),
      basis:
        list[0].kind === "style"
          ? ("measured" as const)
          : ("observed" as const),
    };
  });
  return {
    facts: facts.slice(0, 12),
    properties: [
      ...new Set(
        events.filter((e) => e.kind === "style").map((e) => e.property),
      ),
    ],
    texts: [
      ...new Set(events.filter((e) => e.kind === "text").map((e) => e.after)),
    ],
    floatingTexts: [
      ...new Set(
        events.filter((e) => e.kind === "floating").map((e) => e.after),
      ),
    ],
    events,
  };
}
export function removeAutonomousChanges(
  change: VisualChange,
  idle: VisualChange,
): VisualChange {
  const autonomous = new Set(idle.events.map(changeIdentity));
  return summarizeChanges(
    change.events.filter((e) => !autonomous.has(changeIdentity(e))),
  );
}
export function inferChanges(states: VisualState[]): VisualChange {
  const first = states[0],
    events: ChangeEvent[] = [];
  if (!first) return summarizeChanges(events);
  const baseline = new Map(first.nodes.map((n) => [n.selector, n]));
  const add = (event: ChangeEvent) => {
    if (
      events.length < 400 &&
      !events.some(
        (e) =>
          changeIdentity(e) === changeIdentity(event) &&
          e.after === event.after,
      )
    )
      events.push(event);
  };
  for (const [offset, state] of states.slice(1).entries()) {
    for (const node of state.nodes) {
      const before = baseline.get(node.selector);
      if (!before) continue;
      for (const [property, after] of Object.entries(node.styles))
        if (
          before.styles[property] !== undefined &&
          !sameVisualValue(property, before.styles[property], after)
        )
          add({
            selector: node.selector,
            kind: "style",
            property,
            before: before.styles[property],
            after,
            sampleIndex: offset + 1,
          });
      if (node.text && node.text !== before.text && node.text.length < 180)
        add({
          selector: node.selector,
          kind: "text",
          property: "文字变化",
          before: before.text,
          after: node.text,
          sampleIndex: offset + 1,
        });
    }
    for (const node of state.floating)
      if (
        node.text &&
        !first.floating.some(
          (n) => n.selector === node.selector && n.text === node.text,
        )
      )
        add({
          selector: node.selector,
          kind: "floating",
          property: "出现的文字",
          before:
            first.floating.find((n) => n.selector === node.selector)?.text ||
            "",
          after: node.text,
          sampleIndex: offset + 1,
        });
  }
  return summarizeChanges(events);
}
