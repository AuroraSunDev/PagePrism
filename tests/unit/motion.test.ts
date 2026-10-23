import { expect, it } from "vitest";
import { PNG } from "pngjs";
import { pixelDifference, cropPng } from "../../server/pixels";
import { inferChanges, type VisualState } from "../../server/motion";
const image = (color: number) => {
  const p = new PNG({ width: 10, height: 10 });
  for (let i = 0; i < p.data.length; i += 4) {
    p.data[i] = color;
    p.data[i + 3] = 255;
  }
  return PNG.sync.write(p);
};
it("compares actual pixels and ignores identical captures", () => {
  expect(pixelDifference(image(0), image(0))).toBe(0);
  expect(pixelDifference(image(0), image(255))).toBeGreaterThan(0.9);
});
it("keeps real pixels when cropping a focus region", () => {
  const p = PNG.sync.read(
    cropPng(image(255), { x: 2, y: 3, width: 4, height: 5 }),
  );
  expect([p.width, p.height]).toEqual([4, 5]);
  expect(p.data[0]).toBe(255);
});
const state = (
  text = "Go",
  filter = "grayscale(1)",
  floating: string[] = [],
): VisualState => ({
  nodes: [
    {
      selector: "#person",
      tag: "div",
      text,
      styles: { filter, transform: "none" },
      rect: { x: 10, y: 20, width: 24, height: 115 },
    },
  ],
  floating: floating.map((text) => ({
    selector: "#tip",
    tag: "div",
    text,
    styles: {},
    rect: { x: 10, y: 0, width: 100, height: 30 },
  })),
  animations: [],
});
it("finds narrow-image filter changes and nearby tooltip text", () => {
  const change = inferChanges([
    state(),
    state("Go", "none", ["waiting for a table"]),
  ]);
  expect(change.properties).toContain("filter");
  expect(change.floatingTexts).toContain("waiting for a table");
});
it("preserves a transient middle state even when start and end match", () => {
  expect(
    inferChanges([state("Go"), state("Growth"), state("Go")]).texts,
  ).toContain("Growth");
});
it("does not invent motion for a static sample sequence", () => {
  expect(inferChanges([state(), state()]).facts).toEqual([]);
});
