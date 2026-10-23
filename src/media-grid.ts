import type { Frame } from "../shared/types";
export function selectFrames(frames: Frame[], count: number) {
  const take = Math.min(Math.max(0, Math.floor(count)), frames.length);
  if (take < 2) return frames.slice(0, take);
  return Array.from(
    { length: take },
    (_, i) => frames[Math.round((i * (frames.length - 1)) / (take - 1))],
  );
}
export async function composeFrameGrid(
  frames: Frame[],
  count: number,
  url: (file: string) => string,
): Promise<Blob> {
  const selected = selectFrames(frames, count);
  if (!selected.length) throw new Error("没有可导出的关键帧。");
  const images = await Promise.all(
    selected.map(
      (frame) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () =>
            reject(new Error("关键帧加载失败，请重新打开结果。"));
          image.src = url(frame.file);
        }),
    ),
  );
  const columns = count === 4 ? 2 : 3;
  const rows = Math.ceil(selected.length / columns);
  const cellWidth = 600,
    cellHeight = 410,
    gap = 16;
  const canvas = document.createElement("canvas");
  canvas.width = columns * cellWidth + (columns + 1) * gap;
  canvas.height = rows * cellHeight + (rows + 1) * gap;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("当前浏览器无法生成图片。");
  ctx.fillStyle = "#f5f7fa";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const [i, image] of images.entries()) {
    const x = gap + (i % columns) * (cellWidth + gap),
      y = gap + Math.floor(i / columns) * (cellHeight + gap);
    ctx.fillStyle = "#fff";
    ctx.fillRect(x, y, cellWidth, cellHeight);
    ctx.fillStyle = "#46546a";
    ctx.font = "18px sans-serif";
    ctx.fillText(
      `+${(selected[i].elapsedMs / 1000).toFixed(2)}s · action sample`,
      x + 12,
      y + 27,
    );
    const scale = Math.min(
      cellWidth / image.width,
      (cellHeight - 44) / image.height,
    );
    const width = image.width * scale,
      height = image.height * scale;
    ctx.drawImage(
      image,
      x + (cellWidth - width) / 2,
      y + 44 + (cellHeight - 44 - height) / 2,
      width,
      height,
    );
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("图片生成失败。"))),
      "image/png",
    ),
  );
}
