import { PNG } from "pngjs";
export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}
export function pixelDifference(before: Buffer, after: Buffer) {
  const a = PNG.sync.read(before),
    b = PNG.sync.read(after);
  if (a.width !== b.width || a.height !== b.height) return 1;
  let changed = 0,
    total = 0;
  for (let i = 0; i < a.data.length; i += 16) {
    total++;
    if (
      Math.max(
        Math.abs(a.data[i] - b.data[i]),
        Math.abs(a.data[i + 1] - b.data[i + 1]),
        Math.abs(a.data[i + 2] - b.data[i + 2]),
      ) > 24
    )
      changed++;
  }
  return changed / total;
}
export function cropPng(image: Buffer, region: Region) {
  const src = PNG.sync.read(image);
  const x = Math.max(0, Math.min(src.width - 1, Math.floor(region.x))),
    y = Math.max(0, Math.min(src.height - 1, Math.floor(region.y)));
  const width = Math.max(1, Math.min(src.width - x, Math.ceil(region.width))),
    height = Math.max(1, Math.min(src.height - y, Math.ceil(region.height)));
  const out = new PNG({ width, height });
  PNG.bitblt(src, out, x, y, width, height, 0, 0);
  return PNG.sync.write(out);
}
