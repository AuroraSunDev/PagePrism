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
}
export interface VisualState {
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
export function inferChanges(states: VisualState[]): {
  facts: Fact[];
  properties: string[];
  texts: string[];
  floatingTexts: string[];
} {
  const facts: Fact[] = [],
    properties = new Set<string>(),
    texts = new Set<string>(),
    floatingTexts = new Set<string>();
  const first = states[0];
  if (!first) return { facts, properties: [], texts: [], floatingTexts: [] };
  const baseline = new Map(first.nodes.map((n) => [n.selector, n]));
  for (const state of states.slice(1)) {
    for (const node of state.nodes) {
      const before = baseline.get(node.selector);
      if (!before) continue;
      for (const [prop, value] of Object.entries(node.styles)) {
        if (
          before.styles[prop] !== undefined &&
          value !== before.styles[prop] &&
          !facts.some((f) => f.label === prop)
        ) {
          properties.add(prop);
          facts.push({
            label: prop,
            value: before.styles[prop] + " → " + value,
            basis: "measured",
          });
        }
      }
      if (node.text !== before.text && node.text && node.text.length < 180) {
        texts.add(node.text);
        if (!facts.some((f) => f.label === "文字变化"))
          facts.push({
            label: "文字变化",
            value: before.text + " → " + node.text,
            basis: "observed",
          });
      }
    }
    for (const n of state.floating) {
      if (
        n.text &&
        !first.floating.some(
          (b) => b.selector === n.selector && b.text === n.text,
        )
      ) {
        floatingTexts.add(n.text);
        if (!facts.some((f) => f.label === "出现的文字"))
          facts.push({ label: "出现的文字", value: n.text, basis: "observed" });
      }
    }
  }
  return {
    facts: facts.slice(0, 12),
    properties: [...properties],
    texts: [...texts],
    floatingTexts: [...floatingTexts],
  };
}
