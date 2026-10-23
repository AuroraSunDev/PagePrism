import { it, expect } from "vitest";
import { selectFrames } from "../../src/media-grid";
const frames = Array.from({ length: 9 }, (_, i) => ({
  file: `frame-${i}.png`,
  elapsedMs: [37, 142, 291, 440, 611, 809, 1011, 1250, 1573][i],
}));
it("selects 4 real frames spanning the available action and preserves measured times", () => {
  const result = selectFrames(frames, 4);
  expect(result).toHaveLength(4);
  expect(result[0]).toEqual(frames[0]);
  expect(result[3]).toEqual(frames[8]);
  expect(result.every((f) => frames.includes(f))).toBe(true);
  expect(new Set(result.map((f) => f.file)).size).toBe(4);
});
it("does not invent or duplicate frames when fewer than requested exist", () => {
  expect(selectFrames(frames.slice(0, 3), 9)).toEqual(frames.slice(0, 3));
  expect(selectFrames([], 4)).toEqual([]);
});
